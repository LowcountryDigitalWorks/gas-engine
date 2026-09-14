import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { alpha, batch, repository, temporaryDatabase } from './helpers.js';

const busy = /SQLITE_BUSY|database is locked/i;

test('deferred read transactions leave an independent writer free; write intent does not', async (t) => {
  const database = temporaryDatabase(t);
  await repository(t, database);
  const reader = database.track(new DatabaseSync(database.path, { timeout: 50 }));
  const writer = database.track(new DatabaseSync(database.path, { timeout: 50 }));

  reader.exec('BEGIN DEFERRED');
  reader.prepare('SELECT COUNT(*) AS count FROM tenants').get();
  assert.doesNotThrow(() => writer.exec('BEGIN IMMEDIATE'), 'a read snapshot must not hold write intent');
  writer.exec('ROLLBACK');
  reader.exec('COMMIT');

  reader.exec('BEGIN IMMEDIATE');
  assert.throws(() => writer.exec('BEGIN IMMEDIATE'), busy, 'write intent is exclusive by design');
  reader.exec('ROLLBACK');
});

test('a writer holding write intent does not block joined read-only evidence snapshots', async (t) => {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const value = batch();
  await repo.persistCollection(alpha, value);

  const writer = database.track(new DatabaseSync(database.path, { enableForeignKeyConstraints: true, timeout: 50 }));
  writer.exec('BEGIN IMMEDIATE');
  writer.prepare('UPDATE sites SET label = ? WHERE tenant_id = ? AND site_id = ?')
    .run('Synthetic concurrent writer', 'tenant-alpha', 'site-alpha');

  // Under write-intent read semantics every one of these would wait out the busy
  // timeout and fail while an unrelated writer is mid-transaction.
  assert.ok(await repo.getObservationEvidence(alpha, value.observations[0]!.record.id));
  assert.equal((await repo.getCollectionProgress(alpha, value.collection.id))?.complete, true);
  assert.ok(await repo.getCollection(alpha, value.collection.id));
  assert.equal((await repo.listObservations(alpha)).length, 1);

  writer.exec('ROLLBACK');
  assert.equal((await repo.getSite(alpha, 'site-alpha'))?.label, 'Synthetic alpha');
});

test('evidence writes still declare write intent, serialize, and recover once the lock clears', async (t) => {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const first = batch('alpha', '-first');
  const second = batch('alpha', '-second');
  await repo.persistCollection(alpha, first);

  const writer = database.track(new DatabaseSync(database.path, { enableForeignKeyConstraints: true, timeout: 50 }));
  writer.exec('BEGIN IMMEDIATE');
  await assert.rejects(repo.persistCollection(alpha, second), busy);
  await assert.rejects(repo.deleteCollection(alpha, first.collection.id), busy);
  writer.exec('ROLLBACK');

  assert.equal((await repo.persistCollection(alpha, second)).replayed, false);
  assert.equal(await repo.deleteCollection(alpha, first.collection.id), true);
  assert.equal((await repo.listObservations(alpha)).length, 1);
});

test('a rolled-back read transaction releases its snapshot and reports the underlying failure', async (t) => {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const value = batch();
  await repo.persistCollection(alpha, value);

  const tamper = database.track(new DatabaseSync(database.path));
  tamper.prepare('UPDATE observations SET payload_hash = ? WHERE tenant_id = ? AND id = ?')
    .run('0'.repeat(64), 'tenant-alpha', value.observations[0]!.record.id);
  tamper.close();

  await assert.rejects(repo.getObservationEvidence(alpha, value.observations[0]!.record.id), /integrity mismatch/);
  // The failed read must have rolled back rather than leaking an open transaction.
  assert.equal((await repo.getCollectionProgress(alpha, value.collection.id))?.persistedSources, 1);
  assert.equal((await repo.persistCollection(alpha, batch('alpha', '-after-failed-read'))).replayed, false);
});
