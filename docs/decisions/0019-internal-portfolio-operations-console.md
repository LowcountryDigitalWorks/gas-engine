# ADR 0019 — Internal Portfolio / Multi-Site Operations Console

- Status: Proposed for Release 0.19 Product review
- Date: 2026-10-04
- Issue: #69

## Context

Accepted Release 0.18 makes one managed-service engagement reproducible as a deterministic local service run. LDW's next operator problem is portfolio-level navigation across several trusted engagements without reopening each run merely to learn whether a current run exists, a source is unavailable or stale under explicit policy, accepted Attention exists, a decision/follow-up state is present, or a current customer report exists.

Commodity dashboards already provide cross-client metrics, charts, comparisons, and generic reporting. Rebuilding those capabilities would duplicate mature products and would encourage cross-customer semantic flattening that G.A.S. intentionally avoids.

## Decision

Build one **pure/local application composition** for LDW-internal service operations:

```text
trusted portfolio inventory
  + zero-or-one accepted Release 0.18 ManagedServiceRun per engagement
  + explicit versioned source-family freshness policy
  -> strict full-run identity verification
  -> exact inventory/run scope + target reconciliation
  -> deterministic per-engagement operational projection
  -> unranked factual exception register
  -> bounded operational-only roll-ups
  -> deterministic LDW-internal JSON
  -> self-contained LDW-internal HTML
```

Trusted inventory remains authoritative. A run artifact cannot mint tenant, site, scope, target, or portfolio authority.

The Release 0.18 generation path remains unchanged. Release 0.19 adds an adjacent strict full-run import verifier that accepts only the already-defined application-local Release 0.18 model and recomputes its existing semantic identity.

## Freshness policy

Freshness is caller-supplied operational policy, not evidence meaning. For a supplied source receipt, use this anchor order:

1. `sourceWindow.end`;
2. `collectedAt`;
3. `receivedAt`;
4. otherwise not evaluable.

Compare the anchor with trusted portfolio `evaluatedAt` and the exact configured source-family maximum age. Future anchors fail closed. Missing/unavailable/unsupported source states remain separate and are never converted to stale or zero. Freshness never overwrites accepted module readiness.

## Portfolio semantics

The per-engagement projection may expose exact operational metadata only: inventory identity/scope/target, current-run identity/state, workspace/run period, source receipt state/freshness, accepted readiness, exact Attention count, accepted decision/follow-up readiness, exact report state/ID, factual exceptions, and limitations.

Cross-engagement summaries may count only those operational states. They must not aggregate or benchmark traffic, clicks, impressions, CTR, rank, AI visibility, citations, findings, recommendation prose/content, report prose, or measured customer outcomes.

No universal portfolio health score, client ranking, priority, severity, business impact, automatic recommendation, or automatic task is defined.

## Browser boundary

The HTML console is presentation only. It may filter and print the deterministic model, but it has no network, remote assets, authoritative browser persistence, forms, direct writes, action requests, scheduler, or delivery surface. Accepted per-engagement Release 0.17 remains the workbench for decision/recommendation/measurement/outcome activity.

## Rejected alternatives

### Generic multi-client SEO/AI dashboard

Rejected. Agency/reporting/BI products already provide commodity portfolio metrics and charting. G.A.S. differentiation is deterministic service-operations semantics over accepted run state, not another metrics dashboard.

### Database-backed portfolio control plane

Rejected for Release 0.19. Trusted inventory plus accepted run artifacts are sufficient for the bounded proof. New persistence would create lifecycle, migration, retention, backup, and deployment obligations without evidence of need.

### Scheduler/task/reminder engine

Rejected. Release 0.16/0.18 already defines exact readiness semantics. Automation & Agent Operations owns cadence, schedules, triggers, transport, and runtime observability.

### Private WQT runtime integration

Rejected from public Release 0.19. Private WQT execution/history remains separately governed and is not required to prove the portfolio composition over synthetic accepted Release 0.18 run artifacts.

## Consequences

Positive:

- reuses accepted 0.18 operational semantics;
- preserves tenant/site/scope isolation;
- reduces manual multi-engagement reconciliation;
- adds no recurring cost, dependency, database, cloud runtime, or provider credential;
- keeps customer-performance data out of the cross-engagement summary.

Tradeoffs:

- inventory/run artifact collection remains an external runtime/Automation concern;
- freshness is intentionally explicit policy rather than inferred health;
- no durable read/unread/task state exists;
- no customer portal or live hosted dashboard exists.

## Security, privacy, and cost

The public repository and preview use synthetic/public-safe data only. No customer evidence, private provider payload, credential, PHI, CUI, payment data, or private WQT artifact belongs in this release.

Incremental recurring cash target: `$0`.

No new runtime dependency, cloud resource, persistence, canonical schema, provider networking, runtime AI, or paid service is introduced.
