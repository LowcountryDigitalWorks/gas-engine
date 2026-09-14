# G.A.S. Engine

**Generative / Answer / Search** — LDW-operated internal managed-service enabling infrastructure.

G.A.S. Engine is intended to help Lowcountry Digital Works normalize evidence from replaceable sensors, preserve provenance and history, correlate observations, prioritize work, support human-reviewed recommendations, and measure subsequent outcomes. The proof should establish whether this reduces recurring delivery and reconciliation labor.

**Current status: Release 0.3 local persistence candidate, based on accepted `main`.** Releases 0.1 and 0.2 are accepted and merged, so `main` carries the canonical evidence contracts. This candidate adds tenant-scoped SQLite persistence and adversarial synthetic isolation tests on top of them, and changes no accepted contract behavior. Repository governance is established and the candidate may not merge itself; independent review and release acceptance belong to the Product Orchestrator.

The intended operating lifecycle is:

> OBSERVE → NORMALIZE → CORRELATE → PRIORITIZE → RECOMMEND → APPROVE WHEN REQUIRED → ACT ONLY THROUGH SEPARATELY AUTHORIZED PATHS → RE-MEASURE → REPORT OUTCOME

The end-to-end operating lifecycle is not implemented. Release 0.2 validates records and comparison context; Release 0.3 stores validated evidence locally. There is no ingestion, provider networking, authentication, API, operator UI, external execution, or deployment.

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

`check` runs strict typechecking, build, Node's contract and persistence tests, and JSON Schema drift validation. Tests use fresh in-memory databases or temporary synthetic files under ignored `local-artifacts/`, with cleanup after connections close. A preloaded network tripwire rejects accidental network calls; Node permissions limit filesystem writes to test artifacts and deny child processes/workers. To intentionally refresh exported wire schemas after a contract change, run `npm run build` then `npm run schemas:generate` and review the artifacts.

Read the [contract guide](docs/contracts.md) for wire/application validation differences, versions, bounds, hashing, and dependency rationale. JSON Schema alone does not prove domain consistency or authorize tenant access.

Read the [persistence guide](docs/persistence.md) for trusted test contexts, composite ownership, atomic batches, idempotency, and the limits of this local proof. There is no production authentication boundary or deployed D1 database.

## Documentation

- [Architecture and system boundaries](docs/architecture.md)
- [Evidence core decision](docs/decisions/0001-evidence-core.md)
- [Evidence-driven technical roadmap](docs/roadmap.md)
- [Canonical contracts and validation](docs/contracts.md)
- [Tenant-safe local persistence](docs/persistence.md)
- [Persistence boundary decision](docs/decisions/0002-tenant-safe-persistence-boundary.md)
- [Engineering authorization boundary](docs/authorization.md)
- [Security and private reporting](SECURITY.md)
- [Agent instructions](AGENTS.md)
