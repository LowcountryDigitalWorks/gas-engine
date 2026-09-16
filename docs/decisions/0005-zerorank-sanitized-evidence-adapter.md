# ADR 0005 — Adapt sanitized ZeroRank evidence; keep sensing and credentials upstream

- Status: Accepted — Release 0.6
- Date: 2026-09-15
- Accepted on `main`: `016730cd17059a47af613fe127a192865f598da4`
- Decision scope: bounded ZeroRank sanitized-evidence adapter proof

## Context

Automation & Agent Operations already owns the credentialed read-only ZeroRank sensing path in business-operations #173. Published flow `LDW #173-ZR — ZeroRank Proof Intake` uses the `zerorank_read_only` credential and Step 9 emits a deterministic sanitized `ldw.zerorank-evidence.v1` minor-0 artifact. G.A.S. needs to preserve that evidence in its provider-neutral contracts without duplicating polling, receiving the vendor credential, coupling to Activepieces runtime code, or inventing stronger vendor semantics than the proven artifact contains.

Product ORCH1 Issue #9 records the exact Step 9 structural contract: closed root/envelopes and request/pagination surfaces; exact row allowlists; optional/null source-preserved row values; explicit open nested passthrough fields; endpoint completeness predicates; and the trusted timing/provenance decision.

## Decision

Implement one pure/local adapter in `src/adapters/zerorank.ts` that accepts exact sanitized artifact bytes plus explicit trusted caller configuration. Support only `ldw.zerorank-evidence.v1` minor `0`; future artifact minors require deliberate review.

The adapter:

- parses only the inner artifact object and rejects the Activepieces `{artifact,meta}` wrapper;
- uses strict closed structural schemas for all closed Step 9 surfaces while retaining only the four explicitly open nested passthrough values as opaque JSON evidence;
- validates exact hardcoded request metadata so source API path/day/limit drift fails closed;
- treats artifact workspace and target as match data, never authority;
- reconciles successful endpoint workspace `id` and optional `name` projections with root `workspace` before trusted workspace matching;
- requires usable unique stable row IDs and normalizes row order deterministically;
- splits the artifact into five endpoint collections under provider `zerorank`;
- maps only the Issue #9-approved vendor fields after exact runtime JSON type checks and never coerces scalar values;
- keeps zero distinct from null, absent, wrong type, and unknown endpoint remainder;
- maps proven-complete prompts to canonical complete, unknown-exhaustion success to partial without expected count, and endpoint failure to explicit unavailable rather than empty success;
- uses trusted canonical timing with a point source window at `observedAt`;
- derives deterministic G.A.S. collection/idempotency identity and uses the collection ID as observation provenance `runId`;
- retains optional upstream run/start/end only in source semantic material and never lets them override trusted timing;
- hashes deterministic canonical source slices and opaque passthrough content without executing or interpreting it;
- packs whole source units byte-aware into existing `CollectionBatch` limits and validates every final part;
- performs no provider network call, Activepieces runtime call, credential handling, tenant-authority issuance, persistence, listener, cloud deployment, runtime AI, recommendation/action work, or Release 0.7 correlation.

Adapter identity is `ldw-zerorank-sanitized` mapping version `1.0.0`; source schema reference is `ldw.zerorank-evidence` `v1.0`. Package release `0.6.0` remains a separate lifecycle version.

## Consequences

ZeroRank remains a replaceable upstream sensor and G.A.S. gains deterministic canonical evidence without duplicating commodity sensing or creating a second credential path. Provider ranking/visibility/sentiment/citation values remain vendor evidence, not universal LDW scores or automatic recommendations.

Unknown endpoint remainder stays explicit. `days=7` remains request configuration only. Chat `aiModel` is comparison context, promptId is only a bounded proven prompt relationship, sourceDomain is weak, brandIds are opaque, and urlCount is never silently coerced.

Failed endpoint envelopes produce an explicit zero-source `unavailable` G.A.S. collection. This retains collection/failure provenance while preventing a failed read from looking like successful zero evidence.

Source integrity and semantic collection hashes are deterministic references, not proof of authenticity or authority. The public repository uses synthetic fixtures only; private runtime artifacts remain outside GitHub.

No dependency or SQL migration is added. Incremental recurring cost is $0. No software license grant, tag, npm publication, provider mutation, or cloud resource is created.

## Rejected alternatives

- **Build a ZeroRank poller/client in G.A.S.** Rejected as duplicate sensing and credential expansion.
- **Call Activepieces at runtime.** Rejected; Release 0.6 consumes an already-emitted artifact only.
- **Accept unknown future artifact minors.** Rejected because parser, missingness, identity, and completeness depend on the exact Step 9 contract.
- **Use semantic field names as type guarantees.** Rejected; Step 9 preserves source JSON values without coercion/type validation.
- **Convert null/absent/wrong type/unknown remainder to zero.** Rejected because it creates false evidence.
- **Treat sourceDomain/brandIds/urlCount as stronger relationships or numeric facts.** Rejected because current evidence does not prove those semantics.
- **Require Activepieces run lifecycle metadata.** Rejected; trusted G.A.S. timing and deterministic G.A.S. run identity are the accepted boundary.
- **Combine vendor fields into a universal G.A.S. score or recommendation.** Rejected as unsupported semantics and Release 0.7+ scope expansion.