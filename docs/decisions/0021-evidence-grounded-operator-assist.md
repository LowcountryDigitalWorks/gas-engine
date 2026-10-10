# ADR 0021 — Evidence-Grounded Operator Assist boundary

- **Status:** Candidate — Release 0.21 / Issue #88
- **Decision date:** 2026-10-07
- **Accepted baseline:** Releases 0.1–0.20

## Context

Accepted Release 0.15 already provides a deterministic, provider-neutral service brief with trusted scope/target reconciliation, fixed readiness, an unranked attention register, exact evidence identities, provenance, limitations, and bounded human history. Release 0.16 already owns the explicit HUMAN decision/recommendation/measurement/outcome path.

An external human or AI reviewer can help summarize evidence and draft hypotheses/questions/options, but embedding a model/provider runtime inside G.A.S. would add credentials, network/provider coupling, usage-cost controls, prompt execution, privacy/data-transfer obligations, and an ambiguous authority boundary. It would also duplicate capability already available through separately governed AI surfaces.

## Decision

Release 0.21 will **build only the deterministic interchange, exact-reference grounding, strict validation, and read-only presentation seam**.

G.A.S. recomputes the accepted Release 0.15 `ServiceBrief` from the original producer input under an already-issued valid `TenantContext`. It then emits a bounded application-local `OperatorAssistPacket` containing deterministic exact references to supplied attention/readiness/provenance/limitation facts plus fixed trusted reviewer instructions.

An external reviewer executes outside G.A.S. The returned advisory is always untrusted input. G.A.S. accepts it only through a strict application-local structural/reference validator bound to the exact packet ID and exact packet-local evidence references. A validated advisory remains advisory provenance, not evidence truth or action authority.

Release 0.21 renders the validated result as deterministic read-only JSON and escaped static HTML that visibly states **EXTERNAL / AI ADVISORY — UNTRUSTED — HUMAN REVIEW REQUIRED**.

There is no automatic advisory-to-Release-0.16/0.8 write seam. A human independently chooses what to review and explicitly authors/adopts/modifies any later canonical decision or recommendation through already accepted flows. Existing `internal_review` / `unassessed` recommendation semantics remain unchanged.

## Trust classes

### Trusted application policy

- fixed/versioned reviewer task and authority instructions;
- hard bounds;
- exact-reference validation rules;
- explicit human-authority boundary.

### Trusted existing authority

- already-issued `TenantContext` validated at packet construction;
- accepted repository ownership checks;
- accepted Release 0.15 recomputation and scope/target semantics.

### Untrusted evidence payload

- attention/source/readiness/provenance/limitation content;
- URLs, queries, prompt IDs, labels, hashes, and opaque IDs.

Evidence is inert data and cannot modify trusted reviewer instructions or mint authority.

### Untrusted external advisory

- summaries;
- suggested review order;
- rationales;
- hypotheses;
- uncertainties;
- human questions;
- draft recommendation options;
- provider/model/method provenance labels.

Strict validation establishes only packet/reference integrity. It does not authenticate reviewer labels or establish truth, causality, priority, impact, recommendation approval, or execution authority.

## Deterministic identity

Each packet-local evidence reference hashes the exact semantic fact and reference class. The packet ID binds compact semantic digests for the exact recomputed service brief, trusted scope/target, assist policy, selected accepted attention semantics, evidence-reference mapping, readiness/provenance/limitations, and fixed reviewer-instruction version.

Formatting, filesystem paths, HTML/CSS, and external advisory prose do not affect packet identity.

Validated advisory identity binds exact validated advisory semantic data plus the exact packet ID. It is provenance only.

## Bounds and failure behavior

Release 0.21 uses the Issue #88 ceilings: 128 attention items, 512 evidence references, 32 review candidates, 32 hypotheses, 32 human questions, 16 draft options, 64 limitations, 8,000 UTF-8 bytes per advisory prose field, 1.5 MB packet JSON, 750 KB advisory JSON, and 1.5 MB advisory HTML.

Unknown fields/versions, forged packet IDs, unknown attention/evidence refs, duplicates where prohibited, contradictory support-vs-contradiction use, invalid TenantContext, cross-tenant/scope/target substitution, malformed input, or overflow fail closed. There is no hidden truncation, paging, repair, or best-effort coercion.

## Consequences

### Positive

- External AI/human review can be grounded to deterministic G.A.S. semantics without making a provider/model part of G.A.S.
- Exact references make external advisory claims auditable against one bounded packet.
- Human authority remains explicit and unchanged.
- Provider/model choice remains replaceable and separately governed.
- Software proof has $0 incremental recurring cash impact and no external model call.

### Trade-offs

- Release 0.21 does not automate routing to an AI surface.
- Advisory content is not persisted by G.A.S.
- A human must explicitly carry useful draft material into the accepted decision/recommendation flow.
- Structural/reference validation deliberately does not judge whether prose is factually correct.

## Rejected alternatives

### Embed an LLM/provider SDK in G.A.S.

Rejected for 0.21 because it would introduce provider/network/credential/cost/privacy/runtime scope outside the frozen proof and duplicate separately governed execution surfaces.

### Trust caller-created ServiceBrief or advisory references

Rejected. Source evidence is recomputed through accepted Release 0.15 and advisory refs must resolve to the exact packet.

### Convert advisory candidates directly into Release 0.8 recommendations

Rejected because it would weaken explicit human authorship and could turn untrusted external prose/order into canonical decision authority.

### Add a new persistence/schema for advisory history

Rejected. The proof is application-local/read-only. Durable advisory storage would require a separate Product decision.

## Explicit non-authority

This ADR does not authorize runtime AI/LLM/model calls, provider SDKs, credentials/BYOK, network clients/listeners, browser automation, embeddings/vector DBs, automated priority/severity/business-impact scoring, automatic recommendation/outcome/action, persistence/schema expansion, external customer evidence transfer, cloud/private deployment, paid services, Issue #49, Issue #56/#81, or Release 1.0.
