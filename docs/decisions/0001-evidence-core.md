# 0001 — Evidence Core and Replaceable Sensor Architecture

Status: **Accepted for the bounded internal proof.** This accepts the architectural direction; Release 0.1 supplies documentation only. It does not accept an implementation or authorize later release execution or deployment.

## Context

LDW needs to reconcile Generative / Answer / Search evidence across tools, preserve provenance and history, prioritize useful work, support human-reviewed recommendations, and measure outcomes. WQT already provides site-side technical/Search evidence, and ZeroRank provides Generative observations. Rebuilding commodity sensors would duplicate existing capability before the value of a small internal evidence core is established.

The proof is internal managed-service enabling infrastructure using LDW-owned and synthetic evidence only. Public source does not permit public customer/private runtime evidence or grant a software license.

## Decision

Build LDW-specific evidence/provenance/recommendation/outcome intelligence while adapting and reusing replaceable commodity sensors. Do not fork a generic SEO platform.

G.A.S. should own the normalized evidence model, provenance/history, provider-health concepts, cross-sensor correlation, deterministic prioritization, recommendation and human decision state, measurement, outcome history, and compact future operator experience. WQT and ZeroRank remain replaceable evidence providers; their observations and scores do not become authoritative LDW truth.

Keep source/raw evidence, normalized observations, derived inferences, recommendations, actions, measurements, and outcomes distinct. Preserve missing-data states separately from observed zero. Carry trusted tenant context at future application/persistence boundaries; object identifiers alone never authorize access.

Separate read sensors from action adapters. Human acceptance of a recommendation does not automatically authorize production execution. SuiteDash retains client-workflow ownership, Activepieces transports cross-system events where useful, and GitHub retains technical work/review/release evidence and separately governed automation paths.

## Rationale

This concentrates engineering on LDW's reconciliation and decision needs while retaining the ability to change sensors. Traceable evidence and explicit uncertainty make recommendations reviewable and outcome comparisons more credible. Deterministic prioritization supports repeatability without introducing runtime AI or an opaque universal score.

Tenant boundaries and sensor/action separation constrain the design before functional development. A small, evidence-driven proof allows LDW to stop or simplify if it fails to reduce meaningful labor.

## Alternatives considered

| Alternative | Assessment |
| --- | --- |
| Fork a generic SEO platform or rebuild crawling/sensing | Duplicates WQT and provider capabilities, expands maintenance, and distracts from evidence reconciliation. Rejected. |
| Make a single vendor score the canonical LDW truth | Couples interpretation to one provider and hides provenance, uncertainty, and conflicting observations. Rejected. |
| Store durable G.A.S. truth only in workflow automation | Confuses event transport with evidence history and decision ownership. Rejected. |
| Continue manual reconciliation with existing tools | Remains a valid fallback if the bounded proof does not demonstrate enough labor reduction or recommendation value. |

## Consequences

Adapters and normalization will require careful versioning, explicit missing-data semantics, and historical provenance. Future releases must prove tenant isolation with adversarial synthetic second-tenant tests and keep evidence content untrusted. There is additional integration work, but no requirement to build every proposed release or deferred component.

Cloudflare Workers, D1, and static operator assets are candidates only. $0 incremental recurring cost is the bounded-proof target, subject to measurement and verification before the separately gated Release 1.0 deployment. This ADR creates no runtime, dependency, paid service, or deployment.

## Explicit non-goals

- Customer SaaS, self-service software, customer evidence, customer deployment, or a customer portal.
- A generic crawler, scraper/browser farm, generic SEO suite, ZeroRank clone, CRM, or workflow engine.
- A universal proprietary G.A.S. score, public pricing, SLAs, or ranking/citation/traffic/lead guarantees.
- Runtime AI/BYOK, autonomous external remediation, or a parallel autonomous GitHub writer.
- Final contracts, schemas, API definitions, database implementation, licensing grants, or cloud deployment in Release 0.1.

The [architecture](../architecture.md) defines the baseline; [authorization](../authorization.md) governs scope and the [roadmap](../roadmap.md) describes later proof steps.
