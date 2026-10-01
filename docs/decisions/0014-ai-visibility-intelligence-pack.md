# ADR 0014 — Provider-preserving AI visibility intelligence over bounded exported evidence

- Status: Proposed / Release 0.14 draft candidate
- Date: 2026-09-30
- Issue: #44

## Context

Accepted G.A.S. through Release 0.13 can normalize provider evidence, compare compatible longitudinal observations, preserve human review/outcome context, analyze Search Analytics/page focus, and show provider-preserving discovery diagnostics.

AI-visibility evidence adds a new semantic risk: Bing AI Performance reports sampled/aggregated citation evidence and grouped grounding-query phrases, while accepted ZeroRank exposes vendor-specific visibility/rank/prompt/chat/source metrics. Flattening these into a universal score or directly comparing their magnitudes would invent equivalence that the providers do not establish.

Current public Bing documentation also does not establish an AI Performance API contract that Release 0.14 may rely upon.

## Decision

Release 0.14 candidate adds:

1. strict sanitized `ldw.bing-ai-performance-evidence.v1` minor-0 import;
2. explicit provider identity `bing-webmaster-ai-performance`;
3. existing canonical collection/source/observation adaptation only;
4. bounded application-local Bing sidecar;
5. accepted Release 0.6 ZeroRank adapter reuse before a bounded application-local projection;
6. explicit versioned readiness/comparability policy;
7. provider-specific descriptive baseline/current change;
8. provider-specific citation/source concentration;
9. narrowly bounded cross-source explicit-presence divergence;
10. optional exact caller mapping for cohort-coverage divergence;
11. optional accepted Release 0.10/0.11/0.12 descriptive context;
12. deterministic site report;
13. bounded escaped static read-only HTML report.

No new canonical wire schema or persistence schema is introduced.

## Bing semantics

Bing evidence is always labeled sampled/aggregated.

`complete_export_view` describes only the exported provider view. It is not population completeness.

Grounding queries are provider-grouped phrases, not exact user prompts.

Provider preview intents/topics remain provider evidence.

Citation activity does not mean ranking, authority, quality, traffic, engagement, business importance, or causality.

## ZeroRank semantics

Release 0.6 remains the source-validation boundary.

Release 0.14 analysis receives sanitized ZeroRank bytes plus trusted adapter configuration, then synchronously creates the bounded projection through `projectValidatedZeroRankVisibility(...)` inside the analysis boundary. Caller-created or caller-mutated projections are not authoritative inputs. The projection may preserve exact provider fields after accepted validation but cannot change Release 0.6 canonical output or expand its authority. Artifact-v1 rankings, chats, sources, and source-URL endpoints retain unknown exhaustion when successful; Release 0.14 must not promote them to complete.

ZeroRank rank, visibility, sentiment, mentions, growth, usage and share-style metrics remain vendor-specific. They are not converted to Bing citation units.

## Cross-provider boundary

Cross-provider raw magnitudes are never blended or directly compared.

A presence divergence requires:
- compatible trusted target/scope;
- each provider independently ready enough for the predicate;
- explicit positive evidence versus explicit provider-specific complete zero/absence.

Unknown, filtered, sampled gaps, incomplete endpoints, and unproven missing rows remain unknown.

Cohort-coverage divergence additionally requires exact caller-provided Bing-grounding-query ↔ ZeroRank-prompt identity mapping. No fuzzy, semantic, embedding, or runtime-model matching is allowed.

## Optional context boundary

Accepted Search Analytics, change/outcome, and page-focus context is attached only by exact trusted scope/page linkage and remains descriptive. It cannot mutate AI-visibility findings.

## Rejected alternatives

- Bing AI Performance API client without an established authorized API contract;
- ZeroRank client/networking inside G.A.S.;
- second independent ZeroRank parser;
- universal AI/AEO/GEO score;
- Bing/ZeroRank magnitude blending;
- grounding-query = exact-prompt assumption;
- fuzzy/embedding/LLM prompt-query matching;
- sampling gap = absence;
- automatic root-cause inference;
- automatic priority/remediation/content recommendation;
- new persistence;
- runtime AI/BYOK;
- customer/private fixture data;
- Release 0.15 implementation.

## Security, privacy and cost

No provider networking, credential, OAuth, secret, prompt execution, runtime AI, embedding, crawler, SERP scraper, scheduler, worker, persistence migration, cloud resource, PHI, CUI, customer/private evidence, dependency, paid vendor, or subscription is added.

Public fixtures remain synthetic.

Incremental recurring cost target remains $0.

## Acceptance

This ADR remains **Proposed** while PR #47 is a draft Release 0.14 candidate. Product and final independent exact-head review must occur before merge/acceptance. Acceptance metadata must be updated only after that release process completes.
