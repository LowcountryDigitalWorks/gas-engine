# ADR 0008 — Read-only operator case view and printable local report

- **Status:** Proposed Release 0.9 candidate; not accepted
- **Date:** 2026-09-18
- **Accepted base:** Releases 0.1–0.8
- **Authority:** Issue #18

## Context

Accepted Release 0.7 can compare compatible persisted evidence snapshots and accepted Release 0.8 can preserve human recommendation review history, measurements, and human-declared outcomes. Before Release 0.9, an LDW operator still has to reconstruct that service-history case across multiple application/repository calls.

Existing SEO/AEO platforms already provide commodity provider dashboards, visibility scores, recommendation queues, and reporting. Rebuilding those capabilities would not differentiate G.A.S.

## Decision

Release 0.9 proves one compact provider-neutral read-only operator case view:

mechanical evidence change → human-authored decision → explicit measurement → human-declared outcome.

Implement one tenant-safe read-only assembler over accepted Release 0.7/0.8 read surfaces, one pure deterministic static HTML presentation/renderer, and one development-only synthetic local preview generator.

The assembler requires an already-issued TenantContext, explicit Scope, explicit baseline/current collection IDs, and an explicit selected recommendation ID. IDs never create authority.

The renderer has no repository/filesystem/network capability, escapes all dynamic values, requires no JavaScript or external resource, includes print CSS, and enforces a bounded static output.

## Consequences

- No new persistence method/table/migration or UI-state storage is required.
- Existing 100-record/revision ledger bounds and 2,048-observation diff bounds remain authoritative and fail rather than truncate.
- Coverage uncertainty remains visible.
- Numeric deltas stay non-evaluative.
- Recommendations are displayed as HUMAN-AUTHORED with internal_review / unassessed semantics.
- Outcome direction is displayed only as HUMAN-DECLARED OUTCOME with rationale and attribution.
- The same standalone HTML is the local page and printable report preview.
- Browser Print / Save as PDF requires no product PDF dependency/service.
- Package remains private, target version 0.9.0, zero new dependencies, $0 incremental recurring cost.

## Rejected alternatives

- provider-specific SEO/AEO dashboard or generic recommendation queue;
- new persistence/UI-state schema for display convenience;
- HTTP server/listener or production customer portal;
- React/Vue/Svelte/CSS/chart framework;
- PDF-generation package/service;
- client-side fetch/runtime data loading;
- runtime AI/BYOK or generated interpretation;
- automated ranking, priority, correlation, recommendation, or action/remediation.

## Boundary

This ADR grants no production authentication, provider/network access, customer evidence, cloud deployment, external action, or Release 1.0 authority.

It remains proposed until Product ORCH2 accepts an independently reviewed exact Release 0.9 candidate.
