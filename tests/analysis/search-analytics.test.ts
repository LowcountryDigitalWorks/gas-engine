import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
  type SearchAnalyticsAdaptationResult,
} from '../../src/adapters/search-analytics.js';
import {
  analyzeSearchAnalyticsSignals,
  SearchAnalyticsSignalError,
  type SearchAnalyticsSignalErrorCode,
  type SearchAnalyticsSignalPolicies,
} from '../../src/analysis/search-analytics.js';
import { canonicalJson } from '../../src/lib/canonical-json.js';

type MutableJson = Record<string, any>;
const fixtureText = readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8');

function fixture(): MutableJson {
  return JSON.parse(fixtureText) as MutableJson;
}

const alphaConfig: SearchAnalyticsAdapterConfig = {
  scope: {
    tenantId: 'tenant-alpha',
    siteId: 'site-alpha',
    siteScopeRevisionId: 'synthetic-scope-alpha-r1',
  },
  expectedProperty: 'sc-domain:example.test',
  providerConnectionId: 'synthetic-gsc-connection-alpha',
  collectedAt: '2026-09-16T08:06:00.000Z',
  receivedAt: '2026-09-16T08:07:00.000Z',
  availability: { state: 'available', reference: 'synthetic-search-analytics-artifact' },
};

const policies: SearchAnalyticsSignalPolicies = {
  strikingDistance: {
    id: 'synthetic-striking-distance',
    version: '1.0',
    minimumAveragePosition: 8,
    maximumAveragePosition: 12,
    minimumImpressions: 50,
  },
  decay: {
    id: 'synthetic-decay',
    version: '1.0',
    metric: 'clicks',
    minimumBaseline: 10,
    maximumCurrentToBaselineRatio: 0.5,
  },
  ctrOpportunity: {
    id: 'synthetic-ctr-opportunity',
    version: '1.0',
    minimumAveragePosition: 8,
    maximumAveragePosition: 12,
    minimumImpressions: 50,
    maximumCtr: 0.05,
  },
  overlap: {
    id: 'synthetic-overlap',
    version: '1.0',
    minimumImpressions: 30,
  },
};

function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
}

function baselineFixture(): MutableJson {
  const value = fixture();
  value.observedAt = '2026-09-08T08:00:00.000Z';
  value.exportedAt = '2026-09-08T08:05:00.000Z';
  value.requestedWindow = {
    start: '2026-09-01T00:00:00.000Z',
    end: '2026-09-08T00:00:00.000Z',
  };
  value.effectiveWindow = structuredClone(value.requestedWindow);
  value.freshness = { dataState: 'final', freshThrough: '2026-09-08T00:00:00.000Z' };
  value.rows = [
    {
      query: 'synthetic shared',
      page: 'https://example.test/shared',
      clicks: 10,
      impressions: 100,
      ctr: 0.1,
      averagePosition: 12,
    },
    {
      query: 'synthetic baseline only',
      page: 'https://example.test/baseline-only',
      clicks: 4,
      impressions: 40,
      ctr: 0.1,
      averagePosition: 20,
    },
  ];
  return value;
}

function currentFixture(): MutableJson {
  const value = fixture();
  value.rows = [
    {
      query: 'synthetic shared',
      page: 'https://example.test/shared',
      clicks: 5,
      impressions: 80,
      ctr: 0.05,
      averagePosition: 10,
    },
    {
      query: 'synthetic overlap',
      page: 'https://example.test/overlap-a',
      clicks: 3,
      impressions: 30,
      ctr: 0.1,
      averagePosition: 7,
    },
    {
      query: 'synthetic overlap',
      page: 'https://example.test/overlap-b',
      clicks: 4,
      impressions: 31,
      ctr: 0.12,
      averagePosition: 6,
    },
    {
      query: 'synthetic current only',
      page: 'https://example.test/current-only',
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      averagePosition: 30,
    },
  ];
  return value;
}

function configFor(value: MutableJson, base: SearchAnalyticsAdapterConfig = alphaConfig): SearchAnalyticsAdapterConfig {
  const exported = new Date(value.exportedAt).getTime();
  return {
    ...base,
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
  };
}

function adapt(value: MutableJson, baseConfig: SearchAnalyticsAdapterConfig = alphaConfig, pretty = false): SearchAnalyticsAdaptationResult {
  return adaptSearchAnalyticsEvidence(bytes(value, pretty), configFor(value, baseConfig));
}

function pair(): { baseline: SearchAnalyticsAdaptationResult; current: SearchAnalyticsAdaptationResult } {
  return { baseline: adapt(baselineFixture()), current: adapt(currentFixture()) };
}

function expectSignalError(action: () => unknown, code: SearchAnalyticsSignalErrorCode): void {
  assert.throws(action, (error: unknown) =>
    error instanceof SearchAnalyticsSignalError && error.code === code);
}

test('matched rows produce descriptive four-metric window delta plus explicit-policy candidates', () => {
  const { baseline, current } = pair();
  const report = analyzeSearchAnalyticsSignals(baseline, current, policies);
  const delta = report.signals.find((signal) =>
    signal.kind === 'window_delta' && signal.cohort.query === 'synthetic shared');
  assert.ok(delta);
  assert.deepEqual(delta.values, {
    clicksDelta: -5,
    impressionsDelta: -20,
    ctrDelta: -0.05,
    averagePositionDelta: -2,
  });
  assert.equal(delta.provenance.baseline?.observationIds.length, 4);
  assert.equal(Array.isArray(delta.provenance.current), false);

  const decay = report.signals.find((signal) =>
    signal.kind === 'decay_candidate' && signal.cohort.query === 'synthetic shared');
  assert.ok(decay);
  assert.deepEqual(decay.values, {
    baselineValue: 10,
    currentValue: 5,
    currentToBaselineRatio: 0.5,
  });

  const striking = report.signals.find((signal) =>
    signal.kind === 'striking_distance_candidate' && signal.cohort.query === 'synthetic shared');
  assert.ok(striking);
  assert.deepEqual(striking.policy.thresholds, {
    minimumAveragePosition: 8,
    maximumAveragePosition: 12,
    minimumImpressions: 50,
  });

  const ctr = report.signals.find((signal) =>
    signal.kind === 'ctr_opportunity_candidate' && signal.cohort.query === 'synthetic shared');
  assert.ok(ctr);
  assert.equal(ctr.values.ctr, 0.05);

  assert.deepEqual(report.unmatched, {
    baselineOnly: 1,
    currentOnly: 3,
    absenceSignalsEmitted: false,
  });
  assert.doesNotMatch(
    JSON.stringify(report),
    /improv|regress|severity|priority|causal|harmful cannibal|split|consolidat/i,
  );
});

test('explicit policy thresholds are inclusive at exact boundary values', () => {
  const baselineValue = baselineFixture();
  baselineValue.rows = [{
    query: 'synthetic boundary',
    page: 'https://example.test/boundary',
    clicks: 20,
    impressions: 50,
    ctr: 0.1,
    averagePosition: 12,
  }];
  const currentValue = currentFixture();
  currentValue.rows = [{
    query: 'synthetic boundary',
    page: 'https://example.test/boundary',
    clicks: 10,
    impressions: 50,
    ctr: 0.05,
    averagePosition: 8,
  }];

  const report = analyzeSearchAnalyticsSignals(adapt(baselineValue), adapt(currentValue), policies);
  assert.ok(report.signals.some((signal) => signal.kind === 'striking_distance_candidate'));
  assert.ok(report.signals.some((signal) => signal.kind === 'decay_candidate'));
  assert.ok(report.signals.some((signal) => signal.kind === 'ctr_opportunity_candidate'));

  const missValue = structuredClone(currentValue);
  missValue.rows[0].impressions = 49;
  const miss = analyzeSearchAnalyticsSignals(adapt(baselineValue), adapt(missValue), policies);
  assert.equal(miss.signals.some((signal) => signal.kind === 'striking_distance_candidate'), false);
  assert.equal(miss.signals.some((signal) => signal.kind === 'ctr_opportunity_candidate'), false);
});

test('one query across two qualifying current pages emits only neutral overlap evidence', () => {
  const { baseline, current } = pair();
  const report = analyzeSearchAnalyticsSignals(baseline, current, policies);
  const overlap = report.signals.find((signal) =>
    signal.kind === 'query_page_overlap_candidate' && signal.cohort.query === 'synthetic overlap');
  assert.ok(overlap);
  assert.equal(overlap.values.pageCount, 2);
  assert.equal(overlap.cohort.pages?.length, 2);
  assert.ok(Array.isArray(overlap.provenance.current));
  assert.doesNotMatch(JSON.stringify(overlap), /harmful|cannibal|split|consolidat|redirect|canonical change/i);
});

test('observed zero remains numeric zero and absent rows never become numeric zero or decay', () => {
  const baselineValue = baselineFixture();
  baselineValue.rows = [{
    query: 'synthetic zero',
    page: 'https://example.test/zero',
    clicks: 10,
    impressions: 100,
    ctr: 0.1,
    averagePosition: 10,
  }];
  const currentValue = currentFixture();
  currentValue.rows = [{
    query: 'synthetic zero',
    page: 'https://example.test/zero',
    clicks: 0,
    impressions: 0,
    ctr: 0,
    averagePosition: 0,
  }];
  const report = analyzeSearchAnalyticsSignals(adapt(baselineValue), adapt(currentValue), policies);
  const delta = report.signals.find((signal) => signal.kind === 'window_delta');
  assert.ok(delta);
  assert.equal(delta.values.clicksDelta, -10);
  assert.equal(delta.values.impressionsDelta, -100);

  const absentCurrent = currentFixture();
  absentCurrent.rows = [];
  const absent = analyzeSearchAnalyticsSignals(adapt(baselineValue), adapt(absentCurrent), policies);
  assert.deepEqual(absent.unmatched, { baselineOnly: 1, currentOnly: 0, absenceSignalsEmitted: false });
  assert.equal(absent.signals.some((signal) => signal.kind === 'decay_candidate'), false);
  assert.equal(absent.signals.some((signal) => signal.kind === 'window_delta'), false);
});

test('partial and unknown coverage never turns unmatched cohorts into appeared or disappeared signals', () => {
  for (const state of ['partial', 'unknown'] as const) {
    const before = baselineFixture();
    const after = currentFixture();
    const coverage = {
      state,
      truncated: state === 'partial',
      anonymized: true,
      reason: `Synthetic ${state} coverage.`,
    };
    before.coverage = coverage;
    after.coverage = coverage;
    before.rows = [{
      query: 'synthetic before only',
      page: 'https://example.test/before-only',
      clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 20,
    }];
    after.rows = [{
      query: 'synthetic after only',
      page: 'https://example.test/after-only',
      clicks: 3, impressions: 30, ctr: 0.1, averagePosition: 21,
    }];

    const report = analyzeSearchAnalyticsSignals(adapt(before), adapt(after), policies);
    assert.deepEqual(report.unmatched, { baselineOnly: 1, currentOnly: 1, absenceSignalsEmitted: false });
    assert.equal(report.signals.some((signal) => signal.kind === 'window_delta'), false);
    assert.equal(report.signals.some((signal) => signal.kind === 'decay_candidate'), false);
    assert.doesNotMatch(JSON.stringify(report), /appeared|disappeared|missing_from_current/i);
  }
});

test('compatibility rejects filter, window, freshness, provider/source, and search-type semantic drift', () => {
  const before = baselineFixture();

  const filterDrift = currentFixture();
  filterDrift.filters = [{ dimension: 'query', operator: 'contains', expression: 'synthetic' }];
  expectSignalError(
    () => analyzeSearchAnalyticsSignals(adapt(before), adapt(filterDrift), policies),
    'incompatible_windows',
  );

  const durationDrift = currentFixture();
  durationDrift.requestedWindow.start = '2026-09-07T00:00:00.000Z';
  durationDrift.effectiveWindow.start = '2026-09-07T00:00:00.000Z';
  expectSignalError(
    () => analyzeSearchAnalyticsSignals(adapt(before), adapt(durationDrift), policies),
    'incompatible_windows',
  );

  const preliminary = currentFixture();
  preliminary.freshness = {
    dataState: 'preliminary',
    freshThrough: '2026-09-14T00:00:00.000Z',
  };
  expectSignalError(
    () => analyzeSearchAnalyticsSignals(adapt(before), adapt(preliminary), policies),
    'incompatible_windows',
  );

  const forgedProvider = structuredClone(adapt(currentFixture()));
  for (const batch of forgedProvider.batches as any[]) batch.collection.providerId = 'forged-provider';
  expectSignalError(
    () => analyzeSearchAnalyticsSignals(adapt(before), forgedProvider, policies),
    'invalid_window',
  );

  const forgedSource = structuredClone(adapt(currentFixture()));
  for (const batch of forgedSource.batches as any[]) batch.collection.sourceSchema.version = 'v9.9';
  expectSignalError(
    () => analyzeSearchAnalyticsSignals(adapt(before), forgedSource, policies),
    'invalid_window',
  );

  const wrongSearchType = currentFixture();
  wrongSearchType.searchType = 'image';
  assert.throws(() => adapt(wrongSearchType));
});

test('synthetic Alpha/Beta trusted scopes cannot be compared as one signal stream', () => {
  const betaConfig: SearchAnalyticsAdapterConfig = {
    ...alphaConfig,
    scope: {
      tenantId: 'tenant-beta',
      siteId: 'site-beta',
      siteScopeRevisionId: 'synthetic-scope-beta-r1',
    },
    providerConnectionId: 'synthetic-gsc-connection-beta',
  };
  const baseline = adapt(baselineFixture());
  const betaCurrent = adapt(currentFixture(), betaConfig);
  expectSignalError(
    () => analyzeSearchAnalyticsSignals(baseline, betaCurrent, policies),
    'incompatible_windows',
  );
});

test('input row order and JSON formatting cannot alter canonical signal output', () => {
  const beforeA = baselineFixture();
  const afterA = currentFixture();
  const beforeB = structuredClone(beforeA);
  const afterB = structuredClone(afterA);
  beforeB.rows.reverse();
  afterB.rows.reverse();

  const left = analyzeSearchAnalyticsSignals(adapt(beforeA), adapt(afterA), policies);
  const right = analyzeSearchAnalyticsSignals(adapt(beforeB, alphaConfig, true), adapt(afterB, alphaConfig, true), policies);
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.deepEqual(
    left.signals.map((signal) => signal.id),
    [...left.signals.map((signal) => signal.id)],
  );
});

test('policy input fails closed for reversed bands and invalid decay ratio', () => {
  const { baseline, current } = pair();
  const reversed = structuredClone(policies);
  reversed.strikingDistance.minimumAveragePosition = 20;
  reversed.strikingDistance.maximumAveragePosition = 10;
  expectSignalError(
    () => analyzeSearchAnalyticsSignals(baseline, current, reversed),
    'invalid_input',
  );

  const ratio = structuredClone(policies);
  ratio.decay.maximumCurrentToBaselineRatio = 1.1;
  expectSignalError(
    () => analyzeSearchAnalyticsSignals(baseline, current, ratio),
    'invalid_input',
  );
});
