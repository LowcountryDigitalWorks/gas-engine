import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { issueAuthenticatedPrincipal, type AuthenticatedPrincipal } from '../../src/authentication/principal.js';
import { createIngestionHandler } from '../../src/ingestion/http.js';
import { createIngestionService } from '../../src/ingestion/service.js';
import { IngestionError } from '../../src/ingestion/errors.js';
import { IdempotencyConflictError, PartSequenceConflictError } from '../../src/persistence/errors.js';
import { alpha, beta, batch, sourceContext, temporaryDatabase } from '../persistence/helpers.js';
import { content, failureRepository, principal, request, setup, synthetic } from './helpers.js';

test('exact Alpha grant creates, replays, and conflicts with minimal bounded responses', async (t) => {
  const { handler, repo } = await setup(t);
  const value = batch();
  for (const [status, replayed] of [[201, false], [200, true]] as const) {
    const response = await handler(request(value));
    assert.equal(response.status, status);
    assert.equal(response.headers.get('Content-Type'), 'application/json');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { collectionId: value.collection.id, replayed, complete: true });
  }
  const changed = structuredClone(value);
  changed.observations[0]!.record.value = { state: 'observed', value: { type: 'number', value: 8 } };
  const conflict = await handler(request(changed));
  assert.equal(conflict.status, 409);
  assert.deepEqual(await conflict.json(), { error: { code: 'conflict' } });
  assert.deepEqual(await repo.getObservation(alpha, value.observations[0]!.record.id), value.observations[0]!.record);
});

test('missing, malformed, empty, oversized and unknown credentials give 401 and write nothing', async (t) => {
  const { handler, repo } = await setup(t);
  for (const header of [null, 'Basic synthetic', 'Bearer', 'Bearer ', `Bearer ${'x'.repeat(1024)}`, `Bearer ${synthetic.unknownCredential}`, 'Bearer synthetic, Bearer other', 'Bearer synthetic value']) {
    const input = request();
    if (header === null) input.headers.delete('Authorization'); else input.headers.set('Authorization', header);
    const response = await handler(input);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: { code: 'unauthenticated' } });
    assert.equal(response.headers.get('WWW-Authenticate'), 'Bearer');
  }
  assert.deepEqual(await repo.listObservations(alpha), []);
  assert.equal(await repo.getCollection(alpha, batch().collection.id), null);
});

test('authenticator faults and forged results give generic 500 without leaking credential or internal errors', async (t) => {
  const { service, repo } = await setup(t);
  for (const fault of [new Error(`synthetic internal path SQL ${synthetic.alphaCredential}`), new IngestionError('unauthenticated')]) {
    const handler = createIngestionHandler({ async authenticate() { throw fault; } }, service);
    const response = await handler(request());
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), { error: { code: 'internal_error' } });
    assert.ok(!body.includes(synthetic.alphaCredential));
  }
  const forged = { ...principal('alpha') } as AuthenticatedPrincipal;
  const response = await createIngestionHandler({ async authenticate() { return forged; } }, service)(request());
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: 'internal_error' } });
  assert.deepEqual(await repo.listObservations(alpha), []);
});

test('authenticated Beta cannot ingest Alpha, discover existing IDs, or reserve Alpha idempotency keys', async (t) => {
  const { handler, repo } = await setup(t);
  const value = batch();
  const before = await handler(request(value, synthetic.betaCredential));
  assert.equal(before.status, 403);
  const denied = await before.text();
  assert.equal(await repo.findCollectionByIdempotency(alpha, sourceContext(value), value.idempotencyKey), null);
  assert.equal((await handler(request(value))).status, 201);
  const after = await handler(request(value, synthetic.betaCredential));
  assert.equal(after.status, 403);
  assert.equal(await after.text(), denied);
  assert.deepEqual(await repo.listObservations(beta), []);
});

test('body tenant identity cannot establish authority', async (t) => {
  const { handler, repo } = await setup(t);
  const betaBody = batch('beta');
  const response = await handler(request(betaBody, synthetic.alphaCredential));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: { code: 'forbidden' } });
  assert.equal(await repo.getCollection(beta, betaBody.collection.id), null);
});

for (const field of ['siteId', 'siteScopeRevisionId', 'providerId', 'providerConnectionId'] as const) {
  test(`Alpha cannot escalate an exact grant by changing ${field} in otherwise consistent evidence`, async (t) => {
    const { handler, repo } = await setup(t);
    const value = batch();
    const ungranted = 'synthetic-ungranted';
    if (field === 'siteId' || field === 'siteScopeRevisionId') {
      value.collection.scope[field] = ungranted;
      value.sources[0]!.record.identity.scope[field] = ungranted;
      value.observations[0]!.record.cohort.context.scope[field] = ungranted;
      value.observations[0]!.record.cohort.context.subject.reference = field === 'siteId' ? ungranted : value.observations[0]!.record.cohort.context.subject.reference;
      value.observations[0]!.record.provenance.source.scope[field] = ungranted;
    } else {
      value.collection[field] = ungranted;
      value.sources[0]!.record.identity[field] = ungranted;
      value.observations[0]!.record.provenance.source[field] = ungranted;
      if (field === 'providerId') value.observations[0]!.record.cohort.context.dimensions.providerId = ungranted;
    }
    const response = await handler(request(value));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: { code: 'forbidden' } });
    assert.equal(await repo.getCollection(alpha, value.collection.id), null);
  });
}

test('registered principals are immutable; cloned/proxied/plain payload authority never reaches persistence', async (t) => {
  const { service, repo } = await setup(t);
  const trusted = principal('alpha');
  assert.throws(() => Object.assign(trusted, { tenantId: 'tenant-beta' }), TypeError);
  assert.throws(() => Object.assign(trusted.grants[0]!.scope, { siteId: 'synthetic-ungranted' }), TypeError);
  for (const forged of [{ ...trusted }, structuredClone(trusted), new Proxy(trusted, {}), { tenantId: 'tenant-alpha', grants: trusted.grants }, null]) {
    await assert.rejects(service.ingest(forged as AuthenticatedPrincipal, batch().idempotencyKey, content()),
      (error: unknown) => error instanceof IngestionError && error.code === 'unauthenticated');
  }
  assert.deepEqual(await repo.listObservations(alpha), []);
  const ungranted = issueAuthenticatedPrincipal({ principalId: trusted.principalId, tenantId: 'tenant-alpha', grants: [] });
  await assert.rejects(service.ingest(ungranted, batch().idempotencyKey, content()),
    (error: unknown) => error instanceof IngestionError && error.code === 'forbidden');
  for (const grant of [{ ...sourceContext(batch()), providerId: '*' }, { ...sourceContext(batch()), scope: batch('beta').collection.scope }]) {
    assert.throws(() => issueAuthenticatedPrincipal({ principalId: 'synthetic-principal', tenantId: 'tenant-alpha', grants: [grant] }));
  }
});

test('Alpha and Beta ingest identical internal/external IDs and idempotency keys independently', async (t) => {
  const { handler, repo } = await setup(t);
  for (const [tenant, credential, context] of [['alpha', synthetic.alphaCredential, alpha], ['beta', synthetic.betaCredential, beta]] as const) {
    const value = batch(tenant);
    assert.equal((await handler(request(value, credential))).status, 201);
    assert.equal((await handler(request(value, credential))).status, 200);
    assert.deepEqual((await repo.findSource(context, sourceContext(value), value.collection.id, 'synthetic-external-record-001'))?.record, value.sources[0]!.record);
  }
});

test('zero and each missing-data state survive authenticated intake unchanged', async (t) => {
  const { handler, repo } = await setup(t);
  const value = batch();
  for (const state of ['unknown', 'unavailable', 'not_collected', 'not_applicable'] as const) {
    const observation = structuredClone(value.observations[0]!);
    observation.record.id = `synthetic-ingested-${state}`;
    observation.record.value = { state, reason: `Synthetic ${state} metric` };
    value.observations.push(observation);
  }
  assert.equal((await handler(request(value))).status, 201);
  for (const item of value.observations) assert.deepEqual((await repo.getObservation(alpha, item.record.id))?.value, item.record.value);
});

test('prompt-injection-like evidence remains inert text and is never echoed by the HTTP response', async (t) => {
  const { handler, repo } = await setup(t);
  const value = batch();
  value.observations[0]!.record.cohort.context.metric.valueType = 'text';
  value.observations[0]!.record.value = { state: 'observed', value: { type: 'text', value: synthetic.inertEvidence } };
  const response = await handler(request(value));
  assert.equal(response.status, 201);
  const text = await response.text();
  assert.ok(!text.includes(synthetic.inertEvidence));
  assert.deepEqual(JSON.parse(text), { collectionId: value.collection.id, replayed: false, complete: true });
  assert.deepEqual((await repo.getObservation(alpha, value.observations[0]!.record.id))?.value, value.observations[0]!.record.value);
});

test('unknown authority/raw-payload fields and invalid canonical or cross-record evidence reject before writes', async (t) => {
  const { handler, repo } = await setup(t);
  for (const key of ['tenantId', 'grants', 'principalId', 'credential', 'rawPayload', 'callbackUrl', 'idempotencyKey']) {
    const response = await handler(new Request(request(), { body: JSON.stringify({ ...content(), [key]: 'synthetic-disallowed' }) }));
    assert.equal(response.status, 400, key);
  }
  const invalid = [
    (value: ReturnType<typeof batch>) => { Object.assign(value.collection, { schemaVersion: '2.0' }); },
    (value: ReturnType<typeof batch>) => { Object.assign(value.observations[0]!.record.provenance, { schemaVersion: '2.0' }); },
    (value: ReturnType<typeof batch>) => { value.sources[0]!.record.identity.scope.siteId = 'synthetic-other-site'; },
    (value: ReturnType<typeof batch>) => { value.observations[0]!.record.provenance.source.scope.tenantId = 'tenant-beta'; },
    (value: ReturnType<typeof batch>) => { Object.assign(value.sources[0]!.record, { rawPayload: 'synthetic-disallowed' }); },
    (value: ReturnType<typeof batch>) => { delete value.collection.providerConnectionId; },
  ];
  for (const mutate of invalid) {
    const value = batch();
    mutate(value);
    const response = await handler(request(value));
    assert.equal(response.status, 422);
    assert.deepEqual(await response.json(), { error: { code: 'invalid_evidence' } });
  }
  assert.equal(await repo.getCollection(alpha, batch().collection.id), null);
  assert.equal((await handler(request())).status, 201);
});

test('a failed child SQL transaction gives generic 500 and releases every row and idempotency reservation', async (t) => {
  const { handler, repo } = await setup(t);
  const value = batch();
  value.observations.push(structuredClone(value.observations[0]!));
  const response = await handler(request(value));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: 'internal_error' } });
  assert.equal(await repo.getCollection(alpha, value.collection.id), null);
  value.observations.pop();
  assert.equal((await handler(request(value))).status, 201);
});

test('status mapping uses typed persistence conflicts, never arbitrary error.message strings', async (t) => {
  const { repo, auth } = await setup(t);
  for (const [error, status, code] of [
    [new IdempotencyConflictError(), 409, 'conflict'],
    [new PartSequenceConflictError(), 409, 'conflict'],
    [new Error('Idempotency conflict: request differs'), 500, 'internal_error'],
    [new Error(`SQLITE_CONSTRAINT ${synthetic.alphaCredential}`), 500, 'internal_error'],
  ] as const) {
    const handler = createIngestionHandler(auth, createIngestionService(failureRepository(repo, error)));
    const response = await handler(request());
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code } });
  }
});

test('credentials and grants are absent from persisted tables and responses', async (t) => {
  const database = temporaryDatabase(t);
  const { repo, handler } = await setup(t, database);
  for (const credential of [synthetic.alphaCredential, synthetic.betaCredential, synthetic.unknownCredential]) {
    const response = await handler(request(batch(credential === synthetic.betaCredential ? 'beta' : 'alpha'), credential));
    const text = await response.text();
    assert.ok(text.length < 256);
    for (const secret of [synthetic.alphaCredential, synthetic.betaCredential, synthetic.unknownCredential, 'synthetic-principal-alpha', '"grants"']) assert.ok(!text.includes(secret));
  }
  const db = new DatabaseSync(database.path);
  try {
    for (const table of ['tenants', 'sites', 'site_scopes', 'provider_connections', 'collections', 'collection_parts', 'source_records', 'observations', 'schema_migrations']) {
      const stored = JSON.stringify(db.prepare(`SELECT * FROM ${table}`).all());
      for (const credential of [synthetic.alphaCredential, synthetic.betaCredential, synthetic.unknownCredential]) assert.ok(!stored.includes(credential), table);
      assert.ok(!stored.includes('synthetic-principal-'), table);
      assert.ok(!stored.includes('"grants"'), table);
    }
  } finally { db.close(); }
  assert.equal((await repo.listObservations(alpha)).length, 1);
  assert.equal((await repo.listObservations(beta)).length, 1);
});
