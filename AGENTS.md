# Repository agent instructions

## Establish authority and live state

- Read [authorization](docs/authorization.md), [architecture](docs/architecture.md), and the [roadmap](docs/roadmap.md) before meaningful work. LDW internal governance and the current bounded dispatch determine authority.
- Fetch current `main`; inspect the tree, working-tree changes, open/recent PRs, workflows/configuration, and branch protection/rulesets where available before editing. Live repository state takes precedence over a stale handoff.
- Stop and return to the Product Orchestrator when live changes or competing work invalidate the dispatch, authority narrows, or completing the work would require a material scope expansion. Preserve others' changes.
- Use a branch from freshly verified `main` and a PR for meaningful work. Do not commit directly to `main`. Validate before opening the PR, then return evidence to the Product Orchestrator for independent review and release acceptance. Do not self-accept or merge this implementation workstream.
- Choose the smallest useful next release. Roadmap entries do not independently authorize implementation; stop or collapse work when evidence shows duplication or poor value.

## Release 0.2 scope

Release 0.1's documentation foundation is accepted. The bounded Release 0.2 dispatch permits domain/wire contracts, canonical schemas, deterministic helpers, clearly synthetic fixtures, contract tests, and minimal project/build/test scaffolding. It permits a least-privilege repository-local CI check using included capacity and no secrets. Do not add persistence/databases/migrations, ingestion, provider access, API servers/routes, authentication/authorization middleware, UI, or deployment configuration. Do not proceed into Release 0.3.

Before any functional/runtime merge, establish the separately governed, enforceable public-repository branch/ruleset and applicable CI baseline. This workstream does not authorize account/security setting changes. An implementation PR may be prepared while Product ORCH1 reconciles that merge prerequisite separately.

## Persistent boundaries

- This is a public repository: publish only safe architecture and, in authorized later releases, clearly synthetic fixtures. No customer evidence, real customer names as test data, client analytics, PHI, CUI, private vendor payloads, confidential business records, private account identifiers, credentials, tokens, API keys, or production secrets.
- Keep private runtime evidence outside public GitHub. `.gitignore` is not a security control and does not replace review of the staged diff.
- No software license grant: do not add `LICENSE`, `COPYING`, license text, or metadata granting a license without separate authority. Public visibility is not an OSS license.
- No paid dependency, paid infrastructure, purchase, billing enablement, or overage without separate authorization. A future bounded proof targets $0 incremental recurring cost, subject to measurement and verification.
- No cloud deployment before the separate Release 1.0 gate. No customer deployment, customer portal, runtime AI/BYOK, or autonomous production mutation under this boundary.
- Sensor credentials and read capability never imply write authority. Recommendation acceptance does not itself authorize production changes. Use separately approved execution mechanisms; do not create a parallel autonomous GitHub writer.
- Preserve trusted tenant context at future application/persistence boundaries. Object IDs alone never authorize access. Future functional releases require adversarial synthetic second-tenant tests for list, read, update, correlate, approve, export, remeasure, and delete operations.
- Preserve provenance and history, distinguish evidence/inference/recommendation/action/measurement/outcome, and never convert missing data to zero. Preserve `observed(value)`, `unknown(reason)`, `unavailable(reason)`, `not_collected(reason)`, and `not_applicable(reason)`.
- Keep WQT and ZeroRank replaceable sensors. Provider observations and scores are evidence, not authoritative LDW conclusions. Do not rebuild their commodity sensing or propose a universal proprietary G.A.S. score.

## Validation and handoff

Use Node 24 and the committed npm lockfile. Run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run check`, and `git diff --check`. Inspect the complete diff and generated schemas; verify documentation links, synthetic fixtures, privacy, dependency licenses/advisories, and scope. If CI exists, confirm it passes on the final head. Keep checks deterministic and local; never require provider credentials or live services. Do not install a formatter/linter solely for cosmetic changes.

Keep portable Zod wire schemas free of hidden transforms/refinements; cross-field checks belong in `src/domain/validate.ts` and must be documented separately from JSON Schema. Use `parseContract` at the application contract boundary. Unknown fields and unsupported versions fail closed; additions need deliberate version support and tests. Never infer trusted tenant authority from successful parsing or hashing. See [contract guide](docs/contracts.md).

Report the starting revision, final head, changed files, validation results, PR, exclusions, cost/security impact, and unresolved issues to the Product Orchestrator. Do not advance to the next release without a bounded dispatch.
