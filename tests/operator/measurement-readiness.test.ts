import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  composeMeasurementReadiness,
  renderMeasurementReadinessHtml,
  MeasurementReadinessError,
  MEASUREMENT_READINESS_PROVIDERS,
} from '../../src/operator/measurement-readiness.js';

const scope = {
  tenantId: 'tenant-ldw',
  siteId: 'site-a',
  siteScopeRevisionId: 'scope-rev-1',
};
const target = 'https://example.test';
const evaluatedAt = '2026-11-14T09:00:00.000Z';

function trusted() {
  return { scope: { ...scope }, target };
}

function request() {
  return {
    scope: { ...scope },
    target,
    evaluatedAt,
    sources: [
      { provider: 'google_search_console', state: 'verified' },
      { provider: 'google_analytics_4', state: 'configured_no_collection_proof' },
      { provider: 'wqt_scanner', state: 'scanner_blocked', limitation: 'Homepage HTTP 403, challenge resource observed.' },
    ],
    nextChecks: [
      { provider: 'google_analytics_4', humanCheck: 'Confirm privacy gate before testing a consented event.' },
    ],
  };
}

function invalid(candidate: unknown, trustedInput: unknown = trusted()): void {
  assert.throws(
    () => composeMeasurementReadiness(trustedInput, candidate),
    (error: unknown) => error instanceof MeasurementReadinessError,
  );
}

test('fixed provider roster preserves configured vs verified and missing as unknown, not zero', () => {
  const result = composeMeasurementReadiness(trusted(), request());
  assert.equal(result.sources.length, MEASUREMENT_READINESS_PROVIDERS.length);
  assert.deepEqual(result.sources.map((row) => row.provider), [...MEASUREMENT_READINESS_PROVIDERS]);
  assert.equal(result.sources.find((row) => row.provider === 'google_search_console')?.state, 'verified');
  assert.equal(result.sources.find((row) => row.provider === 'google_analytics_4')?.state, 'configured_no_collection_proof');
  const clarity = result.sources.find((row) => row.provider === 'microsoft_clarity');
  assert.equal(clarity?.state, 'unknown');
  assert.match(clarity?.limitation ?? '', /not an observed zero/);
  assert.equal(result.sources.find((row) => row.provider === 'wqt_scanner')?.state, 'scanner_blocked');
  assert.equal(result.nextChecks.length, 1);
  const html = renderMeasurementReadinessHtml(result);
  assert.match(html, /internal review only/);
  assert.match(html, /Homepage HTTP 403/);
  assert.match(html, /not interchangeable/);
  assert.doesNotMatch(html, /<script\b/i);
});

test('collection_observed demands explicit evidence pointer and observation time, not a tag guess', () => {
  const noProof = request();
  noProof.sources = [{ provider: 'google_analytics_4', state: 'collection_observed' }];
  invalid(noProof);
  const withProof = {
    ...request(),
    sources: [{
      provider: 'google_analytics_4',
      state: 'collection_observed',
      sourceReference: 'ga4-evidence-42',
      sourceObservedAt: '2026-11-14T08:00:00.000Z',
    }],
  };
  const result = composeMeasurementReadiness(trusted(), withProof);
  assert.equal(result.sources.find((item) => item.provider === 'google_analytics_4')?.state, 'collection_observed');
  assert.match(renderMeasurementReadinessHtml(result), /ga4-evidence-42/);
});

test('identity checks reject cross-tenant, cross-revision, cross-site and target-origin mismatch', () => {
  invalid({ ...request(), scope: { ...scope, tenantId: 'tenant-other' } });
  invalid({ ...request(), scope: { ...scope, siteId: 'another-site' } });
  invalid({ ...request(), scope: { ...scope, siteScopeRevisionId: 'rev-2' } });
  invalid({ ...request(), target: 'https://other.example.test' });
  invalid({ ...request(), target: 'http://example.test' });
  invalid({ ...request(), target: 'https://example.test/path' });
  invalid({ ...request(), target: 'https://example.test/?token=secret' });
  invalid(request(), { scope: { ...scope }, target: 'https://other.example.test' });
});

test('duplicates, unknown provider and extra unsupported fields fail closed', () => {
  invalid({ ...request(), sources: [
    { provider: 'google_search_console', state: 'verified' },
    { provider: 'google_search_console', state: 'verified' },
  ] });
  invalid({ ...request(), sources: [{ provider: 'untrusted_provider', state: 'verified' }] });
  invalid({ ...request(), extraField: 'not approved' });
  invalid({ ...request(), sources: [{ provider: 'google_analytics_4', state: 'verified', metricZero: 0 }] });
  invalid({ ...request(), nextChecks: [
    { provider: 'google_search_console', humanCheck: 'Check one' },
    { provider: 'google_search_console', humanCheck: 'Check two' },
  ] });
});

test('privacy and scanner block states have strict provider scope and reasons', () => {
  invalid({ ...request(), sources: [{ provider: 'google_search_console', state: 'blocked_by_privacy_gate', limitation: 'Not allowed' }] });
  invalid({ ...request(), sources: [{ provider: 'microsoft_clarity', state: 'blocked_by_privacy_gate' }] });
  invalid({ ...request(), sources: [{ provider: 'google_analytics_4', state: 'scanner_blocked', limitation: '403' }] });
  invalid({ ...request(), sources: [{ provider: 'wqt_scanner', state: 'scanner_blocked' }] });
  invalid({ ...request(), sources: [{ provider: 'bing_webmaster', state: 'source_unavailable' }] });
  const approved = composeMeasurementReadiness(trusted(), {
    ...request(),
    sources: [{ provider: 'microsoft_clarity', state: 'blocked_by_privacy_gate', limitation: 'No consent gate accepted.' }],
  });
  assert.equal(approved.sources.find((item) => item.provider === 'microsoft_clarity')?.state, 'blocked_by_privacy_gate');
});

test('futures, more than three human checks and bad timestamps are refused', () => {
  invalid({ ...request(), sources: [{
    provider: 'google_analytics_4', state: 'collection_observed',
    sourceReference: 'future', sourceObservedAt: '2026-11-15T00:00:00.000Z',
  }] });
  invalid({ ...request(), evaluatedAt: '2026-11-14' });
  invalid({ ...request(), nextChecks: [
    { provider: 'google_search_console', humanCheck: 'One' },
    { provider: 'bing_webmaster', humanCheck: 'Two' },
    { provider: 'microsoft_clarity', humanCheck: 'Three' },
    { provider: 'wqt_scanner', humanCheck: 'Four' },
  ] });
});

test('HTML escapes provider-controlled limitation and human text, including mixed-case tags', () => {
  const result = composeMeasurementReadiness(trusted(), {
    ...request(),
    sources: [{
      provider: 'wqt_scanner', state: 'scanner_blocked',
      limitation: '<ScRiPt>alert("no")</ScRiPt> & <img src=x>',
    }],
    nextChecks: [{ provider: 'wqt_scanner', humanCheck: 'Check <img> and & source.' }],
  });
  const html = renderMeasurementReadinessHtml(result);
  assert.match(html, /&lt;ScRiPt&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /Check &lt;img&gt; and &amp; source/);
  assert.doesNotMatch(html, /<script\b|<img\b/i);
});

test('renderer rejects forged, cloned and serialized reports even if shape appears valid', () => {
  const result = composeMeasurementReadiness(trusted(), request());
  const trustedHtml = renderMeasurementReadinessHtml(result);
  assert.equal(renderMeasurementReadinessHtml(result), trustedHtml);
  assert.throws(() => renderMeasurementReadinessHtml(structuredClone(result)), MeasurementReadinessError);
  assert.throws(() => renderMeasurementReadinessHtml(JSON.parse(JSON.stringify(result)) as unknown), MeasurementReadinessError);
  assert.throws(() => renderMeasurementReadinessHtml({ ...result }), MeasurementReadinessError);
  assert.throws(() => renderMeasurementReadinessHtml(null), MeasurementReadinessError);
});
