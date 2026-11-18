import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GscQueryPreviewError,
  previewGscSearchAnalyticsQuery,
} from '../../src/adapters/gsc-query-preview.js';

const base = {
  property: 'sc-domain:example.test',
  startDate: '2026-11-01',
  endDate: '2026-11-14',
} as const;

const invalid = (data: unknown): void => {
  assert.throws(
    () => previewGscSearchAnalyticsQuery(data),
    (error: unknown) => error instanceof GscQueryPreviewError,
  );
};

test('branded split is a grouped source preview, never invented query or brand traffic', () => {
  const planned = previewGscSearchAnalyticsQuery({ ...base, profile: 'branded_split' });
  assert.equal(planned.body.type, 'web');
  assert.deepEqual(planned.body.dimensions, ['brandedClassification']);
  assert.deepEqual(planned.body.dimensionFilterGroups, []);
  assert.equal(planned.body.dataState, 'final');
  assert.equal(planned.body.rowLimit, 384);
  assert.equal(planned.sourceVerified, false);
  assert.equal(planned.providerRowsCollected, false);
  assert.equal(planned.networkAuthorized, false);
  assert.equal(planned.acceptedSearchAnalyticsAdapterCompatible, false);
  assert.equal('rows' in planned, false);
  assert.equal('keys' in planned.body, false);
  assert.equal('filters' in planned.body, false);
  assert.equal('query' in planned.body, false);
});

test('multimodal remains a separate search TYPE and never forges query×page rows', () => {
  const result = previewGscSearchAnalyticsQuery({
    ...base, profile: 'multimodal_pages',
  });
  assert.equal(result.body.type, 'webMultimodal');
  assert.deepEqual(result.body.dimensions, ['page']);
  assert.equal(result.body.aggregationType, 'auto');
  assert.equal(result.body.startRow, 0);
});

test('multi-country/device values OR within lists and AND between dimensions', () => {
  const input = {
    ...base, profile: 'regional_web',
    countries: ['USA', 'FRA', 'DEU'],
    devices: ['TABLET', 'DESKTOP', 'MOBILE'],
  };
  const first = previewGscSearchAnalyticsQuery(input);
  const second = previewGscSearchAnalyticsQuery({
    ...input,
    countries: ['DEU', 'USA', 'FRA'],
    devices: ['MOBILE', 'TABLET', 'DESKTOP'],
  });
  assert.deepEqual(first, second);
  assert.deepEqual(first.body.dimensions, ['country', 'device']);
  assert.deepEqual(first.body.dimensionFilterGroups, [{
    groupType: 'and',
    filterLists: [
      { dimension: 'country', expressions: ['DEU', 'FRA', 'USA'] },
      { dimension: 'device', expressions: ['DESKTOP', 'MOBILE', 'TABLET'] },
    ],
  }]);
  assert.equal('filters' in first.body.dimensionFilterGroups[0]!, false);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.body));
  assert.ok(Object.isFrozen(first.body.dimensions));
  assert.ok(Object.isFrozen(first.body.dimensionFilterGroups[0]!.filterLists));
  assert.ok(Object.isFrozen(first.body.dimensionFilterGroups[0]!.filterLists[0]!.expressions));
  input.countries[0] = 'CAN';
  assert.deepEqual(
    first.body.dimensionFilterGroups[0]!.filterLists[0]!.expressions,
    ['DEU', 'FRA', 'USA'],
  );
});

test('branded date floor is enforced without promising property eligibility', () => {
  assert.doesNotThrow(() => previewGscSearchAnalyticsQuery({
    ...base, profile: 'branded_split',
    startDate: '2026-02-21', endDate: '2026-02-21',
  }));
  invalid({ ...base, profile: 'branded_split', startDate: '2026-02-20', endDate: '2026-02-22' });
  invalid({ ...base, profile: 'branded_split', startDate: '2025-11-10', endDate: '2025-11-11' });
  assert.doesNotThrow(() => previewGscSearchAnalyticsQuery({
    ...base, profile: 'multimodal_pages', startDate: '2026-02-20', endDate: '2026-02-20',
  }));
});

test('strict request rejects forged dimensions, filters, credentials and result claims', () => {
  for (const extra of [
    { type: 'webMultimodal' }, { searchType: 'image' },
    { dimensions: ['query', 'page'] },
    { filters: [{ dimension: 'query', expression: 'brand' }] },
    { dimensionFilterGroups: [{ filters: [{ dimension: 'query', expression: 'brand' }] }] },
    { eligibilityVerified: true }, { collectionAuthorized: true },
    { bearerToken: 'not-real' },
    { rows: [{ keys: ['BRANDED'], clicks: 1 }] },
    { aggregationType: 'byProperty' }, { dataState: 'all' },
  ]) invalid({ ...base, profile: 'branded_split', ...extra });
  invalid({ ...base, profile: 'unsupported' });
  invalid(null);
  invalid([]);
});

test('property selection cannot mint ownership or accept tokens and URL paths', () => {
  const bad = [
    'sc-domain:EXAMPLE.TEST', 'sc-domain:example.test.', 'sc-domain:example',
    'sc-domain:-example.test', 'sc-domain:example..test',
    'http://example.test/', 'https://user:pass@example.test/',
    'https://example.test/path', 'https://example.test/?key=secret',
    'https://example.test/#fragment', 'https://example.test:443/',
    'https://example.test:999/', 'https://localhost/',
  ];
  for (const property of bad) {
    invalid({ ...base, profile: 'regional_web', countries: ['USA'], property });
  }
  assert.doesNotThrow(() => previewGscSearchAnalyticsQuery({
    ...base, profile: 'regional_web', countries: ['USA'], property: 'https://example.test/',
  }));
});

test('dates and dimension-list misuse fail closed before any source contact', () => {
  for (const dates of [
    { startDate: '2026-11-31', endDate: '2026-12-01' },
    { startDate: '2026-11-16', endDate: '2026-11-15' },
    { startDate: '2026-11-01T00:00:00Z', endDate: '2026-11-15' },
    { startDate: '2026-11-01', endDate: '2026-12-02' },
    { startDate: '2026-02-29', endDate: '2026-03-01' },
  ]) invalid({ ...base, profile: 'multimodal_pages', ...dates });

  for (const arrays of [
    { countries: [] }, { countries: ['usa'] }, { countries: ['USA', 'USA'] },
    { countries: ['US'] }, { countries: ['USA', 'DEU', 'FRA', 'CAN', 'BRA', 'ARG', 'MEX', 'JPN', 'KOR'] },
    { devices: [] }, { devices: ['mobile'] }, { devices: ['MOBILE', 'MOBILE'] },
    { devices: ['DESKTOP', 'TABLET', 'MOBILE', 'TV'] },
  ]) invalid({ ...base, profile: 'regional_web', ...arrays });
  invalid({ ...base, profile: 'regional_web' });
});
