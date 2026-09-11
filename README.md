# G.A.S. Engine

**Generative / Answer / Search** — LDW-operated internal managed-service enabling infrastructure.

G.A.S. Engine is intended to help Lowcountry Digital Works normalize evidence from replaceable sensors, preserve provenance and history, correlate observations, prioritize work, support human-reviewed recommendations, and measure subsequent outcomes. The proof should establish whether this reduces recurring delivery and reconciliation labor.

**Current status: Release 0.2 canonical contracts, pending release acceptance.** The accepted Release 0.1 architecture now has a local TypeScript contract library, Zod wire validators, deterministic helpers, JSON Schemas, and synthetic tests. There is no ingestion service, database, provider networking, operator application, or deployment. Release acceptance belongs to the Product Orchestrator.

The intended operating lifecycle is:

> OBSERVE → NORMALIZE → CORRELATE → PRIORITIZE → RECOMMEND → APPROVE WHEN REQUIRED → ACT ONLY THROUGH SEPARATELY AUTHORIZED PATHS → RE-MEASURE → REPORT OUTCOME

The end-to-end operating lifecycle is not implemented. Release 0.2 validates records and comparison context; it does not collect evidence, derive recommendations, execute actions, or assess outcomes.

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

`check` runs strict typechecking, build, Node's contract tests, and JSON Schema drift validation. To intentionally refresh exported wire schemas after a contract change, run `npm run build` then `npm run schemas:generate` and review the artifacts. No formatter dependency is required.

Read the [contract guide](docs/contracts.md) for wire/application validation differences, versions, bounds, hashing, and dependency rationale. JSON Schema alone does not prove domain consistency or authorize tenant access.

## Documentation

- [Architecture and system boundaries](docs/architecture.md)
- [Evidence core decision](docs/decisions/0001-evidence-core.md)
- [Evidence-driven technical roadmap](docs/roadmap.md)
- [Canonical contracts and validation](docs/contracts.md)
- [Engineering authorization boundary](docs/authorization.md)
- [Security and private reporting](SECURITY.md)
- [Agent instructions](AGENTS.md)
