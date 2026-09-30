# ADR 0012 — Explicit-cluster page-focus evidence with mandatory SERP validation

- Status: Proposed for Release 0.12 candidate
- Date: 2026-09-29
- Issue: #40

## Context

Accepted Release 0.10 supplies exact bounded query→page evidence with canonical observations, provenance, freshness and coverage. Competitor workflows commonly turn query overlap or topic clusters into page/content suggestions, but GSC overlap alone does not prove search intent or justify a split/consolidation decision.

The missing G.A.S. proof is a deterministic evidence layer that can summarize one exact page across caller-defined query cohorts while keeping semantic clustering and later SERP interpretation outside the engine.

## Decision

Release 0.12 will:

1. reuse accepted `validateSearchAnalyticsWindow(...)` without a second Search Console validator;
2. analyze exactly one page per invocation;
3. require exactly one explicit application-local cluster assignment for every selected-page query;
4. treat cluster identity as caller-owned inert semantics rather than inferred intent;
5. aggregate exact clicks, impressions, CTR, average-position range, support share and canonical evidence references;
6. use one strict versioned threshold policy;
7. return only `candidate`, `no_candidate`, or `not_ready`;
8. require final, complete, nontruncated, nonanonymized source evidence before a candidate can be emitted;
9. call the highest-impression supported cluster only the `dominantEvidenceCluster`;
10. require separate SERP/result comparison before any intent or content-architecture conclusion;
11. keep the complete result application-local and unpersisted.

## Candidate rule

For ready evidence, a candidate requires:

- page impressions >= the explicit page threshold;
- at least two clusters where both impressions and support share meet the explicit cluster thresholds.

The dominant supported cluster is selected by highest impressions with ascending `clusterId` as deterministic tie-break. Other supported clusters are divergent evidence clusters.

These names describe measured support only. They do not establish primary/correct intent, harmful cannibalization, page purpose, content superiority, or a required action.

## Identity

The report ID binds:

- Release 0.10 collection ID;
- exact page ID;
- sorted queryId→clusterId assignments;
- policy ID/version/thresholds;
- fixed Release 0.12 identity algorithm version.

Display labels are excluded because `clusterId` is the semantic cluster identity.

## Rejected alternatives

- LLM/embedding/fuzzy/regex clustering inside G.A.S.;
- SERP retrieval or scraping in this release;
- using query overlap as automatic split/consolidate advice;
- a proprietary combined rank/focus score;
- selective assignment that silently omits page rows;
- candidate or cluster persistence;
- canonical schema widening;
- automatic recommendation/action creation.

## Security, privacy and cost

Release 0.12 issues no trusted context or grant, calls no provider, stores no credential/token, performs no write, and introduces no runtime AI/cloud resource. Public tests use synthetic page/query/cluster data only. No new dependency or paid service is introduced; incremental recurring cost is $0 under existing included development/CI capacity.

## Acceptance

This ADR remains proposed until Product exact-head review, independent review, required validation, and merge. Development authority cannot mark Release 0.12 accepted.
