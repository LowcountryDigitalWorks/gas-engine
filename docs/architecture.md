# Architecture baseline

Release 0.1 defines the accepted direction for a bounded LDW internal managed-service evidence-engine proof. [Release 0.2 canonical contracts](contracts.md) implement local wire validation, cross-field checks, and deterministic identity helpers. [Release 0.3 persistence](persistence.md) is accepted on `main` and adds tenant-safe local storage for seven ingestion-foundation record groups with embedded provenance. The current [Release 0.4 candidate](ingestion.md) adds one authenticated, bounded, write-only in-process ingestion boundary. Provider adapters, operator interfaces, external execution, and deployment require subsequent bounded releases.

## Objectives and operating model

G.A.S. means **Generative / Answer / Search**. The engine should normalize replaceable sensor evidence, retain provenance/history, correlate observations, prioritize work deterministically, support human-reviewed recommendations, and measure subsequent outcomes. Its value must be demonstrated through reduced recurring LDW delivery and reconciliation labor and useful recommendations.

The intended lifecycle is:

> OBSERVE → NORMALIZE → CORRELATE → PRIORITIZE → RECOMMEND → APPROVE WHEN REQUIRED → ACT ONLY THROUGH SEPARATELY AUTHORIZED PATHS → RE-MEASURE → REPORT OUTCOME

An observation does not establish a conclusion, and approval does not erase the need for separate execution authority. Releases through 0.4 implement only contracts, local persistence, and authenticated bounded intake; correlation, prioritization, review, action, measurement, outcome automation, and operator workflow remain future work.

## Ownership and source-of-truth boundaries

| System | Intended ownership | Boundary |
| --- | --- | --- |
| G.A.S. Engine | Normalized evidence model; provenance/history; provider-health concepts; cross-sensor correlation; deterministic prioritization; recommendation lifecycle; human review/decision state; measurement; outcome history; compact future LDW operator experience | Own the LDW evidence and decision record while preserving links to source observations; no universal proprietary G.A.S. score. |
| Website Quality Toolkit (WQT) | Existing LDW site-side technical/Search evidence generation | Adapt its evidence; do not rebuild WQT or its crawler. |
| ZeroRank | Replaceable Generative observation/sensing | Its observations and scores remain provider evidence, not authoritative LDW truth. A later adapter must permit provider replacement. |
| SuiteDash | Customer/company/client-workflow and service-enrollment experience | Do not duplicate CRM or client operations in G.A.S. |
| Activepieces | Deterministic cross-system workflow/event transport where useful | Must not become the only durable G.A.S. evidence or system-of-record layer. |
| GitHub | Source, technical work, PR/review/release evidence, and separately governed automation paths | No parallel autonomous GitHub-writing mechanism. Private runtime evidence stays outside public GitHub. |

G.A.S. is the intended durable record of its own normalization, derivation, and review decisions. It does not rewrite provider history, become the client-workflow authority, or treat a vendor score as an LDW conclusion. Sources may disagree; retain the disagreement and its provenance rather than overwrite it with an unsupported consensus.

## Evidence concepts

| Concept | Meaning and separation |
| --- | --- |
| Source/raw evidence | The source material received or referenced, subject to its access and retention constraints. Preserve identity and integrity references. |
| Normalized observation | A source observation expressed consistently with scope, time, provenance, completeness, and an explicit value or missing-data state. Normalization does not make it a verified conclusion. |
| Derived inference | An interpretation or correlation derived from identified observations and a recorded method/version. Distinguish uncertainty and conflicting evidence. |
| Recommendation | A proposed response with supporting evidence, rationale, priority, and review lifecycle. It carries no execution authority. |
| Action | A separately authorized execution attempt and its record, including what actually happened. Acceptance of a recommendation is not an action. |
| Measurement | A subsequent observation under a defined scope and period, retained for comparison. Preserve comparability limits. |
| Outcome | The assessed result over time, linked to measurements, decisions, and any action. Temporal association alone does not establish causation. |

These concepts must never be collapsed for convenience. Retain links between them so later operators can trace a recommendation or outcome back to its supporting evidence and method.

### Missing-data semantics

Every normalized observation must distinguish at least:

| State | Meaning |
| --- | --- |
| `observed(value)` | A value was observed. Numeric zero is a real observed value. |
| `unknown(reason)` | The value cannot be determined from available evidence. |
| `unavailable(reason)` | The relevant evidence cannot currently be accessed, for example because a provider is unavailable. |
| `not_collected(reason)` | Collection was not performed for this observation. |
| `not_applicable(reason)` | The observation does not apply to the specified scope. |

Missing or unavailable data must **never silently become zero**. Preserve the reason and state through normalization, comparison, prioritization, display, and reporting. Do not present an apparent improvement merely because a source stopped reporting. Release 0.2 defines explicit value unions; lifecycle transition engines remain future work.

### Provenance and history

Evidence should ultimately retain enough provenance to identify:

- provider/source and source identity;
- adapter/version and source schema/version;
- site/scope and observation period;
- collected time and received time;
- completeness;
- integrity/hash reference;
- normalization/transformation version;
- retention/availability state.

Preserve historical interpretation and transformation context so a provider or normalization change is distinguishable from a site change. Retention constraints may prevent keeping raw payloads indefinitely; preserve permitted references and an explicit availability state rather than imply the evidence is still retrievable. Release 0.2 establishes the canonical fields currently used by persistence/ingestion; retention policy and provider adapters remain future work.

## Providers and adapters

Separate provider-specific reading and transformation from the LDW evidence core. Initially adapt WQT and read-only ZeroRank evidence; preserve provider-specific provenance and avoid coupling core decisions to a single vendor's score or payload structure. Provider-health concepts should distinguish collection failure, incomplete coverage, freshness, and schema/adapter compatibility from actual site observations.

Sensor/read adapters and write/action adapters are separate architectural responsibilities. A sensor's read credential or capability never implies write authority. Recommendation acceptance does not automatically authorize a production change. Future external actions must use separately approved execution/governance mechanisms. Release 0.4 implements no provider adapter or action adapter.

## Tenant security invariant

**Tenant identity is an authorization boundary. A globally unique object ID is never by itself authorization. Untrusted request data never creates authority.**

Release 0.3 persistence requires a trusted opaque `TenantContext` and structurally scopes every implemented owned operation. Persistence can validate but cannot mint authority. Release 0.4 intentionally makes `src/authentication/principal.ts` the sole additional production caller of the package-internal tenant issuer. An injected authenticator verifies an opaque credential outside the evidence body and may return a registered immutable principal with exact tenant/site/site-scope/provider/provider-connection grants. Plain/cloned/cast/proxied principal-shaped data and evidence tenant IDs do not exist in the private authority registry and therefore cannot authorize anything.

The request body is validated as one bounded collection part before exact-grant authorization and persistence. Authorization never uses raw request strings. After a successful persist, the application queries derived repository progress; response `complete` reflects stored parts/sources, not a canonical completeness assertion alone. Each part is atomic; multipart collection assembly is not one transaction. Observations remain restricted to sources in the same part.

The bounded proof uses LDW-owned and synthetic evidence only. There is no production identity provider, password/JWT/OAuth/session/API-key store, provider networking, customer deployment, or network listener. See the [security posture](../SECURITY.md) and [ingestion guide](ingestion.md).

## Initial vertical slice and future operator workflow

- Tenant: **Lowcountry Digital Works**.
- LDW-controlled public site: [https://lowcountrydigitalworks.com](https://lowcountrydigitalworks.com).
- Sources: WQT and read-only ZeroRank evidence.
- Second tenant: clearly synthetic, solely for testing/fixtures in authorized releases.

The proof loop is:

> INGEST → NORMALIZE → STORE → DIFF → PRIORITIZE → RECOMMEND → HUMAN REVIEW → DISPLAY

Release 0.4 proves only the authenticated INGEST boundary into already-validated normalized/store structures. Provider adapters and the downstream DIFF/PRIORITIZE/RECOMMEND/REVIEW/DISPLAY stages remain unimplemented.

A compact future LDW operator experience should let an operator inspect source health, provenance, missing data, historical differences, and deterministic priority rationale; review a recommendation and record a decision; then compare subsequent measurements and report outcomes. Accepted recommendations still require separate authority for external execution.

## Build, adapt, reuse, and defer

| Direction | Scope |
| --- | --- |
| Build | LDW-specific evidence/provenance model, tenant-safe application boundaries, correlation, deterministic prioritization, recommendation lifecycle, measurement/outcome lifecycle. |
| Adapt | WQT evidence and ZeroRank evidence through replaceable adapters. |
| Reuse where useful | Existing WQT sensors, Cloudflare, SuiteDash, Activepieces, GitHub, and maintained lightweight OSS libraries following dependency and licensing review. |
| Defer until separately justified/authorized | Production identity provider, GSC, GA4, Bing Webmaster, Google Business Profile, Decloak correlation, R2, Queues, Workflows, Durable Objects, runtime AI, BYOK, MCP, Brand2Social actions, customer portal, and external remediation. |
| Do not build | Another generic crawler, browser/scraper farm, generic SEO suite, ZeroRank clone, CRM, workflow engine, or universal proprietary G.A.S. score. Do not fork a generic SEO platform. |

## Candidate cloud direction, portability, and cost

Cloudflare **Workers, D1, and static operator assets** remain the candidate architecture for a later bounded cloud proof. Releases through 0.4 create no cloud resource, deployment configuration, public runtime, cloud database, or provider account. R2, Queues, Workflows, and Durable Objects remain deferred until measured need.

Keep evidence concepts and provider boundaries portable. Release 0.3 defines a minimal repository interface with a local SQLite adapter; Release 0.4 consumes that interface rather than coupling application code to SQLite. A later cloud adapter must preserve tenant/evidence, bounded-part, idempotency, and progress semantics.

**$0 incremental recurring cost is the target for the bounded proof and must be measured/verified before deployment.** It is not a permanent cost guarantee or SLA. Release 1.0 cloud deployment remains separately gated, with current account headroom, exact resources, identity/auth design, retention/deletion, representative CPU/request/query/storage estimates, and rollback/decommission planning assessed before approval. Paid infrastructure, overages, and billing changes require separate authority.

## Commercial and publication limits

Internal automation does not prove commercial demand. The audit-first/service-first business model continues independently. This is internal managed-service enabling infrastructure, not customer SaaS or a standalone commercial software product. No public price, SLA, ranking/citation/traffic/lead guarantee, or internal pricing hypothesis belongs in this repository.

Publish only safe architecture and clearly synthetic fixtures. No customer evidence, private vendor payloads, confidential business records, credentials, or secrets belong in public GitHub. There is no software license grant. See [authorization](authorization.md), the [evidence-core ADR](decisions/0001-evidence-core.md), the [ingestion ADR](decisions/0003-authenticated-ingestion-boundary.md), and the [roadmap](roadmap.md).
