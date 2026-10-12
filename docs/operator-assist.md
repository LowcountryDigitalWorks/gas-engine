# Release 0.21 Evidence-Grounded Operator Assist Pack — candidate

Release 0.21 is a bounded **candidate** under Issue #88. Releases 0.1–0.20 remain the accepted baseline until Product review, independent review, merge, and post-merge verification complete.

## Purpose

Release 0.21 creates a provider-neutral interchange and validation seam for optional external human/AI review without putting an AI runtime inside G.A.S.:

```text
original accepted Release 0.15 producer input
  -> authoritative ServiceBrief recomputation
  -> bounded OperatorAssistPacket
  -> external reviewer outside G.A.S. runtime
  -> strict exact-packet advisory validation
  -> visibly untrusted read-only JSON/HTML
  -> independent HUMAN review through the accepted Release 0.16 path
```

G.A.S. performs no model/provider call. This release does not authorize a provider credential, API key, browser automation, prompt runner, model router, agent loop, scheduler, listener, cloud resource, customer-data upload, or production action.

## Trusted input and authority

`createOperatorAssistPacket(...)` requires an already-issued valid `TenantContext`, the accepted repositories required by `assembleServiceBrief(...)`, the **original strict Release 0.15 service-brief request**, and one strict Release 0.21 assist policy. The context is validated at the Release 0.21 entry point even when a source request does not require repository reads.

The function recomputes Release 0.15 internally. A caller-created or mutated `ServiceBrief` is not accepted as input. Tenant/site/scope/target authority remains owned by accepted boundaries; packet IDs, attention IDs, evidence references, URLs, hashes, reviewer labels, and advisory prose are selectors or provenance only.

Optional inclusion filters may bound exact accepted attention IDs, modules, or kinds. They cannot manufacture an attention ID and they never mean priority.

## OperatorAssistPacket

The packet is application-local and intentionally has no canonical public JSON Schema. Its deterministic ID binds:

- packet version and explicit assist policy;
- exact recomputed `serviceBriefId`;
- exact trusted scope/target and source generation time;
- included attention semantics;
- packet-local evidence-reference mapping;
- source readiness, provenance, and limitations;
- fixed reviewer-instruction version;
- explicit non-authority/order semantics.

It does **not** bind pretty formatting, filesystem paths, HTML/CSS bytes, or external advisory prose.

### Exact packet-local evidence references

Material supplied facts receive deterministic opaque `evidence:<sha256>` references. References cover:

- included Release 0.15 attention facts;
- fixed module readiness entries;
- supplied source/provenance manifest entries;
- source limitations.

Each included attention item retains its own exact attention-fact reference plus applicable readiness/provenance references. A reference is not authority. Packet integrity verification recomputes every reference and fails closed if a reference or semantic fact is altered or points outside the exact packet.

### Reviewer instructions

Reviewer instructions are fixed trusted application policy (`1.0.0`) and are never derived from evidence text. They permit summarization, hypotheses, contradictions/missing-evidence notes, human questions, and optional draft recommendation **options**. They require exact packet references and explicit uncertainty/human validation.

They do not grant authority to establish causality/business impact/canonical priority, change scope/evidence, create a canonical recommendation/outcome, execute a provider/CMS/site change, publish content, or make customer commitments.

Evidence strings are inert payload and cannot rewrite these instructions.

## External advisory boundary

`validateOperatorAssistAdvisory(...)` accepts one strict application-local external advisory bound to exactly one `assistPacketId`. The advisory may contain:

- an optional external summary;
- up to 32 suggested review candidates;
- up to 32 hypotheses;
- up to 32 questions for a human;
- up to 16 external draft recommendation options;
- up to 64 external limitations;
- bounded caller-supplied reviewer provenance.

Every review candidate references an exact packet attention ID and at least one packet-local supporting evidence reference. Hypotheses and draft options are likewise evidence-referenced. Duplicate/unknown references, wrong packet IDs, unknown fields/versions, contradictory support-vs-contradiction reference use, malformed structure, or overflow fail closed.

Validation proves only that the structure is accepted and references resolve to the exact packet. It does **not** prove factual correctness, causality, completeness, priority, business impact, recommendation approval, provider/model identity, or execution safety.

Reviewer provenance (`human | ai | other`, provider/product label, model label, time, method label/version) is caller-supplied descriptive provenance only. It is not authenticated identity.

## Human authority remains Release 0.16 / 0.8

The 0.21 proof is read-only. There is no advisory-to-decision or advisory-to-recommendation write path.

A human must independently:

1. inspect the advisory;
2. choose what attention item(s) deserve review;
3. use the existing accepted Release 0.16 human decision path;
4. explicitly author/adopt/modify any recommendation content;
5. preserve accepted Release 0.8 `authorityClass = internal_review` and `priority.level = unassessed` semantics;
6. explicitly use existing measurement/outcome flows when warranted.

No external advisory order becomes canonical G.A.S. priority.

## Read-only rendering

`renderOperatorAssistAdvisoryHtml(...)` renders only an already validated advisory and exact packet. It rechecks packet/advisory integrity before rendering and prominently states:

> **EXTERNAL / AI ADVISORY — UNTRUSTED — HUMAN REVIEW REQUIRED**

The document is standalone, deterministic, print-friendly, escaped, no-JavaScript, no-form, no-external-asset, no-network presentation with restrictive CSP. URLs and external prose are rendered as inert text, never action links or markup.

## Bounds

Release 0.21 fails closed rather than truncating or paging:

- packet attention items: maximum 128;
- packet-local evidence refs: maximum 512;
- review candidates: maximum 32;
- hypotheses: maximum 32;
- human questions: maximum 32;
- draft options: maximum 16;
- advisory limitations: maximum 64;
- one advisory prose field: maximum 8,000 UTF-8 bytes;
- packet JSON: maximum 1,500,000 UTF-8 bytes;
- validated advisory JSON: maximum 750,000 UTF-8 bytes;
- advisory HTML: maximum 1,500,000 UTF-8 bytes.

The explicit assist policy may set lower packet limits but cannot exceed these ceilings.

## Synthetic preview

Run:

```sh
npm run preview:operator-assist
```

The preview uses only public-safe `example.test` synthetic source inputs and performs:

```text
accepted Release 0.15 source inputs
  -> recomputed ServiceBrief
  -> deterministic assist packet + JSON
  -> synthetic external advisory containing script-shaped inert prose
  -> strict reference validation
  -> deterministic advisory JSON
  -> escaped static advisory HTML
  -> explicit HUMAN Release 0.16 next-step note
```

Generated artifacts remain under ignored `local-artifacts/`. The preview calls no AI model or provider.

## Explicit exclusions

Release 0.21 adds no model SDK, runtime LLM, provider network path, BYOK/API-key handling, embeddings/vector DB, browser automation, prompt runner, model router, server/listener, scheduler, persistence/table/migration, canonical public wire schema, durable advisory store, automatic severity/priority/business-impact score, automatic recommendation/outcome/action, CMS/provider/site mutation, cloud deployment, customer/private evidence, paid service/dependency, Issue #49 implementation, Issue #56/#81 implementation, or Release 1.0 implementation.

See [ADR 0021](decisions/0021-evidence-grounded-operator-assist.md), [Release 0.15 service brief](service-brief.md), and [Release 0.16 decision cycle](decision-cycle.md).
