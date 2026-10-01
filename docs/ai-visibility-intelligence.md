# Release 0.14 — AI Visibility Intelligence Pack

Status: **ACCEPTED AND MERGED through PR #47**

Issue: [#44 — Release 0.14 — AI Visibility Intelligence Pack](https://github.com/LowcountryDigitalWorks/gas-engine/issues/44)

Accepted baseline is Releases 0.1–0.14 on `main`. This document describes the accepted Release 0.14 boundary.

## Objective

Release 0.14 composes provider-preserving Bing AI Performance evidence and accepted ZeroRank evidence into bounded, deterministic AI-visibility intelligence. It answers descriptive evidence questions without manufacturing a universal AEO/GEO score, provider equivalence, business priority, remediation instruction, or causal conclusion.

Architecture:

```text
SANITIZED BING AI PERFORMANCE EVIDENCE
  -> strict provider-preserving adapter
  -> existing collection/source/observation contracts
  -> Bing application-local sidecar

ACCEPTED RELEASE 0.6 ZERORANK EVIDENCE
  -> accepted Release 0.6 validation/canonical adaptation
  -> bounded application-local ZeroRank visibility projection

CURRENT/OPTIONAL BASELINE PROVIDER WINDOWS
  -> explicit readiness/comparability
  -> within-provider change
  -> provider-specific concentration
  -> narrowly bounded cross-source presence/coverage divergence
  -> optional accepted 0.10 / 0.11 / 0.12 context
  -> deterministic site report
  -> escaped standalone read-only operator HTML
```

## ZeroRank reuse

`analyzeAiVisibility(...)` accepts ZeroRank only as the sanitized artifact bytes plus trusted `ZeroRankAdapterConfig`. Inside analysis it synchronously invokes `projectValidatedZeroRankVisibility(...)`, which in turn invokes the accepted Release 0.6 `adaptZeroRankSanitizedEvidence(...)` path before projection. Caller-created or caller-mutated `ZeroRankVisibilityProjection` values are not an analysis input.

Existing Release 0.6 canonical output and fail-closed validation remain authoritative. The internally produced projection exposes only bounded provider-specific fields needed for Release 0.14 reporting. Successful rankings, chats, sources, and source-URL endpoints preserve unknown exhaustion under artifact v1; only prompts can become complete when the accepted pagination predicate proves exhaustion.

ZeroRank visibility, rank, mentions, sentiment, growth, usage, share-style values, and source-URL citation data remain ZeroRank-specific. They are never renamed into Bing metrics.

## Readiness and comparability

Provider evidence remains visible even when it cannot support a finding.

The accepted release distinguishes:
- unavailable source;
- preliminary or processing Bing evidence;
- stale evidence;
- filtered Bing export;
- unknown Bing coverage;
- Bing sampled/aggregated semantics;
- incomplete ZeroRank endpoints;
- incompatible trusted target/scope;
- incompatible periods;
- insufficient comparable windows.

A Bing `complete_export_view` still remains sampled/aggregated evidence.

Within-provider change uses only:
- `increase_observed`
- `decrease_observed`
- `unchanged_observed`
- `not_comparable`

These states are descriptive. They do not mean improvement, regression, success, or failure and do not infer cause.

## Concentration

Explicit caller policy supplies:
- stable policy ID/version;
- `topN` from 1 through 10;
- `concentrationShareThresholdPct`.

Allowed candidate families:
- `bing_page_citation_concentration_candidate`
- `zerorank_source_url_citation_concentration_candidate`

A candidate preserves numerator, denominator, calculated share, exact top rows, policy, and coverage/sampling context.

It is only an investigation/navigation candidate. It is not severity, authority, ranking, quality, or business priority.

Denominator-dependent ZeroRank concentration is omitted unless the relevant source-URL endpoint is explicitly complete. Filtered/unknown/limited evidence does not become a denominator.

## Cross-source comparison

Raw metric magnitudes are never compared across Bing and ZeroRank.

`cross_source_visibility_presence_divergence_candidate` is allowed only when the trusted targets are compatible and each provider can independently establish a concrete presence state. Positive evidence may establish `present`; only provider-specific complete zero/absence semantics may establish `absent`.

Unknown is not absent. Filtered Bing evidence is not absent. A sampling gap is not absent. An incomplete ZeroRank endpoint is not absent. A missing row is not absent unless accepted provider completeness semantics prove it.

`cross_source_cohort_coverage_divergence_candidate` requires an explicit caller-supplied mapping between an exact Bing grounding-query identity and an exact ZeroRank prompt ID. There is no fuzzy matching, embedding, runtime LLM, inferred intent mapping, or automatic semantic equivalence.

A divergence never declares either provider correct.

## Optional accepted context

Release 0.10 Search Analytics may attach descriptive exact-page context. A missing matching row is `not_observed`, not zero traffic.

An already-valid Release 0.11 change/outcome cohort may attach only when exact trusted scope/page linkage matches.

An already-valid Release 0.12 page-focus report may attach only for exact trusted scope/page linkage.

These optional contexts do not change Release 0.14 finding identities or states. Change correlation does not establish causation, and page-focus context does not become a content action.

## Operator report

The Release 0.14 renderer is:
- standalone static HTML;
- deterministic and bounded;
- all dynamic data HTML-escaped;
- restrictive CSP;
- no JavaScript;
- no external assets;
- no listener/server;
- no forms/write controls;
- print friendly.

It visibly separates:
- BING
- ZERORANK
- CROSS-SOURCE
- TRADITIONAL SEARCH CONTEXT
- CHANGE/OUTCOME CONTEXT
- PAGE-FOCUS CONTEXT

No health, severity, priority, remediation, publishing, or execution controls are emitted.

## Validation

`npm run check` includes Release 0.14 typecheck/build/tests/schema-drift proof and the synthetic AI-visibility preview under the existing no-network test preload and Node permission boundary.

Public Release 0.14 evidence is synthetic only.

No canonical schema, persistence migration, runtime network, provider credential, AI runtime, new dependency, cloud resource, or paid service is introduced.

Incremental recurring cost remains **$0** for this accepted bounded release.

Release 0.15 remains explicitly outside the accepted Release 0.14 boundary and requires separate authorization.
