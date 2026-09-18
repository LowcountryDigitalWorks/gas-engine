# Release 0.9 draft — read-only operator case view + printable report preview

**Status: authorized draft candidate; not accepted or merged.** Issue #18 is the Release 0.9 authority. Releases 0.1–0.8 remain the accepted baseline.

Release 0.9 proves whether one bounded local document can answer the recurring LDW operator question:

> WHAT CHANGED → WHAT DID A HUMAN DECIDE → WHAT WAS MEASURED → WHAT HUMAN-DECLARED OUTCOME WAS RECORDED?

It is not a provider dashboard, recommendation engine, CRM/task manager, customer portal, deployed service, or action surface.

## Architecture

The candidate adds exactly three small layers:

1. src/operator/case-view.ts — a read-only application assembler over accepted EvidenceRepository, ReviewLedgerRepository, diffEvidenceCollections(...), and getRecommendationEvidence(...) surfaces.
2. src/operator/html.ts — pure presentation transformation and standalone deterministic semantic HTML rendering.
3. scripts/operator-preview.ts — development-only synthetic local preview generation into ignored local-artifacts/.

No new repository method, persistence table, migration, HTTP route/listener, cloud resource, provider client, runtime AI, or action path is added.

## Read-only case assembly

The assembler requires an already-issued trusted TenantContext, one explicit canonical Scope, explicit baseline/current collection IDs, and one explicit selected recommendation ID.

The selected collection records must resolve under the trusted context and both must exactly match the requested tenant/site/site-scope. The existing Release 0.7 persisted-snapshot diff then re-checks stream compatibility and preserves its 2,048-observation per-snapshot bound.

The assembler reads each bounded scope-level current-recommendation, measurement, and outcome list exactly once, then groups locally for the selected recommendation. Only the selected recommendation's bounded immutable history and canonical evidence are additionally resolved. Existing 100-record/revision repository limits remain authoritative; overflow errors propagate and are never converted into truncation or hidden pagination.

No method in the operator production surface writes evidence, recommendations, measurements, outcomes, UI state, or any other record.

## Presentation semantics

The document keeps Release 0.7 unchanged, changed, appeared, missing_from_current, and coverage_unknown as mechanical evidence states. Numeric delta is descriptive only and creates no quality, severity, priority, materiality, or business-impact direction.

Recommendations are labeled **HUMAN-AUTHORED**, retain authorityClass = internal_review, priority.level = unassessed, lifecycle, immutable revision history, and canonical evidence linkage.

Outcome direction is labeled **HUMAN-DECLARED OUTCOME** and retains human rationale/reason, attribution strength, and measurement linkage. Recommendation acceptance and outcome display grant no action/remediation authority.

The renderer uses one meaningful title, one h1, logical section headings, table captions/headers, text state labels, visible focus styling, wrapping for long identifiers, and print CSS. Browser Print / Save as PDF is the only PDF path.

## Static-document security

renderOperatorCaseHtml(...) performs no repository access, filesystem write, network access, client-side fetch, runtime AI, or external-resource loading.

Every dynamic text value is escaped before insertion into HTML. Tests include quotes, ampersands, tag payloads, script payloads, and event-handler-shaped attribute payloads and require them to remain inert escaped text.

The standalone document contains embedded local CSS only, no JavaScript, no remote font/image/style/script, no form or write control, and a restrictive static CSP. Rendered output is bounded to 1,000,000 UTF-8 bytes and fails explicitly rather than truncating.

## Synthetic preview

After build, run:

    npm run preview:operator

The command uses only synthetic Alpha data and the accepted local repositories. It creates a compatible baseline/current evidence pair with one changed observation, one coverage_unknown case caused by deliberately partial current coverage, one accepted recommendation with proposed → in_review → accepted history, one rejected recommendation, baseline/follow-up measurements, and one human-declared outcome whose direction is not inferred from the numeric delta.

The generated file is:

    local-artifacts/release-0.9-operator-case-preview.html

The temporary SQLite file is deleted after generation. local-artifacts/ remains ignored and no synthetic preview is committed.

## Explicit exclusions

Release 0.9 adds no persistence/schema change, production authentication, server/listener/API, customer portal, provider networking, WQT/ZeroRank/Activepieces runtime call, inference generation, recommendation generation, automatic priority/ranking/correlation, action/remediation/task assignment, email/SMS, analytics/tracking, runtime AI/BYOK, PDF package/service, frontend framework, charting dependency, cloud deployment, customer/private evidence, software license grant, or Release 1.0 implementation.

Package target is 0.9.0, new dependencies remain **0**, and incremental recurring cost remains **$0**.

Release 1.0 cloud proof remains separately gated.
