import { z } from 'zod';
import { identifier, revision, scope } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { parseContract } from '../domain/validate.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import type {
  CollectionEvidenceSnapshot,
  CollectionProgress,
  Scope,
} from '../persistence/repository.js';
import { requireTenantContext, type TenantContext } from '../persistence/tenant-context.js';
import type {
  MeasurementFilter,
  OutcomeFilter,
  RecommendationFilter,
  StoredMeasurement,
} from '../review/repository.js';
import type {
  OperatorEvidenceReadRepository,
  OperatorReviewReadRepository,
} from '../operator/read-repositories.js';

export type GateD1Value = null | number | string | ArrayBuffer | ArrayBufferView;

export interface GateD1Meta {
  readonly duration?: number;
  readonly rows_read?: number;
  readonly rows_written?: number;
  readonly size_after?: number;
  readonly changed_db?: boolean;
}

export interface GateD1Result<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly success?: boolean;
  readonly results?: readonly Row[];
  readonly meta?: GateD1Meta;
  readonly error?: string;
}

export interface GateD1PreparedStatement {
  bind(...values: GateD1Value[]): GateD1PreparedStatement;
  all<Row extends Record<string, unknown> = Record<string, unknown>>(): Promise<GateD1Result<Row>>;
}

export interface GateD1Database {
  prepare(sql: string): GateD1PreparedStatement;
}

export interface D1GateMetricsSnapshot {
  readonly queryCount: number;
  readonly rowsRead: number;
  readonly rowsWritten: number;
  readonly sizeAfterBytes: number;
  readonly databaseDurationMs: number;
}

class D1GateMetrics {
  #queryCount = 0;
  #rowsRead = 0;
  #rowsWritten = 0;
  #sizeAfterBytes = 0;
  #databaseDurationMs = 0;

  record(meta: GateD1Meta | undefined): void {
    this.#queryCount += 1;
    this.#rowsRead += finiteCount(meta?.rows_read);
    this.#rowsWritten += finiteCount(meta?.rows_written);
    this.#sizeAfterBytes = Math.max(this.#sizeAfterBytes, finiteCount(meta?.size_after));
    const duration = meta?.duration;
    if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) {
      this.#databaseDurationMs += duration;
    }
  }

  snapshot(): D1GateMetricsSnapshot {
    return Object.freeze({
      queryCount: this.#queryCount,
      rowsRead: this.#rowsRead,
      rowsWritten: this.#rowsWritten,
      sizeAfterBytes: this.#sizeAfterBytes,
      databaseDurationMs: this.#databaseDurationMs,
    });
  }
}

const LIST_LIMIT = 100;
const SNAPSHOT_OBSERVATION_LIMIT = 2_048;
const lifecycle = z.enum(['proposed', 'in_review', 'accepted', 'rejected', 'superseded']);
const recommendationFilterSchema = z.strictObject({ scope, lifecycle: lifecycle.optional() });
const measurementFilterSchema = z.strictObject({ scope, recommendationId: identifier.optional() });
const outcomeFilterSchema = z.strictObject({ scope, recommendationId: identifier.optional() });

type Row = Record<string, unknown>;
type ReviewKind = 'recommendation' | 'measurement' | 'outcome';

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function finiteCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function owned(tenant: string, owner: Scope): void {
  invariant(owner.tenantId === tenant, 'Record scope does not match trusted tenant context');
}

function text(row: Row, key: string): string {
  const value = row[key];
  invariant(typeof value === 'string', `Invalid persisted D1 field: ${key}`);
  return value;
}

function integer(row: Row, key: string): number {
  const value = row[key];
  invariant(typeof value === 'number' && Number.isInteger(value), `Invalid persisted D1 integer: ${key}`);
  return value;
}

function optionalText(row: Row, key: string): string | null {
  const value = row[key];
  invariant(value === null || typeof value === 'string', `Invalid persisted D1 optional field: ${key}`);
  return value;
}

function payload(row: Row, key = 'payload'): string {
  const value = text(row, key);
  invariant(new TextEncoder().encode(value).byteLength <= 65_536, 'Invalid persisted D1 payload size');
  return value;
}

function decodeCollection(row: Row): Contract<'collection'> {
  const raw = payload(row);
  const record = parseContract('collection', JSON.parse(raw));
  invariant(text(row, 'contract_version') === record.schemaVersion
    && raw === canonicalJson(record)
    && text(row, 'payload_hash') === hashCanonicalJson(record),
  'Persisted D1 collection integrity mismatch');
  invariant(text(row, 'tenant_id') === record.scope.tenantId
    && text(row, 'site_id') === record.scope.siteId
    && text(row, 'scope_revision_id') === record.scope.siteScopeRevisionId
    && text(row, 'id') === record.id
    && text(row, 'provider_id') === record.providerId
    && text(row, 'connection_id') === record.providerConnectionId,
  'Persisted D1 collection ownership index mismatch');
  return record;
}

function decodeObservation(row: Row, prefix = ''): Contract<'observation'> {
  const raw = payload(row, `${prefix}payload`);
  const record = parseContract('observation', JSON.parse(raw));
  invariant(text(row, `${prefix}contract_version`) === record.schemaVersion
    && raw === canonicalJson(record)
    && text(row, `${prefix}payload_hash`) === hashCanonicalJson(record),
  'Persisted D1 observation integrity mismatch');
  const owner = record.cohort.context.scope;
  invariant(text(row, `${prefix}tenant_id`) === owner.tenantId
    && text(row, `${prefix}site_id`) === owner.siteId
    && text(row, `${prefix}scope_revision_id`) === owner.siteScopeRevisionId
    && text(row, `${prefix}id`) === record.id,
  'Persisted D1 observation ownership index mismatch');
  if (prefix) {
    invariant(text(row, `${prefix}collection_id`) === record.provenance.runId
      && text(row, `${prefix}provider_id`) === record.provenance.source.providerId
      && text(row, `${prefix}connection_id`) === record.provenance.source.providerConnectionId,
    'Persisted D1 observation provenance index mismatch');
  }
  return record;
}

function decodeReview<N extends ReviewKind>(kind: N, row: Row): Contract<N> {
  const raw = payload(row);
  const record = parseContract(kind, JSON.parse(raw));
  invariant(text(row, 'contract_version') === record.schemaVersion
    && raw === canonicalJson(record)
    && text(row, 'payload_hash') === hashCanonicalJson(record),
  'Persisted D1 review contract integrity mismatch');
  const owner = kind === 'measurement'
    ? (record as Contract<'measurement'>).cohort.context.scope
    : (record as Contract<'recommendation'> | Contract<'outcome'>).scope;
  invariant(text(row, 'tenant_id') === owner.tenantId
    && text(row, 'site_id') === owner.siteId
    && text(row, 'scope_revision_id') === owner.siteScopeRevisionId
    && text(row, 'id') === record.id,
  'Persisted D1 review ownership index mismatch');
  if (kind === 'recommendation') {
    const recommendation = record as Contract<'recommendation'>;
    invariant(integer(row, 'revision') === recommendation.revision
      && text(row, 'lifecycle') === recommendation.lifecycle,
    'Persisted D1 recommendation revision index mismatch');
  }
  return record;
}

async function query<RowType extends Row>(
  db: GateD1Database,
  metrics: D1GateMetrics,
  sql: string,
  values: readonly GateD1Value[] = [],
): Promise<readonly RowType[]> {
  const statement = values.length === 0 ? db.prepare(sql) : db.prepare(sql).bind(...values);
  const result = await statement.all<RowType>();
  metrics.record(result.meta);
  invariant(result.success !== false, 'D1 read failed');
  invariant(Array.isArray(result.results), 'D1 read returned no result set');
  return result.results;
}

function parseOwner(input: Scope, tenant: string): Scope {
  canonicalJson(input);
  const owner = scope.parse(input);
  owned(tenant, owner);
  return owner;
}

export class D1OperatorEvidenceReadRepository implements OperatorEvidenceReadRepository {
  constructor(
    private readonly db: GateD1Database,
    private readonly metrics: D1GateMetrics,
  ) {}

  async getCollection(context: TenantContext, input: string): Promise<Contract<'collection'> | null> {
    const tenant = requireTenantContext(context);
    const rows = await query<Row>(this.db, this.metrics,
      'SELECT * FROM collections WHERE tenant_id = ? AND id = ? LIMIT 1',
      [tenant, identifier.parse(input)]);
    return rows[0] ? decodeCollection(rows[0]) : null;
  }

  async getCollectionSnapshot(context: TenantContext, input: string): Promise<CollectionEvidenceSnapshot | null> {
    const tenant = requireTenantContext(context);
    const id = identifier.parse(input);
    const rows = await query<Row>(this.db, this.metrics, `
      SELECT c.*,
        (SELECT COUNT(*) FROM collection_parts cp
          WHERE cp.tenant_id = c.tenant_id AND cp.collection_id = c.id) AS gate_parts_persisted,
        (SELECT COUNT(*) FROM source_records sr
          WHERE sr.tenant_id = c.tenant_id AND sr.collection_id = c.id) AS gate_persisted_sources,
        o.tenant_id AS gate_observation_tenant_id,
        o.id AS gate_observation_id,
        o.collection_id AS gate_observation_collection_id,
        o.site_id AS gate_observation_site_id,
        o.scope_revision_id AS gate_observation_scope_revision_id,
        o.connection_id AS gate_observation_connection_id,
        o.provider_id AS gate_observation_provider_id,
        o.contract_version AS gate_observation_contract_version,
        o.payload AS gate_observation_payload,
        o.payload_hash AS gate_observation_payload_hash
      FROM collections c
      LEFT JOIN observations o
        ON o.tenant_id = c.tenant_id AND o.collection_id = c.id
      WHERE c.tenant_id = ? AND c.id = ?
      ORDER BY o.id
      LIMIT ?`,
    [tenant, id, SNAPSHOT_OBSERVATION_LIMIT + 1]);

    if (rows.length === 0) return null;
    const first = rows[0]!;
    const collection = decodeCollection(first);
    const observationRows = rows.filter((row) => row['gate_observation_id'] !== null);
    invariant(observationRows.length <= SNAPSHOT_OBSERVATION_LIMIT,
      'Collection snapshot exceeds the accepted 2,048-observation bound');
    const observations = observationRows.map((row) => decodeObservation(row, 'gate_observation_'));
    const partsPersisted = integer(first, 'gate_parts_persisted');
    const persistedSources = integer(first, 'gate_persisted_sources');
    const parts = integer(first, 'part_count');
    const receivedCount = integer(first, 'received_count');
    const progress: CollectionProgress = {
      receivedCount,
      persistedSources,
      parts,
      partsPersisted,
      complete: partsPersisted === parts && persistedSources === receivedCount,
    };
    return { collection, progress, observations };
  }

  async getObservation(context: TenantContext, input: string): Promise<Contract<'observation'> | null> {
    const tenant = requireTenantContext(context);
    const rows = await query<Row>(this.db, this.metrics,
      'SELECT * FROM observations WHERE tenant_id = ? AND id = ? LIMIT 1',
      [tenant, identifier.parse(input)]);
    return rows[0] ? decodeObservation(rows[0]) : null;
  }
}

export class D1OperatorReviewReadRepository implements OperatorReviewReadRepository {
  constructor(
    private readonly db: GateD1Database,
    private readonly metrics: D1GateMetrics,
  ) {}

  async getCurrentRecommendation(
    context: TenantContext,
    ownerInput: Scope,
    input: string,
  ): Promise<Contract<'recommendation'> | null> {
    const tenant = requireTenantContext(context);
    const owner = parseOwner(ownerInput, tenant);
    const rows = await query<Row>(this.db, this.metrics, `
      SELECT * FROM recommendation_revisions
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ?
      ORDER BY revision DESC LIMIT 1`,
    [tenant, owner.siteId, owner.siteScopeRevisionId, identifier.parse(input)]);
    return rows[0] ? decodeReview('recommendation', rows[0]) : null;
  }

  async getRecommendationRevision(
    context: TenantContext,
    ownerInput: Scope,
    input: string,
    inputRevision: number,
  ): Promise<Contract<'recommendation'> | null> {
    const tenant = requireTenantContext(context);
    const owner = parseOwner(ownerInput, tenant);
    const rows = await query<Row>(this.db, this.metrics, `
      SELECT * FROM recommendation_revisions
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ? AND revision = ?
      LIMIT 1`,
    [tenant, owner.siteId, owner.siteScopeRevisionId, identifier.parse(input), revision.parse(inputRevision)]);
    return rows[0] ? decodeReview('recommendation', rows[0]) : null;
  }

  async listRecommendationHistory(
    context: TenantContext,
    ownerInput: Scope,
    input: string,
  ): Promise<Contract<'recommendation'>[]> {
    const tenant = requireTenantContext(context);
    const owner = parseOwner(ownerInput, tenant);
    const rows = await query<Row>(this.db, this.metrics, `
      SELECT * FROM recommendation_revisions
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ?
      ORDER BY revision LIMIT ?`,
    [tenant, owner.siteId, owner.siteScopeRevisionId, identifier.parse(input), LIST_LIMIT + 1]);
    invariant(rows.length <= LIST_LIMIT, 'Recommendation history exceeds the Release 0.8 100-revision bound');
    return rows.map((row) => decodeReview('recommendation', row));
  }

  async listCurrentRecommendations(
    context: TenantContext,
    input: RecommendationFilter,
  ): Promise<Contract<'recommendation'>[]> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const filter = recommendationFilterSchema.parse(input);
    owned(tenant, filter.scope);
    const rows = await query<Row>(this.db, this.metrics, `
      WITH latest AS (
        SELECT id, MAX(revision) AS revision FROM recommendation_revisions
        WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? GROUP BY id
      )
      SELECT r.* FROM recommendation_revisions r
      JOIN latest l ON l.id = r.id AND l.revision = r.revision
      WHERE r.tenant_id = ? AND r.site_id = ? AND r.scope_revision_id = ?
        AND (? IS NULL OR r.lifecycle = ?)
      ORDER BY r.id LIMIT ?`,
    [
      tenant, filter.scope.siteId, filter.scope.siteScopeRevisionId,
      tenant, filter.scope.siteId, filter.scope.siteScopeRevisionId,
      filter.lifecycle ?? null, filter.lifecycle ?? null, LIST_LIMIT + 1,
    ]);
    invariant(rows.length <= LIST_LIMIT, 'Recommendation list exceeds 100 records; narrow the scope/lifecycle');
    return rows.map((row) => decodeReview('recommendation', row));
  }

  async listMeasurements(
    context: TenantContext,
    input: MeasurementFilter,
  ): Promise<StoredMeasurement[]> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const filter = measurementFilterSchema.parse(input);
    owned(tenant, filter.scope);
    const rows = await query<Row>(this.db, this.metrics, `
      SELECT * FROM measurements
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ?
        AND (? IS NULL OR recommendation_id = ?)
      ORDER BY created_at, id LIMIT ?`,
    [
      tenant, filter.scope.siteId, filter.scope.siteScopeRevisionId,
      filter.recommendationId ?? null, filter.recommendationId ?? null, LIST_LIMIT + 1,
    ]);
    invariant(rows.length <= LIST_LIMIT, 'Measurement list exceeds 100 records; narrow the filters');
    return rows.map((row) => ({
      record: decodeReview('measurement', row),
      recommendationId: optionalText(row, 'recommendation_id') ?? undefined,
    }));
  }

  async listOutcomes(
    context: TenantContext,
    input: OutcomeFilter,
  ): Promise<Contract<'outcome'>[]> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const filter = outcomeFilterSchema.parse(input);
    owned(tenant, filter.scope);
    const rows = await query<Row>(this.db, this.metrics, `
      SELECT * FROM outcomes
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ?
        AND (? IS NULL OR recommendation_id = ?)
      ORDER BY created_at, id LIMIT ?`,
    [
      tenant, filter.scope.siteId, filter.scope.siteScopeRevisionId,
      filter.recommendationId ?? null, filter.recommendationId ?? null, LIST_LIMIT + 1,
    ]);
    invariant(rows.length <= LIST_LIMIT, 'Outcome list exceeds 100 records; narrow the filters');
    return rows.map((row) => decodeReview('outcome', row));
  }
}

export function createD1OperatorReadRepositories(db: GateD1Database): {
  readonly evidence: OperatorEvidenceReadRepository;
  readonly review: OperatorReviewReadRepository;
  readonly metrics: { snapshot(): D1GateMetricsSnapshot };
} {
  const metrics = new D1GateMetrics();
  return Object.freeze({
    evidence: new D1OperatorEvidenceReadRepository(db, metrics),
    review: new D1OperatorReviewReadRepository(db, metrics),
    metrics,
  });
}
