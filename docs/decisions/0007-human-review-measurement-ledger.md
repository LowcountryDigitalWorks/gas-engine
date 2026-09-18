# ADR 0007 — Human review and measurement/outcome ledger

- **Status:** Accepted
- **Authority:** Issue #15
- **Accepted state:** Releases 0.1–0.8; Release 0.8 merged via PR #16

## Context

Release 0.7 can deterministically identify repeated evidence that is unchanged, changed, appeared, missing from current, or coverage-unknown. The next recurring LDW burden is reconstructing what a human reviewed, what recommendation was actually considered, what lifecycle decision was made, what was later measured, and what outcome was recorded.

Generic SEO/GEO/AEO recommendation generation, scoring, prioritization, content generation, and action workflows are already supplied by upstream/vendor products and are not the differentiated Release 0.8 problem.

## Decision

Release 0.8 proves a provider-neutral, tenant-safe service-history ledger:

> canonical observation evidence → human-authored recommendation revision history → explicit measurements → human-declared outcome

Canonical wire contracts `recommendation`, `measurement`, and `outcome` remain at schema version `1.0`. No inference generation or action implementation is introduced.

The implementation has three layers:

1. pure recommendation lifecycle/revision validation;
2. a tenant-safe local SQLite review-ledger repository;
3. a thin application service that resolves canonical observations through the accepted evidence repository before recording caller intent.

Recommendation creation is restricted to `internal_review`, `unassessed` priority, observation evidence, revision 1, and proposed lifecycle. Transitions are caller-driven and append immutable revisions with stale-revision rejection. Rejected/superseded are terminal; accepted may only be superseded. Acceptance creates no action.

Measurements are caller-invoked records from explicitly selected canonical observations. Follow-up comparability reuses accepted cohort/methodology/chronology rules. Due windows create no scheduler permission.

Outcome direction is human-declared. Numeric sign does not imply improvement/regression. Directional outcomes require resolved comparable measurements. Release 0.8 permits only `none` or `technical_verification` attribution at the application boundary.

Local storage migration 2 adds exactly three tenant/site/scope-owned tables: recommendation revisions, measurements, and outcomes. General review lists are bounded at 100. Existing evidence storage remains intact and exact v1 schema/checksum is verified before upgrade.

## Consequences

Benefits:

- preserves service history without reconstructing it from vendor dashboards, spreadsheets, chat, or memory;
- maintains canonical evidence provenance and tenant isolation;
- keeps human judgment explicit instead of inventing provider-neutral scoring or causal semantics;
- remains local, deterministic, portable, and $0 incremental recurring cost for the bounded proof.

Tradeoffs:

- callers remain responsible for human review decisions and explicit measurement/outcome recording;
- deleted evidence cannot be silently substituted; evidence retrieval fails closed;
- no UI, scheduler, provider polling, automatic recommendations, actions, or cloud deployment exists in this release.

## Rejected alternatives

- automated recommendation generation or ranking;
- universal severity/materiality/business-impact scoring;
- automatic cross-provider correlation;
- AI-generated rationale/content;
- action/remediation execution;
- adding scheduler/background jobs for due windows;
- expanding canonical 1.0 contracts merely to implement the local proof;
- storing generic metadata, provider payloads, credentials, sessions, or UI state.

## Acceptance gate

Product ORCH2 accepted the independently reviewed Release 0.8 candidate and it was merged via PR #16. Release 0.9 remains separately gated; this ADR grants no action/remediation, automated recommendation/inference/ranking/correlation, provider/network, scheduler, UI, AI/BYOK, cloud, or customer-evidence authority.
