# ADR 0022 — Measurement Interpretation & Claim Ceilings

- **Status:** Candidate — Release 0.22 / Issue #110; Product acceptance pending exact-head review.
- **Decision date:** 2026-10-22
- **Accepted baseline:** Releases 0.1–0.21 at `18856f506ff62bfffcd9f76eddafe360623112d4`.

## Context

Release 0.8 records canonical measurements and human-declared outcomes. Release 0.11 composes accepted Search Analytics change readiness. Neither provides a reusable provider-neutral application-local interpretation of design strength, exposure state, method continuity, and explicit claim ceilings. Issue #110 authorizes only this bounded primitive.

## Decision

Add `interpretMeasurement`, a strict, pure/local function over exactly two canonical Release 0.8 measurement records plus bounded caller-supplied design, exposure, method, quality, and optional external-result context. It reuses existing canonical measurement/cohort semantics and fails closed when canonical comparison is unknown or discontinuous. It returns a deterministic profile ID, the canonical records and supplied context, a comparability projection, readiness, one enum claim ceiling, fixed allowed/prohibited claim codes, and reason/limitation codes.

The identity binds the complete semantic input, including design, exposure, method/provider/model/location/prompt/entity context, canonical measurement values, quality flags, and external-result provenance. Only observation ordering is normalized because those entries are unordered. The profile does not recalculate external statistics.

## Claim policy

Temporal and normalized associations remain noncausal. Matched-control evidence is capped at `controlled_effect_consistent`. Randomized/balanced or provider-native experimental evidence requires comparable canonical measurements, continuous method/cohort identity, sufficient exposure, balanced/randomized cohort declaration, and a caller-accepted external result to reach `bounded_experimental_effect_consistent`. AI referral and prompt-cohort designs have separate narrow ceilings. Changed identity, unknown comparability, weak exposure, or material source-quality limitations lower or block the ceiling deterministically.

Every result prohibits causal attribution, business/revenue causality, universal visibility, cross-provider equivalence, and automatic recommendation/action. It creates no canonical outcome or decision authority.

## Boundaries

No canonical JSON schema, persistence, migration/table, provider/network runtime, crawler, prompt runner, scheduler, AI runtime, score, recommendation, approval, action, or report/run contract expansion. Release 0.8 measurements/outcomes, Release 0.11 search-change semantics, and Release 0.16 human decision authority remain unchanged. Synthetic fixtures only; incremental cost `$0`.

## Review status

This ADR documents a candidate implementation only. Product semantic review, independent exact-head review, required hosted checks, and release acceptance remain pending.
