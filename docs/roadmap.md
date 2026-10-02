# Evidence-driven technical roadmap

This is a proposed progression for a bounded LDW internal managed-service evidence-engine proof, not a promise to mechanically build every numbered release. Releases 0.1–0.17 are accepted and merged. Release 1.0 remains separately gated.

| Release | Bounded proof focus |
| --- | --- |
| 0.1 | Accepted architecture and authority foundation: publication-safe documentation and repository instructions. |
| 0.2 | Accepted: canonical contracts, validation, deterministic hashing, JSON Schemas, and synthetic fixtures/tests. See [contract guide](contracts.md). |
| 0.3 | Accepted: trusted tenant contexts, local SQLite, composite ownership, atomic bounded collection parts, scoped idempotency, exact schema verification, and adversarial isolation tests. See [persistence guide](persistence.md). |
| 0.4 | Accepted: authenticated bounded ingestion with opaque injected authentication, exact grants, one-part transport, typed part conflicts, and persisted-progress responses. See [ingestion guide](ingestion.md). |
| 0.5 | Accepted: deterministic WQT normalized-evidence adapter; consume WQT v1/minor1 bytes plus trusted configuration, split SiteOne/Lighthouse provider streams, preserve provenance/missingness, and pack accepted bounded parts without rebuilding scanners or using provider networking. See [WQT adapter guide](adapters/wqt.md). |
| 0.6 | Accepted: deterministic sanitized ZeroRank evidence adapter; consume exact v1/minor0 inner artifact bytes plus trusted configuration, reconcile workspace projections, split five endpoint-specific `zerorank` streams, preserve failed/unknown completeness semantics, and pack accepted bounded parts without provider networking or credentials. See [ZeroRank adapter guide](adapters/zerorank.md). |
| 0.7 | Accepted: deterministic same-semantic-stream longitudinal evidence diff plus non-ranked review-attention filtering. Uses tenant-scoped atomic collection snapshots, exact cohort identity, exact value/missing-state transitions, conservative completeness-aware absence semantics, application-local output, and no cross-provider correlation or prioritization. See [diff guide](analysis/diff.md). |
| 0.8 | Accepted: evidence-linked human-authored recommendation review history plus explicit measurement/outcome ledger. Uses unchanged canonical 1.0 recommendation/measurement/outcome contracts, trusted existing `TenantContext`, immutable recommendation revisions, accepted migration 2 with three bounded local SQLite ledger tables, caller-driven measurements, and human-declared outcomes. No automatic recommendation/ranking/correlation/action/UI/network/AI. See [review-ledger guide](review-ledger.md) and [ADR 0007](decisions/0007-human-review-measurement-ledger.md). |
| 0.9 | Accepted: compact read-only local LDW operator case view + printable standalone HTML report preview over accepted Release 0.7/0.8 reads. Explicit trusted scope and selected collection/recommendation IDs; no new persistence, write controls, server, provider networking, runtime AI, action, framework, customer data, or cloud deployment. See [operator case-view guide](operator-case-view.md) and [ADR 0008](decisions/0008-operator-case-view.md). |
| 0.10 | Accepted: Search Analytics Signal Pack over bounded sanitized Google Search Console-style evidence; deterministic window deltas, explicit-policy striking-distance/decay/CTR opportunity candidates, neutral query→page overlap candidates, exact compatibility, conservative freshness/coverage semantics, cross-field metric integrity, and no provider networking or automatic recommendation priority. See [search-analytics guide](search-analytics-signal-pack.md) and [ADR 0010](decisions/0010-search-analytics-signal-pack.md). |
| 0.11 | Accepted: Search Change Annotation & Outcome Cohorts; bind one human/trusted change annotation to one exact Release 0.10 row/metric, prepare existing Release 0.8 baseline/follow-up measurements, preserve readiness/coverage, bind follow-up identity to the exact canonical baseline relationship, and leave outcome direction human-declared without causal inference, provider scheduling, or new persistence. See [search-change guide](search-change-outcome-cohorts.md) and [ADR 0011](decisions/0011-search-change-outcome-cohorts.md). |
| 0.12 | Accepted: Page-Focus Candidate Analysis; aggregate every row for one exact Release 0.10 page into strict caller-supplied query clusters, apply explicit threshold policy, emit candidate/no-candidate/not-ready state, and require separate SERP validation before any intent or split/consolidate conclusion. No semantic clustering, persistence, recommendation/action creation, or autonomous content generation/publishing. See [page-focus guide](page-focus-candidate-analysis.md) and [ADR 0012](decisions/0012-page-focus-candidate-analysis.md). |
| 0.13 | Accepted: Discovery Diagnostics Pack over sanitized Google/Bing/Yandex/IndexNow-style evidence; provider-preserving canonical adaptation, exact-URL readiness, deterministic multi-finding diagnostics, IndexNow submission context, optional Release 0.10 search context, deterministic site rollup, and static operator preview. No provider networking, implicit URL equivalence, universal score, automatic remediation, new persistence, or runtime AI. See [discovery guide](discovery-diagnostics.md) and [ADR 0013](decisions/0013-discovery-diagnostics-pack.md). |
| 0.14 | Accepted: AI Visibility Intelligence Pack over sanitized Bing AI Performance evidence plus accepted Release 0.6 ZeroRank validation/projection; provider-specific readiness/change/concentration, bounded cross-source divergence, optional accepted context, deterministic report and static HTML. See [AI Visibility guide](ai-visibility-intelligence.md) and [ADR 0014](decisions/0014-ai-visibility-intelligence-pack.md). |
| 0.15 | **Accepted:** Unified Operator Intelligence & Service Brief Pack; strict read-only composition over accepted Release 0.7–0.14 surfaces, fixed readiness, unranked attention, exact-string URL index, bounded human history, provenance manifest, deterministic JSON/HTML outputs, no new schema/persistence/network/AI/action. See [service-brief guide](service-brief.md) and [ADR 0015](decisions/0015-unified-operator-service-brief.md). |
| 0.16 | **Accepted:** Human Decision & Measurement Cycle Pack; exact human attention selection over recomputed Release 0.15 evidence, explicit human decision, optional Release 0.8 recommendation/measurement/outcome call-through, optional Release 0.11 Search Change plan, exact current-cycle measurement/outcome isolation, deterministic JSON/HTML decision dossier. See [decision-cycle guide](decision-cycle.md) and [ADR 0016](decisions/0016-human-decision-measurement-cycle.md). |
| 0.17 | **Accepted via Issue #60 / PR #62:** Operator Workspace & Service Reporting UX Pack. First cohesive internal LDW operator experience over accepted 0.15/0.16 semantics: site/case navigation, evidence freshness/readiness, attention review, decision/recommendation/measurement/outcome workflow, history/timeline, and customer-safe report composition/export. No provider networking, customer portal, cloud deployment, runtime AI, or production action authority. |
| 0.18 | **ACTIVE / PRODUCT-FROZEN under Issue #65:** Repeatable Managed-Service Run & Evidence Intake Pack. Standardize one service run from provider/sensor handoff through freshness/readiness checks, prior-cycle comparison, follow-up queue, report package assembly, and durable run evidence. Provider reads/scheduling remain Automation-owned; G.A.S. stays provider-network-free. |
| 0.19 | **Directional:** Internal Portfolio / Multi-Site Operations Console. Give LDW one internal control plane across managed sites for evidence freshness, source failures, unresolved attention, decision-cycle state, due follow-up, and report status. Internal operations only; not customer SaaS or a customer portal. |
| 0.20 | **Directional:** Private-Runtime Packaging & Portability Readiness. Prove configuration/import-export/backup/retention/deletion/rollback boundaries, private evidence placement, and deployment portability before any cloud/customer runtime. No production deployment is authorized by 0.20 itself. |
| 1.0 | **Separately gated:** bounded private/cloud deployment proof; candidate Workers, D1, and static operator assets only after identity/auth, retention/deletion, workload/cost, rollback/decommission, and service-demand gates are satisfied. No customer portal/SaaS is authorized by this roadmap. |


## Forward roadmap — UX, reporting, and service maturity

The accepted 0.1–0.17 baseline now contains enough evidence, review, measurement, outcome, and deterministic report semantics to stop treating UX as premature. The next phase should turn those accepted semantics into a repeatable **LDW operator product** before adding more commodity sensing.

### 0.17 — Operator Workspace & Service Reporting UX Pack — ACCEPTED (#60 / PR #62)

**Primary goal:** make G.A.S. usable by an LDW operator without reconstructing a service run from JSON files, CLI output, and separate static reports. Issue #60 is the authoritative frozen implementation contract; the roadmap description remains directional context, not a substitute for that release contract.

Expected capability themes:

- internal site/case selector over trusted scope;
- evidence-source freshness, coverage, missingness, and readiness summary;
- unified Release 0.15 service brief navigation;
- attention-item review and exact evidence drill-down;
- Release 0.16 human decision workflow;
- current recommendation/lifecycle/history view;
- Search Change measurement-plan state;
- exact current-cycle baseline/follow-up/outcome timeline;
- customer-safe report composer that separates operator detail from customer-facing summary;
- print/export-friendly deterministic report output;
- preserve a maximum-small-set summary model for customer delivery rather than dumping every finding;
- no new provider execution or autonomous recommendation/action semantics merely to make the UI convenient.

This should be a **large coherent UX release**, not a cosmetic dashboard skin. The UI must consume accepted service-brief / decision-cycle semantics directly so fixes remain baked into the engine instead of duplicated in presentation code.

**Service milestone after 0.17:** LDW should be able to operate G.A.S. internally as a guided workbench on LDW-owned/public-safe evidence and produce a consistent human-reviewed customer-safe report package. It is still not a customer portal.

### 0.18 — Repeatable Managed-Service Run & Evidence Intake Pack — ACTIVE / PRODUCT-FROZEN (#65)

**Primary goal:** turn one operator session into a reproducible service run. Issue #65 is the authoritative frozen implementation contract; this roadmap section remains directional context.

Expected capability themes:

- deliberate WQT v1 minor-3 compatibility plus a pure/local WQT provider-snapshot resolution seam for later private consumers;
- bounded provider/sensor artifact handoff manifest;
- run identity and source/freshness/readiness checklist;
- previous-run / current-run comparison;
- unresolved attention and accepted decision carry-forward;
- projection of accepted Release 0.16 follow-up/readiness states rather than a second scheduler/task engine;
- report-package assembly from accepted evidence + human decisions + outcomes;
- deterministic file-based service-run audit/provenance package with exact hashes/byte counts;
- explicit handoff boundary to Automation & Agent Operations for provider reads, cadence, schedules, and transport.

G.A.S. should still not become the provider poller, scheduler, workflow engine, credential store, private WQT runtime, or REPORT-AUTO delivery mechanism. Design Issue #63 remains separate and private-runtime implementation requires a later gate.

**Service milestone after 0.18:** LDW should be able to execute a repeatable managed visibility engagement with substantially less manual reconciliation. Commercial packaging/pricing/claims remain governed by business-operations #280.

### 0.19 — Internal Portfolio / Multi-Site Operations Console

**Primary goal:** manage several service engagements without opening each case independently.

Expected capability themes:

- internal LDW site/engagement inventory;
- evidence freshness and source-failure exceptions;
- unread/review-needed attention counts without universal scoring;
- recommendation / measurement / outcome state;
- upcoming or overdue follow-up state;
- report-generation / delivery readiness state;
- bounded cross-site operational summaries that preserve each site's tenant/scope boundary.

This is an **internal control plane**, not external customer SaaS. Cross-customer semantic data must remain isolated; portfolio views should expose operational metadata needed to run the service, not flatten private customer evidence into one shared dataset.

**Service milestone after 0.19:** LDW can manage a small portfolio of recurring visibility engagements from one internal workspace.

### 0.20 — Private-Runtime Packaging & Portability Readiness

**Primary goal:** prove G.A.S. can be packaged and moved safely before authorizing a deployed runtime.

Expected capability themes:

- explicit runtime/config bundle;
- private evidence location and separation from the public repository;
- import/export and backup/restore proof;
- retention/deletion semantics;
- environment/config validation;
- deployment portability;
- rollback/decommission package;
- representative workload and storage measurements;
- exact identity/auth requirements documented before deployment.

0.20 itself should not silently become production cloud deployment.

### 1.0 — Bounded private/cloud deployment proof

Release 1.0 remains a **separate consequential gate**, not the next automatic engineering step.

A 1.0 proof should happen only after the internal operator/service workflow is useful enough to justify deployment and after the required gate covers:

- identity/auth;
- customer/private-data boundary;
- exact resources;
- retention/deletion;
- measured workload and cost;
- backup/recovery;
- rollback/decommission;
- customer ownership / LDW scoped-access model;
- support burden;
- service demand.

Candidate architecture remains low-cost and portable; Workers/D1/static assets are candidates, not commitments.

A **customer-facing portal or self-service SaaS is not part of the committed 0.x roadmap**. It should be considered only after 1.0/private-runtime proof plus separate Business Value & Strategy evidence that customers actually need it.

## Parallel research/module lanes

These research tracks may feed a future large release when evidence is ready; they did not block accepted 0.17 UX/reporting work:

- **Issue #49 — Internal-Link Coverage Intelligence:** wait for upstream SiteOne evidence before implementation; prefer upstream/general graph support over an LDW-only fork.
- **Issue #56 — AI Buyer-Intent Recommendation Probe Evidence:** preserve exact non-branded prompts, provider availability, model-surfaced alternatives, citation/source evidence, and repeatability before implementation; do not copy proprietary vendor scores.
- **Local/GBP visibility:** integrate only when a low-cost authoritative source proves useful; do not build a local rank-grid crawler.
- **GA4/conversion/AI-referral context:** add only when it materially improves outcome interpretation; do not require it for every engagement.
- **Alerts/cadence/provider transport:** Automation & Agent Operations owns schedules, provider reads, transport, and operational observability; G.A.S. owns semantics, decision support, reports, and outcome history.
- **Execution/remediation:** any CMS/provider/site mutation remains separately authorized; accepted recommendations never become automatic production action.

## Service-use maturity map

| Maturity point | What is realistically usable |
| --- | --- |
| **Now — accepted 0.16** | Engine semantics are strong enough for internal proofs: deterministic service brief, decision cycle, recommendation/measurement/outcome history, and printable static reports. Operation is still developer/operator-heavy rather than a polished product UX. |
| **After 0.17** | First real internal operator UX and report-building experience. Suitable for LDW-controlled service delivery/pilot operation on properly authorized evidence; still no customer portal or autonomous action. |
| **After 0.18** | Repeatable managed-service run method with evidence intake, follow-up state, and report-package assembly. This is the point where technical delivery should feel like a standardized service rather than an engineering proof. |
| **After 0.19** | Internal multi-site/portfolio operations become practical for several recurring engagements. |
| **After 0.20** | Runtime is packaged/portable enough to evaluate a real private/cloud deployment safely. |
| **1.0 gate** | Bounded deployed private/cloud proof only after service value, auth/data boundaries, cost, and rollback are proven. |
| **Post-1.0 only if demand exists** | Customer portal, self-service, customer-facing SaaS, or broader automated action surfaces. |


## Release 0.7 narrowing decision

The earlier shorthand “diff, correlation, prioritization” was broader than current evidence semantics justify. Accepted canonical metrics do not define universal direction, severity, materiality, business impact, or recommendation priority. Accepted Release 0.7 therefore implements only deterministic longitudinal diff and review-attention filtering. Correlation and prioritization remain deferred until a later separately authorized release has evidence and explicit policy sufficient to define them without inventing meaning.

## Release 0.8 narrowing decision

Issue #15 narrows Release 0.8 to service-history infrastructure rather than a generic recommendation engine. Accepted Release 0.8 records only human/trusted-caller-authored recommendations, immutable review revisions, explicitly selected canonical measurements, and human-declared outcomes. Recommendation priority remains `unassessed`; numeric direction never automatically becomes improved/regressed; action/execution authority remains separate; and the accepted release adds no UI, provider networking, scheduler, runtime AI, or cloud resource.

## Release 0.9 narrowing decision

Issue #18 narrows Release 0.9 to a provider-neutral read-only local case view rather than a commodity SEO/AEO dashboard or customer-reporting SaaS. The accepted release assembles only accepted mechanical evidence diff, current human-authored recommendations, one selected immutable recommendation history, canonical supporting evidence, associated measurements, and human-declared outcomes. It preserves coverage uncertainty and non-evaluative numeric delta semantics, uses no write path, and renders one escaped self-contained HTML/print preview without external resources or JavaScript.

## GAS-ROADMAP-002 evergreen sequence refinement

Owner direction in Issue #31 authorizes long-running internal G.A.S. R&D while keeping managed-service commercialization and external SaaS separately gated. The living competitor review is maintained in [docs/research/competitor-capability-matrix.md](research/competitor-capability-matrix.md).

Current evidence keeps 0.10 Search Analytics Signal Pack first, but changes the original 0.11/0.12 hypothesis:

- **0.11 moves experimentation/change annotation ahead of intent splitting.** It composes directly with accepted Release 0.8 recommendation/measurement/outcome history and can close more of the operating loop without new commodity sensing.
- **Page-focus analysis becomes 0.12 and is deliberately narrower.** Query→page overlap is evidence, not proof of distinct intent. Split/consolidate conclusions require separately sourced SERP/result validation.
- **Multi-engine diagnostics moves to 0.13.** The analysis is useful, but implementation should follow stable upstream sanitized contracts for Google/Bing/Yandex/IndexNow-style evidence rather than putting provider networking into G.A.S.
- AI visibility, local rank grids, web-scale rank/SERP collection, backlink indexes, crawlers, and dashboard platforms remain replaceable sensors/commodity tooling unless a concrete LDW decision proves a gap.

This sequence is not self-executing. Each functional release still requires exact current-main reconciliation, a bounded release contract, branch/PR, deterministic validation, security/privacy review, independent review, and Product Orchestrator acceptance.

## Gates and evaluation

Releases 0.1–0.17 are accepted on `main`; Release 0.8 was accepted after exact-head validation, independent review, and Product ORCH2 acceptance and merged via PR #16. Release 0.9 was accepted after exact-head validation, independent review, and Product ORCH2 acceptance and merged via PR #19. Release 0.10 was accepted after exact-head validation, a bounded metric-integrity correction, independent exact-head re-review, and Product acceptance and merged via PR #35. Release 0.11 was accepted after exact-head validation, a bounded deterministic follow-up-identity correction, independent exact-head re-review, and Product acceptance and merged via PR #38. Release 0.12 was accepted after exact-head validation, independent exact-head review, and Product acceptance and merged via PR #41. Release 0.13 was accepted after whole-pack exact-head validation, one bounded IndexNow semantic-integrity correction, final independent exact-head review, Product acceptance, protected-main squash merge via PR #45, and post-merge Contracts verification. Release 0.14 was accepted after Product whole-pack exact-head review, bounded Bing semantic-integrity corrections, independent whole-pack review, a bounded ZeroRank trust-boundary correction, final independent exact-head re-review, Product acceptance, protected-main squash merge via PR #47, and post-merge Contracts verification. Release 0.15 was accepted after Product whole-pack exact-head review, one bounded service-history semantic-identity correction, final independent whole-pack exact-head review, protected-main squash merge via PR #52, and post-merge Contracts verification. Release 0.17 was accepted after Product whole-pack review, one integrated browser/human-decision and fail-closed report-input correction, final independent whole-pack exact-head ACCEPT, protected-main squash merge via PR #62 at `52ea537e99a92b05a52c2e732a86104d65f2ea28`, and post-merge Contracts `36968094314` SUCCESS. Release 1.0 remains separately gated. A roadmap row is not itself implementation authority. Repository governance targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

Future functional releases require adversarial synthetic second-tenant testing for every newly implemented owned surface. Use only authorized LDW-owned evidence and clearly synthetic test material; private runtime evidence stays outside public GitHub. Customer evidence and customer deployment remain excluded.

Each step should establish whether the engine reduces recurring delivery/reconciliation labor, improves reviewable evidence handling, and justifies its operating/support burden. Releases may be collapsed, stopped, or returned for authority review if evidence shows duplication, poor value, generic SEO-platform drift, or excessive burden. Delegated authority is permission, not a mandate.

Release 1.0 requires a separate cloud deployment gate covering current account headroom, identity/auth, exact resources, retention/deletion, measured workload/cost estimates, and rollback/decommission planning. **$0 incremental recurring cost is the target for the bounded proof and must be measured/verified before deployment.** No permanent $0 guarantee is made.

## Deferred scope

Cross-provider/generic correlation, direction/severity/materiality/business-impact policy, automated prioritization, inference generation, action/execution logic, production/customer portal behavior, and Release 1.0+ remain separately gated. Release 0.8's bounded human-authored recommendation records and measurement/outcome ledger do not authorize any of those deferred capabilities. GSC, GA4, Bing Webmaster, Google Business Profile, Decloak correlation, R2, Queues, Workflows, Durable Objects, runtime AI, BYOK, MCP, Brand2Social actions, customer portal, and external remediation remain deferred until separately justified and authorized. Accepted Release 0.6 does not authorize G.A.S. to poll ZeroRank, hold ZeroRank credentials, call Activepieces at runtime, add action/write authority, or deploy cloud resources. Accepted Release 0.4 also does not authorize a production identity provider, public listener/API, or cloud deployment. Deferred does not mean promised.

Internal automation does not establish commercial demand. Audit-first/service-first validation continues independently; this roadmap offers no public pricing, SLA, or outcome guarantees. See [authorization](authorization.md) and [architecture](architecture.md).

## Release 0.14 — accepted AI Visibility Intelligence Pack

Release 0.14 is **accepted and merged through PR #47** under Issue #44. Preserve the accepted provider-specific evidence semantics, conservative missingness/absence rules, and the ZeroRank raw-evidence/trusted-config analysis boundary.

The accepted release combines:

1. strict sanitized Bing AI Performance evidence adaptation with no provider networking;
2. accepted Release 0.6 ZeroRank validation reuse and bounded visibility projection;
3. explicit provider readiness/comparability;
4. within-provider descriptive change;
5. provider-specific citation/source concentration;
6. narrow explicit-presence cross-source divergence;
7. optional exact caller-mapped query/prompt cohort coverage divergence;
8. optional accepted Release 0.10/0.11/0.12 descriptive context;
9. deterministic site report;
10. bounded static read-only operator HTML.

The product boundary is deliberately narrower than a general AEO/GEO platform: no universal score, provider metric blending, automatic semantic query/prompt matching, causal attribution, priority/remediation, provider retrieval, runtime AI, new persistence, cloud deployment, or paid dependency.

Incremental recurring-cost target remains $0. Existing Node/Zod/canonical contracts are sufficient for the accepted release.

Release 0.15 is the **accepted Unified Operator Intelligence & Service Brief Pack** under Issue #51 and merged PR #52. Internal-link / authority-opportunity work remains separate under Issue #49 and was not authorized into Release 0.15.


## Release 0.15 — accepted Unified Operator Intelligence & Service Brief Pack

Issue #51 records the accepted bounded composition release over accepted Release 0.7–0.14 capabilities. Release 0.15 owns only strict input validation, producer reuse, readiness presentation, unranked finding navigation, exact-string URL evidence indexing, bounded human-history reads, compact provenance, deterministic brief identity/JSON, and static printable HTML.

It does not authorize generic correlation, causal inference, priority/severity/materiality/business-impact scoring, automatic recommendations, remediation/action, new persistence/schema, provider networking, credentials, runtime AI, cloud deployment, customer/private evidence, paid dependencies, Issue #49 implementation, or Release 1.0.


## Release 0.16 — accepted Human Decision & Measurement Cycle Pack

Issue #54 records one large coherent accepted release over the accepted Release 0.15 service brief and existing Release 0.8/0.11 seams.

The accepted release closes a bounded internal human loop:

1. recompute the accepted Release 0.15 service brief;
2. resolve exact human-selected attention;
3. record one human decision statement;
4. optionally prepare/explicitly create one canonical Release 0.8 recommendation;
5. optionally compose one accepted Release 0.11 Search Change measurement plan;
6. explicitly record prepared measurements one at a time through Release 0.8;
7. project follow-up readiness without success/health scoring;
8. explicitly record a human-declared Release 0.8 outcome;
9. emit one deterministic bounded Decision Cycle Dossier JSON/static HTML.

This remains internal service-delivery enabling infrastructure, not a task manager, statistical SEO test platform, generic changelog, marketing dashboard SaaS, action engine, or automated strategy system. Incremental recurring cash target remains $0.

Issue #49 internal-link work and Release 1.0 remain separately gated.

## Release 0.17 — accepted Operator Workspace & Service Reporting UX Pack

Issue #60 authorized one large coherent Release 0.17 over accepted Releases 0.15 and 0.16; PR #62 is now accepted and merged.

Accepted flow:

1. recompute accepted Release 0.15 service state;
2. optionally recompute accepted Release 0.16 decision-cycle state;
3. emit one deterministic OperatorWorkspace;
4. use a self-contained local browser for bounded review/filter/selection;
5. download strict untrusted action/report requests;
6. authoritatively recompute and fail on stale source identity;
7. delegate durable writes only to accepted Release 0.16/0.8 services;
8. regenerate authoritative workspace/customer report state.

Customer reporting remains human-reviewed and bounded to one-to-three explicit focus selections. There is no automatic top-three ranking, health/business score, AI-written report, new persistence, hosted dashboard, customer portal, provider sensing, scheduled delivery, Issue #49/#56 implementation, Release 0.18 implementation, or Release 1.0 implementation.
