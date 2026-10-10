# Engineering authorization boundary

The current program authorization is a **bounded LDW internal managed-service Search / SEO / generative-AI visibility intelligence and decision-support engine proof**. G.A.S. means Generative / Answer / Search. Its purpose is to support LDW delivery and evidence reconciliation across replaceable sources; it is not authorized as standalone commercial software, customer SaaS, or self-service software.

LDW internal governance is authoritative. This public document summarizes engineering boundaries without reproducing confidential governance records. A roadmap, architectural decision, recommendation, or public repository does not independently expand authority.

## Current workstream

Releases 0.1–0.20 are accepted and merged to `main`. Repository governance is established: a repository ruleset targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

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

This evergreen internal R&D authority covers G.A.S. as LDW's umbrella Search / SEO / generative-AI visibility intelligence and decision-support engine, but it does not authorize commodity sensor/platform duplication merely because that workload is in scope. It does not authorize customer SaaS, custom production auth, customer portals, generic crawlers/rank crawlers/backlink crawlers/local-grid crawlers/prompt runners, cloud deployment, paid data warehouses, new provider credentials, customer/private evidence, runtime AI/BYOK, autonomous remediation/content publishing, or production mutation. Prefer INTEGRATE/CONFIGURE/WATCH for replaceable sensing unless a separately frozen decision proves an LDW-owned semantic gap. Managed-service packaging, claims, pricing, and demand remain under business-operations #280. Release 1.0 remains the separate cloud gate.

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

Accepted Releases 0.1–0.20 target **$0 incremental recurring cost**: no cloud resources are provisioned, paid services introduced, or deployment performed. Developer/CI execution uses existing or included capacity. Release 0.20 adds no dependency and reuses Node built-ins plus accepted G.A.S. contract/persistence/read surfaces.

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


## Release 0.16 accepted authority boundary

Issue #54 records the **accepted Human Decision & Measurement Cycle Pack**, merged through PR #55 after Product whole-pack review, bounded semantic-integrity corrections, final independent re-review, protected-main squash merge, and post-merge Contracts verification.

Accepted Release 0.16 surfaces are limited to:

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

## Release 0.17 accepted authority boundary

Release 0.17 Operator Workspace & Service Reporting UX Pack is **accepted and merged on `main` through PR #62** at squash merge `52ea537e99a92b05a52c2e732a86104d65f2ea28`, with post-merge Contracts `36968094314` SUCCESS.

Accepted Release 0.17 authority is limited to:

- deterministic recomposition of accepted Release 0.15 and optional Release 0.16 state;
- bounded local OperatorWorkspace JSON;
- self-contained local browser presentation/filter/selection;
- strict application-local action/report request artifacts;
- authoritative Node-side source-identity drift checks;
- call-through to already accepted Release 0.16/0.8 write services;
- deterministic customer-safe report JSON/static HTML;
- public-safe synthetic example.test preview/test material.

Browser data remains untrusted and creates no TenantContext/site/scope authority. Recommendation, lifecycle, measurement, outcome, readiness, evidence, and persistence semantics remain owned by accepted releases.

This authority does not include a new canonical schema/table/migration, report/service-run persistence, production auth/session, server/listener, provider network/OAuth, cloud resource, scheduler/worker, report delivery, customer portal, runtime AI, paid service, automated ranking/recommendation/action, Issue #49/#56 implementation, Release 0.18, or Release 1.0.

## Release 0.18 accepted authority boundary

Release 0.18 Repeatable Managed-Service Run & Evidence Intake Pack is **accepted and merged on `main` through PR #67** at squash merge `6a24d9fb428c1a62b9766f5baa5815329eab78b7`, with post-merge Contracts `37056080706` SUCCESS.

Accepted Release 0.18 authority is limited to:

- deliberate WQT v1 minor3 adaptation using the existing generic typed-fact machinery;
- pure exact WQT provider-snapshot reconstruction from accepted adapter output;
- strict application-local operational source receipts;
- authoritative recomputation of accepted Release 0.17 workspace state;
- exact application-local comparison against zero or one prior Release 0.18 run summary;
- direct projection of accepted Release 0.16 readiness;
- optional accepted Release 0.17 report composition/rendering;
- deterministic bounded local service-run/package files and manifest;
- synthetic/public-safe example.test tests and previews.

Receipts, run summaries, filenames, hashes, and prior-run IDs do not create TenantContext/site/scope/provider authority or production action authority.

This authority does not include a canonical schema/table/migration, durable service-run/history database, private wqt-operations history/retention, WQT recurrence/scheduling, provider/GitHub artifact retrieval, credentials/OAuth, server/listener, scheduler/worker, Activepieces invocation, email/SuiteDash/REPORT-AUTO delivery, cloud resource, runtime AI, paid service, Issue #49/#56, Release 0.19, or Release 1.0.

## Release 0.19 accepted authority boundary

Release 0.19 Internal Portfolio / Multi-Site Operations Console is **accepted and merged on `main` through Issue #69 / PR #70** at squash merge `8f25068a659f1c57be16ccd648cdbc86a8bda1fb`, with post-merge Contracts `37261605064` SUCCESS.

Accepted Release 0.19 authority is limited to:

- one trusted application-local portfolio inventory that owns engagement identity, exact tenant/site/scope, trusted target, current-run selection, and explicit source-family freshness policy;
- zero or one accepted Release 0.18 `ManagedServiceRun` per engagement;
- strict current-run import/invariant verification using the canonical run-ID computation singly owned by `src/operator/service-run.ts`;
- exact trusted inventory/run scope and target reconciliation with cross-tenant substitution failing closed;
- exact source-state preservation plus separate caller-policy operational freshness;
- deterministic per-engagement navigation state and fixed unranked factual exceptions;
- bounded operational-only cross-engagement counts that do not aggregate or benchmark customer performance;
- deterministic bounded LDW-internal JSON and self-contained presentation-only HTML;
- synthetic/public-safe example.test tests and preview.

This authority does not include provider polling/networking, scheduler/background workers, persistent unread/task state, report-delivery state or transport, database/table/migration, new canonical wire schema, runtime AI, cloud deployment, customer portal/SaaS, cross-customer performance benchmarking, universal scores, automatic priority/severity/business-impact inference, private WQT runtime/history, REPORT-AUTO delivery, paid service, Release 0.20, or Release 1.0.

## Release 0.20 accepted authority boundary

Release 0.20 Private-Runtime Packaging & Portability Readiness is **accepted and merged on `main` through Issue #74 / PR #75** at squash merge `9e529669020e6d833b5f5ef7afdac48ab67e30bf`, with independent whole-pack ACCEPT and post-merge Contracts `37385826289` SUCCESS.

Accepted Release 0.20 authority is limited to:

- one strict non-secret application-local runtime profile;
- administrative Node 24.19 `node:sqlite` online backup of accepted local SQLite state;
- one deterministic portable-directory manifest with exact logical paths, SHA-256, byte counts, classifications, required state, retention metadata, and root-independent identity;
- explicit accepted generated-artifact admission only, with no recursive content discovery;
- strict path/root/symlink/hash/byte/package verification;
- physical root-A to root-B relocation and accepted schema/repository reopen;
- representative reads under newly issued trusted authority rather than serialized `TenantContext` or sessions;
- deterministic retention planning only;
- explicit operator-selected rollback bundle plus recovery/decommission requirements;
- public-safe synthetic tests and `preview:portability`;
- package version `0.20.0` with no dependency addition and a $0 incremental recurring cash target.

This accepted authority does not include production/customer deployment, cloud resources, Workers/D1, Docker/OCI/Kubernetes, provider networking/polling, credentials/secrets, identity-provider implementation, scheduler/background worker, new migration/table, new canonical public wire schema, destructive production retention, customer/private proof data, private WQT consumer/history/retention/recurrence, REPORT-AUTO delivery, paid service, DNS/domain/email/billing/account mutation, or Release 1.0 authority.

## Release 0.21 candidate authority boundary

Issue #88 authorizes one bounded **candidate** Evidence-Grounded Operator Assist Pack over the accepted Releases 0.1–0.20 baseline. Until merge/post-merge acceptance, 0.21 is not part of the accepted baseline.

Candidate authority is limited to:

- validate an already-issued trusted `TenantContext` and recompute accepted Release 0.15 from the original strict producer input;
- emit one bounded deterministic application-local assist packet with exact packet-local references to supplied attention/readiness/provenance/limitation facts;
- use fixed/versioned trusted reviewer instructions that cannot be changed by evidence text;
- accept one strict application-local external advisory bound to the exact packet and exact references;
- validate structure/reference integrity only, never factual truth, causality, priority, impact, or approval;
- emit deterministic bounded advisory JSON and escaped standalone read-only HTML;
- direct the operator back to the already accepted explicit HUMAN Release 0.16 decision path;
- use synthetic/public-safe `example.test` tests and preview material only;
- target package `0.21.0` with no new runtime dependency and `$0` incremental recurring cash.

External advisory content, suggested ordering, hypotheses, draft options, URLs, packet IDs, evidence references, and reviewer/provider/model labels never mint tenant/site/scope authority and never become canonical priority, recommendation, outcome, or production-action authority. Reviewer provenance is descriptive only, not authenticated identity.

This candidate authority does **not** include a runtime AI/LLM/model call, provider/model SDK, API key/BYOK/credential handling, prompt runner/model router/agent loop, browser automation, network client/server/listener, embeddings/vector database, new database/table/migration, new canonical public wire schema, durable advisory persistence, automatic severity/priority/business-impact score, automatic recommendation/outcome/action, CMS/provider/site mutation, publishing, customer/private evidence transfer, paid dependency/service, cloud/private deployment, Issue #49 implementation, Issue #56/#81 implementation, or Release 1.0.

See the [Release 0.21 candidate guide](operator-assist.md) and [ADR 0021](decisions/0021-evidence-grounded-operator-assist.md).
