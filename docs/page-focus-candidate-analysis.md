# Release 0.12 — Page-Focus Candidate Analysis draft candidate

Release 0.12 is a bounded draft candidate under Issue #40. It adds one pure/local evidence layer over accepted Release 0.10 Search Analytics evidence.

The question is deliberately narrow:

> Given one exact page and explicit caller-supplied query-cluster assignments, is there enough measured support across multiple query cohorts to emit a neutral page-focus divergence candidate for later SERP validation?

It does not infer actual search intent and does not recommend a split, consolidation, redirect, canonical change, rewrite, content generation, internal-link mutation, or production action.

## Reuse boundary

Release 0.10 remains authoritative for sanitized GSC-style adaptation, trusted scope/provider configuration, exact query/page identities, canonical observations, metric integrity, freshness, coverage, row bounds, provenance, application-local exact query/page strings, and no-network behavior.

Release 0.12 calls the accepted `validateSearchAnalyticsWindow(...)` function and does not implement another Search Console validator or comparator.

## One page and explicit assignments

One invocation contains:

- one accepted Release 0.10 adaptation result;
- one exact `pageId` present in that window;
- exactly one cluster assignment for every distinct query on that page;
- one explicit versioned policy.

Assignment shape:

- `queryId`;
- `clusterId`;
- optional display `label` up to 128 characters.

Assignments are strict application-local data. Duplicate assignments, assignments for queries outside the selected page, missing assignments, unknown fields, invalid identifiers, and conflicting labels for the same `clusterId` fail closed.

`clusterId` is the caller-owned semantic identity. `label` is display text only. Assignment order does not affect normalized output or report identity.

Release 0.12 does not infer clusters with an LLM, embeddings, token similarity, regex intent classification, vendor APIs, SERP APIs, or scraping.

## Explicit policy

The strict policy contains:

- `id`;
- `version`;
- `minimumPageImpressions`;
- `minimumClusterImpressions`;
- `minimumClusterShare`.

Thresholds are finite and non-negative. Share is inclusive from 0 through 1. These are caller policy values, not universal SEO truth.

## Exact aggregation

Every Release 0.10 row for the selected page participates.

Page totals preserve:

- query count;
- summed clicks;
- summed impressions;
- aggregate CTR = total clicks / total impressions.

Each cluster summary preserves:

- cluster ID and optional label;
- query count;
- exact query IDs;
- exact application-local query strings;
- summed clicks;
- summed impressions;
- aggregate CTR;
- descriptive average-position minimum/maximum;
- support share = cluster impressions / page impressions;
- exact row/source/observation identifiers.

Observed zero clicks remain numeric zero. Rows are never silently omitted. Count aggregation fails closed rather than silently exceeding JavaScript safe-integer bounds.

No proprietary aggregate rank score is created.

## Readiness and candidate semantics

High-level state is exactly one of:

- `candidate`;
- `no_candidate`;
- `not_ready`.

Source evidence is `not_ready` if it is preliminary, coverage is incomplete, coverage is truncated, or coverage is anonymized/withheld. Valid observed summaries remain available, but no divergence candidate is emitted.

When source quality is ready:

1. page impressions must meet `minimumPageImpressions`;
2. a cluster is supported only when impressions meet `minimumClusterImpressions` and support share meets `minimumClusterShare`;
3. at least two supported clusters are required for `candidate`;
4. dominant evidence is the supported cluster with highest impressions;
5. ties use ascending `clusterId`;
6. every other supported cluster is a divergent evidence cluster.

`dominantEvidenceCluster` means only the largest measured support under the supplied policy. It does not mean primary intent, correct intent, canonical topic, correct page purpose, or superior content.

## Deterministic identity

Report identity uses only bounded semantic material:

- accepted Release 0.10 collection ID;
- exact page ID;
- canonical sorted queryId→clusterId assignments;
- policy ID/version/thresholds;
- a fixed page-focus identity algorithm version.

Display labels, generated prose, raw provider payload bytes, and runtime model output do not participate in semantic identity.

## SERP validation gate

Every report carries:

`serpValidationRequired: true`

and the fixed requirement:

> Separate SERP/result comparison is required before any intent, split, consolidation, redirect, canonical, or content-architecture conclusion.

Release 0.12 produces no `recommendation` or `action` contract and no equivalent automatic decision. A human or separately authorized evidence layer must make later conclusions.

## Authority, sidecar, persistence and cost

Scope/provider identity comes only from accepted Release 0.10 canonical evidence. Page/query/cluster IDs, labels, policy values and report IDs are inert selectors/evidence and cannot mint tenant, site, principal, grant, provider connection, or action authority.

Exact query/page strings remain application-local Release 0.10 sidecar data. After restart, they still require retaining/re-reading and re-adapting the sanitized source artifact or retaining the adaptation result. Hashes are identities, not anonymization guarantees.

Release 0.12 adds no schema, table, migration, repository, candidate store, cluster store, semantic-model store, provider networking, OAuth/credentials, scheduler, worker, runtime AI, cloud resource, customer/private evidence, paid service, API, or dependency. Incremental recurring cost remains $0 under existing included development/CI capacity.
