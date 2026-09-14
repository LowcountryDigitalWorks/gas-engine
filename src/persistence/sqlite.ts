import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { z } from 'zod';
import { identifier, scope, shortText } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { parseContract, sourceRecordIdentityHash } from '../domain/validate.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import { IdempotencyConflictError, PartSequenceConflictError } from './errors.js';
import { migrateLocalDatabase, STORAGE_BOUNDS } from './migrations.js';
import type {
  CollectionBatch, CollectionProgress, Connection, Evidence, EvidenceRepository,
  ObservationFilter, PersistResult, Scope, Site, SourceContext, StoredSource,
} from './repository.js';
import { requireTenantContext, type TenantContext } from './tenant-context.js';

type Row = Record<string, SQLOutputValue>;
type EvidenceKind = 'collection' | 'sourceRecord' | 'observation';
const siteSchema = z.strictObject({ id: identifier, label: shortText });
const connectionSchema = z.strictObject({ id: identifier, scope, providerId: identifier });
const sourceContextSchema = z.strictObject({ scope, providerId: identifier, providerConnectionId: identifier });
const filterSchema = z.strictObject({ siteId: identifier.optional(), collectionId: identifier.optional(), providerId: identifier.optional() });
const partIndex = z.number().int().min(1).max(STORAGE_BOUNDS.parts);
const batchSchema = z.strictObject({
  idempotencyKey: identifier,
  collection: z.unknown(),
  part: partIndex,
  parts: partIndex,
  sources: z.array(z.strictObject({ id: identifier, record: z.unknown() })).max(STORAGE_BOUNDS.sourcesPerPart),
  observations: z.array(z.strictObject({ sourceId: identifier, record: z.unknown() })).max(STORAGE_BOUNDS.observationsPerPart),
});

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }
function owned(tenant: string, owner: Scope): void {
  invariant(owner.tenantId === tenant, 'Record scope does not match trusted tenant context');
}
function encoded(record: Contract<EvidenceKind>): [string, string, string] {
  return [record.schemaVersion, canonicalJson(record), hashCanonicalJson(record)];
}
function decode<N extends EvidenceKind>(kind: N, row: Row): Contract<N> {
  invariant(typeof row['payload'] === 'string' && row['payload'].length <= 65536, 'Invalid persisted payload');
  const record = parseContract(kind, JSON.parse(row['payload']));
  invariant(row['contract_version'] === record.schemaVersion && row['payload'] === canonicalJson(record)
    && row['payload_hash'] === hashCanonicalJson(record), 'Persisted contract integrity mismatch');
  const evidence = record as Contract<EvidenceKind>;
  const identity = evidence.kind === 'source_record' ? evidence.identity
    : evidence.kind === 'observation' ? evidence.provenance.source : evidence;
  invariant(same([row['tenant_id'], row['site_id'], row['scope_revision_id'], row['provider_id'], row['connection_id']],
    [identity.scope.tenantId, identity.scope.siteId, identity.scope.siteScopeRevisionId, identity.providerId, identity.providerConnectionId]), 'Persisted ownership index mismatch');
  if (evidence.kind !== 'source_record') invariant(row['id'] === evidence.id, 'Persisted record ID mismatch');
  if (evidence.kind === 'source_record') {
    invariant(row['external_id'] === evidence.identity.sourceRecordId && row['identity_hash'] === sourceRecordIdentityHash(evidence.identity), 'Persisted source identity mismatch');
  }
  if (evidence.kind === 'observation') invariant(row['collection_id'] === evidence.provenance.runId, 'Persisted run mismatch');
  return record;
}
function sourceFrom(row: Row): StoredSource {
  return { id: identifier.parse(row['id']), collectionId: identifier.parse(row['collection_id']), record: decode('sourceRecord', row) };
}
function checkSource(collection: Contract<'collection'>, source: Contract<'sourceRecord'>): void {
  invariant(same(source.identity.scope, collection.scope) && source.identity.providerId === collection.providerId
    && source.identity.providerConnectionId === collection.providerConnectionId, 'Source does not belong to this collection connection/scope');
}
function checkObservation(collection: Contract<'collection'>, source: Contract<'sourceRecord'>, observation: Contract<'observation'>): void {
  const provenance = observation.provenance;
  invariant(provenance.runId === collection.id && same(provenance.source, source.identity), 'Observation does not belong to this source/run');
  for (const key of ['adapter', 'sourceSchema', 'sourceTime', 'collectedAt', 'receivedAt', 'completeness'] as const) {
    invariant(same(provenance[key], collection[key]), `Observation collection provenance mismatch: ${key}`);
  }
  invariant(same(provenance.integrity, source.integrity) && same(provenance.availability, source.availability), 'Observation source provenance mismatch');
  invariant(same(observation.cohort.context.method, collection.method), 'Observation collection method mismatch');
}

/** Local adapter only. The path is trusted administrative configuration. */
export class LocalEvidenceRepository implements EvidenceRepository {
  readonly #db: DatabaseSync;

  constructor(path: string = ':memory:') {
    this.#db = new DatabaseSync(path, {
      enableForeignKeyConstraints: true, enableDoubleQuotedStringLiterals: false,
      allowExtension: false, defensive: true, timeout: 1000,
    });
    try { migrateLocalDatabase(this.#db); }
    catch (error) { this.#db.close(); throw error; }
  }

  // Synchronous adapter work never yields while a transaction is open. No caller
  // callbacks or raw database/SQL handles cross the application boundary.
  #transaction<T>(begin: 'BEGIN IMMEDIATE' | 'BEGIN DEFERRED', work: () => T): T {
    this.#db.exec(begin);
    try {
      const result = work();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) { this.#db.exec('ROLLBACK'); throw error; }
  }
  /** Mutations declare write intent up front so writers serialize deterministically. */
  #write<T>(work: () => T): T { return this.#transaction('BEGIN IMMEDIATE', work); }
  /**
   * Multi-statement reads take a deferred transaction: the snapshot stays consistent
   * for the whole read, but an evidence read never acquires write-intent locking and
   * so never serializes an independent writer on the same file.
   */
  #read<T>(work: () => T): T { return this.#transaction('BEGIN DEFERRED', work); }

  async createTenant(context: TenantContext): Promise<void> {
    const tenant = requireTenantContext(context);
    this.#db.prepare('INSERT INTO tenants (tenant_id) VALUES (?)').run(tenant);
  }
  async getTenant(context: TenantContext): Promise<{ id: string } | null> {
    const tenant = requireTenantContext(context);
    return this.#db.prepare('SELECT tenant_id FROM tenants WHERE tenant_id = ?').get(tenant) ? { id: tenant } : null;
  }
  async createSite(context: TenantContext, input: Site): Promise<void> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const site = siteSchema.parse(input);
    this.#db.prepare('INSERT INTO sites (tenant_id, site_id, label) VALUES (?, ?, ?)').run(tenant, site.id, site.label);
  }
  async getSite(context: TenantContext, input: string): Promise<Site | null> {
    const tenant = requireTenantContext(context);
    const row = this.#db.prepare('SELECT site_id AS id, label FROM sites WHERE tenant_id = ? AND site_id = ?').get(tenant, identifier.parse(input));
    return row ? siteSchema.parse(row) : null;
  }
  async setSiteLabel(context: TenantContext, input: string, label: string): Promise<boolean> {
    const tenant = requireTenantContext(context);
    return this.#db.prepare('UPDATE sites SET label = ? WHERE tenant_id = ? AND site_id = ?')
      .run(shortText.parse(label), tenant, identifier.parse(input)).changes === 1;
  }
  async createScope(context: TenantContext, input: Scope): Promise<void> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const owner = scope.parse(input);
    owned(tenant, owner);
    this.#db.prepare('INSERT INTO site_scopes (tenant_id, site_id, scope_revision_id) VALUES (?, ?, ?)')
      .run(tenant, owner.siteId, owner.siteScopeRevisionId);
  }
  async createConnection(context: TenantContext, input: Connection): Promise<void> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const connection = connectionSchema.parse(input);
    owned(tenant, connection.scope);
    this.#db.prepare(`INSERT INTO provider_connections (tenant_id, id, site_id, scope_revision_id, provider_id)
      VALUES (?, ?, ?, ?, ?)`)
      .run(tenant, connection.id, connection.scope.siteId, connection.scope.siteScopeRevisionId, connection.providerId);
  }

  // Derived from stored rows only; persistence never keeps a second opinion about
  // how much evidence a collection declares.
  #progress(tenant: string, collectionId: string): CollectionProgress {
    const row = this.#db.prepare(`SELECT c.received_count AS received, c.part_count AS parts,
      (SELECT COUNT(*) FROM collection_parts p WHERE p.tenant_id = c.tenant_id AND p.collection_id = c.id) AS parts_persisted,
      (SELECT COUNT(*) FROM source_records s WHERE s.tenant_id = c.tenant_id AND s.collection_id = c.id) AS sources_persisted
      FROM collections c WHERE c.tenant_id = ? AND c.id = ?`).get(tenant, collectionId);
    invariant(row !== undefined, 'Collection progress requires a persisted collection');
    const counts = z.object({ received: z.number().int(), parts: z.number().int(), parts_persisted: z.number().int(), sources_persisted: z.number().int() }).parse(row);
    return {
      receivedCount: counts.received, persistedSources: counts.sources_persisted,
      parts: counts.parts, partsPersisted: counts.parts_persisted,
      complete: counts.sources_persisted === counts.received && counts.parts_persisted === counts.parts,
    };
  }

  /**
   * Persists exactly one bounded part of a collection atomically. Part 1 opens the
   * collection; later parts repeat the identical canonical collection record and must
   * arrive in order without gaps. Sources are reconciled against the collection's own
   * `receivedCount`, so the declared evidence count is never redefined or truncated.
   */
  async persistCollection(context: TenantContext, input: CollectionBatch): Promise<PersistResult> {
    const tenant = requireTenantContext(context);
    // Bounds this part's complete request and rejects accessors/proxies before reads.
    const partHash = hashCanonicalJson(input);
    const batch = batchSchema.parse(input);
    invariant(batch.part <= batch.parts, 'Part index exceeds the declared part count');
    const collection = parseContract('collection', batch.collection);
    owned(tenant, collection.scope);
    const connection = identifier.parse(collection.providerConnectionId);
    const { siteId, siteScopeRevisionId } = collection.scope;
    const received = collection.completeness.receivedCount;
    invariant(received <= batch.parts * STORAGE_BOUNDS.sourcesPerPart,
      'Declared collection receivedCount exceeds the evidence the declared parts can carry');
    return this.#write(() => {
      const prior = this.#db.prepare(`SELECT * FROM collections WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ?
        AND provider_id = ? AND connection_id = ? AND idempotency_key = ?`)
        .get(tenant, siteId, siteScopeRevisionId, collection.providerId, connection, batch.idempotencyKey);
      if (prior) {
        if (!same(decode('collection', prior), collection) || prior['part_count'] !== batch.parts) throw new IdempotencyConflictError();
        const replayed = this.#db.prepare('SELECT part_hash FROM collection_parts WHERE tenant_id = ? AND collection_id = ? AND part_index = ?')
          .get(tenant, collection.id, batch.part);
        if (replayed) {
          if (replayed['part_hash'] !== partHash) throw new IdempotencyConflictError();
          return { collectionId: collection.id, replayed: true, complete: this.#progress(tenant, collection.id).complete };
        }
        if (this.#db.prepare('SELECT 1 AS present FROM collection_parts WHERE tenant_id = ? AND collection_id = ? AND part_index = ?')
          .get(tenant, collection.id, batch.part - 1) === undefined) throw new PartSequenceConflictError();
      } else {
        if (batch.part !== 1) throw new PartSequenceConflictError('A collection must be opened by its first part');
        this.#db.prepare(`INSERT INTO collections (tenant_id, id, site_id, scope_revision_id, connection_id, provider_id,
          idempotency_key, part_count, received_count, contract_version, payload, payload_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(tenant, collection.id, siteId, siteScopeRevisionId, connection, collection.providerId,
            batch.idempotencyKey, batch.parts, received, ...encoded(collection));
      }
      this.#db.prepare(`INSERT INTO collection_parts (tenant_id, collection_id, part_index, site_id, scope_revision_id,
        connection_id, provider_id, part_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(tenant, collection.id, batch.part, siteId, siteScopeRevisionId, connection, collection.providerId, partHash);
      const sources = new Map<string, Contract<'sourceRecord'>>();
      for (const item of batch.sources) {
        const source = parseContract('sourceRecord', item.record);
        owned(tenant, source.identity.scope);
        checkSource(collection, source);
        this.#db.prepare(`INSERT INTO source_records (tenant_id, id, collection_id, part_index, site_id, scope_revision_id,
          connection_id, provider_id, external_id, identity_hash, contract_version, payload, payload_hash)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(tenant, item.id, collection.id, batch.part, siteId, siteScopeRevisionId, connection, collection.providerId,
            source.identity.sourceRecordId, sourceRecordIdentityHash(source.identity), ...encoded(source));
        sources.set(item.id, source);
      }
      for (const item of batch.observations) {
        const observation = parseContract('observation', item.record);
        owned(tenant, observation.cohort.context.scope);
        const source = sources.get(item.sourceId);
        invariant(source !== undefined, 'Observation source must be part of this atomic collection part');
        checkObservation(collection, source, observation);
        this.#db.prepare(`INSERT INTO observations (tenant_id, id, source_id, collection_id, site_id, scope_revision_id,
          connection_id, provider_id, contract_version, payload, payload_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(tenant, observation.id, item.sourceId, collection.id, siteId, siteScopeRevisionId, connection, collection.providerId, ...encoded(observation));
      }
      const progress = this.#progress(tenant, collection.id);
      invariant(progress.persistedSources <= received, 'Persisted sources exceed the collection receivedCount');
      invariant(batch.part < batch.parts || progress.persistedSources === received,
        'The final part must account for every source the collection declares as received');
      return { collectionId: collection.id, replayed: false, complete: progress.complete };
    });
  }

  async getCollection(context: TenantContext, input: string): Promise<Contract<'collection'> | null> {
    const tenant = requireTenantContext(context);
    const row = this.#db.prepare('SELECT * FROM collections WHERE tenant_id = ? AND id = ?').get(tenant, identifier.parse(input));
    return row ? decode('collection', row) : null;
  }
  async getCollectionProgress(context: TenantContext, input: string): Promise<CollectionProgress | null> {
    const tenant = requireTenantContext(context);
    const id = identifier.parse(input);
    return this.#read(() => this.#db.prepare('SELECT 1 AS present FROM collections WHERE tenant_id = ? AND id = ?').get(tenant, id)
      ? this.#progress(tenant, id) : null);
  }
  async findCollectionByIdempotency(context: TenantContext, input: SourceContext, key: string): Promise<Contract<'collection'> | null> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const source = sourceContextSchema.parse(input);
    owned(tenant, source.scope);
    const row = this.#db.prepare(`SELECT * FROM collections WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ?
      AND provider_id = ? AND connection_id = ? AND idempotency_key = ?`)
      .get(tenant, source.scope.siteId, source.scope.siteScopeRevisionId, source.providerId, source.providerConnectionId, identifier.parse(key));
    return row ? decode('collection', row) : null;
  }
  async getSource(context: TenantContext, input: string): Promise<StoredSource | null> {
    const tenant = requireTenantContext(context);
    const row = this.#db.prepare('SELECT * FROM source_records WHERE tenant_id = ? AND id = ?').get(tenant, identifier.parse(input));
    return row ? sourceFrom(row) : null;
  }
  async findSource(context: TenantContext, input: SourceContext, collectionId: string, externalId: string): Promise<StoredSource | null> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const source = sourceContextSchema.parse(input);
    owned(tenant, source.scope);
    const row = this.#db.prepare(`SELECT * FROM source_records WHERE tenant_id = ? AND site_id = ? AND scope_revision_id = ?
      AND provider_id = ? AND connection_id = ? AND collection_id = ? AND external_id = ?`)
      .get(tenant, source.scope.siteId, source.scope.siteScopeRevisionId, source.providerId, source.providerConnectionId,
        identifier.parse(collectionId), identifier.parse(externalId));
    return row ? sourceFrom(row) : null;
  }
  async getObservation(context: TenantContext, input: string): Promise<Contract<'observation'> | null> {
    const tenant = requireTenantContext(context);
    const row = this.#db.prepare('SELECT * FROM observations WHERE tenant_id = ? AND id = ?').get(tenant, identifier.parse(input));
    return row ? decode('observation', row) : null;
  }
  async listObservations(context: TenantContext, input: ObservationFilter = {}): Promise<Contract<'observation'>[]> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const filter = filterSchema.parse(input);
    const rows = this.#db.prepare(`SELECT * FROM observations WHERE tenant_id = ?
      AND (? IS NULL OR site_id = ?) AND (? IS NULL OR collection_id = ?) AND (? IS NULL OR provider_id = ?) ORDER BY id LIMIT 101`)
      .all(tenant, filter.siteId ?? null, filter.siteId ?? null, filter.collectionId ?? null, filter.collectionId ?? null, filter.providerId ?? null, filter.providerId ?? null);
    invariant(rows.length <= 100, 'List exceeds 100 observations; narrow the filters');
    return rows.map((row) => decode('observation', row));
  }
  async getObservations(context: TenantContext, input: string[]): Promise<Contract<'observation'>[]> {
    const tenant = requireTenantContext(context);
    canonicalJson(input);
    const ids = z.array(identifier).min(1).max(32).parse(input);
    const placeholders = ids.map(() => '?').join(',');
    return this.#db.prepare(`SELECT * FROM observations WHERE tenant_id = ? AND id IN (${placeholders}) ORDER BY id`)
      .all(tenant, ...ids).map((row) => decode('observation', row));
  }
  async getObservationEvidence(context: TenantContext, input: string): Promise<Evidence | null> {
    const tenant = requireTenantContext(context);
    const id = identifier.parse(input);
    // One deferred read transaction preserves a consistent joined snapshot on
    // file-backed databases without taking write intent.
    return this.#read(() => {
      const row = this.#db.prepare(`SELECT o.* FROM observations o
        JOIN source_records s ON s.tenant_id = o.tenant_id AND s.id = o.source_id AND s.collection_id = o.collection_id
          AND s.site_id = o.site_id AND s.scope_revision_id = o.scope_revision_id AND s.connection_id = o.connection_id AND s.provider_id = o.provider_id
        JOIN collections c ON c.tenant_id = s.tenant_id AND c.id = s.collection_id AND c.site_id = s.site_id
          AND c.scope_revision_id = s.scope_revision_id AND c.connection_id = s.connection_id AND c.provider_id = s.provider_id
        WHERE o.tenant_id = ? AND o.id = ?`).get(tenant, id);
      if (!row) return null;
      const sourceRow = this.#db.prepare('SELECT * FROM source_records WHERE tenant_id = ? AND id = ?').get(tenant, identifier.parse(row['source_id']));
      const collectionRow = this.#db.prepare('SELECT * FROM collections WHERE tenant_id = ? AND id = ?').get(tenant, identifier.parse(row['collection_id']));
      invariant(sourceRow !== undefined && collectionRow !== undefined, 'Broken evidence chain');
      const evidence = { collection: decode('collection', collectionRow), source: sourceFrom(sourceRow), observation: decode('observation', row) };
      checkSource(evidence.collection, evidence.source.record);
      checkObservation(evidence.collection, evidence.source.record, evidence.observation);
      return evidence;
    });
  }
  async deleteCollection(context: TenantContext, input: string): Promise<boolean> {
    const tenant = requireTenantContext(context);
    const id = identifier.parse(input);
    return this.#write(() => {
      this.#db.prepare('DELETE FROM observations WHERE tenant_id = ? AND collection_id = ?').run(tenant, id);
      this.#db.prepare('DELETE FROM source_records WHERE tenant_id = ? AND collection_id = ?').run(tenant, id);
      this.#db.prepare('DELETE FROM collection_parts WHERE tenant_id = ? AND collection_id = ?').run(tenant, id);
      return this.#db.prepare('DELETE FROM collections WHERE tenant_id = ? AND id = ?').run(tenant, id).changes === 1;
    });
  }
  close(): void { if (this.#db.isOpen) this.#db.close(); }
}
