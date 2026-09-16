# ADR 0006 — Deterministic longitudinal evidence diff

- **Status:** Proposed Release 0.7 candidate
- **Decision owner:** Product ORCH1
- **Authority:** Issue #12 — Release 0.7 deterministic longitudinal evidence delta proof — AUTHORIZED

## Context

Accepted Releases 0.5 and 0.6 can produce repeated canonical WQT and ZeroRank observation collections. Requiring an operator to reread every repeated observation does not test the intended value of a longitudinal evidence engine. At the same time, the accepted contracts do not define a universal good/bad direction, severity, materiality, business impact, recommendation priority, or causal policy.

The earlier roadmap shorthand “diff, correlation, prioritization” is therefore too broad for the evidence currently available.

## Decision

Release 0.7 is narrowed to a deterministic longitudinal diff plus non-ranked review-attention classification.

Implement a pure comparator over two canonical evidence snapshots and a thin tenant-safe read service over the existing `EvidenceRepository`. The output is application-local and is not persisted or added to canonical wire contracts.

Before comparing observations, require the two collections to be the same semantic stream: same scope, provider, provider-connection presence/value, adapter, source schema, and full collection method, with distinct collection IDs and non-reversed source periods. Incompatibility is a collection discontinuity, not evidence appearance/disappearance.

Within a compatible stream, match observations only by accepted `cohortIdentityHash`. Duplicate cohort identities in either snapshot fail closed. Use only five delta states: `unchanged`, `changed`, `appeared`, `missing_from_current`, and `coverage_unknown`.

Only `complete` opposite-side collection coverage can establish appeared/missing-from-current. Partial, unavailable, and failed coverage remain `coverage_unknown`.

Preserve exact observation values and missing states. Numeric observed pairs may expose descriptive subtraction only; no quality or business interpretation is attached.

Bound each snapshot to 2,048 observations, equal to the accepted 64-part × 32-observation collection capacity. Preserve the generic repository list cap while allowing collection-filtered reads through the existing method up to that canonical collection ceiling.

## Consequences

This proof can deterministically suppress unchanged evidence from the review-attention set while retaining traceability for every changed or uncertain entry. It does not rank the attention set.

The approach deliberately avoids a new schema/table, migration, repository write method, public endpoint, provider access, cross-provider join, AI call, or persistence format.

A future durable diff contract, correlation model, recommendation policy, UI, or prioritization policy requires separate evidence and authorization.

## Rejected for Release 0.7

- cross-provider or generic correlation;
- subject-only or metric-only weak matching;
- universal G.A.S. score;
- improvement/regression or good/bad interpretation;
- severity, materiality, business-impact, or recommendation priority scoring;
- inference/recommendation/action creation;
- persistence of diff results;
- new DB schema/table/migration;
- HTTP/listener/read endpoint;
- provider/WQT/ZeroRank/Activepieces runtime access;
- runtime AI/BYOK;
- Release 0.8 implementation.

## Acceptance

This ADR remains proposed until Product ORCH1 freezes the exact Release 0.7 candidate, reconciles independent review, and accepts the release. Development does not self-accept or merge it.
