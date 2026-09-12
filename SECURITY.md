# Security posture

Release 0.1's architecture foundation is accepted. Release 0.2 adds canonical validation; the stacked Release 0.3 candidate adds tenant-scoped local SQLite persistence and adversarial synthetic tests. Both functional candidates remain unmerged pending repository governance and independent acceptance. There is no deployed service, ingestion, provider networking, or authentication implementation.

Every owned repository operation requires an opaque context recognized by a module-private registry. `createTrustedTestTenantContext` is explicitly trusted test scaffolding. It must never be exposed to untrusted request input; a future authenticated application boundary must establish tenant authority. Record IDs, source fields, successful validation, and hashes cannot create context. The repository exposes no raw SQL handle or caller transaction callback. Composite foreign keys prevent children from crossing tenant/site/scope/connection/run ownership boundaries. See [persistence guide](docs/persistence.md) for the tested surfaces and limitations.

The local process and configured database path remain trusted. SQLite file access is not a customer security boundary: anyone controlling the process/files can bypass the repository, disable constraints, or rewrite hashes. Canonical hashes detect accidental/stale mutations, not hostile authenticity failures. Test-network tripwires are an accidental-call check, not an operating-system sandbox. No credential fields or raw-provider-payload store exist; bounded strings still require safe upstream handling and must never contain secrets.

## Repository and evidence boundary

This public repository must contain no secrets, credentials, tokens, API keys, customer evidence, customer names as test data, client analytics, PHI, CUI, private vendor payloads, confidential business records, production secrets, or private account identifiers. Later fixtures must be clearly synthetic. Private runtime evidence belongs outside public GitHub with separately defined access, retention, and deletion controls.

Review staged content before publishing. Ignore patterns only reduce accidental additions; they do not remove tracked material or establish access control.

## Future critical controls

- **Tenant isolation:** the local repository requires trusted tenant context and tests every implemented read, list, filter, bulk lookup, join, update, delete, identity lookup, and transaction surface. Future authenticated application interfaces must preserve this boundary. Correlation, approval, export, and remeasurement are unimplemented and need adversarial tests when authorized.
- **Untrusted input:** provider payloads, retrieved page content, and other evidence are untrusted data. Their contents must not become instructions, executable code, authorization decisions, or permission to perform external actions. Future ingestion and display paths must validate and safely handle that input while retaining provenance.
- **Least privilege:** separate sensor/read adapters from write/action adapters and their credentials. Read access never grants write access. A recommendation, including one accepted by a human, does not automatically authorize a production change. External execution requires a separately approved governance path.
- **Dependencies:** review necessity, maintenance, licensing compatibility with project governance, and security risk before adoption. Zod performs actual wire validation; TypeScript and Node typings support local build/tests. Their licenses remain their own and do not grant a project license. Install from the lockfile with lifecycle scripts disabled and review current advisories before release. See the [contract guide](docs/contracts.md).
- **Release controls:** establish enforceable repository governance and applicable CI before functional/runtime merges. Cloud deployment requires its own later gate, including identity/auth, resource, retention/deletion, cost, and rollback review.

## Report a vulnerability privately

Use LDW's existing public business contact, [eddie@lowcountrydigitalworks.com](mailto:eddie@lowcountrydigitalworks.com), as published on the [Lowcountry Digital Works website](https://lowcountrydigitalworks.com). Identify G.A.S. Engine and give a minimal description, affected revision, and safe reproduction steps. Do not post exploit details, secrets, or private evidence in public issues or PRs; use synthetic or redacted examples in the initial report and coordinate any sensitive follow-up privately.

No formal security response SLA or bug bounty is offered by this document. Reporting does not authorize testing against customer or production systems.
