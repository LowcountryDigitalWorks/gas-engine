# G.A.S. Engine

**Generative / Answer / Search** — LDW-operated internal managed-service enabling infrastructure.

G.A.S. Engine is intended to help Lowcountry Digital Works normalize evidence from replaceable sensors, preserve provenance and history, compare longitudinal observations, support explicitly human-reviewed recommendations, and measure subsequent outcomes. The proof should establish whether this reduces recurring delivery and reconciliation labor.

**Current accepted baseline: Releases 0.1–0.17 are accepted and merged on `main`.** Release 0.4 adds a bounded authenticated application/transport seam without changing accepted evidence contracts or the Release 0.3 SQLite schema. Release 0.5 adds a pure/local adapter for already-normalized WQT v1/minor1 evidence. Release 0.6 adds a second pure/local adapter for the exact sanitized ZeroRank `ldw.zerorank-evidence.v1` minor-0 artifact; neither adapter executes sensors, holds provider credentials, issues tenant authority, or deploys anything. Release 0.7 adds deterministic same-stream longitudinal evidence diff plus non-ranked review-attention classification over coherent tenant-scoped persisted snapshots.

**Release 0.8 is accepted and merged on `main` through PR #16.** It adds provider-neutral, evidence-linked human review history plus an explicit measurement/outcome ledger. Recommendations are human/trusted-caller authored only, priority remains `unassessed`, measurements resolve selected canonical observations, outcome direction is human-declared, and accepted recommendations create no action authority. Canonical recommendation/measurement/outcome contracts remain schemaVersion `1.0`; Release 0.8 adds no dependency and keeps the $0 incremental recurring-cost proof boundary. See the [Release 0.8 review-ledger guide](docs/review-ledger.md) and [ADR 0007](docs/decisions/0007-human-review-measurement-ledger.md).

**Release 0.9 is accepted and merged on `main` through PR #19.** It adds a compact read-only local operator case view and printable standalone HTML report preview over accepted Release 0.7/0.8 read surfaces. The accepted release adds no persistence/schema, write controls, server/listener, provider networking, runtime AI, action/remediation, framework, customer evidence, or cloud deployment. See the [Release 0.9 operator case-view guide](docs/operator-case-view.md) and [ADR 0008](docs/decisions/0008-operator-case-view.md).

**Release 0.10 is accepted and merged on `main` through PR #35.** It adds one pure/local sanitized Google Search Console-style search-analytics adapter plus a deterministic explicit-policy signal pack over exact compatible windows. The accepted release enforces bounded source metric integrity, conservative missingness/coverage, and the verified 384-row / 1,536-observation proof while adding no provider networking/OAuth/credentials, canonical schema/persistence change, scheduler, automatic recommendation/priority/causal judgment, runtime AI, cloud resource, customer evidence, or paid dependency. See the [Release 0.10 search-analytics guide](docs/search-analytics-signal-pack.md) and [ADR 0010](docs/decisions/0010-search-analytics-signal-pack.md).

**Release 0.11 is accepted and merged on `main` through PR #38.** It adds only a pure/local application composition between one human/trusted-caller change annotation, one exact Release 0.10 search row/metric, and existing Release 0.8 measurement/outcome services. It prepares deterministic baseline/follow-up measurement inputs and readiness for later human assessment without new persistence, scheduling, provider networking, action authority, automatic outcome direction, causality, runtime AI, cloud resources, customer evidence, or paid dependencies. The accepted release binds follow-up deterministic identity to the exact canonical baseline measurement relationship. See the [Release 0.11 search-change guide](docs/search-change-outcome-cohorts.md) and [ADR 0011](docs/decisions/0011-search-change-outcome-cohorts.md).

**Release 0.12 is accepted and merged on `main` through PR #41.** It adds only pure/local one-page aggregation over accepted Release 0.10 search evidence with strict caller-supplied query-cluster assignments and explicit threshold policy. It may emit a neutral page-focus divergence candidate only from final/complete/nontruncated/nonanonymized evidence and always requires separate SERP/result validation before any intent or content-architecture conclusion. It adds no cluster inference, provider networking, persistence, recommendation/action, runtime AI, cloud resource, customer evidence, or paid dependency. See the [Release 0.12 page-focus guide](docs/page-focus-candidate-analysis.md) and [ADR 0012](docs/decisions/0012-page-focus-candidate-analysis.md).

**Release 0.13 is accepted and merged on `main` through PR #45.** It adds one pure/local Discovery Diagnostics Pack over sanitized Google/Bing/Yandex/IndexNow-style evidence: provider-preserving adaptation into existing canonical observations, exact-URL cross-engine readiness/findings, descriptive IndexNow submission context, optional accepted Release 0.10 Search Analytics context, deterministic site rollups, and a compact static operator preview. It adds no provider networking/credentials, canonical schema or persistence change, generic crawler, automatic remediation/recommendation, runtime AI, cloud resource, customer evidence, paid service, or new dependency. See the [Release 0.13 adapter guide](docs/adapters/discovery-diagnostics.md), [Discovery Diagnostics guide](docs/discovery-diagnostics.md), and [ADR 0013](docs/decisions/0013-discovery-diagnostics-pack.md).

**Release 0.14 is accepted and merged on `main` through PR #47.** It adds a strict local Bing AI Performance sanitized-evidence adapter, accepted Release 0.6 ZeroRank validation reuse with an internally created bounded provider-specific projection, explicit readiness/comparability, within-provider descriptive change, provider-specific concentration, narrowly bounded cross-source presence/coverage divergence, optional accepted Release 0.10/0.11/0.12 context, and a deterministic static read-only operator report. The accepted release preserves sampled/aggregated Bing semantics, grouped grounding queries rather than exact user prompts, ZeroRank v1 unknown-exhaustion limits, and no raw metric equivalence across providers. It adds no provider networking, canonical schema/persistence change, runtime AI, action authority, cloud resource, paid service, or new dependency. Acceptance followed Product exact-head review, bounded Bing integrity corrections, independent review, the bounded ZeroRank trust-boundary correction, final independent exact-head re-review, protected-main squash merge, and post-merge Contracts verification. See the [Bing AI adapter guide](docs/adapters/bing-ai-performance.md), [Release 0.14 AI Visibility guide](docs/ai-visibility-intelligence.md), and [ADR 0014](docs/decisions/0014-ai-visibility-intelligence-pack.md).

**Release 0.15 is accepted and merged on `main` through PR #52.** It composes accepted Release 0.7–0.14 read/analysis surfaces into one bounded deterministic service brief: fixed module readiness, an unranked attention register, exact-string URL evidence indexing, bounded human service history, compact provenance, deterministic JSON identity/output, and a standalone printable static HTML report. Acceptance followed Product whole-pack review, one bounded service-history semantic-identity correction, final independent exact-head review, protected-main squash merge, and post-merge Contracts verification. It adds no canonical schema, persistence/migration, provider networking, runtime AI, cloud resource, scoring/prioritization, automatic recommendation/remediation/action, paid dependency, Issue #49 work, or Release 1.0 implementation. See the [Release 0.15 service-brief guide](docs/service-brief.md) and [ADR 0015](docs/decisions/0015-unified-operator-service-brief.md).

**Release 0.16 is accepted and merged on `main` through PR #55.** It adds one application-local Human Decision & Measurement Cycle over accepted Release 0.15 selection, Release 0.8 recommendation/measurement/outcome services, and Release 0.11 Search Change planning. It recomputes the accepted service brief internally, preserves exact human selection and human-authored decision semantics, keeps writes explicit and one-record-at-a-time, and emits deterministic bounded JSON/static HTML dossiers. Acceptance followed Product whole-pack exact-head review, integrated cycle-outcome association and current-cycle measurement-isolation corrections, a final bounded independent exact-head re-review, protected-main squash merge, and post-merge Contracts verification. It adds no new wire schema, persistence/migration, generic task/experiment system, provider networking, runtime AI, cloud resource, automatic recommendation/outcome direction, production action, paid service, Issue #49 implementation, Issue #56 implementation, or Release 1.0 implementation. See the [Release 0.16 decision-cycle guide](docs/decision-cycle.md) and [ADR 0016](docs/decisions/0016-human-decision-measurement-cycle.md).

The intended long-term operating lifecycle is:

> OBSERVE → NORMALIZE → COMPARE → CORRELATE ONLY WHEN SEMANTICS SUPPORT IT → PRIORITIZE ONLY WITH AN EXPLICIT POLICY → RECOMMEND → APPROVE WHEN REQUIRED → ACT ONLY THROUGH SEPARATELY AUTHORIZED PATHS → RE-MEASURE → REPORT OUTCOME

## Forward roadmap at a glance

The canonical forward plan is maintained in [docs/roadmap.md](docs/roadmap.md). The next phase is intentionally **UX and service operations**, not another isolated analysis module.

- **0.17 — ACCEPTED — Operator Workspace & Service Reporting UX Pack (#60 / PR #62):** first cohesive internal LDW operator experience over accepted 0.15/0.16 semantics; site/case navigation, evidence/readiness, attention review, human decision/recommendation/measurement/outcome workflow, timeline/history, and customer-safe report composition/export.
- **0.18 — ACTIVE / PRODUCT-FROZEN — Repeatable Managed-Service Run & Evidence Intake Pack (#65):** standardize one reproducible service run over accepted 0.17 workspace/reporting, add deliberate WQT v1 minor-3 compatibility, exact source-receipt provenance, prior/current operational continuity, accepted 0.16 follow-up projection, and deterministic report-package assembly. Provider polling/scheduling remains outside G.A.S.
- **0.19 — Internal Portfolio / Multi-Site Operations Console:** one internal LDW control plane for multiple managed engagements: evidence freshness, source failures, review-needed state, follow-up status, and report readiness.
- **0.20 — Private-Runtime Packaging & Portability Readiness:** prove configuration, import/export, private evidence placement, retention/deletion, backup/restore, portability, rollback, and workload/cost assumptions before deployment.
- **1.0 — Separately gated private/cloud proof:** only after service value, auth/data boundaries, measured cost, recovery, and customer-ownership/support assumptions are proven.

**UX begins with accepted Release 0.17 (#60 / PR #62).** Reporting existed previously as deterministic static HTML in accepted 0.9/0.14/0.15/0.16; 0.17 turns those underlying semantics into a usable local operator workspace and consistent service-report workflow without buying a dashboard/reporting SaaS.

A customer portal or self-service SaaS is **not** committed in the 0.x roadmap. It is a post-1.0 possibility only if managed-service demand and Business Value & Strategy evidence justify the added auth, privacy, support, and product burden.

Parallel research such as internal-link intelligence (#49), AI buyer-intent probing (#56), local/GBP evidence, and later conversion/AI-referral context may feed future releases when evidence is ready, but should not block the active 0.18 service-run/evidence-intake path. Design Issue #63 remains separate private WQT consumer/history architecture and is not itself implementation authority.

The end-to-end operating lifecycle is not implemented. Release 0.2 validates records and comparison context, Release 0.3 stores validated evidence locally, Release 0.4 proves one write-only in-process authenticated ingestion route for bounded persistence parts, Release 0.5 deterministically maps an existing WQT normalized artifact into separate SiteOne/Lighthouse `CollectionBatch` streams, Release 0.6 deterministically maps an already-sanitized ZeroRank artifact into five endpoint-specific `zerorank` collection streams, and Release 0.7 deterministically compares compatible longitudinal collection snapshots while separating unchanged evidence from changed or coverage-uncertain evidence. Accepted Release 0.8 records human-authored recommendation revision history plus explicit measurements and human-declared outcomes. Accepted Release 0.9 adds only a standalone read-only local operator case/report preview over that accepted history. There is still no cross-provider correlation engine, automated prioritization policy, provider networking, production identity provider, network listener, customer portal, external execution, scheduler, runtime AI, or deployment.

## Initial proof and principles

The proof targets LDW's own public site, [lowcountrydigitalworks.com](https://lowcountrydigitalworks.com), using Website Quality Toolkit (WQT) and read-only ZeroRank evidence. A clearly synthetic second tenant is reserved for isolation testing.

- Build the LDW-specific evidence, provenance, human review, measurement, and outcome core; adapt replaceable sensors.
- Preserve source evidence separately from normalized observations, derived inferences, recommendations, actions, measurements, and outcomes.
- Treat tenant identity as an authorization boundary; a globally unique ID is not authorization.
- Preserve observed zero as a value and missing-data states as distinct states.
- Keep sensing, deterministic comparison, human review, and separately authorized execution distinct.

## Boundaries

This is not customer SaaS, self-service software, a standalone commercial software product, or a general SEO platform. Do not rebuild WQT, a crawler, ZeroRank, a CRM, or a workflow engine. No universal proprietary G.A.S. score is proposed.

This repository is **public**. Publication-safe architecture, contract code, and clearly synthetic fixtures belong here. Never commit customer evidence, customer names as test data, private vendor payloads, confidential business records, credentials, or secrets. Private runtime evidence must remain outside public GitHub.

**No software license grant.** Public visibility does not itself grant an open-source license.

Internal automation does not prove commercial demand. LDW's audit-first/service-first business model continues independently. This repository makes no public pricing, SLA, ranking, citation, traffic, lead, causal-performance, or time-savings guarantees.

## Local validation

Use Node.js 24.19.0 and npm 11.17.0 (Node 24 only). Dependency installation needs the package registry or an existing cache; the checks use only local/synthetic inputs.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

`check` runs strict typechecking, build, Node's contract, persistence, ingestion, adapter, analysis, review-ledger, and operator-view tests plus JSON Schema drift validation, the accepted Release 0.9 synthetic operator preview, the Release 0.13 synthetic discovery-diagnostics preview, the accepted Release 0.14 synthetic AI-visibility preview, and the accepted Release 0.15 JSON/HTML service-brief preview, and the accepted Release 0.16 full decision-cycle JSON/HTML preview. Tests use fresh in-memory databases or temporary synthetic files under ignored `local-artifacts/`, with cleanup after connections close. A preloaded network tripwire rejects accidental network calls; Node permissions limit filesystem writes to test artifacts and deny child processes/workers. To intentionally refresh exported wire schemas after a contract change, run `npm run build` then `npm run schemas:generate` and review the artifacts.

Read the [contract guide](docs/contracts.md) for wire/application validation differences, versions, bounds, hashing, and dependency rationale. JSON Schema alone does not prove domain consistency or authorize tenant access.

Read the [persistence guide](docs/persistence.md) for trusted contexts, composite ownership, bounded collection parts, idempotency, exact schema verification, and the limits of the local SQLite proof. Persistence itself still cannot mint tenant authority.

Read the [ingestion guide](docs/ingestion.md) for the sole authenticated principal issuer seam, exact grants, one-part transport envelope, 49,152-byte HTTP proof bound, progress semantics, typed part conflicts, and response mapping. Accepted Release 0.4 is not a production identity system or deployed API.

Read the [WQT adapter guide](docs/adapters/wqt.md) for accepted Release 0.5's exact supported WQT contract, trusted-config boundary, provider/source/observation mapping, timezone policy, deterministic identity/integrity, and byte-aware multipart packing. The adapter consumes normalized bytes only and has no WQT runtime/network dependency.

Read the [ZeroRank adapter guide](docs/adapters/zerorank.md) for accepted Release 0.6's exact sanitized v1/minor0 artifact contract, trusted-config boundary, workspace reconciliation, endpoint-specific completeness/failure mapping, runtime-type-aware observation mapping, deterministic identity/provenance, and bounded multipart packing. The adapter consumes sanitized bytes only and has no ZeroRank/Activepieces runtime or network dependency.

Read the [longitudinal diff guide](docs/analysis/diff.md) for accepted Release 0.7: exact same-stream collection compatibility, cohort-hash matching, non-evaluative delta states, coverage/absence semantics, deterministic ordering, the 2,048-observation snapshot bound, tenant-safe atomic read service, and synthetic WQT/ZeroRank-style value proof. Release 0.7 itself does not implement correlation, prioritization, inference, recommendation, action, or Release 0.8.

Read the [Release 0.8 review-ledger guide](docs/review-ledger.md) for the accepted boundary: human-authored `internal_review` / `unassessed` recommendations, immutable lifecycle revisions, canonical observation resolution, bounded measurement/outcome history, accepted local migration 2, human-declared outcome direction, and explicit no-action/no-network/no-AI boundaries.

Read the [Release 0.9 operator case-view guide](docs/operator-case-view.md) for the accepted release: explicit trusted scope + collection/recommendation selection, accepted bounded read surfaces only, preserved mechanical/human semantics, static HTML escaping/CSP, print styling, and synthetic local preview generation without a listener or write path.

## Documentation

- [Architecture and system boundaries](docs/architecture.md)
- [Evidence core decision](docs/decisions/0001-evidence-core.md)
- [Evidence-driven technical roadmap](docs/roadmap.md)
- [Canonical contracts and validation](docs/contracts.md)
- [Tenant-safe local persistence](docs/persistence.md)
- [Persistence boundary decision](docs/decisions/0002-tenant-safe-persistence-boundary.md)
- [Authenticated bounded ingestion](docs/ingestion.md)
- [Authenticated ingestion boundary decision](docs/decisions/0003-authenticated-ingestion-boundary.md)
- [WQT normalized-evidence adapter](docs/adapters/wqt.md)
- [WQT adapter decision](docs/decisions/0004-wqt-normalized-evidence-adapter.md)
- [ZeroRank sanitized-evidence adapter](docs/adapters/zerorank.md)
- [ZeroRank adapter decision](docs/decisions/0005-zerorank-sanitized-evidence-adapter.md)
- [Longitudinal evidence diff — accepted Release 0.7](docs/analysis/diff.md)
- [Longitudinal diff decision — ADR 0006](docs/decisions/0006-longitudinal-evidence-diff.md)
- [Release 0.8 review ledger — accepted](docs/review-ledger.md)
- [Human review and measurement/outcome ledger — ADR 0007](docs/decisions/0007-human-review-measurement-ledger.md)
- [Release 0.9 operator case view — accepted](docs/operator-case-view.md)
- [Operator case-view decision — accepted ADR 0008](docs/decisions/0008-operator-case-view.md)
- [Release 0.10 search-analytics signal pack — accepted](docs/search-analytics-signal-pack.md)
- [Search-analytics signal-pack decision — accepted ADR 0010](docs/decisions/0010-search-analytics-signal-pack.md)
- [Release 0.11 search change annotation & outcome cohorts — accepted](docs/search-change-outcome-cohorts.md)
- [Search change/outcome cohort decision — accepted ADR 0011](docs/decisions/0011-search-change-outcome-cohorts.md)
- [Release 0.12 page-focus candidate analysis — accepted](docs/page-focus-candidate-analysis.md)
- [Page-focus explicit-cluster / SERP-validation decision — accepted ADR 0012](docs/decisions/0012-page-focus-candidate-analysis.md)
- [Release 0.13 sanitized discovery-diagnostics adapter — accepted](docs/adapters/discovery-diagnostics.md)
- [Release 0.13 Discovery Diagnostics Pack — accepted](docs/discovery-diagnostics.md)
- [Discovery Diagnostics decision — accepted ADR 0013](docs/decisions/0013-discovery-diagnostics-pack.md)
- [Engineering authorization boundary](docs/authorization.md)
- [Security and private reporting](SECURITY.md)
- [Agent instructions](AGENTS.md)

- [Release 0.14 Bing AI Performance adapter](docs/adapters/bing-ai-performance.md)
- [Release 0.14 AI Visibility Intelligence guide](docs/ai-visibility-intelligence.md)
- [ADR 0014 — provider-preserving AI visibility intelligence](docs/decisions/0014-ai-visibility-intelligence-pack.md)

- [Release 0.16 decision cycle — accepted](docs/decision-cycle.md)
- [Human decision & measurement cycle — accepted ADR 0016](docs/decisions/0016-human-decision-measurement-cycle.md)

## Release 0.17 — Operator Workspace & Service Reporting UX Pack — accepted

Release 0.17 is **accepted and merged on `main` through PR #62** at squash merge `52ea537e99a92b05a52c2e732a86104d65f2ea28`; post-merge Contracts `36968094314` succeeded.

The accepted release adds the first cohesive internal LDW workbench over accepted Release 0.15/0.16 semantics: deterministic OperatorWorkspace snapshots, a self-contained local browser workbench, strict downloaded request artifacts with authoritative Node-side recomputation, exact delegated Release 0.16/0.8 writes, and deterministic customer-safe reporting with one-to-three human-selected focus items.

The browser is an untrusted convenience layer. It cannot mint TenantContext, redefine evidence, write persistence directly, bypass current-cycle measurement/outcome guards, or authorize production action. Release 0.17 adds no new runtime dependency, canonical schema, migration/table, server/listener, cloud resource, provider network, runtime AI, customer portal, or paid reporting SaaS.

See [Release 0.17 operator workspace guide](docs/operator-workspace.md) and [ADR 0017](docs/decisions/0017-operator-workspace-service-reporting.md).

## Release 0.18 — Repeatable Managed-Service Run & Evidence Intake Pack — candidate

Release 0.18 is **CANDIDATE / NOT ACCEPTED** under Issue #65 and draft PR #67.

The candidate makes one engagement reproducible without adding a hosted workflow platform: deliberate WQT v1 minor3 adaptation, exact SiteOne/Lighthouse snapshot reconstruction, strict non-authoritative source receipts, authoritative Release 0.17 workspace recomputation, exact prior-run operational continuity, direct Release 0.16 readiness projection, optional reuse of the accepted Release 0.17 customer report, and deterministic local service-run/package files with exact SHA-256/byte-count classification.

No new canonical schema, database/table/migration, provider polling/credentials, server/listener, scheduler/worker, cloud resource, report delivery, runtime AI, paid service, or runtime dependency is part of this candidate. Issue #63 private WQT history/runtime and REPORT-AUTO delivery remain separately governed.

See [Release 0.18 managed-service run guide](docs/service-run.md), [proposed ADR 0018](docs/decisions/0018-managed-service-run-evidence-intake.md), and the [WQT adapter guide](docs/adapters/wqt.md).
