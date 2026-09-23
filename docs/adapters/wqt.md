# WQT normalized-evidence adapter

Release 0.5 established the bounded **import/export adapter proof** for already-normalized Website Quality Toolkit (WQT) evidence. GAS-SEM-001 adds deliberate support for accepted WQT v1 minor2 typed facts without changing that runtime boundary. The adapter does not run SiteOne or Lighthouse, dispatch WQT workflows, download GitHub artifacts, fetch URLs, use provider credentials, import WQT source at runtime, or establish tenant authority.

The adapter was designed against accepted WQT main commit `3b6205f3fd3208e6ec9d896da0be4b35a2c1c26e` (tree `6526dd029ddd19cc31afa4712b0912281bca5373`). That commit is design evidence only, not a runtime pin or dependency.

## Public API and accepted input

[`src/adapters/wqt.ts`](../../src/adapters/wqt.ts) exports `adaptWqtNormalizedEvidence(bytes, trustedConfig)` plus its bounded config/result/error types and version constants. Input is exact UTF-8 bytes, capped at **1 MiB** before decoding.

Two deliberately reviewed source contracts are accepted:

- `schemaVersion === "ldw.website-quality.v1"`, `schemaMinorVersion === 1` — historical Release 0.5 semantics;
- `schemaVersion === "ldw.website-quality.v1"`, `schemaMinorVersion === 2` — GAS-SEM-001 typed-fact semantics.

Unknown future minor versions fail closed until deliberately reviewed. Minor1 remains strict and does not accept a `facts` field. Minor2 permits the accepted bounded SiteOne `facts[]` contract only; Lighthouse remains strict and does not accept `facts`. The normalized artifact must also retain `evidenceOnly: true`, `qualityThresholdsApplied: false`, `siteOneCiModeEnabled: false`, the expected `SiteOne Crawler` / `Lighthouse` tool identities, and strict recognized fields.

The top-level flattened `observations` array must exactly equal the deterministic merged/sorted copies under `sources.siteone.observations` and `sources.lighthouse.observations`. Contradictory duplicate representations fail instead of choosing one.

## Trusted configuration and authority separation

The caller supplies trusted configuration containing:

- G.A.S. scope: tenant, site, and site-scope revision;
- expected WQT `siteId` and exact canonical HTTPS target origin;
- SiteOne and Lighthouse provider-connection IDs;
- canonical `observedAt`, `startedAt`, `endedAt`, `collectedAt`, and `receivedAt` timestamps;
- explicit source availability for each provider.

The artifact's WQT site ID and target must match those expectations, but neither creates authority. Evidence cannot select the G.A.S. tenant/site/scope or provider connection. The adapter imports no authentication or tenant-authority module and never issues `TenantContext`; persistence/application callers still need the already-accepted trusted authority boundary.

## Provider split and identifiers

One WQT normalized artifact becomes two replaceable provider streams:

| Stream | G.A.S. provider ID | Trusted connection |
| --- | --- | --- |
| SiteOne | `siteone` | `trustedConfig.providerConnectionIds.siteone` |
| Lighthouse | `lighthouse` | `trustedConfig.providerConnectionIds.lighthouse` |

Adapter identity remains `ldw-wqt-normalized`, but mapping/source semantics are deliberately minor-specific:

| WQT contract | Adapter mapping | Source schema | Method configuration revision |
| --- | --- | --- | ---: |
| v1 minor1 | `1.0.0` | `v1.1` | 1 |
| v1 minor2 | `2.0.0` | `v1.2` | 2 |

The mapping change is semantic, not a package-release claim. Minor1 and minor2 therefore cannot pass Release 0.7 collection compatibility as though they were the same longitudinal stream. Cross-minor comparison fails as an ordinary collection discontinuity; the generic comparator contains no WQT/SiteOne special case.

Source-record external IDs prefer readable provider/kind/key material when it fits the existing opaque identifier contract; otherwise the complete key is represented by a full SHA-256-derived ID. Storage-row, observation, collection, and idempotency IDs are deterministic SHA-256-derived identifiers and are never collision-prone truncations.

The exact input-byte SHA-256 is returned as `inputSha256` for diagnostic integrity. Semantic collection identity is derived from validated normalized evidence plus trusted configuration rather than JSON formatting, so whitespace/object formatting does not create a new semantic run.

## Source units and observations

Every source unit carries SHA-256 `canonical_json_v1` integrity over the relevant normalized source slice plus WQT schema/site/provider identity. Availability comes only from trusted configuration; a digest does not claim the original artifact remains retrievable.

### SiteOne

| Source unit | Observation mapping |
| --- | --- |
| overall score | numeric `wqt-siteone-overall-score`; null becomes explicit `unknown` |
| each unique category score | numeric `wqt-siteone-category-score`; null becomes explicit `unknown` |
| each unique finding/summary item | text `wqt-siteone-source-status`; null becomes explicit `unknown` |
| each valid minor2 typed fact on a finding | one ordinary typed observation `wqt-siteone-fact-<fact-id>` |

For a minor2 fact, cohort identity uses the same finding surface plus deterministic suffix `fact:<fact-id>`. Number, text, and boolean map to the existing canonical observed value types. Explicit `null` maps to canonical `unknown` with a deterministic normalized-fact missingness reason. A supplied fact unit is preserved as the canonical metric unit.

Facts are sorted by ASCII fact ID before source hashing and observation construction, so fact input order and JSON formatting do not change semantic collection/observation output. The complete normalized finding slice, including facts and display message, remains covered by ordinary source integrity. A wording-only message change can therefore change provenance/source identity while canonical status/fact values remain mechanically unchanged.

The G.A.S. adapter is a defensive consumer of the accepted minor2 fact contract: at most 8 facts, bounded/patterned IDs and units, closed objects, number/text/boolean type matching, safe finite numeric bounds, 256-code-unit text bound, duplicate-ID rejection, and strict unknown keys. Unit `count` remains a numeric count semantic and accepts only explicit null or a non-negative safe integer. No finding code is special-cased in the mapping.

Finding message/name/label/command and other source display material remain only in the hashed source slice. SiteOne source scores are scanner evidence with unit `siteone_source_score`, not an LDW quality scale.

### Lighthouse

| Source unit | Observation mapping |
| --- | --- |
| each unique category score | numeric `wqt-lighthouse-category-score`; null becomes explicit `unknown` |
| each unique audit | numeric `wqt-lighthouse-audit-score`; null becomes explicit `unknown` |
| audit `numericValue` when present | additional numeric `wqt-lighthouse-audit-numeric`, preserving bounded `numericUnit` when supplied |

Titles/display strings remain source evidence. Lighthouse source scores use `lighthouse_score_0_to_1` and remain evidence, not LDW policy.

Numeric zero remains an observed zero. Missing/null never becomes zero. Duplicate category/finding/audit keys fail closed rather than silently deduplicate.

## Time, provenance, and comparability

WQT currently exposes a timezone-less SiteOne `executedAt` such as `2026-08-16 00:00:00`. Release 0.5 **does not guess UTC or promote that value**. It remains only within the hashed SiteOne source material.

Canonical source/provenance time uses the trusted caller's `observedAt` as a point window. Cohorts declare:

- `alignment: point`
- `durationSeconds: 0`
- `timezone: UTC`

Collection lifecycle timestamps come from trusted configuration and are validated by existing G.A.S. contract chronology checks.

Provider/tool versions remain visible in source integrity and cohort `dimensions.configuration`. Adapter mapping/source-schema/method versions are also comparison-visible. A tool-version or WQT minor semantic-mapping change therefore becomes an explicit discontinuity rather than an unexplained site change.

## Deterministic multipart packing

The adapter produces ordinary accepted `CollectionBatch` values. Every source unit and all observations derived from it stay in the same part.

Packing is deterministic and byte-aware:

1. build complete source units in semantic provider/key order;
2. greedily try each whole unit;
3. enforce at most 16 sources and 32 observations;
4. canonicalize each candidate using worst-case `part: 64, parts: 64`;
5. close the current part before a unit would exceed the 65,536-byte canonical bound;
6. compute the actual part count;
7. rebuild with actual part/parts values;
8. pass every final part through existing `parseCollectionBatch` validation.

The collection's canonical `receivedCount` is the **total adapted source-unit count for that provider**, never the current part count or observation count. All parts share one deterministic collection idempotency identity.

The adapter fails explicitly when one unit cannot fit, more than 64 parts would be required, more than 1,024 source units exist, input exceeds 1 MiB, source keys are ambiguous, or any final batch cannot satisfy accepted G.A.S. validation. There is no truncation, record dropping, implicit paging, or cross-part observation reference.

## Security, privacy, cost, and scope

Release 0.5 and GAS-SEM-001 add no network/provider client, crawler, server/listener, cloud resource, credential handling, WQT runtime dependency, AI/BYOK path, recommendation/priority logic, quality gate, external action, ZeroRank, Search Console, or content-generation work. Tests use only a repository-owned synthetic `example-site` / `https://example.test` fixture.

No dependency is added and no SQLite schema changes. Incremental recurring cost remains **$0**. The package remains private with no software license grant, tag, or npm publication.
