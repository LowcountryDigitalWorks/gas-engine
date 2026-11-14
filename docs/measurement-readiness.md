# Measurement readiness — internal per-site evidence inventory (candidate)

**Status:** source-only PR candidate under [GAS #183](https://github.com/LowcountryDigitalWorks/gas-engine/issues/183); NOT an accepted release, public website page, browser tag, connected provider, customer report, or configured recurring measurement service.

## Problem

A configured property, verified ownership, installed browser script, observed network event, and reportable aggregate are different facts. A Search Console account does not need a browser tracking script; SiteOne, Lighthouse and G.A.S. local analyses do not need a site pixel. GA4 browser engagement collection and Clarity replay require separate approved on-site integration and privacy controls. Cloudflare edge HTTP requests are not GA4 sessions. Missing response rows never prove zero traffic. Scanner HTTP 403 is not a healthy result.

## Implementation boundary

`src/operator/measurement-readiness.ts` exports `composeMeasurementReadiness(trusted, request)` and `renderMeasurementReadinessHtml(report)`. This is a **pure/local, bounded, internal-only operator fragment**. An already-authorized higher-level caller supplies a separately trusted exact tenant/site/scope-revision and canonical HTTPS origin, then the facts it actually verified. This code does **not** perform authorization, verify external claims, inspect browser tags, query any service, fetch evidence, or grant publication rights.

A fixed eight-row roster records distinct GSC, Bing Webmaster, GBP, Cloudflare edge, GA4, Clarity, WQT scanner and G.A.S. local states. Unprovided rows are `unknown`, not zero or healthy. States are `verified`, `configured_no_collection_proof`, `collection_observed`, `blocked_by_privacy_gate`, `source_unavailable`, `scanner_blocked`, `not_required`, and `unknown`. No score, cross-provider sum, Google sitemap deprecated indexed count, causal inference, claim of leads, or automatic next action is produced.

The `collection_observed` state requires an explicit already-verified opaque source reference and source-observation timestamp, both supplied by the trusted caller; it is not inferred from mere configuration. Privacy gate is permitted only for GA4/Clarity; scanner blocked only for WQT. Unavailable and blocked states require a source limitation. The producer rejects duplicate rows, malformed or cross-site identities, mismatched HTTPS target, unsupported fields and future-dated source evidence. Output is stable fixed provider order and at most three explicitly authored next checks.

The static HTML **fragment**, not a standalone scanner or page, labels itself **internal review only**, escapes source-controlled text, contains no script/external resources and is bound to the original validated in-process object through a private snapshot. A cloned/serialized/forged report cannot be rendered by this function. It is not a signed portable artifact; the higher-level accepted source/collection integrity mechanism remains separate.

## Fixtures and acceptance

Synthetic tests in `tests/operator/measurement-readiness.test.ts` cover exact-scope and HTTPS target isolation; verified vs configured vs observed vs missing; 403 scanner blocking; source privacy blocks; duplicate/future/extra inputs; max three checks; hostile mixed-case tags and HTML encoding; in-process renderer identity. No live site/GA4/Clarity/GSC/Bing/GBP operation is performed.

A real LDW site configuration baseline is maintained by Website [#154](https://github.com/LowcountryDigitalWorks/lowcountrydigitalworks.com/issues/154), indexing by Website [#135](https://github.com/LowcountryDigitalWorks/lowcountrydigitalworks.com/issues/135), website privacy under BO #335, Clarity under Website #132, and WQT scanner admission under WQT #60. Do not duplicate their mutable status in this source. Source facts, source times, authorization and consent must be supplied by a separate trusted caller.

## Deferred integration and governance

This first slice edits **only** this module, its test, and its guide; it does not touch the accepted report renderer, `customer-report-html.ts`, nor competing audit annex PR #182. Optional inclusion in existing G.A.S. service briefs/print reports requires new Product freeze **after** #182 acceptance and a collision-free current-main read. Website [#166](https://github.com/LowcountryDigitalWorks/lowcountrydigitalworks.com/issues/166) exclusively owns the existing `/website-check/` noindex demonstration page, design/preview and publication gate.

No version bump, schema/database, provider API/OAuth, new scanner, account/permission mutation, browser tracker, customer evidence, scheduler, site scanner execution, cloud service, public form or report delivery. Cost class: $0/included. Source-only draft must pass hosted Contracts and Security, author-excluded independent review and separate eligible Product release decision before guarded protected merge; exact merged-main CI is required afterward.
