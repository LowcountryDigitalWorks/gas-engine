# Security posture

Releases 0.1–0.3 are accepted on `main`. Release 0.4 is a draft authenticated bounded-ingestion candidate. It adds one in-process write-only Request/Response path and a trusted authenticated-principal seam; there is still no deployed service, provider networking, production identity provider, listener, customer evidence, or cloud deployment.

Every owned repository operation still requires an opaque context recognized by the package-internal tenant-authority registry. The production persistence surface exposes only the `TenantContext` type and `requireTenantContext`; persistence cannot mint authority. Release 0.4 deliberately permits exactly one additional production caller of `issueTenantContext`: `src/authentication/principal.ts`, where a trusted authenticator adapter may register a verified principal and exact tenant/site/site-scope/provider/provider-connection grants. Request/transport/service code cannot call the issuer. Record IDs, scope fields, valid evidence, headers other than the authenticated credential, hashes, clones, casts, and proxies cannot create authority.

`issueAuthenticatedPrincipal` is not a production IdP. Release 0.4 adds no password, JWT signing, OAuth/session mechanism, API-key database, credential storage, login/UI, or revocation service. Tests use only explicit `SYNTHETIC-NOT-A-SECRET` credentials. A future production authenticator remains separately gated.

The authenticated route is an in-process `POST /v1/evidence/collections` handler. It bounds Authorization to 1,024 characters and actual streamed request bytes to 49,152; Content-Length is never trusted as the only bound. It accepts JSON with absent/identity content encoding, uses fatal UTF-8, validates a strict one-part envelope, validates canonical evidence, authorizes the exact grant, persists one part, then queries stored progress before returning `complete`. Errors and successes are explicitly projected and do not echo credentials, evidence, grants, stack traces, SQLite text, or existence details. See [ingestion guide](docs/ingestion.md).

Accepted Release 0.3 persistence defenses remain intact: exact live user-schema verification, explicit INSERT column lists, composite ownership foreign keys, bounded canonical evidence, `BEGIN IMMEDIATE` mutations, deferred multi-statement reads, and per-part transactions. Each part commits or rolls back atomically; a multipart collection is not one transaction. An observation must reference a source carried in the same part. Persistence progress is derived from stored parts/source rows and cannot be replaced by canonical completeness claims.

The local process and configured database path remain trusted. SQLite file access is not a customer security boundary: anyone controlling the process/files can bypass the repository, disable constraints, or rewrite hashes. Canonical hashes detect accidental/stale mutations, not hostile authenticity failures. Test-network tripwires are an accidental-call check, not an operating-system sandbox. No credential fields or raw-provider-payload store exist; bounded strings still require safe upstream handling and must never contain secrets.

## Repository and evidence boundary

This public repository must contain no secrets, credentials, tokens, API keys, customer evidence, customer names as test data, client analytics, PHI, CUI, private vendor payloads, confidential business records, production secrets, or private account identifiers. Later fixtures must be clearly synthetic. Private runtime evidence belongs outside public GitHub with separately defined access, retention, and deletion controls.

Review staged content before publishing. Ignore patterns only reduce accidental additions; they do not remove tracked material or establish access control.

Evidence is always untrusted data. Instruction-like text may be persisted as text but cannot alter instructions, create authority, generate/execute SQL, trigger URL fetches, invoke callbacks, or authorize external actions. Release 0.4 calls no LLM and makes no outbound network request.

## Future critical controls

- **Tenant isolation:** every persistence operation remains tenant-context scoped; the new application boundary authorizes exact validated ownership before persistence. Future correlation, approval, export, and remeasurement need adversarial tenant-isolation tests when authorized.
- **Identity:** a production authenticator, credential lifecycle, revocation, abuse/rate controls, and deployment-layer identity remain future gated work. The injected Release 0.4 authenticator is an architectural seam only.
- **Untrusted input:** provider payloads, retrieved page content, and other evidence remain inert input. Future display/adapter paths must preserve that property and provenance.
- **Least privilege:** separate sensor/read adapters from write/action adapters and their credentials. Read access never grants write access. A recommendation, including one accepted by a human, does not automatically authorize a production change.
- **Dependencies:** review necessity, maintenance, licenses, and advisories before adoption. Release 0.4 adds no dependency; Zod/TypeScript/Node types remain the existing locked set.
- **Release controls:** `main` remains governed by PR, linear/squash history, review-thread resolution, and the required `contracts` check. Cloud deployment requires its own later gate.

## Report a vulnerability privately

Use LDW's existing public business contact, [eddie@lowcountrydigitalworks.com](mailto:eddie@lowcountrydigitalworks.com), as published on the [Lowcountry Digital Works website](https://lowcountrydigitalworks.com). Identify G.A.S. Engine and give a minimal description, affected revision, and safe reproduction steps. Do not post exploit details, secrets, or private evidence in public issues or PRs; use synthetic or redacted examples in the initial report and coordinate any sensitive follow-up privately.

No formal security response SLA or bug bounty is offered by this document. Reporting does not authorize testing against customer or production systems.
