# Internal Site Audit Evidence Annex — bounded local reporting candidate

**Source status:** Candidate under [GAS-REPORT-SITE-AUDIT-001 #181](https://github.com/LowcountryDigitalWorks/gas-engine/issues/181). This document describes a source-only application-local implementation for independent validation, **not a Product-accepted release or customer-facing report authorization**. No package version or canonical wire contract is changed.

## What it does

`composeSiteAuditAnnex` takes a previously assembled trusted `CustomerServiceReport`, the **exact original bytes** of already-normalized WQT `ldw.website-quality.v1` **minor 3**, a separately supplied accepted `WqtAdapterConfig`, and zero to three **explicitly human-selected** provider/code pairs. It calls the already-accepted `adaptWqtNormalizedEvidence` to validate original input bytes, bounded source shape, trusted WQT site/HTTPS origin, source methods, provider connections, local timing and availability. Invalid, forged, unsupported, oversized or mismatched evidence fails closed.

The report site ID and canonical origin must match that separately trusted WQT scope; the internal annex identity also binds the report ID, original WQT SHA-256, exact trusted scope, provider connection IDs, collection timing and source availability. It is not a new source of authority or proof that a real customer scan occurred.

An optional second argument to existing `renderCustomerServiceReportHtml(report, annex)` adds one visually separated **LDW INTERNAL ONLY — NOT APPROVED FOR CUSTOMER DELIVERY** section to the same existing print-friendly static HTML, with existing CSP, no script, no network and escaped content. The original one-argument report output and customer report request/model remain unchanged.

**Same-process integrity rule:** The composer privately stores a validated deep snapshot keyed to the exact composed annex object. The renderer reads only a fresh copy of that private verified snapshot; editing returned annex fields, swapping a valid-looking 64-character digest, or inserting forged rows cannot change rendered source evidence. Deserialized JSON, plain clones and manufactured annex objects are **rejected** as display authority, even if their IDs look valid. Recompose using exact original WQT bytes and separately trusted configuration for each authorized local rendering; the annex is **not a portable verification token or a customer export format**.

## Evidence interpretation

- The only supported providers are **SiteOne** and **Lighthouse**; no third scanner, cross-provider scoring or rank impact is inferred.
- The human reviewer selects **zero to three** exact unique observation identifiers; the code rejects duplicates, unknown identifiers, unavailable sources, out-of-scope report/site/target and implicit automatic selection. Order reflects the caller's explicit selection, **not a priority**.
- SiteOne native source statuses/messages/typed facts are displayed only as source observations. A `NOTICE`, `WARNING` or `CRITICAL` value is not an LDW policy severity.
- Lighthouse numeric source scores are **0–1** only when `scoreDisplayMode` is `binary` or `numeric`. Source zero remains **zero**. `manual`, `informative`, `notApplicable`, `error`, null and unsupported modes remain **unscored** (`n/a`) even if a raw numeric field is present.
- Native source `executedAt` and `fetchTime` are labeled source-reported. The separately trusted collection `observedAt` is labeled as such. The annex does not claim the times or original report periods form a single synchronized measurement window.
- Source text is whitespace-normalized and capped at 240 characters before display, and the existing HTML renderer escapes every dynamic field. Native report HTML is **never embedded** or fetched. The exact original WQT byte digest is visible for authorized evidence reconciliation.
- When a provider's trusted availability is not `available`, its observation count is **not verified** and no observations may be selected from that source. Missing or unselected evidence must not be interpreted as a healthy site, failure or successful scan.

## Internal-only example

```ts
import { composeSiteAuditAnnex } from './src/operator/site-audit-annex.js';
import { renderCustomerServiceReportHtml } from './src/operator/customer-report-html.js';

// report is already obtained through the accepted Release 0.17 report composer.
// normalizedWqtBytes are exact previously accepted bytes from an authorized local artifact.
// trustedConfig is separately issued by the existing trusted WQT operator caller.
const annex = composeSiteAuditAnnex(report, normalizedWqtBytes, trustedConfig, [
  { provider: 'siteone', code: 'redirects' },
  { provider: 'lighthouse', code: 'first-contentful-paint' },
]);
const internalHtml = renderCustomerServiceReportHtml(report, annex);
```

The example intentionally has **no** site scan, provider API request, private evidence source, filesystem write, background job, customer export or automated remediation. No customer data should be placed in this public repository.

## Acceptance and sequencing

Keep the feature **source-only/internal** until current HEAD passes all G.A.S. Contracts and Security/CodeQL checks, author-excluded independent source review, distinct authorized Product release acceptance, expected-HEAD protected squash and successful postmerge checks. GAS ORCH26 is source author and cannot independently approve or merge its own PR.

Unaccepted [WQT site-audit summary PR #78](https://github.com/LowcountryDigitalWorks/website-quality-toolkit/pull/78) is **not** imported or relied upon. Its optional Markdown inventory and the private `wqt-operations` repin/JIT gates remain independent. A client-safe audit report/export, real customer evidence, approved delivery, runtime AI, a site-health score, longitudinal delta, cloud endpoint or scheduled scan requires a **separate** Product/Privacy/Client Operations authorization. Incremental runtime cost target remains $0/included.

See existing [WQT adapter](adapters/wqt.md), [service brief](service-brief.md), and [operator workspace/customer report](operator-workspace.md) guidance for accepted trusted boundaries.