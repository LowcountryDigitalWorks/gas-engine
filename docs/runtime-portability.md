# Release 0.20 — Private-Runtime Packaging & Portability Readiness

Release 0.20 is a **CANDIDATE / NOT ACCEPTED** portability and recovery-readiness proof under Issue #74 / PR #75. It remains pure/local and administrative. It does not deploy G.A.S., create a customer runtime, or authorize Release 1.0.

## Purpose

The candidate proves that accepted local G.A.S. state can be backed up safely, packaged deterministically, integrity verified, moved to a different filesystem root, reopened under the accepted SQLite migration/schema guards, and read again under newly issued trusted authority.

The owning implementation is `src/runtime/portable-runtime.ts`. The profile and manifest are application-local Release 0.20 models, not new canonical public wire schemas.

## Strict runtime profile

The versioned runtime profile contains only non-secret configuration:

- package compatibility;
- logical SQLite role/path and classification;
- generated-artifact root and explicitly allowed roles/classifications;
- retention-policy inputs;
- optional trusted build identity.

Unknown fields fail closed. Passwords, API/OAuth tokens, credentials, cookies, sessions, private keys, and serialized `TenantContext` do not belong in the profile or bundle.

Logical paths are canonical portable relative paths. Absolute, drive-qualified, traversal, backslash, empty-segment, duplicate, and bundle-root-escape paths fail closed. The absolute machine root never contributes to semantic bundle identity.

## SQLite backup and reopen

Release 0.20 uses the pinned Node 24.19 `node:sqlite` online `backup(...)` primitive. It does not byte-copy a live SQLite database and adds no backup dependency.

The seam is administrative only. It does not expose a raw database handle through tenant-facing repository APIs. Backup targets must be inside the controlled bundle root and may not silently overwrite an existing file.

After backup, the database is independently opened through both accepted local repository implementations. Existing migration/schema verification remains authoritative and no migration/table is added.

## Portable directory and manifest

A portable bundle is a directory plus strict `portable-manifest.json`. Compression and transport are external concerns.

Each owned entry binds:

- role;
- canonical logical path;
- exact SHA-256;
- exact byte count;
- classification;
- required/optional state;
- retention class;
- optional semantic identity and explicit retention timestamp.

The top-level identity is `portable-runtime-bundle:<sha256>`. It binds package compatibility, optional trusted build identity, runtime-profile identity, manifest entries, retention policy identity, and fixed recovery metadata. It does not depend on absolute root, inode, mtime, staging path, workflow run ID, export wall-clock time, or JSON pretty-print formatting.

## Explicit artifact admission

Generated artifacts are supplied explicitly. Release 0.20 does not recursively crawl a repository or artifact directory to decide what belongs in a bundle.

The candidate proof includes one strict accepted Release 0.18 managed-service-run artifact and preserves its semantic run identity. The same bounded seam may carry accepted Release 0.18/0.19 outputs under their explicit roles when separately supplied.

Raw provider payloads, credentials, `.git`, source-repository contents, caches, logs, unrelated files, and unknown roles are never auto-included. The strict verifier rejects unowned files in the final bundle directory.

## Verification and relocation

Verification strict-parses the profile and manifest, validates logical paths before filesystem resolution, constrains all paths to the bundle root, rejects symlinked manifest-owned paths, recomputes hashes/byte counts, rejects missing required files, validates the deterministic bundle identity, and reopens SQLite through the accepted schema guards.

The synthetic proof physically copies the exact bundle from root A to root B and verifies the same bundle identity at both roots. Representative Alpha/Beta evidence and review-ledger state are then read using newly issued trusted test authority. No tenant authority or authenticated session is deserialized from bundle bytes.

## Retention planning only

Release 0.20 computes a deterministic retention plan from an explicit trusted evaluation time, explicit retention classes, and explicit semantic timestamps. States are `retain`, `eligible_for_deletion`, `protected`, or `not_evaluable`.

Filesystem mtime alone never establishes deletion eligibility. Future semantic timestamps fail closed. The release includes no deletion scheduler, background retention worker, or destructive production delete executor.

## Recovery, rollback, and decommission

The manifest records deterministic operator requirements for later separately authorized operation:

- exact bundle ID and package compatibility;
- database/profile/artifact integrity material;
- strict verification procedure;
- restore-to-new-root procedure;
- explicit operator-selected rollback bundle;
- no implicit "latest" bundle selection;
- decommission checklist;
- credentials/authentication explicitly external to the bundle.

Release 0.20 does not implement deployment rollback or mutate any cloud/account resource.

## Identity and authentication boundary

Database IDs and artifact IDs are data/selectors, not authority. Restored storage does not restore authenticated sessions or `TenantContext`. Any future deployed runtime must obtain trusted authentication externally through a separately authorized design compatible with the accepted authority issuer.

Credentials belong in deployment-owned secret management and remain absent from portability bundles. Release 0.20 selects no identity provider. Customer-owned deployment with LDW-scoped access remains the preferred future ownership model when a later gate justifies deployment.

## WQT and automation boundary

Issue #63 remains separate. Release 0.20 does not create `gas-operations`, implement the private WQT semantic consumer/history, change WQT retention or recurrence, run a real customer WQT proof, or move private/customer evidence into public GitHub. REPORT-AUTO delivery also remains separate.

## Bounds

The candidate fails closed above these Product-frozen ceilings:

- manifest-owned files: 128;
- single non-database artifact: 8,000,000 bytes;
- total bundle: 64,000,000 bytes;
- logical path: 240 UTF-8 bytes;
- retention classes: 16.

There is no silent truncation or hidden paging.

## Synthetic preview

Run:

```text
npm run preview:portability
```

The preview uses only synthetic/example.test state under ignored `local-artifacts/`. It proves two isolated synthetic tenants, accepted SQLite evidence/review state, a strict Release 0.18 run artifact, online backup, deterministic bundle/profile identity, root-A/root-B relocation, schema reopen, newly issued authority, representative reads, storage measurements, retention planning, and recovery/decommission metadata.

## Explicit exclusions

Release 0.20 adds no production/customer deployment, cloud resource, Workers/D1, Docker/OCI/Kubernetes, provider networking/polling, credential/secret store, identity provider, scheduler/background worker, database migration/table, canonical public wire schema, destructive production retention, customer portal/SaaS, private WQT implementation, REPORT-AUTO delivery, paid service, DNS/domain/email/billing mutation, or Release 1.0 implementation.

Incremental recurring cash target remains `$0`.
