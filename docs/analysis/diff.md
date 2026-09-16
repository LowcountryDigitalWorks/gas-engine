# Deterministic longitudinal evidence diff — Release 0.7 draft

Release 0.7 is an **application-local deterministic comparison proof** over already-canonical G.A.S. collections and observations. It is intended to reduce recurring operator reconciliation work by separating unchanged evidence from changed or coverage-uncertain evidence without inventing direction, severity, business impact, recommendation priority, inference, or action.

This document describes a **draft candidate under Issue #12**. Release 0.7 is not accepted until Product ORCH1 completes exact-head review, independent review, and the normal release gate.

## Public application API

[`src/analysis/diff.ts`](../../src/analysis/diff.ts) exports two layers:

- `compareEvidenceSnapshots(baseline, current)` — pure comparator over two already-resolved canonical collection snapshots;
- `diffEvidenceCollections(repository, context, request)` — thin tenant-safe read service that resolves the two collections and their observations through the existing `EvidenceRepository` using an already-issued `TenantContext`.

The result is an application-local `EvidenceDeltaReport`; Release 0.7 adds no wire schema, persistence record, table, migration, public endpoint, listener, or HTTP read route.

## Collection-stream compatibility gate

Absence is meaningful only inside the same semantic collection stream. Before observation matching, baseline and current collections must be valid canonical collection contracts with distinct collection IDs and exact compatibility for:

- complete `scope`;
- `providerId`;
- `providerConnectionId` ownership/presence and value;
- `adapter.id` and `adapter.version`;
- `sourceSchema.id` and `sourceSchema.version`;
- full collection `method`: `id`, `version`, `configurationId`, `configurationRevision`.

The baseline source period must not be after the current source period. An incompatible pair fails with bounded `collection_discontinuity`; completeness is never used to infer appearance or disappearance across that discontinuity. For example, ZeroRank rankings and ZeroRank chats are different collection streams even when they share a provider connection.

For repository-backed comparison, both collection records must also have **complete persisted multipart progress** before observations are read. Canonical collection completeness and persisted multipart completion are deliberately different concepts in accepted persistence. A collection visible after only an early part is not a safe longitudinal snapshot even when its canonical completeness field says `complete`; Release 0.7 fails that service request as `invalid_snapshot` rather than treating not-yet-persisted observations as absent.

## Exact cohort matching

After collection compatibility is proven, the sole observation match key is the accepted `cohortIdentityHash(observation.cohort)`. That identity includes cohort ID/revision and the full semantic context: scope, subject, metric, declared dimensions, method, and time-window rules. Omitted dimensions are not wildcards.

Release 0.7 does not add weaker subject-only, metric-only, provider-crossing, model-crossing, or configuration-crossing matching. If either snapshot contains more than one observation with the same cohort identity, the comparison fails closed as `ambiguous_cohort`; it never selects a latest record or silently deduplicates.

## Delta states

The report uses only non-evaluative mechanical states:

- `unchanged` — exact cohort exists on both sides and canonical `observationValue` is equal;
- `changed` — exact cohort exists on both sides but canonical `observationValue` differs;
- `appeared` — current-only cohort and the baseline collection is `complete`;
- `missing_from_current` — baseline-only cohort and the current collection is `complete`;
- `coverage_unknown` — unmatched cohort where the opposite collection is `partial`, `unavailable`, or `failed` and therefore cannot prove absence.

A complete-empty collection means only that the declared collection completed with zero received records. It does not establish universal real-world absence and never creates a zero-valued observation.

## Value semantics

All accepted observation states remain exact evidence:

- `observed(value)`;
- `unknown(reason)`;
- `unavailable(reason)`;
- `not_collected(reason)`;
- `not_applicable(reason)`.

Observed numeric zero remains a real zero. State transitions and reason changes are ordinary `changed` evidence. For paired observed numeric values the report may include the descriptive arithmetic `numericDelta = current - baseline`; the sign is not interpreted as good/bad, better/worse, improvement/regression, severity, materiality, or business impact. Text and boolean values use exact canonical equality only.

## Determinism and traceability

Entries are ordered lexically by semantic cohort hash, independent of repository row order. A paired entry retains baseline/current observation IDs and values; unmatched entries retain whichever observation exists plus a bounded classification reason. Same semantic inputs therefore produce canonical-equivalent output without clocks, randomness, locale ordering, network lookup, provider calls, or runtime AI.

`attentionCount` is exactly `total - unchanged`. It is a filtering count, not a priority score or rank.

## Bound calculation

Release 0.7 uses a hard **2,048 observations per snapshot** limit. The bound is derived from the already-accepted collection transport/persistence limit:

`64 parts × 32 observations per part = 2,048 observations per collection`.

Accepted adapters fit inside that ceiling:

| Accepted stream | Count ceiling from accepted source/observation packing |
| --- | ---: |
| WQT SiteOne | 1,024 observations |
| WQT Lighthouse | 2,048 observations |
| ZeroRank rankings | 1,920 observations |
| ZeroRank prompts | 2,048 observations |
| ZeroRank chats | 1,920 observations |
| ZeroRank sources | 1,024 observations |
| ZeroRank sourceUrls | 2,048 observations |

The byte-aware 64 KiB part limit can make an actual adapter collection smaller; these are count ceilings, not guaranteed payload capacities. A snapshot above 2,048 fails explicitly with `observation_limit_exceeded`; there is no truncation, sampling, hidden paging, or dropped observation.

The existing general `listObservations` read remains capped at 100 records. A `collectionId`-filtered read is permitted up to the same accepted 2,048-observation collection ceiling so the thin service can resolve any accepted collection without adding a new repository method or schema.

## Tenant-safe read service

`diffEvidenceCollections` accepts only two collection identifiers plus an already-issued trusted `TenantContext`. Collection IDs are selectors, never authority. The service performs only existing tenant-scoped reads and pure comparison:

1. `getCollection(context, baselineCollectionId)`;
2. `getCollection(context, currentCollectionId)`;
3. collection semantic compatibility validation;
4. `getCollectionProgress(context, collectionId)` for both sides and require persisted completion;
5. `listObservations(context, { collectionId })` for each compatible, fully persisted collection;
6. pure comparison.

There is no tenant-authority issuer import, repository write call, persistence of the report, HTTP route, provider/runtime call, or SQLite-specific logic in the analysis module. Existing tenant-scoped repository reads ensure a Beta context cannot resolve Alpha collections.

## Synthetic value proof

The tests include two separate synthetic longitudinal streams; they are never cross-correlated.

### WQT-style complete stream

Five unioned evidence entries demonstrate:

- observed zero unchanged;
- numeric change with descriptive delta;
- observed → unknown change;
- one complete-baseline `appeared` classification;
- one complete-current `missing_from_current` classification.

Deterministic summary:

- total reviewed evidence: **5**
- unchanged: **1**
- attention/non-unchanged: **4**

### ZeroRank-style partial stream

Four unioned evidence entries demonstrate:

- unchanged text evidence;
- unknown → observed change;
- baseline-only evidence under partial current coverage → `coverage_unknown`;
- current-only evidence under partial baseline coverage → `coverage_unknown`.

Deterministic summary:

- total reviewed evidence: **4**
- unchanged: **1**
- attention/non-unchanged: **3**

Combined synthetic proof: **9 total / 2 unchanged / 7 attention**. This demonstrates filtering behavior only; it is not a public ROI, time-savings, ranking, or outcome claim.

## Explicit exclusions

Release 0.7 does not implement cross-provider correlation, generic correlation, direction policy, universal scoring, severity/materiality/business-impact scoring, priority levels, inference, recommendations, causal conclusions, remediation, actions, human-review lifecycle, operator UI, network/provider access, WQT execution, ZeroRank/Activepieces runtime access, AI/BYOK, cloud deployment, or Release 0.8.
