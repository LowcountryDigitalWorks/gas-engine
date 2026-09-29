# Release 0.10 — Search Analytics Signal Pack draft candidate

Release 0.10 is a bounded draft candidate under Issue #33. It is not accepted until Product Orchestrator exact-head review, independent review, required validation, and merge.

## Purpose

The candidate proves a pure/local search-analytics boundary over a sanitized Google Search Console-style artifact:

> SANITIZED UPSTREAM EVIDENCE → LOCAL ADAPTER → EXISTING CANONICAL OBSERVATIONS → EXACT COMPATIBILITY → EXPLICIT-POLICY SIGNALS

G.A.S. does not connect to Google Search Console. OAuth, provider credentials, scheduling, retrieval, and evidence transport remain upstream automation responsibilities.

## Source contract

The adapter accepts exactly:

- schema: `ldw.search-analytics-evidence.v1`;
- minor: `0`;
- provider: `google-search-console`;
- search type: `web`;
- dimensions: exact `query` + `page`;
- metrics: clicks, impressions, CTR, and average position;
- requested and effective windows;
- final/preliminary freshness state plus `freshThrough`;
- explicit filter group + filter descriptors;
- explicit complete/partial/unknown coverage, truncation, and anonymization state;
- at most **500 unique query/page rows**.

Unknown schema versions, providers, search types, extra fields, duplicate query/page rows, malformed timestamps/pages, and one-over-bound inputs fail closed.

The input byte digest is diagnostic only. Canonical adapted identity is derived from normalized semantic content so source-row order, filter order, and JSON whitespace do not change the canonical result.

## Trusted authority boundary

The artifact is evidence, never authority.

Trusted adapter configuration supplies:

- tenant/site/site-scope revision;
- expected property projection;
- provider connection ID;
- canonical collection/receive timing;
- source availability.

Artifact property, query, page, provider strings, IDs, and hashes cannot issue `TenantContext`, create grants, select a trusted tenant, or replace trusted configuration.

No tenant-authority issuer is imported or called by the Release 0.10 adapter or analysis module.

## Canonical mapping

Release 0.10 does **not** change canonical wire schemas or persistence.

Each source row becomes one canonical source record and exactly four canonical numeric observations:

| Source metric | Canonical metric ID | Unit |
| --- | --- | --- |
| clicks | `gsc-clicks` | `clicks` |
| impressions | `gsc-impressions` | `impressions` |
| CTR | `gsc-ctr` | `ratio_0_to_1` |
| average position | `gsc-average-position` | `average_position` |

The existing canonical model has no free-form query/page metadata bag. Release 0.10 therefore uses existing fields conservatively:

- subject = hashed page identity;
- `dimensions.surface` = hashed query identity;
- `dimensions.configuration` = exact search type `web`;
- collection method configuration hash = exact normalized dimensions/filter semantics.

The application-local adapter result also preserves the exact query/page strings and deterministic source/observation references. Analysis validates those references against canonical observations before deriving a signal. This sidecar is not a new wire contract or persistence table.

Observed numeric zero remains observed zero. A missing/unreturned row creates no synthetic observation and is never manufactured as zero.

## Bounds and packing

Accepted persistence bounds remain unchanged:

- 64 parts per collection;
- 16 sources per part;
- 32 observations per part;
- 65,536 canonical JSON bytes per part.

Four observations per search row cap count-based packing at eight rows per part. The exact 500-row source bound produces at most 2,000 observations, below the accepted 2,048-observation collection/snapshot ceiling. Packing also checks the actual canonical byte bound before accepting each part. It never truncates or pages silently; any row/part that cannot fit fails closed.

## Coverage and missingness

Canonical collection completeness is `complete` only when upstream coverage is explicitly complete and freshness is final.

Preliminary, partial, or unknown upstream states map conservatively to canonical partial completeness. Unmatched query/page rows are counted only as unmatched diagnostic cohorts; Release 0.10 emits **no appeared/disappeared signal**. Absence never becomes zero or decay.

## Compatibility gate

Before baseline/current analysis, Release 0.10 requires exact compatibility for:

- trusted tenant/site/site-scope;
- provider and provider connection;
- adapter and source-schema version;
- mapping/method and filter configuration;
- property projection;
- search type and dimensions;
- freshness data state;
- coverage state plus truncation/anonymization flags;
- requested-window length;
- effective-window length;
- chronological baseline/current ordering.

Semantic drift fails closed rather than comparing unlike windows.

## Signal pack

All outputs are deterministic application-local records. No signal is persisted.

### Window delta

Matched query/page cohorts only. Emit arithmetic deltas for all four metrics. Deltas are descriptive and are not labeled improvement or regression.

### Striking-distance candidate

Caller policy supplies:

- minimum average position;
- maximum average position;
- minimum impressions.

Boundary comparisons are inclusive. G.A.S. does not hard-code a universal SEO band.

### Decay candidate

Matched rows only. Caller policy supplies:

- metric: clicks or impressions;
- minimum baseline evidence;
- maximum current:baseline ratio.

Missing rows never qualify.

### CTR-opportunity candidate

Caller policy supplies:

- minimum/maximum average position;
- minimum impressions;
- maximum CTR.

There is no universal CTR curve or SERP-feature inference.

### Query/page overlap candidate

Within the current window, group exact query cohorts whose pages each meet caller minimum-impression evidence. Two or more pages produce neutral query/page overlap evidence.

The candidate does not say harmful cannibalization and does not recommend split, consolidation, redirect, or canonical changes.

## Signal provenance

Every signal includes:

- stable signal kind and deterministic ID;
- provider;
- exact query/page cohort identity;
- baseline/current periods as applicable;
- freshness/data state;
- coverage;
- metric units;
- policy ID/version and exact thresholds;
- canonical collection ID;
- source-record ID;
- all four canonical observation IDs for each referenced row.

That is sufficient for an application caller to reconstruct the canonical observations without treating prose as identity.

## Explicit exclusions

Release 0.10 adds no:

- Google client, live Search Console call, OAuth, credential storage, scheduler, or worker;
- GA4, Bing, Yandex, IndexNow, rank/SERP provider, or scraper;
- brand/non-brand inference, query intent, clustering, automatic priority, severity, business-impact, or causal judgment;
- automatic recommendation/remediation/action;
- persistence schema/table/migration or signal storage;
- dashboard, server/listener, runtime AI/BYOK, cloud resource, customer/private evidence, or paid dependency.

The repository no-network tripwire applies to the new tests.

## Validation

The candidate must pass the repository's Node 24 locked validation:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run typecheck
npm run build
npm test
npm run schemas:check
npm run check
npm audit
git diff --check
```

Because Release 0.10 changes no canonical wire schema, generated JSON Schemas must remain byte-for-byte unchanged.
