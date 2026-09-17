import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { z } from 'zod';
import { identifier, revision, scope } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { parseContract } from '../domain/validate.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import { migrateLocalDatabase } from '../persistence/migrations.js';
import type { Scope } from '../persistence/repository.js';
import { requireTenantContext, type TenantContext } from '../persistence/tenant-context.js';
import { ReviewRevisionConflictError } from './errors.js';
import { RELEASE08_RECOMMENDATION_REVISION_LIMIT } from './lifecycle.js';
import type {
  MeasurementFilter, OutcomeFilter, RecommendationFilter, ReviewLedgerRepository, StoredMeasurement,
} from './repository.js';

type Row = Record<string, SQLOutputValue>;
type ReviewKind = 'recommendation' | 'measurement' | 'outcome';
const LIST_LIMIT = 100;
const lifecycle = z.enum(['proposed', 'in_review', 'accepted', 'rejected', 'superseded']);
const recommendationFilterSchema = z.strictObject({ scope, lifecycle: lifecycle.optional() });
const measurementFilterSchema = z.strictObject({ scope, recommendationId: identifier.optional() });
const outcomeFilterSchema = z.strictObject({ scope, recommendationId: identifier.optional() });

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }
function owned(tenant: string, owner: Scope): void {
  invariant(owner.tenantId === tenant, 'Record scope does not match trusted tenant context');
}
function encode(record: Contract<ReviewKind>): [string, string, string] {
  return [record.schemaVersion, canonicalJson(record), hashCanonicalJson(record)];
}
function decode<N extends ReviewKind>(kind: N, row: Row): Contract<N> {
  invariant(typeof row['payload'] === 'string' && row['payload'].length <= 65536, 'Invalid persisted review payload');
  const record = parseContract(kind, JSON.parse(row['payload']));
  invariant(row['contract_version'] === record.schemaVersion
    && row['payload'] === canonicalJson(record)
    && row['payload_hash'] === hashCanonicalJson(record), 'Persisted review contract integrity mismatch');
  const owner = kind === 'measurement'
    ? (record as Contract<'measurement'>).cohort.context.scope
    : (record as Contract<'recommendation'> | Contract<'outcome'>).scope;
  invariant(same([row['tenant_id'], row['site_id'], row['scope_revision_id']],
    [owner.tenantId, owner.siteId, owner.siteScopeRevisionId]), 'Persisted review ownership index mismatch');
  invariant(row['id'] === record.id, 'Persisted review record ID mismatch');
  if (kind === 'recommendation') {
    const recommendation = record as Contract<'recommendation'>;
    invariant(row['revision'] === recommendation.revision && row['lifecycle'] === recommendation.lifecycle,
      'Persisted recommendation revision index mismatch');
  }
  return record;
}

/** Local Release 0.8 ledger adapter. The database path is trusted administration. */
export class LocalReviewLedgerRepository implements ReviewLedgerRepository {
  readonly #db: DatabaseSync;

  constructor(path: string = ':memory:') {
    this.#db = new DatabaseSync(path, {
      enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false,
      allowExtension: false, defensive: true, timeout: 1000,
    });
    try { migrateLocalDatabase(this.#db); }
    catch (error) { this.#db.close(); throw error; }
  }

  #write<T>(work: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }

  #scope(ownerInput: Scope, tenant: string): Scope {
    canonicalJson(ownerInput);
    const owner = scope.parse(ownerInput);
    owned(tenant, owner);
    return owner;
  }

  #insertRecommendation(tenant: string, record: Contract<'recommendation'>): void {
    this.#db.prepare(`INSERT INTO recommendation_revisions
      (tenant_id, id, revision, site_id, scope_revision_id, lifecycle, created_at, updated_at,
       contract_version, payload, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(tenant, record.id, record.revision, record.scope.siteId, record.scope.siteScopeRevisionId,
        record.lifecycle, record.createdAt, record.updatedAt, ...encode(record));
  }

  async createRecommendation(context: TenantContext, input: Contract<'recommendation'>): Promise<void> {
    const tenant = requireTenantContext(context);
    const record = parseContract('recommendation', input);
    owned(tenant, record.scope);
    this.#write(() => {
      invariant(this.#db.prepare('SELECT 1 AS present FROM recommendation_revisions WHERE tenant_id = ? AND id = ? LIMIT 1')
        .get(tenant, record.id) === undefined, 'Recommendation already exists');
      invariant(record.revision === 1, 'Persisted recommendation history must begin at revision 1');
      this.#insertRecommendation(tenant, record);
    });
  }

  async appendRecommendationRevision(
    context: TenantContext,
    input: Contract<'recommendation'>,
    expectedCurrentRevision: number,
  ): Promise<void> {
    const tenant = requireTenantContext(context);
    const record = parseContract('recommendation', input);
    owned(tenant, record.scope);
    const expected = revision.parse(expectedCurrentRevision);
    this.#write(() => {
      const row = this.#db.prepare('SELECT * FROM recommendation_revisions WHERE tenant_id = ? AND id = ? ORDER BY revision DESC LIMIT 1')
        .get(tenant, record.id);
      invariant(row !== undefined, 'Recommendation not found');
      const current = decode('recommendation', row);
      if (current.revision !== expected) throw new ReviewRevisionConflictError();
      invariant(current.revision < RELEASE08_RECOMMENDATION_REVISION_LIMIT, 'Recommendation revision limit reached');
      invariant(record.revision === current.revision + 1, 'Recommendation revision must append exactly one revision');
      invariant(same(record.scope, current.scope), 'Recommendation revision cannot change scope');
      invariant(record.createdAt === current.createdAt, 'Recommendation revision cannot change createdAt');
      invariant(record.updatedAt >= current.updatedAt, 'Recommendation updatedAt cannot move backwards');
      this.#insertRecommendation(tenant, record);
    });
  }

  async getCurrentRecommendation(context: TenantContext, ownerInput: Scope, input: string): Promise<Contract<'recommendation'> | null> {
    const tenant = requireTenantContext(context);
    const owner = this.#scope(ownerInput, tenant);
    const row = this.#db.prepare(`SELECT * FROM recommendation_revisions
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ? ORDER BY revision DESC LIMIT 1`)
      .get(tenant, owner.siteId, owner.siteScopeRevisionId, identifier.parse(input));
    return row ? decode('recommendation', row) : null;
  }

  async getRecommendationRevision(
    context: TenantContext,
    ownerInput: Scope,
    input: string,
    inputRevision: number,
  ): Promise<Contract<'recommendation'> | null> {
    const tenant = requireTenantContext(context);
    const owner = this.#scope(ownerInput, tenant);
    const row = this.#db.prepare(`SELECT * FROM recommendation_revisions
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ? AND revision = ?`)
      .get(tenant, owner.siteId, owner.siteScopeRevisionId, identifier.parse(input), revision.parse(inputRevision));
    return row ? decode('recommendation', row) : null;
  }

  async listRecommendationHistory(context: TenantContext, ownerInput: Scope, input: string): Promise<Contract<'recommendation'>[]> {
    const tenant = requireTenantContext(context);
    const owner = this.#scope(ownerInput, tenant);
    const rows = this.#db.prepare(`SELECT * FROM recommendation_revisions
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ? ORDER BY revision LIMIT ?`)
      .all(tenant, owner.siteId, owner.siteScopeRevisionId, identifier.parse(input), LIST_LIMIT + 1);
    invariant(rows.length <= LIST_LIMIT, 'Recommendation history exceeds the Release 0.8 100-revision bound');
    return rows.map((row) => decode('recommendation', row));
  }

  async listCurrentRecommendations(context: TenantContext, input: RecommendationFilter): Promise<Contract<'recommendation'>[]> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const filter = recommendationFilterSchema.parse(input);
    owned(tenant, filter.scope);
    const rows = this.#db.prepare(`WITH latest AS (
        SELECT id, MAX(revision) AS revision FROM recommendation_revisions
        WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? GROUP BY id
      )
      SELECT r.* FROM recommendation_revisions r JOIN latest l ON l.id = r.id AND l.revision = r.revision
      WHERE r.tenant_id = ? AND r.site_id = ? AND r.scope_revision_id = ?
        AND (? IS NULL OR r.lifecycle = ?) ORDER BY r.id LIMIT ?`)
      .all(tenant, filter.scope.siteId, filter.scope.siteScopeRevisionId,
        tenant, filter.scope.siteId, filter.scope.siteScopeRevisionId,
        filter.lifecycle ?? null, filter.lifecycle ?? null, LIST_LIMIT + 1);
    invariant(rows.length <= LIST_LIMIT, 'Recommendation list exceeds 100 records; narrow the scope/lifecycle');
    return rows.map((row) => decode('recommendation', row));
  }

  async persistMeasurement(
    context: TenantContext,
    input: Contract<'measurement'>,
    recommendationId: string | undefined,
  ): Promise<void> {
    const tenant = requireTenantContext(context);
    const record = parseContract('measurement', input);
    const owner = record.cohort.context.scope;
    owned(tenant, owner);
    const recommendation = recommendationId === undefined ? null : identifier.parse(recommendationId);
    this.#write(() => {
      if (recommendation !== null) {
        invariant(this.#db.prepare(`SELECT 1 AS present FROM recommendation_revisions
          WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ? LIMIT 1`)
          .get(tenant, owner.siteId, owner.siteScopeRevisionId, recommendation) !== undefined,
        'Measurement recommendation is not present in the owning scope');
      }
      const baseline = record.relationship.role === 'follow_up' ? record.relationship.baselineMeasurementId : null;
      if (baseline !== null) {
        invariant(this.#db.prepare(`SELECT 1 AS present FROM measurements
          WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ? LIMIT 1`)
          .get(tenant, owner.siteId, owner.siteScopeRevisionId, baseline) !== undefined,
        'Follow-up baseline measurement is not present in the owning scope');
      }
      this.#db.prepare(`INSERT INTO measurements
        (tenant_id, id, site_id, scope_revision_id, recommendation_id, relationship_role, baseline_measurement_id,
         created_at, contract_version, payload, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(tenant, record.id, owner.siteId, owner.siteScopeRevisionId, recommendation,
          record.relationship.role, baseline, record.createdAt, ...encode(record));
    });
  }

  async getMeasurement(context: TenantContext, ownerInput: Scope, input: string): Promise<StoredMeasurement | null> {
    const tenant = requireTenantContext(context);
    const owner = this.#scope(ownerInput, tenant);
    const row = this.#db.prepare(`SELECT * FROM measurements
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ?`)
      .get(tenant, owner.siteId, owner.siteScopeRevisionId, identifier.parse(input));
    if (!row) return null;
    return { record: decode('measurement', row), recommendationId: row['recommendation_id'] === null ? undefined : identifier.parse(row['recommendation_id']) };
  }

  async listMeasurements(context: TenantContext, input: MeasurementFilter): Promise<StoredMeasurement[]> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const filter = measurementFilterSchema.parse(input);
    owned(tenant, filter.scope);
    const rows = this.#db.prepare(`SELECT * FROM measurements
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND (? IS NULL OR recommendation_id = ?)
      ORDER BY created_at, id LIMIT ?`)
      .all(tenant, filter.scope.siteId, filter.scope.siteScopeRevisionId,
        filter.recommendationId ?? null, filter.recommendationId ?? null, LIST_LIMIT + 1);
    invariant(rows.length <= LIST_LIMIT, 'Measurement list exceeds 100 records; narrow the filters');
    return rows.map((row) => ({
      record: decode('measurement', row),
      recommendationId: row['recommendation_id'] === null ? undefined : identifier.parse(row['recommendation_id']),
    }));
  }

  async persistOutcome(context: TenantContext, input: Contract<'outcome'>): Promise<void> {
    const tenant = requireTenantContext(context);
    const record = parseContract('outcome', input);
    owned(tenant, record.scope);
    this.#write(() => {
      if (record.recommendationId !== undefined) {
        invariant(this.#db.prepare(`SELECT 1 AS present FROM recommendation_revisions
          WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ? LIMIT 1`)
          .get(tenant, record.scope.siteId, record.scope.siteScopeRevisionId, record.recommendationId) !== undefined,
        'Outcome recommendation is not present in the owning scope');
      }
      this.#db.prepare(`INSERT INTO outcomes
        (tenant_id, id, site_id, scope_revision_id, recommendation_id, created_at, contract_version, payload, payload_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(tenant, record.id, record.scope.siteId, record.scope.siteScopeRevisionId,
          record.recommendationId ?? null, record.createdAt, ...encode(record));
    });
  }

  async getOutcome(context: TenantContext, ownerInput: Scope, input: string): Promise<Contract<'outcome'> | null> {
    const tenant = requireTenantContext(context);
    const owner = this.#scope(ownerInput, tenant);
    const row = this.#db.prepare(`SELECT * FROM outcomes WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND id = ?`)
      .get(tenant, owner.siteId, owner.siteScopeRevisionId, identifier.parse(input));
    return row ? decode('outcome', row) : null;
  }

  async listOutcomes(context: TenantContext, input: OutcomeFilter): Promise<Contract<'outcome'>[]> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const filter = outcomeFilterSchema.parse(input);
    owned(tenant, filter.scope);
    const rows = this.#db.prepare(`SELECT * FROM outcomes
      WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ? AND (? IS NULL OR recommendation_id = ?)
      ORDER BY created_at, id LIMIT ?`)
      .all(tenant, filter.scope.siteId, filter.scope.siteScopeRevisionId,
        filter.recommendationId ?? null, filter.recommendationId ?? null, LIST_LIMIT + 1);
    invariant(rows.length <= LIST_LIMIT, 'Outcome list exceeds 100 records; narrow the filters');
    return rows.map((row) => decode('outcome', row));
  }

  close(): void { if (this.#db.isOpen) this.#db.close(); }
}
