# ADR 0011 — Application-local search change annotation and outcome-cohort composition

- Status: Proposed for Release 0.11 candidate
- Date: 2026-09-29
- Issue: #37

## Context

Accepted Release 0.10 can reconstruct exact bounded Google Search Console-style observations and compare compatible windows. Accepted Release 0.8 can persist explicitly selected canonical measurements and later human-declared outcomes. The missing proof is a small composition seam that binds one human/trusted-caller change statement to one exact search cohort without inventing an experiment database, action record, causal model, or second measurement system.

## Decision

Release 0.11 will:

1. keep one strict human/trusted-caller annotation application-local and unpersisted;
2. target one Release 0.10 baseline row and one metric per invocation;
3. reconstruct the exact canonical baseline observation and prepare an existing Release 0.8 baseline measurement;
4. model no-follow-up states as canonical `not_due` or `not_measured` records without scheduling;
5. reuse the accepted Release 0.10 validation and compatibility gate for supplied follow-up evidence;
6. preserve a valid observed follow-up measurement even when freshness/coverage prevents directional assessment;
7. expose explicit `ready_for_human_assessment` versus `not_ready` application state with bounded reason codes;
8. prepare only existing Release 0.8 measurement-service inputs and leave persistence to an explicit caller;
9. keep optional recommendation association selector-only and defer same-scope enforcement to accepted Release 0.8 persistence;
10. never create or infer an outcome automatically.

The dedicated measurement methodology is `ldw-search-change-cohort` version `1.0.0`.

## Consequences

### Benefits

- closes more of the human review → re-measure loop without adding commodity sensing or another datastore;
- preserves exact canonical evidence and accepted tenant/scope authority boundaries;
- keeps missingness, coverage, and human outcome judgment explicit;
- makes pending/not-measured states useful without creating a scheduler;
- allows later explicit Release 0.8 persistence and human outcome history to remain the single authoritative ledger.

### Tradeoffs

- annotations and exact query/page sidecar text must be retained or reconstructed by the caller after restart;
- one invocation handles one row/metric only;
- evidence quality can preserve a measured value while still blocking directional human assessment;
- there is no experiment UI, scheduler, automatic causality, or recommendation/action system.

## Rejected alternatives

- new experiment/annotation/outcome-cohort tables;
- widening canonical measurement/outcome schemas;
- copying Release 0.10 compatibility into a second looser comparator;
- automatically persisting prepared measurements;
- treating absent follow-up rows as zero;
- automatically deriving improved/regressed/unchanged;
- upgrading attribution from numeric movement;
- provider polling or scheduled remeasurement inside G.A.S.

## Security and cost

The composition does not issue `TenantContext`, create grants, access provider credentials, call provider networks, persist automatically, or introduce runtime AI/cloud resources. Public tests remain synthetic. No new dependency or paid service is introduced; incremental recurring cost is $0 under existing included development/CI capacity.

## Acceptance

This ADR remains proposed until Product exact-head review, independent review, required validation, and merge. Development authority cannot mark Release 0.11 accepted.
