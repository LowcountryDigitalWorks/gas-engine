# Engineering authorization boundary

The current program authorization is a **bounded LDW internal managed-service evidence-engine proof**. G.A.S. means Generative / Answer / Search. Its purpose is to support LDW delivery and evidence reconciliation; it is not authorized as standalone commercial software, customer SaaS, or self-service software.

LDW internal governance is authoritative. This public document summarizes engineering boundaries without reproducing confidential governance records. A roadmap, architectural decision, recommendation, or public repository does not independently expand authority.

## Current workstream

Releases 0.1–0.15 are accepted and merged to `main`. Repository governance is established: a repository ruleset targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

Release 0.8 is **accepted and merged through PR #16** after exact-head validation, Product ORCH2 review, and independent review. The accepted Release 0.8 scope is evidence-linked human-authored recommendation review history plus an explicit measurement/outcome ledger. It does not authorize automatic recommendation/inference generation, ranking/priority calculation, generic cross-provider correlation, actions/remediation, provider/network access, scheduler/background workers, runtime AI/BYOK, cloud resources, or customer evidence.

Release 0.9 is **accepted and merged through PR #19** after Product ORCH2 exact-head review and independent review. The accepted scope is a compact read-only local operator case view + printable static HTML preview over accepted Release 0.7/0.8 reads. It does not authorize persistence/schema changes, write controls, production auth, provider/network runtime, HTTP server/listener, customer portal/evidence, automatic recommendation/inference/ranking/correlation, action/remediation, scheduler/background work, runtime AI/BYOK, cloud deployment, paid services, or Release 1.0.

Release 0.10 is **accepted and merged through PR #35** after Product exact-head review, one bounded metric-integrity correction, and independent exact-head re-review. The accepted scope is a pure/local sanitized `ldw.search-analytics-evidence.v1` minor-0 / `google-search-console` / `web` adapter plus deterministic explicit-policy search signal analysis over compatible windows. It preserves trusted caller authority, observed zero, conservative missingness/coverage, a verified 384-row / 1,536-observation bound, cross-field source metric integrity, and application-local signals. It does not authorize provider OAuth/networking, credentials, scheduling/background work, canonical schema/persistence expansion, automated priority/severity/causal judgment, split/consolidate action, runtime AI/BYOK, cloud deployment, paid services, customer/private evidence, Release 0.11, or Release 1.0.

Release 0.11 is **accepted and merged through PR #38** after Product exact-head review, one bounded deterministic follow-up-identity correction, and independent exact-head re-review. The accepted scope is a pure/local application composition between one strict human/trusted-caller change annotation, one exact accepted Release 0.10 search row/metric, zero or one exact-compatible follow-up window, and existing Release 0.8 measurement service inputs. It preserves observed zero, conservative missingness/coverage, explicit readiness, selector-only recommendation association, application-local query/page sidecar semantics, and deterministic follow-up identity bound to the exact canonical `baselineMeasurementId`. It does not authorize provider networking/OAuth/credentials, scheduling/background work, new schema/persistence, automatic outcome direction, causal inference, action authority, runtime AI/BYOK, cloud deployment, paid services, customer/private evidence, Release 0.12, or Release 1.0.

Release 0.12 is **accepted and merged through PR #41** after Product exact-head review and independent exact-head review. The accepted scope is a pure/local one-page page-focus evidence analysis over accepted Release 0.10 search evidence using strict caller-supplied query-cluster assignments and explicit threshold policy. It preserves complete selected-page row coverage, exact provenance, observed-zero semantics, final/complete/nontruncated/nonanonymized readiness gating, deterministic report identity, neutral measured-support terminology, and mandatory separate SERP/result validation before any intent or content-architecture conclusion. It does not authorize semantic intent inference, split/consolidate/redirect/canonical/content-generation recommendation, provider networking/OAuth/credentials, scheduling/background work, new schema/persistence, action authority, runtime AI/BYOK, cloud deployment, paid services, customer/private evidence, Release 0.13, or Release 1.0.

Release 0.13 is **accepted and merged through PR #45** after Product whole-pack exact-head review, the bounded IndexNow semantic-integrity correction, final independent exact-head review, protected-main squash merge, and post-merge Contracts verification. The accepted release implements only the full pure/local Discovery Diagnostics Pack: exact sanitized Google/Bing/Yandex/IndexNow artifacts, trusted adapter configuration, provider-preserving common URL semantics, existing canonical collection/source/observation adaptation, adapted-window consistency validation, exact-URL cross-engine readiness and bounded finding kinds, descriptive IndexNow later-observation context, optional accepted Release 0.10 Search Analytics context, deterministic site rollup, and escaped static read-only operator report/preview. The accepted authority remains limited to the deterministic cross-engine comparison rules; it does not authorize generic correlation, provider retrieval/networking, credentials/OAuth, implicit URL normalization, universal scoring, automatic recommendation/remediation, new persistence/schema, runtime AI, cloud deployment, paid services, customer/private evidence, Release 0.14, or Release 1.0.

Accepted Release 0.4 proves **authenticated bounded ingestion only**: an injected opaque-credential authenticator, trusted immutable principal issuance with exact grants, one application ingestion service, one in-process Web `POST /v1/evidence/collections` handler, typed idempotency/part-sequence conflicts, and synthetic adversarial tests. It preserves accepted Release 0.3 tenant authority and persistence behavior and queries persisted collection progress before reporting completion.

Accepted Release 0.5 proves the **WQT normalized-evidence adapter boundary** defined by Issue #6. It consumes already-normalized WQT v1/minor1 bytes plus explicit trusted caller configuration and deterministically emits separate SiteOne/Lighthouse `CollectionBatch` streams. It does not execute SiteOne/Lighthouse, dispatch/download WQT Actions, fetch URLs, use provider credentials, import WQT source/package at runtime, modify WQT opportunistically, issue tenant authority, deploy, add recommendation/priority logic, or begin Release 0.6. See [WQT adapter guide](adapters/wqt.md) and [ADR 0004](decisions/0004-wqt-normalized-evidence-adapter.md).

Accepted Release 0.6 proves the **ZeroRank sanitized-evidence adapter boundary** defined by Issue #9. It consumes only the exact inner sanitized `ldw.zerorank-evidence.v1` minor-0 artifact plus explicit trusted caller configuration, reconciles duplicated workspace projections before trusted workspace matching, and deterministically emits five endpoint-specific `zerorank` `CollectionBatch` streams. It does not poll ZeroRank, call Activepieces at runtime, receive or persist a ZeroRank credential, issue tenant authority, persist by itself, deploy, correlate, prioritize, recommend, or act. See [ZeroRank adapter guide](adapters/zerorank.md) and [ADR 0005](decisions/0005-zerorank-sanitized-evidence-adapter.md).

Accepted Release 0.7 proves the **deterministic longitudinal evidence diff boundary** defined by Issue #12. Baseline/current collections must first prove exact stream compatibility for scope, provider, provider-connection presence/value, adapter, source schema, and full collection method before completeness may interpret unmatched cohorts. The accepted service resolves each persisted side through one tenant-scoped atomic `getCollectionSnapshot(...)` read containing canonical collection, persisted `CollectionProgress`, and bounded observations. The pure comparator remains application-local and repository-independent.

Release 0.7 itself explicitly excludes cross-provider/generic correlation, universal scoring, direction/severity/materiality/business-impact policy, recommendation priority, inference, recommendations, causal conclusions, remediation, actions, human-review lifecycle, UI, provider/network access, runtime AI/BYOK, new persistence schema/tables, persistence of diff output, or Release 0.8. See the [accepted diff guide](analysis/diff.md) and [ADR 0006](decisions/0006-longitudinal-evidence-diff.md).

Accepted Release 0.8 reuses unchanged canonical `recommendation`, `measurement`, and `outcome` schemaVersion `1.0` contracts. Recommendation creation is human/trusted-caller authored only, with `authorityClass = internal_review`, `priority.level = unassessed`, observation evidence only, revision 1, and `proposed` lifecycle. Caller-driven lifecycle/content changes append immutable revisions with expected-current-revision checks; `rejected` and `superseded` are terminal and accepted may only become superseded. Acceptance grants no action authority.

Release 0.8 measurements are caller-invoked records built from explicitly selected canonical observations. Caller-supplied measured values must equal canonical persisted observation values. Baseline/follow-up comparability preserves existing cohort/methodology/chronology rules. `dueWindow`, `not_due`, and `not_measured` are data only and authorize no scheduling, polling, or provider read.

Release 0.8 outcomes are explicit human/trusted-caller declarations. G.A.S. must not infer `improved`, `regressed`, or `unchanged` from numeric direction. Directional outcomes require resolved comparable measurements. The Release 0.8 application seam permits only attribution `none` or `technical_verification`; `association` and `controlled_evidence` remain gated. Outcome creation grants no action authority. See [review-ledger guide](review-ledger.md) and [ADR 0007](decisions/0007-human-review-measurement-ledger.md).

Accepted Releases through 0.13 do **not** authorize a production identity provider, password/JWT/OAuth/session/API-key database, credential persistence, live provider/network access from G.A.S., HTTP listener, customer evidence, external execution, customer portal, or cloud deployment. Release 0.9 authorizes only its local static read-only operator preview. Repository-local CI remains least privilege, included capacity, no secrets, and no deployment permissions. This boundary does not authorize account, security-setting, or ruleset changes.

## Evergreen internal R&D authority

Owner-directed [GAS-ROADMAP-002 / Issue #31](https://github.com/LowcountryDigitalWorks/gas-engine/issues/31) authorizes competitor research, roadmap definition, and **separately bounded internal G.A.S. R&D releases** when they create real LDW operating value. This internal R&D authority is intentionally independent of near-term managed-service buyer validation under business-operations #280.

Issue #31 does **not** itself authorize a software release merely because it appears on the roadmap. Each implementation still requires current-main reconciliation, an exact Product-Orchestrator-frozen release contract, the smallest useful proof, branch/PR, deterministic validation, security/privacy review, independent review, and Product Orchestrator acceptance.

This evergreen internal R&D authority does not authorize customer SaaS, custom production auth, customer portals, generic crawlers/rank crawlers/backlink crawlers, cloud deployment, paid data warehouses, new provider credentials, customer/private evidence, runtime AI/BYOK, autonomous remediation/content publishing, or production mutation. Managed-service packaging, claims, pricing, and demand remain under business-operations #280. Release 1.0 remains the separate cloud gate.

## Fixed proof limits

- Internal managed-service tooling only; no customer SaaS, customer portal, customer deployment, real customer evidence, or client-site ingestion.
- Evidence use is limited to authorized LDW-owned evidence and clearly synthetic testing/fixtures. Release 0.5 tests use synthetic `example-site` / `https://example.test` WQT-style evidence; Release 0.6 tests use explicitly synthetic ZeroRank-style evidence; accepted Releases 0.7–0.8 tests use only canonical synthetic evidence and synthetic second-tenant isolation.
- No paid infrastructure, paid dependency, purchase, overage, billing enablement, or new subscription without separate authority.
- No runtime AI/BYOK, autonomous external remediation, autonomous production mutation, or parallel autonomous GitHub-writing mechanism.
- Sensor/read capability never grants action/write authority. Human acceptance of a recommendation does not automatically authorize a production change; future external actions require separately approved execution paths.
- No account/security, DNS, domain, email, or production changes in this workstream.
- No public price, SLA, ranking guarantee, citation guarantee, traffic guarantee, lead guarantee, causal-performance guarantee, time-savings claim, or internal pricing hypothesis belongs in this repository. Internal automation does not prove commercial demand; the audit-first/service-first model continues independently.
- **No software license grant.** Do not add `LICENSE`, `COPYING`, another project license grant, or project licensing metadata. Dependencies retain their own licenses and ordinary lockfile metadata. Public visibility itself does not create an OSS license.

## Authority and input boundary

Untrusted request or evidence data never creates authority. Accepted Release 0.3 keeps tenant-context issuance package-internal and persistence exposes only validation. Accepted Release 0.4 intentionally makes `src/authentication/principal.ts` the sole additional production caller of the tenant-context issuer after trusted credential verification. Transport, application service, provider adapters, analysis/review code, evidence fields, IDs, URLs, hashes, scores, and headers other than the authenticated credential may not issue contexts or grants.

Exact ingestion grants bind tenant, site, site-scope revision, provider, and provider connection. The authenticated request body contains one bounded persistence part: `collection`, `part`, `parts`, `sources`, and `observations`; the whole-collection idempotency key remains a header. Canonical `receivedCount` keeps its whole-collection meaning. Each part is atomic, multipart ingestion is not one transaction, and observations remain same-part-source only. `complete` is derived from stored progress after persistence.

Release 0.5 adds a separate trusted adapter-configuration boundary, not authentication. Trusted configuration supplies G.A.S. scope, expected WQT site/target, provider-connection IDs, canonical timestamps, and source availability. WQT artifact `siteId`, target, provider/tool values, source keys, and hashes are validated evidence and cannot replace that trusted configuration. The adapter neither imports nor calls the tenant-authority issuer.

Release 0.6 uses the same authority principle for sanitized ZeroRank evidence. Trusted configuration supplies G.A.S. scope, expected workspace ID, expected canonical target origin, provider connection, canonical `observedAt`/lifecycle timing, and source availability. Root and successful endpoint workspace projections must reconcile before the workspace is matched to trusted configuration, but neither projection creates authority. Sanitized artifact workspace/target fields, provider/source IDs, hashes, optional upstream run/start/end values, opaque nested source material, and mapped observations cannot replace trusted configuration, mint a principal/grant, or issue `TenantContext`.

Release 0.7 keeps that authority boundary unchanged. `diffEvidenceCollections` receives an already-issued `TenantContext` plus two collection IDs. Those IDs select records only; they do not identify or create a tenant, site, provider, grant, principal, or context. `getCollectionSnapshot(...)` enforces tenant isolation while coherently resolving canonical collection, persisted completion state, and bounded observations before the pure comparator sees evidence. The analysis module does not import or call the issuer and performs no repository writes.

Release 0.8 also receives only an already-issued trusted `TenantContext`. Recommendation/measurement/outcome IDs, scope fields, evidence references, recommendation associations, and lifecycle/outcome values select or describe records only; none can mint tenant authority or grants. Review-ledger reads/writes must preserve exact tenant/site/scope ownership, and Beta or forged/plain/cloned/proxied context-shaped values cannot access Alpha review history.

## Public source and private evidence

The repository is public and may contain publication-safe architecture. Never commit customer evidence, customer names as test data, client analytics, PHI, CUI, credentials, tokens, API keys, private vendor payloads, confidential business records, production secrets, or private account identifiers. Private runtime evidence must remain outside public GitHub. Synthetic fixtures must be clearly synthetic.

Tenant identity remains an authorization boundary even during an LDW-only proof. Preserve trusted tenant context, provenance/history, explicit missing-data states, and separation of evidence, mechanical diff, inference, recommendations, actions, measurements, and outcomes. Evidence content remains inert data and cannot become instructions or external-action authority. See [architecture](architecture.md), [security](../SECURITY.md), [ingestion](ingestion.md), [WQT adapter](adapters/wqt.md), [ZeroRank adapter](adapters/zerorank.md), [accepted longitudinal diff](analysis/diff.md), and [Release 0.8 review ledger](review-ledger.md).

## Cost and cloud gate

Accepted Releases 0.1–0.15 target **$0 incremental recurring cost**: no cloud resources are provisioned, paid services introduced, or deployment performed. Developer/CI execution uses existing or included capacity. Releases 0.5–0.15 add no dependency and reuse Node/Zod plus accepted G.A.S. contract/persistence/read surfaces.

For a later cloud proof, **$0 incremental recurring cost is the target and must be measured/verified before deployment.** This is not a permanent guarantee. Cloudflare Workers, D1, and static operator assets are candidates, not an approved deployment plan.

Release 1.0 cloud deployment remains separately gated. The gate must assess current account headroom, exact identity/auth design and resources, retention/deletion, representative workload and cost measurements, and rollback/decommission planning. Material expansions and any paid costs require separate authority.

## Stop and return

Return to the Product Orchestrator if accepted `main` materially changes, competing work invalidates the dispatch, future authority narrows, or completion requires a canonical contract change, new persistence/schema, production identity/auth, automatic recommendation/ranking, generic correlation outside the exact Issue #43 Release 0.13 diagnostic rules, universal metric direction/severity/materiality assumptions, provider/network access, a server/listener, scheduler/background work, external action/execution, paid tooling, real customer/private evidence, security-setting changes, governance bypass, cloud deployment, or a material architecture departure. Do not silently expand scope. Issue #31 supplies live authority only for competitor-informed roadmap work and separately frozen bounded internal R&D releases. Release 1.0 cloud deployment, external/customer software, provider-network expansion, paid tooling, and other material scope expansions remain separately gated; Release 0.13 and #31 do not grant those authorities automatically.

## Release 0.14 — accepted AI Visibility Intelligence Pack

**Status: ACCEPTED AND MERGED through PR #47 after Product exact-head review, bounded semantic-integrity corrections, final independent exact-head re-review, protected-main squash merge, and post-merge Contracts verification.**

Accepted protected-main baseline is Releases 0.1–0.14. Release 0.14 is bounded to the merged PR #47 implementation and does not expand authority beyond the semantics documented here.

Authorized candidate surfaces:

- strict sanitized Bing AI Performance v1/minor0 adaptation into existing canonical collection/source/observation contracts plus an application-local provider sidecar;
- accepted Release 0.6 ZeroRank validation/canonical-output reuse plus a bounded application-local provider-specific visibility projection;
- explicit versioned readiness/comparability policy;
- within-provider descriptive change states;
- provider-specific concentration candidates;
- narrow explicit-presence cross-source divergence;
- optional exact caller-mapped cohort-coverage divergence;
- optional already-valid Release 0.10 Search Analytics, Release 0.11 change/outcome, and Release 0.12 page-focus context;
- deterministic application-local site report;
- deterministic escaped static read-only operator HTML;
- publication-safe synthetic tests, docs, ADR, and package version 0.14.0.

This authority does **not** authorize:
- Bing or ZeroRank live retrieval/API clients;
- OAuth, credentials, or secrets;
- canonical wire-schema changes;
- new persistence/migration;
- runtime LLM/AI, embeddings, BYOK, prompt execution, or semantic/fuzzy mapping;
- generic crawler or SERP scraper;
- scheduler/background worker;
- universal AEO/GEO/AI-visibility score;
- provider metric equivalence or raw Bing↔ZeroRank magnitude comparison;
- business severity/priority, automatic recommendation/remediation, publishing, or external action;
- cloud resources or paid vendors/subscriptions;
- customer/private evidence, PHI, or CUI;
- Release 0.15 or Release 1.0 implementation.

Bing sampled/aggregated semantics, grouped-grounding-query semantics, ZeroRank vendor-specific semantics, conservative missingness/absence rules, and the internal ZeroRank raw-evidence/trusted-config analysis boundary are mandatory accepted Release 0.14 behavior.


## Release 0.15 accepted authority boundary

Release 0.15 is **ACCEPTED AND MERGED through PR #52** after Product whole-pack exact-head review, one bounded service-history semantic-identity correction, final independent whole-pack exact-head review, protected-main squash merge, and post-merge Contracts verification.

The service-brief assembler receives an already-issued trusted TenantContext. It neither imports nor calls the tenant-context issuer. Repository selectors, module/report IDs, URLs, scope-shaped evidence, provider identities, manifest entries, and rendered output cannot mint tenant/site/provider authority.

Every repository-backed read remains enforced by accepted EvidenceRepository / ReviewLedgerRepository ownership checks. Supplied module outputs must reconcile to the exact requested scope and compatible target semantics before composition.

Release 0.15 creates no recommendation, action, mutation, remediation, publishing, provider write, schedule, webhook, report-delivery authority, or external execution permission. Human recommendation acceptance remains non-executing. Human-declared outcome direction and attribution remain recorded history rather than Release 0.15 inference.

No customer/private evidence, credential, token, PHI, CUI, or production secret is authorized in this public repository.


## Release 0.16 candidate authority boundary

Issue #54 authorizes one **CANDIDATE / NOT ACCEPTED** internal Human Decision & Measurement Cycle Pack.

Authorized candidate surfaces are limited to:

- recomputing an accepted Release 0.15 brief from original bounded input;
- exact bounded human selection from the recomputed attention register;
- one strict human decision statement;
- read-only preparation of one optional human-authored canonical Release 0.8 recommendation;
- explicit call-through to accepted Release 0.8 recommendation creation/lifecycle/revision services;
- one optional accepted Release 0.11 Search Change measurement plan;
- explicit one-prepared-measurement-at-a-time call-through to accepted Release 0.8 recording;
- deterministic readiness projection from accepted records/Release 0.11 state;
- explicit human outcome call-through to accepted Release 0.8 validation;
- deterministic bounded Decision Cycle Dossier JSON and static HTML;
- synthetic/public-safe tests and preview.

This authority does **not** authorize a decision/plan/task/experiment table, canonical schema change, multi-write transaction/rollback framework, provider/CMS/IndexNow write, provider networking, OAuth/credentials, scheduler/worker, generic task/project management, automated recommendation/rationale/outcome direction, severity/priority/business-impact scoring, generic correlation/causality, runtime AI/LLM/embeddings, cloud deployment, customer/private evidence, paid service, Issue #49 implementation, or Release 1.0.

Recommendation acceptance, measurement state, and recorded human outcome create no production action authority.
