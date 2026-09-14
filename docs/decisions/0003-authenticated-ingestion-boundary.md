# 0003 — Authenticated bounded ingestion boundary

Status: proposed in the bounded Release 0.4 candidate; pending Product ORCH1 independent review and release acceptance. Builds on [0001](0001-evidence-core.md) and [0002](0002-tenant-safe-persistence-boundary.md).

## Decision

Prove one write-only, in-process authenticated ingestion path in which **untrusted request data never creates authority**.

An injected authenticator receives only an opaque bearer credential and may return a registered trusted principal or `null`. Trusted principal issuance binds an exact tenant plus explicit tenant/site/site-scope/provider/provider-connection grants and is the sole new production caller of the package-internal tenant-context issuer. Request JSON and evidence cannot invoke that issuer.

The application service has no HTTP or concrete SQLite knowledge. It validates one bounded collection part, checks the exact grant, persists through `EvidenceRepository`, then queries `getCollectionProgress` and fails closed if the persisted result and derived progress disagree.

The transport is one Web-standard `POST /v1/evidence/collections` handler with no listener. It strictly bounds the bearer header and streamed JSON body, uses fatal UTF-8, accepts JSON/identity encoding only, and emits bounded no-store responses. The HTTP proof limit is 49,152 bytes, intentionally below the underlying 65,536-byte canonical persistence bound.

The JSON body carries `collection`, `part`, `parts`, `sources`, and `observations`; the whole-collection `Idempotency-Key` stays in a header. Canonical `receivedCount` continues to mean the whole collection evidence count. Parts arrive in order. Exact part replay succeeds, changed replay/part-count and sequence gaps are typed conflicts, and `complete` is derived persisted progress rather than canonical completeness.

## Consequences and limits

Accepted Release 0.3 persistence behavior remains authoritative: each part commits or rolls back atomically; multipart collection ingestion is not one transaction; an observation may reference only a source in the same part; exact live-schema verification, explicit INSERT column lists, composite ownership constraints, `BEGIN IMMEDIATE` writes, and deferred multi-statement reads remain unchanged.

This is not a production identity provider or network API. It adds no JWT/password/OAuth/session/API-key store, listener, provider networking, cloud resource, customer evidence, runtime AI, or deployment. Synthetic credentials exist only in tests. Evidence remains inert data and cannot mint authority or trigger execution.

No evidence schema version or SQLite schema changes. No dependency is added. Package version advances to 0.4.0; recurring cost remains $0. See the [ingestion guide](../ingestion.md) for the exact transport, status, validation-order, progress, and testing semantics.
