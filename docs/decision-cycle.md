# Release 0.16 Human Decision & Measurement Cycle Pack

**Status: CANDIDATE / NOT ACCEPTED**

Release 0.16 closes the next internal managed-service loop over the accepted Release 0.15 service brief while preserving human authorship and accepted Release 0.8/0.11 semantics. It is an application-local internal work-cycle layer. It adds no canonical wire schema, new persistence, provider networking, scheduler, task system, production action, runtime AI, cloud resource, customer portal, or paid service.

## Flow

```text
recomputed accepted Release 0.15 service brief
  -> exact human attention selection
  -> human decision statement
  -> optional human-authored canonical Release 0.8 recommendation
  -> optional accepted Release 0.11 Search Change measurement plan
  -> explicit accepted Release 0.8 measurement recording
  -> deterministic follow-up readiness
  -> explicit human-declared Release 0.8 outcome
  -> deterministic Decision Cycle Dossier JSON + static HTML
```

## Trust boundary

`prepareDecisionCycle(...)` receives accepted evidence/review repositories, an already-issued trusted `TenantContext`, and one strict Release 0.16 request.

The request carries original bounded Release 0.15 producer input under `serviceBriefRequest`. Release 0.16 always calls `assembleServiceBrief(...)` itself. A caller-created or caller-mutated `ServiceBrief` is not an accepted Release 0.16 input surface.

The recomputed brief must belong to the trusted tenant context. Human-selected attention IDs must exist in that exact recomputed brief, be unique, remain within the configured bound, and preserve their Release 0.15 module/kind/state/evidence identities.

Selection means only that a human chose to review the item. It is not priority, severity, materiality, or business impact.

## Human decision

The application-local decision statement has a stable caller-supplied ID, one human-declared disposition (`investigate`, `recommend`, `defer`, or `dismiss`), human-authored summary, recorded time, exact selected attention IDs, and optional exact references already present in those selected items.

Release 0.16 never infers disposition.

## Recommendation integration

An optional recommendation candidate is allowed only for a human `recommend` decision. It must satisfy accepted Release 0.8 creation rules:

- canonical recommendation 1.0;
- exact decision scope;
- revision 1 / `proposed`;
- `authorityClass = internal_review`;
- `priority.level = unassessed`;
- canonical observation evidence only.

During preparation, observation references are independently resolved through the tenant-safe EvidenceRepository. Release 0.15 attention/finding IDs are not canonical observation evidence.

Preparation is read-only. `commitDecisionRecommendation(...)` is a separate explicit human write operation and delegates to accepted `createHumanRecommendation(...)`. Recommendation acceptance creates no production action.

Explicit lifecycle/content changes continue through accepted Release 0.8 transition/revision services and expected-current-revision protection.

## Search Change measurement planning

Release 0.16 supports at most one optional Search Analytics change/measurement plan per decision cycle by calling accepted `composeSearchChangeOutcomeCohort(...)`.

It preserves the accepted Release 0.11 annotation, exact baseline row/metric, due window, prepared baseline/follow-up measurements, evidence quality/missingness, readiness reasons, recommendation association, and no-causality/no-auto-outcome semantics.

No generic measurement methodology is invented for Discovery Diagnostics, AI Visibility, Page Focus, or other modules.

## Explicit measurement and outcome writes

`commitDecisionMeasurement(...)` records exactly one prepared Release 0.11 measurement at a time through accepted `recordMeasurement(...)`. There is no multi-write pseudo-transaction or compensating rollback framework.

`commitDecisionOutcome(...)` delegates to accepted `recordHumanOutcome(...)`. The human supplies direction, rationale, and allowed attribution. Directional outcomes still require accepted comparable baseline/follow-up measurements. Numeric movement never chooses the outcome direction.

## Readiness

The dossier exposes one deterministic direct-state projection, including:

- deferred_or_dismissed;
- recommendation_not_created;
- recommendation_proposed / in_review / accepted / rejected / superseded;
- measurement_not_planned;
- measurements_not_recorded;
- follow_up_not_due;
- follow_up_not_measured;
- follow_up_not_comparable;
- follow_up_not_ready;
- ready_for_human_assessment;
- outcome_recorded.

These are direct projections of the human decision, accepted recommendation lifecycle, accepted Release 0.11 readiness, and persisted Release 0.8 measurements/outcomes. They are not health, quality, success, or impact scores.

## Decision Cycle Dossier

The application-local dossier includes:

- exact Release 0.15 source brief identity;
- exact selected attention;
- human decision;
- optional recommendation candidate/current state/history;
- optional accepted Release 0.11 measurement plan;
- persisted measurements;
- persisted human outcomes;
- deterministic readiness;
- compact provenance;
- authority notes and limitations.

The dossier ID canonically binds all emitted cycle semantic state except the ID itself. Generated authority/limitation wording, presentation bytes, CSS, filesystem paths, and generated formatting do not define semantic identity. The underlying authority and limitation rules remain enforced by the structured cycle semantics and accepted service boundaries. If emitted semantic state exceeds the existing bounded canonical-hash limits, identity construction fails closed rather than weakening the binding.

## Bounds

- selected attention items: <= 32;
- decision references: <= 64;
- JSON dossier: <= 1,500,000 UTF-8 bytes;
- HTML dossier: <= 2,000,000 UTF-8 bytes.

Configured selected-attention policy may choose a lower ceiling. Overflow fails closed; there is no silent truncation.

## Static HTML

`renderDecisionCycleDossierHtml(...)` emits one standalone escaped printable report covering decision context, source brief, selected attention, human decision, recommendation history, measurement plan, readiness, recorded measurements, human outcome, provenance, and authority/limitations.

The renderer uses restrictive CSP, no JavaScript, no external resources, no client fetch, no forms/write controls, semantic tables/headings, visible focus styles, print CSS, and bounded output.

## Synthetic preview

`npm run preview:decision-cycle` uses only synthetic `example.test` evidence and accepted temporary/local repositories. It demonstrates:

service brief -> selection -> decision -> explicit recommendation creation -> lifecycle progression -> Release 0.11 plan -> one-at-a-time measurement recording -> ready_for_human_assessment -> human outcome -> final JSON/HTML dossier.

No production persistence architecture is added.

## Explicit exclusions

Release 0.16 does not implement a task/project manager, generic annotation/changelog product, statistical testing/significance/forecast engine, automated experiment design, generated recommendation/rationale, priority/severity/business-impact scoring, automatic outcome direction, generic correlation/causality, provider/CMS/IndexNow write, email/SMS/task dispatch, scheduler/background worker, runtime AI/LLM/embeddings, cloud deployment, customer portal/private evidence, Issue #49 internal-link intelligence, or Release 1.0.

Incremental recurring cash target remains $0.
