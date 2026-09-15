# Evidence-driven technical roadmap

This is a proposed progression for a bounded LDW internal managed-service evidence-engine proof, not a promise to mechanically build every numbered release. Releases 0.1–0.4 are accepted and merged. Release 0.5 is a draft candidate under independent review; Release 0.6 onward remain unimplemented and require separate bounded dispatches and release acceptance.

| Release | Bounded proof focus |
| --- | --- |
| 0.1 | Accepted architecture and authority foundation: publication-safe documentation and repository instructions. |
| 0.2 | Accepted: canonical contracts, validation, deterministic hashing, JSON Schemas, and synthetic fixtures/tests. See [contract guide](contracts.md). |
| 0.3 | Accepted: trusted tenant contexts, local SQLite, composite ownership, atomic bounded collection parts, scoped idempotency, exact schema verification, and adversarial isolation tests. See [persistence guide](persistence.md). |
| 0.4 | Accepted: authenticated bounded ingestion with opaque injected authentication, exact grants, one-part transport, typed part conflicts, and persisted-progress responses. See [ingestion guide](ingestion.md). |
| 0.5 | Draft candidate: deterministic WQT normalized-evidence adapter; consume WQT v1/minor1 bytes plus trusted configuration, split SiteOne/Lighthouse provider streams, preserve provenance/missingness, and pack accepted bounded parts without rebuilding scanners or using provider networking. See [WQT adapter guide](adapters/wqt.md). |
| 0.6 | Proposed only: ZeroRank adapter; adapt read-only Generative evidence while preserving provider identity and replaceability. |
| 0.7 | Proposed only: diff, correlation, and deterministic prioritization with traceable rationale and explicit missing-data handling. |
| 0.8 | Proposed only: recommendation, human review, and measurement lifecycle, including outcome history and separate execution authority. |
| 0.9 | Proposed only: compact LDW operator UI and report preview for the bounded proof. |
| 1.0 | Separately gated bounded cloud proof; candidate Workers, D1, and static operator assets. No deployment is authorized by this roadmap. |

## Gates and evaluation

LDW internal governance remains authoritative. Release 0.5 still requires independent review and Product ORCH1 acceptance before it can become accepted main. Releases 0.6–0.9 require their own bounded sequencing, implementation, independent review, and Product ORCH1 acceptance even though Portfolio has delegated authority for the internal $0 proof. A roadmap row is not itself implementation authority. Repository governance targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

Future functional releases require adversarial synthetic second-tenant testing for every newly implemented owned surface. Use only authorized LDW-owned evidence and clearly synthetic test material; private runtime evidence stays outside public GitHub. Customer evidence and customer deployment remain excluded.

Each step should establish whether the engine reduces recurring delivery/reconciliation labor, improves reviewable recommendation quality, and justifies its operating/support burden. Releases may be collapsed, stopped, or returned for authority review if evidence shows duplication, poor value, generic SEO-platform drift, or excessive burden. Delegated authority is permission, not a mandate.

Release 1.0 requires a separate cloud deployment gate covering current account headroom, identity/auth, exact resources, retention/deletion, measured workload/cost estimates, and rollback/decommission planning. **$0 incremental recurring cost is the target for the bounded proof and must be measured/verified before deployment.** No permanent $0 guarantee is made.

## Deferred scope

ZeroRank integration remains Release 0.6 and is not part of Release 0.5. GSC, GA4, Bing Webmaster, Google Business Profile, Decloak correlation, R2, Queues, Workflows, Durable Objects, runtime AI, BYOK, MCP, Brand2Social actions, customer portal, and external remediation remain deferred until separately justified and authorized. Accepted Release 0.4 also does not authorize a production identity provider, public listener/API, or cloud deployment; the Release 0.5 candidate does not change those boundaries. Deferred does not mean promised.

Internal automation does not establish commercial demand. Audit-first/service-first validation continues independently; this roadmap offers no public pricing, SLA, or outcome guarantees. See [authorization](authorization.md) and [architecture](architecture.md).
