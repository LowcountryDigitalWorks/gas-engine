import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { migrateLocalDatabase } from '../../src/persistence/migrations.js';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import { canonicalJson, hashCanonicalJson } from '../../src/lib/canonical-json.js';
import { alpha, batch, repository, temporaryDatabase } from './helpers.js';

test('fresh migrations are deterministic, repeatable, strict, transactional and limited to eight tenant tables plus history', () => {
  const first = new DatabaseSync(':memory:');
  const second = new DatabaseSync(':memory:');
  try {
    for (const db of [first, second]) {
      migrateLocalDatabase(db);
      migrateLocalDatabase(db);
      assert.equal(db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys'], 1);
      assert.equal(db.prepare('PRAGMA user_version').get()?.['user_version'], 1);
      assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()?.['count'], 1);
      const tables = db.prepare("PRAGMA table_list").all().filter((r) => !String(r['name']).startsWith('sqlite_'));
      assert.equal(tables.length, 9);
      assert.ok(tables.every((r) => r['strict'] === 1));
      for (const table of ['tenants', 'sites', 'site_scopes', 'provider_connections', 'collections', 'collection_parts', 'source_records', 'observations']) {
        assert.ok(db.prepare(`PRAGMA table_info(${table})`).all().some((r) => r['name'] === 'tenant_id' && r['notnull'] === 1));
      }
    }
    const schema = "SELECT type, name, sql FROM sqlite_schema ORDER BY type, name";
    assert.deepEqual(first.prepare(schema).all(), second.prepare(schema).all());
    assert.deepEqual(first.prepare('SELECT * FROM schema_migrations').all(), second.prepare('SELECT * FROM schema_migrations').all());
  } finally { first.close(); second.close(); }
});

test('unknown, future, incomplete and altered migration histories fail clearly without changing existing data', () => {
  for (const mutation of [
    'PRAGMA user_version = 2',
    "UPDATE schema_migrations SET checksum = 'synthetic-tamper'",
    "INSERT INTO schema_migrations (version, checksum) VALUES (2, 'synthetic-future')",
    'DROP TABLE observations',
  ]) {
    const db = new DatabaseSync(':memory:');
    try {
      migrateLocalDatabase(db);
      db.exec("INSERT INTO tenants (tenant_id) VALUES ('tenant-alpha')");
      db.exec(mutation);
      assert.throws(() => migrateLocalDatabase(db), /migration failed/);
      assert.equal(db.prepare('SELECT tenant_id FROM tenants').get()?.['tenant_id'], 'tenant-alpha');
      assert.equal(db.isTransaction, false);
    } finally { db.close(); }
  }
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE unknown_data (id TEXT)');
    assert.throws(() => migrateLocalDatabase(db), /migration failed/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE type = 'table'").get()?.['count'], 1);
  } finally { db.close(); }
});

test('composite foreign keys reject cross-tenant children at every ownership edge even when repository checks are bypassed', async (t) => {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const a = batch('alpha', '-alpha-only');
  await repo.persistCollection(alpha, a);
  const db = database.track(new DatabaseSync(database.path, { enableForeignKeyConstraints: true }));
  try {
    assert.throws(() => db.exec("INSERT INTO sites (tenant_id, site_id, label) VALUES ('tenant-missing', 'site-alpha', 'Synthetic')"), /FOREIGN KEY constraint/);
    assert.throws(() => db.exec("INSERT INTO site_scopes (tenant_id, site_id, scope_revision_id) VALUES ('tenant-beta', 'site-alpha', 'synthetic-scope-alpha-r1')"), /FOREIGN KEY constraint/);
    assert.throws(() => db.exec("INSERT INTO provider_connections (tenant_id, id, site_id, scope_revision_id, provider_id) VALUES ('tenant-beta', 'synthetic-forged', 'site-alpha', 'synthetic-scope-alpha-r1', 'synthetic-provider')"), /FOREIGN KEY constraint/);
    const c = structuredClone(a.collection);
    c.scope.tenantId = 'tenant-beta';
    assert.throws(() => db.prepare(`INSERT INTO collections (tenant_id, id, site_id, scope_revision_id, connection_id, provider_id,
      idempotency_key, part_count, received_count, contract_version, payload, payload_hash)
      SELECT ?, id, site_id, scope_revision_id, connection_id, provider_id,
      idempotency_key, part_count, received_count, contract_version, ?, ? FROM collections WHERE tenant_id = ? AND id = ?`)
      .run('tenant-beta', canonicalJson(c), hashCanonicalJson(c), 'tenant-alpha', c.id), /FOREIGN KEY constraint/);
    const s = structuredClone(a.sources[0]!.record);
    s.identity.scope.tenantId = 'tenant-beta';
    assert.throws(() => db.prepare(`INSERT INTO source_records (tenant_id, id, collection_id, part_index, site_id, scope_revision_id, connection_id, provider_id,
      external_id, identity_hash, contract_version, payload, payload_hash)
      SELECT ?, id, collection_id, part_index, site_id, scope_revision_id, connection_id, provider_id,
      external_id, identity_hash, contract_version, ?, ? FROM source_records WHERE tenant_id = ? AND id = ?`)
      .run('tenant-beta', canonicalJson(s), hashCanonicalJson(s), 'tenant-alpha', a.sources[0]!.id), /FOREIGN KEY constraint/);
    const o = structuredClone(a.observations[0]!.record);
    o.cohort.context.scope.tenantId = 'tenant-beta';
    o.provenance.source.scope.tenantId = 'tenant-beta';
    assert.throws(() => db.prepare(`INSERT INTO observations (tenant_id, id, source_id, collection_id, site_id, scope_revision_id, connection_id,
      provider_id, contract_version, payload, payload_hash)
      SELECT ?, id, source_id, collection_id, site_id, scope_revision_id, connection_id,
      provider_id, contract_version, ?, ? FROM observations WHERE tenant_id = ? AND id = ?`)
      .run('tenant-beta', canonicalJson(o), hashCanonicalJson(o), 'tenant-alpha', o.id), /FOREIGN KEY constraint/);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { db.close(); }
  assert.deepEqual(await repo.getObservation(alpha, a.observations[0]!.record.id), a.observations[0]!.record);
});

test('composite foreign keys also bind site, scope revision, connection, provider and run within one tenant', async (t) => {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const a = batch();
  await repo.persistCollection(alpha, a);
  const db = database.track(new DatabaseSync(database.path, { enableForeignKeyConstraints: true }));
  try {
    for (const [column, jsonPath] of [
      ['site_id', '$.scope.siteId'], ['scope_revision_id', '$.scope.siteScopeRevisionId'],
      ['connection_id', '$.providerConnectionId'], ['provider_id', '$.providerId'],
    ]) {
      assert.throws(() => db.prepare(`INSERT INTO collections (tenant_id, id, site_id, scope_revision_id, connection_id, provider_id,
        idempotency_key, part_count, received_count, contract_version, payload, payload_hash)
        SELECT tenant_id, 'synthetic-forged-run',
        ${column === 'site_id' ? '?' : 'site_id'}, ${column === 'scope_revision_id' ? '?' : 'scope_revision_id'},
        ${column === 'connection_id' ? '?' : 'connection_id'}, ${column === 'provider_id' ? '?' : 'provider_id'},
        'synthetic-forged-key', part_count, received_count, contract_version,
        json_set(payload, '$.id', 'synthetic-forged-run', ?, ?), payload_hash
        FROM collections WHERE tenant_id = ? AND id = ?`)
        .run('synthetic-unowned', jsonPath!, 'synthetic-unowned', 'tenant-alpha', a.collection.id), /FOREIGN KEY constraint/);
    }
    assert.throws(() => db.prepare(`INSERT INTO source_records (tenant_id, id, collection_id, part_index, site_id, scope_revision_id, connection_id, provider_id,
      external_id, identity_hash, contract_version, payload, payload_hash)
      SELECT tenant_id, 'synthetic-forged-source', 'synthetic-other-run', part_index,
      site_id, scope_revision_id, connection_id, provider_id, external_id, identity_hash, contract_version, payload, payload_hash
      FROM source_records WHERE tenant_id = ? AND id = ?`).run('tenant-alpha', a.sources[0]!.id), /FOREIGN KEY constraint/);
    assert.throws(() => db.prepare(`INSERT INTO observations (tenant_id, id, source_id, collection_id, site_id, scope_revision_id, connection_id,
      provider_id, contract_version, payload, payload_hash)
      SELECT tenant_id, 'synthetic-forged-observation', 'synthetic-other-source', collection_id,
      site_id, scope_revision_id, connection_id, provider_id, contract_version, json_set(payload, '$.id', 'synthetic-forged-observation'), payload_hash
      FROM observations WHERE tenant_id = ? AND id = ?`).run('tenant-alpha', a.observations[0]!.record.id), /FOREIGN KEY constraint/);
  } finally { db.close(); }
});

test('failed child transaction remains rolled back after a file-backed restart', async (t) => {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const a = batch();
  a.observations.push(structuredClone(a.observations[0]!));
  await assert.rejects(repo.persistCollection(alpha, a), /UNIQUE constraint/);
  repo.close();
  const reopened = database.track(new LocalEvidenceRepository(database.path));
  try {
    assert.equal(await reopened.getCollection(alpha, a.collection.id), null);
    assert.equal(await reopened.getSource(alpha, a.sources[0]!.id), null);
    assert.deepEqual(await reopened.listObservations(alpha), []);
    a.observations.pop();
    assert.equal((await reopened.persistCollection(alpha, a)).replayed, false);
  } finally { reopened.close(); }
});
