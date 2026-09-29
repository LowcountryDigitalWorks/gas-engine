# GAS-ROADMAP-002 competitor capability matrix

Status: living product-research artifact  
Owner: G.A.S. Product Orchestrator  
Authority: [gas-engine #31](https://github.com/LowcountryDigitalWorks/gas-engine/issues/31)  
Last reconciled: 2026-09-29  
Current accepted G.A.S. main at this review: `b1ff0ed27275bd873a2f962721ef1bbafd5049d7`

This matrix is intentionally capability-first. It records user jobs, current market/native patterns, what is commodity sensing versus LDW-differentiated interpretation, and the smallest G.A.S. proof worth owning. It is not a vendor scorecard and does not authorize paid tooling, new provider credentials, customer data, cloud deployment, or autonomous publishing.

## Decision vocabulary

- **BUILD** — G.A.S. should own the deterministic semantic/decision layer because it compounds LDW operating value.
- **INTEGRATE** — consume a replaceable native/vendor/automation output; do not rebuild the sensor.
- **CONFIGURE** — use an existing platform/workflow as-is with bounded setup.
- **WATCH** — useful market pattern, but no current implementation authority/value case.
- **SKIP** — deliberately do not pursue; commodity, duplicative, disproportionately costly, or architecturally wrong for G.A.S.

## Matrix

| Domain | User job / problem | Current leading patterns | Commodity sensing vs LDW differentiation | Decision | Data / credential / recurring-cost implications | Smallest LDW-owned proof | Candidate release |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Search Console analytics / search intelligence | Turn Google Search performance rows into a small set of defensible opportunities and explain what changed between periods. | Google Search Console Performance + API expose clicks, impressions, CTR, position and query/page/device/country dimensions; GSC Wizard and SEOTesting add decay, CTR analysis, cannibalization, striking-distance/opportunity, annotations and tests. | **Commodity:** Google collection, property auth, raw query/page rows. **Differentiate:** deterministic window/coverage semantics, site-specific baselines, explicit operator policy, longitudinal evidence linkage, bounded recommendation/outcome workflow. | **BUILD analysis** + **INTEGRATE upstream read-only GSC retrieval**. Do not build a GSC network client in the first proof. | Native GSC is $0. Search Console API requires Google authorization; provider retrieval belongs to Automation & Agent Operations. Preserve API row limits, omitted dates, preliminary days, aggregation differences, and property/page semantics. | Synthetic/public-safe GSC-semantic snapshots: period deltas, striking-distance candidates, decay, site-specific CTR opportunity, query-to-page concentration/cannibalization candidates, brand/non-brand dimensions, freshness/coverage. | **0.10 — Search Analytics Signal Pack** |
| B. Query intent / page focus / content architecture | Detect when one page serves materially different query groups, when several pages compete for one need, and where a new/supporting page might be justified. | MarketMuse cluster/intent analysis; Surfer content audit/topical map; Clearscope/Frase/InLinks-class topic/entity workflows; GSC Wizard reverse-cannibalization and topic/content groups. | **Commodity:** keyword/topic suggestions and generic content briefs. **Differentiate:** evidence-linked query/page clusters, explicit uncertainty, preserve original primary-intent URL, distinguish split/consolidate candidates from approved content work, remeasure after change. | **BUILD bounded evidence model**; **WATCH/INTEGRATE SERP-validation evidence** if a low-cost source exists. Never infer “different intent” from lexical similarity alone. | Can begin at $0 over accepted search analytics snapshots. SERP/result validation would require a separate source/cost/privacy gate; no scraping farm. | Synthetic query/page map with clearly separable and ambiguous clusters; output “focus fragmentation candidate,” “consolidation candidate,” or “needs external intent confirmation,” never an auto-publish instruction. | **0.11 — Page-Focus Evidence Pack** |
| C. Multi-engine indexing / crawl triangulation | Tell whether a visibility/indexing problem is site-wide, engine-specific, or simply not yet measurable because engines report on different clocks. | Bing Webmaster Tools: search/query data, Site Explorer/Site Scan, AI Performance, crawl/index data; IndexNow change notification; Yandex Webmaster crawl/index diagnostics and site problems. | **Commodity:** each engine’s crawl/index reports and submission APIs. **Differentiate:** provider-neutral diagnosis while preserving per-engine semantics, reporting lag, coverage and non-comparable ranking scales. | **INTEGRATE upstream**; **BUILD diagnostic model later**. Move behind releases that can prove value without new provider credentials. | Bing/Yandex require separate provider access; IndexNow is a write/notification action and is not implied by read authority. Native tools are generally $0; credentials/consent remain separately gated. | Synthetic Google/Bing/Yandex-style index/crawl observations proving broad-site issue vs one-engine issue vs coverage uncertainty. No score blending. | **0.13 — Multi-Engine Index Diagnostics** (moved later from initial 0.12 hypothesis) |
| D. Technical SEO / site quality | Find and trend crawlability, performance, metadata, structured-data and technical issues without building another crawler. | WQT/SiteOne/Lighthouse already provide LDW sensing. Market references include Screaming Frog, Sitebulb, Ahrefs Site Audit and Semrush Site Audit with scheduled crawls, issue inventories and change views. | **Commodity:** crawling/check catalogs/health scores. **Differentiate:** typed magnitude/history/provenance, correlation with later search outcomes, human review and same-source remeasurement. | **INTEGRATE WQT**; **SKIP crawler rebuild**. | Existing WQT path: $0/included. External crawler subscriptions are not required for the G.A.S. core. | Continue accepted WQT typed-fact import and longitudinal comparison; only add new fact semantics when a real recurring service decision needs them. | Existing 0.5 + GAS-SEM-001; later correlation release only if justified |
| E. AI / answer-engine visibility | Track whether a brand/site is mentioned or cited in AI answers, where citations come from, and how visibility changes after bounded work. | ZeroRank; Profound; Otterly; Semrush AI Visibility; Bing AI Performance/Intents/Topics/Citation Share. Common patterns: prompt cohorts, citation/source URLs, brand coverage, competitor gaps, crawlability and trend views. | **Commodity:** prompt execution and vendor-specific visibility scoring. **Differentiate:** replaceable-sensor evidence, stable prompt cohorts, provenance, source concentration/change, correlation to approved work without universal G.A.S. score. | **INTEGRATE ZeroRank**; **WATCH** Bing native AI Performance and specialist platforms for patterns; **SKIP vendor clone**. | ZeroRank Tier 4 already purchased; active LDW path is read-only. Other platforms are paid/variable and not required. Prompt/provider data can be sensitive in customer contexts; first proofs remain LDW-owned/public-safe. | Use existing ZeroRank artifact to prove stable prompt/citation/source trend facts and later correlate with annotated actions; no new polling client. | Later **0.14 — AI Visibility Correlation** candidate |
| F. Rank / SERP / competitor intelligence | Understand keyword movement, SERP feature changes and competitor gains where Search Console alone lacks external rank context. | Ahrefs Rank Tracker, Semrush Position Tracking, SE Ranking/Moz/DataForSEO-class sources track locations/devices, SERP features, competitors, history and cannibalization warnings. | **Commodity:** rank crawling, SERP history, broad keyword databases. **Differentiate:** only use external rank evidence when it changes an LDW decision; preserve provider/location/device/freshness and never blend unlike universes into one score. | **WATCH / INTEGRATE only when justified**; **SKIP rank crawler**. | Mostly paid and quota-based. No new paid source for the roadmap proof. Potential customer keyword sets become customer data and require separate authority. | Demonstrate one synthetic external-rank observation contract only if a real LDW decision cannot be answered by GSC/ZeroRank/native sources. | Deferred; no near-term release |
| G. Local SEO / local business visibility | See how a local business appears across neighborhoods/local packs and whether GBP/listing/review signals support a clear action. | Google Business Profile native surfaces; BrightLocal Local Search Grid/Rank Tracker/Citation/Reputation tools; Local Falcon geo-grids; Whitespark citation/rank tools. | **Commodity:** geo-grid rank collection, listings sync, citation building, review management. **Differentiate:** combine local evidence with site/search/AI evidence and owner-approved service actions without becoming a listings/reputation platform. | **CONFIGURE native GBP where available; WATCH specialist grid vendors; SKIP local-rank crawler and listings platform build**. | Native GBP is $0 but account access is sensitive. BrightLocal starts as paid recurring service (current platform advertises paid plans); Local Falcon/Whitespark are paid/credit-based. Client local data is customer data. | LDW-owned GBP/public-site proof only if Product Strategy shows recurring service value; otherwise remain outside core roadmap. | Deferred local-service pack, not 0.10–0.13 |
| H. Links / authority / internal linking | Find controllable internal-link opportunities and observe external authority/backlink changes without crawling the public web. | Sitebulb/Ahrefs/Screaming Frog/Surfer analyze internal links; Ahrefs/Majestic/Moz/Semrush provide internet-scale backlink indexes and authority metrics; GSC/Bing expose bounded link data. | **Commodity:** internet-scale backlink collection and proprietary authority scores. **Differentiate:** internal-link suggestions grounded in owned site graph + search demand + page focus; external backlink change is evidence only. | **BUILD internal-link logic only when graph evidence exists**; **INTEGRATE/WATCH external link sources**; **SKIP backlink crawler/universal authority score**. | Internal graph can be $0 if WQT/site export exposes it. External indexes are paid/limited; proprietary scores must retain provider identity and are not canonical LDW truth. | Synthetic site graph + 0.10/0.11 demand/page-focus facts yielding explainable internal-link candidates, no auto-edit. | Later **0.15 — Internal Link Opportunity Pack** candidate |
| I. Experimentation / annotations / outcomes | Record what changed, compare defensible before/after windows and avoid “SEO worked” causal claims when evidence is merely correlated. | SEOTesting time-based/split tests and annotations; Ahrefs rank chart notes; GSC Wizard annotations/experimentation; Search Console window comparison. | **Commodity:** chart annotation UI. **Differentiate:** evidence-linked change records, exact baseline/follow-up windows, same-source comparability, explicit not-yet-measurable state, human-declared outcome/attribution already aligned to G.A.S. 0.8. | **BUILD** before multi-engine expansion because it compounds existing ledger and 0.10 signals with no new sensor credential. | $0 internal deterministic capability. No provider networking. Public repo uses synthetic events only. | Synthetic change annotation tied to 0.10 signal cohorts; pre/post window guardrails; output descriptive deltas and comparability state; human outcome remains separate. | **0.12 — Search Change Annotation & Outcome Pack** |
| J. Reporting / operator workflow | Give an operator/client a compact, understandable summary while retaining drill-down provenance and not exposing raw provider dumps. | Existing G.A.S. 0.9 case/report preview; Looker Studio connectors/data sources; AgencyAnalytics scheduled client dashboards; specialist vendors provide exports/MCP/reports. | **Commodity:** dashboards, widgets, scheduled PDFs. **Differentiate:** maximum-three evidence-backed priorities, explicit uncertainty/freshness, human-vs-mechanical labels, traceability to recommendation/measurement/outcome history. | **CONFIGURE existing 0.9 output**; **WATCH Looker/AgencyAnalytics**; **BUILD only after repeated operator friction**. | Existing static report is $0. Looker Studio can be $0 depending on connector; AgencyAnalytics is paid. External reporting connectors add sharing/auth/privacy considerations. | Extend only after 0.10–0.12 prove repeated report friction; do not build dashboard now. | Later operator/report refinement |

## Roadmap decision after competitor review

### Freeze: Release 0.10 — Search Analytics Signal Pack

The initial 0.10 hypothesis survives, with one important semantic refinement: **the first contract is explicitly Google Search Console performance semantics, not a fake cross-engine “universal rank” model**.

The proof remains pure/local and provider-network-free. Upstream retrieval is owned by Automation & Agent Operations and may later emit a sanitized artifact. Release 0.10 proves only deterministic analysis over synthetic/public-safe GSC-semantic snapshots.

Bounded signals:

1. **Window deltas** — descriptive clicks, impressions, CTR and average-position changes for exact query/page cohorts.
2. **Striking-distance candidate** — explicit caller policy for position band and minimum impressions; no universal business priority.
3. **Decay candidate** — explicit baseline/current windows and caller thresholds; missing/preliminary coverage never becomes zero.
4. **CTR opportunity candidate** — compare against a **site-specific position-bucket baseline from the same evidence**, not an external universal CTR curve.
5. **Query/page concentration candidate** — identify one query materially split across multiple URLs; call it a candidate, not automatically “bad cannibalization.”
6. **Brand/non-brand dimension** — deterministic caller-supplied brand terms/rules, recorded as method/configuration.
7. **Freshness / coverage** — every output carries source semantic profile, window, last-complete date, coverage state, dimensions/filters, units, method version and provenance/integrity reference.

Explicit exclusions:

- no Google OAuth/network client in G.A.S.;
- no Search Console credential storage;
- no persistence/schema migration;
- no rank crawler or SERP scraping;
- no LLM/runtime AI;
- no cross-engine score;
- no automatic recommendation, priority or content generation;
- no customer evidence;
- no cloud deployment.

### Refine: Release 0.11 — Page-Focus Evidence Pack

Keep 0.11, but narrow it. Lexical/query clustering alone is **not** sufficient to claim distinct user intent or justify a new URL.

The candidate may surface:
- page/query clusters;
- concentration and overlap;
- focus-fragmentation candidates;
- consolidation candidates;
- explicit “external intent confirmation required.”

A split-page recommendation remains human-reviewed and should require separate SERP/competitor evidence when intent distinction is material.

### Reorder: Release 0.12 — Search Change Annotation & Outcome Pack

Move the original multi-engine hypothesis later. 0.12 should first connect accepted G.A.S. service history to search analytics:

- human/trusted change annotation;
- exact affected scope;
- baseline/follow-up windows;
- same-source comparability;
- descriptive signal changes;
- explicit `not_yet_measurable` / coverage uncertainty;
- no automatic causal conclusion.

This compounds Releases 0.8–0.10 with no new provider credential or paid source.

### Move: Multi-Engine Index Diagnostics to 0.13

Bing Webmaster Tools and Yandex Webmaster provide useful but semantically different crawl/index/search data, and Bing now includes AI Performance/intent/topic/citation views. IndexNow is a write/notification protocol, not read evidence. The correct G.A.S. role is therefore a later provider-neutral diagnostic model **after** Automation & Agent Operations has an authorized read-only evidence path.

Do not average Google/Bing/Yandex rank/position values into a shared score.

## BUILD / INTEGRATE / CONFIGURE / WATCH / SKIP summary

- **BUILD now:** 0.10 search analytics signals.
- **BUILD next:** 0.11 page-focus evidence; 0.12 change annotation/outcome analysis.
- **INTEGRATE:** GSC native read evidence upstream; WQT; ZeroRank; later Bing/Yandex evidence when separately authorized.
- **CONFIGURE:** existing G.A.S. 0.9 report, native Google/Bing/GBP surfaces where useful.
- **WATCH:** specialist GEO platforms, rank trackers, local-grid tools, backlink indexes, Looker/AgencyAnalytics, SERP-intent providers.
- **SKIP:** crawler rebuild, rank crawler, backlink crawler, universal proprietary SEO/GEO score, generic dashboard platform, autonomous content publishing, vendor cloning.

## Automation & Agent Operations dependencies

Return these needs to Automation ORCH7; they are not Release 0.10 implementation scope:

1. A **read-only Search Console retrieval/export path** for LDW-owned properties that preserves source property, query/page dimensions, exact period, last-complete date/preliminary status, provider aggregation semantics and source integrity.
2. Provider retrieval should emit compact bounded data suitable for deterministic local analysis; do not stream huge row sets directly into an LLM.
3. Preserve missing dates / API truncation / top-row limitations as coverage metadata instead of inserting zeroes.
4. Future Bing/Yandex retrieval must remain provider-separated and retain each provider’s own ranking/index semantics.
5. IndexNow remains a separately authorized write/notification action.

## Current reference sources

Primary/native and vendor documentation reviewed for this matrix:

- Google Search Console Performance: https://support.google.com/webmasters/answer/7576553
- Google Search Console data semantics: https://support.google.com/webmasters/answer/17011364
- Google Search Analytics API: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Bing Webmaster Tools: https://www.bing.com/webmasters/about
- Bing AI Performance: https://blogs.bing.com/webmaster/2026/2/Introducing-AI-Performance-in-Bing-Webmaster-Tools-Public-Preview/
- Bing AI intents/topics/citation share: https://blogs.bing.com/search/2026/6/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare/
- IndexNow protocol: https://www.indexnow.org/documentation
- Yandex Webmaster crawl statistics: https://yandex.com/support/webmaster/en/service/site-indexing
- SEOTesting features: https://seotesting.com/home/features/
- SEOTesting annotations: https://support.seotesting.com/en/article/how-to-annotate-seotesting-graphs-1h75ssf/
- GSC Wizard overview: https://www.gscwizard.com/
- GSC Wizard MCP/analysis model: https://mcp.gscwizard.com/
- MarketMuse cluster/intent planning: https://help.marketmuse.com/support/solutions/articles/80001167712
- Surfer Content Audit: https://docs.surferseo.com/en/articles/9182497-content-audit
- Surfer internal linking: https://docs.surferseo.com/en/articles/9154320-automated-internal-linking-tool
- Sitebulb internal linking: https://support.sitebulb.com/en/articles/12839707-auditing-internal-linking-with-sitebulb
- Ahrefs Site Audit: https://ahrefs.com/site-audit
- Ahrefs Rank Tracker: https://ahrefs.com/rank-tracker/
- Semrush Position Tracking: https://www.semrush.com/kb/32-position-tracking
- Semrush Site Audit: https://www.semrush.com/kb/31-site-audit
- Semrush AI Visibility: https://www.semrush.com/kb/1493-ai-visibility-toolkit
- Profound: https://www.tryprofound.com/features
- OtterlyAI: https://otterly.ai/features/
- BrightLocal Local Search Grid: https://www.brightlocal.com/local-seo-tools/rankings/local-search-grid/
- Local Falcon local rank tracking: https://www.localfalcon.com/features/local-rank-tracking
- Majestic Trust Flow: https://majestic.com/trust-flow
- Looker Studio data sources/connectors: https://cloud.google.com/looker/docs/studio/about-data-sources
- AgencyAnalytics rank/report workflow: https://help.agencyanalytics.com/en/articles/2772579-rank-tracker-overview

## Review cadence

Revisit this matrix before each material G.A.S. release and whenever a native provider materially expands its own free capabilities. Prefer replacing planned G.A.S. sensing with native/maintained sources rather than duplicating commodity collection.
