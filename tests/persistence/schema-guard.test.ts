import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import { alpha, batch, repository, temporaryDatabase, type TemporaryDatabase } from './helpers.js';

// Each case is a user-schema change that names alone, `user_version`, the migration
// ledger and `foreign_key_check` all fail to notice.
const tampering: [string, string[]][] = [
  ['extra table column', ['ALTER TABLE sites ADD COLUMN synthetic_extra TEXT']],
  ['renamed expected column', ['ALTER TABLE sites RENAME COLUMN label TO synthetic_caption']],
  ['renamed expected table', ['ALTER TABLE sites RENAME TO synthetic_sites']],
  ['missing expected index', ['DROP INDEX observations_by_site']],
  ['extra index', ['CREATE INDEX synthetic_extra_index ON observations(tenant_id, id)']],
  ['altered expected index', ['DROP INDEX observations_by_site', 'CREATE INDEX observations_by_site ON observations(tenant_id, id)']],
  ['missing review index', ['DROP INDEX recommendation_by_lifecycle']],
  ['unexpected trigger', ['CREATE TRIGGER synthetic_trigger AFTER INSERT ON tenants BEGIN SELECT 1; END']],
  ['unexpected view', ['CREATE VIEW synthetic_view AS SELECT tenant_id FROM tenants']],
  ['unexpected table', ['CREATE TABLE synthetic_extra_table (id TEXT) STRICT']],
];

async function seeded(t: Parameters<typeof repository>[0]): Promise<{ database: TemporaryDatabase; collectionId: string }> {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const value = batch();
  await repo.persistCollection(alpha, value);
  repo.close();
  return { database, collectionId: value.collection.id };
}

test('reopen accepts only a live user schema identical to the expected Release 0.8 storage schema', async (t) => {
  for (const [name, statements] of tampering) {
    const { database } = await seeded(t);
    const db = database.track(new DatabaseSync(database.path));
    for (const statement of statements) db.exec(statement);
    assert.equal(db.prepare('PRAGMA user_version').get()?.['user_version'], 2, name);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [], name);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()?.['count'], 2, name);
    db.close();

    assert.throws(() => new LocalEvidenceRepository(database.path), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /migration failed/);
      assert.match(String((error as { cause?: unknown }).cause), /user schema differs/);
      return true;
    }, name);

    const survivor = database.track(new DatabaseSync(database.path));
    assert.equal(survivor.prepare('SELECT COUNT(*) AS count FROM tenants').get()?.['count'], 2, `${name}: tenant data must survive a rejected reopen`);
    survivor.close();
  }
});

test('the positional-insert hazard still fails closed at reopen instead of at the first write', async (t) => {
  const { database, collectionId } = await seeded(t);
  const db = database.track(new DatabaseSync(database.path));
  db.exec('ALTER TABLE sites ADD COLUMN extra TEXT');
  db.close();
  assert.throws(() => new LocalEvidenceRepository(database.path), /migration failed/);

  const repaired = database.track(new DatabaseSync(database.path));
  repaired.exec('ALTER TABLE sites DROP COLUMN extra');
  repaired.close();
  const reopened = database.track(new LocalEvidenceRepository(database.path));
  assert.ok(await reopened.getCollection(alpha, collectionId));
  await reopened.createSite(alpha, { id: 'synthetic-site-after-repair', label: 'Synthetic repaired' });
  assert.equal((await reopened.getSite(alpha, 'synthetic-site-after-repair'))?.label, 'Synthetic repaired');
});

test('an untouched Release 0.8 file reopens, and independently migrated databases agree', async (t) => {
  const { database, collectionId } = await seeded(t);
  const reopened = database.track(new LocalEvidenceRepository(database.path));
  assert.ok(await reopened.getCollection(alpha, collectionId));
  reopened.close();
  const fresh = database.track(new LocalEvidenceRepository(':memory:'));
  assert.ok(fresh);
  assert.doesNotThrow(() => database.track(new LocalEvidenceRepository(database.path)).close());
});
