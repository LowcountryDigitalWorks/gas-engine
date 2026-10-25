# Measurement Interpretation Profile — Release 0.22 accepted

Release 0.22 is **accepted and merged on `main` through PR #112** at commit `d69fb468c934aae41687b8d8f927ec2381cfcca9` and tree `4f8418391ea3941e19691d85d920f54ceb8a6b92` (Product exact-head PASS, post-merge Contracts run #470 / 39906956428 SUCCESS, Security Baseline run #11 / 39906956779 SUCCESS, and independence-clean review ACCEPT via PR business-operations#668).

It adds a pure/local deterministic profile over two existing canonical Release 0.8 measurements and caller-supplied design, exposure, method, and source-quality context. The profile returns one bounded claim ceiling, enumerated allowed/prohibited claim codes, and explicit reason/limitation codes. It does not change measurements or write an outcome.

## Contract

Use `interpretMeasurement(input)` from `src/analysis/measurement-interpretation.ts`. Input is strict JSON-compatible data, capped at 65,536 canonical UTF-8 bytes. Unknown fields, malformed canonical measurements, unsupported values, or oversized input fail closed with `invalid_input`. The deterministic output is capped at 131,072 bytes and returned as a detached plain object.

The required design classes are `annotated_pre_post`, `normalized_pre_post`, `group_pre_post`, `matched_control_test`, `randomized_or_balanced_split_test`, `ai_referral_pre_post`, `ai_prompt_cohort_observation`, `provider_native_experiment`, and `other_explicit`. Exposure states are `not_applicable`, `unknown`, `not_yet_exposed`, `partially_exposed`, `sufficiently_exposed`, and `exposure_discontinuous`.

Both primary inputs must be canonical Release 0.8 measurement records in baseline/follow-up order, with the exact follow-up relationship. Canonical cohort identity, declared comparability, measurement methodology, result availability, observed values, chronology, and provider/metric/version/method identity against each corresponding method context remain gates. Caller design labels cannot override them. Controlled and experimental ceilings additionally require four arm-specific canonical measurements: baseline/follow-up for distinct control and test cohorts, each internally comparable with valid relationships, aligned observation windows, identical cross-arm scope/subject/dimensions/method configuration/time-window rules, and matching measurement methodology. The external experiment result must name those exact four IDs in order and match the declared provider/method version. Source/method context includes provider, metric and metric-definition version, method and method version, an explicit metric class, and optional model/location/prompt/entity cohort identities. Its fields participate in profile identity. Measurement observations are normalized by reference and full observation content; invalid duplicate observation references fail closed.

The output carries the exact canonical measurement records, design/exposure/method context, canonical comparability projection, readiness, one claim ceiling, allowed and prohibited claim codes, limitations, and the exact caller-supplied external result when present. The external result is narrowly typed with provider, method/version, statistic name/value, reference, caller acceptance, and exact arm measurement IDs. `statisticValue` remains the supplied string: the profile does not parse, recompute, threshold, or universalize it.

For `ai_prompt_cohort_observation`, both baseline and follow-up method contexts must declare `metricClass: "ai_prompt_observation"`. Each must also supply a bounded positive `promptCount` (1–1,000,000), `promptSamplingCadenceId`, and `promptSamplingCadenceVersion`. `promptCount` is the declared number of prompts in the frozen cohort; cadence ID/version names the declared sampling schedule. These are caller-supplied context fields only; they do not run or verify a prompt sampler. They participate in deterministic profile identity. Missing count/cadence context lowers the ceiling to descriptive observation; changed count or cadence marks the comparison discontinuous.

## Claim ceilings

| Claim ceiling | Meaning |
| --- | --- |
| `not_interpretable` | Canonical comparability or a material identity/relationship gate failed. |
| `descriptive_observation_only` | Describe only exact observations; source quality, exposure, or design context limits stronger interpretation. |
| `temporal_association_only` | Comparable annotated/group pre/post movement may be described in time; exposure does not establish causality. |
| `normalized_association_only` | Comparable movement may be described against an explicitly identified normalization method; no clean cause. |
| `controlled_effect_consistent` | Matched control/test evidence is consistent with an effect under supplied method context; confounders remain. |
| `bounded_experimental_effect_consistent` | Balanced/randomized or provider-native experiment with sufficient exposure and caller-accepted external result; strongest bounded ceiling. |
| `ai_referral_change_only` | Exact AI-referral acquisition metric only; this is not mention/citation visibility. |
| `ai_prompt_cohort_change_only` | Exact frozen provider/model/location/prompt/entity/metric/method cohort only. |

No ceiling states that a change caused an outcome. In particular, `controlled_effect_consistent` and `bounded_experimental_effect_consistent` do not establish business or revenue causality. There is no confidence, SEO, or universal AI visibility score.

## Deterministic safeguards

- Unknown or discontinuous canonical comparability blocks interpretation; caller design cannot upgrade it.
- Changed source/method identity, methodology, provider/model/location, prompt cohort or sampling context, or entity set adds a discontinuity reason and blocks a direct comparison.
- Not-yet, partial, or discontinuous exposure cannot support an effect ceiling. Elapsed time is not exposure readiness.
- Preliminary, partial, truncated, or anonymized source state lowers the result to descriptive observation.
- Prompt-cohort claims require both method contexts to declare `ai_prompt_observation` and to carry the same complete provider, model, location, prompt revision, prompt count, sampling cadence ID/version, entity revision, metric, and method identities. Small cohorts do not receive a universal minimum or generalization.
- AI-referral claims require both method contexts to classify the metric as `ai_referral_acquisition`; other metrics remain descriptive under that design label.
- External statistics remain provider/method evidence and are preserved exactly without statistical computation. An accepted flag alone cannot create experimental evidence.
- Claim and reason arrays are deterministic code sets. No generated prose is authoritative.

## Authority and exclusions

Release 0.11 remains authoritative for its accepted search-change readiness/comparability composition. Release 0.8 remains authoritative for canonical measurements and outcomes. Release 0.16 remains the human decision/outcome authority. A human must record any canonical outcome through those existing flows.

This profile has no persistence, schema, migration, database, network, provider client, crawler, prompt runner, scheduler, runtime AI, recommendation, approval, action, portal, or production side effect. Synthetic fixtures are public-safe. Incremental cost target is `$0`.
