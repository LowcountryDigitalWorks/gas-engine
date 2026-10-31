# ADR 0024 — Search Performance web modality

- Status: **accepted via gas-engine #136 / PR #143** at protected-main `b484fe8ed13d197726680582872bf09335a58d2d`, tree `b1e3fe40242c43e976e38d1fb599affee402390a`
- Date: 2026-10-31
- Issue: #136

## Context

Accepted Release 0.10 search analytics consumes sanitized `ldw.search-analytics-evidence.v1` minor 0 only. Google Search Performance reporting now distinguishes **web text** versus **web multimodal** result families. G.A.S. must preserve that semantic boundary in adaptation, compatibility, downstream Page Focus source projection, and measurement-interpretation claim ceilings without inventing a combined modality, retrofitting modality onto minor 0, widening canonical wire schemas, or adding provider retrieval.

Issue #136 frozen contract corrections removed `combined` and require explicit minor 1 semantics: `reportFamily: search-performance`, `searchType: web`, and `webModality: text_based | multimodal` only.

## Decision

Accepted Release 0.24:

1. accept minor 1 sanitized artifacts only when `webModality` is exactly `text_based` or `multimodal`, rejecting `combined` and unknown values fail-closed;
2. keep minor 0 adaptation and application-local row/semantics shape **unchanged** (no guessed `webModality` on minor 0), and keep minor 0 collection seed identity material **byte-identical** to protected main Release 0.23 (no additive `schemaMinorVersion` in seed semantics for minor 0);
3. bind minor 1 collection identity, row identity, and compatibility to the canonical Search Performance web modality context: `collection.method` remains `ldw-gsc-search-analytics` version `1.1.0` with `configurationRevision` 2 and a `configurationId` digest bound to `reportFamily` and `webModality`; each canonical observation cohort uses `dimensions.configuration` `{ id: 'gsc-web-modality', version: <modality> }`;
4. treat minor 0 versus minor 1 and `text_based` versus `multimodal` as **incompatible** for baseline/current comparison, search-change preparation, and measurement-interpretation continuity claims;
5. propagate validated minor 1 modality into Page Focus `source` as `PageFocusSearchUniverse` and into deterministic report identity (not a presentation-only sidecar), and into minor 1 row and overlap `SearchAnalyticsSignal.cohort.sourceUniverse` plus those signals' deterministic identity;
6. fail closed when application-local row modality does not match window semantics (sidecar-only relabel cannot forge a comparable window);
7. preserve Release 0.22 measurement-interpretation ceilings so a modality discontinuity cannot be claim-upgraded into continuity;
8. keep all behavior pure/local with no canonical wire schema change, no persistence/migration, no provider/network/OAuth client, no Generative-AI-report adapter, no runtime AI, and no recommendation/action authority.

## Consequences

### Benefits

- Keeps Search text and multimodal evidence separable through adaptation, analysis, and human review surfaces.
- Reuses accepted canonical observation mapping; strictly validated source modality is evidence semantics bound into collection method/cohort identity and application-local semantics. It does not issue tenant or authority, and it does not come from trusted tenant configuration.
- Page Focus remains neutral while exposing the exact underlying Search Analytics universe for audit.

### Tradeoffs

- Minor 1 doubles the number of distinct compatible windows a caller must treat explicitly; cross-modality comparison remains forbidden rather than merged.
- Page Focus report IDs change when modality changes even if cluster assignments and metrics match.

## Rejected alternatives

### Support `webModality: combined`

Rejected. Frozen #136 contract forbids combined; upstream must export separate text and multimodal artifacts.

### Retrofit modality onto minor 0 rows

Rejected. Minor 0 remains legacy-only without fabricated modality fields.

### Add modality to canonical wire dimensions

Rejected for this release. Modality is carried through existing collection method configuration identity plus application-local semantics validated before analysis.

## Security and cost

No customer/private evidence, provider credentials, secrets, new dependencies, cloud resources, or paid services. Incremental recurring cost remains $0 under existing development/CI capacity.

## Acceptance

Accepted. Product exact-head review, hosted Contracts/Security validation, fresh independence-clean review, zero unresolved threads, and protected-main squash merge of PR #143 as `b484fe8ed13d197726680582872bf09335a58d2d` are complete. This acceptance does not reserve or authorize a later semantic release.
