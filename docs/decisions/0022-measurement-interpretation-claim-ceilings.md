# ADR 0022 — Measurement Interpretation & Claim Ceilings

- **Status:** ACCEPTED — Release 0.22 / Issue #110; merged on `main` through PR #112 at commit `d69fb468c934aae41687b8d8f927ec2381cfcca9` and tree `4f8418391ea3941e19691d85d920f54ceb8a6b92`.
- **Decision date:** 2026-10-22
- **Accepted baseline:** Releases 0.1–0.22.

## Context

Release 0.8 records canonical measurements and human-declared outcomes. Release 0.11 composes accepted Search Analytics change readiness. Neither provides a reusable provider-neutral application-local interpretation of design strength, exposure state, method continuity, and explicit claim ceilings. Issue #110 authorizes only this bounded primitive.

## Decision

Add `interpretMeasurement`, a strict, pure/local function over two primary canonical Release 0.8 measurement records plus bounded caller-supplied design, exposure, method, quality, and optional external-result context. Matched and experimental ceilings additionally require two canonical measurements per arm, tied to distinct control/test cohorts, valid baseline/follow-up relationships, comparable cohorts, aligned windows, and consistent provider/metric/method identity. An external experiment result must bind to those exact four measurement IDs and method provenance. AI-referral claims require an explicit `ai_referral_acquisition` metric class. It reuses existing canonical measurement/cohort semantics and fails closed when canonical comparison is unknown or discontinuous. It returns a deterministic profile ID, the canonical records and supplied context, a comparability projection, readiness, one enum claim ceiling, fixed allowed/prohibited claim codes, and reason/limitation codes.

The identity binds the complete semantic input, including design, exposure, method/provider/model/location/prompt/entity context, canonical measurement values, quality flags, and external-result provenance. Only observation ordering is normalized because those entries are unordered. The profile does not recalculate external statistics.

## Claim policy

Temporal and normalized associations remain noncausal. Matched-control evidence requires coherent concurrent canonical control/test arms to reach `controlled_effect_consistent`. Randomized/balanced or provider-native experimental evidence additionally requires sufficient exposure, balanced/randomized cohort declaration, and a caller-accepted external result bound to the arm IDs and method to reach `bounded_experimental_effect_consistent`. AI referral requires explicit referral-acquisition metric semantics; prompt-cohort designs have a separate narrow ceiling. Changed identity, unknown comparability, weak exposure, or material source-quality limitations lower or block the ceiling deterministically.

Every result prohibits causal attribution, business/revenue causality, universal visibility, cross-provider equivalence, and automatic recommendation/action. It creates no canonical outcome or decision authority.

## Boundaries

No canonical JSON schema, persistence, migration/table, provider/network runtime, crawler, prompt runner, scheduler, AI runtime, score, recommendation, approval, action, or report/run contract expansion. Release 0.8 measurements/outcomes, Release 0.11 search-change semantics, and Release 0.16 human decision authority remain unchanged. Synthetic fixtures only; incremental cost `$0`.

## Review status

This ADR documents an accepted release. Product exact-head review passed, post-merge Contracts run #470 / 39906956428 succeeded, Security Baseline run #11 / 39906956779 succeeded, and independence-clean review completed via business-operations#667 (review id `gas-110-pr112-91eb424c-correction-ir-v1`, disposition ACCEPT via PR business-operations#668).
