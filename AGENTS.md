# Repository agent instructions

## Establish authority and live state

- Read [authorization](docs/authorization.md), [architecture](docs/architecture.md), and the [roadmap](docs/roadmap.md) before meaningful work. LDW internal governance and the current bounded dispatch determine authority.
- Fetch current `main`; inspect the tree, working-tree changes, open/recent PRs, workflows/configuration, and branch protection/rulesets where available before editing. Live repository state takes precedence over a stale handoff.
- Stop and return to the Product Orchestrator when live changes or competing work invalidate the dispatch, authority narrows, or completing the work would require a material scope expansion. Preserve others' changes.
- Use a branch from freshly verified `main` and a PR for meaningful work. Do not commit directly to `main`. Validate before opening/updating the PR, then return evidence to the Product Orchestrator for independent review and release acceptance. Do not self-accept or merge this implementation workstream.
- Choose the smallest useful next release. Roadmap entries do not independently authorize implementation; stop or collapse work when evidence shows duplication or poor value.

## Accepted baseline and next-release gates

Releases 0.1–0.22 are accepted and merged. Issue #110 authorized Release 0.22, which is accepted and merged on `main` through PR #112 at commit `d69fb468c934aae41687b8d8f927ec2381cfcca9` after Product exact-head PASS, post-merge Contracts run #470 / 39906956428 SUCCESS, Security Baseline run #11 / 39906956779 SUCCESS, and independence-clean review (business-operations#667, review id gas-110-pr112-91eb424c-correction-ir-v1, PR business-operations#668). Release 0.22 adds pure/local measurement interpretation and claim ceiling semantics over canonical Release 0.8 measurements and Release 0.11 comparability semantics without persistence expansion, provider/runtime calls, or automatic outcome/action authority. Issue #120 separately authorizes the bounded Release 0.23 SERP Intent Validation Profile candidate; it is not accepted until Product and independent exact-head review, required checks, and the release gate pass. Release 1.0 remains separately gated. Release 0.4 proves **authenticated bounded ingestion** on accepted Release 0.3: an injected opaque-credential authenticator, immutable registered principals with exact grants, one application ingestion service, and one in-process Web `POST /v1/evidence/collections` transport. Release 0.5 adds one accepted pure/local adapter for already-normalized WQT evidence. Release 0.6 adds one accepted pure/local adapter for the exact sanitized ZeroRank `ldw.zerorank-evidence.v1` minor-0 artifact. Release 0.7 adds accepted deterministic same-semantic-stream longitudinal evidence diff plus non-ranked review-attention filtering over coherent tenant-scoped persisted snapshots. Preserve that accepted behavior in all future work.

Product mission: G.A.S. remains **Generative / Answer / Search** and is LDW's provider-neutral Search, SEO, and generative/AI visibility intelligence and managed-service decision-support engine. SEO is in scope for G.A.S. intelligence; commodity sensor/platform duplication is not. WQT owns website-specific SiteOne/Lighthouse technical/site/technical-SEO sensing and normalization. G.A.S. integrates that evidence with other replaceable sources, longitudinal and bounded cross-source interpretation, human decisions, measurement/outcomes, and service operations. Do not rebuild WQT/crawlers, rank/backlink/local-grid collection, prompt runners, or provider dashboards without separate authority.

Accepted Release 0.7 requires collection compatibility for exact scope, provider, provider-connection presence/value, adapter, source schema, and full collection method before absence/completeness semantics may be used. Repository-backed comparison resolves each side through atomic `getCollectionSnapshot(...)`; the dedicated snapshot read is bounded to 2,048 observations while general `listObservations(...)` remains uniformly capped at 100 records. Release 0.7 does not authorize cross-provider/generic correlation, universal scoring, direction/severity/materiality/business-impact policy, prioritization, inference, recommendations, actions, UI, network/provider access, runtime AI/BYOK, new persistence schema/tables, diff persistence, or Release 0.8. See [longitudinal diff guide](docs/analysis/diff.md).

Release 0.8 is **accepted and merged on `main` through PR #16**. The accepted boundary is narrower than the older roadmap shorthand: human/trusted-caller-authored `internal_review` recommendations with `unassessed` priority, immutable revision history and caller-driven lifecycle transitions, explicitly selected canonical measurements, and human-declared outcomes. Migration 2 is the accepted Release 0.8 storage migration and adds only recommendation revisions, measurements, and outcomes. Release 0.8 does not authorize automatic recommendation/inference generation, ranking, generic correlation, action/remediation, provider/network access, UI, schedulers/background workers, runtime AI/BYOK, cloud resources, customer evidence, or Release 0.9. See [review-ledger guide](docs/review-ledger.md) and [ADR 0007](docs/decisions/0007-human-review-measurement-ledger.md).

The accepted invariant is **untrusted request data never creates authority**. Production persistence exposes only `TenantContext` validation. The package-internal tenant issuer may be called in production only by `src/authentication/principal.ts`, after trusted credential verification; transport/service/evidence/adapter/analysis/review code may not issue contexts. Exact grants bind tenant/site/site-scope revision/provider/provider connection. No wildcard grants, production IdP, JWT/password/OAuth/session/API-key store, or request-derived tenant authority.

Accepted transport persists exactly one bounded part with `collection`, `part`, `parts`, `sources`, and `observations`; `Idempotency-Key` stays in the header. Preserve canonical whole-collection `receivedCount`, Release 0.3 part ordering/capacity semantics, same-part observation/source references, and per-part atomicity. After every persistence result, query `getCollectionProgress`; response `complete` means persisted collection completion, never merely canonical completeness. Use typed persistence conflicts for changed replay/part count and part-sequence conflicts; do not scrape message strings.

Retain the 1,024-character Authorization bound and 49,152-byte streamed HTTP body proof bound, deliberately below the canonical 65,536-byte bound. Content-Length never replaces counted streaming. Require strict/fatal UTF-8, JSON media type, no compression, bounded errors, no credential/evidence echo, no listener, and no outbound network. See [ingestion guide](docs/ingestion.md).

Accepted Release 0.5 consumes only already-normalized `ldw.website-quality.v1` / minor `1` JSON bytes plus explicit trusted adapter configuration. The adapter is pure/local: it must not run SiteOne/Lighthouse, dispatch or download WQT Actions artifacts, fetch URLs, use provider credentials, import WQT at runtime, issue `TenantContext`, or persist by itself. WQT evidence site/target/provider fields and hashes remain untrusted evidence and never authority. See [WQT adapter guide](docs/adapters/wqt.md).

The accepted Release 0.5 mapping keeps SiteOne and Lighthouse as separate provider streams, preserves source/tool version in provenance/comparability context, uses trusted canonical timing instead of guessing timezone for SiteOne `executedAt`, preserves observed zero versus explicit missing states, and emits ordinary accepted `CollectionBatch` parts. Every source unit and its observations stay together; byte-aware packing preserves the 64-part / 16-source / 32-observation / 65,536-byte accepted persistence limits with no truncation or hidden paging.

Accepted Release 0.6 consumes only the exact inner sanitized ZeroRank artifact plus explicit trusted adapter configuration. It supports only `ldw.zerorank-evidence.v1` minor `0`, reconciles duplicated workspace projections before trusted workspace matching, and emits five endpoint-specific `zerorank` collection streams: rankings, prompts, chats, sources, and sourceUrls. The adapter is pure/local: it must not poll ZeroRank, call Activepieces, receive provider credentials, issue `TenantContext`, persist by itself, open a listener, deploy, correlate, prioritize, recommend, or act. Trusted configuration supplies G.A.S. scope, expected workspace/target, provider connection, canonical timing, and source availability; artifact evidence remains non-authoritative. See [ZeroRank adapter guide](docs/adapters/zerorank.md).

Accepted Release 0.7 uses `cohortIdentityHash` as the sole observation match key after collection compatibility succeeds. Omitted dimensions are not wildcards. Duplicate cohort identity in one snapshot fails closed. Exact observation values/missing-state reasons determine unchanged/changed. Complete opposite coverage may establish appeared/missing-from-current; partial/unavailable/failed coverage yields coverage-unknown. Numeric subtraction is descriptive only and must not be labeled improvement/regression. Preserve the 2,048-observation per-snapshot bound derived from accepted 64 × 32 collection capacity, with no truncation or hidden paging.

Accepted Release 0.8 behavior must preserve human authorship and separation of authority. New recommendations are revision 1 / `proposed` / `internal_review` / `unassessed`; stale expected revisions fail closed; lifecycle/content changes append immutable revisions; rejected/superseded are terminal and accepted may only become superseded. Recommendation evidence resolves to canonical observations in the same trusted scope. Caller-supplied measured values must equal canonical persisted observation values. Directional outcomes require resolved comparable measurements, but G.A.S. must not infer improved/regressed/unchanged from numeric direction. Release 0.8 attribution is limited to `none` and `technical_verification`. Acceptance or outcome creation never creates an action.

Release 0.9 is **accepted and merged on `main` through PR #19** after Product ORCH2 exact-head review and independent review. It adds only a compact read-only local operator case view + printable static HTML report preview over accepted Release 0.7/0.8 reads. Preserve trusted TenantContext and exact scope ownership; IDs remain selectors only. Mechanical diff states stay non-evaluative, recommendations display as HUMAN-AUTHORED / `internal_review` / `unassessed`, and outcome direction displays only as HUMAN-DECLARED. The accepted release adds no persistence/schema, write controls, provider/network runtime, server/listener, customer portal, scheduler, runtime AI/BYOK, action/remediation, framework, cloud resource, or customer evidence, and it grants no Release 1.0 authority. See [operator case-view guide](docs/operator-case-view.md) and [ADR 0008](docs/decisions/0008-operator-case-view.md).

Release 0.10 is **accepted and merged on `main` through PR #35** after Product exact-head review, one bounded metric-integrity correction, and independent re-review. Preserve the pure/local sanitized `ldw.search-analytics-evidence.v1` minor-0 / `google-search-console` adapter and explicit-policy deterministic window-delta, striking-distance, decay, CTR-opportunity, and neutral query/page-overlap signals. Trusted configuration owns tenant/site/scope, provider connection, expected property, and canonical receive timing; artifact property/query/page/provider fields remain evidence only. Preserve observed zero, conservative coverage/missingness, exact compatibility, the verified 384-row/1,536-observation bound, cross-field metric-integrity checks, existing canonical schemas/persistence, and no-network behavior. The accepted release adds no provider OAuth/client, scheduler/background work, ranking/priority/severity/causal inference, split/consolidate action, signal persistence, customer/private evidence, paid dependency, runtime AI, or cloud deployment, and it grants no Release 0.11 or Release 1.0 authority. See [Release 0.10 guide](docs/search-analytics-signal-pack.md) and [ADR 0010](docs/decisions/0010-search-analytics-signal-pack.md).

Release 0.11 is **accepted and merged on `main` through PR #38** after Product exact-head review, one bounded deterministic-identity correction, and independent exact-head re-review. Preserve its pure/local composition of one strict human/trusted-caller change annotation, one exact accepted Release 0.10 baseline row/metric, zero or one exact-compatible follow-up window, and existing Release 0.8 measurement service inputs. Reuse Release 0.10 validation/compatibility and Release 0.8 measurement/outcome authority; do not create a second comparator, experiment database, annotation persistence, measurement system, or outcome system. Preserve observed zero, absent-row missingness, explicit readiness/coverage reasons, selector-only recommendation association, application-local query/page sidecar semantics, deterministic follow-up identity bound to the exact canonical `baselineMeasurementId`, and no automatic outcome direction or causality. The accepted release grants no provider networking/OAuth/credentials, scheduler/worker, new migration/table, action authority, runtime AI, cloud, customer/private evidence, paid dependency, Release 0.12, or Release 1.0 authority. See [Release 0.11 guide](docs/search-change-outcome-cohorts.md) and [ADR 0011](docs/decisions/0011-search-change-outcome-cohorts.md).

Release 0.12 is **accepted and merged on `main` through PR #41** after Product exact-head review and independent exact-head review. Preserve its pure/local one-page page-focus analysis over one accepted Release 0.10 adapted window and exact page, with exactly one strict caller-supplied cluster assignment per selected-page query and one explicit versioned threshold policy. Reuse `validateSearchAnalyticsWindow(...)`; preserve Release 0.10 trusted scope/provider, exact row/query/page identity, metric integrity, freshness/coverage, provenance and sidecar semantics. Candidate status requires final, complete, nontruncated, nonanonymized evidence plus at least two policy-supported clusters. `dominantEvidenceCluster` means only highest measured support, not intent truth. Every report must require separate SERP/result validation before any split/consolidation/redirect/canonical/content-architecture conclusion. The accepted release grants no semantic cluster inference, recommendation/action creation, persistence/schema change, provider networking/OAuth/credentials, scheduler/worker, runtime AI, cloud, customer/private evidence, paid dependency, Release 0.13, or Release 1.0 authority. See [Release 0.12 guide](docs/page-focus-candidate-analysis.md) and [ADR 0012](docs/decisions/0012-page-focus-candidate-analysis.md).

Release 0.13 is **accepted and merged on `main` through PR #45** after Product whole-pack exact-head review, one bounded IndexNow semantic-integrity correction, final independent exact-head review, protected-main squash merge, and post-merge Contracts verification. Preserve the accepted Discovery Diagnostics Pack boundary: exact sanitized `ldw.discovery-diagnostics-evidence.v1` minor-0 artifacts for Google/Bing/Yandex/IndexNow, provider-preserving adaptation into existing canonical collection/source/observation contracts, exact-URL-only cross-engine readiness and deterministic finding arrays, descriptive IndexNow context, optional exact compatible Release 0.10 search context, deterministic site rollup, and one escaped static read-only operator report/preview. Preserve unknown/missing semantics, provider-specific sidecar state, trusted scope/site authority, synthetic-only fixtures, and no implicit URL equivalence. IndexNow submission never becomes indexing proof. The accepted release adds no provider networking/OAuth/credentials, canonical schema change, new persistence/migration, crawler/SERP scraper, health/severity/priority score, automatic recommendation/remediation/action, runtime AI, cloud, customer/private evidence, or paid dependency, and did not itself authorize Release 0.14 or Release 1.0. See [Release 0.13 adapter guide](docs/adapters/discovery-diagnostics.md), [Discovery Diagnostics guide](docs/discovery-diagnostics.md), and [ADR 0013](docs/decisions/0013-discovery-diagnostics-pack.md).

Repository governance remains established: the `main` ruleset requires pull requests with review-thread resolution and linear history and the `contracts` GitHub Actions check. Work with that baseline; this document does not authorize account, security-setting, or ruleset changes.

## Persistent boundaries

- This is a public repository: publish only safe architecture and clearly synthetic fixtures. No customer evidence, real customer names as test data, client analytics, PHI, CUI, private vendor payloads, confidential business records, private account identifiers, credentials, tokens, API keys, or production secrets.
- Keep private runtime evidence outside public GitHub. `.gitignore` is not a security control and does not replace review of the staged diff.
- No software license grant: do not add `LICENSE`, `COPYING`, license text, or metadata granting a license without separate authority. Public visibility is not an OSS license.
- No paid dependency, paid infrastructure, purchase, billing enablement, or overage without separate authorization. The bounded proof targets $0 incremental recurring cost, subject to measurement and verification.
- No cloud deployment before the separate Release 1.0 gate. No customer deployment, customer portal, runtime AI/BYOK, or autonomous production mutation under this boundary.
- Sensor credentials and read capability never imply write authority. Recommendation acceptance does not itself authorize a production change. Use separately approved execution mechanisms; do not create a parallel autonomous GitHub writer.
- Preserve trusted tenant context at application/persistence boundaries. Object IDs alone never authorize access. Future functional releases require adversarial synthetic second-tenant tests for list, read, update, compare/correlate, approve, export, remeasure, and delete operations as applicable.
- Preserve provenance and history, distinguish evidence/mechanical-diff/inference/recommendation/action/measurement/outcome, and never convert missing data to zero. Preserve `observed(value)`, `unknown(reason)`, `unavailable(reason)`, `not_collected(reason)`, and `not_applicable(reason)`.
- Keep WQT and ZeroRank replaceable sensors. Provider observations and scores are evidence, not authoritative LDW conclusions. Do not rebuild their commodity sensing or propose a universal proprietary G.A.S. score.

## Validation and handoff

Use Node 24 and the committed npm lockfile. Run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run typecheck`, `npm run build`, `npm test`, `npm run schemas:check`, `npm run check`, `npm audit`, and `git diff --check`. Inspect the complete diff and generated schemas; verify documentation links, synthetic fixtures, privacy, dependency licenses/advisories, and scope. If CI exists, confirm it passes on the final head. Keep checks deterministic/local except the explicitly requested dependency audit; never require provider credentials or live services.

Keep portable Zod wire schemas free of hidden transforms/refinements; cross-field checks belong in `src/domain/validate.ts` and must be documented separately from JSON Schema. Use `parseContract` at the application contract boundary. Unknown fields and unsupported versions fail closed; additions need deliberate version support and tests that preserve existing 1.0 interpretation. Never infer trusted tenant authority from successful parsing or hashing. See [contract guide](docs/contracts.md).

For provider adapters, prefer validated import/export boundaries over new sensor/network clients. Preserve exact provider identity, provenance, mapping-version semantics, source availability, and deterministic bounded output. The accepted Release 0.5 WQT adapter must continue to reject unknown WQT minor versions until deliberately reviewed and must keep its own synthetic contract fixture rather than depending on the WQT repository at test/runtime. The accepted Release 0.6 ZeroRank adapter must likewise reject unsupported artifact versions, preserve exact request/completeness semantics, and keep sensing/credentials upstream.

Report the starting revision, final head, changed files, validation results, PR, exclusions, cost/security impact, and unresolved issues to the owning Product Orchestrator. Do not mark a candidate accepted, merge, or advance to the next release without the owning Product Orchestrator's bounded authority.

## Release 0.14 accepted boundary

Release 0.14 is **accepted and merged on `main` through PR #47** after Product exact-head review, bounded Bing semantic-integrity corrections, final independent review, the bounded ZeroRank analysis trust-boundary correction, final independent exact-head re-review, protected-main squash merge `a30a889ee2f164ba38d22c5fb38642fbf19b330d`, and post-merge Contracts run `36808029361` SUCCESS. At Release 0.14 acceptance, the accepted baseline was Releases 0.1–0.14.

Preserve these Release 0.14 boundaries:

- Bing AI Performance input is sanitized/exported evidence only under `ldw.bing-ai-performance-evidence.v1` minor 0. G.A.S. does not retrieve Bing AI Performance data and does not assume an AI Performance API.
- Bing evidence remains sampled/aggregated. `complete_export_view` is complete only for that exported provider view; it is not population completeness.
- Grounding queries are provider-grouped phrases, not exact user prompts. Provider intent/topic labels remain provider evidence.
- Reuse accepted Release 0.6 ZeroRank validation/canonical adaptation before any Release 0.14 visibility projection. Do not add a second independent ZeroRank parser.
- Bing and ZeroRank metric magnitudes remain provider-specific. Never normalize ZeroRank rank/visibility/sentiment/share-style values into Bing citation semantics.
- Cross-source presence findings require compatible trusted scope/target and explicit provider-specific positive versus explicit complete zero/absence. Unknown, filtered, sampled gaps, incomplete endpoints, and missing rows do not become absence.
- Cross-source cohort comparison requires exact caller-supplied Bing grounding-query ↔ ZeroRank prompt mapping. No fuzzy, embedding, LLM, or inferred semantic matching.
- Optional Release 0.10/0.11/0.12 context is descriptive only and cannot change Release 0.14 findings.
- Static operator output remains escaped, CSP-restricted, standalone, no-JavaScript, no external assets, no write controls, bounded, and non-evaluative.
- Do not add provider networking, credentials/OAuth, runtime AI/BYOK, crawler/SERP scraping, scheduler/worker, persistence, cloud resources, customer/private evidence, new paid service, or Release 1.0 implementation.
- The accepted `main` baseline is package version 0.22.0; the authorized Release 0.23 candidate uses package version 0.23.0 until accepted or rejected.

See [Release 0.14 guide](docs/ai-visibility-intelligence.md), [Bing adapter guide](docs/adapters/bing-ai-performance.md), and [ADR 0014](docs/decisions/0014-ai-visibility-intelligence-pack.md).


## Release 0.15 accepted boundary

Release 0.15 is **accepted and merged on `main` through PR #52** after Product whole-pack exact-head review, one bounded service-history semantic-identity correction, final independent whole-pack exact-head review, protected-main squash merge `8f7a093710a256911e708a6d7831240ac226c59c`, and post-merge Contracts run `36920896815` SUCCESS.

Preserve the Release 0.15 composition boundary:

- use one already-issued trusted TenantContext for repository-backed reads; IDs, URLs, scope-shaped data, report IDs, and provider evidence never mint authority;
- reuse accepted Release 0.7–0.14 producers/validators instead of parallel parsers, completeness rules, or alternate analysis semantics;
- module readiness is fixed and descriptive only: not_supplied, ready, limited, not_ready, unavailable, with underlying reasons preserved;
- the attention register is deterministic navigation only, never priority, severity, business impact, remediation order, or a task queue;
- exact-page composition uses exact URL string identity only; do not normalize slash/query/canonical/redirect/protocol/host/case variants into equivalence;
- human recommendation priority and outcome direction remain canonical/human-declared; Release 0.15 does not recalculate them;
- the provenance manifest references accepted evidence identities and does not embed raw provider artifacts;
- service-brief identity binds compact semantic material, not rendered HTML/CSS, filesystem paths, prose formatting, or raw provider bytes;
- JSON/HTML outputs are bounded and fail closed rather than truncate;
- no canonical schema, persistence/migration, provider networking, credentials/OAuth, scheduler/delivery, runtime AI/LLM/embedding/BYOK, cloud, automatic recommendation/remediation/action, paid dependency, customer/private evidence, Issue #49 implementation, or Release 1.0 implementation.

See [Release 0.15 guide](docs/service-brief.md) and [ADR 0015](docs/decisions/0015-unified-operator-service-brief.md).


## Release 0.16 accepted boundary

Release 0.16 is **accepted and merged on `main` through PR #55** after Product whole-pack exact-head review, integrated outcome-association and current-cycle measurement-isolation corrections, final bounded independent exact-head re-review, protected-main squash merge `9bfaa2ad582ddf0611481915c7a151537e9eee5c`, and post-merge Contracts run `36952027304` SUCCESS.

Preserve these accepted-release rules:

- recompute accepted Release 0.15 through `assembleServiceBrief(...)`; never trust a caller-created/mutated `ServiceBrief` as decision evidence;
- exact human attention selection is bounded to 32 IDs from that recomputed brief and is not ranking, severity, priority, materiality, or business impact;
- human disposition/rationale remain explicitly human-authored;
- optional recommendation creation must remain canonical Release 0.8 `internal_review` / `unassessed`, exact-scope, canonical-observation-backed, and separately committed;
- selected Release 0.15 finding IDs are not canonical observation evidence;
- recommendation transitions/revisions, measurement writes, and outcomes delegate to accepted Release 0.8 services and expected-revision/evidence/comparability rules;
- optional measurement planning is only accepted Release 0.11 Search Change composition; do not invent generic methodologies for Discovery, AI Visibility, Page Focus, or other modules;
- record one prepared measurement at a time; no multi-write pseudo-transaction or rollback framework;
- numeric movement never selects outcome direction;
- dossier identity must bind all emitted semantic state canonically; static JSON/HTML remain bounded, deterministic, escaped, CSP-restricted, no-JavaScript, no-network, and non-executing;
- add no canonical schema, table/migration, dependency, provider networking, credentials/OAuth, scheduler/worker, runtime AI, cloud, task/project manager, automated recommendation/action, customer/private evidence, paid service, Issue #49 implementation, or Release 1.0 implementation.

See [Release 0.16 guide](docs/decision-cycle.md) and [ADR 0016](docs/decisions/0016-human-decision-measurement-cycle.md).

## Release 0.17 accepted operator-workspace boundary

Release 0.17 is **accepted and merged on `main` through PR #62** at squash merge `52ea537e99a92b05a52c2e732a86104d65f2ea28`, with post-merge Contracts `36968094314` SUCCESS. Releases 0.1–0.17 are the accepted baseline.

Preserve these accepted Release 0.17 rules:

- recompute accepted Release 0.15 and Release 0.16 state; never trust browser-created service/dossier state;
- browser UI and downloaded JSON are untrusted convenience data and never mint TenantContext or scope authority;
- durable actions must revalidate workspace/brief/dossier identity before delegating to accepted Release 0.16/0.8 services;
- do not copy readiness, current-cycle measurement, outcome-association, recommendation-lifecycle, or evidence semantics into UI code;
- customer focus selection is explicitly human supplied and bounded to three, not automatic G.A.S. priority;
- customer report body excludes internal provenance IDs by default;
- add no runtime dependency/framework, canonical schema, table/migration, provider network, auth/session, cloud, scheduler, runtime AI, paid service, customer portal, Issue #49/#56 implementation, Release 0.18, or Release 1.0.

See [accepted Release 0.17 guide](docs/operator-workspace.md) and [ADR 0017](docs/decisions/0017-operator-workspace-service-reporting.md).

## Release 0.18 accepted managed-service-run boundary

Release 0.18 is **accepted and merged on `main` through PR #67** at squash merge `6a24d9fb428c1a62b9766f5baa5815329eab78b7`, with post-merge Contracts `37056080706` SUCCESS. Releases 0.1–0.18 are the accepted baseline.

Preserve these accepted Release 0.18 rules:

- minor1/minor2 WQT identities remain 1.0.0/v1.1/rev1 and 2.0.0/v1.2/rev2; accepted minor3 is 3.0.0/v1.3/rev3;
- WQT minor3 facts must use the generic typed-fact path; do not special-case skipped-URL fact IDs;
- WQT snapshot resolution is pure/local and must fail closed on broken multipart material;
- managed service runs must recompute accepted Release 0.17 state rather than trust caller-created workspaces;
- receipts/prior summaries are operational provenance only and never authority/readiness;
- prior Attention comparison uses exact IDs and only carried_forward/new_in_current/not_present_in_current;
- follow-up/readiness is the accepted Release 0.16 state, not a task/scheduler model;
- customer reports reuse accepted Release 0.17 composition/rendering and explicit human <=3 focus selection;
- package manifests hash exact emitted bytes and explicitly classify customer-safe versus LDW-internal files;
- no DB/table/migration, canonical schema, provider network/credentials, server/listener, scheduler/worker, cloud, delivery, runtime AI, new dependency, paid service, private Issue #63 implementation, Issue #49/#56, Release 0.19, or Release 1.0.

See [accepted Release 0.18 guide](docs/service-run.md) and [ADR 0018](docs/decisions/0018-managed-service-run-evidence-intake.md).

## Release 0.19 accepted portfolio-operations boundary

Release 0.19 is **accepted and merged on `main` through Issue #69 / PR #70** at squash merge `8f25068a659f1c57be16ccd648cdbc86a8bda1fb`, with post-merge Contracts `37261605064` SUCCESS. At Release 0.19 acceptance, Releases 0.1–0.19 were the accepted baseline.

Preserve these accepted Release 0.19 rules:

- trusted portfolio inventory owns engagement identity, tenant/site/scope, target, current-run selection, and explicit source-family freshness policy; artifacts and IDs cannot mint portfolio authority;
- zero or one current accepted Release 0.18 `ManagedServiceRun` may be supplied per engagement and must pass strict full-run import/invariant validation before use;
- canonical ManagedServiceRun ID computation remains singly owned by `src/operator/service-run.ts`; strict import reuses `computeManagedServiceRunId(...)` rather than maintaining a second identity algorithm;
- exact tenant/site/scope/target isolation is mandatory; duplicate engagement IDs/exact scopes and cross-tenant or target substitution fail closed;
- exact source state remains distinct from operational freshness; non-`supplied` states are `not_evaluable` for freshness and never become stale merely because freshness cannot be evaluated;
- cross-engagement roll-ups are operational metadata counts only; never aggregate/benchmark customer performance, recommendation/report prose, or measured outcomes and never invent universal health, priority, severity, or business-impact scores;
- the HTML console is presentation-only: no authoritative browser persistence, provider/network path, form/write/action authority, scheduler, or delivery surface;
- add no provider networking/polling, scheduler/background worker, DB/table/migration, canonical schema, cloud runtime, runtime AI, customer portal/SaaS, report-delivery authority, private WQT runtime/history, REPORT-AUTO delivery, paid service, or new runtime dependency.

See [accepted Release 0.19 guide](docs/portfolio-operations.md) and [ADR 0019](docs/decisions/0019-internal-portfolio-operations-console.md).

## Release 0.20 accepted runtime-portability boundary

Release 0.20 is **accepted and merged on `main` through Issue #74 / PR #75** at squash merge `9e529669020e6d833b5f5ef7afdac48ab67e30bf`, with post-merge Contracts `37385826289` SUCCESS after independent whole-pack ACCEPT. Preserve these accepted Release 0.20 rules:

- runtime/profile and portability-manifest models remain strict, application-local, and non-secret; IDs, paths, hashes, manifests, and restored database bytes never mint tenant or authentication authority;
- use pinned Node 24.19 `node:sqlite` online backup for accepted local SQLite state, then reopen through the existing exact migration/schema/repository guards; add no backup dependency, table, or migration;
- portable bundle identity is deterministic and root-independent; explicit generated-artifact admission only, exact hash/byte/classification/retention verification, canonical logical paths, root confinement, and symlink rejection remain fail-closed;
- imported verification independently re-enforces profile role/classification allowlists, exact build-identity presence/value, exact required runtime-profile and SQLite administrative entries, canonical recovery database path, and retention-policy identity;
- root-A to root-B relocation must preserve semantic bundle identity; representative restored reads require newly issued trusted authority rather than deserialized `TenantContext`, sessions, or credentials;
- retention is deterministic planning only; rollback requires an explicit accepted bundle selection; recovery/decommission metadata creates no deployment or destructive execution authority;
- accepted 0.1–0.19 ordinary tests retain their bounded Node `--permission` process; Issue #76 is closed/completed through merged PR #80, and only the dedicated real-symlink adversarial fixture remains isolated outside `--permission` because Node 24.19 requires broader filesystem authority for actual symlink/junction creation. `tests/no-network.ts` remains an accidental-network tripwire, not an OS sandbox. This isolation is test-harness-only and does not broaden production permissions;
- add no production/customer deployment, cloud runtime, Workers/D1, Docker/OCI/Kubernetes, credentials/secrets, identity provider, provider networking, scheduler/background worker, canonical public schema, destructive retention executor, private WQT implementation, REPORT-AUTO delivery, or Release 1.0 authority.

See [accepted Release 0.20 guide](docs/runtime-portability.md) and [ADR 0020](docs/decisions/0020-private-runtime-portability.md).

## Release 0.21 accepted operator-assist boundary

Release 0.21 is **accepted and merged on `main` through Issue #88 / PR #89** at squash merge `d555d7a31444c942dede978547a5dd5ca3f11695`, after Product exact-head PASS `6130681325` and independent exact-head re-review PASS `6133456059`; post-merge Contracts #452 / `38314641841` succeeded. At Release 0.21 acceptance, Releases 0.1–0.21 were the accepted baseline.

Preserve these accepted Release 0.21 rules:

- validate an already-issued trusted `TenantContext` and recompute accepted Release 0.15 from the original strict producer input; never accept a caller-created or mutated `ServiceBrief` as authoritative source state;
- packet inclusion/filtering is bounded selection only and never priority, severity, business impact, or remediation order;
- packet-local evidence references and `assistPacketId` bind deterministic accepted semantics but remain selectors/provenance, never authority;
- fixed/versioned reviewer instructions are trusted application policy and cannot be rewritten by evidence or advisory text;
- external reviewer output remains untrusted advisory input; validation proves only exact packet/reference grounding, never factual truth, causality, priority, impact, provider/model identity, approval, or execution safety;
- top-level packet/advisory integrity must fail closed on Proxy, `toJSON`, accessor, symbol/unknown/non-enumerable fields and inherited required-field substitution before caller-controlled behavior can affect output;
- normalized validated advisory data is the sole semantic source for final JSON and escaped static HTML; the exact final ID-bearing pretty advisory JSON including trailing newline must stay within the accepted 750,000-byte UTF-8 ceiling;
- suggested review order is advisory/noncanonical; there is no automatic advisory-to-Release-0.16/0.8 write path;
- a human must independently choose what to review and explicitly use the accepted Release 0.16 human decision path before any canonical recommendation/measurement/outcome work;
- add no runtime AI/model/provider call, provider SDK, API key/BYOK/credential path, network client/server/listener, prompt runner/model router/agent loop, embeddings/vector DB, browser automation, automatic priority/severity/business-impact scoring, automatic recommendation/outcome/action, database/table/migration, durable advisory persistence, canonical public schema, cloud/customer deployment, customer/private evidence transfer, paid service/dependency, Issue #49/#56/#81 implementation, Release 0.22, or Release 1.0.

See [accepted Release 0.21 guide](docs/operator-assist.md) and [ADR 0021](docs/decisions/0021-evidence-grounded-operator-assist.md). Release 0.21 itself did not authorize Release 0.22; Release 0.22 was separately authorized and is now accepted under Issue #110 / PR #112. Release 0.23 is separately authorized as an unaccepted candidate by Issue #120. Release 1.0 remains separately gated.

## Release 0.22 accepted measurement-interpretation boundary

Release 0.22 is **accepted and merged on `main` through Issue #110 / PR #112** at squash merge `d69fb468c934aae41687b8d8f927ec2381cfcca9` and tree `4f8418391ea3941e19691d85d920f54ceb8a6b92`. Product exact-head review passed, post-merge Contracts run #470 / 39906956428 succeeded, Security Baseline run #11 / 39906956779 succeeded, and independence-clean review completed via business-operations#667 (review id `gas-110-pr112-91eb424c-correction-ir-v1`, disposition ACCEPT via PR business-operations#668). Releases 0.1–0.22 are the accepted baseline.

Preserve these accepted Release 0.22 rules:

- Release 0.22 remains pure/local Measurement Interpretation & Claim Ceiling semantics over two primary canonical Release 0.8 measurements and caller-supplied design, exposure, method, and source-quality context;
- `ai_prompt_cohort_change_only` requires explicit `ai_prompt_observation` metric semantics on BOTH baseline and follow-up contexts;
- bounded `promptCount` (1–1,000,000), `promptSamplingCadenceId`, and `promptSamplingCadenceVersion` continuity is required; missing context lowers the ceiling to descriptive observation and changed sampling context is discontinuous;
- no canonical schema, migration/table, or persistence expansion;
- no provider/API/OAuth/network/runtime AI/prompt runner/scheduler/cloud/customer/private-data work;
- no automatic recommendation, priority, decision, outcome, action/remediation or business/revenue causality authority;
- no universal Search/SEO/AI visibility/confidence score or cross-provider equivalence;
- no public pricing/SLA/ranking/citation/traffic/lead/time-savings claim;
- incremental cash $0 / included capacity only;
- Release 0.23 authority is limited to the separately frozen Issue #120 candidate; acceptance is not implied;
- Release 1.0 remains separately gated.

See [accepted Release 0.22 guide](docs/measurement-interpretation.md) and [ADR 0022](docs/decisions/0022-measurement-interpretation-claim-ceilings.md).

## Release 0.23 authorized SERP-intent-validation candidate boundary

Issue #120 freezes and authorizes exactly one bounded Release 0.23 candidate. Preserve these candidate rules until Product/IR acceptance:

- consume only caller-supplied sanitized synthetic/public-safe SERP snapshots; no provider retrieval or credential path;
- use one explicit versioned policy for top-K, comparable-pair floor, same/distinct thresholds with an ambiguity band, collection-time skew, repeated-borderline snapshot requirements, and exact source-equality semantics;
- require comparable provider, method/version, location, language, device, search surface, source-schema version, time, and source completeness;
- keep requested provider depth distinct from actual eligible unique organic depth;
- select only eligible `organic` rows for top-K overlap and use provider same-type/group rank when supplied consistently rather than mixed absolute positions;
- exact URL strings are the v1 comparison unit; deduplicate exact duplicates only and do not silently canonicalize variants;
- compute exact URL intersection/union/Jaccard/shared URLs and report supplied registrable-domain overlap separately;
- typed SERP/result-shape context is descriptive only and cannot change candidate state;
- output states are exactly `same_result_family_candidate`, `distinct_result_family_candidate`, `ambiguous`, or `not_ready`; unsafe evidence returns `not_ready`, never manufactured zero;
- deterministic identity binds normalized query selection, policy, source context, methodology, and comparison evidence through accepted canonical hashing helpers;
- preserve `humanIntentReviewRequired: true` and `noAutomaticPageChange: true` or exact semantic equivalents;
- emit no split/merge/consolidate/redirect/canonical/create/delete/rewrite/publish, recommendation, priority, approval, or external-action authority;
- add no canonical schema/table/migration, persistence, provider SDK/network client, crawler/scraper, DataForSEO usage, scheduler/worker, runtime AI, cloud, UI framework, customer/private evidence, or paid dependency/resource;
- package candidate version is `0.23.0`; accepted `main` remains 0.22.0 until merge.

See [Release 0.23 candidate guide](docs/serp-intent-validation.md) and [ADR 0023](docs/decisions/0023-serp-intent-validation-profile.md). The candidate still requires exact-head machine validation, Product semantic review, one fresh independence-clean IR, zero unresolved threads, and standing merge authority. This DEV lane must not self-accept, independently review, or merge it.
