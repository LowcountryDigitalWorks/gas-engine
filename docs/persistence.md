# Tenant-safe local persistence — Release 0.3

Release 0.3 is **accepted and merged to `main`** on top of the [Release 0.2 canonical contracts](contracts.md). It adds tenant-scoped local storage without changing any accepted contract, generated JSON Schema, or domain invariant. Release 0.4 consumes this interface through the [authenticated ingestion boundary](ingestion.md) and intentionally leaves the SQLite schema, ownership model, exact reopen guard, and read/write transaction strategy unchanged. See [authorization](authorization.md) and the [persistence decision](decisions/0002-tenant-safe-persistence-boundary.md).

## Application boundary and trusted context

[EvidenceRepository](../src/persistence/repository.ts) is a small, provider-neutral Promise-based interface. Every operation touching tenant-owned data requires `TenantContext`, including metadata creation, direct reads, lists/filters, external identity lookup, bulk reads, joins, idempotency, progress, updates, deletion, and atomic writes. Construction/migration/close are trusted administrative lifecycle operations. No global lookup, arbitrary SQL, database handle, or caller transaction callback is exposed.

Tenant authority is an opaque TypeScript brand backed by a module-private WeakMap. Only recognized object identities supply tenant identity; plain objects, casts, cloned contexts, proxies, prototype descendants, record fields, filters, and cursor data do not create authority.

The issuer and validator live in different places on purpose. [tenant-context.ts](../src/persistence/tenant-context.ts) is the production storage surface and exports only the `TenantContext` type and `requireTenantContext`: storage can *check* authority but cannot *mint* it. The issuer stays in package-internal [tenant-authority.ts](../src/internal/tenant-authority.ts). Tests mint synthetic contexts only through `createTestTenantContext` in `tests/support/tenant-authority.ts`, which is never shipped as part of the production surface. Release 0.4 intentionally makes [authentication/principal.ts](../src/authentication/principal.ts) the **sole additional production caller** of `issueTenantContext`, after a trusted authenticator verifies an opaque credential. Import-boundary tests enforce that persistence, transport, application service, and arbitrary production modules cannot mint authority. Plain, cloned, cast, or proxied authenticated-principal lookalikes are rejected before context use. This seam is not itself a production identity provider.

## Local SQLite and migration

[LocalEvidenceRepository](../src/persistence/sqlite.ts) uses built-in `node:sqlite` on pinned Node 24.19.0 (empirically observed SQLite 3.53.3). The adapter enables foreign keys and defensive mode, disables extensions/double-quoted string literals, and uses a bounded one-second busy timeout. A file path is trusted local configuration; `:memory:` is the default. No D1 API, emulator, deployment config, ORM, or new npm dependency is introduced.

The pinned [Node SQLite documentation](https://github.com/nodejs/node/blob/v24.19.0/doc/api/sqlite.md) labels the module a release candidate. Its tested behavior is suitable for this bounded local proof; future runtime upgrades require revalidation. Node retains its [upstream license and bundled notices](https://github.com/nodejs/node/blob/v24.19.0/LICENSE); SQLite describes its deliverable as [public domain](https://www.sqlite.org/copyright.html). These upstream terms do not grant a license to this project. All locked npm packages and licenses remain unchanged from Release 0.2.

[migrations.ts](../src/persistence/migrations.ts) contains one deterministic local SQL migration. Bootstrap checks foreign-key enforcement, then applies the schema and checksum ledger atomically with `BEGIN IMMEDIATE` and sets SQLite `user_version = 1`. A migration number describes storage layout; canonical evidence remains version `1.0`. Release 0.4 adds no SQL migration.

Reopening an existing file accepts it only when its **live user schema is identical to the schema this migration produces**. Object names are not sufficient: `ALTER TABLE` silently rewrites stored DDL, and an added column, renamed column, dropped or re-created index, or an unexpected view or trigger all leave a name-only inventory looking correct while the storage contract has changed. The guard therefore compares, for every user object, the exact `sqlite_schema` DDL plus the definitions SQLite really enforces: `table_list` (including STRICT), `table_xinfo` columns, `foreign_key_list` relationships, and `index_list`/`index_xinfo` index membership. Internal `sqlite_*` objects are omitted because they are SQLite-managed and fully determined by the user DDL already compared verbatim.

The expected value is not a second hand-maintained inventory. It is derived once, on demand, by applying the same migration to a throwaway in-memory database and reading its schema back, so changing the migration automatically changes what an existing database must match. `user_version`, the migration history/checksum ledger, and `foreign_key_check` are still verified. Any mismatch fails closed with a migration error naming the unexpected or missing objects and leaves existing tenant data untouched. PRAGMA arguments cannot be bound, so each interpolated name is read from the database being inspected and constrained to a plain SQL identifier. This ledger is not an authenticity check against an administrator who rewrites the schema, history, and checksum together.

## Relational ownership

Eight tenant-owned tables plus administrative `schema_migrations` exist:

| Table | Key and ownership |
| --- | --- |
| `tenants` | Tenant ID primary key; creation obtains ID only from trusted context. |
| `sites` | `(tenant_id, site_id)` primary key; FK to tenant; bounded label. |
| `site_scopes` | `(tenant_id, site_id, scope_revision_id)` primary key; composite FK to site. |
| `provider_connections` | `(tenant_id, id)` primary key; composite FK to scope, unique ownership tuple including provider; no credentials or arbitrary metadata. |
| `collections` | `(tenant_id, id)` primary key; composite FK to connection including site/scope/provider; scoped idempotency constraint; declared part count and canonical `receivedCount` bound to the payload. |
| `collection_parts` | `(tenant_id, collection_id, part_index)` primary key; composite FK to the collection's complete ownership tuple; one canonical request hash per persisted part. |
| `source_records` | `(tenant_id, id)` primary key; composite FKs to both the collection and the specific part that carried it; uniqueness of external identity within a tenant/run. |
| `observations` | `(tenant_id, id)` primary key; composite FK to source including tenant/site/scope/provider/connection/collection; provenance and cohort embedded in canonical observation. |

All tables use SQLite STRICT mode. Required ownership columns are non-null. Foreign keys use restrictive defaults, with no implicit cascades. SQL JSON checks bind canonical version, kind, identity, indexed scope/provider/run fields, and declared `receivedCount` to columns. Every production and bootstrap `INSERT` names its columns explicitly, so a storage-shape change cannot be absorbed silently by positional binding. Repository parsing supplies full Release 0.2 cross-field validation; SQL checks are additional defenses, not a replacement validator.

Internal and external IDs may overlap across tenants. A source identity combines tenant/site/scope/provider/connection/external ID via the existing `sourceRecordIdentityHash`. Uniqueness includes the collection, allowing the same external source to recur in later runs. External lookup requires trusted context plus site, scope, provider, connection, collection, and external ID. Provider/connection IDs alone never select a tenant.

## Bounded collection parts and validated writes

A collection's `completeness.receivedCount` is canonical evidence about the **whole collection**, not a storage page size. Persistence never redefines it. It also cannot be represented by one unbounded request: the canonical hash that makes replay deterministic is limited to 64 KiB and unbounded arrays would make memory/transaction cost unpredictable.

`persistCollection(context, part)` therefore persists exactly **one bounded part**. Each part carries the scoped `idempotencyKey`, its `part`/`parts` position, the identical canonical collection record, source metadata rows, and observations. At most 16 sources and 32 observations are permitted per part, the whole part must fit the existing 64 KiB/depth/value canonical limits, and a collection declares at most 64 parts. There is no hidden truncation or implicit paging.

Part 1 opens the collection and records the declared part count and `receivedCount`; SQL rejects a declared count the parts could not carry. Later parts must present a byte-identical canonical collection and the same part count, and must arrive in order with no gaps. After every part the persisted source rows are counted against canonical `receivedCount`: exceeding it rejects, and the final part must account for it exactly. `getCollectionProgress` derives `receivedCount`, persisted sources, declared parts, persisted parts, and completion from stored rows only, never from a second stored completeness opinion. Release 0.4 deliberately queries this progress after persistence before returning HTTP `complete`.

Atomicity is precise: **each part commits or rolls back atomically**; a collection larger than one part is assembled from atomic parts and is not one transaction. A contract error, ownership failure, missing source, duplicate child, or count overrun rolls back that part completely, including the collection row when a failing first part opened it. A later failing part leaves earlier committed parts intact.

Only `parseContract`-validated collection/source/observation records enter SQL. Persistence requires an explicit provider connection even though portable collection/source contracts allow omission. Each observation must reference a source in **the same part** and same run; source identity, integrity, availability, collection method, adapter/source schema, source period, collection/receipt timestamps, and completeness must agree with resolved parents. Cross-part observation references are not implemented in Release 0.4. No raw-provider-payload store or secret-bearing field exists.

Write and read transactions are deliberately different. Mutations use `BEGIN IMMEDIATE` so writers declare write intent up front and serialize deterministically. Multi-statement reads use deferred `BEGIN`, which still holds one consistent snapshot for the whole read but never takes write intent. Both helpers commit on success and roll back on error, and neither exposes a raw handle, SQL, or caller callback across the repository boundary.

Each evidence row stores canonical JSON, authoritative `schemaVersion`, and SHA-256; source rows also retain the canonical identity hash. Reads parse again and verify canonical serialization, hash, version, and indexed identity. Joined reads additionally resolve and validate source/collection provenance in one consistent snapshot. Hashes detect accidental/stale edits; they do not authenticate data against a database owner able to rewrite payloads and hashes.

## Idempotency, queries, mutation, and bounds

Collection idempotency uniqueness is `(tenant, site, scope revision, provider, connection, key)`; part idempotency is `(tenant, collection, part index)` with that part's canonical request hash. An exact retry of any part returns the stored collection with `replayed: true`. A different collection record, different declared part count, or different content under the same key/part rejects without mutation. Release 0.4 represents these and out-of-order/gapped part sequencing with small typed persistence conflicts so the application can map them to 409 without message-string scraping. A valid new ordered next part under the same collection key is not a conflict.

Another tenant or scoped connection may use the same key independently. A new run on the same connection needs a new key. Deleting a collection removes its parts and explicitly releases its key; there is no permanent replay ledger or tombstone retention policy.

Queries use bound parameters and explicit tenant predicates. Lists accept only optional site/provider/collection filters and deterministic ID order. At most 100 observations are returned; 101 matching rows causes an explicit narrow-the-filters error. Bulk lookup accepts 1–32 IDs and returns unique owned rows in ID order; unknown or other-tenant IDs return no record. No count API, pagination, or cursor exists. Tenant fields, limits, offsets, and cursor fields are rejected as unknown inputs. The limit check only counts the caller's matching rows.

Evidence has no update method. `setSiteLabel` is the only metadata mutation. `deleteCollection` removes only the context's observations, sources, parts, and collection atomically; another tenant's ID returns false. Site/scope/connection edits, retention automation, export, correlation, approval, and remeasurement are unimplemented.

## Synthetic verification

Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run check`. The accepted Release 0.2 contract suite and all 11 schema drift checks remain. The Release 0.3 persistence suite continues to verify:

- authority and context forgery rejection;
- direct/list/filter/bulk/join tenant isolation;
- bounded multipart persistence, ordered sequence, capacity, exact count reconciliation, replay, rollback, reopen, and deletion;
- composite relational ownership even when repository checks are bypassed;
- deterministic schema migration and exact live-schema drift rejection;
- explicit INSERT column lists;
- `BEGIN IMMEDIATE` write locking and deferred consistent read snapshots;
- canonical value/version/hash integrity, observed zero and missingness;
- query bounds, filesystem permissions, and no-network tripwire.

Release 0.4 adds ingestion tests without replacing these. Its tests cover exact authentication/grants, forged principals, Alpha/Beta isolation, body tenant IDs, bounded streamed transport, strict UTF-8/JSON/media behavior, 49,152-byte HTTP limit, typed idempotency/sequence conflicts, multipart progress false→true, exact replay progress, declared capacity/part limits, same-part observation/source rules, later-part rollback behavior, unauthorized no-write behavior, progress mismatch fail-closed behavior, instruction-like inert evidence, credential non-persistence/non-echo, and import-boundary enforcement.

Tests reuse wholly synthetic Alpha/Beta contract fixtures and create fresh databases. Temporary files live only in ignored `local-artifacts/`. Node permissions restrict writes to that directory and deny child processes/workers. The preloader is an accidental-network tripwire, not a sandbox for hostile process code. A production-import audit confines `node:sqlite` to the adapter/migration and rejects network/server dependencies; core contracts/domain/hash modules remain independent of persistence.

Contracts CI runs `npm run check`, dependency audit, whitespace/tracked-file checks, keeps `contents: read`, pinned actions, no credentials, and no deployment permissions. No public license grant is made. Release 0.4 adds no dependency or SQL migration, provisions no cloud resource, and adds **$0 incremental recurring cost**.
