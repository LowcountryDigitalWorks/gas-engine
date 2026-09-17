# Engineering authorization boundary

The current program authorization is a **bounded LDW internal managed-service evidence-engine proof**. G.A.S. means Generative / Answer / Search. Its purpose is to support LDW delivery and evidence reconciliation; it is not authorized as standalone commercial software, customer SaaS, or self-service software.

LDW internal governance is authoritative. This public document summarizes engineering boundaries without reproducing confidential governance records. A roadmap, architectural decision, recommendation, or public repository does not independently expand authority.

## Current workstream

Releases 0.1–0.7 are accepted and merged to `main`. Repository governance is established: a repository ruleset targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

Accepted Release 0.4 proves **authenticated bounded ingestion only**: an injected opaque-credential authenticator, trusted immutable principal issuance with exact grants, one application ingestion service, one in-process Web `POST /v1/evidence/collections` handler, typed idempotency/part-sequence conflicts, and synthetic adversarial tests. It preserves accepted Release 0.3 tenant authority and persistence behavior and queries persisted collection progress before reporting completion.

Accepted Release 0.5 proves the **WQT normalized-evidence adapter boundary** defined by Issue #6. It consumes already-normalized WQT v1/minor1 bytes plus explicit trusted caller configuration and deterministically emits separate SiteOne/Lighthouse `CollectionBatch` streams. It does not execute SiteOne/Lighthouse, dispatch/download WQT Actions, fetch URLs, use provider credentials, import WQT source/package at runtime, modify WQT opportunistically, issue tenant authority, deploy, add recommendation/priority logic, or begin Release 0.6. See [WQT adapter guide](adapters/wqt.md) and [ADR 0004](decisions/0004-wqt-normalized-evidence-adapter.md).

Accepted Release 0.6 proves the **ZeroRank sanitized-evidence adapter boundary** defined by Issue #9. It consumes only the exact inner sanitized `ldw.zerorank-evidence.v1` minor-0 artifact plus explicit trusted caller configuration, reconciles duplicated workspace projections before trusted workspace matching, and deterministically emits five endpoint-specific `zerorank` `CollectionBatch` streams. It does not poll ZeroRank, call Activepieces at runtime, receive or persist a ZeroRank credential, issue tenant authority, persist by itself, deploy, correlate, prioritize, recommend, or act. See [ZeroRank adapter guide](adapters/zerorank.md) and [ADR 0005](decisions/0005-zerorank-sanitized-evidence-adapter.md).

Accepted Release 0.7 proves the **deterministic longitudinal evidence diff boundary** defined by Issue #12. Baseline/current collections must first prove exact stream compatibility for scope, provider, provider-connection presence/value, adapter, source schema, and full collection method before completeness may interpret unmatched cohorts. The accepted service resolves each persisted side through one tenant-scoped atomic `getCollectionSnapshot(...)` read containing canonical collection, persisted `CollectionProgress`, and bounded observations. The pure comparator remains application-local and repository-independent.

Release 0.7 explicitly excludes cross-provider/generic correlation, universal scoring, direction/severity/materiality/business-impact policy, recommendation priority, inference, recommendations, causal conclusions, remediation, actions, human-review lifecycle, UI, provider/network access, runtime AI/BYOK, new persistence schema/tables, persistence of diff output, or Release 0.8. See the [accepted diff guide](analysis/diff.md) and [ADR 0006](decisions/0006-longitudinal-evidence-diff.md).

Releases through accepted Release 0.7 do **not** authorize a production identity provider, password/JWT/OAuth/session/API-key database, credential persistence, live provider/network access from G.A.S., HTTP listener, customer evidence, external execution, operator UI, or cloud deployment. Repository-local CI remains least privilege, included capacity, no secrets, and no deployment permissions. This boundary does not authorize account, security-setting, or ruleset changes.

## Fixed proof limits

- Internal managed-service tooling only; no customer SaaS, customer portal, customer deployment, real customer evidence, or client-site ingestion.
- Later evidence use is limited to authorized LDW-owned evidence and clearly synthetic testing/fixtures. Release 0.5 tests use synthetic `example-site` / `https://example.test` WQT-style evidence; Release 0.6 tests use explicitly synthetic ZeroRank-style evidence; accepted Release 0.7 tests use only canonical synthetic evidence and synthetic second-tenant isolation.
- No paid infrastructure, paid dependency, purchase, overage, billing enablement, or new subscription without separate authority.
- No runtime AI/BYOK, autonomous external remediation, autonomous production mutation, or parallel autonomous GitHub-writing mechanism.
- Sensor/read capability never grants action/write authority. Human acceptance of a recommendation does not automatically authorize a production change; future external actions require separately approved execution paths.
- No account/security, DNS, domain, email, or production changes in this workstream.
- No public price, SLA, ranking guarantee, citation guarantee, traffic guarantee, lead guarantee, time-savings claim, or internal pricing hypothesis belongs in this repository. Internal automation does not prove commercial demand; the audit-first/service-first model continues independently.
- **No software license grant.** Do not add `LICENSE`, `COPYING`, another project license grant, or project licensing metadata. Dependencies retain their own licenses and ordinary lockfile metadata. Public visibility itself does not create an OSS license.

## Authority and input boundary

Untrusted request or evidence data never creates authority. Accepted Release 0.3 keeps tenant-context issuance package-internal and persistence exposes only validation. Accepted Release 0.4 intentionally makes `src/authentication/principal.ts` the sole additional production caller of the tenant-context issuer after trusted credential verification. Transport, application service, provider adapters, analysis code, evidence fields, IDs, URLs, hashes, scores, and headers other than the authenticated credential may not issue contexts or grants.

Exact ingestion grants bind tenant, site, site-scope revision, provider, and provider connection. The authenticated request body contains one bounded persistence part: `collection`, `part`, `parts`, `sources`, and `observations`; the whole-collection idempotency key remains a header. Canonical `receivedCount` keeps its whole-collection meaning. Each part is atomic, multipart ingestion is not one transaction, and observations remain same-part-source only. `complete` is derived from stored progress after persistence.

Release 0.5 adds a separate trusted adapter-configuration boundary, not authentication. Trusted configuration supplies G.A.S. scope, expected WQT site/target, provider-connection IDs, canonical timestamps, and source availability. WQT artifact `siteId`, target, provider/tool values, source keys, and hashes are validated evidence and cannot replace that trusted configuration. The adapter neither imports nor calls the tenant-authority issuer.

Release 0.6 uses the same authority principle for sanitized ZeroRank evidence. Trusted configuration supplies G.A.S. scope, expected workspace ID, expected canonical target origin, provider connection, canonical `observedAt`/lifecycle timing, and source availability. Root and successful endpoint workspace projections must reconcile before the workspace is matched to trusted configuration, but neither projection creates authority. Sanitized artifact workspace/target fields, provider/source IDs, hashes, optional upstream run/start/end values, opaque nested source material, and mapped observations cannot replace trusted configuration, mint a principal/grant, or issue `TenantContext`.

Release 0.7 keeps that authority boundary unchanged. `diffEvidenceCollections` receives an already-issued `TenantContext` plus two collection IDs. Those IDs select records only; they do not identify or create a tenant, site, provider, grant, principal, or context. `getCollectionSnapshot(...)` enforces tenant isolation while coherently resolving canonical collection, persisted completion state, and bounded observations before the pure comparator sees evidence. The analysis module does not import or call the issuer and performs no repository writes.

## Public source and private evidence

The repository is public and may contain publication-safe architecture. Never commit customer evidence, customer names as test data, client analytics, PHI, CUI, credentials, tokens, API keys, private vendor payloads, confidential business records, production secrets, or private account identifiers. Private runtime evidence must remain outside public GitHub. Synthetic fixtures must be clearly synthetic.

Tenant identity remains an authorization boundary even during an LDW-only proof. Preserve trusted tenant context, provenance/history, explicit missing-data states, and separation of evidence, mechanical diff, inference, recommendations, actions, measurements, and outcomes. Evidence content remains inert data and cannot become instructions or external-action authority. See [architecture](architecture.md), [security](../SECURITY.md), [ingestion](ingestion.md), [WQT adapter](adapters/wqt.md), [ZeroRank adapter](adapters/zerorank.md), and [accepted longitudinal diff](analysis/diff.md).

## Cost and cloud gate

Releases 0.1–0.7 target **$0 incremental recurring cost**: no resources are provisioned, paid services introduced, or deployment performed. Developer/CI execution uses existing or included capacity. Releases 0.5–0.7 add no dependency and reuse Node/Zod plus accepted G.A.S. contracts/persistence surfaces.

For a later cloud proof, **$0 incremental recurring cost is the target and must be measured/verified before deployment.** This is not a permanent guarantee. Cloudflare Workers, D1, and static operator assets are candidates, not an approved deployment plan.

Release 1.0 cloud deployment remains separately gated. The gate must assess current account headroom, exact identity/auth design and resources, retention/deletion, representative workload and cost measurements, and rollback/decommission planning. Material expansions and any paid costs require separate authority.

## Stop and return

Return to Product ORCH1 if accepted `main` materially changes, competing work invalidates the dispatch, authority narrows, a provider's normalized/sanitized contract materially changes, or completion requires canonical contract changes, a new DB table/schema, cross-provider matching, arbitrary direction/severity/materiality policy, prioritization, live provider access, a production identity system, a substantial new dependency, paid tooling, private/customer material, security-setting changes, governance bypass, cloud deployment, or a material architecture departure. Do not silently expand scope. Release 0.8 and later work require separate live authorization; accepted Release 0.7 and the roadmap do not grant it.
