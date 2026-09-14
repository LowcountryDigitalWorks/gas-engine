# Engineering authorization boundary

The current program authorization is a **bounded LDW internal managed-service evidence-engine proof**. G.A.S. means Generative / Answer / Search. Its purpose is to support LDW delivery and evidence reconciliation; it is not authorized as standalone commercial software, customer SaaS, or self-service software.

LDW internal governance is authoritative. This public document summarizes engineering boundaries without reproducing confidential governance records. A roadmap, architectural decision, recommendation, or public repository does not independently expand authority.

## Current workstream

Release 0.1's documentation-only architecture and authority foundation and Release 0.2's canonical-contract implementation are accepted and merged to `main`. Repository governance is established: a repository ruleset targets `main` and requires pull requests, review-thread resolution, linear history, and the `contracts` status check.

The bounded Release 0.3 dispatch permits local tenant-safe persistence, small deterministic migrations, and adversarial synthetic isolation tests. Its branch is reconstructed on accepted `main` with a draft PR based on `main`. Accepted Release 0.2 behavior is preserved unchanged. Product ORCH1 owns independent review and release acceptance; this workstream does not merge or self-accept its PR.

There is no ingestion, provider/network access, API serving, authentication, external execution, or deployment. Repository-local CI remains least privilege, included capacity, no secrets, and synthetic/local checks safe for public PRs. Later Releases 0.4–0.9 require separate bounded Product-Orchestrator sequencing. This dispatch does not authorize account, security-setting, or ruleset changes.

## Fixed proof limits

- Internal managed-service tooling only; no customer SaaS, customer portal, customer deployment, real customer evidence, or client-site ingestion.
- Later evidence use is limited to authorized LDW-owned evidence and clearly synthetic testing/fixtures. The initial target is LDW's own public site with WQT and read-only ZeroRank evidence.
- No paid infrastructure, paid dependency, purchase, overage, billing enablement, or new subscription without separate authority.
- No runtime AI/BYOK, autonomous external remediation, autonomous production mutation, or parallel autonomous GitHub-writing mechanism.
- Sensor/read capability never grants action/write authority. Human acceptance of a recommendation does not automatically authorize a production change; future external actions require separately approved execution paths.
- No account/security, DNS, domain, email, or production changes in this workstream.
- No public price, SLA, ranking guarantee, citation guarantee, traffic guarantee, lead guarantee, or internal pricing hypothesis belongs in this repository. Internal automation does not prove commercial demand; the audit-first/service-first model continues independently.
- **No software license grant.** Do not add `LICENSE`, `COPYING`, another project license grant, or project licensing metadata. Dependencies retain their own licenses and ordinary lockfile metadata. Public visibility itself does not create an OSS license; future project licensing decisions remain separately governed.

## Public source and private evidence

The repository is public and may contain publication-safe architecture. Never commit customer evidence, customer names as test data, client analytics, PHI, CUI, credentials, tokens, API keys, private vendor payloads, confidential business records, production secrets, or private account identifiers. Private runtime evidence must remain outside public GitHub. Synthetic fixtures in later authorized releases must be clearly synthetic.

Tenant identity remains an authorization boundary even during an LDW-only proof. Preserve trusted tenant context, provenance/history, explicit missing-data states, and separation of evidence, inference, recommendations, actions, measurements, and outcomes. See [architecture](architecture.md) and [security](../SECURITY.md).

## Cost and cloud gate

Releases 0.1–0.3 add **$0 incremental recurring cost**: no resources are provisioned, paid services introduced, or deployment performed. Developer/CI execution uses existing or included capacity.

For a later cloud proof, **$0 incremental recurring cost is the target for the bounded proof and must be measured/verified before deployment.** This is not a permanent guarantee. Cloudflare Workers, D1, and static operator assets are candidates, not an approved deployment plan.

Release 1.0 cloud deployment remains separately gated. The gate must assess current account headroom, exact identity/auth design and resources, retention/deletion, representative workload and cost measurements, and rollback/decommission planning. Material expansions and any paid costs require separate authority.

## Stop and return

Return to the Product Orchestrator if accepted `main` materially changes, competing work invalidates the dispatch, authority narrows, local SQLite is unsuitable, or completion requires cloud/authentication/provider access, a substantial new dependency, paid tooling, private/customer material, security setting changes, governance bypass, or a material architecture departure. Do not silently expand scope. The [roadmap](roadmap.md) may be simplified or stopped when evidence shows duplication or poor value.
