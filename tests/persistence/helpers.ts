import { readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import type { Contract, ContractName } from '../../src/contracts/wire.js';
import { parseContract } from '../../src/domain/validate.js';
import type { CollectionBatch, SourceContext } from '../../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import { createTestTenantContext } from '../support/tenant-authority.js';

const corpus = JSON.parse(readFileSync('fixtures/synthetic/contracts.json', 'utf8')) as {
  records: Record<string, { data: unknown }>;
};
function fixture<N extends ContractName>(kind: N, name: string): Contract<N> {
  return parseContract(kind, corpus.records[name]!.data);
}
export const alpha = createTestTenantContext('tenant-alpha');
export const beta = createTestTenantContext('tenant-beta');

/** Only synthetic tenants. Internal and external IDs intentionally overlap. */
export function batch(tenant: 'alpha' | 'beta' = 'alpha', suffix = ''): CollectionBatch {
  const collection = fixture('collection', 'collectionComplete');
  const source = fixture('sourceRecord', 'sourceRecordAlpha');
  const observation = fixture('observation', 'observationZero');
  const owner = { tenantId: `tenant-${tenant}`, siteId: `site-${tenant}`, siteScopeRevisionId: `synthetic-scope-${tenant}-r1` };
  collection.id += suffix;
  collection.scope = { ...owner };
  source.identity.scope = { ...owner };
  observation.id += suffix;
  observation.cohort.context.scope = { ...owner };
  observation.cohort.context.subject.reference = owner.siteId;
  observation.provenance.source.scope = { ...owner };
  observation.provenance.runId = collection.id;
  return {
    idempotencyKey: `synthetic-idempotency${suffix}`,
    collection,
    part: 1,
    parts: 1,
    sources: [{ id: `synthetic-source-row${suffix}`, record: source }],
    observations: [{ sourceId: `synthetic-source-row${suffix}`, record: observation }],
  };
}

/**
 * Builds one collection of `total` sources spread over bounded parts, so tests can
 * exercise legitimate `receivedCount` values above a single part's source limit.
 */
export function partedBatches(total: number, perPart: number, suffix = '-parted'): CollectionBatch[] {
  const parts = Math.max(1, Math.ceil(total / perPart));
  const template = batch('alpha', suffix);
  template.collection.completeness = { state: 'complete', expectedCount: total, receivedCount: total };
  return Array.from({ length: parts }, (_, index) => {
    const value: CollectionBatch = {
      ...template, part: index + 1, parts,
      collection: structuredClone(template.collection), sources: [], observations: [],
    };
    for (let item = index * perPart; item < Math.min((index + 1) * perPart, total); item++) {
      const source = structuredClone(template.sources[0]!.record);
      const observation = structuredClone(template.observations[0]!.record);
      source.identity.sourceRecordId = `synthetic-external-${item}`;
      observation.id = `synthetic-observation${suffix}-${item}`;
      observation.provenance.source = structuredClone(source.identity);
      observation.provenance.completeness = structuredClone(template.collection.completeness);
      value.sources.push({ id: `synthetic-source-row${suffix}-${item}`, record: source });
      value.observations.push({ sourceId: `synthetic-source-row${suffix}-${item}`, record: observation });
    }
    return value;
  });
}

/** Observation provenance must agree with its collection, so both move together. */
export function setCompleteness(parts: CollectionBatch[], completeness: Contract<'collection'>['completeness']): void {
  for (const part of parts) {
    part.collection.completeness = structuredClone(completeness);
    for (const observation of part.observations) observation.record.provenance.completeness = structuredClone(completeness);
  }
}

export function sourceContext(value: CollectionBatch): SourceContext {
  return { scope: value.collection.scope, providerId: value.collection.providerId, providerConnectionId: value.collection.providerConnectionId! };
}

export interface TemporaryDatabase {
  path: string;
  /** Registers a connection for deterministic close-before-remove teardown. */
  track<T extends { close(): void }>(resource: T): T;
}

/**
 * Owns the whole temporary-file lifecycle: every tracked connection is closed in
 * reverse order before the directory is removed, in a single hook registered when the
 * directory is created. Callers never register their own removal hook, so no test can
 * unlink a database that is still open — which Windows refuses outright.
 */
export function temporaryDatabase(t: TestContext): TemporaryDatabase {
  const root = resolve('local-artifacts');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'synthetic-persistence-'));
  const tracked: { close(): void }[] = [];
  t.after(() => {
    for (const resource of [...tracked].reverse()) {
      try { resource.close(); } catch { /* an explicit test close already released it */ }
    }
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });
  return {
    path: join(directory, 'synthetic.sqlite'),
    track: (resource) => { tracked.push(resource); return resource; },
  };
}

export async function repository(t: TestContext, database?: TemporaryDatabase): Promise<LocalEvidenceRepository> {
  const repo = new LocalEvidenceRepository(database ? database.path : ':memory:');
  if (database) database.track(repo); else t.after(() => repo.close());
  for (const [context, tenant] of [[alpha, 'alpha'], [beta, 'beta']] as const) {
    const value = batch(tenant).collection;
    await repo.createTenant(context);
    await repo.createSite(context, { id: value.scope.siteId, label: `Synthetic ${tenant}` });
    await repo.createScope(context, value.scope);
    await repo.createConnection(context, { id: value.providerConnectionId!, scope: value.scope, providerId: value.providerId });
  }
  return repo;
}
