# Tenant-safe local persistence — Release 0.3

This candidate is stacked on unmerged [PR #2](https://github.com/LowcountryDigitalWorks/gas-engine/pull/2), at reviewed development head `9020deaf08b371a02fee1128540c237826f55788`. Accepted `main` remains Release 0.1. The owner permits development while deferring repository governance. Neither PR may merge until that gate is reconciled; Product ORCH1 owns independent acceptance and later rebase/retarget. See [authorization](authorization.md) and the [persistence decision](decisions/0002-tenant-safe-persistence-boundary.md).

## Application boundary and trusted context

[EvidenceRepository](../src/persistence/repository.ts) is a small, provider-neutral Promise-based interface. Every operation touching tenant-owned data requires `TenantContext`, including metadata creation, direct reads, lists/filters, external identity lookup, bulk reads, joins, idempotency, updates, deletion, and atomic writes. Construction/migration/close are trusted administrative lifecycle operations. No global lookup, arbitrary SQL, database handle, or caller transaction callback is exposed.

[tenant-context.ts](../src/persistence/tenant-context.ts) uses an opaque TypeScript brand and a module-private WeakMap. Only recognized object identities supply tenant identity. Plain objects, casts, cloned contexts, proxies, record fields, filters, and cursor data do not create authority. Every owned method tests the context before reading its other inputs.

`createTrustedTestTenantContext('tenant-alpha')` is explicitly a **trusted TEST factory**. Tests call it from trusted local setup. Its availability is not production authorization: code controlling the process can call it. A future authenticated application boundary must establish tenant authority and replace the test bootstrap; never expose the factory as a request handler or derive its argument from untrusted input. There are no authenticated users, sessions, roles, tokens, or production authorization claims here.

## Local SQLite and migration

[LocalEvidenceRepository](../src/persistence/sqlite.ts) uses built-in `node:sqlite` on pinned Node 24.19.0 (empirically observed SQLite 3.53.3). The actual runtime passed strict-table, bound-statement, composite-foreign-key, and rollback checks before adoption. The adapter enables foreign keys and defensive mode, disables extensions/double-quoted string literals, and uses a bounded one-second busy timeout. A file path is trusted local configuration; `:memory:` is the default. No D1 API, emulator, deployment config, ORM, or new npm dependency is introduced.

The pinned [Node SQLite documentation](https://github.com/nodejs/node/blob/v24.19.0/doc/api/sqlite.md) labels the module a release candidate. Its tested behavior is suitable for this bounded local proof; future runtime upgrades require revalidation. Node retains its [upstream license and bundled notices](https://github.com/nodejs/node/blob/v24.19.0/LICENSE); SQLite describes its deliverable as [public domain](https://www.sqlite.org/copyright.html). These upstream terms do not grant a license to this project. All locked npm packages and licenses remain unchanged from Release 0.2.

[migrations.ts](../src/persistence/migrations.ts) contains one deterministic local SQL migration. Bootstrap checks foreign-key enforcement, applies the schema and checksum ledger atomically with `BEGIN IMMEDIATE`, and sets SQLite `user_version = 1`. Reopening checks the exact table inventory, migration history/checksum, storage version, and `foreign_key_check`. Unknown/future/incomplete schemas fail with a migration error and cause. A migration number describes storage layout; canonical evidence remains version `1.0`. There is no automatic contract upgrade/downgrade. This ledger is not an authenticity check against an administrator who rewrites the schema/history.

## Relational ownership

Seven tenant-owned tables plus administrative `schema_migrations` exist:

| Table | Key and ownership |
| --- | --- |
| `tenants` | Tenant ID primary key; creation obtains ID only from trusted context. |
| `sites` | `(tenant_id, site_id)` primary key; FK to tenant; bounded label. |
| `site_scopes` | `(tenant_id, site_id, scope_revision_id)` primary key; composite FK to site. |
| `provider_connections` | `(tenant_id, id)` primary key; composite FK to scope, unique ownership tuple including provider; no credentials or arbitrary metadata. |
| `collections` | `(tenant_id, id)` primary key; composite FK to connection including site/scope/provider; scoped idempotency constraint. |
| `source_records` | `(tenant_id, id)` primary key; composite FK to collection and its complete ownership tuple; uniqueness of external identity within a tenant/run. |
| `observations` | `(tenant_id, id)` primary key; composite FK to source including tenant/site/scope/provider/connection/collection; provenance and cohort embedded in canonical observation. |

All tables use SQLite STRICT mode. Required ownership columns are non-null. Foreign keys use restrictive defaults, with no implicit cascades. SQL JSON checks bind canonical version, kind, identity, and indexed scope/provider/run fields to their columns. Repository parsing supplies full Release 0.2 cross-field validation; SQL checks are additional defenses, not a replacement validator.

Internal and external IDs may overlap across tenants. A source identity combines tenant/site/scope/provider/connection/external ID via the existing `sourceRecordIdentityHash`. Uniqueness includes the collection, allowing the same external source to recur in later runs. External lookup requires trusted context plus site, scope, provider, connection, collection, and external ID. Provider/connection IDs alone never select a tenant.

## Validated evidence and atomic writes

`persistCollection(context, batch)` is the sole evidence write path. The strict envelope carries `idempotencyKey`, one canonical collection, up to 16 source metadata records with internal row IDs, and up to 32 observations with source-row references. The complete batch must fit the existing 64 KiB/depth/value canonical limits; per-record limits also apply. Array order is significant for replay hashing.

Only `parseContract`-validated collection/source/observation records enter SQL. Persistence requires an explicit provider connection even though the portable collection/source contracts allow omission. Received source count must equal the number of stored source records. Each observation must reference a source in this batch and the same run; source identity, integrity, availability, collection method, adapter/source schema, source period, collection/receipt timestamps, and completeness must agree with the resolved parents. Missing metric states can exist within a received source; empty/unavailable collections may contain zero sources and observations.

One `BEGIN IMMEDIATE` transaction checks scoped idempotency, inserts the collection, validates/inserts children, and commits only after every child succeeds. A contract error, ownership failure, missing source, or duplicate child rolls back the collection, children, and idempotency reservation. This synchronous adapter never yields within a transaction, despite its Promise-based interface. No ingestion endpoint, parser for raw provider data, retries, background job, or callback-driven transaction engine exists.

Each evidence row stores canonical JSON, authoritative `schemaVersion`, and its SHA-256; source rows also retain the canonical identity hash. Reads parse again and verify canonical serialization, hash, version, and indexed identity. Joined reads additionally resolve and validate source/collection provenance in a consistent transaction. Hashes detect accidental/stale edits; they do not authenticate data against a database owner able to rewrite payloads and hashes. Metadata uses existing identifier/scope/text primitives, not a second evidence schema system. No raw-provider-payload or secret-bearing fields are added.

## Idempotency, queries, mutation, and bounds

Idempotency uniqueness is `(tenant, site, scope revision, provider, connection, key)`. The key names one complete collection request in that source context; its canonical request hash includes the run and every child. An exact retry returns the original collection with `replayed: true`; different content/order/IDs under that key rejects without mutation. Another tenant or scoped connection may use the same key independently. A new run on the same connection needs a new key. Deleting a collection explicitly releases its key; there is no permanent replay ledger or tombstone retention policy.

Queries use bound parameters and explicit tenant predicates. Lists accept only optional site/provider/collection filters and deterministic ID order. At most 100 observations are returned; 101 matching rows causes an explicit narrow-the-filters error. Bulk lookup accepts 1–32 IDs and returns unique owned rows in ID order; unknown or other-tenant IDs return no record. No count API, pagination, or cursor exists. Tenant fields, limits, offsets, and cursor fields are rejected as unknown inputs. The limit check only counts the caller's matching rows.

Evidence has no update method. `setSiteLabel` is the only metadata mutation. `deleteCollection` removes only the context's observations, sources, and collection atomically; another tenant's ID returns false. Same internal IDs in both tenants delete only the context's own row. Site/scope/connection edits, retention automation, export, correlation, approval, and remeasurement are unimplemented.

## Synthetic verification

Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run check`. Existing 41 contract tests and all 11 schema drift checks remain. The persistence suite adds:

| Test group | Evidence |
| --- | --- |
| Context rejection | Every owned public method rejects absent, forged, cloned, and proxied contexts; compile-time brand test; data cannot select tenant. |
| Direct/list/filter/bulk/join | Beta cannot read Alpha-only internal IDs, external IDs, filters, joined records, or bulk entries. Same IDs in both tenants resolve to separate complete evidence chains. |
| Mutation/deletion/transaction | Beta cannot update/delete Alpha; failed Beta transactions leave Alpha unchanged. Beta deleting an overlapping ID deletes only Beta. |
| Idempotency | Exact retry, conflicts, distinct tenant/connection keys, and later source runs. |
| Structural ownership | Privileged direct-SQL tests bypass repository checks and prove FK rejection at every tenant-to-observation edge, plus same-tenant site/scope/provider/connection/run mismatches. |
| Atomicity and durability | A duplicate child fails after prior inserts; no collection/source/observation/key survives, including after file close/reopen. Successful evidence and idempotency survive reopen and separate connections. |
| Value/version/integrity | Exact observed zero and all four missing states/reasons; independent canonical/provider/adapter/normalization versions; unsupported versions, unknown payloads, inconsistent provenance, and stale hashes reject. |
| Migration | Deterministic fresh bootstrap/reapply; strict tables and exact inventory; future, partial, and altered histories fail without modifying tenant data. |
| Bounds/network | Over-limit queries and unsupported cursors reject; preloaded network tripwire blocks fetch/HTTP/socket/DNS calls. No live provider, internet, cloud account, or credentials needed. |

Tests reuse wholly synthetic Alpha/Beta contract fixtures and create fresh databases. Temporary files live only in ignored `local-artifacts/`; cleanup closes connections before removing each unique test directory. Node permissions restrict writes to that directory and deny child processes/workers. The preloader is an accidental-network tripwire, not a sandbox for hostile process code. A production-import audit confines `node:sqlite` to the adapter/migration and rejects network/server dependencies; core contracts/domain/hash modules remain independent of persistence.

The test command explicitly grants both the artifact directory and its descendants. Node cannot infer recursive permission from a directory that does not exist when the process starts; this matters on fresh CI checkouts. The network/permission test verifies nested artifact access and denies writes to `package.json`.

Contracts CI is extended only with the branch trigger and local test invocation. It keeps `contents: read`, pinned actions, no credentials, no deployment permissions, and included capacity. No public license grant is made. There is $0 incremental recurring cost and no cloud resource provisioning. Authentication, ingestion, adapters, APIs, UI, customer data/deployment, runtime AI/BYOK, and Release 0.4 remain excluded.
