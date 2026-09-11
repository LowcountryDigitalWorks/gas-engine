# Engineering authorization boundary

The current program authorization is a **bounded LDW internal managed-service evidence-engine proof**. G.A.S. means Generative / Answer / Search. Its purpose is to support LDW delivery and evidence reconciliation; it is not authorized as standalone commercial software, customer SaaS, or self-service software.

LDW internal governance is authoritative. This public document summarizes engineering boundaries without reproducing confidential governance records. A roadmap, architectural decision, recommendation, or public repository does not independently expand authority.

## Current workstream

Release 0.1 is authorized as a documentation-only architecture and authority foundation. Its deliverables are `README.md`, `AGENTS.md`, `SECURITY.md`, `.gitignore`, `docs/architecture.md`, `docs/decisions/0001-evidence-core.md`, `docs/roadmap.md`, and this document.

It adds no runtime, source implementation, dependencies, package metadata, lockfiles, schemas, migrations, fixtures, tests, workflows, API definitions, authentication, provider code, or deployment configuration. It performs no ingestion or external execution. Product-Orchestrator independent review and release acceptance remain required; the implementation workstream does not merge or self-accept its Release 0.1 PR.

Later Releases 0.2–0.9 may be sequenced only through bounded Product-Orchestrator authority and normal independent review. This workstream does not implement or dispatch them. Before functional/runtime merges, the repository must receive the separately governed, enforceable public-repository governance and applicable CI baseline.

## Fixed proof limits

- Internal managed-service tooling only; no customer SaaS, customer portal, customer deployment, real customer evidence, or client-site ingestion.
- Later evidence use is limited to authorized LDW-owned evidence and clearly synthetic testing/fixtures. The initial target is LDW's own public site with WQT and read-only ZeroRank evidence.
- No paid infrastructure, paid dependency, purchase, overage, billing enablement, or new subscription without separate authority.
- No runtime AI/BYOK, autonomous external remediation, autonomous production mutation, or parallel autonomous GitHub-writing mechanism.
- Sensor/read capability never grants action/write authority. Human acceptance of a recommendation does not automatically authorize a production change; future external actions require separately approved execution paths.
- No account/security, DNS, domain, email, or production changes in this workstream.
- No public price, SLA, ranking guarantee, citation guarantee, traffic guarantee, lead guarantee, or internal pricing hypothesis belongs in this repository. Internal automation does not prove commercial demand; the audit-first/service-first model continues independently.
- **No software license grant.** Do not add `LICENSE`, `COPYING`, another license grant, or licensing metadata. Public visibility itself does not create an OSS license; future licensing decisions remain separately governed.

## Public source and private evidence

The repository is public and may contain publication-safe architecture. Never commit customer evidence, customer names as test data, client analytics, PHI, CUI, credentials, tokens, API keys, private vendor payloads, confidential business records, production secrets, or private account identifiers. Private runtime evidence must remain outside public GitHub. Synthetic fixtures in later authorized releases must be clearly synthetic.

Tenant identity remains an authorization boundary even during an LDW-only proof. Preserve trusted tenant context, provenance/history, explicit missing-data states, and separation of evidence, inference, recommendations, actions, measurements, and outcomes. See [architecture](architecture.md) and [security](../SECURITY.md).

## Cost and cloud gate

Release 0.1 adds **$0 incremental recurring cost**: it provisions no resources, introduces no paid services, and performs no deployment.

For a later cloud proof, **$0 incremental recurring cost is the target for the bounded proof and must be measured/verified before deployment.** This is not a permanent guarantee. Cloudflare Workers, D1, and static operator assets are candidates, not an approved deployment plan.

Release 1.0 cloud deployment remains separately gated. The gate must assess current account headroom, exact identity/auth design and resources, retention/deletion, representative workload and cost measurements, and rollback/decommission planning. Material expansions and any paid costs require separate authority.

## Stop and return

Return to the Product Orchestrator if live repository changes or competing work invalidate the dispatch, governing authority revokes or narrows it, or completion would require functional code, a paid dependency, publication of private/customer material, or a material architecture change. Do not resolve a stop condition by silently expanding scope. The [roadmap](roadmap.md) may be simplified or stopped when evidence shows duplication or poor value.
