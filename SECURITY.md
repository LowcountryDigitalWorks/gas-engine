# Security posture

Release 0.1's architecture foundation is accepted. Release 0.2 adds local contract validation, deterministic hashing, synthetic fixtures/tests, and build dependencies. There is no deployed G.A.S. service, ingestion, provider networking, persistence, or authentication implementation. Contract validation checks local consistency; it does not establish trusted tenant authorization or prove that referenced approval/evidence records exist.

## Repository and evidence boundary

This public repository must contain no secrets, credentials, tokens, API keys, customer evidence, customer names as test data, client analytics, PHI, CUI, private vendor payloads, confidential business records, production secrets, or private account identifiers. Later fixtures must be clearly synthetic. Private runtime evidence belongs outside public GitHub with separately defined access, retention, and deletion controls.

Review staged content before publishing. Ignore patterns only reduce accidental additions; they do not remove tracked material or establish access control.

## Future critical controls

- **Tenant isolation:** tenant identity is an authorization boundary. Globally unique IDs do not authorize access. Future application and persistence interfaces must carry trusted tenant context and reject cross-tenant operations. Adversarial synthetic second-tenant testing must cover listing, reading, updating, correlating, approving, exporting, remeasuring, and deleting another tenant's data.
- **Untrusted input:** provider payloads, retrieved page content, and other evidence are untrusted data. Their contents must not become instructions, executable code, authorization decisions, or permission to perform external actions. Future ingestion and display paths must validate and safely handle that input while retaining provenance.
- **Least privilege:** separate sensor/read adapters from write/action adapters and their credentials. Read access never grants write access. A recommendation, including one accepted by a human, does not automatically authorize a production change. External execution requires a separately approved governance path.
- **Dependencies:** review necessity, maintenance, licensing compatibility with project governance, and security risk before adoption. Zod performs actual wire validation; TypeScript and Node typings support local build/tests. Their licenses remain their own and do not grant a project license. Install from the lockfile with lifecycle scripts disabled and review current advisories before release. See the [contract guide](docs/contracts.md).
- **Release controls:** establish enforceable repository governance and applicable CI before functional/runtime merges. Cloud deployment requires its own later gate, including identity/auth, resource, retention/deletion, cost, and rollback review.

## Report a vulnerability privately

Use LDW's existing public business contact, [eddie@lowcountrydigitalworks.com](mailto:eddie@lowcountrydigitalworks.com), as published on the [Lowcountry Digital Works website](https://lowcountrydigitalworks.com). Identify G.A.S. Engine and give a minimal description, affected revision, and safe reproduction steps. Do not post exploit details, secrets, or private evidence in public issues or PRs; use synthetic or redacted examples in the initial report and coordinate any sensitive follow-up privately.

No formal security response SLA or bug bounty is offered by this document. Reporting does not authorize testing against customer or production systems.
