# Release 0.23 — SERP Intent Validation Profile

Status: **accepted and merged via Issue #120 / PR #121 at protected-main `c8405603dc60a8cbf941b45a8361784c938e4fb7`, accepted tree `5c78b2cd1c8a1c003ac8856f0afb03912b4dd7bd`**.

Release 0.23 closes the accepted Release 0.12 page-focus validation seam with one pure/local, provider-neutral comparison profile over already-sanitized SERP snapshots. It validates **result-family similarity under an explicit method**, not user-intent truth and not page-change authority.

## Boundary

The profile accepts caller-supplied, publication-safe SERP evidence only. It does not fetch a search engine, call DataForSEO, hold provider credentials, crawl or scrape, schedule work, persist evidence, create canonical schemas, run AI, generate content, or mutate a site.

Every output keeps:

- `humanIntentReviewRequired: true`;
- `noAutomaticPageChange: true`;
- `resultShapeContextIsDescriptiveOnly: true`;
- explicit limitations that prohibit treating overlap as user-intent truth or as split/merge/consolidate/redirect/canonical/content authority.

## Explicit input identity

One invocation contains:

- a versioned representative-query selection;
- optional upstream Release 0.12 page-focus candidate identity;
- explicit cluster/query IDs;
- one strict versioned comparison policy;
- one or more sanitized SERP snapshots for every selected representative query.

The deterministic profile ID binds the normalized query selection, policy, source contexts, methodology version, query text, exact URL-overlap evidence, and separate domain-overlap evidence. Representative-query and snapshot input ordering does not alter the result.

Changing the selected query set, selection revision, policy revision, source semantics, or comparison evidence changes profile identity.

## First policy model

The caller supplies and versions:

- `policy.id` and `policy.version`;
- `topK`;
- `minimumComparableQueryPairs`;
- `exactUrlOverlapSameFamilyThreshold`;
- `exactUrlOverlapDistinctFamilyThreshold`;
- `maximumCollectionTimeSkewSeconds`;
- `minimumBorderlineSnapshots`;
- explicit exact-equality requirements for provider, method, location, language, device, search surface, and source-schema version;
- `urlComparison: exact`;
- `duplicateUrlPolicy: dedupe_exact_only`;
- `domainComparison: supplied_registrable_domain`.

The distinct-family threshold must be strictly lower than the same-family threshold, preserving an explicit ambiguity band. Thresholds are policy, not universal SEO truth.

## Source and comparability semantics

Every snapshot preserves:

- provider;
- method ID/version;
- query ID and exact query text;
- provider observation time and optional receive time;
- location;
- language;
- device;
- search surface;
- source-schema version;
- requested result depth;
- coverage state and truncation;
- typed result rows;
- provider-native same-type rank when supplied;
- absolute rank when supplied;
- exact URL;
- supplied registrable domain when available.

Provider, method/version, location, language, device, search surface, source-schema version, and collection-time skew are fail-closed comparability gates. Partial, failed, or truncated evidence is not comparable.

Requested depth remains descriptive source context. It is **never** treated as proof that K eligible organic rows were observed.

## Organic top-K

Only `type = organic` rows with an exact URL are eligible for URL comparison. Other feature classes remain available only in descriptive result-shape counts.

When the provider supplies same-type rank on eligible organic rows, the profile uses that rank for organic ordering. A mixed ranked/unranked organic set fails closed rather than falling back to mixed absolute SERP position. Without same-type rank, caller/provider result order is preserved.

Exact duplicate URLs are deduplicated. No broad URL canonicalization occurs: distinct exact strings such as `/page` and `/page/` remain distinct evidence.

The output reports both requested source depth and actual eligible unique organic depth. Actual eligible depth below `topK` returns `not_ready`.

## Exact URL overlap

For each comparable cross-cluster query pair and aligned snapshot pair, the profile reports:

- exact left/right top-K URL arrays;
- intersection count;
- union count;
- Jaccard overlap = `intersection / union`;
- exact shared URLs in deterministic order.

Classification is explicit-policy only:

- Jaccard at or above the same-family threshold -> `same_result_family_candidate`;
- Jaccard at or below the distinct-family threshold -> `distinct_result_family_candidate`;
- between thresholds -> `ambiguous`.

No rank-weighted overlap or proprietary universal score is implemented.

## Registrable-domain overlap

Domain overlap is a **separate descriptive measure**. When all selected top-K rows carry a supplied registrable domain, the profile reports domain intersection, union, Jaccard, and shared domains separately from URL overlap.

Release 0.23 deliberately does not guess registrable domains with a home-grown public-suffix implementation. If suitable supplied registrable-domain evidence is absent, domain overlap is explicitly unavailable; exact URL comparison remains unchanged.

## Result-shape context

All typed result rows contribute to deterministic per-type counts so an operator can see feature-shape differences such as local, shopping, video, or other provider-native classes.

Those counts are descriptive context only. They never mint or change an intent conclusion and never override exact organic URL comparison.

## Repeated snapshots

The policy may require more than one comparable snapshot when a query pair is ambiguous. Snapshot counts must match across the paired representative queries. Mixed per-snapshot states collapse the pair to `ambiguous`; configured repeat requirements fail closed until satisfied.

This is a bounded stability mechanism, not a scheduler or collection authority.

## Output states

The semantic state vocabulary is exactly:

- `same_result_family_candidate`;
- `distinct_result_family_candidate`;
- `ambiguous`;
- `not_ready`.

The first three mean only that the compared **organic result universes** are similar, different, or ambiguous under the exact source and policy. They never mean same/different user intent.

`not_ready` is returned instead of a manufactured zero when required evidence is unsafe, including missing/failed/partial/truncated evidence, insufficient eligible organic depth, source/method/locale/language/device/surface/schema/time mismatch, mixed organic rank semantics, snapshot-count mismatch, unmet repeated-snapshot policy, or too few comparable query pairs.

## Human/action ceiling

Release 0.23 may support language such as:

> These representative queries returned materially similar/different/ambiguous organic result universes under this exact source, locale, device, observation time, and policy. Human intent/content/business review remains required.

It cannot produce or authorize:

- “the provider proved the same/different user intent”;
- split/merge/consolidate decisions;
- redirect/canonical decisions;
- page creation/deletion/rewrite;
- content generation;
- ranking/traffic/lead/revenue forecasts;
- recommendation priority or approval;
- any external action.

Any later recommendation must pass through separately accepted human review semantics and any action still requires separately authorized execution.

## Synthetic proof matrix

`tests/analysis/serp-intent-validation.test.ts` covers:

1. high exact-URL overlap -> same-family candidate;
2. low overlap -> distinct-family candidate;
3. ambiguity-band overlap -> ambiguous;
4. missing/failed/partial/truncated evidence -> `not_ready` with no zero manufacture;
5. requested depth larger than actual eligible organic depth -> `not_ready`;
6. provider/method/location/language/device/surface/schema/time mismatches -> `not_ready`;
7. exact URL and domain overlap remain separate;
8. mixed feature rows cannot contaminate organic top-K;
9. provider same-type rank controls organic ordering when supplied;
10. representative/snapshot input order cannot change deterministic output;
11. changed query-selection or policy revision changes identity;
12. exact duplicate URL handling is conservative and variants remain distinct;
13. result-shape differences remain descriptive;
14. repeated ambiguous snapshots obey explicit policy;
15. too few comparable pairs fail closed;
16. unselected query evidence cannot create authority;
17. output is bounded JSON-compatible data with explicit human/no-action ceilings.

## Cost, data, and security

Incremental cash cost is `$0`. The accepted release adds no dependency, credential, network path, cloud resource, database, schema/migration, listener, scheduler, runtime AI, provider account access, customer/private data, or production mutation.
