import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import { alpha, batch, partedBatches, repository, setCompleteness, sourceContext, temporaryDatabase } from './helpers.js';

test('a collection may declare more received evidence than one bounded part can carry', async (t) => {
  const repo = await repository(t);
  const parts = partedBatches(40, 16);
  assert.equal(parts.length, 3);
  assert.equal(parts[0]!.collection.completeness.receivedCount, 40);
  assert.deepEqual(parts.map((part) => part.sources.length), [16, 16, 8]);

  for (const [index, part] of parts.entries()) {
    const result = await repo.persistCollection(alpha, part);
    assert.deepEqual(result, {
      collectionId: part.collection.id, replayed: false, complete: index === parts.length - 1,
    }, `part ${part.part}`);
  }
  const id = parts[0]!.collection.id;
  assert.deepEqual(await repo.getCollectionProgress(alpha, id), {
    receivedCount: 40, persistedSources: 40, parts: 3, partsPersisted: 3, complete: true,
  });
  assert.equal((await repo.getCollection(alpha, id))?.completeness.receivedCount, 40);
  assert.equal((await repo.listObservations(alpha, { collectionId: id })).length, 40);
  const evidence = await repo.getObservationEvidence(alpha, parts[2]!.observations[0]!.record.id);
  assert.equal(evidence?.collection.id, id);
  assert.equal(evidence?.source.record.identity.sourceRecordId, parts[2]!.sources[0]!.record.identity.sourceRecordId);
});

test('parts arrive in order, keep one identical collection, and replay deterministically', async (t) => {
  const repo = await repository(t);
  const parts = partedBatches(20, 16, '-ordered');
  assert.equal(parts.length, 2);

  await assert.rejects(repo.persistCollection(alpha, parts[1]!), /opened by its first part/);
  assert.equal(await repo.getCollection(alpha, parts[0]!.collection.id), null);

  await repo.persistCollection(alpha, parts[0]!);
  const gap = { ...structuredClone(parts[1]!), part: 2, parts: 3 };
  await assert.rejects(repo.persistCollection(alpha, gap), /Idempotency conflict/);

  const changed = structuredClone(parts[1]!);
  changed.collection.id = `${parts[1]!.collection.id}-other`;
  await assert.rejects(repo.persistCollection(alpha, changed), /Idempotency conflict/);

  assert.equal((await repo.persistCollection(alpha, structuredClone(parts[0]!))).replayed, true);
  assert.equal((await repo.persistCollection(alpha, parts[1]!)).complete, true);
  assert.equal((await repo.persistCollection(alpha, structuredClone(parts[1]!))).replayed, true);

  const differentContent = structuredClone(parts[1]!);
  differentContent.observations[0]!.record.value = { state: 'observed', value: { type: 'number', value: 11 } };
  await assert.rejects(repo.persistCollection(alpha, differentContent), /Idempotency conflict/);
  assert.deepEqual(await repo.getCollectionProgress(alpha, parts[0]!.collection.id), {
    receivedCount: 20, persistedSources: 20, parts: 2, partsPersisted: 2, complete: true,
  });
});

test('a gap in the part sequence is rejected and leaves the collection incomplete', async (t) => {
  const repo = await repository(t);
  const parts = partedBatches(48, 16, '-gap');
  assert.equal(parts.length, 3);
  await repo.persistCollection(alpha, parts[0]!);
  await assert.rejects(repo.persistCollection(alpha, parts[2]!), /in order without gaps/);
  assert.deepEqual(await repo.getCollectionProgress(alpha, parts[0]!.collection.id), {
    receivedCount: 48, persistedSources: 16, parts: 3, partsPersisted: 1, complete: false,
  });
  assert.equal((await repo.listObservations(alpha)).length, 16);
  await repo.persistCollection(alpha, parts[1]!);
  assert.equal((await repo.persistCollection(alpha, parts[2]!)).complete, true);
});

test('receivedCount is reconciled exactly: shortfalls, overruns and unrepresentable counts reject', async (t) => {
  const repo = await repository(t);

  const short = partedBatches(32, 16, '-short');
  short[1]!.sources.pop();
  short[1]!.observations.pop();
  await repo.persistCollection(alpha, short[0]!);
  await assert.rejects(repo.persistCollection(alpha, short[1]!), /final part must account for every source/);
  assert.deepEqual(await repo.getCollectionProgress(alpha, short[0]!.collection.id), {
    receivedCount: 32, persistedSources: 16, parts: 2, partsPersisted: 1, complete: false,
  });

  const over = partedBatches(17, 16, '-over');
  setCompleteness(over, { state: 'complete', expectedCount: 8, receivedCount: 8 });
  await assert.rejects(repo.persistCollection(alpha, over[0]!), /exceed the collection receivedCount/);
  assert.equal(await repo.getCollection(alpha, over[0]!.collection.id), null);

  const unrepresentable = [batch('alpha', '-unrepresentable')];
  setCompleteness(unrepresentable, { state: 'complete', expectedCount: 17, receivedCount: 17 });
  await assert.rejects(repo.persistCollection(alpha, unrepresentable[0]!), /declared parts can carry/);

  const single = [batch('alpha', '-single')];
  setCompleteness(single, { state: 'complete', expectedCount: 2, receivedCount: 2 });
  await assert.rejects(repo.persistCollection(alpha, single[0]!), /final part must account for every source/);
  assert.equal(await repo.getCollection(alpha, single[0]!.collection.id), null);
});

test('part shape, item-count and 64 KiB canonical request bounds are all explicit', async (t) => {
  const repo = await repository(t);
  const oversized = partedBatches(16, 16, '-oversized');
  for (let extra = 0; extra < 16; extra++) {
    const observation = structuredClone(oversized[0]!.observations[0]!);
    observation.record.id = `synthetic-observation-oversized-${extra}`;
    oversized[0]!.observations.push(observation);
  }
  assert.equal(oversized[0]!.observations.length, 32);
  await assert.rejects(repo.persistCollection(alpha, oversized[0]!), /exceeds the byte limit/);

  const tooManySources = partedBatches(17, 17, '-too-many-sources');
  assert.equal(tooManySources[0]!.sources.length, 17);
  await assert.rejects(repo.persistCollection(alpha, tooManySources[0]!));

  for (const invalid of [
    { part: 0, parts: 1 }, { part: 1, parts: 0 }, { part: 2, parts: 1 },
    { part: 65, parts: 65 }, { part: 1.5, parts: 2 },
  ]) {
    const value = { ...batch('alpha', '-shape'), ...invalid };
    await assert.rejects(repo.persistCollection(alpha, value));
  }
  assert.deepEqual(await repo.listObservations(alpha), []);
});

test('completeness states other than complete keep their declared received evidence count', async (t) => {
  const repo = await repository(t);
  const cases = [
    { state: 'partial' as const, receivedCount: 20, extra: { expectedCount: 40, reason: 'Synthetic partial collection' } },
    { state: 'failed' as const, receivedCount: 20, extra: { reason: 'Synthetic failed collection' } },
  ];
  for (const { state, receivedCount, extra } of cases) {
    const parts = partedBatches(receivedCount, 16, `-${state}`);
    setCompleteness(parts, { state, receivedCount, ...extra });
    assert.equal((await repo.persistCollection(alpha, parts[0]!)).complete, false);
    assert.equal((await repo.persistCollection(alpha, parts[1]!)).complete, true);
    const stored = await repo.getCollection(alpha, parts[0]!.collection.id);
    assert.deepEqual(stored?.completeness, { state, receivedCount, ...extra });
  }
  const empty = batch('alpha', '-unavailable-parted');
  empty.sources = [];
  empty.observations = [];
  setCompleteness([empty], { state: 'unavailable', receivedCount: 0, reason: 'Synthetic unavailable collection' });
  assert.equal((await repo.persistCollection(alpha, empty)).complete, true);
  assert.deepEqual(await repo.getCollectionProgress(alpha, empty.collection.id), {
    receivedCount: 0, persistedSources: 0, parts: 1, partsPersisted: 1, complete: true,
  });
});

test('a failed part rolls back only that part, and multi-part evidence survives reopen', async (t) => {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const parts = partedBatches(32, 16, '-durable');
  await repo.persistCollection(alpha, parts[0]!);

  const broken = structuredClone(parts[1]!);
  broken.observations.push(structuredClone(broken.observations[0]!));
  await assert.rejects(repo.persistCollection(alpha, broken), /UNIQUE constraint/);
  assert.deepEqual(await repo.getCollectionProgress(alpha, parts[0]!.collection.id), {
    receivedCount: 32, persistedSources: 16, parts: 2, partsPersisted: 1, complete: false,
  });
  await repo.persistCollection(alpha, parts[1]!);
  repo.close();

  const reopened = database.track(new LocalEvidenceRepository(database.path));
  assert.deepEqual(await reopened.getCollectionProgress(alpha, parts[0]!.collection.id), {
    receivedCount: 32, persistedSources: 32, parts: 2, partsPersisted: 2, complete: true,
  });
  assert.equal((await reopened.persistCollection(alpha, parts[1]!)).replayed, true);
  assert.equal((await reopened.listObservations(alpha, { collectionId: parts[0]!.collection.id })).length, 32);
  assert.deepEqual(await reopened.findCollectionByIdempotency(alpha, sourceContext(parts[0]!), parts[0]!.idempotencyKey), parts[0]!.collection);

  assert.equal(await reopened.deleteCollection(alpha, parts[0]!.collection.id), true);
  assert.equal(await reopened.getCollectionProgress(alpha, parts[0]!.collection.id), null);
  assert.equal((await reopened.persistCollection(alpha, parts[0]!)).replayed, false);
});
