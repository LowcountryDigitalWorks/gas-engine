# 0002 — Explicit tenant ownership at the persistence boundary

Status: proposed in the bounded Release 0.3 candidate on accepted `main`; pending independent acceptance. Builds on [0001](0001-evidence-core.md).

## Decision and reason

Every tenant-owned repository method requires a trusted `TenantContext`. Relational keys and foreign keys carry tenant, site, scope, provider connection, and run ownership through the evidence chain. External provider IDs are scoped identities, never global lookup authority. This fixes a long-lived invariant for later ingestion: safe ownership must survive replacement of the storage adapter and cannot depend only on remembering a filter.

A small Promise-based [EvidenceRepository](../../src/persistence/repository.ts) exposes bounded evidence operations. It accepts authoritative Release 0.2 records and exposes no raw SQL, generic repository framework, or caller transaction callback. The repository owns transaction semantics, using write intent for mutations and a deferred snapshot for multi-statement reads. Local implementation uses Node 24's built-in SQLite, empirically verified on the pinned runtime; it adds no dependency.

A collection is persisted as one or more bounded parts rather than a single unbounded batch. `completeness.receivedCount` keeps its canonical meaning as the collection's evidence count and is reconciled against persisted sources; it is never redefined as a storage page size. Each part commits atomically, and the collection is complete only when the declared count is accounted for exactly. This keeps memory, transaction size, and the 64 KiB canonical replay-hash input explicitly bounded without capping what a legitimate collection may declare.

## Consequences and limits

Composite constraints reject malformed ownership even if an application filter is omitted. Required contexts and strict filters prevent data fields from silently selecting tenant authority. Canonical records remain immutable; site-label mutation and collection deletion are explicit, separately scoped operations. A later D1 adapter must preserve these semantics and transaction guarantees; no D1 implementation or compatibility certification is claimed.

Tenant authority can be validated by the production storage surface but only issued from a package-internal module, whose sole caller today is explicitly named test scaffolding. A later authenticated application boundary becomes its first production caller; this release does not authenticate callers. A database owner or hostile code inside the trusted process can bypass these controls. SQLite is a local proof, not a deployed customer isolation system.

Automatic ORM filters and globally unique IDs were insufficient alternatives because neither expresses relational tenant ownership. A generic SQL abstraction was unnecessary for the eight-table proof. See the [persistence guide](../persistence.md) for implementation, tests, limits, and deferred scope.
