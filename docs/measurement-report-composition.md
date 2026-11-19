# Trusted internal measurement readiness in service-report HTML

**Status:** Initial source accepted and merged through [GAS #186](https://github.com/LowcountryDigitalWorks/gas-engine/issues/186) and [PR #187](https://github.com/LowcountryDigitalWorks/gas-engine/pull/187). Optional WQT dual-annex extension is a new SOURCE-ONLY candidate under [GAS #181](https://github.com/LowcountryDigitalWorks/gas-engine/issues/181), not an accepted production/customer deployment. G.A.S. remains the LDW-internal local managed-service evidence engine, private package 0.26.0. This feature does not authorize external source polling, site changes, tracking pixels, customer delivery or Release 1.0 cloud deployment.

## Source and authority

The new `src/operator/measurement-report-composition.ts` entrypoint `composeInternalMeasurementReadinessHtml(evidenceRepo, reviewRepo, issuedTenantContext, workspaceRequest, customerReportRequest, measurementReadinessRequest)` composes **one internal-only static HTML artifact** using existing accepted local APIs:

1. `requireTenantContext(issuedTenantContext)` and `prepareOperatorWorkspace` recompute the authoritative service brief/decision source against tenant-scoped repositories, yielding the exact `tenantId`, `siteId`, `siteScopeRevisionId`, HTTPS target origin, workspace ID and source IDs. A browser export, raw `CustomerServiceReport.context.siteId`, hostname, hash or user-supplied scope does not mint tenant authority.
2. The **current** `composeCustomerServiceReport` recomputes the source workspace and validates exact request workspace + service-brief + optional decision-cycle IDs. Its canonical report `id`, JSON, contract and existing render output are unchanged.
3. Accepted `composeMeasurementReadiness` validates the strict caller-declared eight-provider statuses against that authoritative triple and canonical HTTPS target. Its evaluation time must match the authoritative workspace evaluation time. `renderMeasurementReadinessHtml` accepts only its own same-process WeakMap-verified result, not forged/serialized/cloned display objects.
4. The accepted static `renderCustomerServiceReportHtml(report)` is left untouched. This new internal-only function inserts a bounded, escaped readiness section just before the closing `</main>`, keeping the original CSP and enforcing `MAX_CUSTOMER_REPORT_HTML_BYTES`.

The readiness rows are **declared by a separately authorized operator** and are *not* live provider inspection, proof of property ownership, browser pixel deployment, user/session totals, or a customer performance claim. Missing states are `unknown`, not measured zero. Google Search Console and Bing verification do not require visitor tracking scripts; GA4 configured property does not prove events, Cloudflare edge requests are not GA4 sessions, Clarity replay requires a separate privacy decision, and a SiteOne HTTP 403 cannot be described as a healthy crawl.

## Example call (inside the existing trusted local application only)

```ts
const html = await composeInternalMeasurementReadinessHtml(
  evidenceRepository,
  reviewRepository,
  issuedTenantContext,
  acceptedWorkspaceRequest,
  acceptedCustomerReportRequest,
  operatorDeclaredMeasurementReadiness,
);
```

The caller must already hold an **issued** `TenantContext`. The function does not issue one and does not fetch provider data. The original six-argument form stays unchanged and does not accept customer-selected HTML. An optional seventh argument may compose accepted WQT Site Audit evidence into the SAME internal report, provided the separately trusted WQT adapter configuration also matches the fresh authoritative tenant, site, scope revision and HTTPS target.

## Validation and explicit non-authority

Synthetic tests must prove exact scope and provenance, stale/forged context rejection, configured/blocked/missing separation, stable output, escaping and CSP. Hosted Contracts and Security checks, author-excluded source review and a separate eligible protected merge are required before accepted-main status.

**No:** credentials, OAuth, analytics/tag installation, web crawling, WAF overrides, live Google PSI/GA4/GSC/Clarity requests, client emails/marketing consent, customer delivery, production runtime, new schema or database, report identity changes, score/ranking/causal inference, paid usage or public HTTP endpoint.


## Optional WQT Site Audit annex (local source-only candidate)

The OPTIONAL seventh argument to the accepted composeInternalMeasurementReadinessHtml
function has precisely three properties: normalizedWqtBytes (original normalized
ldw.website-quality.v1 minor3 Uint8Array), trustedConfig (a separately issued
WqtAdapterConfig), and selections (zero to three exact human-selected SiteOne/
Lighthouse provider-code pairs). This addition does NOT accept client-supplied
report HTML, an external site URL for fetching, or a user-created tenant context.

    const combinedInternalHtml = await composeInternalMeasurementReadinessHtml(
      evidenceRepository, reviewRepository, issuedTenantContext,
      authorizedWorkspaceRequest, authorizedCustomerReportRequest,
      operatorDeclaredMeasurementStatus,
      {
        normalizedWqtBytes: existingOriginalWqtMinor3Bytes,
        trustedConfig: separatelyIssuedWqtConfig,
        selections: [
          { provider: 'siteone', code: 'redirects' },
          { provider: 'lighthouse', code: 'first-contentful-paint' },
        ],
      },
    );

The optional original bytes, configuration and selections are copied within
existing bounds BEFORE awaiting any repository reads. The fresh authoritative
OperatorWorkspace must match the WQT configuration on tenantId, siteId,
siteScopeRevisionId AND canonical HTTPS target. Matching only the hostname
or CustomerServiceReport.context.siteId is insufficient. Accepted
composeSiteAuditAnnex then validates original source bytes, exact WQT minor3
schema, native method/metadata, expected WQT site identity, availability,
selection and source integrity. The accepted HTML renderer reads its private
same-process verified annex snapshot; serialized/cloned/forged annex objects
do not become presentation authority.

Both the WQT annex and eight-source Measurement Readiness appear in one bounded
CSP-constrained internal static report. Original six-argument HTML, customer
report JSON/model/id and all accepted adapters remain byte-identical.
Lighthouse numeric zero versus unscored null, human selection, source-local
timing, scanner blocked/unknown reasons, and unavailable provider rows keep
their original source semantics. SiteOne HTTP 403 is never auto-interpreted as
healthy or cleared; PageSpeed API JSON must NOT be substituted for pinned WQT
SiteOne+Lighthouse source, and an intentionally noindex page is NOT an
automatic SEO defect or action recommendation.

No network, GA4/Clarity/GSC property read, WQT scan, cloud deployment,
credentials, customer delivery/email, scored health claim, database migration
or release number change is authorized. Any new external collection, output
routing or privileged action requires its separately accepted owning gate.
