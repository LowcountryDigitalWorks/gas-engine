# ADR 0013 — Provider-preserving discovery diagnostics with exact URL alignment

- Status: Proposed for Release 0.13 candidate
- Date: 2026-09-29
- Issue: #43

## Context

Accepted G.A.S. can normalize replaceable evidence sensors, compare longitudinal evidence, represent human review/outcomes, analyze Search Console performance, and produce bounded page-focus candidates. It does not yet provide one coherent view of whether exact URLs are reported present/absent/crawl-blocked/canonicalized differently across search engines.

Google, Bing and Yandex expose different indexing/crawl concepts. IndexNow is a notification protocol rather than index truth. Flattening these sources into one universal engine score would discard important provider meaning and invite unsupported causal conclusions.

## Decision

Release 0.13 will add one bounded Discovery Diagnostics Pack with:

1. exact sanitized source schema `ldw.discovery-diagnostics-evidence.v1` minor 0;
2. one provider + one trusted target per artifact;
3. Google/Bing/Yandex conservative common URL concepts plus bounded provider sidecar state;
4. a distinct IndexNow submission-evidence path;
5. existing canonical collection/source/observation adaptation with no wire-schema expansion;
6. revalidation of adapted canonical/sidecar consistency before analysis;
7. exact URL-only cross-engine alignment;
8. explicit caller freshness/readiness policy;
9. deterministic multi-finding URL diagnostics;
10. descriptive IndexNow later-observation context without causality;
11. optional exact Release 0.10 Search Analytics context;
12. deterministic site rollup;
13. bounded static escaped read-only operator HTML.

## Conservative semantics

Search-engine common concepts are only:

- search presence: present / absent / unknown;
- crawl: success / blocked / not_found / server_error / redirect / other_error / unknown;
- indexing permission: allowed / blocked / unknown;
- canonical: self / other / unknown.

Provider source states remain visible in application-local sidecar material.

Unknown is legitimate evidence.

Missing rows never become absent.

Google FAIL is not automatically converted to absence. Yandex redirect/duplicate target evidence is not automatically treated as canonical.

## Exact URL identity

No URL equivalence normalization is introduced.

Trailing slash, protocol, host, parameter, redirect and canonical variants remain distinct exact identities.

This avoids silently turning provider evidence about relationships between URLs into identity assertions.

## Cross-engine findings

The bounded candidate set is:

- broad_indexing_issue_candidate
- engine_specific_indexing_divergence_candidate
- broad_crawl_access_issue_candidate
- canonical_divergence_candidate
- indexing_permission_divergence_candidate
- no_cross_engine_divergence_observed

One URL can retain multiple findings.

No aggregate engine-health, severity, business-impact or priority score is introduced.

## Readiness

Cross-engine conclusions require at least 2 or 3 READY search engines according to explicit caller policy.

Readiness accounts for:

- preliminary source state;
- partial/unknown coverage;
- truncation;
- staleness;
- provider unavailability.

A provider can remain visible but not count toward conclusions.

## IndexNow

IndexNow accepted submission means only accepted notification evidence.

It does not emit search presence or indexing truth.

Later READY engine observations are attached descriptively as after-submission context only.

No causal language is produced.

## Search-performance context

Optional accepted Release 0.10 evidence is validated through the existing Search Analytics validator and exact scope/property compatibility.

Exact matching page rows are aggregated descriptively.

Absence of a matching row becomes `not_observed`, never zero traffic.

Search context cannot change a discovery finding kind.

## Operator report

The static operator document extends accepted Release 0.9 security principles:

- standalone HTML;
- all dynamic data escaped;
- restrictive CSP;
- no JavaScript;
- no external resources;
- no listener/server;
- no write controls;
- printable;
- bounded output.

It is a diagnostic evidence view, not a dashboard platform.

## Rejected alternatives

- direct Google/Bing/Yandex/IndexNow networking inside G.A.S.;
- provider credentials/OAuth in G.A.S.;
- legacy Bing SOAP/POX integration;
- implicit URL normalization/equivalence;
- treating IndexNow acceptance as indexed;
- universal cross-engine score;
- root-cause inference from correlated provider states;
- automatic remediation/recommendations;
- new persistence/schema;
- runtime AI/embeddings;
- customer/private fixtures;
- Release 0.14 AI-visibility implementation in this release.

## Security, privacy and cost

Trusted scope comes only from trusted adapter configuration and accepted canonical evidence.

Artifacts, URLs, provider states, hashes and report IDs cannot mint authority.

Public fixtures are synthetic only.

No dependency, cloud resource, datastore or paid API is introduced.

Incremental recurring cost remains $0 under existing included development/CI capacity.

## Acceptance

This ADR remains proposed until Product exact-head review, one independent exact-head review and Product merge. Development cannot mark Release 0.13 accepted.
