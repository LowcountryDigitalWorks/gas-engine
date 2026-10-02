# ADR 0018 — Repeatable Managed-Service Run & Evidence Intake

Status: **Proposed / Release 0.18 candidate — NOT ACCEPTED**

Date: 2026-10-02  
Issue: #65  
Candidate PR: #67

## Context

Accepted Release 0.17 provides an authoritative local operator workspace and customer-report composer, but one LDW engagement is not yet reproducible as a single deterministic service-run record/package. Repeated manual reconciliation of source handling, prior-run context, follow-up state, workspace/report identity, and exported files creates avoidable delivery friction.

A hosted workflow platform, reporting SaaS, new service-run database, queue, scheduler, or customer portal would expand cost and security/support burden before that complexity is justified.

The private WQT consumer/history design in Issue #63 also needs public reusable WQT minor-3 adaptation and exact multipart snapshot reconstruction, but its private runtime/history/retention behavior is a separate authority boundary.

## Decision

Add one application-local Release 0.18 service-run composition layer.

The trusted host supplies existing repositories, already-issued TenantContext, original Release 0.17 workspace request, bounded operational receipts, and optionally one prior Release 0.18 run summary plus one accepted Release 0.17 customer-report request.

Release 0.18:

1. recomputes the authoritative Release 0.17 workspace;
2. records strict non-authoritative source receipts;
3. projects accepted Release 0.16 readiness exactly;
4. optionally compares exact prior-run operational state;
5. optionally calls the accepted Release 0.17 report composer/renderer;
6. emits deterministic local file payloads and a manifest with exact hashes/byte counts/classification.

No caller-created workspace is accepted as authority.

## WQT prerequisite

Deliberately accept WQT v1 minor 3 as a new semantic mapping identity: `3.0.0 / v1.3 / configuration revision 3`. Preserve minor 1 and 2 identities exactly and keep cross-minor comparison as an ordinary Release 0.7 collection discontinuity.

Use the generic accepted typed-fact machinery; do not encode minor-3 fact-name business logic.

Add one pure `resolveWqtProviderSnapshots(...)` helper that verifies adapter multipart output and reconstructs exact complete SiteOne/Lighthouse snapshots. It stores nothing and performs no provider/network work.

## Source receipts and authority

Receipts are operational provenance only. They cannot include trusted scope/TenantContext fields, override accepted readiness, create provider truth, or authorize persistence/provider access.

Authoritative readiness continues to come from the recomputed Release 0.15/0.17 workspace.

## Prior-run comparison

A prior run summary is history/provenance, not authority. Scope and target must match exactly.

Keep the source managed-service run identity separate from one deterministic application-local compact-summary identity. The compact-summary identity canonically binds every field used by Release 0.18 prior-run comparison. Parsing recomputes and verifies that identity; stale identity plus mutated projection fails closed. The current run records both the source prior run ID and the exact compact-summary ID and binds that exact summary ID into current run semantics.

Prior decision readiness reuses the single accepted Release 0.16 readiness schema from the decision-cycle seam rather than a Release 0.18 string/list copy.

This identity is deterministic integrity/provenance only, not authentication. No signature, HMAC, secret, credential, or key-management layer is introduced. A deliberately changed valid projection is allowed only with its correspondingly different deterministic compact-summary identity.

Comparison is exact and operational only. Attention continuity uses exact IDs and the neutral vocabulary `carried_forward`, `new_in_current`, and `not_present_in_current`. Absence in the current run is never relabeled as resolved, fixed, improved, or reduced business impact.

Evidence-level longitudinal semantics remain owned by Release 0.7 and source-specific accepted modules.

## File package

The package is file-based, not persisted in a new database. Manifest entries bind exact UTF-8 payload hashes/byte counts, deterministic filenames, explicit customer-safe/internal classification, and source run/workspace/report identities.

No ZIP/archive dependency is introduced.

## Consequences

Benefits:

- one engagement becomes reproducible using existing accepted semantics;
- repeated source-handling and run reconciliation becomes deterministic;
- previous-run context can be carried without a new history database;
- file classifications and exact hashes support controlled downstream handling;
- the public WQT seam can later be reused by a separately authorized private consumer;
- incremental recurring cash remains $0 for the bounded candidate.

Constraints:

- provider reads/downloads and scheduling remain outside G.A.S.;
- service-run files are not a durable database or retention system;
- the trusted host is responsible for authorized storage/transport;
- customer report prose remains explicitly human authored;
- no delivery automation is included.

## Rejected alternatives

Release 0.18 does not add:

- a service-run/history database;
- new canonical wire schemas;
- reporting/workflow/BI SaaS;
- queue/scheduler/background worker;
- provider polling or GitHub artifact downloading;
- credentials/OAuth;
- hosted dashboard/server/listener;
- customer portal;
- PDF or ZIP library;
- runtime AI;
- private wqt-operations history/retention/runtime implementation.

## REPORT-AUTO boundary

Downstream REPORT-AUTO remains separately governed. Release 0.18 documents only the seam from accepted run/package output to a future deterministic adapter for `ldw.client-report-evidence.v1`.

The private Issue #63 `ldw.gas-wqt-semantic-change.v1` runtime/history work remains unimplemented.

## Acceptance

This ADR remains proposed until Product whole-pack exact-head review, any authorized integrated correction, final independent exact-head review, protected-main merge, and post-merge verification are complete.
