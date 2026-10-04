# Release 0.19 — Internal Portfolio / Multi-Site Operations Console

Release 0.19 is an **LDW-internal, pure/local operational projection** over trusted portfolio inventory plus zero or one already-generated accepted Release 0.18 `ManagedServiceRun` per engagement. It does not create a customer portal, generic SEO dashboard, task system, provider poller, or shared cross-customer analytics store.

Issue #69 is the authoritative Product-frozen release contract while the candidate is under review.

## Authority model

Trusted inventory/runtime configuration supplies:

- stable opaque engagement ID and bounded internal label;
- exact `tenantId` / `siteId` / `siteScopeRevisionId`;
- exact trusted target;
- zero or one current accepted Release 0.18 managed-service run artifact;
- one explicit versioned source-family freshness policy.

A service-run artifact is operational evidence/provenance only. It cannot create portfolio authority. When a current run is supplied, Release 0.19 strictly verifies the complete Release 0.18 application-local run, recomputes its deterministic run identity, and then requires exact inventory/run scope and target equality.

Duplicate engagement IDs and duplicate exact trusted scopes fail closed. The same `siteId` may legitimately exist under different tenants; tenant identity remains part of the exact scope. Cross-tenant run substitution fails closed.

## Strict Release 0.18 run import

`src/operator/service-run-import.ts` adds an adjacent strict import verifier for already-generated Release 0.18 `ManagedServiceRun` JSON. It does not change Release 0.18 generation semantics.

The verifier:

- accepts only version `0.18.0` and known fields;
- reuses accepted source-receipt parsing;
- validates bounded/unique receipt, readiness, source-manifest and Attention identities;
- validates report/follow-up/provenance/prior-comparison invariants;
- recomputes the accepted Release 0.18 deterministic run identity material;
- rejects semantic mutation with a stale run ID;
- creates no tenant context, persistence, provider access, credential, or canonical wire schema.

## Freshness semantics

Freshness is **operational metadata only**. It never rewrites accepted Release 0.15/0.17 module readiness or turns missing/unavailable data into zero.

For a `supplied` source receipt, the deterministic freshness anchor order is:

1. `sourceWindow.end`;
2. `collectedAt`;
3. `receivedAt`;
4. otherwise `not_evaluable`.

Each source family is evaluated only against the exact caller-supplied `maxAgeSeconds` policy for the portfolio `evaluatedAt` timestamp. A future freshness anchor fails closed. A supplied source without a configured rule or usable timestamp remains explicitly `not_evaluable`.

Exact source states remain separate:

- `supplied`;
- `not_supplied`;
- `unavailable`;
- `unsupported`.

Non-supplied source states are never relabeled `stale`. `fresh` never means healthy, correct, successful, or high-performing.

## Per-engagement projection

The deterministic per-engagement projection contains only bounded operational navigation state:

- trusted engagement identity, exact scope and target;
- current run present / no current run;
- exact run/workspace identity and run period when present;
- exact source receipt state plus operational freshness;
- accepted module readiness copied unchanged from Release 0.18;
- exact current Attention count;
- exact accepted Release 0.16/0.18 follow-up readiness when present;
- exact Release 0.18 report state/ID when present;
- unranked factual operational exception entries;
- explicit limitations.

The portfolio model does not expose cross-engagement observations, analytics, recommendation prose, report prose, provider payloads, or customer-performance metrics.

## Factual exception register

Release 0.19 uses a fixed unranked navigation vocabulary:

- `no_current_run`;
- `source_not_supplied`;
- `source_unavailable`;
- `source_unsupported`;
- `source_freshness_unknown`;
- `source_stale`;
- `attention_present`;
- `report_not_requested`.

These are filter/navigation facts. They are not severity, priority, universal health, business impact, recommendation, remediation, or task state.

## Cross-engagement summary

Portfolio roll-ups aggregate operational metadata only:

- engagement and current-run counts;
- engagements with exact Attention count greater than zero;
- counts by exact source state;
- counts by operational freshness state;
- counts by accepted module readiness;
- counts by exact decision/follow-up readiness;
- counts by exact report state;
- counts by factual exception kind.

Release 0.19 intentionally does **not** roll up or benchmark customer traffic, clicks, impressions, CTR, rank, AI visibility, citations, findings, recommendations, or measured outcomes. There is no cross-customer league table, best/worst client label, priority queue, or universal portfolio score.

## Deterministic outputs

`composePortfolioOperationsConsole(...)` emits an application-local model with:

- `version = 0.19.0`;
- deterministic `portfolio-operations:<sha256>` semantic identity;
- classification `ldw_internal`;
- bounded engagement projections;
- bounded operational summary;
- explicit limitations.

Input engagement order does not define identity; engagements and configured source-family policies are sorted deterministically. Semantic input/policy changes alter identity. HTML presentation does not define semantic identity.

Output ceilings:

- engagements: 64;
- receipts per accepted run: Release 0.18 maximum 64;
- JSON: 4,000,000 UTF-8 bytes;
- HTML: 6,000,000 UTF-8 bytes.

Bounds fail closed; there is no hidden paging or truncation.

## Browser console

`renderPortfolioOperationsHtml(...)` produces one self-contained **LDW INTERNAL** HTML document with:

- escaped inventory/run text;
- strict CSP with no network connection surface;
- no remote assets;
- no forms, write APIs, or downloaded action artifacts;
- no browser/local/session persistence;
- client-side presentation-only filters for engagement, current-run state, source state/freshness, accepted readiness, Attention presence, exact decision/follow-up readiness, exact report state, and factual exception kind;
- print support only.

Actual per-engagement decision/recommendation/measurement/outcome work remains in the accepted Release 0.17 workspace path.

## Synthetic proof

`npm run preview:portfolio` generates only public-safe synthetic artifacts under `local-artifacts/release-0.19-portfolio/`:

- `portfolio-operations.json`;
- `portfolio-operations.html`.

The preview contains three synthetic engagements across two synthetic tenants. Two tenants intentionally use the same `siteId` while preserving distinct exact scopes. It demonstrates:

1. a current run with fresh supplied evidence, Attention, and a present report;
2. a different current run with stale supplied evidence, an unavailable source, an unevaluable supplied source, and no requested report;
3. a trusted engagement with no current run;
4. deterministic operational-only roll-ups;
5. strict tenant/scope separation.

No real customer names, identifiers, evidence, analytics, credentials, PHI, CUI, payment data, or private WQT artifacts are used.

## Explicit exclusions

Release 0.19 adds no:

- database/table/migration or new persistence;
- canonical wire schema;
- provider networking/polling;
- scheduler/background worker/reminder/task lifecycle;
- unread/read persistence;
- customer portal or customer SaaS;
- report delivery;
- runtime AI;
- cloud resource;
- private WQT import/history/runtime change;
- REPORT-AUTO delivery;
- framework, charting library, or runtime dependency;
- scoring, priority, severity, business-impact, health, or customer-ranking semantics.

Provider reads, cadence, transport, schedules, runtime/job observability, and delivery remain owned by Automation & Agent Operations.
