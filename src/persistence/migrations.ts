import type { DatabaseSync } from 'node:sqlite';
import { hashCanonicalJson } from '../lib/canonical-json.js';

// Migration numbers describe storage layout, not a new evidence contract version.
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
  idempotency_key TEXT NOT NULL, batch_hash TEXT NOT NULL CHECK (length(batch_hash) = 64),
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
  CHECK (json_extract(payload, '$.providerConnectionId') IS connection_id)
) STRICT;
CREATE TABLE source_records (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL, collection_id TEXT NOT NULL,
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
const expectedTables = ['collections', 'observations', 'provider_connections', 'schema_migrations', 'site_scopes', 'sites', 'source_records', 'tenants'];

/** Administrative bootstrap only; never exposed through the repository API. */
export function migrateLocalDatabase(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys = ON');
  if (db.prepare('PRAGMA foreign_keys').get()?.['foreign_keys'] !== 1) throw new Error('SQLite foreign keys are required');
  db.exec('BEGIN IMMEDIATE');
  try {
    const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((row) => row['name']);
    const version = db.prepare('PRAGMA user_version').get()?.['user_version'];
    if (tables.length === 0 && version === 0) {
      db.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL) STRICT');
      db.exec(migration);
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(1, checksum);
      db.exec('PRAGMA user_version = 1');
    } else {
      if (version !== 1 || JSON.stringify(tables) !== JSON.stringify(expectedTables)) throw new Error('Unknown or incomplete local database schema');
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
