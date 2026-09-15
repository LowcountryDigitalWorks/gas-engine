# ADR 0004 — Adapt normalized WQT evidence; do not rebuild sensing

- Status: Release 0.5 candidate
- Date: 2026-09-14
- Decision scope: bounded WQT normalized-evidence adapter proof

## Context

Website Quality Toolkit already owns the approved SiteOne Crawler and Lighthouse sensing workflow and emits a normalized `ldw.website-quality.v1` artifact. G.A.S. needs provider-neutral canonical evidence with trusted scope, provenance, explicit missingness, deterministic identity, and bounded persistence parts. Re-running scanners, importing WQT source, or adding a provider/network client would duplicate WQT and expand Release 0.5 beyond the authorized proof.

The inspected WQT source of truth is commit `3b6205f3fd3208e6ec9d896da0be4b35a2c1c26e`, tree `6526dd029ddd19cc31afa4712b0912281bca5373`. It emits major schema `ldw.website-quality.v1`, minor `1`, WQT `siteId` and target, evidence-only gate metadata, separate SiteOne/Lighthouse source sections, and a deterministic flattened observation copy.

## Decision

Implement one pure/local adapter in `src/adapters/wqt.ts` that accepts exact normalized WQT bytes plus explicit trusted caller configuration. Support exactly WQT v1/minor1 in this release; future minors require deliberate review.

The adapter:

- verifies strict source shape, evidence-only/no-threshold policy, expected tools, site/target match, and flattened/nested reconciliation;
- never issues tenant authority and never imports authentication/tenant-authority internals;
- produces separate `siteone` and `lighthouse` G.A.S. collection streams;
- maps bounded WQT evidence items to deterministic source units and evidence-only observations;
- preserves zero distinctly from missing/null states;
- preserves source/tool version in integrity and cohort comparison context;
- uses trusted canonical timing and never promotes SiteOne's timezone-less `executedAt` into a G.A.S. timestamp;
- derives SHA-256 identities/integrity without truncating collision material;
- carries source availability only from trusted configuration;
- packs source units byte-aware into accepted `CollectionBatch` parts and validates every final batch with existing persistence validation;
- performs no scanner execution, artifact download, provider networking, persistence, listener work, recommendation/priority logic, or external action.

Adapter identity is `ldw-wqt-normalized` mapping version `1.0.0`; source schema is `ldw.website-quality` `v1.1`. Package release `0.5.0` is deliberately a separate lifecycle version.

## Consequences

G.A.S. can consume normalized WQT evidence without coupling its runtime to WQT or duplicating commodity sensing. SiteOne and Lighthouse remain independently replaceable provider streams. The artifact's identifiers, URL, scores, and hashes remain evidence and never establish tenant/site/provider-connection authority.

Each provider collection may span multiple atomic persistence parts. Canonical `receivedCount` means total adapted source units for that provider collection. Every unit and its observations stay in the same part. The adapter fails rather than truncate when 1 MiB input, 64-part, 16-source, 32-observation, 65,536-byte canonical, 1,024-source-unit, duplicate-key, or one-unit representability bounds cannot be met.

Source hashes establish deterministic integrity references, not authenticity or retrievability. WQT artifact retention remains outside this release; availability must be supplied explicitly by the trusted caller.

## Rejected alternatives

- **Build a WQT scanner inside G.A.S.** Rejected as duplication and scope expansion.
- **Call WQT/GitHub/provider APIs at runtime.** Rejected; Release 0.5 is import/export only and requires no credentials/network.
- **Treat WQT siteId/target as G.A.S. authority.** Rejected; untrusted evidence never creates authority.
- **Combine SiteOne and Lighthouse into a universal WQT/G.A.S. score.** Rejected; provider evidence remains distinct and no LDW quality threshold is invented.
- **Infer UTC from SiteOne `executedAt`.** Rejected because the normalized value is timezone-less.
- **Accept unknown future WQT minor versions automatically.** Rejected; additive upstream changes still require adapter review when this consumer depends on exact reconciliation and identity semantics.
