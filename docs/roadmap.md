# Evidence-driven technical roadmap

This is a proposed progression for a bounded LDW internal managed-service evidence-engine proof, not a promise to mechanically build every numbered release. Releases 0.1–0.7 are accepted and merged. Release 0.8 is an authorized draft candidate under Issue #15 and is not yet accepted or merged. Later releases remain unimplemented and separately gated.

| Release | Bounded proof focus |
| --- | --- |
| 0.1 | Accepted architecture and authority foundation: publication-safe documentation and repository instructions. |
| 0.2 | Accepted: canonical contracts, validation, deterministic hashing, JSON Schemas, and synthetic fixtures/tests. See [contract guide](contracts.md). |
| 0.3 | Accepted: trusted tenant contexts, local SQLite, composite ownership, atomic bounded collection parts, scoped idempotency, exact schema verification, and adversarial isolation tests. See [persistence guide](persistence.md). |
| 0.4 | Accepted: authenticated bounded ingestion with opaque injected authentication, exact grants, one-part transport, typed part conflicts, and persisted-progress responses. See [ingestion guide](ingestion.md). |
| 0.5 | Accepted: deterministic WQT normalized-evidence adapter; consume WQT v1/minor1 bytes plus trusted configuration, split SiteOne/Lighthouse provider streams, preserve provenance/missingness, and pack accepted bounded parts without rebuilding scanners or using provider networking. See [WQT adapter guide](adapters/wqt.md). |
| 0.6 | Accepted: deterministic sanitized ZeroRank evidence adapter; consume exact v1/minor0 inner artifact bytes plus trusted configuration, reconcile workspace projections, split five endpoint-specific `zerorank` streams, preserve failed/unknown completeness semantics, and pack accepted bounded parts without provider networking or credentials. See [ZeroRank adapter guide](adapters/zerorank.md). |
| 0.7 | Accepted: deterministic same-semantic-stream longitudinal evidence diff plus non-ranked review-attention filtering. Uses tenant-scoped atomic collection snapshots, exact cohort identity, exact value/missing-state transitions, conservative completeness-aware absence semantics, application-local output, and no cross-provider correlation or prioritization. See [diff guide](analysis/diff.md). |
| 0.8 | Authorized draft candidate: evidence-linked human-authored recommendation review history plus explicit measurement/outcome ledger. Uses unchanged canonical 1.0 recommendation/measurement/outcome contracts, trusted existing `TenantContext`, immutable recommendation revisions, three bounded local SQLite ledger tables, caller-driven measurements, and human-declared outcomes. No automatic recommendation/ranking/correlation/action/UI/network/AI. See [review-ledger guide](review-ledger.md) and [ADR 0007](decisions/0007-human-review-measurement-ledger.md). |
| 0.9 | Proposed only: compact LDW operator UI and report preview for the bounded proof. |
| 1.0 | Separately gated bounded cloud proof; candidate Workers, D1, and static operator assets. No deployment is authorized by this roadmap. |

## Release 0.7 narrowing decision

The earlier shorthand “diff, correlation, prioritization” was broader than current evidence semantics justify. Accepted canonical metrics do not define universal direction, severity, materiality, business impact, or recommendation priority. Accepted Release 0.7 therefore implements only deterministic longitudinal diff and review-attention filtering. Correlation and prioritization remain deferred until a later separately authorized release has evidence and explicit policy sufficient to define them without inventing meaning.

## Release 0.8 narrowing decision

Issue #15 narrows Release 0.8 to service-history infrastructure rather than a generic recommendation engine. The draft candidate records only human/trusted-caller-authored recommendations, immutable review revisions, explicitly selected canonical measurements, and human-declared outcomes. Recommendation priority remains `unassessed`; numeric direction never automatically becomes improved/regressed; action/execution authority remains separate; and the candidate adds no UI, provider networking, scheduler, runtime AI, or cloud resource.

## Gates and evaluation

Releases 0.1–0.7 are accepted on `main`. Release 0.8 has explicit implementation authority under Issue #15 but still requires exact-head validation, independent review, and Product ORCH2 acceptance before merge. Release 0.9 remains separately gated. A roadmap row is not itself implementation authority. Repository governance targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

Future functional releases require adversarial synthetic second-tenant testing for every newly implemented owned surface. Use only authorized LDW-owned evidence and clearly synthetic test material; private runtime evidence stays outside public GitHub. Customer evidence and customer deployment remain excluded.

Each step should establish whether the engine reduces recurring delivery/reconciliation labor, improves reviewable evidence handling, and justifies its operating/support burden. Releases may be collapsed, stopped, or returned for authority review if evidence shows duplication, poor value, generic SEO-platform drift, or excessive burden. Delegated authority is permission, not a mandate.

Release 1.0 requires a separate cloud deployment gate covering current account headroom, identity/auth, exact resources, retention/deletion, measured workload/cost estimates, and rollback/decommission planning. **$0 incremental recurring cost is the target for the bounded proof and must be measured/verified before deployment.** No permanent $0 guarantee is made.

## Deferred scope

Cross-provider/generic correlation, direction/severity/materiality/business-impact policy, automated prioritization, inference generation, action/execution logic, and Release 0.9+ remain separately gated. Release 0.8's bounded human-authored recommendation records and measurement/outcome ledger do not authorize any of those deferred capabilities. GSC, GA4, Bing Webmaster, Google Business Profile, Decloak correlation, R2, Queues, Workflows, Durable Objects, runtime AI, BYOK, MCP, Brand2Social actions, customer portal, and external remediation remain deferred until separately justified and authorized. Accepted Release 0.6 does not authorize G.A.S. to poll ZeroRank, hold ZeroRank credentials, call Activepieces at runtime, add action/write authority, or deploy cloud resources. Accepted Release 0.4 also does not authorize a production identity provider, public listener/API, or cloud deployment. Deferred does not mean promised.

Internal automation does not establish commercial demand. Audit-first/service-first validation continues independently; this roadmap offers no public pricing, SLA, or outcome guarantees. See [authorization](authorization.md) and [architecture](architecture.md).
