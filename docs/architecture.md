# Architecture baseline

Release 0.1 defines the accepted direction for a bounded LDW internal managed-service evidence-engine proof. [Release 0.2 canonical contracts](contracts.md) implement local wire validation, cross-field checks, and deterministic identity helpers. [Release 0.3 persistence](persistence.md) is accepted on `main` and adds tenant-safe local evidence storage. [Release 0.4 authenticated ingestion](ingestion.md) is accepted on `main` and adds one authenticated, bounded, write-only in-process ingestion boundary. [Release 0.5 WQT adaptation](adapters/wqt.md) is accepted on `main` and adds one pure/local adapter for already-normalized WQT evidence. [Release 0.6 ZeroRank adaptation](adapters/zerorank.md) is accepted on `main` and adds one pure/local adapter for the exact sanitized ZeroRank v1/minor0 artifact. [Release 0.7 longitudinal diff](analysis/diff.md) is accepted on `main` and adds deterministic same-stream evidence comparison plus non-ranked review-attention filtering over coherent tenant-scoped persisted snapshots.

**Release 0.8 is accepted and merged on `main` through PR #16.** It adds only evidence-linked human-authored recommendation revision history plus explicit measurement/outcome ledger infrastructure. External execution, cross-provider correlation, automated prioritization/recommendation generation, provider/network runtime, schedulers, AI, and cloud deployment remain separately gated. See [review-ledger guide](review-ledger.md) and [ADR 0007](decisions/0007-human-review-measurement-ledger.md).

**Release 0.9 is accepted and merged through PR #19** after Product ORCH2 exact-head review and independent review. It adds only a compact read-only local operator case view and printable static HTML preview over accepted Release 0.7/0.8 read surfaces. It adds no persistence/schema, write controls, server/listener, provider networking, runtime AI, framework, customer portal/evidence, action/remediation, or cloud resource. See [operator case-view guide](operator-case-view.md) and [ADR 0008](decisions/0008-operator-case-view.md).

## Objectives and operating model

G.A.S. means **Generative / Answer / Search**. It is LDW's provider-neutral Search, SEO, and generative/AI visibility intelligence and managed-service decision-support engine. It consumes source-preserving evidence from replaceable sensors/platforms, owns deterministic provider-preserving normalization and interpretation, retains provenance/history, supports longitudinal and bounded cross-source analysis only when semantics support it, preserves human recommendation/decision authority, and measures outcomes without inventing universal scoring or action authority. Its value must be demonstrated through reduced recurring LDW delivery and reconciliation labor.

The intended lifecycle is:

> OBSERVE → NORMALIZE → COMPARE → CORRELATE ONLY WHEN SEMANTICS SUPPORT IT → PRIORITIZE ONLY WITH AN EXPLICIT POLICY → RECOMMEND → APPROVE WHEN REQUIRED → ACT ONLY THROUGH SEPARATELY AUTHORIZED PATHS → RE-MEASURE → REPORT OUTCOME

An observation does not establish a conclusion, a mechanical diff is not an inference, a human-authored recommendation is not an automatically generated ranking, and approval does not erase the need for separate execution authority. Accepted Releases through 0.8 implement contracts, local evidence persistence, authenticated bounded intake, deterministic WQT evidence adaptation, deterministic sanitized ZeroRank evidence adaptation, deterministic same-stream longitudinal comparison, and the bounded human review/measurement/outcome ledger. Release 0.8 adds human review history and explicit measurement/outcome records only. Cross-provider correlation, automatic prioritization, action/execution, UI, and cloud workflow remain future separately gated work.

## Ownership and source-of-truth boundaries

| System | Intended ownership | Boundary |
| --- | --- | --- |
| G.A.S. Engine | Provider-neutral Search/SEO/generative-AI visibility intelligence; normalized evidence/provenance/history; deterministic longitudinal and bounded cross-source interpretation; human review/decision; measurement/outcome; operator/reporting/run/portfolio semantics | Own the LDW intelligence and service-history layer while preserving links to source evidence; integrate rather than recreate commodity sensing; no universal proprietary G.A.S. score or implicit action authority. |
| Website Quality Toolkit (WQT) | Website-specific deterministic technical/site/technical-SEO sensing and normalization through SiteOne and Lighthouse | Consume its normalized evidence and scanner-native provenance; do not rebuild WQT, execute its scanners, or create a G.A.S. provider/network client. |
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

Accepted Release 0.9 proves a compact local read-only operator case view over explicit scope, baseline/current comparison, current recommendations, selected immutable recommendation history, canonical evidence, measurements, and human-declared outcomes. It is a standalone static HTML/print preview, not a deployed customer/operator portal. Accepted recommendations still require separate authority for any external execution.

## Build, adapt, reuse, and defer

| Direction | Scope |
| --- | --- |
| Build | LDW-specific evidence/provenance model; tenant-safe application boundaries; accepted Release 0.7 deterministic longitudinal comparison; accepted Release 0.8 human review/measurement/outcome ledger; accepted Release 0.9 read-only local operator case/report preview; future correlation/action/cloud capabilities only under separate authority. |
| Adapt | WQT normalized evidence through accepted Release 0.5; sanitized read-only ZeroRank evidence through accepted Release 0.6. Keep both sensing systems replaceable and outside the G.A.S. runtime network boundary. |
| Reuse where useful | Existing WQT sensors, upstream read-only ZeroRank sensing, Cloudflare, SuiteDash, Activepieces, GitHub, and maintained lightweight OSS libraries following dependency and licensing review. |
| Defer until separately justified/authorized | Cross-provider/generic correlation beyond accepted bounded semantics, direction/severity/materiality/business-impact policy, automated prioritization/recommendation generation, Release 1.0+ cloud/deployment work, production identity provider, and live provider retrieval/integration for GSC, GA4, Bing Webmaster, Google Business Profile, Decloak correlation, R2, Queues, Workflows, Durable Objects, runtime AI, BYOK, MCP, Brand2Social actions, customer portal, and external remediation. Accepted sanitized GSC-style and Bing AI evidence semantics remain part of Releases 0.10 and 0.14. |
| Do not build | Another generic crawler/browser farm, rank crawler, backlink index, local-grid crawler, prompt runner, provider dashboard clone, CRM/workflow engine, or universal proprietary G.A.S. score. |

## Candidate cloud direction, portability, and cost

Cloudflare **Workers, D1, and static operator assets** remain candidate architecture for a later bounded cloud proof. Accepted Releases 0.1–0.20 create no deployed cloud runtime, cloud database, or provider account; Release 0.20 proves local portability/recovery readiness only. R2, Queues, Workflows, and Durable Objects remain deferred until measured need.

Keep evidence concepts and provider boundaries portable. Release 0.3 defines a minimal repository interface with local SQLite adapter; Release 0.4 consumes that interface rather than coupling application code to SQLite. Releases 0.5 and 0.6 emit provider-neutral `CollectionBatch` values. Release 0.7 adds only the bounded read-only `getCollectionSnapshot(...)` surface needed for coherent snapshots. Release 0.8 adds a separate provider-neutral review-ledger repository plus a local SQLite adapter/migration for exactly recommendation revisions, measurements, and outcomes. A future cloud adapter must preserve tenant ownership, immutable review history, evidence linkage, bounded reads, and comparability semantics.

**Accepted Releases 0.1–0.20 retain a $0 incremental recurring-cost boundary.** They provision no paid cloud/runtime service, and Release 0.20 adds no dependency. This is not a permanent cost guarantee or SLA. Release 1.0 cloud deployment remains separately gated, with current account headroom, exact resources, identity/auth design, retention/deletion, representative workload/cost estimates, and rollback/decommission planning assessed before approval.

## Commercial and publication limits

Internal automation does not prove commercial demand. The audit-first/service-first business model continues independently. This is internal managed-service enabling infrastructure, not customer SaaS or standalone commercial software. No public price, SLA, ranking/citation/traffic/lead/time-savings/causal-performance guarantee, or internal pricing hypothesis belongs in this repository.

Publish only safe architecture and clearly synthetic fixtures. No customer evidence, private vendor payloads, confidential business records, credentials, or secrets belong in public GitHub. Release 0.5's checked-in WQT-style fixture uses only `example-site` / `https://example.test`; Release 0.6's checked-in ZeroRank fixture is explicitly synthetic; Releases 0.7–0.8 use canonical synthetic scenarios and synthetic tenant isolation only. There is no software license grant. See [authorization](authorization.md), [roadmap](roadmap.md), and ADRs [0001](decisions/0001-evidence-core.md), [0003](decisions/0003-authenticated-ingestion-boundary.md), [0004](decisions/0004-wqt-normalized-evidence-adapter.md), [0005](decisions/0005-zerorank-sanitized-evidence-adapter.md), [0006](decisions/0006-longitudinal-evidence-diff.md), and [0007](decisions/0007-human-review-measurement-ledger.md).

## Release 0.14 accepted AI visibility seam

Release 0.14 is an accepted application-local extension under Issue #44 and merged PR #47. The accepted architecture now includes this bounded AI-visibility seam while preserving prior canonical, persistence, authority, and runtime boundaries.

```text
sanitized Bing AI Performance artifact
  -> strict local adapter
  -> accepted collection/source/observation wire contracts
  -> bounded Bing sidecar

accepted sanitized ZeroRank artifact + trusted adapter config
  -> Release 0.14 analysis boundary
  -> accepted Release 0.6 validation/adaptation
  -> internally produced bounded ZeroRank visibility projection

validated provider windows
  -> explicit readiness/comparability
  -> provider-specific change + concentration
  -> narrow explicit cross-source divergence
  -> optional accepted context
  -> deterministic site report
  -> static read-only HTML
```

The seam introduces no new canonical wire schema, repository method, SQLite/D1 migration, provider networking, credential flow, tenant-authority issuer, runtime AI, scheduler, worker, crawler, cloud resource, or write/action path.

Provider meaning is intentionally not flattened. Bing citation evidence remains sampled/aggregated Bing evidence. ZeroRank vendor metrics remain ZeroRank evidence. Cross-source composition is allowed only where explicit provider predicates and compatible trusted target/scope make the comparison safe; otherwise the report preserves evidence and omits the finding.

The Release 0.14 operator renderer is an application-local read-only projection and follows the accepted Release 0.9/0.13 static-HTML security model. It does not create a dashboard/runtime tier.


## Release 0.15 accepted service-brief seam

Release 0.15 is an accepted application-local composition layer under Issue #51 and merged PR #52. The accepted architecture now includes Releases 0.1–0.15 while preserving the existing wire-contract, persistence, authority, network, and cloud boundaries.

```text
accepted repository reads + accepted Release 0.7–0.14 producer inputs
  -> strict Release 0.15 request / exact scope + target reconciliation
  -> fixed module readiness
  -> unranked accepted finding/candidate register
  -> exact-string URL evidence index
  -> bounded human service-history composition
  -> compact provenance manifest
  -> deterministic semantic brief identity
  -> bounded JSON service brief
  -> escaped standalone printable HTML
```

The accepted release does not add a new wire contract, persistence layer, network tier, dashboard runtime, cloud resource, credential path, inference engine, recommendation engine, or execution path. Exact URL co-occurrence remains descriptive only. The application-local brief references accepted evidence/report identities and does not replace source evidence.


## Release 0.16 accepted human decision/measurement seam

Release 0.16 is an **accepted application-local layer** under Issue #54 and merged PR #55. The current accepted architecture includes Releases 0.1–0.20 while preserving the existing wire-contract, persistence, authority, network, cloud, and human-action boundaries.

```text
original accepted Release 0.15 producer input
  -> recompute assembleServiceBrief(...)
  -> exact human attention selection
  -> human decision statement
  -> optional explicit canonical Release 0.8 recommendation commit
  -> optional accepted Release 0.11 Search Change measurement plan
  -> explicit one-at-a-time Release 0.8 measurement commits
  -> accepted-state follow-up readiness
  -> explicit human Release 0.8 outcome commit
  -> deterministic Decision Cycle Dossier JSON
  -> escaped standalone printable HTML
```

The accepted release adds no canonical wire contract, repository table/migration, decision/plan/task persistence, network/provider tier, scheduler, cloud resource, runtime AI, automatic recommendation/outcome direction, priority/severity/business-impact score, or production action path. Existing Release 0.8 persistence remains the sole storage for recommendation revisions, measurements, and outcomes.

The dossier stores only application-local composition output. Its identity canonically binds emitted semantic state; rendered HTML/CSS/filesystem paths do not define semantic identity.

## Release 0.17 accepted local operator-workspace seam

Release 0.17 is **accepted and merged through PR #62** at squash merge `52ea537e99a92b05a52c2e732a86104d65f2ea28`, with post-merge Contracts `36968094314` SUCCESS.

```text
trusted host + existing repositories + TenantContext
  -> assembleServiceBrief(...)
  -> optional prepareDecisionCycle(...)
  -> deterministic OperatorWorkspace
  -> self-contained browser convenience layer
  -> bounded downloaded request artifact
  -> strict Node parse + authoritative recomputation + source-drift validation
  -> accepted Release 0.16 / Release 0.8 service
  -> regenerated authoritative workspace/report
```

The browser does not own tenant authority, persistence, evidence truth, recommendation lifecycle, measurement/outcome semantics, or current-cycle selection. Release 0.17 adds only application-local workspace/action/report models and renderers. It adds no canonical wire schema, migration/table, server/listener, cloud runtime, provider client, credential path, scheduler, runtime AI, or new durable report/service-run store.

Customer-safe reporting is a separate deterministic projection. Internal provenance identifiers are absent from the customer body by default and can appear only in an explicitly separated optional LDW appendix.

## Release 0.18 accepted managed-service run seam

Release 0.18 is **accepted and merged through PR #67** at squash merge `6a24d9fb428c1a62b9766f5baa5815329eab78b7`, with post-merge Contracts `37056080706` SUCCESS.

```text
trusted evidence + accepted adapters
  -> accepted WQT minor3 / exact provider snapshots where applicable
  -> existing repositories + TenantContext + original Release 0.17 request
  -> recompute authoritative OperatorWorkspace
  -> strict operational source receipts
  -> optional exact prior-run summary comparison
  -> accepted Release 0.16 readiness projection
  -> optional accepted Release 0.17 customer report
  -> deterministic service-run.json + workspace/report files
  -> deterministic package-manifest.json with exact SHA-256 / byte counts
```

Source receipts and prior-run summaries are application-local provenance only. They cannot mint tenant/site/scope authority or override accepted evidence readiness. Prior Attention comparison uses exact IDs only and never converts absence into "resolved", "fixed", or "improved".

Release 0.18 adds no canonical wire contract, database/table/migration, provider network/credential path, server/listener, queue/scheduler/worker, cloud runtime, report delivery, runtime AI, or new persistent service-run/history layer.

The public WQT snapshot resolver is pure/local. Issue #63's private semantic-history/retention/runtime work remains outside this release.

## Release 0.19 accepted portfolio-operations seam

Release 0.19 is **accepted and merged through Issue #69 / PR #70** at squash merge `8f25068a659f1c57be16ccd648cdbc86a8bda1fb`, with post-merge Contracts `37261605064` SUCCESS.

```text
trusted portfolio inventory
  + zero-or-one accepted Release 0.18 ManagedServiceRun per engagement
  + explicit source-family freshness policy
  -> strict Release 0.18 run import / canonical run-ID verification
  -> exact tenant/site/scope/target reconciliation
  -> exact source-state + operational freshness projection
  -> fixed unranked factual exceptions
  -> bounded operational-only cross-engagement summary
  -> deterministic LDW-internal JSON
  -> self-contained presentation-only HTML
```

Trusted portfolio inventory owns engagement identity, exact scope/target, current-run selection, and freshness policy. A run artifact, run ID, report ID, or browser state cannot mint portfolio authority. `src/operator/service-run.ts` singly owns canonical ManagedServiceRun identity through `computeManagedServiceRunId(...)`; the adjacent strict importer reuses that seam rather than maintaining an alternate identity algorithm.

Source state and freshness remain separate semantics. Non-`supplied` states remain exact and are freshness `not_evaluable`; they are not converted to stale. Cross-engagement summaries count operational metadata only and do not aggregate or benchmark customer performance, recommendation/report prose, or measured outcomes.

Release 0.19 adds no canonical wire contract, database/table/migration, provider network/credential path, server/listener, scheduler/worker, authoritative browser persistence, cloud runtime, report delivery, runtime AI, customer portal/SaaS, cross-customer performance benchmarking, universal score, automatic priority/severity/business-impact inference, private WQT runtime/history, REPORT-AUTO delivery, or new runtime dependency.

## Release 0.20 accepted runtime-portability seam

Release 0.20 is **accepted and merged through Issue #74 / PR #75** at squash merge `9e529669020e6d833b5f5ef7afdac48ab67e30bf`, with independent whole-pack ACCEPT and post-merge Contracts `37385826289` SUCCESS.

```text
strict non-secret runtime profile
  + accepted local SQLite state
  + explicitly selected accepted generated artifacts
  -> Node 24.19 node:sqlite online backup
  -> deterministic portable-directory manifest and root-independent identity
  -> exact path / symlink / hash / byte / profile-policy verification
  -> physical root-A to root-B relocation
  -> accepted SQLite schema/repository reopen
  -> newly issued trusted authority for representative restored reads
  -> deterministic retention planning only
  -> explicit operator-selected rollback / recovery / decommission metadata
```

The runtime profile, manifest, bundle IDs, database IDs, and file paths remain configuration/provenance and never mint tenant or authentication authority. Imported verification independently re-enforces profile role/classification allowlists, exact build identity presence/value, required runtime-profile and SQLite administrative entries, canonical recovery database path, and retention-policy identity. Restored storage never restores `TenantContext`, sessions, or credentials; trusted authority must be newly issued by a separately authorized authentication boundary.

Release 0.20 adds no production/customer deployment, cloud runtime, Workers/D1, Docker/OCI/Kubernetes, provider networking, credentials/secrets, identity provider, scheduler/background worker, database table/migration, canonical public wire schema, destructive retention executor, private WQT runtime/history, REPORT-AUTO delivery, or Release 1.0 authority. Issue #76 tracks accepted non-blocking test-harness permission debt only and does not broaden the production seam.
