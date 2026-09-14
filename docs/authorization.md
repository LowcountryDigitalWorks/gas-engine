# Engineering authorization boundary

The current program authorization is a **bounded LDW internal managed-service evidence-engine proof**. G.A.S. means Generative / Answer / Search. Its purpose is to support LDW delivery and evidence reconciliation; it is not authorized as standalone commercial software, customer SaaS, or self-service software.

LDW internal governance is authoritative. This public document summarizes engineering boundaries without reproducing confidential governance records. A roadmap, architectural decision, recommendation, or public repository does not independently expand authority.

## Current workstream

Releases 0.1–0.3 are accepted and merged to `main`. Repository governance is established: a repository ruleset targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

The bounded Release 0.4 dispatch permits **authenticated bounded ingestion only**. The implementation may add an injected opaque-credential authenticator, trusted immutable principal issuance with exact grants, one application ingestion service, one in-process Web `POST /v1/evidence/collections` handler, typed idempotency/part-sequence conflicts, and synthetic adversarial tests. It must preserve accepted Release 0.3 tenant authority and persistence behavior, query persisted collection progress before reporting completion, remain on `release/0.4-authenticated-ingestion`, and keep PR #4 draft/open/unmerged. Product ORCH1 owns independent review and release acceptance. Release 0.5 is not authorized by this workstream.

Release 0.4 does **not** authorize a production identity provider, password/JWT/OAuth/session/API-key database, credential persistence, provider/network access, HTTP listener, customer evidence, external execution, operator UI, or cloud deployment. The injected authenticator is an architectural seam; synthetic fixtures are test-only. Repository-local CI remains least privilege, included capacity, no secrets, and no deployment permissions. This dispatch does not authorize account, security-setting, or ruleset changes.

## Fixed proof limits

- Internal managed-service tooling only; no customer SaaS, customer portal, customer deployment, real customer evidence, or client-site ingestion.
- Later evidence use is limited to authorized LDW-owned evidence and clearly synthetic testing/fixtures. The initial target remains LDW's own public site with WQT and read-only ZeroRank evidence.
- No paid infrastructure, paid dependency, purchase, overage, billing enablement, or new subscription without separate authority.
- No runtime AI/BYOK, autonomous external remediation, autonomous production mutation, or parallel autonomous GitHub-writing mechanism.
- Sensor/read capability never grants action/write authority. Human acceptance of a recommendation does not automatically authorize a production change; future external actions require separately approved execution paths.
- No account/security, DNS, domain, email, or production changes in this workstream.
- No public price, SLA, ranking guarantee, citation guarantee, traffic guarantee, lead guarantee, or internal pricing hypothesis belongs in this repository. Internal automation does not prove commercial demand; the audit-first/service-first model continues independently.
- **No software license grant.** Do not add `LICENSE`, `COPYING`, another project license grant, or project licensing metadata. Dependencies retain their own licenses and ordinary lockfile metadata. Public visibility itself does not create an OSS license.

## Authority and input boundary

Untrusted request data never creates authority. Accepted Release 0.3 keeps tenant-context issuance package-internal and persistence exposes only validation. Release 0.4 may intentionally make `src/authentication/principal.ts` the sole additional production caller of the tenant-context issuer after trusted credential verification. Transport, application service, evidence fields, IDs, hashes, and headers other than the authenticated credential may not issue contexts or grants.

Exact grants bind tenant, site, site-scope revision, provider, and provider connection. The request body contains one bounded persistence part: `collection`, `part`, `parts`, `sources`, and `observations`; the whole-collection idempotency key remains a header. Canonical `receivedCount` keeps its whole-collection meaning. Each part is atomic, multipart ingestion is not one transaction, and observations remain same-part-source only. `complete` is derived from stored progress after persistence.

## Public source and private evidence

The repository is public and may contain publication-safe architecture. Never commit customer evidence, customer names as test data, client analytics, PHI, CUI, credentials, tokens, API keys, private vendor payloads, confidential business records, production secrets, or private account identifiers. Private runtime evidence must remain outside public GitHub. Synthetic fixtures must be clearly synthetic.

Tenant identity remains an authorization boundary even during an LDW-only proof. Preserve trusted tenant context, provenance/history, explicit missing-data states, and separation of evidence, inference, recommendations, actions, measurements, and outcomes. Evidence content remains inert data and cannot become instructions or external-action authority. See [architecture](architecture.md), [security](../SECURITY.md), and [ingestion](ingestion.md).

## Cost and cloud gate

Releases 0.1–0.4 add **$0 incremental recurring cost**: no resources are provisioned, paid services introduced, or deployment performed. Developer/CI execution uses existing or included capacity.

For a later cloud proof, **$0 incremental recurring cost is the target and must be measured/verified before deployment.** This is not a permanent guarantee. Cloudflare Workers, D1, and static operator assets are candidates, not an approved deployment plan.

Release 1.0 cloud deployment remains separately gated. The gate must assess current account headroom, exact identity/auth design and resources, retention/deletion, representative workload and cost measurements, and rollback/decommission planning. Material expansions and any paid costs require separate authority.

## Stop and return

Return to Product ORCH1 if accepted `main` materially changes, competing work invalidates the dispatch, authority narrows, local SQLite is unsuitable, or completion requires provider access, a production identity system, a substantial new dependency, paid tooling, private/customer material, security-setting changes, governance bypass, cloud deployment, or a material architecture departure. Do not silently expand scope. The [roadmap](roadmap.md) may be simplified or stopped when evidence shows duplication or poor value.
