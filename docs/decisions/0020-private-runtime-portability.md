# ADR 0020 — Private-Runtime Packaging & Portability Readiness

- Status: Accepted
- Date: 2026-10-05
- Issue: #74
- Accepted PR: #75
- Accepted squash merge: `9e529669020e6d833b5f5ef7afdac48ab67e30bf`
- Independent whole-pack review: ACCEPT
- Post-merge Contracts: `37385826289` — SUCCESS

## Context

Accepted Release 0.19 provides deterministic local multi-engagement operations, but the accepted local state has not yet been proven portable as one integrity-checked recovery unit. A deployment architecture would be premature until backup, relocation, restore verification, retention planning, authority reconstruction, and decommission requirements are explicit and repeatable.

A new backup product, archive dependency, cloud storage client, container runtime, or deployment framework would increase cost and support burden without improving this bounded proof.

## Decision

Add one pure/local administrative portability seam using pinned Node 24.19 built-ins plus existing G.A.S. repositories and guards:

```text
strict non-secret runtime profile
  + accepted local SQLite state
  + explicitly selected accepted generated artifacts
  -> node:sqlite online backup
  -> exact file SHA-256 / byte-count manifest
  -> root-independent portable bundle identity
  -> strict path / symlink / integrity verification
  -> physical relocation to a second root
  -> accepted SQLite schema reopen
  -> newly issued trusted authority for representative reads
  -> deterministic retention plan
  -> explicit recovery / rollback / decommission metadata
```

The portable unit is a directory with a strict manifest. Compression and transport remain external to Release 0.20 semantics.

## Authority and secrets

The runtime profile and manifest are application-local models and create no tenant authority. Database IDs, artifact IDs, file paths, and bundle identities are selectors/provenance only.

`TenantContext`, authenticated sessions, credentials, passwords, API/OAuth tokens, cookies, and private keys are never serialized into the portability bundle. Restored storage requires newly issued trusted authority from an external, separately authorized authentication design.

Release 0.20 selects no identity provider and creates no secret-management system.

## SQLite backup

Use Node 24.19 `node:sqlite` online `backup(...)` against accepted file-backed SQLite state. The target must be a new file inside the controlled bundle root. Do not silently overwrite an unrelated existing file and do not byte-copy a live database as the backup mechanism.

After backup, reopen the backup through existing `LocalEvidenceRepository` and `LocalReviewLedgerRepository` migration/schema guards. Do not add or weaken a migration/table/schema.

## Manifest and identity

Every explicitly owned file binds its logical role, canonical relative path, exact SHA-256, exact byte count, classification, required state, and retention class.

The deterministic `portable-runtime-bundle:<sha256>` identity binds semantic manifest material only. Absolute filesystem root, inode, mtime, staging path, workflow identity, export wall-clock time, and pretty-print formatting are not identity material.

No recursive discovery chooses bundle content. The strict verifier may walk the finished directory only to reject unowned files or symlinked paths.

## Retention and recovery

Release 0.20 provides retention planning, not destructive retention execution. Eligibility uses explicit policy, trusted evaluation time, and explicit semantic timestamps. Filesystem mtime alone is insufficient and future timestamps fail closed.

Rollback requires an explicit operator-selected accepted bundle ID. There is no automatic "latest" selection. Recovery metadata documents strict verification, restore-to-new-root, external credential/auth requirements, and decommission steps. Deployment rollback is outside this release.

## WQT and runtime boundary

Issue #63 remains separate and WQT continues to use private `LowcountryDigitalWorks/wqt-operations`. This release does not create a separate private G.A.S. runtime repository, implement private WQT history/retention/recurrence, or run customer/private evidence through the public proof.

## Security, privacy, and cost

The public preview uses synthetic/example.test state only. Release 0.20 adds no provider networking, scheduler/background worker, runtime AI, cloud resource, customer portal/SaaS, REPORT-AUTO delivery, new dependency, or paid service.

Incremental recurring cash impact for the accepted release: `$0`.

## Consequences

Positive:

- proves recoverable local state before any deployment gate;
- reuses Node's maintained SQLite backup primitive and accepted schema guards;
- keeps tenant authority and credentials outside portable bytes;
- provides deterministic integrity and relocation evidence without a new runtime service;
- preserves open, filesystem-portable artifacts with no recurring infrastructure cost.

Tradeoffs:

- transport/compression remains an operator/external concern;
- retention is planning-only;
- a future deployment still needs separately approved identity/auth, secret management, private data placement, backup cadence, operational monitoring, and rollback execution;
- bundle creation is administrative local tooling, not a customer-facing product surface.
