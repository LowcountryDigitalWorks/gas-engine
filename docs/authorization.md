# Engineering authorization boundary

The current program authorization is a **bounded LDW internal managed-service evidence-engine proof**. G.A.S. means Generative / Answer / Search. Its purpose is to support LDW delivery and evidence reconciliation; it is not authorized as standalone commercial software, customer SaaS, or self-service software.

LDW internal governance is authoritative. This public document summarizes engineering boundaries without reproducing confidential governance records. A roadmap, architectural decision, recommendation, or public repository does not independently expand authority.

## Current workstream

Releases 0.1–0.4 are accepted and merged to `main`. Repository governance is established: a repository ruleset targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

Accepted Release 0.4 proves **authenticated bounded ingestion only**: an injected opaque-credential authenticator, trusted immutable principal issuance with exact grants, one application ingestion service, one in-process Web `POST /v1/evidence/collections` handler, typed idempotency/part-sequence conflicts, and synthetic adversarial tests. It preserves accepted Release 0.3 tenant authority and persistence behavior and queries persisted collection progress before reporting completion.

Release 0.5 is currently authorized only as the draft **WQT normalized-evidence adapter proof** defined by Issue #6. It may consume already-normalized WQT v1/minor1 bytes plus explicit trusted caller configuration and deterministically emit separate SiteOne/Lighthouse `CollectionBatch` streams. It may not execute SiteOne/Lighthouse, dispatch/download WQT Actions, fetch URLs, use provider credentials, import WQT source/package at runtime, modify WQT opportunistically, issue tenant authority, deploy, add recommendation/priority logic, or begin Release 0.6. See [WQT adapter guide](adapters/wqt.md) and [ADR 0004](decisions/0004-wqt-normalized-evidence-adapter.md).

Release 0.5 remains a candidate until Product ORCH1 independently reviews and accepts the exact final head. The development workstream may not mark the PR ready or merge it. Cursor/Claude independent review is a later Product ORCH1-controlled gate after the candidate is frozen.

Releases through 0.5 do **not** authorize a production identity provider, password/JWT/OAuth/session/API-key database, credential persistence, live provider/network access from G.A.S., HTTP listener, customer evidence, external execution, operator UI, or cloud deployment. Repository-local CI remains least privilege, included capacity, no secrets, and no deployment permissions. This boundary does not authorize account, security-setting, or ruleset changes.

## Fixed proof limits

- Internal managed-service tooling only; no customer SaaS, customer portal, customer deployment, real customer evidence, or client-site ingestion.
- Later evidence use is limited to authorized LDW-owned evidence and clearly synthetic testing/fixtures. Release 0.5 tests use only synthetic `example-site` / `https://example.test` WQT-style evidence.
- No paid infrastructure, paid dependency, purchase, overage, billing enablement, or new subscription without separate authority.
- No runtime AI/BYOK, autonomous external remediation, autonomous production mutation, or parallel autonomous GitHub-writing mechanism.
- Sensor/read capability never grants action/write authority. Human acceptance of a recommendation does not automatically authorize a production change; future external actions require separately approved execution paths.
- No account/security, DNS, domain, email, or production changes in this workstream.
- No public price, SLA, ranking guarantee, citation guarantee, traffic guarantee, lead guarantee, or internal pricing hypothesis belongs in this repository. Internal automation does not prove commercial demand; the audit-first/service-first model continues independently.
- **No software license grant.** Do not add `LICENSE`, `COPYING`, another project license grant, or project licensing metadata. Dependencies retain their own licenses and ordinary lockfile metadata. Public visibility itself does not create an OSS license.

## Authority and input boundary

Untrusted request or evidence data never creates authority. Accepted Release 0.3 keeps tenant-context issuance package-internal and persistence exposes only validation. Accepted Release 0.4 intentionally makes `src/authentication/principal.ts` the sole additional production caller of the tenant-context issuer after trusted credential verification. Transport, application service, provider adapters, evidence fields, IDs, URLs, hashes, scores, and headers other than the authenticated credential may not issue contexts or grants.

Exact ingestion grants bind tenant, site, site-scope revision, provider, and provider connection. The authenticated request body contains one bounded persistence part: `collection`, `part`, `parts`, `sources`, and `observations`; the whole-collection idempotency key remains a header. Canonical `receivedCount` keeps its whole-collection meaning. Each part is atomic, multipart ingestion is not one transaction, and observations remain same-part-source only. `complete` is derived from stored progress after persistence.

Release 0.5 adds a separate trusted adapter-configuration boundary, not authentication. Trusted configuration supplies G.A.S. scope, expected WQT site/target, provider-connection IDs, canonical timestamps, and source availability. WQT artifact `siteId`, target, provider/tool values, source keys, and hashes are validated evidence and cannot replace that trusted configuration. The adapter neither imports nor calls the tenant-authority issuer.

## Public source and private evidence

The repository is public and may contain publication-safe architecture. Never commit customer evidence, customer names as test data, client analytics, PHI, CUI, credentials, tokens, API keys, private vendor payloads, confidential business records, production secrets, or private account identifiers. Private runtime evidence must remain outside public GitHub. Synthetic fixtures must be clearly synthetic.

Tenant identity remains an authorization boundary even during an LDW-only proof. Preserve trusted tenant context, provenance/history, explicit missing-data states, and separation of evidence, inference, recommendations, actions, measurements, and outcomes. Evidence content remains inert data and cannot become instructions or external-action authority. See [architecture](architecture.md), [security](../SECURITY.md), [ingestion](ingestion.md), and [WQT adapter](adapters/wqt.md).

## Cost and cloud gate

Releases 0.1–0.5 target **$0 incremental recurring cost**: no resources are provisioned, paid services introduced, or deployment performed. Developer/CI execution uses existing or included capacity. Release 0.5 adds no dependency and reuses Node/Zod plus accepted G.A.S. contracts/persistence validation.

For a later cloud proof, **$0 incremental recurring cost is the target and must be measured/verified before deployment.** This is not a permanent guarantee. Cloudflare Workers, D1, and static operator assets are candidates, not an approved deployment plan.

Release 1.0 cloud deployment remains separately gated. The gate must assess current account headroom, exact identity/auth design and resources, retention/deletion, representative workload and cost measurements, and rollback/decommission planning. Material expansions and any paid costs require separate authority.

## Stop and return

Return to Product ORCH1 if accepted `main` materially changes, competing work invalidates the dispatch, authority narrows, WQT's normalized contract materially changes, the accepted WQT artifact cannot support the mapping without a WQT-side change, or completion requires live provider access, a production identity system, a substantial new dependency, paid tooling, private/customer material, security-setting changes, governance bypass, cloud deployment, or a material architecture departure. Do not silently expand scope. Release 0.6 / ZeroRank is not authorized by Release 0.5.
