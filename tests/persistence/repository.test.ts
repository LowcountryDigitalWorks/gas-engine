import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import { sourceRecordIdentityHash } from '../../src/domain/validate.js';
import type { CollectionBatch, ObservationFilter, Site } from '../../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import { createTrustedTestTenantContext, type TenantContext } from '../../src/persistence/tenant-context.js';
import { alpha, beta, batch, repository, sourceContext, temporaryDatabase } from './helpers.js';

test('fresh SQLite persists same-tenant metadata and validated evidence with an explicit lifecycle', async (t) => {
  const repo = await repository(t);
  const value = batch();
  assert.deepEqual(await repo.getTenant(alpha), { id: 'tenant-alpha' });
  assert.deepEqual(await repo.persistCollection(alpha, value), { collectionId: value.collection.id, replayed: false });
  assert.deepEqual(await repo.getCollection(alpha, value.collection.id), value.collection);
  assert.deepEqual(await repo.getSource(alpha, value.sources[0]!.id), { ...value.sources[0], collectionId: value.collection.id });
  assert.deepEqual(await repo.getObservation(alpha, value.observations[0]!.record.id), value.observations[0]!.record);
  assert.equal(await repo.setSiteLabel(alpha, 'site-alpha', 'Synthetic revised label'), true);
  assert.equal((await repo.getSite(alpha, 'site-alpha'))?.label, 'Synthetic revised label');
  assert.equal(await repo.deleteCollection(alpha, value.collection.id), true);
  assert.equal(await repo.getCollection(alpha, value.collection.id), null);
  assert.equal(await repo.getSource(alpha, value.sources[0]!.id), null);
  assert.deepEqual(await repo.listObservations(alpha), []);
  assert.equal(await repo.deleteCollection(alpha, value.collection.id), false);
  assert.equal(await repo.findCollectionByIdempotency(alpha, sourceContext(value), value.idempotencyKey), null);
});

test('every tenant-owned public method rejects absent, forged, cloned and proxied contexts', async (t) => {
  const repo = await repository(t);
  const value = batch();
  const calls: Record<string, unknown[]> = {
    createTenant: [], getTenant: [], createSite: [{ id: 'site-alpha', label: 'Synthetic' }],
    getSite: ['site-alpha'], setSiteLabel: ['site-alpha', 'Synthetic'], createScope: [value.collection.scope],
    createConnection: [{ id: 'synthetic-connection', scope: value.collection.scope, providerId: 'synthetic-provider' }],
    persistCollection: [value], getCollection: [value.collection.id],
    findCollectionByIdempotency: [sourceContext(value), value.idempotencyKey],
    getSource: [value.sources[0]!.id], findSource: [sourceContext(value), value.collection.id, value.sources[0]!.record.identity.sourceRecordId],
    getObservation: [value.observations[0]!.record.id], listObservations: [{}], getObservations: [[value.observations[0]!.record.id]],
    getObservationEvidence: [value.observations[0]!.record.id], deleteCollection: [value.collection.id],
  };
  assert.deepEqual(Object.getOwnPropertyNames(LocalEvidenceRepository.prototype).filter((key) => !['constructor', 'close'].includes(key)).sort(), Object.keys(calls).sort());
  const methods = repo as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const forged of [undefined, null, 'tenant-alpha', { tenantId: 'tenant-alpha' }, { ...alpha }, new Proxy(alpha, {})]) {
    for (const [method, args] of Object.entries(calls)) {
      await assert.rejects(methods[method]!.call(repo, forged, ...args), /trusted TenantContext/, method);
    }
  }
  assert.throws(() => createTrustedTestTenantContext('../tenant-alpha'));
  assert.equal(await repo.getTenant(createTrustedTestTenantContext('tenant-absent')), null);
});

test('Beta cannot list, read known internal IDs, filter, bulk-read or join Alpha-only evidence', async (t) => {
  const repo = await repository(t);
  const a = batch('alpha', '-alpha-only');
  const b = batch('beta', '-beta-only');
  await repo.persistCollection(alpha, a);
  await repo.persistCollection(beta, b);
  const aid = a.observations[0]!.record.id;
  const bid = b.observations[0]!.record.id;
  assert.deepEqual((await repo.listObservations(beta)).map((o) => o.id), [bid]);
  assert.equal(await repo.getSite(beta, 'site-alpha'), null);
  assert.equal(await repo.getCollection(beta, a.collection.id), null);
  assert.equal(await repo.getSource(beta, a.sources[0]!.id), null);
  assert.equal(await repo.getObservation(beta, aid), null);
  assert.equal(await repo.getObservationEvidence(beta, aid), null);
  assert.deepEqual(await repo.listObservations(beta, { siteId: 'site-alpha' }), []);
  assert.deepEqual(await repo.listObservations(beta, { collectionId: a.collection.id }), []);
  assert.deepEqual((await repo.listObservations(beta, { providerId: a.collection.providerId })).map((o) => o.id), [bid]);
  assert.deepEqual((await repo.getObservations(beta, [aid, bid])).map((o) => o.id), [bid]);
  assert.deepEqual(await repo.getObservations(beta, [aid]), []);
});

test('data/filter/cursor tenant fields never replace trusted context; injection and unbounded queries reject', async (t) => {
  const repo = await repository(t);
  const a = batch();
  await repo.persistCollection(alpha, a);
  await assert.rejects(repo.persistCollection(beta, a), /trusted tenant/);
  for (const filter of [
    { tenantId: 'tenant-alpha' }, { cursor: { tenantId: 'tenant-alpha', id: a.observations[0]!.record.id } },
    { cursor: 'synthetic-alpha-page-token' }, { offset: 1 }, { limit: 10000 },
  ]) await assert.rejects(repo.listObservations(beta, filter as ObservationFilter));
  await assert.rejects(repo.getObservation(beta, "' OR 1=1 --"));
  await assert.rejects(repo.getObservations(beta, Array<string>(33).fill('synthetic-id')));
  await assert.rejects(repo.getObservations(beta, []));
  await assert.rejects(repo.createSite(beta, { id: 'synthetic-site', label: 'Synthetic', tenantId: 'tenant-alpha' } as Site));
  await assert.rejects(repo.createScope(beta, a.collection.scope), /trusted tenant/);
  await assert.rejects(repo.createConnection(beta, { id: 'synthetic-connection-2', scope: a.collection.scope, providerId: 'synthetic-provider' }), /trusted tenant/);
});

test('Beta update/delete and failed Beta transactions leave Alpha byte-for-byte unchanged', async (t) => {
  const repo = await repository(t);
  const a = batch('alpha', '-alpha-only');
  await repo.persistCollection(alpha, a);
  const before = await repo.getObservationEvidence(alpha, a.observations[0]!.record.id);
  assert.equal(await repo.setSiteLabel(beta, 'site-alpha', 'Synthetic attack'), false);
  assert.equal(await repo.deleteCollection(beta, a.collection.id), false);
  const b = batch('beta');
  b.observations[0]!.sourceId = a.sources[0]!.id;
  await assert.rejects(repo.persistCollection(beta, b), /source must be part/);
  assert.equal(await repo.getCollection(beta, b.collection.id), null);
  assert.equal(await repo.getSource(beta, b.sources[0]!.id), null);
  assert.equal((await repo.getSite(alpha, 'site-alpha'))?.label, 'Synthetic alpha');
  assert.deepEqual(await repo.getObservationEvidence(alpha, a.observations[0]!.record.id), before);
});

test('identical internal/provider/external/idempotency IDs persist independently and joined evidence remains tenant-owned', async (t) => {
  const repo = await repository(t);
  const a = batch();
  const b = batch('beta');
  await repo.persistCollection(alpha, a);
  assert.deepEqual(await repo.persistCollection(beta, b), { collectionId: b.collection.id, replayed: false });
  const external = a.sources[0]!.record.identity.sourceRecordId;
  assert.equal(external, b.sources[0]!.record.identity.sourceRecordId);
  assert.notEqual(sourceRecordIdentityHash(a.sources[0]!.record.identity), sourceRecordIdentityHash(b.sources[0]!.record.identity));
  for (const [context, value] of [[alpha, a], [beta, b]] as const) {
    assert.deepEqual((await repo.findSource(context, sourceContext(value), value.collection.id, external))?.record, value.sources[0]!.record);
    assert.deepEqual(await repo.findCollectionByIdempotency(context, sourceContext(value), value.idempotencyKey), value.collection);
    assert.deepEqual(await repo.getObservationEvidence(context, value.observations[0]!.record.id), {
      collection: value.collection, source: { ...value.sources[0]!, collectionId: value.collection.id }, observation: value.observations[0]!.record,
    });
  }
  assert.equal(await repo.deleteCollection(beta, b.collection.id), true);
  assert.deepEqual(await repo.getObservation(alpha, a.observations[0]!.record.id), a.observations[0]!.record);
});

test('external identity and idempotency lookup require the owning tenant, site, scope, provider, connection and run', async (t) => {
  const repo = await repository(t);
  const a = batch('alpha', '-alpha-only');
  await repo.persistCollection(alpha, a);
  const external = a.sources[0]!.record.identity.sourceRecordId;
  await assert.rejects(repo.findSource(beta, sourceContext(a), a.collection.id, external), /trusted tenant/);
  await assert.rejects(repo.findCollectionByIdempotency(beta, sourceContext(a), a.idempotencyKey), /trusted tenant/);
  assert.equal(await repo.findSource(beta, sourceContext(batch('beta')), a.collection.id, external), null);
  assert.equal(await repo.findCollectionByIdempotency(beta, sourceContext(batch('beta')), a.idempotencyKey), null);
  for (const change of [
    { providerId: 'synthetic-other-provider' }, { providerConnectionId: 'synthetic-other-connection' },
    { scope: { ...a.collection.scope, siteId: 'synthetic-other-site' } },
    { scope: { ...a.collection.scope, siteScopeRevisionId: 'synthetic-other-revision' } },
  ]) {
    const source = { ...sourceContext(a), ...change };
    assert.equal(await repo.findSource(alpha, source, a.collection.id, external), null);
    assert.equal(await repo.findCollectionByIdempotency(alpha, source, a.idempotencyKey), null);
  }
  assert.equal(await repo.findSource(alpha, sourceContext(a), 'synthetic-other-run', external), null);
});

test('exact idempotency replay is stable; changed requests, duplicate IDs and changed records cannot overwrite evidence', async (t) => {
  const repo = await repository(t);
  const a = batch();
  await repo.persistCollection(alpha, a);
  assert.equal((await repo.persistCollection(alpha, structuredClone(a))).replayed, true);
  const changed = structuredClone(a);
  changed.observations[0]!.record.value = { state: 'observed', value: { type: 'number', value: 8 } };
  await assert.rejects(repo.persistCollection(alpha, changed), /Idempotency conflict/);
  const newKey = { ...a, idempotencyKey: 'synthetic-new-key' };
  await assert.rejects(repo.persistCollection(alpha, newKey), /UNIQUE constraint/);
  assert.deepEqual(await repo.getObservation(alpha, a.observations[0]!.record.id), a.observations[0]!.record);
});

test('same idempotency key is independent for a different scoped connection and external identity can recur in later runs', async (t) => {
  const repo = await repository(t);
  const a = batch();
  await repo.persistCollection(alpha, a);
  const nextRun = batch('alpha', '-later');
  await repo.persistCollection(alpha, nextRun);
  const nextConnection = batch('alpha', '-other-connection');
  nextConnection.idempotencyKey = a.idempotencyKey;
  nextConnection.collection.providerConnectionId = 'synthetic-connection-other';
  nextConnection.sources[0]!.record.identity.providerConnectionId = 'synthetic-connection-other';
  nextConnection.observations[0]!.record.provenance.source.providerConnectionId = 'synthetic-connection-other';
  await repo.createConnection(alpha, { id: 'synthetic-connection-other', scope: a.collection.scope, providerId: a.collection.providerId });
  assert.equal((await repo.persistCollection(alpha, nextConnection)).replayed, false);
  assert.equal((await repo.listObservations(alpha)).length, 3);
});

test('Beta cannot attach Alpha observations, sources or provider connections; rollback includes the new collection', async (t) => {
  const repo = await repository(t);
  const a = batch('alpha', '-alpha-only');
  a.collection.providerConnectionId = 'synthetic-alpha-only-connection';
  a.sources[0]!.record.identity.providerConnectionId = a.collection.providerConnectionId;
  a.observations[0]!.record.provenance.source.providerConnectionId = a.collection.providerConnectionId;
  await repo.createConnection(alpha, { id: a.collection.providerConnectionId, scope: a.collection.scope, providerId: a.collection.providerId });
  await repo.persistCollection(alpha, a);
  const attacks = [
    (b: CollectionBatch) => { b.sources[0]!.record = a.sources[0]!.record; },
    (b: CollectionBatch) => { b.observations[0]!.record = a.observations[0]!.record; },
    (b: CollectionBatch) => { b.observations[0]!.record.provenance.runId = a.collection.id; },
    (b: CollectionBatch) => { b.sources[0]!.record.identity.providerConnectionId = a.collection.providerConnectionId!; },
    (b: CollectionBatch) => { b.collection.providerConnectionId = a.collection.providerConnectionId!; },
  ];
  for (const attack of attacks) {
    const b = batch('beta');
    attack(b);
    await assert.rejects(repo.persistCollection(beta, b));
    assert.equal(await repo.getCollection(beta, b.collection.id), null);
    assert.equal(await repo.getSource(beta, b.sources[0]!.id), null);
    assert.deepEqual(await repo.listObservations(beta), []);
  }
  assert.deepEqual(await repo.getCollection(alpha, a.collection.id), a.collection);
});

test('failed child SQL insert rolls back collection, sources, prior observations and idempotency reservation', async (t) => {
  const repo = await repository(t);
  const value = batch();
  value.observations.push(structuredClone(value.observations[0]!));
  await assert.rejects(repo.persistCollection(alpha, value), /UNIQUE constraint/);
  assert.equal(await repo.getCollection(alpha, value.collection.id), null);
  assert.equal(await repo.getSource(alpha, value.sources[0]!.id), null);
  assert.deepEqual(await repo.listObservations(alpha), []);
  assert.equal(await repo.findCollectionByIdempotency(alpha, sourceContext(value), value.idempotencyKey), null);
  value.observations.pop();
  assert.equal((await repo.persistCollection(alpha, value)).replayed, false);
});

test('zero and all four missing states preserve their exact values/reasons and independent source/canonical versions', async (t) => {
  const repo = await repository(t);
  const value = batch();
  for (const state of ['unknown', 'unavailable', 'not_collected', 'not_applicable'] as const) {
    const observation = structuredClone(value.observations[0]!);
    observation.record.id = `synthetic-observation-${state}`;
    observation.record.value = { state, reason: `Synthetic ${state} metric in a received record` };
    value.observations.push(observation);
  }
  await repo.persistCollection(alpha, value);
  for (const observation of value.observations) {
    const read = await repo.getObservation(alpha, observation.record.id);
    assert.deepEqual(read, observation.record);
    assert.equal(read?.schemaVersion, '1.0');
    assert.equal(read?.provenance.sourceSchema.version, '7.3');
    assert.equal(read?.provenance.adapter.version, '2.0');
    assert.equal(read?.provenance.normalization.version, '1.0');
  }
});

test('unsupported outer/nested schemas, unknown payloads, missing connection, count and provenance disagreements fail closed', async (t) => {
  const repo = await repository(t);
  const mutations: ((b: CollectionBatch) => void)[] = [
    (b) => { (b.collection as unknown as { schemaVersion: string }).schemaVersion = '2.0'; },
    (b) => { (b.sources[0]!.record as unknown as { schemaVersion: string }).schemaVersion = '2.0'; },
    (b) => { (b.observations[0]!.record.provenance as unknown as { schemaVersion: string }).schemaVersion = '2.0'; },
    (b) => { Object.assign(b.sources[0]!.record, { rawPayload: { synthetic: true } }); },
    (b) => { Object.assign(b, { tenantId: 'tenant-alpha' }); },
    (b) => { delete b.collection.providerConnectionId; },
    (b) => { b.sources.length = 0; },
    (b) => { b.observations[0]!.record.provenance.adapter.version = '3.0'; },
    (b) => { b.observations[0]!.record.provenance.source.sourceRecordId = 'synthetic-other-source'; },
    (b) => { b.observations[0]!.record.provenance.availability = { state: 'unavailable', reason: 'Synthetic disagreement' }; },
    (b) => { b.observations[0]!.record.cohort.context.method.configurationId = 'synthetic-other-method'; },
  ];
  for (const mutate of mutations) {
    const value = batch();
    mutate(value);
    await assert.rejects(repo.persistCollection(alpha, value));
    assert.equal(await repo.getCollection(alpha, value.collection.id), null);
    assert.deepEqual(await repo.listObservations(alpha), []);
  }
});

test('complete empty and unavailable collections remain meaningful without fabricated source records', async (t) => {
  const repo = await repository(t);
  for (const state of ['complete', 'unavailable'] as const) {
    const value = batch('alpha', `-${state}`);
    value.sources = [];
    value.observations = [];
    value.collection.completeness = state === 'complete' ? { state, receivedCount: 0, expectedCount: 0 } : { state, receivedCount: 0, reason: 'Synthetic unavailable collection' };
    await repo.persistCollection(alpha, value);
    assert.deepEqual(await repo.getCollection(alpha, value.collection.id), value.collection);
  }
  assert.deepEqual(await repo.listObservations(alpha), []);
});

test('bounded lists fail explicitly above 100 own records without counting or exposing the other tenant', async (t) => {
  const repo = await repository(t);
  for (let i = 0; i < 101; i++) await repo.persistCollection(alpha, batch('alpha', `-${i}`));
  await assert.rejects(repo.listObservations(alpha), /narrow the filters/);
  assert.equal((await repo.listObservations(alpha, { collectionId: batch('alpha', '-0').collection.id })).length, 1);
  assert.deepEqual(await repo.listObservations(beta), []);
});

test('file-backed evidence and idempotency survive closing/reopening; same file supports independent repository instances', async (t) => {
  const { path, cleanup } = temporaryDatabase();
  const repo = await repository(t, path);
  t.after(cleanup);
  const value = batch();
  await repo.persistCollection(alpha, value);
  const second = new LocalEvidenceRepository(path);
  try {
    assert.deepEqual(await second.getObservation(alpha, value.observations[0]!.record.id), value.observations[0]!.record);
    assert.equal((await second.persistCollection(alpha, value)).replayed, true);
  } finally { second.close(); }
  // Adapter close is deliberately idempotent for explicit lifecycle/cleanup.
  repo.close();
  const reopened = new LocalEvidenceRepository(path);
  try {
    assert.deepEqual(await reopened.getObservationEvidence(alpha, value.observations[0]!.record.id), {
      collection: value.collection, source: { ...value.sources[0]!, collectionId: value.collection.id }, observation: value.observations[0]!.record,
    });
    assert.equal((await reopened.persistCollection(alpha, value)).replayed, true);
  } finally { reopened.close(); }
});

test('read paths detect altered canonical evidence and unsupported stored versions', async (t) => {
  const { path, cleanup } = temporaryDatabase();
  const repo = await repository(t, path);
  t.after(cleanup);
  const value = batch();
  await repo.persistCollection(alpha, value);
  const db = new DatabaseSync(path);
  try {
    const changed: Contract<'observation'> = structuredClone(value.observations[0]!.record);
    changed.value = { state: 'observed', value: { type: 'number', value: 9 } };
    db.prepare('UPDATE observations SET payload = ? WHERE tenant_id = ? AND id = ?')
      .run(JSON.stringify(changed), 'tenant-alpha', changed.id);
    await assert.rejects(repo.getObservation(alpha, changed.id), /integrity mismatch/);
    await assert.rejects(repo.listObservations(alpha), /integrity mismatch/);
    await assert.rejects(repo.getObservations(alpha, [changed.id]), /integrity mismatch/);
    await assert.rejects(repo.getObservationEvidence(alpha, changed.id), /integrity mismatch/);
    assert.throws(() => db.exec("UPDATE observations SET contract_version = '2.0'"), /CHECK constraint/);
  } finally { db.close(); }
});

// Compile-time authority remains opaque as well as being checked at runtime.
// @ts-expect-error An identifier in a payload is not a TenantContext.
const rejectedContext: TenantContext = { tenantId: 'tenant-alpha' };
void rejectedContext;
