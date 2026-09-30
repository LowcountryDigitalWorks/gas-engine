# Release 0.13 — Discovery Diagnostics Pack

Release 0.13 is a provider-neutral but provider-preserving discovery/index diagnostics layer over sanitized Google, Bing, Yandex and IndexNow evidence.

The release answers bounded evidence questions such as:

- do multiple ready engines explicitly report one URL absent?
- do ready engines disagree between present and absent?
- do multiple ready engines report blocking/failing crawl states?
- do known canonical targets conflict?
- do engines disagree on indexing permission?
- what IndexNow submission evidence exists before/after later engine observations?
- what exact Release 0.10 Search Analytics context is currently observed for the same URL?

It does not establish universal index truth, root cause, business impact, ranking, remediation, or causality.

## Inputs

`analyzeDiscoveryDiagnostics(...)` accepts:

- 2–3 adapted search-engine windows from distinct providers:
  - Google Search Console
  - Bing Webmaster Tools
  - Yandex Webmaster
- optional one IndexNow adapted window;
- explicit `evaluatedAt`;
- explicit versioned readiness policy;
- optional accepted Release 0.10 current Search Analytics adaptation.

Every discovery window is first passed through `validateDiscoveryWindow(...)`.

Release 0.10 context is passed through the accepted `validateSearchAnalyticsWindow(...)`.

## Exact compatibility and authority

All discovery windows must share exact:

- tenant ID;
- site ID;
- site-scope revision;
- trusted target/property projection.

Optional Search Analytics must share exact trusted scope and exact property string.

Provider windows must be distinct.

IndexNow does not count as a search engine.

IDs, URLs, provider states, canonical targets, report hashes, IndexNow results and search metrics are evidence/selectors only and cannot issue tenant/site/provider/action authority.

## Readiness policy

Strict policy:

- `id`
- `version`
- `maxEvidenceAgeSeconds`
- `minimumReadySearchEngines` = 2 or 3
- optional `maxSubmissionConfirmationAgeSeconds`

A provider snapshot is not ready when any applicable reason exists:

- `source_preliminary`
- `coverage_partial`
- `coverage_unknown`
- `coverage_truncated`
- `evidence_stale`
- `provider_unavailable`

Raw provider evidence remains visible even when that provider is not ready.

A URL is ready for cross-engine comparison only when at least the policy minimum number of READY search-engine providers have an exact observed row for that exact URL.

A missing URL row never becomes absent.

## Exact URL alignment

Cross-engine alignment uses exact URL string / deterministic `urlId` only.

The analysis does not equate:

- trailing-slash variants;
- HTTP/HTTPS;
- www/non-www;
- redirects;
- canonical source/target;
- aliases;
- parameter variants.

Provider canonical/redirect evidence can be inspected separately but never rewrites identity.

## Finding kinds

One ready URL may carry multiple findings.

### broad_indexing_issue_candidate

At least two ready engines explicitly report:

`searchPresence = absent`

This is a broad cross-engine indexing issue candidate. It does not establish one shared root cause.

### engine_specific_indexing_divergence_candidate

At least one ready engine reports present and at least one different ready engine reports absent.

Exact providers are retained. No engine is labeled correct.

### broad_crawl_access_issue_candidate

At least two ready engines report one of:

- blocked
- not_found
- server_error
- other_error

No DNS/hosting/server root cause is inferred.

### canonical_divergence_candidate

At least two ready engines have known exact canonical targets/states and their resolved exact canonical URLs differ.

Examples include:

- self vs other;
- other(target A) vs other(target B).

No canonical recommendation is created.

### indexing_permission_divergence_candidate

Known ready-engine permissions include both:

- allowed
- blocked

Unknown does not count as disagreement.

### no_cross_engine_divergence_observed

Emitted only when the URL is ready and no candidate above fires.

This does not mean:

- healthy;
- perfect;
- indexed everywhere;
- no SEO issue.

It means only that no bounded Release 0.13 cross-engine candidate was observed.

Not-ready URLs emit no finding.

## Deterministic finding ordering

Finding arrays use fixed navigation order:

1. broad indexing candidate
2. engine-specific indexing divergence
3. broad crawl-access candidate
4. canonical divergence
5. indexing-permission divergence
6. no-divergence state

A URL can retain every applicable finding. They are never collapsed into a health/severity/priority/business-impact score.

## IndexNow correlation

IndexNow context states:

- `no_submission_evidence`
- `submission_rejected`
- `submission_accepted_no_later_engine_observation`
- `submission_accepted_later_present_observed`
- `submission_accepted_later_absent_observed`
- `submission_accepted_mixed_later_observation`

Only READY search-engine rows with an observation timestamp after the accepted submission can contribute to later-observation states.

If `maxSubmissionConfirmationAgeSeconds` is supplied, later evidence outside that descriptive interval is ignored for the submission-context state.

The fixed boundary is:

> IndexNow submission is notification evidence only; it does not prove or cause indexing.

Release 0.13 never says IndexNow caused indexing or failed because a later engine remains absent.

## Optional Release 0.10 Search Analytics context

Search context is exact-page descriptive evidence only.

For every diagnostic URL, exact Release 0.10 rows whose page string exactly equals the diagnostic URL are aggregated into:

- query count;
- clicks;
- impressions;
- aggregate CTR;
- average-position minimum/maximum;
- source period;
- freshness;
- coverage.

If Search Analytics was supplied but no exact page row exists:

`not_observed`

not zero traffic.

If no Search Analytics window was supplied:

`not_supplied`

Search context never changes diagnostic finding kinds or URL ordering.

## Site report

The deterministic site report contains:

- trusted scope;
- trusted target;
- evaluatedAt;
- explicit policy;
- provider set;
- provider readiness;
- total unique URLs;
- ready/not-ready URL counts;
- counts by finding kind;
- counts by IndexNow context;
- with/without observed search-context counts;
- ordered URL reports.

Candidate-bearing URLs appear first as a navigation convenience, then ready no-divergence URLs, then not-ready URLs. Within candidate-bearing URLs the fixed finding order is used, then exact URL lexical order.

This ordering is not a severity, priority or business-impact ranking.

## Identity

URL-report IDs bind bounded semantic material:

- exact URL/url ID;
- provider collection identities;
- exact included provider row identities when observed;
- IndexNow row identity when present;
- Search Analytics collection identity when supplied;
- evaluatedAt;
- policy.

Site-report identity binds:

- sorted provider collection identities;
- optional Search Analytics collection;
- evaluatedAt;
- policy.

No raw provider payload bytes or generated prose enter report identity.

## Static operator report

`renderDiscoveryDiagnosticsHtml(...)` produces one bounded standalone HTML document.

It includes:

- trusted report context;
- provider readiness/freshness/coverage;
- deterministic site totals;
- per-URL provider matrix;
- exact normalized provider states;
- canonical targets;
- diagnostic findings;
- IndexNow status and explicit “submission is not indexing proof” note;
- Search Analytics context in a separate section.

Security properties:

- every dynamic data string is HTML escaped;
- restrictive CSP;
- no JavaScript;
- no external assets;
- no form or write controls;
- no listener/server;
- no provider/network call;
- print styling;
- 1,000,000-byte output bound.

`npm run preview:discovery` generates a synthetic local preview under ignored `local-artifacts/`.

## Persistence, security and cost

Release 0.13 adds no table, migration, repository, diagnostic store, submission store or search-context store.

Analysis/report output remains application-local.

Production source performs no network access and contains no provider credentials/OAuth/API keys.

Public tests/preview use synthetic `example.test` evidence only.

No runtime AI, embeddings, scheduler, worker, crawler, SERP scraper, automatic recommendation, remediation, external action or content generation is added.

Incremental recurring cost remains $0 with no dependency or cloud change.
