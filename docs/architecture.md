# Architecture baseline

Release 0.1 defines the accepted direction for a bounded LDW internal managed-service evidence-engine proof. [Release 0.2 canonical contracts](contracts.md) implement local wire validation, cross-field checks, and deterministic identity helpers. [Release 0.3 persistence](persistence.md) is accepted on `main` and adds tenant-safe local evidence storage. [Release 0.4 authenticated ingestion](ingestion.md) is accepted on `main` and adds one authenticated, bounded, write-only in-process ingestion boundary. [Release 0.5 WQT adaptation](adapters/wqt.md) is accepted on `main` and adds one pure/local adapter for already-normalized WQT evidence. [Release 0.6 ZeroRank adaptation](adapters/zerorank.md) is accepted on `main` and adds one pure/local adapter for the exact sanitized ZeroRank v1/minor0 artifact. [Release 0.7 longitudinal diff](analysis/diff.md) is accepted on `main` and adds deterministic same-stream evidence comparison plus non-ranked review-attention filtering over coherent tenant-scoped persisted snapshots.

**Release 0.8 is accepted and merged on `main` through PR #16.** It adds only evidence-linked human-authored recommendation revision history plus explicit measurement/outcome ledger infrastructure. Operator UI, external execution, cross-provider correlation, automated prioritization/recommendation generation, provider/network runtime, schedulers, AI, cloud deployment, and Release 0.9 remain separately gated. See [review-ledger guide](review-ledger.md) and [ADR 0007](decisions/0007-human-review-measurement-ledger.md).

## Objectives and operating model

G.A.S. means **Generative / Answer / Search**. The engine should normalize replaceable sensor evidence, retain provenance/history, support deterministic longitudinal comparison, preserve explicit human review decisions, and support subsequent measurement/outcome history without inventing universal scoring or action authority. Its value must be demonstrated through reduced recurring LDW delivery and reconciliation labor.

The intended lifecycle is:

> OBSERVE → NORMALIZE → COMPARE → CORRELATE ONLY WHEN SEMANTICS SUPPORT IT → PRIORITIZE ONLY WITH AN EXPLICIT POLICY → RECOMMEND → APPROVE WHEN REQUIRED → ACT ONLY THROUGH SEPARATELY AUTHORIZED PATHS → RE-MEASURE → REPORT OUTCOME

An observation does not establish a conclusion, a mechanical diff is not an inference, a human-authored recommendation is not an automatically generated ranking, and approval does not erase the need for separate execution authority. Accepted Releases through 0.8 implement contracts, local evidence persistence, authenticated bounded intake, deterministic WQT evidence adaptation, deterministic sanitized ZeroRank evidence adaptation, deterministic same-stream longitudinal comparison, and the bounded human review/measurement/outcome ledger. Release 0.8 adds human review history and explicit measurement/outcome records only. Cross-provider correlation, automatic prioritization, action/execution, UI, and cloud workflow remain future separately gated work.

## Ownership and source-of-truth boundaries

| System | Intended ownership | Boundary |
| --- | --- | --- |
| G.A.S. Engine | Normalized evidence model; provenance/history; deterministic longitudinal comparison; evidence-linked human review history; measurement/outcome history; future compact LDW operator experience | Own the LDW evidence/service-history record while preserving links to canonical observations; no universal proprietary G.A.S. score, automatic Release 0.8 recommendation engine, or action authority. |
| Website Quality Toolkit (WQT) | Existing LDW site-side technical/Search evidence generation through SiteOne and Lighthouse | Consume its normalized evidence; do not rebuild WQT, execute its scanners, or create a G.A.S. provider/network client. |
| ZeroRank | Replaceable Generative observation/sensing | Consume the accepted sanitized Release 0.6 evidence boundary without polling ZeroRank from G.A.S.; its observations and scores remain provider evidence, not authoritative LDW truth. |
| SuiteDash | Customer/company/client-workflow and service-enrollment experience | Do not duplicate CRM or client operations in G.A.S. |
| Activepieces | Deterministic cross-system workflow/event transport where useful | Must not become the only durable G.A.S. evidence or system-of-record layer. G.A.S. does not call Activepieces at runtime in Releases 0.6–0.8. |
| GitHub | Source, technical work, PR/review/release evidence, and separately governed automation paths | No parallel autonomous GitHub-writing mechanism. Private runtime evidence stays outside public GitHub. |

G.A.S. is the intended durable record of its own normalization, deterministic comparison, human review decisions, and measurement/outcome history. It does not rewrite provider history, become the client-workflow authority, or treat a vendor score as an LDW conclusion. Sources may disagree; retain disagreement and provenance rather than overwrite it with unsupported consensus.

## Evidence concepts

| Concept | Meaning and separation |
| --- | --- |
| Source/raw evidence | The source material received or referenced, subject to its access and retention constraints. Preserve identity and integrity references. |
| Normalized observation | A source observation expressed consistently with scope, time, provenance, completeness, and an explicit value or missing-data state. Normalization does not make it a verified conclusion. |
| Mechanical longitudinal delta | Application-local deterministic classification of compatible canonical observations as unchanged/changed/appeared/missing-from-current/coverage-unknown. It is not inference, priority, or recommendation. |
| Derived inference | A future interpretation or correlation derived from identified observations and a recorded method/version. Distinguish uncertainty and conflicting evidence. Release 0.8 does not generate inference records. |
| Recommendation | A human/trusted-caller-authored response proposal linked to canonical evidence, rationale, explicit review lifecycle, immutable revision history, and unassessed priority in Release 0.8. It carries no execution authority. |
| Action | A separately authorized execution attempt and its record, including what actually happened. Acceptance of a recommendation is not an action. Release 0.8 does not implement actions. |
| Measurement | An explicit caller-recorded baseline/follow-up measurement built from selected canonical observations under defined scope/period and comparability rules. |
| Outcome | A human/trusted-caller-declared assessment over resolved measurements. Numeric direction alone does not determine improved/regressed/unchanged and outcome creation grants no action authority. |

These concepts must never be collapsed for convenience. Retain links between them so operators can trace a recommendation or outcome back to canonical evidence and preserved review history.

### Missing-data semantics

Every normalized observation must distinguish at least:

| State | Meaning |
| --- | --- |
| `observed(value)` | A value was observed. Numeric zero is a real observed value. |
| `unknown(reason)` | The value cannot be determined from available evidence. |
| `unavailable(reason)` | The relevant evidence cannot currently be accessed, for example because a provider is unavailable. |
| `not_collected(reason)` | Collection was not performed for this observation. |
| `not_applicable(reason)` | The observation does not apply to the specified scope. |

Missing or unavailable data must **never silently become zero**. Preserve the reason and state through normalization, comparison, review, measurement, and reporting. Do not present an apparent improvement merely because a source stopped reporting. Release 0.5 maps null/missing WQT source scores/status to explicit `unknown` while preserving numeric zero as observed zero. Release 0.6 likewise preserves ZeroRank zero as observed zero, distinguishes null/absent/wrong-type mapped evidence, maps failed endpoints to `unavailable`, and leaves unknown endpoint exhaustion explicit rather than inventing zero remainder. Accepted Release 0.7 compares these states exactly: missing-state or reason transitions are `changed`; unmatched observations under partial/unavailable/failed opposite coverage are `coverage_unknown`, never zero or removal/fix claims. Release 0.8 measurements reuse exact canonical values/missingness rather than inventing replacement values.

### Provenance and history

Evidence should retain enough provenance to identify provider/source and source identity, adapter/source-schema versions, site/scope and observation period, collected/received time, completeness, integrity reference, normalization version, and availability/retention state. Review history must additionally preserve recommendation revisions instead of overwriting prior decisions. Measurement/outcome records must preserve explicit baseline/follow-up and declared assessment context.

Retention constraints may prevent keeping raw payloads indefinitely; preserve permitted references and an explicit availability state rather than imply evidence remains retrievable. Release 0.8 recommendation evidence retrieval fails closed if canonical referenced evidence is absent/deleted; the application does not silently substitute another observation or persist a stale private copy.

## Providers and adapters

Separate provider-specific reading and transformation from the LDW evidence core. The accepted proof adapts WQT normalized evidence and read-only sanitized ZeroRank evidence; preserve provider-specific provenance and avoid coupling core decisions to a single vendor's score or payload structure. Provider-health concepts should distinguish collection failure, incomplete coverage, freshness, and schema/adapter compatibility from actual site observations.

Sensor/read adapters and write/action adapters are separate architectural responsibilities. A sensor's read credential or capability never implies write authority. Recommendation acceptance does not automatically authorize a production change. Future external actions must use separately approved execution/governance mechanisms.

### Accepted Release 0.5 WQT import/export seam

Release 0.5 deliberately **does not build a WQT scanner in G.A.S.** WQT remains responsible for SiteOne/Lighthouse execution and its normalized `ldw.website-quality.v1` artifact. G.A.S. accepts exact normalized UTF-8 bytes plus explicit trusted configuration and performs deterministic local mapping only.

One WQT artifact is split into separate G.A.S. provider collections for `siteone` and `lighthouse`. Individual normalized scores/findings/audits become bounded source units; observations derived from a unit remain beside that source in the same persistence part. The adapter preserves source/tool version in integrity and cohort configuration, rejects duplicate source keys/contradictory flattened copies, and uses byte-aware packing against accepted persistence bounds. See [WQT adapter guide](adapters/wqt.md) and [ADR 0004](decisions/0004-wqt-normalized-evidence-adapter.md).

WQT's timezone-less SiteOne `executedAt` is not promoted to canonical time. It remains only in hashed source material. Trusted caller-supplied `observedAt` supplies a point source window (`point`, UTC, zero duration), while trusted lifecycle timestamps remain subject to current G.A.S. chronology validation.

### Accepted Release 0.6 ZeroRank import/export seam

Release 0.6 deliberately **does not build a ZeroRank client or poller in G.A.S.** The upstream LDW-owned read-only sensing flow remains responsible for ZeroRank access and emits the sanitized inner `ldw.zerorank-evidence.v1` minor-0 artifact. G.A.S. accepts exact artifact UTF-8 bytes plus explicit trusted configuration and performs deterministic local mapping only; it does not call ZeroRank or Activepieces or receive the upstream provider credential.

The adapter reconciles duplicated successful workspace `id`/optional `name` projections before the reconciled workspace is compared with the trusted expected workspace. Artifact identity remains evidence/match material and cannot create tenant, site, site-scope, provider-connection, principal, grant, or timing authority.

One sanitized artifact is split into five endpoint-specific collections under provider `zerorank`: `rankings`, `prompts`, `chats`, `sources`, and `sourceUrls`. Workspace is match/provenance context rather than a sixth normalized evidence stream. Proven-complete prompt evidence may map to canonical complete; successful endpoints with unknown exhaustion remain partial without an invented expected count; failed endpoints map to explicit zero-source `unavailable` collections rather than successful empty evidence.

Only Issue #9-authorized runtime-typed vendor fields become observations. Numeric zero stays observed zero; null, absent, malformed scalar types, and unknown remainder retain explicit missingness. Optional upstream run/start/end values remain source material only. Trusted configuration supplies canonical point `observedAt`, collection lifecycle timestamps, G.A.S. scope, expected workspace/target, provider connection, and availability. Source units are deterministically ordered and packed byte-aware into ordinary accepted `CollectionBatch` parts within the existing 64-part / 16-source / 32-observation / 65,536-byte limits without truncation or hidden paging. See [ZeroRank adapter guide](adapters/zerorank.md) and [ADR 0005](decisions/0005-zerorank-sanitized-evidence-adapter.md).

### Accepted Release 0.7 longitudinal comparison seam

Accepted Release 0.7 adds no provider adapter or new sensing path. `compareEvidenceSnapshots(...)` remains the pure comparator over two already-resolved canonical collection snapshots. `diffEvidenceCollections(...)` is the tenant-safe persisted-snapshot application service. It resolves explicit baseline/current collection IDs through `getCollectionSnapshot(context, id)`, and each repository snapshot coherently returns canonical collection, persisted `CollectionProgress`, and bounded observations from one tenant-scoped consistent read snapshot.

Before matching observations, collections must prove the same semantic stream by exact compatibility of scope, provider, provider-connection presence/value, adapter, source schema, and full collection method. Collection IDs must differ and baseline source time may not be after current source time. Incompatible pairs are discontinuities and are never used for appeared/missing classification.

Within a compatible pair, the only observation key is accepted `cohortIdentityHash`. Omitted dimensions remain significant by omission, never wildcards. Duplicate semantic cohort identity in one snapshot fails closed. Exact canonical observation values determine unchanged versus changed; observed numeric pairs may expose descriptive subtraction only. Complete opposite coverage may establish `appeared` or `missing_from_current`; partial/unavailable/failed opposite coverage produces `coverage_unknown`.

The application-local result is deterministically ordered by cohort hash and bounded to 2,048 observations per snapshot, equal to accepted `64 parts × 32 observations`. It is not persisted and is not a canonical wire contract. General `listObservations(...)` remains uniformly capped at 100 records. The Release 0.7 2,048-observation capacity belongs only to `getCollectionSnapshot(...)`, which fails explicitly on overflow rather than truncating or hiding pagination. See [diff guide](analysis/diff.md) and [ADR 0006](decisions/0006-longitudinal-evidence-diff.md).

### Accepted Release 0.8 human-review and measurement/outcome seam

Release 0.8 adds no provider adapter, sensor, automatic recommendation engine, or network path. Its application service receives an already-issued trusted `TenantContext` and resolves canonical observations through the accepted evidence repository before recording caller/human intent in the bounded review ledger.

New recommendations must be canonical 1.0 recommendation records with `authorityClass = internal_review`, `priority.level = unassessed`, observation evidence only, revision 1, and `proposed` lifecycle. Caller-driven transitions append immutable revisions with stale expected-revision protection. `rejected`/`superseded` are terminal and accepted may only become superseded. Material content edits also append explicit revisions rather than mutating old records. Acceptance creates no action.

Measurements reuse canonical 1.0 measurement records. The caller explicitly selects canonical observations; measured values must exactly equal persisted canonical observation values. Baseline/follow-up comparability reuses accepted cohort/methodology/chronology rules. Due windows and pending states do not create scheduler or provider-read authority.

Outcomes reuse canonical 1.0 outcome records but are explicit human/trusted-caller declarations. G.A.S. never infers `improved`, `regressed`, or `unchanged` from numeric direction. Directional outcomes require resolved comparable measurements. Release 0.8 allows only `none` and `technical_verification` attribution at its application seam. See [review-ledger guide](review-ledger.md).

## Tenant security invariant

**Tenant identity is an authorization boundary. A globally unique object ID is never by itself authorization. Untrusted request or provider evidence never creates authority.**

Release 0.3 persistence requires a trusted opaque `TenantContext` and structurally scopes every implemented owned operation. Persistence can validate but cannot mint authority. Release 0.4 intentionally makes `src/authentication/principal.ts` the sole additional production caller of the package-internal tenant issuer. An injected authenticator verifies an opaque credential outside the evidence body and may return a registered immutable principal with exact tenant/site/site-scope/provider/provider-connection grants. Plain/cloned/cast/proxied principal-shaped data and evidence tenant IDs do not exist in the private authority registry and therefore cannot authorize anything.

Releases 0.5–0.7 do not change that issuer whitelist. Trusted adapter configuration supplies required scope/provider/timing expectations; artifacts remain evidence only. Release 0.7's baseline/current IDs are selectors only and repository reads enforce tenant ownership before evidence reaches the comparator.

Release 0.8 also does not change the issuer whitelist. Recommendation/measurement/outcome IDs, scope fields, evidence references, lifecycle values, and recommendation associations are selectors/data only. Review-ledger repository methods validate the trusted context and enforce tenant/site/scope ownership. Alpha/Beta and forged/plain/cloned/proxied context tests cover the new surfaces.

The bounded proof uses LDW-owned and synthetic evidence only. There is no production identity provider, password/JWT/OAuth/session/API-key store, live provider networking from G.A.S., customer deployment, or network listener. See [security posture](../SECURITY.md), [authorization](authorization.md), and [Release 0.8 review ledger](review-ledger.md).

## Initial vertical slice and future operator workflow

- Tenant: **Lowcountry Digital Works**.
- LDW-controlled public site: [https://lowcountrydigitalworks.com](https://lowcountrydigitalworks.com).
- Sources: WQT and read-only sanitized ZeroRank evidence.
- Second tenant: clearly synthetic, solely for testing/fixtures in authorized releases.

The proof loop is now:

> INGEST → NORMALIZE → STORE → DIFF → HUMAN REVIEW HISTORY → EXPLICIT RE-MEASUREMENT → HUMAN-DECLARED OUTCOME → FUTURE DISPLAY

Accepted Release 0.4 proves authenticated INGEST of already-valid bounded parts. Accepted Releases 0.5 and 0.6 prove deterministic provider NORMALIZE/adaptation seams. Accepted Release 0.7 proves deterministic DIFF. Accepted Release 0.8 proves human review history plus measurement/outcome ledger behavior. Cross-provider correlation, automated prioritization/recommendation generation, actions, and display remain unimplemented.

A compact future LDW operator experience may inspect source health, provenance, missing data, historical differences, preserved human recommendation history, measurements, and outcomes. That UI is Release 0.9+ scope and is not implemented here. Accepted recommendations would still require separate authority for any external execution.

## Build, adapt, reuse, and defer

| Direction | Scope |
| --- | --- |
| Build | LDW-specific evidence/provenance model; tenant-safe application boundaries; accepted Release 0.7 deterministic longitudinal comparison; accepted Release 0.8 human review/measurement/outcome ledger; future correlation/UI/action capabilities only under separate authority. |
| Adapt | WQT normalized evidence through accepted Release 0.5; sanitized read-only ZeroRank evidence through accepted Release 0.6. Keep both sensing systems replaceable and outside the G.A.S. runtime network boundary. |
| Reuse where useful | Existing WQT sensors, upstream read-only ZeroRank sensing, Cloudflare, SuiteDash, Activepieces, GitHub, and maintained lightweight OSS libraries following dependency and licensing review. |
| Defer until separately justified/authorized | Cross-provider/generic correlation, direction/severity/materiality/business-impact policy, automated prioritization/recommendation generation, Release 0.9+, production identity provider, GSC, GA4, Bing Webmaster, Google Business Profile, Decloak correlation, R2, Queues, Workflows, Durable Objects, runtime AI, BYOK, MCP, Brand2Social actions, customer portal, and external remediation. |
| Do not build | Another generic crawler, browser/scraper farm, generic SEO suite, ZeroRank clone, CRM, workflow engine, or universal proprietary G.A.S. score. Do not fork a generic SEO platform. |

## Candidate cloud direction, portability, and cost

Cloudflare **Workers, D1, and static operator assets** remain candidate architecture for a later bounded cloud proof. Accepted Releases through 0.8 create no cloud resource, deployment configuration, public runtime, cloud database, or provider account. R2, Queues, Workflows, and Durable Objects remain deferred until measured need.

Keep evidence concepts and provider boundaries portable. Release 0.3 defines a minimal repository interface with local SQLite adapter; Release 0.4 consumes that interface rather than coupling application code to SQLite. Releases 0.5 and 0.6 emit provider-neutral `CollectionBatch` values. Release 0.7 adds only the bounded read-only `getCollectionSnapshot(...)` surface needed for coherent snapshots. Release 0.8 adds a separate provider-neutral review-ledger repository plus a local SQLite adapter/migration for exactly recommendation revisions, measurements, and outcomes. A future cloud adapter must preserve tenant ownership, immutable review history, evidence linkage, bounded reads, and comparability semantics.

**$0 incremental recurring cost is the target for the bounded proof and must be measured/verified before deployment.** It is not a permanent cost guarantee or SLA. Releases 0.5–0.8 add no dependency or paid service. Release 1.0 cloud deployment remains separately gated, with current account headroom, exact resources, identity/auth design, retention/deletion, representative workload/cost estimates, and rollback/decommission planning assessed before approval.

## Commercial and publication limits

Internal automation does not prove commercial demand. The audit-first/service-first business model continues independently. This is internal managed-service enabling infrastructure, not customer SaaS or standalone commercial software. No public price, SLA, ranking/citation/traffic/lead/time-savings/causal-performance guarantee, or internal pricing hypothesis belongs in this repository.

Publish only safe architecture and clearly synthetic fixtures. No customer evidence, private vendor payloads, confidential business records, credentials, or secrets belong in public GitHub. Release 0.5's checked-in WQT-style fixture uses only `example-site` / `https://example.test`; Release 0.6's checked-in ZeroRank fixture is explicitly synthetic; Releases 0.7–0.8 use canonical synthetic scenarios and synthetic tenant isolation only. There is no software license grant. See [authorization](authorization.md), [roadmap](roadmap.md), and ADRs [0001](decisions/0001-evidence-core.md), [0003](decisions/0003-authenticated-ingestion-boundary.md), [0004](decisions/0004-wqt-normalized-evidence-adapter.md), [0005](decisions/0005-zerorank-sanitized-evidence-adapter.md), [0006](decisions/0006-longitudinal-evidence-diff.md), and [0007](decisions/0007-human-review-measurement-ledger.md).
