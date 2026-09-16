# Security posture

Releases 0.1–0.6 are accepted on `main`. Releases 0.5 and 0.6 add pure/local adapters for already-normalized WQT evidence and already-sanitized ZeroRank evidence respectively. Neither adds a deployed service, provider networking, production identity provider, listener, customer evidence, cloud deployment, provider credential handling, or sensor execution.

Every owned repository operation still requires an opaque context recognized by the package-internal tenant-authority registry. The production persistence surface exposes only the `TenantContext` type and `requireTenantContext`; persistence cannot mint authority. Release 0.4 deliberately permits exactly one additional production caller of `issueTenantContext`: `src/authentication/principal.ts`, where a trusted authenticator adapter may register a verified principal and exact tenant/site/site-scope/provider/provider-connection grants. Request/transport/service/provider-adapter code cannot call the issuer. Record IDs, scope fields, valid evidence, WQT/ZeroRank site or workspace/target values, provider/source IDs, hashes, clones, casts, and proxies cannot create authority.

`issueAuthenticatedPrincipal` is not a production IdP. Releases through 0.6 add no password, JWT signing, OAuth/session mechanism, API-key database, credential storage, login/UI, or revocation service. Tests use only explicit synthetic credentials/evidence. A future production authenticator remains separately gated.

The accepted authenticated route is an in-process `POST /v1/evidence/collections` handler. It bounds Authorization to 1,024 characters and actual streamed request bytes to 49,152; Content-Length is never trusted as the only bound. It accepts JSON with absent/identity content encoding, uses fatal UTF-8, validates a strict one-part envelope, validates canonical evidence, authorizes the exact grant, persists one part, then queries stored progress before returning `complete`. Errors and successes are explicitly projected and do not echo credentials, evidence, grants, stack traces, SQLite text, or existence details. See [ingestion guide](docs/ingestion.md).

Accepted Release 0.3 persistence defenses remain intact: exact live user-schema verification, explicit INSERT column lists, composite ownership foreign keys, bounded canonical evidence, `BEGIN IMMEDIATE` mutations, deferred multi-statement reads, and per-part transactions. Each part commits or rolls back atomically; a multipart collection is not one transaction. An observation must reference a source carried in the same part. Persistence progress is derived from stored parts/source rows and cannot be replaced by canonical completeness claims.

## Release 0.5 WQT adapter boundary

[`src/adapters/wqt.ts`](src/adapters/wqt.ts) consumes only exact already-normalized WQT bytes plus explicit trusted adapter configuration. It does not authenticate, issue `TenantContext`, persist, read files, run WQT, execute SiteOne/Lighthouse, dispatch/download Actions, fetch URLs, or use provider credentials. It imports no WQT runtime package and contains no network/listener client.

The WQT normalized artifact is untrusted evidence. Release 0.5 supports exactly `ldw.website-quality.v1` minor `1`, enforces evidence-only/no-quality-gate flags and expected SiteOne/Lighthouse tool identities, requires artifact site/target to match trusted expectations, and verifies the flattened observation copy exactly against nested provider observations. Unknown fields/versions, duplicate source keys, contradictory duplicate representations, oversized/malformed input, and unrepresentable output fail closed.

Trusted configuration, not WQT evidence, supplies G.A.S. tenant/site/site-scope, provider-connection IDs, canonical timestamps, and source availability. Hash equality does not establish authority or source retrievability. WQT's timezone-less SiteOne `executedAt` remains only in hashed source material; the adapter never guesses that it is UTC. Canonical source time is an explicit trusted point timestamp.

SiteOne and Lighthouse remain separate provider streams. Source/tool versions remain visible in source integrity and cohort configuration so a version change can create a comparison discontinuity rather than masquerade as a site change. Scores/findings remain evidence only; Release 0.5 adds no LDW quality threshold, inference, priority, recommendation, or actionability label.

The adapter bounds exact input bytes to 1 MiB and output to accepted persistence limits: at most 64 parts, 16 sources per part, 32 observations per part, 65,536 canonical bytes per complete part, and 1,024 provider source units. Packing keeps every source and all derived observations in the same part and validates every final part with accepted `parseCollectionBatch`. Failure is explicit; there is no truncation, dropped evidence, silent paging, or cross-part observation reference.

## Release 0.6 ZeroRank adapter boundary

[`src/adapters/zerorank.ts`](src/adapters/zerorank.ts) consumes only exact UTF-8 bytes for the inner sanitized ZeroRank `ldw.zerorank-evidence.v1` minor-0 artifact plus explicit trusted adapter configuration. It does not poll ZeroRank, call Activepieces, receive a provider credential, authenticate, issue `TenantContext`, persist, open a listener, deploy, or perform correlation/recommendation/action work.

The sanitized artifact is untrusted evidence. Closed exporter surfaces and exact request/completeness semantics are validated fail-closed. Successful duplicated workspace projections must reconcile before the reconciled workspace identity is matched to trusted configuration. A failed endpoint remains explicit `unavailable` evidence rather than successful empty evidence; unknown endpoint exhaustion remains partial/unknown rather than becoming zero.

Trusted configuration, not ZeroRank evidence, supplies G.A.S. tenant/site/site-scope, expected workspace and target, provider connection, canonical timing, and source availability. Optional upstream run/start/end fields stay source material only. The adapter emits five endpoint-specific `zerorank` collection streams and maps only explicitly authorized runtime-typed source fields. Numeric zero remains observed zero; null, absence, malformed scalar types, and unknown remainder remain distinct. Opaque source-passthrough values are hash material only and cannot create authority or behavior.

The adapter reuses accepted bounded `CollectionBatch` limits and validates every final part. There is no truncation, hidden paging, provider networking, credential persistence, software-license grant, new dependency, or Release 0.7 implementation. See [ZeroRank adapter guide](docs/adapters/zerorank.md).

The local process and configured database path remain trusted. SQLite file access is not a customer security boundary: anyone controlling the process/files can bypass the repository, disable constraints, or rewrite hashes. Canonical hashes detect accidental/stale mutations, not hostile authenticity failures. Test-network tripwires are an accidental-call check, not an operating-system sandbox. No credential fields or raw-provider-payload store exist; bounded strings still require safe upstream handling and must never contain secrets.

## Repository and evidence boundary

This public repository must contain no secrets, credentials, tokens, API keys, customer evidence, customer names as test data, client analytics, PHI, CUI, private vendor payloads, confidential business records, production secrets, or private account identifiers. Release 0.5's checked-in WQT-style fixture is explicitly synthetic (`example-site` / `https://example.test`), and Release 0.6's checked-in ZeroRank fixture is explicitly synthetic. Private runtime evidence belongs outside public GitHub with separately defined access, retention, and deletion controls.

Review staged content before publishing. Ignore patterns only reduce accidental additions; they do not remove tracked material or establish access control.

Evidence is always untrusted data. Instruction-like text may be persisted as text but cannot alter instructions, create authority, generate/execute SQL, trigger URL fetches, invoke callbacks, or authorize external actions. Releases through 0.6 call no LLM and the G.A.S. runtime paths under this proof make no outbound provider/network request.

## Future critical controls

- **Tenant isolation:** every persistence operation remains tenant-context scoped; the accepted application boundary authorizes exact validated ownership before persistence. Release 0.5 and Release 0.6 adapter tests prove adapted evidence cannot cross trusted tenant authority. Future correlation, approval, export, and remeasurement need adversarial tenant-isolation tests when authorized.
- **Identity:** a production authenticator, credential lifecycle, revocation, abuse/rate controls, and deployment-layer identity remain future gated work. The injected Release 0.4 authenticator is an architectural seam only.
- **Untrusted input:** provider payloads, retrieved page content, normalized WQT evidence, sanitized ZeroRank evidence, and other evidence remain inert input. Future display/adapter paths must preserve that property and provenance.
- **Least privilege:** separate sensor/read adapters from write/action adapters and their credentials. Read access never grants write access. A recommendation, including one accepted by a human, does not automatically authorize a production change.
- **Dependencies:** review necessity, maintenance, licenses, and advisories before adoption. Releases 0.5 and 0.6 add no dependency; Zod/TypeScript/Node types remain the existing locked set.
- **Release controls:** `main` remains governed by PR, linear/squash history, review-thread resolution, and the required `contracts` check. Release 0.6 is accepted; Release 0.7 and cloud deployment remain separately gated.

## Report a vulnerability privately

Use LDW's existing public business contact, [eddie@lowcountrydigitalworks.com](mailto:eddie@lowcountrydigitalworks.com), as published on the [Lowcountry Digital Works website](https://lowcountrydigitalworks.com). Identify G.A.S. Engine and give a minimal description, affected revision, and safe reproduction steps. Do not post exploit details, secrets, or private evidence in public issues or PRs; use synthetic or redacted examples in the initial report and coordinate any sensitive follow-up privately.

No formal security response SLA or bug bounty is offered by this document. Reporting does not authorize testing against customer or production systems.