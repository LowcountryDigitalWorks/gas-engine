# G.A.S. Engine

**Generative / Answer / Search** — LDW-operated internal managed-service enabling infrastructure.

G.A.S. Engine is intended to help Lowcountry Digital Works normalize evidence from replaceable sensors, preserve provenance and history, correlate observations, prioritize work, support human-reviewed recommendations, and measure subsequent outcomes. The proof should establish whether this reduces recurring delivery and reconciliation labor.

**Current status: Releases 0.1–0.6 are accepted and merged on `main`.** Release 0.4 adds a bounded authenticated application/transport seam without changing accepted evidence contracts or the Release 0.3 SQLite schema. Release 0.5 adds a pure/local adapter for already-normalized WQT v1/minor1 evidence. Release 0.6 adds a second pure/local adapter for the exact sanitized ZeroRank `ldw.zerorank-evidence.v1` minor-0 artifact; neither adapter executes sensors, holds provider credentials, issues tenant authority, or deploys anything. Release 0.7 remains separately gated.

The intended operating lifecycle is:

> OBSERVE → NORMALIZE → CORRELATE → PRIORITIZE → RECOMMEND → APPROVE WHEN REQUIRED → ACT ONLY THROUGH SEPARATELY AUTHORIZED PATHS → RE-MEASURE → REPORT OUTCOME

The end-to-end operating lifecycle is not implemented. Release 0.2 validates records and comparison context, Release 0.3 stores validated evidence locally, Release 0.4 proves one write-only in-process authenticated ingestion route for bounded persistence parts, Release 0.5 deterministically maps an existing WQT normalized artifact into separate SiteOne/Lighthouse `CollectionBatch` streams, and Release 0.6 deterministically maps an already-sanitized ZeroRank artifact into five endpoint-specific `zerorank` collection streams. There is no provider networking, production identity provider, network listener, operator UI, external execution, or deployment.

## Initial proof and principles

The future proof targets LDW's own public site, [lowcountrydigitalworks.com](https://lowcountrydigitalworks.com), using Website Quality Toolkit (WQT) and read-only ZeroRank evidence. A clearly synthetic second tenant is reserved for isolation testing.

- Build the LDW-specific evidence, provenance, recommendation, measurement, and outcome core; adapt replaceable sensors.
- Preserve source evidence separately from normalized observations, derived inferences, recommendations, actions, measurements, and outcomes.
- Treat tenant identity as an authorization boundary; a globally unique ID is not authorization.
- Preserve observed zero as a value and missing-data states as distinct states.
- Keep sensing, human review, and separately authorized execution distinct.

## Boundaries

This is not customer SaaS, self-service software, a standalone commercial software product, or a general SEO platform. Do not rebuild WQT, a crawler, ZeroRank, a CRM, or a workflow engine. No universal proprietary G.A.S. score is proposed.

This repository is **public**. Publication-safe architecture, contract code, and clearly synthetic fixtures belong here. Never commit customer evidence, customer names as test data, private vendor payloads, confidential business records, credentials, or secrets. Private runtime evidence must remain outside public GitHub.

**No software license grant.** Public visibility does not itself grant an open-source license.

Internal automation does not prove commercial demand. LDW's audit-first/service-first business model continues independently. This repository makes no public pricing, SLA, ranking, citation, traffic, or lead guarantees.

## Local validation

Use Node.js 24.19.0 and npm 11.17.0 (Node 24 only). Dependency installation needs the package registry or an existing cache; the checks use only local/synthetic inputs.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
```

`check` runs strict typechecking, build, Node's contract, persistence, ingestion, and adapter tests, and JSON Schema drift validation. Tests use fresh in-memory databases or temporary synthetic files under ignored `local-artifacts/`, with cleanup after connections close. A preloaded network tripwire rejects accidental network calls; Node permissions limit filesystem writes to test artifacts and deny child processes/workers. To intentionally refresh exported wire schemas after a contract change, run `npm run build` then `npm run schemas:generate` and review the artifacts.

Read the [contract guide](docs/contracts.md) for wire/application validation differences, versions, bounds, hashing, and dependency rationale. JSON Schema alone does not prove domain consistency or authorize tenant access.

Read the [persistence guide](docs/persistence.md) for trusted contexts, composite ownership, bounded collection parts, idempotency, exact schema verification, and the limits of the local SQLite proof. Persistence itself still cannot mint tenant authority.

Read the [ingestion guide](docs/ingestion.md) for the sole authenticated principal issuer seam, exact grants, one-part transport envelope, 49,152-byte HTTP proof bound, progress semantics, typed part conflicts, and response mapping. Accepted Release 0.4 is not a production identity system or deployed API.

Read the [WQT adapter guide](docs/adapters/wqt.md) for accepted Release 0.5's exact supported WQT contract, trusted-config boundary, provider/source/observation mapping, timezone policy, deterministic identity/integrity, and byte-aware multipart packing. The adapter consumes normalized bytes only and has no WQT runtime/network dependency.

Read the [ZeroRank adapter guide](docs/adapters/zerorank.md) for accepted Release 0.6's exact sanitized v1/minor0 artifact contract, trusted-config boundary, workspace reconciliation, endpoint-specific completeness/failure mapping, runtime-type-aware observation mapping, deterministic identity/provenance, and bounded multipart packing. The adapter consumes sanitized bytes only and has no ZeroRank/Activepieces runtime or network dependency.

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
- [Engineering authorization boundary](docs/authorization.md)
- [Security and private reporting](SECURITY.md)
- [Agent instructions](AGENTS.md)
