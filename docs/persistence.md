# Tenant-safe local persistence — accepted evidence store + Release 0.8 ledger

Release 0.3 is **accepted and merged to `main`** on top of the [Release 0.2 canonical contracts](contracts.md). It adds tenant-scoped local evidence storage without changing any accepted contract, generated JSON Schema, or domain invariant. Release 0.4 consumes this interface through the [authenticated ingestion boundary](ingestion.md). Accepted Releases 0.5–0.7 reuse the same evidence ownership/storage boundary.

**Release 0.8 is accepted and merged through PR #16.** Its accepted migration 2 preserves the accepted evidence tables and adds only three local service-history tables: `recommendation_revisions`, `measurements`, and `outcomes`. See [Release 0.8 review ledger](review-ledger.md), [authorization](authorization.md), and [ADR 0007](decisions/0007-human-review-measurement-ledger.md).

## Application boundary and trusted context

[EvidenceRepository](../src/persistence/repository.ts) is a small, provider-neutral Promise-based interface. Every operation touching tenant-owned evidence data requires `TenantContext`, including metadata creation, direct reads, lists/filters, external identity lookup, bulk reads, joins, idempotency, progress, updates, deletion, and atomic writes. Construction/migration/close are trusted administrative lifecycle operations. No global lookup, arbitrary SQL, database handle, or caller transaction callback is exposed.

Release 0.8 adds a separate bounded [ReviewLedgerRepository](../src/review/repository.ts) surface for recommendation revision history, measurements, and outcomes. Every review-ledger read/write likewise requires the existing trusted `TenantContext` and exact tenant/site/scope ownership. IDs and scope fields are selectors/data only and never establish authority.

Tenant authority is an opaque TypeScript brand backed by a module-private WeakMap. Only recognized object identities supply tenant identity; plain objects, casts, cloned contexts, proxies, prototype descendants, record fields, filters, and cursor data do not create authority.

The issuer and validator live in different places on purpose. [tenant-context.ts](../src/persistence/tenant-context.ts) is the production storage surface and exports only the `TenantContext` type and `requireTenantContext`: storage can *check* authority but cannot *mint* it. The issuer stays in package-internal [tenant-authority.ts](../src/internal/tenant-authority.ts). Tests mint synthetic contexts only through `createTestTenantContext` in `tests/support/tenant-authority.ts`, which is never shipped as part of the production surface. Release 0.4 intentionally makes [authentication/principal.ts](../src/authentication/principal.ts) the **sole additional production caller** of `issueTenantContext`, after a trusted authenticator verifies an opaque credential. Import-boundary tests enforce that persistence, transport, application service, adapters, analysis, and review modules cannot mint authority. Plain, cloned, cast, or proxied authenticated-principal lookalikes are rejected before context use. This seam is not itself a production identity provider.

## Local SQLite and migrations

[LocalEvidenceRepository](../src/persistence/sqlite.ts) and accepted Release 0.8 [LocalReviewLedgerRepository](../src/review/sqlite.ts) use built-in `node:sqlite` on pinned Node 24.19.0. The adapters use the same local database file boundary; no D1 API, emulator, deployment config, ORM, or new npm dependency is introduced.

The pinned [Node SQLite documentation](https://github.com/nodejs/node/blob/v24.19.0/doc/api/sqlite.md) labels the module a release candidate. Its tested behavior is suitable for this bounded local proof; future runtime upgrades require revalidation. Node retains its [upstream license and bundled notices](https://github.com/nodejs/node/blob/v24.19.0/LICENSE); SQLite describes its deliverable as [public domain](https://www.sqlite.org/copyright.html). These upstream terms do not grant a license to this project. Accepted Release 0.8 adds no package dependency.

[migrations.ts](../src/persistence/migrations.ts) contains deterministic local SQL migrations. Migration 1 is the accepted Release 0.3 evidence schema and retains its original checksum. Migration 2 is the accepted bounded Release 0.8 ledger migration. Bootstrap checks foreign-key enforcement and applies pending migrations atomically with `BEGIN IMMEDIATE`, recording each checksum and setting `PRAGMA user_version` to the latest applied migration. Migration numbers describe storage layout; canonical wire contracts remain `schemaVersion: "1.0"`.

A version-1 database must exactly match the accepted migration-1 live schema and checksum before migration 2 may apply. Fresh databases apply migration 1 then migration 2. A version-2 reopen verifies both migration checksums, `user_version = 2`, foreign-key integrity, and the complete expected live user schema. Unknown, incomplete, altered, or future migration histories fail closed without modifying tenant data.

Reopening an existing file accepts it only when its **live user schema is identical to the schema the recorded migrations produce**. Object names are not sufficient: `ALTER TABLE` silently rewrites stored DDL, and an added column, renamed column, dropped or re-created index, or an unexpected view or trigger can leave a name-only inventory misleadingly plausible. The guard compares exact `sqlite_schema` DDL plus the definitions SQLite actually enforces: `table_list` (including STRICT), `table_xinfo` columns, `foreign_key_list` relationships, and `index_list`/`index_xinfo` index membership. Internal `sqlite_*` objects are omitted because they are SQLite-managed and determined by the user DDL already compared.

The expected value is derived by applying the same migration sequence to a throwaway in-memory database and reading its schema back rather than maintaining a second hand-written inventory. `user_version`, the migration history/checksum ledger, and `foreign_key_check` are also verified. Any mismatch fails closed and leaves existing tenant data untouched. This ledger is not an authenticity mechanism against an administrator able to rewrite both schema and ledger.

## Relational ownership

The accepted Release 0.8 schema contains eleven tenant-owned tables plus administrative `schema_migrations`. The accepted eight evidence tables remain intact, and migration 2 adds exactly three review-ledger tables.

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
| `recommendation_revisions` | Composite tenant/site/scope/recommendation/revision ownership; immutable canonical recommendation payload/version/hash with deterministic current/history indexes. |
| `measurements` | Composite tenant/site/scope/measurement ownership; canonical measurement payload/version/hash, optional local recommendation association, and tenant-scoped baseline self-reference for follow-ups. |
| `outcomes` | Composite tenant/site/scope/outcome ownership; canonical outcome payload/version/hash and optional same-scope recommendation association. |

All tables use SQLite STRICT mode. Required ownership columns are non-null. Foreign keys use restrictive defaults unless an accepted evidence cleanup path explicitly requires otherwise. SQL JSON checks bind canonical version/kind/scope or indexed ownership fields to columns. Every production/bootstrap `INSERT` names its columns explicitly, so a storage-shape change cannot be absorbed silently by positional binding. Repository parsing supplies full canonical cross-field validation; SQL checks are additional defenses, not replacement validators.

Internal IDs may overlap across tenants. Provider/connection or record IDs alone never select a tenant. Review-ledger keys likewise always include trusted tenant ownership plus exact site/scope where applicable.

## Bounded collection parts and validated evidence writes

A collection's `completeness.receivedCount` is canonical evidence about the **whole collection**, not a storage page size. Persistence never redefines it. It also cannot be represented by one unbounded request: the canonical hash that makes replay deterministic is limited to 64 KiB and unbounded arrays would make memory/transaction cost unpredictable.

`persistCollection(context, part)` therefore persists exactly **one bounded part**. Each part carries the scoped `idempotencyKey`, its `part`/`parts` position, the identical canonical collection record, source metadata rows, and observations. At most 16 sources and 32 observations are permitted per part, the whole part must fit the existing 64 KiB/depth/value canonical limits, and a collection declares at most 64 parts. There is no hidden truncation or implicit paging.

Part 1 opens the collection and records the declared part count and `receivedCount`; SQL rejects a declared count the parts could not carry. Later parts must present a byte-identical canonical collection and the same part count, and must arrive in order with no gaps. After every part the persisted source rows are counted against canonical `receivedCount`: exceeding it rejects, and the final part must account for it exactly. `getCollectionProgress` derives `receivedCount`, persisted sources, declared parts, persisted parts, and completion from stored rows only, never from a second stored completeness opinion. Release 0.4 deliberately queries this progress after persistence before returning HTTP `complete`.

Atomicity is precise: **each part commits or rolls back atomically**; a collection larger than one part is assembled from atomic parts and is not one transaction. A contract error, ownership failure, missing source, duplicate child, or count overrun rolls back that part completely, including the collection row when a failing first part opened it. A later failing part leaves earlier committed parts intact.

Only `parseContract`-validated collection/source/observation records enter evidence SQL. Persistence requires an explicit provider connection even though portable collection/source contracts allow omission. Each observation must reference a source in **the same part** and same run; source identity, integrity, availability, collection method, adapter/source schema, source period, collection/receipt timestamps, and completeness must agree with resolved parents. No raw-provider-payload store or secret-bearing field exists.

Write and read transactions are deliberately different. Mutations use `BEGIN IMMEDIATE` so writers declare write intent up front and serialize deterministically. Multi-statement reads use deferred `BEGIN`, which still holds one consistent snapshot for the whole read but never takes write intent. Both helpers commit on success and roll back on error, and neither exposes a raw handle, SQL, or caller callback across the repository boundary.

Each evidence row stores canonical JSON, authoritative `schemaVersion`, and SHA-256; source rows also retain the canonical identity hash. Reads parse again and verify canonical serialization, hash, version, and indexed identity. Joined reads additionally resolve and validate source/collection provenance in one consistent snapshot. Hashes detect accidental/stale edits; they do not authenticate data against a database owner able to rewrite payloads and hashes.

## Release 0.8 review-ledger writes and bounds

Recommendation revisions are append-only. New recommendations must be revision 1 / `proposed` / `internal_review` / `unassessed`; expected-current-revision checks fail closed on stale writes. Lifecycle or material content changes append a new canonical revision rather than updating an old payload. Rejected and superseded states are terminal; accepted may only become superseded. No action row exists and recommendation acceptance cannot create one.

Measurement and outcome records are immutable canonical inserts. The application resolves observation/measurement/recommendation references before persistence. Measured values must equal the canonical persisted observation values. Outcome direction is supplied by the caller/human; the persistence layer does not derive direction or attribution.

General Release 0.8 review lists are bounded to 100 records and deterministic. Recommendation revision history is also bounded to 100 revisions. Overflow fails explicitly rather than truncating or looping through hidden pages. Release 0.8 does not add count APIs, generic metadata bags, queues, jobs, schedules, prompts/completions, credentials, sessions, provider payloads, or UI state.

## Idempotency, queries, mutation, and evidence bounds

Collection idempotency uniqueness is `(tenant, site, scope revision, provider, connection, key)`; part idempotency is `(tenant, collection, part index)` with that part's canonical request hash. An exact retry of any part returns the stored collection with `replayed: true`. A different collection record, different declared part count, or different content under the same key/part rejects without mutation. Release 0.4 represents these and out-of-order/gapped part sequencing with small typed persistence conflicts so the application can map them to 409 without message-string scraping. A valid new ordered next part under the same collection key is not a conflict.

Another tenant or scoped connection may use the same key independently. A new run on the same connection needs a new key. Deleting a collection removes its parts and explicitly releases its key; there is no permanent replay ledger or tombstone retention policy.

Evidence queries use bound parameters and explicit tenant predicates. Lists accept only optional site/provider/collection filters and deterministic ID order. At most 100 observations are returned; 101 matching rows causes an explicit narrow-the-filters error. Bulk lookup accepts 1–32 IDs and returns unique owned rows in ID order; unknown or other-tenant IDs return no record. No count API, pagination, or cursor exists. Tenant fields, limits, offsets, and cursor fields are rejected as unknown inputs. The limit check only counts the caller's matching rows.

Evidence has no update method. `setSiteLabel` is the only metadata mutation. `deleteCollection` removes only the context's observations, sources, parts, and collection atomically; another tenant's ID returns false. Release 0.8 does not repurpose those evidence mutation semantics.

## Synthetic verification

Run `npm ci --ignore-scripts --no-audit --no-fund`, then `npm run check`. The accepted contract/persistence/ingestion/adapter/analysis suites remain and accepted Release 0.8 adds review-ledger coverage for:

- trusted-context forgery rejection and Alpha/Beta isolation across every new read/write;
- cross-site/cross-scope rejection;
- revision-1 proposed/internal_review/unassessed recommendation creation;
- stale expected-revision rejection and immutable proposed → in_review → accepted history;
- rejected/superseded terminal behavior and no action side effects;
- canonical observation evidence resolution and safe failure when evidence is missing/deleted;
- baseline/follow-up chronology/comparability and exact canonical measured values;
- `not_due` / `not_measured` records without scheduling behavior;
- human-declared directional outcomes and Release 0.8 attribution gating;
- deterministic bounded review/measurement/outcome retrieval;
- v1→v2 migration, schema-drift detection, and exact reopen verification;
- complete synthetic service-history reconstruction proof with a preserved rejected recommendation.

Tests reuse wholly synthetic Alpha/Beta material and create fresh databases. Temporary files live only in ignored `local-artifacts/`. Node permissions restrict writes to that directory and deny child processes/workers. The preloader is an accidental-network tripwire, not a sandbox for hostile process code. A production-import audit permits `node:sqlite` only in the accepted evidence adapter, administrative migrations, and the accepted Release 0.8 local review adapter; it continues to reject network/server dependencies and keeps core contracts/domain/hash modules independent of storage.

Contracts CI runs `npm run check`, dependency audit, whitespace/tracked-file checks, keeps `contents: read`, pinned actions, no credentials, and no deployment permissions. No public license grant is made. Accepted Release 0.8 adds no dependency or cloud resource and targets **$0 incremental recurring cost**.
