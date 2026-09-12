import { readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { TestContext } from 'node:test';
import type { Contract, ContractName } from '../../src/contracts/wire.js';
import { parseContract } from '../../src/domain/validate.js';
import type { CollectionBatch, SourceContext } from '../../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import { createTrustedTestTenantContext } from '../../src/persistence/tenant-context.js';

const corpus = JSON.parse(readFileSync('fixtures/synthetic/contracts.json', 'utf8')) as {
  records: Record<string, { data: unknown }>;
};
function fixture<N extends ContractName>(kind: N, name: string): Contract<N> {
  return parseContract(kind, corpus.records[name]!.data);
}
export const alpha = createTrustedTestTenantContext('tenant-alpha');
export const beta = createTrustedTestTenantContext('tenant-beta');

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
    sources: [{ id: `synthetic-source-row${suffix}`, record: source }],
    observations: [{ sourceId: `synthetic-source-row${suffix}`, record: observation }],
  };
}
export function sourceContext(value: CollectionBatch): SourceContext {
  return { scope: value.collection.scope, providerId: value.collection.providerId, providerConnectionId: value.collection.providerConnectionId! };
}
export function temporaryDatabase(): { path: string; cleanup: () => void } {
  const root = resolve('local-artifacts');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'synthetic-persistence-'));
  return { path: join(directory, 'synthetic.sqlite'), cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}
export async function repository(t: TestContext, path = ':memory:'): Promise<LocalEvidenceRepository> {
  const repo = new LocalEvidenceRepository(path);
  t.after(() => repo.close());
  for (const [context, tenant] of [[alpha, 'alpha'], [beta, 'beta']] as const) {
    const value = batch(tenant).collection;
    await repo.createTenant(context);
    await repo.createSite(context, { id: value.scope.siteId, label: `Synthetic ${tenant}` });
    await repo.createScope(context, value.scope);
    await repo.createConnection(context, { id: value.providerConnectionId!, scope: value.scope, providerId: value.providerId });
  }
  return repo;
}
