# Evidence-driven technical roadmap

This is a proposed progression for a bounded LDW internal managed-service evidence-engine proof, not a promise to mechanically build every numbered release. Release 0.1 contains documentation only; none of the functional capabilities below currently exists in this repository.

| Release | Bounded proof focus |
| --- | --- |
| 0.1 | Architecture and authority foundation: publication-safe documentation and repository instructions. |
| 0.2 | Canonical contracts: distinguish evidence, inference, recommendation, action, measurement, and outcome; define provenance and missing-data representations with clearly synthetic examples/fixtures as authorized. |
| 0.3 | Tenant-safe persistence: trusted tenant context, history, and adversarial synthetic isolation validation. |
| 0.4 | Authenticated bounded ingestion: scoped, validated intake of authorized evidence treated as untrusted input. |
| 0.5 | WQT adapter: adapt existing technical/Search evidence without rebuilding its crawler. |
| 0.6 | ZeroRank adapter: adapt read-only Generative evidence while preserving provider identity and replaceability. |
| 0.7 | Diff, correlation, and deterministic prioritization with traceable rationale and explicit missing-data handling. |
| 0.8 | Recommendation, human review, and measurement lifecycle, including outcome history and separate execution authority. |
| 0.9 | Compact LDW operator UI and report preview for the bounded proof. |
| 1.0 | Separately gated bounded cloud proof; candidate Workers, D1, and static operator assets. No deployment is authorized by this roadmap. |

## Gates and evaluation

LDW internal governance remains authoritative. Release 0.1 is the current documentation-only workstream. Releases 0.2–0.9 require later bounded Product-Orchestrator sequencing, independent review, and acceptance within delegated authority; this document does not dispatch them. Before functional/runtime merges, establish the normal enforceable public-repository governance and applicable CI baseline through separately governed work.

Future functional releases require adversarial synthetic second-tenant testing for unauthorized list, read, update, correlate, approve, export, remeasure, and delete operations. Use only authorized LDW-owned evidence and clearly synthetic test material; private runtime evidence stays outside public GitHub. Customer evidence and customer deployment remain excluded.

Each step should establish whether the engine reduces recurring delivery/reconciliation labor, improves reviewable recommendation quality, and justifies its operating/support burden. Releases may be collapsed, stopped, or returned for authority review if evidence shows duplication, poor value, generic SEO-platform drift, or excessive burden. Delegated authority is permission, not a mandate.

Release 1.0 requires a separate cloud deployment gate covering current account headroom, identity/auth, exact resources, retention/deletion, measured workload/cost estimates, and rollback/decommission planning. **$0 incremental recurring cost is the target for the bounded proof and must be measured/verified before deployment.** No permanent $0 guarantee is made.

## Deferred scope

GSC, GA4, Bing Webmaster, Google Business Profile, Decloak correlation, R2, Queues, Workflows, Durable Objects, runtime AI, BYOK, MCP, Brand2Social actions, customer portal, and external remediation remain deferred until separately justified and authorized. Deferred does not mean promised.

Internal automation does not establish commercial demand. Audit-first/service-first validation continues independently; this roadmap offers no public pricing, SLA, or outcome guarantees. See [authorization](authorization.md) and [architecture](architecture.md).
