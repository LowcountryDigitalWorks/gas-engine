# Google Search generative AI performance evidence

**Status:** Post-acceptance source/method research under [Issue #31](https://github.com/LowcountryDigitalWorks/gas-engine/issues/31) and [Issue #100](https://github.com/LowcountryDigitalWorks/gas-engine/issues/100). Accepted Release 0.22 is the interpretation authority. This file grants no provider connection, OAuth, customer-data, runtime, schema, or later-release authority. The accepted baseline is Releases 0.1–0.24, package `0.24.0`.

**Checked:** 2026-10-31

## Current provider-native measurement

Google Search Console now has dedicated generative AI performance reports for Google Search and Discover. Google announced them on 2026-06-03 and says rollout to all websites worldwide completed on 2026-08-31. The reports expose URL impressions in generative AI features, pages, countries, dates, and—on Search—devices. Google also says this data remains included in the overall Performance report.

This adds a provider-native aggregate visibility evidence class alongside the prompt-cohort and referral evidence already discussed in #100. It describes a site's URLs appearing in Google's own generative Search/Discover surfaces; it is not a sampled prompt panel, a response-level mention/citation study, or a measurement of AI-assistant referrals.

Google's Search Console metric definitions still matter. An impression means a user saw or potentially saw a link, with result-type-specific rules. For AI Overviews, the standard impression rules apply and all links in one overview receive the same search-result position. In AI Mode, each follow-up question is treated as a new query for impression, position, and click counting. These are provider-native reporting semantics; they do not establish actual audience reach, citation prominence, or causal impact.

The Search report excludes Search Labs experiment traffic and may not appear for properties without enough generative-feature impressions; report absence is not zero impressions. Recent data can be preliminary and later change. Report tables and exports are bounded (including the usual 1,000-row table limit), and chart and table totals can differ with their aggregation context, so chart totals do not make exported rows a complete additive universe. The export also writes UI `~` and `-` unavailable/not-a-number values as numeric zero; an exported `0` is not an observed zero when that conversion has lost availability state.

Google Analytics separately classifies recognized AI-assistant referrers into an AI Assistant channel and assigns an `ai-assistant` medium. That is site-visit/referral evidence after a user click, not a measure of whether a site appeared in an AI response or Search feature.

## Search generative AI exposure control

Google's Search generative AI control rolled out to all websites worldwide as of 2026-08-31. It covers AI Overviews, AI Mode, and generative AI features in Discover. The values are Include, Exclude, and inherited parent state. Include is the default when a property is not inheriting; a child property inherits its closest configured parent and can override that state. Exclude prevents the site's links and content from appearing in or grounding those features, so the site receives no traffic or impressions from them while excluded.

The control is not a ranking or inclusion signal for other Search. It is separate from `noindex`, which blocks appearance in Google Search, and from AI-training controls such as Google-Extended. A change generally takes a few days: exclusion is commonly 1–2 days after the control goes live, and some content takes longer because of caching and propagation. The change timestamp alone does not prove that every covered surface has fully propagated.

The Search and Discover generative AI performance reports say a missing report can follow explicit exclusion or insufficient impressions or eligibility. Report absence is not a numeric zero. Export conversion of unavailable values to `0`, described above, remains a separate missingness rule.

On 2026-10-30 Google announced plans to support the shared AIPREF AI-training preference in `robots.txt` in 2027. That is future AI-training-control context only. It is not this Search exposure control and creates no current dependency or runtime behavior.

## G.A.S. interpretation

- Keep provider-native generative-feature impressions, ordinary Search Console evidence, AI-prompt cohort observations, AI-assistant referrals, and business outcomes as distinct measurement universes. Do not blend or add them into one visibility or performance score.
- If a future accepted intake consumes the dedicated report and the overall Performance report, preserve the native relationship: the feature data is included in overall totals, so those views are not additive measurements.
- Preserve provider, report/surface, metric definition, available dimensions, observation window, freshness/completeness, and methodology version. Preserve preliminary status, row/aggregation limits, and missingness; do not infer an observed zero from a converted export value or report absence. Do not assume that the native report supplies a prompt/query-level cohort or citation/mention semantics.
- The current Search Analytics API reference lists `discover`, `googleNews`, `news`, `image`, `video`, and `web` as `type` values; it does not establish a dedicated generative-AI type or a mapping that reproduces this UI report. The reviewed first-party API and bulk-export documentation does not establish such equivalence, so dedicated API/bulk-export availability remains **unproven, not impossible**. Do not infer it from UI availability.
- Keep the Release 0.22 prompt-count and sampling-cadence continuity requirements for actual prompt-cohort observations. Do not apply prompt-sampling requirements to a separate provider-native aggregate report that does not use a caller's prompt sample.
- A known Include, Exclude, or inherited-parent state is exposure context for this provider-native report universe. A control or inheritance change that spans a comparison may require accepted Release 0.22 `exposure_discontinuous`, `unknown`, or partial-exposure (`partially_exposed`) treatment. Elapsed time after the change does not by itself prove full propagation.
- An excluded interval, including a missing report or no generative-AI observations, does not prove poor content or visibility. Ordinary Search remains a separate measurement universe because the control is not a ranking or inclusion signal for other Search.
- No new semantic release, schema, Search Console integration, or poller is required. The current disposition is **WATCH / future INTEGRATE only through an already-authorized sanitized aggregate path**. This research does not authorize a Search Console connection, API/OAuth access, data export, schema change, provider call, customer evidence, or new release.

## First-party sources

- Google Search Central, [Introducing Search Generative AI performance reports in Search Console](https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports) — report scope, dimensions, inclusion in overall Performance reporting, and rollout date.
- Search Console Help, [Generative AI performance report (Search)](https://support.google.com/webmasters/answer/16984139?hl=en) — Search Labs exclusion, availability, preliminary data, table/export behavior, and unavailable-value conversion.
- Search Console Help, [What are impressions, position, and clicks?](https://support.google.com/webmasters/answer/7042828) — impression semantics, AI Overview position treatment, and AI Mode follow-up query counting.
- Search Analytics API, [query reference](https://developers.google.com/webmaster-tools/v1/searchanalytics/query) — documented `type` values and `searchAppearance` filtering.
- Search Console Help, [About bulk data export to BigQuery](https://support.google.com/webmasters/answer/12918484?hl=en) — reviewed for a dedicated generative-report mapping; none is documented there.
- Google Analytics Help, [What's new in Google Analytics](https://support.google.com/analytics/answer/9164320) — AI Assistant referral channel and source/medium classification.
- Search Console Help, [Search generative AI control](https://support.google.com/webmasters/answer/16908024) — Include, Exclude, and inherited parent state; covered surfaces; propagation; separation from other Search, `noindex`, and AI training.
- Google Search Central, [Control what you share with Google Search](https://developers.google.com/search/docs/crawling-indexing/control-what-you-share) — site-wide Search generative AI control listed separately from `noindex`.
- Search Console Help, [Generative AI performance report (Discover)](https://support.google.com/webmasters/answer/16983858) — Discover report absence can follow exclusion or insufficient impressions.
- Google Search Central, [Supporting a shared AI training control for websites](https://developers.google.com/search/blog/2026/10/ai-training-control) — 2026-10-30 AIPREF plan for 2027; training control only, not Search exposure.