import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';

// Migration numbers describe storage layout, not a new evidence contract version.
const historyTable = 'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL) STRICT';
const migration = `
CREATE TABLE tenants (
  tenant_id TEXT PRIMARY KEY NOT NULL
) STRICT;
CREATE TABLE sites (
  tenant_id TEXT NOT NULL, site_id TEXT NOT NULL, label TEXT NOT NULL,
  PRIMARY KEY (tenant_id, site_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
) STRICT;
CREATE TABLE site_scopes (
  tenant_id TEXT NOT NULL, site_id TEXT NOT NULL, scope_revision_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, site_id, scope_revision_id),
  FOREIGN KEY (tenant_id, site_id) REFERENCES sites(tenant_id, site_id)
) STRICT;
CREATE TABLE provider_connections (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL, site_id TEXT NOT NULL,
  scope_revision_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, id, site_id, scope_revision_id, provider_id),
  FOREIGN KEY (tenant_id, site_id, scope_revision_id)
    REFERENCES site_scopes(tenant_id, site_id, scope_revision_id)
) STRICT;
CREATE TABLE collections (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL, site_id TEXT NOT NULL,
  scope_revision_id TEXT NOT NULL, connection_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  part_count INTEGER NOT NULL CHECK (part_count BETWEEN 1 AND 64),
  received_count INTEGER NOT NULL CHECK (received_count >= 0 AND received_count <= part_count * 16),
  contract_version TEXT NOT NULL CHECK (contract_version = '1.0'),
  payload TEXT NOT NULL CHECK (json_valid(payload) AND length(CAST(payload AS BLOB)) <= 65536),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, site_id, scope_revision_id, provider_id, connection_id, idempotency_key),
  UNIQUE (tenant_id, id, site_id, scope_revision_id, connection_id, provider_id),
  FOREIGN KEY (tenant_id, connection_id, site_id, scope_revision_id, provider_id)
    REFERENCES provider_connections(tenant_id, id, site_id, scope_revision_id, provider_id),
  CHECK (json_extract(payload, '$.schemaVersion') IS contract_version),
  CHECK (json_extract(payload, '$.kind') IS 'collection'),
  CHECK (json_extract(payload, '$.id') IS id),
  CHECK (json_extract(payload, '$.scope.tenantId') IS tenant_id),
  CHECK (json_extract(payload, '$.scope.siteId') IS site_id),
  CHECK (json_extract(payload, '$.scope.siteScopeRevisionId') IS scope_revision_id),
  CHECK (json_extract(payload, '$.providerId') IS provider_id),
  CHECK (json_extract(payload, '$.providerConnectionId') IS connection_id),
  CHECK (json_extract(payload, '$.completeness.receivedCount') IS received_count)
) STRICT;
CREATE TABLE collection_parts (
  tenant_id TEXT NOT NULL, collection_id TEXT NOT NULL,
  part_index INTEGER NOT NULL CHECK (part_index BETWEEN 1 AND 64),
  site_id TEXT NOT NULL, scope_revision_id TEXT NOT NULL, connection_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  part_hash TEXT NOT NULL CHECK (length(part_hash) = 64),
  PRIMARY KEY (tenant_id, collection_id, part_index),
  UNIQUE (tenant_id, collection_id, part_index, site_id, scope_revision_id, connection_id, provider_id),
  FOREIGN KEY (tenant_id, collection_id, site_id, scope_revision_id, connection_id, provider_id)
    REFERENCES collections(tenant_id, id, site_id, scope_revision_id, connection_id, provider_id)
) STRICT;
CREATE TABLE source_records (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL, collection_id TEXT NOT NULL, part_index INTEGER NOT NULL,
  site_id TEXT NOT NULL, scope_revision_id TEXT NOT NULL, connection_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  external_id TEXT NOT NULL, identity_hash TEXT NOT NULL CHECK (length(identity_hash) = 64),
  contract_version TEXT NOT NULL CHECK (contract_version = '1.0'),
  payload TEXT NOT NULL CHECK (json_valid(payload) AND length(CAST(payload AS BLOB)) <= 65536),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, collection_id, identity_hash),
  UNIQUE (tenant_id, collection_id, external_id),
  UNIQUE (tenant_id, id, collection_id, site_id, scope_revision_id, connection_id, provider_id),
  FOREIGN KEY (tenant_id, collection_id, site_id, scope_revision_id, connection_id, provider_id)
    REFERENCES collections(tenant_id, id, site_id, scope_revision_id, connection_id, provider_id),
  FOREIGN KEY (tenant_id, collection_id, part_index, site_id, scope_revision_id, connection_id, provider_id)
    REFERENCES collection_parts(tenant_id, collection_id, part_index, site_id, scope_revision_id, connection_id, provider_id),
  CHECK (json_extract(payload, '$.schemaVersion') IS contract_version),
  CHECK (json_extract(payload, '$.kind') IS 'source_record'),
  CHECK (json_extract(payload, '$.identity.scope.tenantId') IS tenant_id),
  CHECK (json_extract(payload, '$.identity.scope.siteId') IS site_id),
  CHECK (json_extract(payload, '$.identity.scope.siteScopeRevisionId') IS scope_revision_id),
  CHECK (json_extract(payload, '$.identity.providerId') IS provider_id),
  CHECK (json_extract(payload, '$.identity.providerConnectionId') IS connection_id),
  CHECK (json_extract(payload, '$.identity.sourceRecordId') IS external_id)
) STRICT;
CREATE TABLE observations (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL, source_id TEXT NOT NULL, collection_id TEXT NOT NULL,
  site_id TEXT NOT NULL, scope_revision_id TEXT NOT NULL, connection_id TEXT NOT NULL, provider_id TEXT NOT NULL,
  contract_version TEXT NOT NULL CHECK (contract_version = '1.0'),
  payload TEXT NOT NULL CHECK (json_valid(payload) AND length(CAST(payload AS BLOB)) <= 65536),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, source_id, collection_id, site_id, scope_revision_id, connection_id, provider_id)
    REFERENCES source_records(tenant_id, id, collection_id, site_id, scope_revision_id, connection_id, provider_id),
  CHECK (json_extract(payload, '$.schemaVersion') IS contract_version),
  CHECK (json_extract(payload, '$.kind') IS 'observation'),
  CHECK (json_extract(payload, '$.id') IS id),
  CHECK (json_extract(payload, '$.cohort.context.scope.tenantId') IS tenant_id),
  CHECK (json_extract(payload, '$.cohort.context.scope.siteId') IS site_id),
  CHECK (json_extract(payload, '$.cohort.context.scope.siteScopeRevisionId') IS scope_revision_id),
  CHECK (json_extract(payload, '$.provenance.source.scope.tenantId') IS tenant_id),
  CHECK (json_extract(payload, '$.provenance.source.scope.siteId') IS site_id),
  CHECK (json_extract(payload, '$.provenance.source.scope.siteScopeRevisionId') IS scope_revision_id),
  CHECK (json_extract(payload, '$.provenance.source.providerId') IS provider_id),
  CHECK (json_extract(payload, '$.provenance.source.providerConnectionId') IS connection_id),
  CHECK (json_extract(payload, '$.provenance.runId') IS collection_id)
) STRICT;
CREATE INDEX observations_by_collection ON observations(tenant_id, collection_id, id);
CREATE INDEX observations_by_site ON observations(tenant_id, site_id, id);
CREATE INDEX observations_by_provider ON observations(tenant_id, provider_id, id);
`;

const checksum = hashCanonicalJson(migration);

/** Bounded per-part request limits. A collection admits at most PARTS * SOURCES sources. */
export const STORAGE_BOUNDS = { parts: 64, sourcesPerPart: 16, observationsPerPart: 32 } as const;

const schemaObjectName = /^[A-Za-z_][A-Za-z0-9_]*$/;

function cell(value: SQLOutputValue): string | null {
  return value === null ? null : String(value);
}
function row(value: Record<string, SQLOutputValue>, keys: readonly string[]): (string | null)[] {
  return keys.map((key) => cell(value[key] ?? null));
}
// PRAGMA arguments cannot be bound, so every interpolated name is an object name
// already read from this database and constrained to a plain SQL identifier.
function pragma(db: DatabaseSync, name: string, argument: string): Record<string, SQLOutputValue>[] {
  if (!schemaObjectName.test(argument)) throw new Error(`Unsupported local schema object name: ${argument}`);
  return db.prepare(`PRAGMA ${name}(${argument})`).all();
}

/**
 * The complete live user schema: every user object's exact DDL plus the resolved
 * column, index, and foreign-key definitions SQLite actually enforces. Names alone
 * are insufficient; `ALTER TABLE` rewrites stored DDL and PRAGMA output alike, and
 * unexpected views/triggers/indexes appear as extra objects. Internal `sqlite_*`
 * objects are omitted: they are SQLite-managed and fully determined by the user DDL
 * that is already compared verbatim.
 */
function userSchema(db: DatabaseSync): unknown {
  const objects = db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite~_%' ESCAPE '~' ORDER BY type, name, tbl_name`).all()
    .map((object) => row(object, ['type', 'name', 'tbl_name', 'sql']));
  const tables = db.prepare('PRAGMA table_list').all()
    .filter((table) => !String(table['name']).startsWith('sqlite_'))
    .map((table) => row(table, ['schema', 'name', 'type', 'ncol', 'wr', 'strict']));
  return {
    objects,
    tables,
    definitions: tables.map(([, name]) => ({
      name,
      columns: pragma(db, 'table_xinfo', name!).map((column) => row(column, ['cid', 'name', 'type', 'notnull', 'dflt_value', 'pk', 'hidden'])),
      foreignKeys: pragma(db, 'foreign_key_list', name!).map((key) => row(key, ['id', 'seq', 'table', 'from', 'to', 'on_update', 'on_delete', 'match'])),
      indexes: pragma(db, 'index_list', name!).map((index) => ({
        index: row(index, ['name', 'unique', 'origin', 'partial']),
        columns: pragma(db, 'index_xinfo', String(index['name'])).map((column) => row(column, ['seqno', 'cid', 'name', 'desc', 'coll', 'key'])),
      })),
    })),
  };
}

function applySchema(db: DatabaseSync): void {
  db.exec(historyTable);
  db.exec(migration);
  db.prepare('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)').run(1, checksum);
  db.exec('PRAGMA user_version = 1');
}

// Built once from the migration itself, so changing the migration automatically
// changes what an existing database must match. There is no second hand-maintained
// inventory to drift out of step.
let expected: string | undefined;
function expectedUserSchema(): string {
  if (expected === undefined) {
    const reference = new DatabaseSync(':memory:');
    try {
      applySchema(reference);
      expected = canonicalJson(userSchema(reference));
    } finally { reference.close(); }
  }
  return expected;
}

function requireExpectedUserSchema(db: DatabaseSync): void {
  const actual = canonicalJson(userSchema(db));
  if (actual === expectedUserSchema()) return;
  const live = new Set(db.prepare(`SELECT type || ':' || name AS object FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite~_%' ESCAPE '~'`).all().map((object) => String(object['object'])));
  const reference = new DatabaseSync(':memory:');
  let known: Set<string>;
  try {
    applySchema(reference);
    known = new Set(reference.prepare(`SELECT type || ':' || name AS object FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite~_%' ESCAPE '~'`).all().map((object) => String(object['object'])));
  } finally { reference.close(); }
  const unexpected = [...live].filter((object) => !known.has(object)).sort();
  const missing = [...known].filter((object) => !live.has(object)).sort();
  const changed = unexpected.length === 0 && missing.length === 0 ? ' (an expected object was modified)' : '';
  throw new Error(`Local database user schema differs from the expected Release 0.3 storage schema${changed}`
    + `${unexpected.length ? `; unexpected: ${unexpected.slice(0, 8).join(', ')}` : ''}`
    + `${missing.length ? `; missing: ${missing.slice(0, 8).join(', ')}` : ''}`);
}

/** Administrative bootstrap only; never exposed through the repository API. */
export function migrateLocalDatabase(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  if (db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys'] !== 1) throw new Error('SQLite foreign keys are required');
  db.exec('BEGIN IMMEDIATE');
  try {
    const objects = db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name NOT LIKE 'sqlite~_%' ESCAPE '~'").get()?.['count'];
    const version = db.prepare('PRAGMA user_version').get()?.['user_version'];
    if (objects === 0 && version === 0) {
      applySchema(db);
    } else {
      if (version !== 1) throw new Error('Unknown or incomplete local database schema');
      requireExpectedUserSchema(db);
      const history = db.prepare('SELECT version, checksum FROM schema_migrations').all();
      if (history.length !== 1 || history[0]?.['version'] !== 1 || history[0]?.['checksum'] !== checksum) throw new Error('Local migration history/checksum mismatch');
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Local database has broken ownership references');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw new Error('Local database migration failed', { cause: error });
  }
}
