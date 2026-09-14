import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIngestionHandler } from '../../src/ingestion/http.js';
import { createIngestionService } from '../../src/ingestion/service.js';
import { alpha, batch, partedBatches, sourceContext } from '../persistence/helpers.js';
import { content, request, setup, synthetic } from './helpers.js';

function sourceOnlyParts(total: number, perPart: number, suffix: string) {
  const parts = partedBatches(total, perPart, suffix);
  for (const part of parts) part.observations = [];
  return parts;
}

test('ordered multipart ingestion reports persisted progress, not canonical completeness', async (t) => {
  const { handler, repo } = await setup(t);
  const [first, final] = sourceOnlyParts(17, 16, '-http-progress');
  assert.ok(first && final);
  let response = await handler(request(first));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { collectionId: first.collection.id, replayed: false, complete: false });
  assert.deepEqual(await repo.getCollectionProgress(alpha, first.collection.id), {
    receivedCount: 17, persistedSources: 16, parts: 2, partsPersisted: 1, complete: false,
  });

  response = await handler(request(first));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { collectionId: first.collection.id, replayed: true, complete: false });

  response = await handler(request(final));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { collectionId: first.collection.id, replayed: false, complete: true });
  assert.deepEqual(await repo.getCollectionProgress(alpha, first.collection.id), {
    receivedCount: 17, persistedSources: 17, parts: 2, partsPersisted: 2, complete: true,
  });

  response = await handler(request(first));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { collectionId: first.collection.id, replayed: true, complete: true });
});

test('changed part replay and changed declared part count return typed 409 conflicts', async (t) => {
  const { handler } = await setup(t);
  const [first, second] = sourceOnlyParts(17, 16, '-http-conflict');
  assert.ok(first && second);
  assert.equal((await handler(request(first))).status, 201);

  const changedReplay = structuredClone(first);
  changedReplay.sources.reverse();
  const replayConflict = await handler(request(changedReplay));
  assert.equal(replayConflict.status, 409);
  assert.deepEqual(await replayConflict.json(), { error: { code: 'conflict' } });

  const changedParts = structuredClone(second);
  changedParts.parts = 3;
  const partCountConflict = await handler(request(changedParts));
  assert.equal(partCountConflict.status, 409);
  assert.deepEqual(await partCountConflict.json(), { error: { code: 'conflict' } });
});

test('out-of-order opening and gaps return stable 409 without consuming the missing part', async (t) => {
  const { handler, repo } = await setup(t);
  const [first, second, third] = sourceOnlyParts(33, 16, '-http-order');
  assert.ok(first && second && third);
  assert.equal((await handler(request(second))).status, 409);
  assert.equal(await repo.findCollectionByIdempotency(alpha, sourceContext(first), first.idempotencyKey), null);

  assert.equal((await handler(request(first))).status, 201);
  assert.equal((await handler(request(third))).status, 409);
  assert.deepEqual(await repo.getCollectionProgress(alpha, first.collection.id), {
    receivedCount: 33, persistedSources: 16, parts: 3, partsPersisted: 1, complete: false,
  });
  assert.equal((await handler(request(second))).status, 201);
  assert.equal((await handler(request(third))).status, 201);
  assert.equal((await repo.getCollectionProgress(alpha, first.collection.id))?.complete, true);
});

test('declared capacity and per-part item bounds fail before persistence', async (t) => {
  const { service, repo } = await setup(t);
  const impossible = sourceOnlyParts(17, 16, '-capacity')[0]!;
  impossible.parts = 1;
  await assert.rejects(service.ingest((await import('./helpers.js')).principal('alpha'), impossible.idempotencyKey, content(impossible)),
    (error: unknown) => error instanceof Error && error.message === 'invalid_evidence');

  const tooManySources = sourceOnlyParts(17, 17, '-source-limit')[0]!;
  await assert.rejects(service.ingest((await import('./helpers.js')).principal('alpha'), tooManySources.idempotencyKey, content(tooManySources)),
    (error: unknown) => error instanceof Error && error.message === 'invalid_evidence');

  const tooManyObservations = batch('alpha', '-observation-limit');
  const template = structuredClone(tooManyObservations.observations[0]!);
  tooManyObservations.observations = Array.from({ length: 33 }, (_, index) => {
    const item = structuredClone(template);
    item.record.id = `synthetic-observation-limit-${index}`;
    return item;
  });
  await assert.rejects(service.ingest((await import('./helpers.js')).principal('alpha'), tooManyObservations.idempotencyKey, content(tooManyObservations)),
    (error: unknown) => error instanceof Error && error.message === 'invalid_evidence');
  assert.equal(await repo.getCollection(alpha, impossible.collection.id), null);
});

test('observations may reference only a source carried in the same persistence part', async (t) => {
  const { handler, repo } = await setup(t);
  const [first, second] = partedBatches(2, 1, '-same-part');
  assert.ok(first && second);
  assert.equal((await handler(request(first))).status, 201);
  second.observations[0]!.sourceId = first.sources[0]!.id;
  const response = await handler(request(second));
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: { code: 'invalid_evidence' } });
  assert.deepEqual(await repo.getCollectionProgress(alpha, first.collection.id), {
    receivedCount: 2, persistedSources: 1, parts: 2, partsPersisted: 1, complete: false,
  });
});

test('failure of a later part rolls back only that part and leaves the earlier part committed', async (t) => {
  const { handler, repo } = await setup(t);
  const [first, second] = partedBatches(2, 1, '-part-atomicity');
  assert.ok(first && second);
  assert.equal((await handler(request(first))).status, 201);
  const broken = structuredClone(second);
  broken.observations[0]!.record.id = first.observations[0]!.record.id;
  const failed = await handler(request(broken));
  assert.equal(failed.status, 500);
  assert.deepEqual(await repo.getCollectionProgress(alpha, first.collection.id), {
    receivedCount: 2, persistedSources: 1, parts: 2, partsPersisted: 1, complete: false,
  });
  assert.deepEqual(await repo.getSource(alpha, first.sources[0]!.id), {
    id: first.sources[0]!.id, collectionId: first.collection.id, record: first.sources[0]!.record,
  });
  assert.equal((await handler(request(second))).status, 201);
  assert.equal((await repo.getCollectionProgress(alpha, first.collection.id))?.complete, true);
});

test('unauthorized multipart intake reserves and writes nothing', async (t) => {
  const { handler, repo } = await setup(t);
  const first = sourceOnlyParts(17, 16, '-unauthorized-part')[0]!;
  const response = await handler(request(first, synthetic.betaCredential));
  assert.equal(response.status, 403);
  assert.equal(await repo.findCollectionByIdempotency(alpha, sourceContext(first), first.idempotencyKey), null);
  assert.equal(await repo.getCollection(alpha, first.collection.id), null);
});

test('application fails closed when persistence result and queried progress disagree', async (t) => {
  const { repo, auth } = await setup(t);
  const mismatched = new Proxy(repo, { get(target, key) {
    if (key === 'getCollectionProgress') return async (...args: Parameters<typeof repo.getCollectionProgress>) => {
      const progress = await repo.getCollectionProgress(...args);
      return progress ? { ...progress, complete: !progress.complete } : null;
    };
    const value = Reflect.get(target, key) as unknown;
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const handler = createIngestionHandler(auth, createIngestionService(mismatched));
  const response = await handler(request(batch('alpha', '-progress-mismatch')));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: { code: 'internal_error' } });
});
