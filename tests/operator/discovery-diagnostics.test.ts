import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { DiscoverySiteReport } from '../../src/analysis/discovery-diagnostics.js';
import {
  MAX_DISCOVERY_OPERATOR_HTML_BYTES,
  renderDiscoveryDiagnosticsHtml,
} from '../../src/operator/discovery-diagnostics.js';

function report(): DiscoverySiteReport {
  return {
    id: 'discovery.site-report:synthetic',
    scope: {
      tenantId: 'tenant-alpha',
      siteId: 'site-alpha',
      siteScopeRevisionId: 'synthetic-scope-alpha-r1',
    },
    trustedTarget: 'sc-domain:example.test',
    evaluatedAt: '2026-09-29T13:00:00.000Z',
    policy: {
      id: 'discovery-readiness-policy',
      version: '1.0.0',
      maxEvidenceAgeSeconds: 7200,
      minimumReadySearchEngines: 2,
      maxSubmissionConfirmationAgeSeconds: 14400,
    },
    providers: ['bing-webmaster-tools','google-search-console','indexnow','yandex-webmaster'],
    providerReadiness: [
      {
        providerId: 'bing-webmaster-tools',
        collectionId: 'discovery.collection:bing',
        state: 'ready',
        reasons: [],
        observedAt: '2026-09-29T12:01:00.000Z',
        freshThrough: '2026-09-29T12:01:00.000Z',
        coverageState: 'complete',
        availabilityState: 'available',
      },
      {
        providerId: 'google-search-console',
        collectionId: 'discovery.collection:google',
        state: 'ready',
        reasons: [],
        observedAt: '2026-09-29T12:00:00.000Z',
        freshThrough: '2026-09-29T12:00:00.000Z',
        coverageState: 'complete',
        availabilityState: 'available',
      },
      {
        providerId: 'indexnow',
        collectionId: 'discovery.collection:indexnow',
        state: 'ready',
        reasons: [],
        observedAt: '2026-09-29T12:06:00.000Z',
        freshThrough: '2026-09-29T12:06:00.000Z',
        coverageState: 'complete',
        availabilityState: 'available',
      },
      {
        providerId: 'yandex-webmaster',
        collectionId: 'discovery.collection:yandex',
        state: 'ready',
        reasons: [],
        observedAt: '2026-09-29T12:02:00.000Z',
        freshThrough: '2026-09-29T12:02:00.000Z',
        coverageState: 'complete',
        availabilityState: 'available',
      },
    ],
    totals: {
      uniqueUrls: 1,
      readyUrls: 1,
      notReadyUrls: 0,
      findingCounts: {
        broad_indexing_issue_candidate: 1,
        engine_specific_indexing_divergence_candidate: 0,
        broad_crawl_access_issue_candidate: 1,
        canonical_divergence_candidate: 1,
        indexing_permission_divergence_candidate: 1,
        no_cross_engine_divergence_observed: 0,
      },
      indexNowCounts: {
        no_submission_evidence: 0,
        submission_rejected: 0,
        submission_rate_limited: 0,
        submission_unknown: 0,
        submission_accepted_no_later_engine_observation: 0,
        submission_accepted_later_present_observed: 0,
        submission_accepted_later_absent_observed: 1,
        submission_accepted_mixed_later_observation: 0,
      },
      withSearchContext: 1,
      withoutObservedSearchContext: 0,
    },
    urls: [{
      id: 'discovery.url-report:synthetic',
      url: 'https://example.test/broad',
      urlId: 'discovery.url:synthetic',
      state: 'ready',
      readinessReasons: [],
      providers: [
        {
          providerId: 'bing-webmaster-tools',
          observationState: 'observed_ready',
          providerReadiness: 'ready',
          readinessReasons: [],
          observedAt: '2026-09-29T12:01:00.000Z',
          searchPresence: 'absent',
          crawlState: 'server_error',
          indexingPermission: 'allowed',
          canonicalState: 'other',
          canonicalTarget: 'https://example.test/canonical-b',
          httpStatus: 503,
          lastCrawlAt: '2026-09-29T11:31:00.000Z',
          rowIdentity: 'discovery.row:bing',
        },
        {
          providerId: 'google-search-console',
          observationState: 'observed_ready',
          providerReadiness: 'ready',
          readinessReasons: [],
          observedAt: '2026-09-29T12:00:00.000Z',
          searchPresence: 'absent',
          crawlState: 'blocked',
          indexingPermission: 'blocked',
          canonicalState: 'other',
          canonicalTarget: 'https://example.test/canonical-a',
          lastCrawlAt: '2026-09-29T11:30:00.000Z',
          rowIdentity: 'discovery.row:google',
        },
        {
          providerId: 'yandex-webmaster',
          observationState: 'observed_ready',
          providerReadiness: 'ready',
          readinessReasons: [],
          observedAt: '2026-09-29T12:02:00.000Z',
          searchPresence: 'absent',
          crawlState: 'blocked',
          indexingPermission: 'blocked',
          canonicalState: 'self',
          httpStatus: 403,
          lastCrawlAt: '2026-09-29T11:32:00.000Z',
          rowIdentity: 'discovery.row:yandex',
        },
      ],
      findings: [
        { kind: 'broad_indexing_issue_candidate', providers: ['bing-webmaster-tools','google-search-console','yandex-webmaster'] },
        { kind: 'broad_crawl_access_issue_candidate', providers: ['bing-webmaster-tools','google-search-console','yandex-webmaster'] },
        { kind: 'canonical_divergence_candidate', providers: ['bing-webmaster-tools','google-search-console','yandex-webmaster'] },
        { kind: 'indexing_permission_divergence_candidate', providers: ['bing-webmaster-tools','google-search-console','yandex-webmaster'] },
      ],
      indexNow: {
        state: 'submission_accepted_later_absent_observed',
        submittedAt: '2026-09-29T11:00:00.000Z',
        submissionResult: 'accepted',
        resultCode: 200,
        laterProviders: ['bing-webmaster-tools','google-search-console','yandex-webmaster'],
        note: 'IndexNow submission is notification evidence only; it does not prove or cause indexing.',
      },
      searchContext: {
        state: 'observed',
        queryCount: 2,
        clicks: 5,
        impressions: 50,
        ctr: 0.1,
        averagePositionRange: { minimum: 6, maximum: 9 },
        sourcePeriod: { start: '2026-09-22T00:00:00.000Z', end: '2026-09-29T00:00:00.000Z' },
        freshness: { dataState: 'final', freshThrough: '2026-09-29T00:00:00.000Z' },
        coverage: { state: 'complete', truncated: false, anonymized: false },
      },
    }],
    navigationOrderNote: 'Candidate-bearing URLs are listed first for navigation only; ordering is not severity, priority, or business impact.',
  };
}

test('standalone discovery HTML exposes provider matrix, readiness, findings, canonical data, IndexNow caveat and separate search context', () => {
  const html = renderDiscoveryDiagnosticsHtml(report());
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /@media print/);
  assert.match(html, /Provider readiness/);
  assert.match(html, /Exact provider evidence matrix/);
  assert.match(html, /google-search-console/);
  assert.match(html, /bing-webmaster-tools/);
  assert.match(html, /yandex-webmaster/);
  assert.match(html, /broad_indexing_issue_candidate/);
  assert.match(html, /https:\/\/example\.test\/canonical-a/);
  assert.match(html, /https:\/\/example\.test\/canonical-b/);
  assert.match(html, /Submission is not indexing proof/);
  assert.match(html, /submission_rate_limited/);
  assert.match(html, /submission_unknown/);
  assert.match(html, /Current Search Analytics context — descriptive only/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<link\b/i);
  assert.doesNotMatch(html, /src=["']https?:/i);
  assert.ok(new TextEncoder().encode(html).byteLength < MAX_DISCOVERY_OPERATOR_HTML_BYTES);
});

test('all dynamic URL/provider/canonical/finding values are escaped and deterministic', () => {
  const model = report();
  const attack = '"><img src=x onerror="alert(1)"><script>alert(\'&\')</script>';
  const attacked: DiscoverySiteReport = {
    ...model,
    trustedTarget: attack,
    urls: [{
      ...model.urls[0]!,
      url: attack,
      providers: [{
        ...model.urls[0]!.providers[0]!,
        canonicalTarget: attack,
      }],
    }],
  };
  const first = renderDiscoveryDiagnosticsHtml(attacked);
  const second = renderDiscoveryDiagnosticsHtml(structuredClone(attacked));
  assert.equal(second, first);
  assert.doesNotMatch(first, /<script\b/i);
  assert.doesNotMatch(first, /<img\b/i);
  assert.doesNotMatch(first, /<[^>]+\sonerror\s*=/i);
  assert.match(first, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(first, /&lt;script&gt;alert\(&#39;&amp;&#39;\)&lt;\/script&gt;/);
});

test('operator report contains no write controls, ranking columns, external resource or network/runtime paths', () => {
  const html = renderDiscoveryDiagnosticsHtml(report());
  assert.doesNotMatch(html, /<button\b|<input\b|<textarea\b|<select\b|<form\b/i);
  assert.doesNotMatch(html, /<th scope="col">(?:Action|Severity|Priority)<\/th>/i);
  assert.doesNotMatch(html, /Recommended action|Remediation|Fix now/i);

  const source = readFileSync('src/operator/discovery-diagnostics.ts', 'utf8');
  assert.doesNotMatch(source, /from ['"](?:node:http|node:https|node:net|undici|axios)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(|new\s+WebSocket\s*\(|createServer\s*\(|listen\s*\(/);
  assert.doesNotMatch(source, /from ['"].*(?:sqlite|repository)/i);
  assert.doesNotMatch(source, /persist(?:Collection|Measurement|Outcome|Recommendation)\s*\(/i);
  assert.doesNotMatch(source, /\b(?:OpenAI|Anthropic|BYOK|embedding|LLM)\b/i);
});
