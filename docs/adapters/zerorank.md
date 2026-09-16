# ZeroRank sanitized-evidence adapter — Release 0.6

Release 0.6 is a bounded **pure/local import/export adapter proof** for the already-sanitized artifact emitted by the LDW-owned ZeroRank read-only Automation flow. G.A.S. does not poll ZeroRank, call Activepieces, hold a ZeroRank credential, import Automation runtime code, create tenant authority, persist by itself, open a listener, deploy cloud resources, use runtime AI/BYOK, or implement correlation/recommendation/action logic.

Authoritative design evidence is G.A.S. Issue #9 and business-operations #173. The upstream flow remains `LDW #173-ZR — ZeroRank Proof Intake` (`lkB9K0cHL6mzCurAWWw2c`), published revision #4, using the existing `zerorank_read_only` credential outside G.A.S. Step 9 `Build ZeroRank v1 Sanitized Artifact` is design evidence only; it is not a runtime dependency or pin.

## Public API and exact input

[`src/adapters/zerorank.ts`](../../src/adapters/zerorank.ts) exports `adaptZeroRankSanitizedEvidence(bytes, trustedConfig)` plus bounded configuration/result/error types and version constants.

The input is the **inner sanitized artifact object only**, encoded as exact UTF-8 bytes and bounded to 1 MiB before decoding. The Activepieces outer `{ artifact, meta }` step result is not accepted.

Exactly one source contract is supported:

- `schemaVersion === "ldw.zerorank-evidence.v1"`
- `schemaMinorVersion === 0`

Unknown major or minor versions fail closed.

The structural parser is deliberately strict at every closed exporter surface: artifact root, root workspace, collection, cadence, endpoints, endpoint envelopes, requests, pagination, projected row key sets, and workspace organization. Every allowlisted row value is optional and source-preserved at the exporter boundary; semantic scalar typing is checked only when a G.A.S. observation is constructed. `prompts.sourceMetadata`, `prompts.topic`, `prompts.tags`, and `sourceUrls.brandIds` remain opaque source-passthrough values and are used only as inert bounded hash material.

## Trusted configuration and authority separation

The caller supplies trusted configuration containing:

- G.A.S. scope: tenant, site, and site-scope revision;
- expected ZeroRank workspace ID;
- expected exact canonical HTTPS target origin;
- ZeroRank provider-connection ID;
- trusted canonical `observedAt`, `startedAt`, `endedAt`, `collectedAt`, and `receivedAt`;
- explicit source availability.

Artifact workspace/target values are match data only. Before trusted workspace matching, a successful workspace endpoint must own a usable `record.id` that exactly reconciles with root `workspace.id`; optional root/record `name` presence must agree, and when present their JSON semantic values must match. Contradictory duplicate projections fail closed as invalid source material. Evidence cannot select tenant, site, site-scope revision, provider connection, principal, grant, or `TenantContext`. The adapter imports no authentication or tenant-authority issuer and performs no persistence.

The current published proof artifact carries exact target origin `https://lowcountrydigitalworks.com`, cadence `weekly` / `Monday 12:00 UTC`, source API base `https://api.zerorank.ai/api/v1`, and version signal `/api/v1`. Request metadata is validated exactly so exporter drift in paths, days, or limits fails closed.

## Endpoint collection split

One artifact becomes five independent G.A.S. collections under provider `zerorank` and the trusted provider connection:

- `rankings`
- `prompts`
- `chats`
- `sources`
- `sourceUrls`

Workspace is match/provenance context, not a separate Release 0.6 evidence collection.

Each successful row is one source unit keyed by its required stable endpoint ID. Rankings/prompts accept bounded nonnegative numeric identities; chats/sources/sourceUrls require bounded nonempty string identities. Missing, null, unusable, or duplicate stable IDs fail that adaptation rather than fabricate an identity. Incoming row order is ignored: units are normalized into deterministic endpoint ID order before semantic collection identity is calculated.

## Completeness and endpoint failure

The adapter validates the exporter completeness contract before mapping:

- workspace success: `not_applicable`;
- rankings/chats/sources/sourceUrls success: `unknown` only;
- prompts success: `complete` only when `page === 1`, `lastPage === 1`, `pagination` owns a numeric total, and row count exactly equals total;
- any endpoint failure: the published failure envelope (`returnedCount=0`, `completeness=failed`, `pagination={}`, `rows=[]`).

G.A.S. mapping is intentionally conservative:

- proven-complete prompts -> canonical `complete` with exact `expectedCount` and `receivedCount`;
- successful unknown-exhaustion endpoints -> canonical `partial` with received source-unit count, **no expectedCount**, and a bounded unknown-exhaustion reason;
- failed endpoint -> one zero-source canonical `unavailable` collection with a bounded failure reason.

A failed endpoint is therefore never represented as a successful empty universe, and unknown remainder never becomes zero.

## Exact bounded evidence mapping

Every source unit's integrity digest covers deterministic canonical material containing artifact schema/version, workspace/target, collection metadata, endpoint/request/completeness/pagination context, stable source identity, and the entire sanitized projected row. Opaque nested passthrough content is therefore retained only through source integrity and cannot establish authority or behavior.

Only these fields create normalized observations, and only after exact runtime type checks:

### Rankings

Numeric vendor evidence when the runtime JSON value is a bounded number:

- `rank`
- `mentions`
- `sentiment`
- `visibilityPercentage`
- `growth`

`name`, `type`, `domain`, `color`, and any other allowlisted display material remain only in source integrity. `days=7` stays request configuration; no prompt/model relationship or row observation window is fabricated.

### Prompts

- `status` -> vendor text evidence when it is a bounded nonempty JSON string;
- `aiSearchVolume` -> vendor numeric evidence when it is a bounded JSON number.

Prompt text/topic/tags/timestamps remain source evidence only. Real runtime prompt text is never committed to this public repository.

### Chats

- `sourceCount` -> numeric evidence;
- `citationCount` -> numeric evidence;
- `parsingStatus` -> text evidence.

A bounded string `aiModel` is preserved verbatim in comparison dimensions. A usable `promptId` may create only the explicit bounded prompt relationship; no ranking relationship is inferred. Question/location/createdAt remain source evidence.

### Sources

- `avgCitations` -> numeric evidence when it is a JSON number.

`urlCount` remains source-preserved vendor material and is never coerced from its observed string representation into a number. Domain/type/usage remain source evidence.

### Source URLs

Numeric evidence when runtime values are JSON numbers:

- `totalUsage`
- `totalCitations`
- `uniqueChats`
- `usagePercentage`

`sourceDomain` remains only a weak source string, `brandIds` remain opaque, `uniqueChats` remains a count rather than a chat-ID relationship, and `isAnalyzed` remains source evidence.

## Missingness and wrong runtime types

For every deliberately mapped metric:

- numeric zero remains `observed(number 0)`;
- JSON `null` becomes explicit `unknown` with a null-specific reason;
- absent property becomes explicit `unknown` with an absent-specific reason;
- wrong scalar/container type is never coerced and becomes explicit `unknown` when safe for that mapped metric;
- values outside current G.A.S. metric bounds become explicit `unknown` rather than being clamped.

Stable identity and trusted-config match fields are stricter: unusable values fail closed.

## Timing, identity, and provenance

Canonical G.A.S. source time is a point window at trusted `observedAt`. Collection lifecycle timing comes exclusively from trusted configuration and must satisfy existing chronology rules.

Optional upstream `collection.runId`, `startedAt`, and `endedAt` remain source metadata only. They never override G.A.S. timing and are not required. No Activepieces provenance patch is needed.

For each endpoint, semantic collection identity is derived deterministically from validated semantic endpoint evidence plus trusted configuration. Exact input-byte SHA-256 is returned separately for diagnostic integrity and is formatting-sensitive; semantic collection identity is not. The deterministic G.A.S. collection ID is used as every observation's provenance `runId`.

## Deterministic multipart packing

The adapter emits only ordinary accepted `CollectionBatch` values. Every source unit and all observations derived from it stay in the same part.

Packing follows the accepted Release 0.5 pattern:

1. build complete source units in deterministic endpoint-ID order;
2. greedily try each whole unit;
3. enforce at most 16 sources and 32 observations;
4. canonicalize each candidate with worst-case `part:64, parts:64`;
5. close a part before the candidate would exceed 65,536 canonical bytes;
6. compute actual part count;
7. rebuild final part numbers;
8. validate every final batch with current `parseCollectionBatch`.

The adapter fails explicitly when one source unit cannot be represented by bounded canonical source integrity, more than 64 parts are required, more than 1,024 source units are present, or final output cannot satisfy accepted G.A.S. validation. There is no truncation, dropped row, hidden pagination, or cross-part observation reference.

## Security, privacy, cost, and scope

The checked-in fixture is wholly synthetic. It contains fabricated prompts, chats, domains, workspace identity, and provider values. No runtime ZeroRank artifact, private LDW prompt/question corpus, customer evidence, PHI/CUI, credential, header, API key, or dormant write material belongs in public GitHub.

Release 0.6 adds no dependency, SQL schema change, network/provider client, Activepieces runtime, listener, cloud resource, scheduler, AI/BYOK path, recommendation/action path, or Release 0.7 correlation logic. Incremental recurring cost remains **$0**. The package remains private; no software license grant, npm publication, or tag is created.
