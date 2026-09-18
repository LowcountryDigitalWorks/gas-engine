# Release 0.8 — human review and measurement/outcome ledger

**Status: accepted and merged through PR #16.** Issue #15 defines the Release 0.8 authority. Releases 0.1–0.8 are accepted on `main`.

Release 0.8 proves one narrow provider-neutral service-history path:

> canonical observation evidence → human-authored recommendation → immutable review revisions → explicit measurements → human-declared outcome

It is not a recommendation engine, priority scorer, cross-provider correlation engine, action system, scheduler, UI, or provider client.

## Application boundary

Accepted Release 0.8 adds three separable surfaces under `src/review/`:

- `lifecycle.ts` — pure Release 0.8 recommendation restrictions and caller-driven transition rules;
- `repository.ts` / `sqlite.ts` — tenant-safe bounded local persistence for review history;
- `service.ts` — thin application operations that resolve canonical observations through the accepted `EvidenceRepository` before persisting human/trusted-caller intent.

All operations require an already-issued trusted `TenantContext`. IDs, request bodies, recommendation scope, evidence scope, and provider evidence cannot mint authority.

No HTTP listener or route is added.

## Recommendation history

Release 0.8 accepts only human/trusted-caller authored canonical `recommendation` records with:

- `authorityClass = internal_review`;
- `priority.level = unassessed`;
- canonical `observation` evidence references only;
- revision `1` and lifecycle `proposed` for creation.

Caller-driven lifecycle transitions are:

- `proposed → in_review | rejected | superseded`;
- `in_review → accepted | rejected | superseded`;
- `accepted → superseded`;
- `rejected` and `superseded` are terminal.

Every transition requires the expected current revision and appends revision `n + 1`. Stale expected revisions fail closed. Previous revisions are never overwritten. Pure lifecycle transitions preserve evidence, rationale, priority basis, scope, ID, and creation time. Material human-authored content edits require an explicit additional revision and cannot silently change lifecycle or scope.

Accepted Release 0.8 bounds one recommendation history to at most 100 revisions and general recommendation lists to at most 100 current records per exact tenant/site/scope filter. Listing by lifecycle is filtering, not ranking.

Acceptance of a recommendation does not create or authorize an `action`.

## Canonical evidence resolution

Recommendation evidence is resolved through the existing tenant-safe evidence repository. The service verifies that each reference:

- is an observation reference;
- carries the same canonical scope as the recommendation;
- resolves under the supplied trusted context;
- resolves to an observation whose canonical cohort scope equals the owning recommendation scope.

If referenced evidence is absent or later deleted, evidence retrieval fails closed rather than substituting another record or retaining a stale application copy.

## Measurements

Release 0.8 reuses the unchanged canonical `measurement` 1.0 contract. A caller explicitly selects a canonical cohort observation. Measured result references are resolved from persistence and must match both the measurement cohort and the exact canonical persisted observation value. Caller-supplied measurement values cannot rewrite evidence.

Follow-up measurements resolve the referenced baseline in the same tenant/site/scope. Existing canonical/domain comparability checks remain authoritative for comparable measured baseline/follow-up pairs, including cohort identity, methodology, observed values, and chronology.

`dueWindow`, `not_due`, and `not_measured` are records only. They create no scheduler, polling permission, provider read, or background work.

An optional application-local `recommendationId` associates a measurement with review history for bounded retrieval. It does not alter the canonical measurement wire contract.

## Outcomes

Release 0.8 reuses the unchanged canonical `outcome` 1.0 contract. Outcomes are explicit human/trusted-caller declarations.

The application does not calculate `improved`, `regressed`, or `unchanged` from numeric sign or metric direction. Directional outcomes require resolved comparable persisted measurements forming one baseline/follow-up set. `inconclusive`, `not_due`, and `not_measured` remain first-class canonical states.

At the Release 0.8 application seam, attribution is limited to:

- `none`;
- `technical_verification`.

`association` and `controlled_evidence` remain separately gated even though the broader canonical 1.0 outcome contract can represent them. Optional `recommendationId` must resolve in the same trusted scope.

Outcome creation never creates action/execution authority.

## Local persistence migration

Accepted Release 0.8 includes local SQLite migration version 2 while preserving the accepted version-1 evidence schema and checksum as the upgrade base. Migration 2 adds only:

1. `recommendation_revisions` — append-only immutable canonical recommendation revisions;
2. `measurements` — canonical measurements plus an optional local recommendation association;
3. `outcomes` — canonical outcomes plus the canonical optional recommendation ID.

All three tables carry tenant/site/scope ownership, canonical payload/version/hash integrity checks, strict tables, deterministic indexes, and bounded query surfaces. Measurement follow-ups retain a tenant-scoped self-reference to their baseline, and repository persistence independently requires the baseline to resolve inside the same trusted tenant/site/scope within the atomic write transaction.

Fresh databases apply migrations 1 then 2. Existing exact version-1 databases are schema- and checksum-verified before migration 2 is applied. Version-2 reopen again verifies the complete live user schema, both migration checksums, and foreign-key integrity. Unknown, incomplete, altered, or future schemas fail closed.

No table is added for inference generation, actions, credentials, sessions, jobs, queues, schedulers, prompts/completions, raw provider payloads, generic metadata, or UI state.

## Operator proof surface

Without a UI, accepted Release 0.8 supports bounded deterministic retrieval of:

- current recommendations for one exact scope;
- current recommendations filtered by lifecycle state, without ranking;
- the full bounded revision history of one recommendation;
- canonical observations referenced by a current or historical recommendation revision;
- measurements for a scope or explicit recommendation association;
- outcomes for a scope or recommendation history.

General lists fail explicitly above 100 results rather than silently truncating or performing hidden pagination loops.

## Synthetic value proof

The Release 0.8 test proof uses only synthetic identities/evidence. It demonstrates:

1. a human selects changed canonical observation evidence;
2. an unassessed/internal-review recommendation is created;
3. immutable history moves `proposed → in_review → accepted`;
4. baseline and later comparable follow-up measurements are recorded from canonical observations;
5. a human records outcome direction without G.A.S. deriving direction from numeric change;
6. a rejected recommendation remains preserved with no action or measurement side effect;
7. Alpha/Beta history remains isolated;
8. review, measurement, and outcome history can be retrieved without reconstructing state from unrelated vendor dashboards or chat history.

This is an internal proof of service-history reconstruction value, not a public ROI, ranking, citation, traffic, lead, or causal-performance claim.

## Explicit exclusions

Release 0.8 adds no automatic recommendation or inference generation, severity/materiality/business-impact score, recommendation ranking, cross-provider automatic correlation, runtime AI/BYOK, generated rationale/content, provider/network access, ZeroRank or Activepieces runtime call, WQT execution, action/remediation, publication, HTTP listener, UI/reporting surface, scheduler/background worker, cloud resource, customer deployment, customer evidence, paid dependency/service, software license grant, or Release 0.9 implementation.

Incremental recurring cost target remains **$0**. Accepted Release 0.8 adds no dependency.
