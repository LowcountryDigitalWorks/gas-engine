# Release 0.15 Unified Operator Intelligence & Service Brief

**Status: ACCEPTED AND MERGED through PR #52**

Release 0.15, accepted and merged through PR #52, composes accepted G.A.S. evidence, analysis, review-history, and reporting surfaces into one bounded read-only service-delivery brief for one exact trusted scope/site. It is application-local. It creates no canonical wire contract, persistence, network client, schedule, delivery mechanism, recommendation, remediation, or execution authority.

## Purpose

The service brief answers, from explicitly supplied accepted evidence:

- which modules were supplied and their readiness/limitations;
- which accepted candidate/finding records exist, without ranking them;
- which exact URL strings are referenced by multiple accepted modules;
- what human recommendation/review/measurement/outcome history exists;
- which compact provenance identities support the brief;
- which semantic and authority limitations remain.

It does **not** produce a health score, severity, priority, materiality, business-impact estimate, causal attribution, automatic recommendation, remediation plan, or production action.

## Trust boundary

assembleServiceBrief(...) receives:

- an already-issued trusted TenantContext;
- accepted evidence/review repositories;
- one strict Release 0.15 request containing exact scope, canonical HTTPS target, generated time, bounded policy, and optional accepted-producer inputs/selectors.

Unknown request fields fail closed. Repository-backed selectors never mint authority. Every supplied module is reconciled to the exact requested scope and compatible target semantics before composition.

Where Release 0.15 owns invocation it calls accepted producers rather than trusting caller-created derived reports:

- Release 0.7 diffEvidenceCollections(...);
- Release 0.10 analyzeSearchAnalyticsSignals(...);
- Release 0.11 composeSearchChangeOutcomeCohort(...);
- Release 0.12 analyzePageFocusCandidate(...);
- Release 0.13 analyzeDiscoveryDiagnostics(...);
- Release 0.14 analyzeAiVisibility(...).

Review-history composition uses accepted Release 0.8 repository reads and getRecommendationEvidence(...). No write method is part of the Release 0.15 production surface.

## Module readiness

The fixed readiness matrix contains:

1. evidence diff / operator case;
2. review history;
3. Search Analytics;
4. Search Change;
5. Page Focus;
6. Discovery Diagnostics;
7. AI Visibility.

Presentation states are only: not_supplied, ready, limited, not_ready, unavailable. Underlying accepted reasons are preserved rather than replaced by an overall score or red/yellow/green health state.

## Unranked attention register

The register normalizes accepted candidate/finding identities for navigation only. It preserves source module, original kind/state, deterministic evidence identity, exact URL/query/prompt/cohort identity when available, and readiness/coverage context.

Ordering is deterministic but is **not** priority, severity, a task queue, remediation order, or business impact.

## Exact-URL evidence index

The page index groups only identical URL strings referenced by accepted module outputs.

It deliberately does not equate /page with /page/, different query strings, redirect source with redirect destination, canonical source with canonical target, HTTP with HTTPS, www with non-www, or case variants.

A grouped entry means only that the accepted records reference that exact string. It does not establish correlation or causation.

## Service history

When requested, Release 0.15 reads accepted Release 0.8 history and provides current recommendation lifecycle counts/listing, measurement-state counts, human-declared outcome-direction counts, bounded explicitly selected immutable histories, selected canonical evidence where accepted reads resolve it, and associated measurements/outcomes.

Canonical priority.level is preserved exactly. Release 0.15 does not compute priority from search/discovery/AI/page-focus/change magnitude. Human-declared outcome direction/attribution are displayed as recorded and never recalculated.

## Provenance manifest

The manifest is a compact deterministic index. It references module/release identity, accepted report/collection identity, provider identities, requested scope/target, source periods where available, evaluated time, readiness/reasons, and policy identity.

It does not embed raw provider artifacts, arbitrary payloads, HTML, credentials, or duplicate full module reports.

## Deterministic identity and JSON

The application-local brief ID binds Release 0.15 version, exact scope, exact trusted target, generated time, policy, fixed supplied/not-supplied module states, deterministic module identities, and selected recommendation IDs.

Rendered HTML/CSS, filesystem paths, prose formatting, and raw provider bytes are not identity material.

serializeServiceBriefJson(...) emits deterministic plain JSON from the deterministic brief structure. The JSON brief is bounded at 1,500,000 UTF-8 bytes and fails explicitly rather than truncating.

## Bounds

| Surface | Maximum |
| --- | ---: |
| Attention items | 512 |
| Exact page-index entries | 256 |
| References per exact page | 64 |
| Detailed recommendation histories | 10 |
| Search Change inputs | 32 |
| Page-Focus inputs | 64 |
| JSON brief | 1,500,000 UTF-8 bytes |
| HTML brief | 2,000,000 UTF-8 bytes |

A configured policy may choose smaller ceilings. Overflow fails closed.

## Static HTML

renderServiceBriefHtml(...) renders one deterministic standalone report with report context/scope, module readiness, unranked attention, exact-page evidence, service history, Search Analytics, Search Change, Page Focus, Discovery Diagnostics, AI Visibility, provenance, and limitations/authority notes.

Dynamic strings are escaped. The document has one useful h1, logical headings, table captions/headers, long-ID/URL wrapping, focus-visible styling, print CSS, and restrictive CSP. It contains no JavaScript, remote resources, form/write controls, client fetch, listener, or server.

## Synthetic preview

npm run preview:service-brief writes:

- local-artifacts/release-0.15-service-brief-preview.json
- local-artifacts/release-0.15-service-brief-preview.html

The preview is synthetic/public-safe and exercises repository-backed diff/history plus Search Analytics, Search Change, Page Focus, Discovery Diagnostics, and AI Visibility. The AI portion preserves the accepted Release 0.6 synthetic ZeroRank target contract rather than weakening that accepted validation boundary merely to force another fixture hostname.

## Explicit exclusions

Release 0.15 adds no canonical wire schema, table/migration/report store/dashboard state, provider retrieval/client/OAuth/credentials, listener/server, report delivery/scheduling/webhook, cloud resource, Activepieces runtime, runtime AI/LLM/embedding/BYOK, generic cross-module inference/correlation, universal score/severity/priority/materiality/business-impact calculation, automatic recommendation/remediation/publishing/action, paid dependency/service, customer/private evidence, PHI, CUI, Issue #49 internal-link implementation, or Release 1.0 implementation.

Incremental recurring-cost target remains $0.

See ADR 0015, authorization, architecture, and roadmap.
