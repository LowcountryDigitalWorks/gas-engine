# Trusted internal measurement readiness in service-report HTML

**Status:** SOURCE-ONLY candidate under [GAS #186](https://github.com/LowcountryDigitalWorks/gas-engine/issues/186); not yet accepted or merged. G.A.S. remains the LDW-internal local managed-service evidence engine, private package 0.26.0. This feature does not authorize external source polling, site changes, tracking pixels, customer delivery or Release 1.0 cloud deployment.

## Source and authority

The new \`src/operator/measurement-report-composition.ts\` entrypoint \`composeInternalMeasurementReadinessHtml(evidenceRepo, reviewRepo, issuedTenantContext, workspaceRequest, customerReportRequest, measurementReadinessRequest)\` composes **one internal-only static HTML artifact** using existing accepted local APIs:

1. \`requireTenantContext(issuedTenantContext)\` and \`prepareOperatorWorkspace\` recompute the authoritative service brief/decision source against tenant-scoped repositories, yielding the exact \`tenantId\`, \`siteId\`, \`siteScopeRevisionId\`, HTTPS target origin, workspace ID and source IDs. A browser export, raw \`CustomerServiceReport.context.siteId\`, hostname, hash or user-supplied scope does not mint tenant authority.
2. The **current** \`composeCustomerServiceReport\` recomputes the source workspace and validates exact request workspace + service-brief + optional decision-cycle IDs. Its canonical report \`id\`, JSON, contract and existing render output are unchanged.
3. Accepted \`composeMeasurementReadiness\` validates the strict caller-declared eight-provider statuses against that authoritative triple and canonical HTTPS target. Its evaluation time must match the authoritative workspace evaluation time. \`renderMeasurementReadinessHtml\` accepts only its own same-process WeakMap-verified result, not forged/serialized/cloned display objects.
4. The accepted static \`renderCustomerServiceReportHtml(report)\` is left untouched. This new internal-only function inserts a bounded, escaped readiness section just before the closing \`</main>\`, keeping the original CSP and enforcing \`MAX_CUSTOMER_REPORT_HTML_BYTES\`.

The readiness rows are **declared by a separately authorized operator** and are *not* live provider inspection, proof of property ownership, browser pixel deployment, user/session totals, or a customer performance claim. Missing states are \`unknown\`, not measured zero. Google Search Console and Bing verification do not require visitor tracking scripts; GA4 configured property does not prove events, Cloudflare edge requests are not GA4 sessions, Clarity replay requires a separate privacy decision, and a SiteOne HTTP 403 cannot be described as a healthy crawl.

## Example call (inside the existing trusted local application only)

\`\`\`ts
const html = await composeInternalMeasurementReadinessHtml(
  evidenceRepository,
  reviewRepository,
  issuedTenantContext,
  acceptedWorkspaceRequest,
  acceptedCustomerReportRequest,
  operatorDeclaredMeasurementReadiness,
);
\`\`\`

The caller must already hold an **issued** \`TenantContext\`. The function does not issue one and does not fetch provider data. This first version does not take a WQT annex or accept customer-selected HTML. The separate accepted WQT Site Audit annex keeps its original report/site/target binding; combining both requires additional tenant and scope proof and is not implied by this source.

## Validation and explicit non-authority

Synthetic tests must prove exact scope and provenance, stale/forged context rejection, configured/blocked/missing separation, stable output, escaping and CSP. Hosted Contracts and Security checks, author-excluded source review and a separate eligible protected merge are required before accepted-main status.

**No:** credentials, OAuth, analytics/tag installation, web crawling, WAF overrides, live Google PSI/GA4/GSC/Clarity requests, client emails/marketing consent, customer delivery, production runtime, new schema or database, report identity changes, score/ranking/causal inference, paid usage or public HTTP endpoint.
