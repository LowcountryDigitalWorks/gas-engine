# GAS-ROADMAP-002 — Competitor capability matrix

Research date: 2026-09-29  
Authority: gas-engine #31  
Baseline reviewed: main b1ff0ed27275bd873a2f962721ef1bbafd5049d7  
Purpose: living competitor-informed roadmap for LDW internal G.A.S. R&D. This is not customer-SaaS authority and does not authorize provider credentials, paid tooling, cloud deployment, or production mutation.

## Decision vocabulary

- **BUILD** — G.A.S. should own the deterministic semantic/decision layer because it creates reusable LDW operating value.
- **INTEGRATE** — consume sanitized/normalized evidence from an existing native/vendor sensor through an upstream approved ingestion path.
- **CONFIGURE** — prefer native/free existing capability rather than duplicating it.
- **WATCH** — keep under review; do not add cost or integration until a concrete decision proves value.
- **SKIP** — deliberately do not reproduce commodity sensing/platform functionality.

## Cross-cutting findings

1. Search and AI visibility products are converging on the same operating pattern: collect provider evidence, preserve time windows and cohorts, surface a small set of opportunities, annotate changes, and remeasure.
2. The differentiated G.A.S. opportunity is not crawling, rank collection, prompt execution, or dashboarding. It is provider-neutral evidence semantics, deterministic change detection, explicit policy, human-reviewed recommendations, and longitudinal outcome memory.
3. Search/AI evidence is increasingly sampled, delayed, partial, or volatile. G.A.S. must preserve freshness, completeness/coverage, provider scope, time window, dimensions, units, and provenance instead of manufacturing zeroes or blending unlike sources.
4. Deterministic arithmetic/statistical analysis belongs before LLM interpretation. Models should receive compact derived facts, not raw Search Console row dumps or large provider payloads.
5. Native/free sources have expanded materially. Google Search Console now exposes richer filtering/comparison including branded/non-branded classification in its UI. Bing Webmaster Tools now exposes AI citation trends, grounding queries, page mappings, and preview intent/topic/citation-share analysis. These are sensors to integrate/configure, not features to clone.
6. Paid suites remain valuable primarily for proprietary data universes, crawling scale, SERP/rank collection, link indexes, geo-grid local rankings, and polished reporting. G.A.S. should buy/integrate those only when a concrete LDW decision cannot be supported by native/included evidence.

## Capability matrix

| Domain | User job / problem | Current leading references and useful patterns | Commodity sensing vs LDW differentiation | Decision | Cost / security / privacy | Smallest LDW-owned proof | Candidate release |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A. Search Console analytics / search intelligence | Turn query/page performance history into a small set of actionable opportunities without manually scanning tables. | Google Search Console native Performance reports/API; GSC Wizard; SEOTesting; Ahrefs/Semrush GSC views. Useful patterns: date-window comparison, query/page dimensions, branded/non-branded segmentation, striking-distance views, content decay, CTR opportunity, annotations, and before/after tests. | Collection/filtering is commodity. G.A.S. differentiation is typed windows, explicit coverage/freshness, deterministic signal policy, human review, and outcome history. | **BUILD + INTEGRATE + CONFIGURE**. Build signal semantics; integrate sanitized GSC evidence upstream; configure native GSC for source truth. WATCH GSC Wizard/SEOTesting as reference products. | Native GSC is included; SEOTesting currently starts around $50/mo for one site. GSC requires read-only Google property access; no new OAuth belongs in G.A.S. | Synthetic/public-safe GSC-like two-window fixture plus LDW-owned exported evidence; no provider networking in G.A.S. | **0.10 — Search Analytics Signal Pack** |
| B. Query intent / page focus / content architecture | Decide whether one page is serving multiple materially different query groups and whether to consolidate, expand, or split content. | GSC Wizard reverse-cannibalization pattern; MarketMuse topic authority/inventory; Clearscope intent-driven recommendations; Surfer Sites/Topical Map; InLinks entity/internal-link concepts; Ahrefs/Semrush clustering. | Keyword/topic collection and SERP snapshots are commodity. G.A.S. can own page-query cohort semantics, evidence for overlap/divergence, and the explicit requirement for external SERP validation before a split/consolidate conclusion. | **BUILD + WATCH**. Build candidate detection after 0.10. WATCH paid content suites and low-cost SERP evidence. Do not automate split decisions from GSC overlap alone. | MarketMuse has a limited free tier; Clearscope starts around $129/mo; Surfer has paid plans; exact InLinks vendor pricing should be rechecked before purchase. Content/query data may be commercially sensitive. | Synthetic query→page cohorts showing one primary intent plus a divergent cluster; output must say “SERP validation required” before split/consolidate advice. | **0.12 — Page-Focus Candidate Analysis** |
| C. Multi-engine indexing / crawl triangulation | Distinguish broad cross-engine indexing/crawl evidence from engine-specific divergence and provider lag without pretending any one provider is universal index truth. | Google URL Inspection indexed-version evidence; Bing URL Inspection/Site Explorer plus current REST-oriented Webmaster APIs; Yandex searchable/excluded/important-page/history/recrawl evidence; IndexNow submission notification. | Engine crawling/indexing is commodity. G.A.S. differentiation is provider-preserving normalized evidence, exact-URL alignment, explicit readiness, deterministic multi-finding classification, and service-history composition without universal score blending. | **INTEGRATE + BUILD — ACTIVE 0.13 CANDIDATE**. Upstream automation owns provider retrieval/sanitization; G.A.S. owns only bounded deterministic adapter/analysis/report semantics. | Native webmaster tools/IndexNow are generally included. Credentials/OAuth/API keys remain upstream; public repo gets only synthetic fixtures. | Four sanitized synthetic provider artifacts; exact-URL broad/divergent/crawl/canonical/permission findings; descriptive IndexNow context; optional exact Release 0.10 search context; static operator preview. | **0.13 — Discovery Diagnostics Pack** |
| D. Technical SEO / site quality | Find crawl/site-quality defects and track whether technical changes actually resolved them. | LDW WQT/SiteOne/Lighthouse; Screaming Frog; Sitebulb; Ahrefs Site Audit; Semrush Site Audit. Sitebulb emphasizes prioritized hints + audit comparison; Screaming Frog provides crawl comparison/change detection and a free 500-URL tier. | Crawling and issue extraction are commodity. G.A.S. differentiation is semantic longitudinal memory, correlation to other visibility evidence, human recommendations, and outcomes. | **INTEGRATE WQT + SKIP crawler build + WATCH supplemental tools**. | Existing WQT is already accepted. Screaming Frog free tier covers 500 URLs; paid license is £199/year (USD pricing varies). No new scanner dependency needed now. | Continue consuming WQT typed facts and compare them with later search signals; do not add another crawler. | Later cross-source correlation release, not 0.10 |
| E. AI / answer-engine visibility | Track whether the brand/pages are mentioned or cited in AI answers, what sources shape those answers, and whether visibility changes after work. | Existing ZeroRank; Bing AI Performance; Profound; Peec; Otterly; Scrunch; Semrush/Ahrefs AI visibility. Common patterns: prompt cohorts, brand coverage/share, citations/source URLs, sentiment/position, competitor gaps, daily trend tracking, crawlability/agent traffic. | Prompt execution and answer collection are commodity. G.A.S. differentiation is stable prompt-cohort provenance, replaceable-sensor normalization, cross-time comparison, evidence-linked action/outcome history, and refusal to treat vendor scores as universal truth. | **INTEGRATE existing ZeroRank + CONFIGURE Bing native + WATCH other vendors + SKIP prompt-runner rebuild**. | ZeroRank is already owned/accepted. Otterly starts around $29/mo; Peec around $95/mo; Scrunch Core around $250/mo; Profound is largely enterprise/custom. These services can expose brand/competitor strategy and prompt data. | Use existing sanitized ZeroRank evidence and later compare with Bing native AI citation evidence without blending scores. | Later AI-visibility correlation release |
| F. Rank / SERP / competitor intelligence | Know where the site and competitors rank, how SERPs change, and which competitor/content gaps warrant action. | Ahrefs, Semrush, SE Ranking, Moz, DataForSEO. Ahrefs currently combines rank tracking, site/keyword/competitor data, AI prompt tracking, APIs/MCP. DataForSEO offers low unit-cost SERP APIs. | Web-scale rank collection, SERP history, and competitor databases are commodity/proprietary. G.A.S. should own only semantics needed to support a decision. | **WATCH + INTEGRATE only on demonstrated need; SKIP rank crawler**. | Ahrefs Lite is about $129/mo; Semrush SEO about $139/mo monthly; DataForSEO is usage-based and can be very low per SERP but is still paid/API-key scope. | If 0.12 requires SERP validation, test the smallest manual/native or bounded paid sample before any durable integration. | Dependency for 0.12 validation, not a standalone release |
| G. Local SEO / local business visibility | Understand local-pack/Maps visibility by geography and connect it to GBP/site actions. | Google Business Profile/native search; BrightLocal Local Search Grid; Whitespark Local Rank Tracker/Ranking Grids; Local Falcon geo-grid. Useful pattern: visibility varies street-by-street, so one city-wide rank is misleading. | Geo-grid sensing and GBP management are commodity. G.A.S. differentiation would be evidence history and connection to bounded recommendations/outcomes, only if LDW gains local clients needing it. | **CONFIGURE native GBP + WATCH paid local sensors**. Do not build grid rank collection. | BrightLocal starts around $31/mo; Whitespark ranking grids start around $10/mo and Local Rank Tracker around $17/mo; Local Falcon starts around $24.99/mo. Local search data is customer/location specific. | No current G.A.S. release. Use one LDW-owned/local-business-safe case only if a real service need appears. | WATCH |
| H. Links / authority / internal linking | Find internal links that can strengthen important pages and detect meaningful external link changes without running an internet-scale link index. | Ahrefs/Majestic/Moz external link indexes; GSC links; Screaming Frog site graph; InLinks entity/internal-link automation; Surfer semantic internal linking. | External backlink indexes are commodity and expensive to reproduce. Internal graph + search-demand interpretation can be an LDW-owned decision layer. | **BUILD later for internal-link opportunity semantics; INTEGRATE/WATCH external backlink sources; SKIP backlink crawler**. | Existing site crawl graph can be $0 via WQT/approved crawl evidence. External indexes are paid. Internal linking can affect production content, so recommendations remain human-approved. | Combine an existing site graph with 0.10 search-demand signals and produce candidate source→target links; no automatic insertion. | Later internal-link intelligence release |
| I. Experimentation / annotations / outcomes | Know what changed, when it changed, whether enough time/data has elapsed, and what happened afterward without overstating causality. | SEOTesting; GSC Wizard forecasting/experiments/annotations; Surfer Sites activity log; existing G.A.S. Release 0.8 recommendation/measurement/outcome ledger. SEOTesting uses GSC history for tests and content-decay analysis. | Data collection is commodity. This is a strong G.A.S. differentiation because accepted human recommendation/outcome history already exists. | **BUILD next after 0.10**. Reuse existing ledger; preserve human-declared outcomes and explicit “not yet measurable.” | $0 incremental inside G.A.S.; SEOTesting currently starts around $50/mo. No new provider credentials if using already-normalized evidence. | Bind one synthetic/LDW change annotation to baseline/follow-up 0.10 signal windows and prove readiness/coverage semantics without causal inference. | **0.11 — Search Change Annotation & Outcome Cohorts** |
| J. Reporting / operator workflow | Turn complex evidence into a compact operator view and plain-language service report without building another dashboard SaaS. | Accepted G.A.S. Release 0.9; GSC Wizard exports/MCP; Looker Studio; AgencyAnalytics; Ahrefs/Semrush report builders. | Dashboard widgets/scheduling are commodity. G.A.S. should own compact evidence summaries and provenance; presentation can use static/export/native tools until friction proves otherwise. | **BUILD compact deterministic summaries + CONFIGURE existing export/report tools + SKIP dashboard platform**. | Existing static operator preview is $0. Agency/reporting SaaS adds recurring cost and customer-data surface. | Extend report data only when a new accepted signal needs representation; no new dashboard framework. | Incremental with each accepted release |

## Current-source notes that materially affect design

### Google Search Console

- Performance data supports query/page dimensions, filtering, date comparisons, and multiple time granularities.
- Native branded/non-branded query classification exists in the Search Console UI and carries caveats: it may be unavailable for low-impression properties and is informational rather than ranking truth.
- Search Analytics API requests support bounded row paging (up to 25,000 rows per request) and an explicit dataState choice between finalized and fresher/partial data.
- Design consequence: 0.10 must represent source window, aggregation, final/preliminary state, filters/dimensions, and coverage. Do not turn unreturned/anonymized/partial data into zero.

### GSC Wizard / SEOTesting pattern

- GSC Wizard exposes striking-distance, content-decay, cannibalization, CTR, content groups/topic clusters, indexing, annotations, and experiments around GSC data.
- SEOTesting demonstrates commercial value in change annotations, content-decay detection, and same-source before/after measurement.
- Design consequence: build the reusable deterministic mechanics, not another GSC dashboard.

### Release 0.13 discovery-platform research — 2026-09-29

- Google Search Console URL Inspection indexed-version output exposes a high-level index verdict, coverage state, robots state, indexing/noindex state, last crawl time, page-fetch state, Google-selected canonical and user-declared canonical. Design consequence: upstream sanitization may preserve these concepts, but G.A.S. maps only conservative common states and keeps provider detail in sidecar evidence.
- Bing Webmaster URL Inspection exposes crawl/index/SEO diagnostics, while Microsoft's current Webmaster API documentation states legacy SOAP/POX APIs retire August 31, 2026 and directs integrations toward REST APIs. Design consequence: no legacy Bing client belongs in G.A.S.; future retrieval remains upstream and current-API based.
- Yandex Webmaster exposes searchable/excluded state, crawl/index HTTP status, exclusion reasons, exact target URL for redirect/canonical/duplicate cases, important-page status history, indexing history and recrawl workflows. Design consequence: target URL remains provider-specific evidence unless the sanitized source explicitly identifies it as canonical.
- IndexNow is change-notification/submission evidence. Its official FAQ states submission does not guarantee indexing and participating engines independently decide whether to crawl/index a URL. Design consequence: accepted submission never becomes search presence and later observations remain descriptive correlation only.
- Bing AI Performance currently exposes citations, grounding queries, page mappings, trends and preview intent/topic/citation-share views; Bing also states these metrics are aggregated/sampled and are not ranking/authority/importance measures. This remains a queued Release 0.14 AI-visibility input, not Release 0.13 index truth.

Primary references:
- https://developers.google.com/webmaster-tools/v1/urlInspection.index/UrlInspectionResult
- https://learn.microsoft.com/en-us/bingwebmaster/
- https://www.bing.com/webmasters/help/URL-Inspection-55a30305
- https://yandex.com/dev/webmaster/doc/en/reference/host-id-important-urls
- https://yandex.com/dev/webmaster/doc/en/reference/host-id-important-urls-history
- https://yandex.com/support/webmaster/en/service/searchable
- https://www.indexnow.org/faq
- https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c

### Bing AI Performance

- Bing Webmaster Tools AI Performance now reports page citations, grounding queries, query↔page mappings, trends, and preview intent/topic/citation-share views.
- Bing explicitly describes the data as aggregated/sampled and not a ranking/authority measure.
- Design consequence: treat this as another replaceable evidence sensor with provider-specific freshness/coverage; do not clone its prompt/citation collection or blend its counts into ZeroRank scores.

### Paid suites

- Ahrefs/Semrush now bundle classical SEO, rank/site/competitor data, reporting, and AI visibility.
- Profound, Peec, Otterly, and Scrunch concentrate on prompt cohorts, citations, competitive presence, and AI-search trends; higher tiers add APIs, reporting, crawlability, agent analytics, or content workflows.
- Design consequence: G.A.S. should remain the LDW-owned decision/history layer while commodity sensing stays replaceable.

## Refined evergreen release sequence

The original 0.10/0.11/0.12 hypothesis is changed based on current evidence and accepted architecture.

### 0.10 — Search Analytics Signal Pack — NEXT

Smallest useful bounded proof:

- pure/local deterministic analysis;
- no provider networking, OAuth, scheduler, background worker, cloud resource, new paid service, or production mutation;
- consume a bounded sanitized search-analytics artifact supplied by a trusted caller/upstream retrieval path;
- preserve provider/source, property identity as evidence (not authority), search type, period/window, dimensions/filters, freshness/finality, coverage, units, and provenance;
- derive only explicitly defined mechanical signals:
  - window deltas/trends;
  - caller-policy striking-distance candidates;
  - caller-policy decay candidates;
  - caller-policy CTR opportunity candidates;
  - query→multiple-page overlap candidates;
  - optional brand/non-brand dimension only when supplied by the upstream artifact; do not infer it from query text in 0.10;
- every policy threshold/version is explicit in the analysis request/output;
- no automatic recommendation priority, causal conclusion, split/consolidate advice, or “improved/regressed” inference;
- synthetic second-tenant/adversarial proofs for any new owned read/analysis surface.

Reason to keep first: highest reusable internal value, native GSC is authoritative/included, and it enables later page-focus, experimentation, internal-link, and reporting work.

### 0.11 — Search Change Annotation & Outcome Cohorts

Moved ahead of intent analysis because it composes directly with accepted Release 0.8 and closes more of the LDW operating loop with less new sensing.

Bounded proof:

- attach a human/trusted change annotation to an explicit baseline/follow-up search-signal cohort;
- preserve exact same-source/filter/window semantics;
- represent readiness, insufficient coverage, and not-yet-measurable explicitly;
- reuse human-declared outcome semantics; do not infer causality from metric movement;
- no scheduler/provider access.

### 0.12 — Page-Focus Candidate Analysis

Narrowed from “intent split/consolidate” to evidence candidates.

Bounded proof:

- cluster/query-page overlap representation using normalized search evidence;
- identify pages receiving materially distinct query cohorts;
- preserve the original primary-intent page;
- output “SERP validation required” before any split/consolidate conclusion;
- optional external SERP/competitor evidence remains separately authorized and replaceable;
- no autonomous content generation or publishing.

### 0.13 — Discovery Diagnostics Pack

Authorized under Issue #43 after current provider research and accepted Release 0.10/0.12 semantics established the needed trusted-evidence and exact-URL boundaries.

Bounded proof:

- provider-specific evidence preserved independently;
- exact sanitized Google/Bing/Yandex/IndexNow contracts with trusted adapter configuration;
- classify broad indexing, engine-specific presence divergence, broad crawl-access issues, canonical divergence and indexing-permission divergence;
- retain multiple findings instead of collapsing to a score;
- IndexNow submission remains notification evidence only;
- optional exact Release 0.10 search context cannot alter diagnostic finding kind;
- deterministic site rollup + static operator report;
- no ranking/citation score blending;
- no provider retrieval inside G.A.S.

### Later candidates

- AI-visibility cross-source correlation over ZeroRank + native Bing AI evidence;
- internal-link opportunity semantics from existing site graph + search demand;
- local SEO evidence only when a real LDW/client use case justifies a replaceable local sensor;
- richer operator/report output only when accepted signals create repeated reporting friction.

## 0.10 upstream automation dependency

Automation & Agent Operations should own read-only GSC retrieval and evidence transport. Product needs a bounded sanitized artifact, not credentials or live API access inside G.A.S.

Minimum upstream artifact semantics to freeze with Automation before real LDW evidence is used:

- source provider and source contract version;
- property/site projection as evidence, never tenant authority;
- observation/export timestamp;
- requested and effective date window;
- final/preliminary/freshness state;
- search type;
- explicit filters/dimensions (query, page, country, device, search appearance as applicable);
- metric units for clicks, impressions, CTR, and average position;
- explicit coverage/truncation/anonymization/row-limit semantics;
- deterministic row ordering/identity;
- no manufactured zeroes for missing/unreturned rows;
- sanitized/public-safe fixture for G.A.S. development.

Initial 0.10 mechanism proof may use synthetic fixtures before Automation supplies real LDW-owned evidence.

## Sources reviewed in this pass

Primary/native/current references:

- Google Search Console Search Analytics API: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
- Google Search Console Performance report documentation: https://support.google.com/webmasters/
- GSC Wizard documentation: https://www.gscwizard.com/docs.html
- Bing Webmaster Tools AI Performance: https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c
- Yandex Webmaster diagnostics/crawl statistics: https://yandex.com/support/webmaster/
- IndexNow: https://www.indexnow.org/
- Ahrefs pricing/features: https://ahrefs.com/pricing
- Semrush SEO + AI Search pricing/features: https://www.semrush.com/pricing/seo-ai-search/
- Screaming Frog SEO Spider: https://www.screamingfrog.co.uk/seo-spider/
- Sitebulb features: https://sitebulb.com/features/
- MarketMuse pricing/features: https://www.marketmuse.com/pricing/
- Clearscope pricing/features: https://www.clearscope.io/pricing
- Surfer documentation: https://docs.surferseo.com/
- SEOTesting: https://seotesting.com/
- Profound: https://www.tryprofound.com/features
- Peec: https://peec.ai/pricing
- Otterly: https://otterly.ai/pricing
- Scrunch: https://scrunch.com/pricing/
- BrightLocal Local Search Grid: https://www.brightlocal.com/local-seo-tools/rankings/local-search-grid/
- Whitespark pricing: https://whitespark.ca/pricing/
- Local Falcon: https://www.localfalcon.com/
- DataForSEO: https://dataforseo.com/pricing
- AgencyAnalytics: https://agencyanalytics.com/pricing

## Review cadence

Revisit this matrix before each material capability expansion and at least when:

- a native platform adds a materially overlapping capability;
- a paid vendor becomes necessary to support a concrete decision;
- #280 service evidence exposes repeated manual work;
- an upstream provider contract changes;
- current pricing/support/privacy materially changes the BUILD/INTEGRATE/WATCH/SKIP choice.

Do not mechanically expand G.A.S. because a competitor has a feature.

## Release 0.14 research update — Bing AI Performance and ZeroRank semantic boundary

Status: candidate research basis for Issue #44, 2026-09-30.

| Capability / evidence | Bing Webmaster Tools AI Performance | ZeroRank | Release 0.14 treatment |
| --- | --- | --- | --- |
| Total citation activity | First-party sampled/aggregated provider reporting | Vendor-specific citation/visibility evidence | Preserve separately; never treat raw magnitudes as equivalent |
| Page citation counts | Supported in AI Performance views/exports | Source URL citation/usage fields available in accepted sanitized evidence | Exact provider-specific rows; separate concentration candidates |
| Grounding queries / prompts | Bing returns grouped grounding-query phrases | ZeroRank preserves exact vendor prompt IDs/text | Not equivalent by default; exact caller mapping required for cohort comparison |
| Query/page relation | Bing can expose grounding-query/page mapping views | ZeroRank chats/sources preserve vendor relations | Use only explicit supplied relations; never invent mappings |
| Time/change views | Bing trend/Compare are observational | ZeroRank provider evidence may be compared longitudinally under accepted semantics | Provider-specific descriptive change only; no causality |
| Intent / topic | Bing preview provider classifications | ZeroRank prompt topic/tags when supplied | Preserve as provider evidence; do not promote to universal G.A.S. intent truth |
| Citation share / visibility / rank | Bing preview citation share is Bing-specific | ZeroRank visibility/rank/share-style metrics are ZeroRank-specific | No cross-provider normalization or magnitude blending |
| Export | Bing documents CSV/Excel exports | Sanitized upstream ZeroRank artifact already accepted in Release 0.6 | Release 0.14 consumes sanitized local evidence only |
| AI Performance API | No Release 0.14-authorized public API contract established by current research | Existing upstream read-only ZeroRank sensing remains outside G.A.S. | No provider client, OAuth, or networking in G.A.S. |
| Sampling/completeness | Bing documents aggregation/sampling and possible view/filter total differences | Endpoint completeness is explicit in accepted sanitized evidence | Unknown/filtered/sampled/incomplete evidence never becomes absence |
| Action authority | Reporting/measurement source only | Reporting/measurement source only | No automatic content/remediation/publishing action |

Current first-party Bing research used by Issue #44 includes Bing Webmaster Help and Bing Search/Webmaster announcements describing AI Performance, grouped grounding queries, Intents, Topics, Citation Share, Compare, sampling/aggregation, and export behavior. The implementation intentionally relies only on the frozen sanitized evidence contract rather than runtime vendor behavior.

ZeroRank remains a replaceable upstream evidence sensor. Release 0.14 reuses accepted Release 0.6 validation and does not expand ZeroRank runtime authority.


## Release 0.15 composition update

Issue #51 converts the earlier “richer operator/report output” watch item into a bounded internal composition candidate rather than a new reporting SaaS or data platform.

Release 0.15 reuses accepted G.A.S. evidence/analysis/history outputs and static HTML patterns. It deliberately does not buy or rebuild AgencyAnalytics-style dashboard/reporting infrastructure, add a generic SEO suite, duplicate provider sensing, or introduce a persistent dashboard tier. The value hypothesis is reduced recurring LDW delivery/reconciliation effort through one deterministic service brief over already accepted evidence.

Issue #49 internal-link research remains a separate future upstream/SiteOne gate and is not implemented by this release.
