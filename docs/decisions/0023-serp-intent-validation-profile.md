# ADR 0023 — SERP Intent Validation Profile

Status: **accepted via gas-engine #120 / PR #121**

## Context

Accepted Release 0.12 deliberately stops at a page-focus divergence candidate and requires separate SERP/result validation before any intent or page-architecture conclusion. Research under #101 found that bounded SERP overlap is useful decision evidence when source, locale, device, time, depth, and methodology remain explicit, but it is not intent truth.

Product froze Release 0.23 in #120 as a synthetic mechanism proof so G.A.S. can validate this semantic seam without a live provider request, DataForSEO credits, a crawler, or a new evidence store. The reviewed candidate was accepted and merged through PR #121 at protected-main `c8405603dc60a8cbf941b45a8361784c938e4fb7`, tree `5c78b2cd1c8a1c003ac8856f0afb03912b4dd7bd`.

## Decision

Implement one pure/local application analysis profile that consumes already-sanitized provider-preserving SERP snapshots and an explicit versioned policy.

The profile:

- validates exact source comparability for provider, method/version, location, language, device, search surface, source-schema version, and bounded observation-time skew;
- requires complete, nonfailed, nontruncated evidence and sufficient actual eligible organic depth;
- treats requested depth and actual eligible organic depth as different facts;
- selects organic rows only for top-K URL comparison;
- uses provider same-type rank when it is supplied consistently, otherwise preserves provider/caller result order;
- deduplicates exact duplicate URL strings only and performs no broad URL canonicalization;
- computes deterministic URL intersection, union, Jaccard, and shared URLs;
- computes supplied registrable-domain overlap separately when available;
- retains typed result-shape counts as descriptive context only;
- supports explicit repeated-snapshot requirements for ambiguous cases;
- emits only `same_result_family_candidate`, `distinct_result_family_candidate`, `ambiguous`, or `not_ready`;
- builds deterministic identity from normalized representative-query selection, policy, source contexts, methodology, and comparison evidence;
- requires human intent/content/business review and carries no automatic page-change authority.

## Why application-local

This capability interprets a bounded set of already-sanitized observations. It creates no durable canonical evidence type and no new lifecycle record. Adding tables, migrations, public schemas, or a provider client would enlarge the authority/security surface without helping the mechanism proof.

The result therefore remains plain deterministic application data and is not persisted by this release.

## URL and domain policy

Exact URL strings are the comparison unit. The profile intentionally does not normalize trailing slashes, query strings, host aliases, redirects, canonicals, or other page equivalence because those transformations could collapse genuinely distinct result pages.

Registrable-domain overlap is weaker and remains separate. Release 0.23 accepts a supplied registrable-domain field when present rather than implementing an incomplete public-suffix parser or adding a dependency merely for this proof.

## Missingness and readiness

Unsafe evidence returns `not_ready`; it never becomes an empty result set or zero overlap. This applies to missing, failed, partial, truncated, insufficient-depth, incompatible-rank, source-mismatch, time-skew, pair-count, and repeated-snapshot failures.

Observed exact zero overlap is valid only when both complete comparable top-K organic sets were actually observed.

## Result-shape boundary

Provider result types outside organic are preserved only as descriptive counts. Their presence cannot change the state classification. This avoids turning SERP features into hidden intent inference.

## Human and action boundary

`humanIntentReviewRequired` and `noAutomaticPageChange` are fixed true outputs. The profile does not emit recommendation, priority, approval, split, merge, consolidation, redirect, canonical, page creation/deletion, rewrite, publishing, or execution authority.

## Consequences

Positive:

- closes the Release 0.12 validation seam with deterministic, reviewable semantics;
- remains provider-neutral and compatible with future sanitized sources;
- preserves exact source/method/policy identity and explicit uncertainty;
- can be tested completely with synthetic/public-safe evidence at `$0` incremental cost.

Tradeoffs:

- does not retrieve SERPs itself;
- does not infer semantic intent from query wording;
- does not implement rank-weighted overlap;
- does not guess registrable domains;
- does not claim one universal top-K or threshold policy;
- does not persist results.

## Rejected alternatives

- **Custom SERP crawler/scraper:** commodity sensing, higher maintenance/security burden, not authorized.
- **DataForSEO client inside G.A.S.:** provider coupling and credit/runtime authority are outside this release.
- **LLM/NLP-only intent clustering:** would replace source evidence with inference and violate the frozen seam.
- **One opaque intent score:** would hide URL/domain/source/policy semantics.
- **Automatic split/consolidate recommendation:** exceeds evidence and action authority.
- **Rank-weighted overlap/RBO in v1:** no demonstrated operator need; exact sets are the smallest useful proof.
- **New persistence/schema:** unnecessary for the pure/local mechanism proof.

## Validation and acceptance

Release 0.23 was accepted after exact-head deterministic validation, Product semantic review, one fresh independence-clean review, required hosted checks, zero unresolved review threads, and protected-main merge at `c8405603dc60a8cbf941b45a8361784c938e4fb7` / tree `5c78b2cd1c8a1c003ac8856f0afb03912b4dd7bd`. Post-merge Contracts and Security Baseline checks also passed. Any future semantic change requires separately bounded authority and review; this acceptance does not reserve or authorize Release 0.24.
