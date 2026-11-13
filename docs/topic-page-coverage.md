# Release 0.26.0 candidate — Topic-Page Coverage (TOPIC-PAGE-COVERAGE-001)

This guide documents the **reserved source candidate** `analyzeTopicPageCoverage(input)` in `src/analysis/topic-page-coverage.ts`. It is **not** a published release, Product acceptance, or customer authorization.

## Question

> Given a human-authored topic universe, an inventory of known canonical HTTPS pages, explicit topic→page assignments, and optional validated Google Search Console query×page evidence, what exact source rows exist for each assignment—and what remains unknown?

The function does **not** infer search demand, missing content, competitor topics, rankings, priorities, or production actions.

## Reuse boundary

Release 0.10 remains authoritative for sanitized GSC adaptation, trusted scope/provider configuration, exact query/page identities, metric integrity, freshness, coverage, row bounds, and provenance.

Release 0.26.0 calls accepted `validateSearchAnalyticsWindow(...)` and does not implement another Search Console parser or comparator.

Official Google Search Analytics query results are **not exhaustive**; omitted query×page pairs are `not_returned`, never numeric zero and never proof of absent demand.

## Invocation shape

Trusted host supplies:

- `scope` — must match any accepted `window` collection scope;
- `universe` — `{ id, revision }` for the authored topic taxonomy;
- `topics` — ≤32 items: `{ topicId, label ≤32 chars, parentTopicId? }`;
- `pages` — ≤64 items: `{ pageId, url }` with exact `https://` canonical URLs;
- `topicPageLinks` — explicit human topic→page assignments (≤32×64);
- `queryTopicAssignments` — `{ queryId, topicId }` with at most one topic per query;
- `policy` — `{ id, version }`;
- optional `window` — zero or one `SearchAnalyticsAdaptationResult`.

Caller-authored IDs do not create tenant authority.

## Output

Deterministic report `gsc.topic-page-coverage:<hash>` binding universe, inventory, links, query assignments, policy, and accepted source identity/period/modality.

Each `topicPageCoverageRow` includes:

- authored `topicId` and `pageId` (inventory identity, independent of GSC `pageId`);
- `mapping`: `mapped_by_human` | `unmapped` | `mapping_unknown`;
- `evidenceState`: `observed` | `not_returned` | `unavailable` | `incompatible`;
- `reason` and optional bounded `evidenceRows[]` — one entry per validated query×**inventory URL** match (no aggregate clicks/impressions).

Evidence binding uses **exact source `queryId` + exact inventory HTTPS `pages[].url`**, not caller `pageId`. Each evidence row carries `sourcePageId`, `sourcePageUrl`, row identity, and observation IDs for clicks/impressions only.

When the source window is absent, `source` is minimal `{ state: 'absent', scope }` only.

Summary always sets `humanEditorialReviewRequired: true` and `noAutomaticContentAction: true`, with an outcome among:

- `investigate_existing_page_fit`
- `unresolved_not_ready`
- `no_evidence_claim`

No `create_new_page`, split/merge, canonical, redirect, score, or ranked priority fields are emitted.

## Failure modes

Duplicate topic/page URL/query assignments, invalid parent graphs, scope mismatch, non-GSC providers, invalid adapted windows, duplicate source row identities, or output byte overflow fail closed with `TopicPageCoverageError`.

## Examples

### Observed mapped row

```json
{
  "pageId": "custom-home",
  "evidenceState": "observed",
  "evidenceRows": [
    {
      "queryId": "gsc.query:…",
      "sourcePageId": "gsc.page:…",
      "sourcePageUrl": "https://example.test/services/alpha",
      "clicks": 7,
      "impressions": 140
    }
  ]
}
```

### Known page without returned GSC row

```json
{
  "evidenceState": "not_returned",
  "reason": "assigned_query_page_not_returned_in_source"
}
```

### No source window supplied

```json
{
  "evidenceState": "unavailable",
  "reason": "source_window_absent"
}
```
