# GSC November 2026 query preview — internal local-only

**Status:** source-only candidate under [GAS #188](https://github.com/LowcountryDigitalWorks/gas-engine/issues/188). No accepted provider collector, customer access, ingestion pathway, production action or semantic release is granted by this file.

## Official provider change

On November 16, 2026, Google added brandedClassification, type=webMultimodal, and dimensionFilterGroups.filterLists for multi-country/device filtering to the Search Analytics API.

- [Google announcement](https://developers.google.com/search/blog/2026/11/search-analytics-api-update)
- [Search Analytics API method and limitations](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)

The existing accepted GAS search-analytics-evidence.v1 minor0/1 adapter requires web search type with query/page rows. This preflight never attempts to pass new branded-classification, multimodal or country/device rows through that adapter, or to synthesize nonexistent query strings.

## Pure local preview

The public export previewGscSearchAnalyticsQuery(candidate) accepts an ordinary JSON-like input containing only:

- property: operator-selected canonical sc-domain:example.test or exact HTTPS origin. This is NOT proof of ownership, tenant/site authority or available OAuth scope.
- startDate, endDate: inclusive PT-calendar dates in YYYY-MM-DD format, at most 31 days.
- profile: branded_split, multimodal_pages or regional_web.
- optional countries: at most eight uppercase ISO-alpha3-shaped values (syntax only; country registry validity is NOT established). Optional devices: up to three distinct DESKTOP/MOBILE/TABLET values. Regional requires at least one such list.

Synthetic illustration:

    const preview = previewGscSearchAnalyticsQuery({
      property: 'sc-domain:example.test',
      startDate: '2026-11-01',
      endDate: '2026-11-14',
      profile: 'regional_web',
      countries: ['USA', 'DEU'],
      devices: ['MOBILE', 'DESKTOP'],
    });

The returned frozen data is ONLY an unexecuted Google query-body preview. It declares sourceVerified=false, providerRowsCollected=false, networkAuthorized=false, and acceptedSearchAnalyticsAdapterCompatible=false. It returns no rows, metrics, HTTP URL, access grant or quota proof.

- branded_split: web type, brandedClassification dimension only, source data must be dated from February 21, 2026 or later. Google only supports brand reporting for eligible top-level properties with sufficient traffic. Absent rows are NOT observed zero.
- multimodal_pages: webMultimodal type, page dimension only; visual-search data must never be represented as ordinary query/page web results.
- regional_web: web type, country/device dimensions, optional exact-match list for either/both. Values within one list are OR; country and device lists within the and group combine as AND. No arbitrary filters or combining the same dimension through both filters and filterLists.

The preview sets aggregationType=auto, dataState=final, rowLimit=384, startRow=0 and does no pagination. Google returns selected top rows, NOT a guaranteed complete result universe.

## Non-authority and future decision

This is syntax/semantic preflight, not permission to call the provider. A later separately accepted source adapter and collection-method identity are required to ingest/compare new report shapes; live account verification, authorization, quota, consent, cloud runtime and any external calls require their owning approval.

No changes to existing Search Analytics contracts, schema, package, tenant authority, customer report, credentials, Google API client, network, database or website are included.