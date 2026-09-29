# Release 0.11 — Search Change Annotation & Outcome Cohorts draft candidate

Release 0.11 is a bounded draft candidate under Issue #37. It composes accepted Release 0.10 search evidence with accepted Release 0.8 measurement/outcome history without adding a second experiment, measurement, outcome, or persistence system.

## Purpose

The candidate proves one pure/local application composition:

> HUMAN CHANGE ANNOTATION → EXACT BASELINE SEARCH COHORT → FOLLOW-UP DUE/EVIDENCE STATE → RELEASE 0.10 COMPATIBILITY/COVERAGE → RELEASE 0.8 MEASUREMENT DRAFTS → READY / NOT READY FOR HUMAN ASSESSMENT

It never infers whether a change improved, regressed, remained unchanged, or caused an observed metric change.

## Annotation

One invocation accepts one strict application-local annotation:

- bounded `id`;
- canonical `occurredAt`;
- canonical `recordedAt`;
- non-empty plain-text `summary` up to 512 characters;
- optional `recommendationId` association.

The annotation is a human/trusted-caller statement only. It is not an action, execution receipt, provider observation, authority grant, or tenant context. It is not persisted by Release 0.11.

`annotation.id` is the semantic identity of that human statement. If its material meaning changes, the caller should use a new annotation ID rather than treating edited prose as the same statement.

## Target and baseline

One invocation selects exactly one already-adapted Release 0.10 baseline window, one exact row identity, and one metric: clicks, impressions, CTR, or average position.

The selected row/metric must reconstruct the exact accepted canonical Release 0.10 observation. Its source window must end on or before the annotated change time.

Release 0.11 prepares an existing canonical Release 0.8 measurement with:

- relationship `baseline`;
- the exact canonical observation cohort;
- measured value copied from the canonical observation;
- observed window copied from canonical provenance;
- methodology `ldw-search-change-cohort` / `1.0.0`;
- deterministic ID.

Observed numeric zero remains observed zero.

## Follow-up due and missing evidence

The caller supplies one canonical `dueWindow` whose start is not before the annotated change, plus an `evaluatedAt` timestamp.

With no follow-up evidence:

- evaluation before `dueWindow.start` prepares `not_due`;
- evaluation at or after `dueWindow.start` prepares `not_measured`.

These are measurement records only. No scheduler, polling, provider read, or background work is created.

If a compatible follow-up window is supplied but the exact target row is absent, Release 0.11 prepares `not_measured` and returns `target_missing`. It never manufactures a zero.

## Exact Release 0.10 compatibility

Release 0.11 reuses the accepted Release 0.10 validator and compatibility gate rather than copying a looser comparator. Compatible baseline/follow-up windows must preserve the accepted scope, provider, provider connection, adapter, source schema, method/configuration, property, search type, dimensions, filters, freshness/coverage semantics, window duration, and chronology rules.

The follow-up effective window must begin on or after the annotated change and fit inside the caller-supplied due window.

## Readiness versus measured evidence

A valid follow-up observation can be preserved even when evidence quality is insufficient for human directional outcome assessment.

`ready_for_human_assessment` requires:

- exact compatible Release 0.10 windows;
- the selected baseline and follow-up observations;
- comparable canonical cohorts;
- final data state on both windows;
- complete coverage on both windows;
- no truncation;
- no unresolved anonymization;
- valid chronology.

Otherwise output is `not_ready` with bounded reason codes such as:

- `follow_up_not_due`;
- `follow_up_not_measured`;
- `target_missing`;
- `source_not_final`;
- `coverage_incomplete`;
- `coverage_anonymized`;
- `coverage_truncated`;
- `incomparable`.

A measured but quality-limited observation remains measured. Its canonical measurement comparability is `unknown` or `discontinuous` rather than falsely authorizing a directional outcome.

## Release 0.8 composition

Output contains application-local prepared inputs directly suitable for an explicit later call to accepted `recordMeasurement(...)`:

- canonical `measurement`;
- explicit `cohortObservationId`;
- optional `recommendationId`.

Release 0.11 itself performs no repository writes. The optional recommendation ID is only a selector/association. Existing Release 0.8 same-scope resolution remains authoritative when persistence is explicitly invoked.

Release 0.11 never creates a canonical outcome. If readiness is established, a human/trusted caller may separately use accepted `recordHumanOutcome(...)`; Release 0.8 remains authoritative for human direction and permitted attribution.

## Determinism and sidecar boundary

Package and measurement IDs derive only from bounded semantic identity material: annotation ID, selected row/metric, canonical collection identities, due/evaluation state, role, and methodology version. Annotation summary prose does not participate in methodology identity.

Exact query/page text remains application-local through the accepted Release 0.10 sidecar. Persisted hashes are deterministic identities, not anonymization guarantees. After restart, exact text still requires retaining/re-reading and re-adapting the sanitized Release 0.10 artifact or retaining the adaptation result.

## Security, persistence, and cost

Release 0.11 adds no:

- provider networking, OAuth, credential/token handling, scheduler, worker, listener, or runtime AI;
- canonical schema expansion, migration, table, annotation store, signal store, or outcome-cohort store;
- action/execution authority, automatic recommendation, automatic outcome direction, causality, attribution upgrade, priority, severity, or business-impact scoring;
- customer/private evidence, cloud resource, paid dependency, or paid API.

The public repository uses synthetic evidence only. Incremental recurring cost remains $0 under existing included development/CI capacity.

## Validation

The candidate uses the existing Node 24 locked validation and must keep all Releases 0.1–0.10 regressions green. No generated wire schema changes are expected because Release 0.11 reuses canonical measurement/outcome contracts unchanged.
