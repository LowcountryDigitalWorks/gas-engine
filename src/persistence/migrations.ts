import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';

// Migration numbers describe storage layout, not a new evidence contract version.
const historyTable = 'CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL) STRICT';
const migration1 = `
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

// Release 0.8 adds only the bounded human-review / measurement / outcome ledger.
// Canonical wire contracts remain schemaVersion 1.0; this is a local storage migration.
const migration2 = `
CREATE TABLE recommendation_revisions (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 100),
  site_id TEXT NOT NULL, scope_revision_id TEXT NOT NULL,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('proposed', 'in_review', 'accepted', 'rejected', 'superseded')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  contract_version TEXT NOT NULL CHECK (contract_version = '1.0'),
  payload TEXT NOT NULL CHECK (json_valid(payload) AND length(CAST(payload AS BLOB)) <= 65536),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  PRIMARY KEY (tenant_id, id, revision),
  FOREIGN KEY (tenant_id, site_id, scope_revision_id)
    REFERENCES site_scopes(tenant_id, site_id, scope_revision_id),
  CHECK (json_extract(payload, '$.schemaVersion') IS contract_version),
  CHECK (json_extract(payload, '$.kind') IS 'recommendation'),
  CHECK (json_extract(payload, '$.id') IS id),
  CHECK (json_extract(payload, '$.revision') IS revision),
  CHECK (json_extract(payload, '$.scope.tenantId') IS tenant_id),
  CHECK (json_extract(payload, '$.scope.siteId') IS site_id),
  CHECK (json_extract(payload, '$.scope.siteScopeRevisionId') IS scope_revision_id),
  CHECK (json_extract(payload, '$.lifecycle') IS lifecycle),
  CHECK (json_extract(payload, '$.createdAt') IS created_at),
  CHECK (json_extract(payload, '$.updatedAt') IS updated_at)
) STRICT;
CREATE INDEX recommendation_current_lookup
  ON recommendation_revisions(tenant_id, site_id, scope_revision_id, id, revision DESC);
CREATE INDEX recommendation_by_lifecycle
  ON recommendation_revisions(tenant_id, site_id, scope_revision_id, lifecycle, id, revision DESC);

CREATE TABLE measurements (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL,
  site_id TEXT NOT NULL, scope_revision_id TEXT NOT NULL,
  recommendation_id TEXT,
  relationship_role TEXT NOT NULL CHECK (relationship_role IN ('baseline', 'follow_up')),
  baseline_measurement_id TEXT,
  created_at TEXT NOT NULL,
  contract_version TEXT NOT NULL CHECK (contract_version = '1.0'),
  payload TEXT NOT NULL CHECK (json_valid(payload) AND length(CAST(payload AS BLOB)) <= 65536),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id, scope_revision_id)
    REFERENCES site_scopes(tenant_id, site_id, scope_revision_id),
  FOREIGN KEY (tenant_id, baseline_measurement_id)
    REFERENCES measurements(tenant_id, id),
  CHECK ((relationship_role = 'baseline' AND baseline_measurement_id IS NULL)
    OR (relationship_role = 'follow_up' AND baseline_measurement_id IS NOT NULL)),
  CHECK (json_extract(payload, '$.schemaVersion') IS contract_version),
  CHECK (json_extract(payload, '$.kind') IS 'measurement'),
  CHECK (json_extract(payload, '$.id') IS id),
  CHECK (json_extract(payload, '$.cohort.context.scope.tenantId') IS tenant_id),
  CHECK (json_extract(payload, '$.cohort.context.scope.siteId') IS site_id),
  CHECK (json_extract(payload, '$.cohort.context.scope.siteScopeRevisionId') IS scope_revision_id),
  CHECK (json_extract(payload, '$.relationship.role') IS relationship_role),
  CHECK (json_extract(payload, '$.relationship.baselineMeasurementId') IS baseline_measurement_id),
  CHECK (json_extract(payload, '$.createdAt') IS created_at)
) STRICT;
CREATE INDEX measurements_by_scope ON measurements(tenant_id, site_id, scope_revision_id, created_at, id);
CREATE INDEX measurements_by_recommendation
  ON measurements(tenant_id, site_id, scope_revision_id, recommendation_id, created_at, id);

CREATE TABLE outcomes (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL,
  site_id TEXT NOT NULL, scope_revision_id TEXT NOT NULL,
  recommendation_id TEXT,
  created_at TEXT NOT NULL,
  contract_version TEXT NOT NULL CHECK (contract_version = '1.0'),
  payload TEXT NOT NULL CHECK (json_valid(payload) AND length(CAST(payload AS BLOB)) <= 65536),
  payload_hash TEXT NOT NULL CHECK (length(payload_hash) = 64),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, site_id, scope_revision_id)
    REFERENCES site_scopes(tenant_id, site_id, scope_revision_id),
  CHECK (json_extract(payload, '$.schemaVersion') IS contract_version),
  CHECK (json_extract(payload, '$.kind') IS 'outcome'),
  CHECK (json_extract(payload, '$.id') IS id),
  CHECK (json_extract(payload, '$.scope.tenantId') IS tenant_id),
  CHECK (json_extract(payload, '$.scope.siteId') IS site_id),
  CHECK (json_extract(payload, '$.scope.siteScopeRevisionId') IS scope_revision_id),
  CHECK (json_extract(payload, '$.recommendationId') IS recommendation_id),
  CHECK (json_extract(payload, '$.createdAt') IS created_at)
) STRICT;
CREATE INDEX outcomes_by_scope ON outcomes(tenant_id, site_id, scope_revision_id, created_at, id);
CREATE INDEX outcomes_by_recommendation
  ON outcomes(tenant_id, site_id, scope_revision_id, recommendation_id, created_at, id);
`;

const migration1Checksum = hashCanonicalJson(migration1);
const migration2Checksum = hashCanonicalJson(migration2);

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

/** Exact live user schema including resolved SQLite definitions. */
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

function applyMigration1(db: DatabaseSync): void {
  db.exec(historyTable);
  db.exec(migration1);
  db.prepare('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)').run(1, migration1Checksum);
  db.exec('PRAGMA user_version = 1');
}
function applyMigration2(db: DatabaseSync): void {
  db.exec(migration2);
  db.prepare('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)').run(2, migration2Checksum);
  db.exec('PRAGMA user_version = 2');
}

const expected = new Map<number, string>();
function expectedUserSchema(version: 1 | 2): string {
  const prior = expected.get(version);
  if (prior !== undefined) return prior;
  const reference = new DatabaseSync(':memory:');
  try {
    applyMigration1(reference);
    if (version === 2) applyMigration2(reference);
    const value = canonicalJson(userSchema(reference));
    expected.set(version, value);
    return value;
  } finally { reference.close(); }
}

function requireExpectedUserSchema(db: DatabaseSync, version: 1 | 2): void {
  const actual = canonicalJson(userSchema(db));
  if (actual === expectedUserSchema(version)) return;
  const live = new Set(db.prepare(`SELECT type || ':' || name AS object FROM sqlite_schema
    WHERE name NOT LIKE 'sqlite~_%' ESCAPE '~'`).all().map((object) => String(object['object'])));
  const reference = new DatabaseSync(':memory:');
  let known: Set<string>;
  try {
    applyMigration1(reference);
    if (version === 2) applyMigration2(reference);
    known = new Set(reference.prepare(`SELECT type || ':' || name AS object FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite~_%' ESCAPE '~'`).all().map((object) => String(object['object'])));
  } finally { reference.close(); }
  const unexpected = [...live].filter((object) => !known.has(object)).sort();
  const missing = [...known].filter((object) => !live.has(object)).sort();
  const changed = unexpected.length === 0 && missing.length === 0 ? ' (an expected object was modified)' : '';
  throw new Error(`Local database user schema differs from expected storage schema version ${version}${changed}`
    + `${unexpected.length ? `; unexpected: ${unexpected.slice(0, 8).join(', ')}` : ''}`
    + `${missing.length ? `; missing: ${missing.slice(0, 8).join(', ')}` : ''}`);
}

function requireHistory(db: DatabaseSync, version: 1 | 2): void {
  const history = db.prepare('SELECT version, checksum FROM schema_migrations ORDER BY version').all();
  const expectedHistory = version === 1
    ? [{ version: 1, checksum: migration1Checksum }]
    : [{ version: 1, checksum: migration1Checksum }, { version: 2, checksum: migration2Checksum }];
  if (canonicalJson(history) !== canonicalJson(expectedHistory)) throw new Error('Local migration history/checksum mismatch');
}

/** Administrative bootstrap/upgrade only; never exposed through repository APIs. */
export function migrateLocalDatabase(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  if (db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys'] !== 1) throw new Error('SQLite foreign keys are required');
  db.exec('BEGIN IMMEDIATE');
  try {
    const objects = db.prepare("SELECT COUNT(*) AS count FROM sqlite_schema WHERE name NOT LIKE 'sqlite~_%' ESCAPE '~'").get()?.['count'];
    const version = db.prepare('PRAGMA user_version').get()?.['user_version'];
    if (objects === 0 && version === 0) {
      applyMigration1(db);
      applyMigration2(db);
    } else if (version === 1) {
      requireExpectedUserSchema(db, 1);
      requireHistory(db, 1);
      applyMigration2(db);
    } else if (version === 2) {
      requireExpectedUserSchema(db, 2);
      requireHistory(db, 2);
    } else {
      throw new Error('Unknown or incomplete local database schema');
    }
    requireExpectedUserSchema(db, 2);
    requireHistory(db, 2);
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Local database has broken ownership references');
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw new Error('Local database migration failed', { cause: error });
  }
}
