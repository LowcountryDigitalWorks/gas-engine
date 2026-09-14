# Evidence-driven technical roadmap

This is a proposed progression for a bounded LDW internal managed-service evidence-engine proof, not a promise to mechanically build every numbered release. Releases 0.1–0.3 are accepted and merged. Release 0.4 is the current authenticated bounded-ingestion candidate on accepted Release 0.3. Releases 0.5 onward remain unimplemented and require separate authorization.

| Release | Bounded proof focus |
| --- | --- |
| 0.1 | Accepted architecture and authority foundation: publication-safe documentation and repository instructions. |
| 0.2 | Accepted: canonical contracts, validation, deterministic hashing, JSON Schemas, and synthetic fixtures/tests. See [contract guide](contracts.md). |
| 0.3 | Accepted: trusted tenant contexts, local SQLite, composite ownership, atomic bounded collection parts, scoped idempotency, exact schema verification, and adversarial isolation tests. See [persistence guide](persistence.md). |
| 0.4 | Current candidate: authenticated bounded ingestion with opaque injected authentication, exact grants, one-part transport, typed part conflicts, and persisted-progress responses. See [ingestion guide](ingestion.md). |
| 0.5 | WQT adapter: adapt existing technical/Search evidence without rebuilding its crawler. |
| 0.6 | ZeroRank adapter: adapt read-only Generative evidence while preserving provider identity and replaceability. |
| 0.7 | Diff, correlation, and deterministic prioritization with traceable rationale and explicit missing-data handling. |
| 0.8 | Recommendation, human review, and measurement lifecycle, including outcome history and separate execution authority. |
| 0.9 | Compact LDW operator UI and report preview for the bounded proof. |
| 1.0 | Separately gated bounded cloud proof; candidate Workers, D1, and static operator assets. No deployment is authorized by this roadmap. |

## Gates and evaluation

LDW internal governance remains authoritative. Release 0.4 is the current bounded workstream and stays draft/unmerged until Product ORCH1 independent review and release acceptance. Releases 0.5–0.9 need later sequencing, independent review, and acceptance. Repository governance targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

Future functional releases require adversarial synthetic second-tenant testing for every newly implemented owned surface. Use only authorized LDW-owned evidence and clearly synthetic test material; private runtime evidence stays outside public GitHub. Customer evidence and customer deployment remain excluded.

Each step should establish whether the engine reduces recurring delivery/reconciliation labor, improves reviewable recommendation quality, and justifies its operating/support burden. Releases may be collapsed, stopped, or returned for authority review if evidence shows duplication, poor value, generic SEO-platform drift, or excessive burden. Delegated authority is permission, not a mandate.

Release 1.0 requires a separate cloud deployment gate covering current account headroom, identity/auth, exact resources, retention/deletion, measured workload/cost estimates, and rollback/decommission planning. **$0 incremental recurring cost is the target for the bounded proof and must be measured/verified before deployment.** No permanent $0 guarantee is made.

## Deferred scope

GSC, GA4, Bing Webmaster, Google Business Profile, Decloak correlation, R2, Queues, Workflows, Durable Objects, runtime AI, BYOK, MCP, Brand2Social actions, customer portal, and external remediation remain deferred until separately justified and authorized. Release 0.4 also does not authorize a production identity provider, provider adapter, public listener/API, or cloud deployment. Deferred does not mean promised.

Internal automation does not establish commercial demand. Audit-first/service-first validation continues independently; this roadmap offers no public pricing, SLA, or outcome guarantees. See [authorization](authorization.md) and [architecture](architecture.md).
