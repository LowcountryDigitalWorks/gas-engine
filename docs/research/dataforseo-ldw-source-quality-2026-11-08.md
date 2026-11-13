# DataForSEO source-quality case study — LDW-owned website

Status: **observed specialist-source proof, not an accepted G.A.S. adapter or recurring provider connector**  
Observation: 2026-11-09 00:48–00:52 UTC (November 8, Eastern)  
Owning evidence issue: [DATAFORSEO-EVIDENCE-LDW-001 #163](https://github.com/LowcountryDigitalWorks/gas-engine/issues/163)  
Website decision owner: [WEB-SEO-SERVICE-MAP-001 #147](https://github.com/LowcountryDigitalWorks/lowcountrydigitalworks.com/issues/147)  
Source selection: [business-operations #776](https://github.com/LowcountryDigitalWorks/business-operations/issues/776)

## Purpose and authority

This records **one bounded, owner-authorized, existing-prepaid-credit research pass** against public LDW-owned `lowcountrydigitalworks.com`. It is a source/operator education artifact, not a live DataForSEO connector, G.A.S. semantic release, scheduled collection, prospect data, link-acquisition tool, keyword insertion list, search-volume forecast, or instruction to make website changes automatically.

The existing internal [service catalog](https://github.com/LowcountryDigitalWorks/business-operations/blob/main/docs/services/SERVICE_CATALOG.md) is the only authority for what LDW operates publicly. Website ORCH owns source/copy and protected release; Search Data & Analytics owns first-party GSC query/page/URL-inspection observations. A search provider signal is **evidence for a human judgment**, never permission to change a site or to claim business outcomes.

## Frozen provider cohort and measured cost

The research used authenticated DataForSEO v3, `noAiMode=true` to preserve the full result envelope, exact reported per-task cost, and status. No new API credentials or recurring tasks were created.

| API | Mode, population and useful signal | Charged USD |
| --- | --- | ---: |
| `dataforseo_labs/google/keyword_ideas/live` | US 2840 / en; four website/maintenance seeds; 60 of 542,800 broad-match ideas; most returned top rows were irrelevant or navigational | 0.019200 |
| `dataforseo_labs/google/keyword_overview/live` | US 2840 / en; 29 exact candidate strings; only **5 present** in provider keyword index | 0.012600 |
| `serp/google/organic/live/regular` | **4** Beaufort-located query snapshots, en, desktop, depth 10; provider resolved name to location code **1025506** | 0.008000 |
| `serp/google/organic/live/advanced` | 1 same-cohort Beaufort web-design query; local pack (3), AI overview and organic are distinct result types | 0.002000 |
| `backlinks/summary/live` | LDW domain, live, include subdomains, exclude internal; four backlink counts / three referring main domains | 0.024036 |
| `backlinks/backlinks/live` | LDW domain, same target, `as_is`, limit 10; three distinct referring pages observed, all `nofollow` | 0.024108 |
| **Measured charges** | **Nine billed requests across six endpoint cohorts; no auto-recharge** | **0.089944** |

The connected provider reported a **$0.10 USD per UTC day spending limit**. That cap was preserved, not increased. A malformed attempted Google Labs `bulk_search_volume/live` path returned `40402 Invalid Path` at $0; that path was not in the Google Labs documentation index (only an Amazon bulk-search-volume family was exposed). An unfiltered free Google SERP locations request exceeded a 64 MiB response transport ceiling. Use a specific provider-supported `location_name` instead: the Beaufort location resolved successfully in live SERP requests. These error states cost $0 but **are not SEO findings**.

## Provider-native evidence: preserve four different universes

1. **Google Search Console**: the verified owner's actual indexed/fetched URL and query/page impression/click/position observations. Its query list is privacy-filtered and its query×page and page-only totals are **not additive** to property totals. At this proof's baseline, GSC's finalized 2026-08-10..11-06 Web period has **303 impressions / 5 clicks** and the exact query `website maintenance beaufort sc` has six impressions / zero clicks on the homepage. It does *not* estimate monthly keyword volume.
2. **DataForSEO Labs keyword index, US/en**: approximate monthly search frequency for the **exact phrase**, aggregated across the **United States**, even if the phrase contains a town's name. `web design bluffton sc` was present with **90 US monthly** / proprietary keyword difficulty **4**; `small business automation` **210** / difficulty **16**; `business systems integration` **40** / difficulty **0**; `website handoff checklist` **10** / difficulty **47**; `website ownership transfer` **10** / difficulty **null**. **24/29 strings were omitted**, not returned as zero; do not call them zero search volume. Proprietary keyword difficulty is *not* a site's ranking and Google Ads `competition` is **paid search** auction competition, not organic difficulty.
3. **DataForSEO localized Google SERP snapshots**: result-types, rank group and absolute SERP positions reflect a single query/location/en/device/time/depth. Google local-pack and AI-overview elements can precede organic links; `rank_group=1` for organic does not mean `rank_absolute=1`. In this sample **both regular and advanced modes represented organic destination `domain` as `google.com` and returned opaque `https://google.com/goto?url=...` URLs**. Some advanced `breadcrumb` entries suggested visible sites, but those must not be treated as separately verified canonical competitor destinations or backlink-intersection targets. Record `unresolved_destination` until a trusted source confirms it. `not_observed_in_depth_10` is not `absent_from_google`.
4. **DataForSEO backlink index**: provider index reported **4 links / 3 referring domains / 3 referring pages** to LDW; detailed `as_is` result returned `seolinkagency.shop`, `seonix.agency`, and `backlink-all-niche.shop`, all `nofollow`, from SEO/link-building-themed pages. This is **an index-scoped observation**, not confirmation of editorial endorsement, absence of other external links, Google PageRank, a ranking penalty or automatic disavow justification. Vendor `rank=0` is proprietary, not a Google metric. Do not buy placements, automatically outreach, automate review requests or treat competitor backlink counts as an outreach quota.

## Evidence interpretation contract for future LDW/client sites

When translating this **human research** into a sanitized artifact, prefer explicit fields and states; do not add a G.A.S. runtime parser until a separately reviewed repeated need justifies one.

| Field | Required interpretation |
| --- | --- |
| `source`, `endpoint`, `surface`, `observed_at`, `received_at` | Preserve exact origin/timing; provider timestamps and owner retrieval times are different clocks |
| `location_code`, `location_name`, `language`, `device`, `search_type`, `depth` | A US keyword-volume scope is **not** a Beaufort-located SERP scope; country query volume is not city-resident volume |
| `keyword`, `search_volume`, `volume_unit` | Report present provider values only; represent omitted data as `provider_index_missing`, not numeric zero |
| `competition`, `keyword_difficulty`, `organic_rank`, `rank_absolute` | Four separate quantities; paid ad competition, proprietary provider difficulty, within-organic rank and whole-SERP position must never be substituted |
| `url`, `domain`, `breadcrumb`, `destination_status` | Opaque Google `/goto` target: `unresolved_destination` until separately confirmed; never manufacture a competitor URL |
| `backlink_source`, `backlink_target`, `link_attributes`, `first_seen`, `last_seen` | Preserve exact page/target and nofollow; record sample/index/missingness limits |
| `task_status`, `provider_error`, `task_cost_usd`, `day_limit_usd` | Provider non-success or transport truncation is `unavailable`/error, not a negative SEO observation; check actual account cost and cap before next call |

### Minimal decision test

A candidate website change must answer **all** of these questions before publication:

- Is the service truly **OPERATING** in the accepted catalog, with accurate scope, customer ownership and local footprint? No new 24/7 MSP, SEO agency, ranking guarantee, false local office or generic SaaS promise.
- Does this phrase solve a buyer's real question **on an existing canonical page**? Prefer one natural explanation in the body/H1/anchor context over repeated keyword strings or near-duplicate location pages.
- Is the target URL actually crawlable to public clients and reported indexed or discovered by verified first-party Google evidence? Do not confuse production 200/normal-client status with verified Googlebot access; do not change WAF/robots merely for DataForSEO SERP absence.
- Is the candidate free of another owning source writer, with one bounded PR, hosted tests/security, author-excluded review and owning Website ORCH final release? The Guide #63 source branch and the SEO page metadata #146 were separate.
- Is there a comparable **finalized** GSC Web pre/post query/page window after observed recrawl? Otherwise classify `NOT_YET_MEASURABLE`, not “SEO improved”. Qualified calls/leads are business outcomes from an authorized client-owned system, not edge request totals or search impressions.

### Product disposition

| Provider family | Current choice | Why |
| --- | --- | --- |
| Exact keyword overview | **AD HOC** | Helps choose factual buyer vocabulary; 24/29 local long-tail phrases absent from US database and provider data cannot replace GSC |
| Broad keyword ideas | **SKIP unfiltered** | 60 of 542,800 returned, many unrelated phrases; costly noise and keyword-stuffing risk |
| Localized SERP | **AD HOC, destination-unresolved caveat** | Local pack and search-intent presence are useful, opaque redirect URLs cannot prove competitor identities |
| Backlinks summary/details | **AD HOC** | One provider-bounded backlink baseline; no crawler/index/G.A.S. runtime needed |
| Competitor backlink intersection / automated link outreach | **HOLD** | No verified competitor root destination from sampled SERP, and user/provider plan cap limits further checks; GSC/Bing first-party sources remain preferred |

No standing provider subscription, new G.A.S. model, paid cron, customer credentials, auto-report, SEO score, release number or external backlink outreach is authorized by this note. Decisions are recorded in issues #97/#105/#163 and the owning Website #147.
