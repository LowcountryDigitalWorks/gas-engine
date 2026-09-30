# Release 0.13 sanitized discovery-diagnostics adapter

Accepted Release 0.13, merged on `main` through PR #45, adds one pure/local adapter for the exact sanitized source contract:

`ldw.discovery-diagnostics-evidence.v1`

Supported minor version:

`0`

One artifact represents exactly one provider snapshot and one trusted site/property target.

Supported provider IDs:

- `google-search-console`
- `bing-webmaster-tools`
- `yandex-webmaster`
- `indexnow`

The adapter does not call provider APIs, authenticate to providers, store credentials, issue tenant authority, persist evidence, run a crawler, or use runtime AI.

## Trusted configuration

Trusted configuration supplies:

- canonical G.A.S. `scope`;
- `expectedProvider`;
- `expectedSite`;
- `providerConnectionId`;
- `collectedAt`;
- `receivedAt`;
- source `availability`.

The artifact's provider/site projection is evidence only. It must exactly match trusted configuration but cannot create or change tenant/site/provider authority.

## Source envelope and bounds

Every artifact contains:

- schema version/minor;
- provider;
- site/property projection;
- `observedAt`;
- `exportedAt`;
- freshness with `dataState` and `freshThrough`;
- coverage;
- rows.

Bounds:

- maximum rows: 256;
- maximum raw sanitized input bytes: 1,048,576;
- canonical hash material remains subject to the repository canonical-JSON 65,536-byte bound;
- output uses existing 64-part / 16-source / 32-observation per-part bounds;
- oversize rows or outputs fail closed;
- rows are never truncated.

Coverage is either:

- complete / nontruncated; or
- partial/unknown with explicit reason and truncation state.

A complete/final artifact becomes a canonically complete collection. Preliminary or partial/unknown evidence becomes a partial collection so an omitted URL is never interpreted as explicit absence.

## URL identity

HTTP and HTTPS URLs are accepted if they are absolute and contain no credentials or fragment.

No cross-URL normalization is performed.

The deterministic URL ID binds the exact supplied URL string:

`discovery.url:<sha256>`

The deterministic row identity binds provider plus exact URL:

`discovery.row:<sha256>`

Therefore these remain distinct:

- trailing slash variants;
- HTTP/HTTPS;
- www/non-www;
- parameter variants;
- redirect source/target;
- canonical source/target.

Duplicate exact URL identities within one provider artifact fail closed.

## Conservative normalized search-engine concepts

Google, Bing and Yandex rows normalize only:

### searchPresence

- `present`
- `absent`
- `unknown`

A missing row is never synthesized as absent.

### crawlState

- `success`
- `blocked`
- `not_found`
- `server_error`
- `redirect`
- `other_error`
- `unknown`

### indexingPermission

- `allowed`
- `blocked`
- `unknown`

### canonicalState

- `self`
- `other`
- `unknown`

When canonical state is `other`, the exact canonical target URL is preserved.

Optional normalized facts include HTTP status and last-crawl timestamp.

The complete strict provider row is also retained in application-local `providerState` sidecar material.

## Google sanitized mapping

The source contract uses a bounded sanitized projection of URL Inspection concepts.

### Presence

- `PASS` -> `present`
- `NEUTRAL` -> `absent`
- `FAIL` -> `unknown`
- `UNKNOWN` -> `unknown`

This intentionally avoids treating every Google error/invalid verdict as proven absence.

### Crawl

- successful -> `success`
- soft-404 / not-found -> `not_found`
- robots/access/4xx blocking -> `blocked`
- server error -> `server_error`
- redirect/internal/invalid-URL errors -> `other_error`
- unknown -> `unknown`

Google redirect errors are not treated as proof of an ordinary redirect target.

### Indexing permission

Explicit robots/noindex blocking -> `blocked`.

Explicit robots allowed plus indexing allowed -> `allowed`.

Anything else -> `unknown`.

### Canonical

Google-selected canonical is compared only by exact URL string:

- exact inspected URL -> `self`;
- different URL -> `other`;
- absent -> `unknown`.

User-declared canonical remains in provider sidecar evidence and is not substituted for Google-selected canonical.

## Bing sanitized mapping

The source contract expects an upstream sanitized projection rather than a legacy SOAP/POX object.

- indexed -> presence `present`
- not_indexed -> presence `absent`
- unknown -> presence `unknown`

Crawl state and indexing permission use the exact bounded shared vocabularies.

An optional exact `canonicalUrl` maps to self/other canonical state.

HTTP status, discovery/crawl timestamps, source status code and source reason remain available as bounded provider evidence.

Future upstream collection should use supported current Bing mechanisms; G.A.S. does not embed a Bing client.

## Yandex sanitized mapping

- searchable=true -> presence `present`
- searchable=false -> presence `absent`
- searchable=unknown -> presence `unknown`

Crawl state and indexing permission use the bounded shared vocabularies.

Yandex `targetUrl` may describe canonical, redirect or duplicate relationships. Only `targetKind=canonical` participates in normalized canonical-state comparison. Redirect/duplicate/unknown targets stay provider-specific sidecar evidence.

HTTP status, last-crawl time, exclusion reason and source status remain provider evidence.

## IndexNow separation

IndexNow rows contain only:

- exact URL;
- `submittedAt`;
- `submissionResult`:
  - accepted
  - rejected
  - rate_limited
  - unknown
- optional result/HTTP code.

IndexNow emits:

- `discovery.submission_state`;
- optional `discovery.http_status`.

It emits no:

- `discovery.search_presence`;
- indexing=true claim;
- crawl success claim;
- causal attribution.

A successful submission means only that the supplied upstream evidence reports an accepted notification/submission.

## Existing canonical contracts

No wire schema changes are required.

Search-engine rows emit existing canonical observations for:

- `discovery.search_presence`
- `discovery.crawl_state`
- `discovery.indexing_permission`
- `discovery.canonical_state`
- optional `discovery.http_status`

IndexNow emits:

- `discovery.submission_state`
- optional `discovery.http_status`

Text states use canonical text observations and HTTP status uses canonical number observations.

Every observation preserves:

- exact trusted scope;
- exact provider/provider connection;
- source identity;
- adapter/source-schema identity;
- collection/run identity;
- timing;
- completeness;
- integrity;
- availability.

## Adapted-window validation

`validateDiscoveryWindow(...)` revalidates an application-local adaptation result before analysis.

It verifies:

- every batch against existing canonical validation;
- complete ordered part set;
- identical collection record across parts;
- adapter/source-schema/method;
- trusted target projection;
- collection completeness semantics;
- exact URL/row identities;
- exact source digests;
- exact source availability;
- sidecar/observation IDs;
- observed text/number values;
- total source/observation cardinality;
- canonical row order.

This proves internal canonical/sidecar consistency only. It does not establish provider authenticity or mint authority.

## Determinism and privacy

Semantic output is independent of harmless JSON whitespace and input-row ordering.

Raw source-byte SHA is used only internally while bounding input and is not part of the returned semantic adaptation result.

Exact provider/source state remains application-local sidecar material. The public repository uses synthetic `example.test` fixtures only.

Incremental recurring cost: $0. No dependency, paid service, cloud resource or datastore is added.
