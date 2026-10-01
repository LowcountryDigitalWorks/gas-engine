# Bing AI Performance sanitized evidence adapter — Release 0.14 candidate

Status: **Release 0.14 draft candidate. Not accepted until Product review, independent review, merge, and post-merge verification.**

Issue: [#44](https://github.com/LowcountryDigitalWorks/gas-engine/issues/44)

## Purpose

This adapter consumes one already-sanitized Bing Webmaster Tools AI Performance evidence artifact. It does not retrieve Bing data. The upstream sensing/export process remains outside G.A.S.

Supported source contract:

- schema: `ldw.bing-ai-performance-evidence.v1`
- minor: `0`
- provider: `bing-webmaster-ai-performance`
- adapter: `ldw-bing-ai-performance-adapter`
- mapping: `1.0.0`
- input bound: 1 MiB
- aggregate bounded rows: 768
- section caps: time series 366, pages 256, grounding queries 192, optional query/page mappings 256

The parser is strict and rejects unknown root/section fields, unsupported schema versions, invalid UTF-8/JSON, duplicate semantic identities, property mismatch, invalid timing, non-HTTPS exact page URLs, and any artifact that exceeds byte or row bounds. It fails closed rather than truncating.

## Source semantics

Bing AI Performance is treated as **sampled / aggregated provider evidence**.

A `complete_export_view` means the provided export is complete for that exported provider view. It does not assert complete underlying event-population coverage. Sampling can make totals across different views differ, so the adapter and analysis do not manufacture reconciliation rules.

Grounding-query phrases are exact provider-returned grouped phrases. They are not exact user prompts.

Preview intent/topic labels remain provider evidence. They are not promoted to universal G.A.S. intent or topic classifications.

Citation counts and citation share are not ranking, authority, quality, traffic, engagement, business impact, or causal evidence.

## Artifact sections

### summary

Optional provider summary evidence:
- `totalCitations`
- `averageCitedPages`

### timeSeries

Exact date rows:
- `citationCount`
- optional `citedPageCount`

### pages

Exact HTTPS page URL plus citation count.

No canonicalization, redirect inference, slash normalization, or URL equivalence is performed.

### groundingQueries

Exact grouped provider phrase plus citation count, with optional provider intent/topic/citation-share evidence.

### queryPageMappings

Optional exact grouped phrase + exact page URL mapping. The adapter never invents mappings from independent page/query lists.

## Trusted configuration boundary

Trusted caller configuration supplies:
- canonical G.A.S. scope;
- expected property;
- provider connection ID;
- collected/received timestamps;
- source availability.

Artifact property/URL/query data cannot mint tenant/site/provider authority.

The adapter imports no tenant-context issuer and performs no persistence.

## Canonical adaptation

The adapter reuses existing `collection`, `source_record`, `observation`, and `CollectionBatch` contracts. No canonical wire schema is added or changed.

Canonical metric IDs are explicitly Bing-specific, including:
- `bing-ai-total-citations`
- `bing-ai-average-cited-pages`
- `bing-ai-time-series-citation-count`
- `bing-ai-time-series-cited-page-count`
- `bing-ai-page-citation-count`
- `bing-ai-grounding-query-citation-count`
- `bing-ai-grounding-query-citation-share-pct`
- `bing-ai-query-page-citation-count`

The application-local sidecar retains exact provider identities/strings and readiness metadata needed by Release 0.14. It is not a new wire contract.

Harmless JSON formatting and accepted source ordering do not change semantic collection output.

## Security and cost boundary

There is no:
- Bing API/OAuth client;
- provider credential;
- live provider retrieval;
- crawler or SERP scraper;
- scheduler/background worker;
- runtime AI/LLM/embedding;
- BYOK;
- new persistence;
- cloud resource;
- customer/private evidence;
- PHI/CUI;
- new dependency or paid service.

Incremental recurring cost target remains **$0**.

Release 0.15 is not implemented by this candidate.
