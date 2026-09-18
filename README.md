# G.A.S. Engine

**Generative / Answer / Search** — LDW-operated internal managed-service enabling infrastructure.

G.A.S. Engine is intended to help Lowcountry Digital Works normalize evidence from replaceable sensors, preserve provenance and history, compare longitudinal observations, support explicitly human-reviewed recommendations, and measure subsequent outcomes. The proof should establish whether this reduces recurring delivery and reconciliation labor.

**Current accepted baseline: Releases 0.1–0.8 are accepted and merged on `main`.** Release 0.4 adds a bounded authenticated application/transport seam without changing accepted evidence contracts or the Release 0.3 SQLite schema. Release 0.5 adds a pure/local adapter for already-normalized WQT v1/minor1 evidence. Release 0.6 adds a second pure/local adapter for the exact sanitized ZeroRank `ldw.zerorank-evidence.v1` minor-0 artifact; neither adapter executes sensors, holds provider credentials, issues tenant authority, or deploys anything. Release 0.7 adds deterministic same-stream longitudinal evidence diff plus non-ranked review-attention classification over coherent tenant-scoped persisted snapshots.

**Release 0.8 is accepted and merged on `main` through PR #16.** It adds provider-neutral, evidence-linked human review history plus an explicit measurement/outcome ledger. Recommendations are human/trusted-caller authored only, priority remains `unassessed`, measurements resolve selected canonical observations, outcome direction is human-declared, and accepted recommendations create no action authority. Canonical recommendation/measurement/outcome contracts remain schemaVersion `1.0`; Release 0.8 adds no dependency and keeps the $0 incremental recurring-cost proof boundary. See the [Release 0.8 review-ledger guide](docs/review-ledger.md) and [ADR 0007](docs/decisions/0007-human-review-measurement-ledger.md).

**Release 0.9 is an authorized draft candidate under Issue #18 and is not accepted or merged.** It adds a compact read-only local operator case view and printable standalone HTML report preview over accepted Release 0.7/0.8 read surfaces. The candidate adds no persistence/schema, write controls, server/listener, provider networking, runtime AI, action/remediation, framework, customer evidence, or cloud deployment. See the [Release 0.9 operator case-view guide](docs/operator-case-view.md) and [proposed ADR 0008](docs/decisions/0008-operator-case-view.md).

The intended long-term operating lifecycle is:

> OBSERVE → NORMALIZE → COMPARE → CORRELATE ONLY WHEN SEMANTICS SUPPORT IT → PRIORITIZE ONLY WITH AN EXPLICIT POLICY → RECOMMEND → APPROVE WHEN REQUIRED → ACT ONLY THROUGH SEPARATELY AUTHORIZED PATHS → RE-MEASURE → REPORT OUTCOME

The end-to-end operating lifecycle is not implemented. Release 0.2 validates records and comparison context, Release 0.3 stores validated evidence locally, Release 0.4 proves one write-only in-process authenticated ingestion route for bounded persistence parts, Release 0.5 deterministically maps an existing WQT normalized artifact into separate SiteOne/Lighthouse `CollectionBatch` streams, Release 0.6 deterministically maps an already-sanitized ZeroRank artifact into five endpoint-specific `zerorank` collection streams, and Release 0.7 deterministically compares compatible longitudinal collection snapshots while separating unchanged evidence from changed or coverage-uncertain evidence. Accepted Release 0.8 records human-authored recommendation revision history plus explicit measurements and human-declared outcomes. The Release 0.9 draft candidate adds only a standalone read-only local operator case/report preview over that accepted history. There is still no cross-provider correlation engine, automated prioritization policy, provider networking, production identity provider, network listener, customer portal, external execution, scheduler, runtime AI, or deployment.

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

`check` runs strict typechecking, build, Node's contract, persistence, ingestion, adapter, analysis, review-ledger, and operator-view tests plus JSON Schema drift validation and the synthetic local operator preview generator. Tests use fresh in-memory databases or temporary synthetic files under ignored `local-artifacts/`, with cleanup after connections close. A preloaded network tripwire rejects accidental network calls; Node permissions limit filesystem writes to test artifacts and deny child processes/workers. To intentionally refresh exported wire schemas after a contract change, run `npm run build` then `npm run schemas:generate` and review the artifacts.

Read the [contract guide](docs/contracts.md) for wire/application validation differences, versions, bounds, hashing, and dependency rationale. JSON Schema alone does not prove domain consistency or authorize tenant access.

Read the [persistence guide](docs/persistence.md) for trusted contexts, composite ownership, bounded collection parts, idempotency, exact schema verification, and the limits of the local SQLite proof. Persistence itself still cannot mint tenant authority.

Read the [ingestion guide](docs/ingestion.md) for the sole authenticated principal issuer seam, exact grants, one-part transport envelope, 49,152-byte HTTP proof bound, progress semantics, typed part conflicts, and response mapping. Accepted Release 0.4 is not a production identity system or deployed API.

Read the [WQT adapter guide](docs/adapters/wqt.md) for accepted Release 0.5's exact supported WQT contract, trusted-config boundary, provider/source/observation mapping, timezone policy, deterministic identity/integrity, and byte-aware multipart packing. The adapter consumes normalized bytes only and has no WQT runtime/network dependency.

Read the [ZeroRank adapter guide](docs/adapters/zerorank.md) for accepted Release 0.6's exact sanitized v1/minor0 artifact contract, trusted-config boundary, workspace reconciliation, endpoint-specific completeness/failure mapping, runtime-type-aware observation mapping, deterministic identity/provenance, and bounded multipart packing. The adapter consumes sanitized bytes only and has no ZeroRank/Activepieces runtime or network dependency.

Read the [longitudinal diff guide](docs/analysis/diff.md) for accepted Release 0.7: exact same-stream collection compatibility, cohort-hash matching, non-evaluative delta states, coverage/absence semantics, deterministic ordering, the 2,048-observation snapshot bound, tenant-safe atomic read service, and synthetic WQT/ZeroRank-style value proof. Release 0.7 itself does not implement correlation, prioritization, inference, recommendation, action, or Release 0.8.

Read the [Release 0.8 review-ledger guide](docs/review-ledger.md) for the accepted boundary: human-authored `internal_review` / `unassessed` recommendations, immutable lifecycle revisions, canonical observation resolution, bounded measurement/outcome history, accepted local migration 2, human-declared outcome direction, and explicit no-action/no-network/no-AI boundaries.

Read the [Release 0.9 operator case-view guide](docs/operator-case-view.md) for the authorized draft candidate: explicit trusted scope + collection/recommendation selection, accepted bounded read surfaces only, preserved mechanical/human semantics, static HTML escaping/CSP, print styling, and synthetic local preview generation without a listener or write path.

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
- [Engineering authorization boundary](docs/authorization.md)
- [Security and private reporting](SECURITY.md)
- [Agent instructions](AGENTS.md)
