import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
  type SearchAnalyticsAdaptationResult,
} from '../../src/adapters/search-analytics.js';
import {
  analyzePageFocusCandidate,
  PAGE_FOCUS_VALIDATION_REQUIREMENT,
  PageFocusError,
  type PageFocusAssignment,
  type PageFocusPolicy,
} from '../../src/analysis/page-focus.js';
import type { Scope } from '../../src/persistence/repository.js';
import { batch } from '../persistence/helpers.js';

type MutableJson = Record<string, any>;
const fixtureText = readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8');
const alphaScope: Scope = structuredClone(batch('alpha').collection.scope);
const betaScope: Scope = structuredClone(batch('beta').collection.scope);
const providerConnectionId = 'synthetic-gsc-page-focus-connection';
const focusPage = 'https://example.test/focus';

function focusArtifact(): MutableJson {
  const value = JSON.parse(fixtureText) as MutableJson;
  value.rows = [
    {
      query: 'synthetic alpha zero',
      page: focusPage,
      clicks: 0,
      impressions: 40,
      ctr: 0,
      averagePosition: 5,
    },
    {
      query: 'synthetic beta core',
      page: focusPage,
      clicks: 4,
      impressions: 40,
      ctr: 0.1,
      averagePosition: 7,
    },
    {
      query: 'synthetic delta alternate',
      page: focusPage,
      clicks: 4,
      impressions: 20,
      ctr: 0.2,
      averagePosition: 25,
    },
    {
      query: 'synthetic gamma alternate',
      page: focusPage,
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      averagePosition: 20,
    },
    {
      query: 'synthetic other page',
      page: 'https://example.test/other',
      clicks: 9,
      impressions: 90,
      ctr: 0.1,
      averagePosition: 3,
    },
  ];
  return value;
}

function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
}

function configFor(value: MutableJson, scope: Scope = alphaScope): SearchAnalyticsAdapterConfig {
  const exported = new Date(value.exportedAt).getTime();
  return {
    scope: structuredClone(scope),
    expectedProperty: value.property,
    providerConnectionId,
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
    availability: { state: 'available', reference: 'synthetic-page-focus-artifact' },
  };
}

function adapt(value: MutableJson = focusArtifact(), scope: Scope = alphaScope, pretty = false): SearchAnalyticsAdaptationResult {
  return adaptSearchAnalyticsEvidence(bytes(value, pretty), configFor(value, scope));
}

function targetRows(result: SearchAnalyticsAdaptationResult) {
  return result.rows.filter((row) => row.page === focusPage);
}

function targetPageId(result: SearchAnalyticsAdaptationResult): string {
  const row = targetRows(result)[0];
  assert.ok(row);
  return row.pageId;
}

function assignmentsFor(result: SearchAnalyticsAdaptationResult): PageFocusAssignment[] {
  return targetRows(result).map((row) => {
    if (row.query === 'synthetic alpha zero') {
      return { queryId: row.queryId, clusterId: 'cluster-a', label: 'Core evidence' };
    }
    if (row.query === 'synthetic beta core') {
      return { queryId: row.queryId, clusterId: 'cluster-a' };
    }
    if (row.query === 'synthetic delta alternate') {
      return { queryId: row.queryId, clusterId: 'cluster-b' };
    }
    return { queryId: row.queryId, clusterId: 'cluster-b', label: 'Alternate evidence' };
  });
}

function policy(overrides: Partial<PageFocusPolicy> = {}): PageFocusPolicy {
  return {
    id: 'page-focus-policy',
    version: '1.0.0',
    minimumPageImpressions: 100,
    minimumClusterImpressions: 30,
    minimumClusterShare: 0.25,
    ...overrides,
  };
}

function analyze(
  result: SearchAnalyticsAdaptationResult,
  assignments: PageFocusAssignment[] = assignmentsFor(result),
  candidatePolicy: PageFocusPolicy = policy(),
) {
  return analyzePageFocusCandidate({
    window: result,
    pageId: targetPageId(result),
    assignments,
    policy: candidatePolicy,
  });
}

test('strict policy validation rejects invalid identifiers, versions, thresholds, shares, and non-finite numbers', () => {
  const result = adapt();
  const variants: unknown[] = [
    { ...policy(), id: 'bad policy id' },
    { ...policy(), version: 'bad/version' },
    { ...policy(), minimumPageImpressions: -1 },
    { ...policy(), minimumClusterImpressions: -1 },
    { ...policy(), minimumClusterShare: -0.01 },
    { ...policy(), minimumClusterShare: 1.01 },
    { ...policy(), minimumPageImpressions: Number.POSITIVE_INFINITY },
    { ...policy(), minimumClusterImpressions: Number.NaN },
    { ...policy(), minimumPageImpressions: -0 },
  ];

  for (const badPolicy of variants) {
    assert.throws(
      () => analyzePageFocusCandidate({
        window: result,
        pageId: targetPageId(result),
        assignments: assignmentsFor(result),
        policy: badPolicy,
      }),
      (error: unknown) => error instanceof PageFocusError && error.code === 'invalid_input',
    );
  }
});

test('strict assignment validation rejects malformed, unknown-field, duplicate, unknown-page, missing, and conflicting-label inputs', () => {
  const result = adapt();
  const valid = assignmentsFor(result);

  for (const assignments of [
    [{ ...valid[0]!, queryId: '' }, ...valid.slice(1)],
    [{ ...valid[0]!, clusterId: 'bad cluster id' }, ...valid.slice(1)],
    [{ ...valid[0]!, label: 'x'.repeat(129) }, ...valid.slice(1)],
    [{ ...valid[0]!, tenantId: 'forged-tenant' }, ...valid.slice(1)],
  ]) {
    assert.throws(
      () => analyzePageFocusCandidate({
        window: result,
        pageId: targetPageId(result),
        assignments,
        policy: policy(),
      }),
      (error: unknown) => error instanceof PageFocusError && error.code === 'invalid_input',
    );
  }

  assert.throws(
    () => analyze(result, [...valid, structuredClone(valid[0]!)]),
    (error: unknown) => error instanceof PageFocusError && error.code === 'invalid_assignments',
  );

  const otherPage = result.rows.find((row) => row.page !== focusPage);
  assert.ok(otherPage);
  assert.throws(
    () => analyze(result, [
      { ...valid[0]!, queryId: otherPage.queryId },
      ...valid.slice(1),
    ]),
    (error: unknown) => error instanceof PageFocusError && error.code === 'invalid_assignments',
  );

  assert.throws(
    () => analyze(result, valid.slice(0, -1)),
    (error: unknown) => error instanceof PageFocusError && error.code === 'invalid_assignments',
  );

  const conflict = valid.map((assignment) => ({ ...assignment }));
  const clusterA = conflict.filter((assignment) => assignment.clusterId === 'cluster-a');
  assert.equal(clusterA.length, 2);
  clusterA[0]!.label = 'First label';
  clusterA[1]!.label = 'Second label';
  assert.throws(
    () => analyze(result, conflict),
    (error: unknown) => error instanceof PageFocusError && error.code === 'invalid_assignments',
  );
});

test('target page must exist and every target-page row participates in exact aggregation and provenance', () => {
  const result = adapt();
  assert.throws(
    () => analyzePageFocusCandidate({
      window: result,
      pageId: 'gsc.page:missing',
      assignments: assignmentsFor(result),
      policy: policy(),
    }),
    (error: unknown) => error instanceof PageFocusError && error.code === 'target_not_found',
  );

  const report = analyze(result);
  assert.equal(report.state, 'candidate');
  assert.equal(report.page, focusPage);
  assert.equal(report.pageId, targetPageId(result));
  assert.deepEqual(report.pageTotals, {
    queryCount: 4,
    clicks: 10,
    impressions: 120,
    ctr: 10 / 120,
  });

  assert.equal(report.clusters.length, 2);
  const clusterA = report.clusters.find((cluster) => cluster.clusterId === 'cluster-a');
  const clusterB = report.clusters.find((cluster) => cluster.clusterId === 'cluster-b');
  assert.ok(clusterA);
  assert.ok(clusterB);

  assert.deepEqual(
    {
      queryCount: clusterA.queryCount,
      clicks: clusterA.clicks,
      impressions: clusterA.impressions,
      ctr: clusterA.ctr,
      range: clusterA.averagePositionRange,
      share: clusterA.supportShare,
    },
    {
      queryCount: 2,
      clicks: 4,
      impressions: 80,
      ctr: 4 / 80,
      range: { minimum: 5, maximum: 7 },
      share: 80 / 120,
    },
  );
  assert.deepEqual(
    {
      queryCount: clusterB.queryCount,
      clicks: clusterB.clicks,
      impressions: clusterB.impressions,
      ctr: clusterB.ctr,
      range: clusterB.averagePositionRange,
      share: clusterB.supportShare,
    },
    {
      queryCount: 2,
      clicks: 6,
      impressions: 40,
      ctr: 6 / 40,
      range: { minimum: 20, maximum: 25 },
      share: 40 / 120,
    },
  );

  const selectedRows = targetRows(result);
  const allEvidence = report.clusters.flatMap((cluster) => cluster.evidence);
  assert.equal(allEvidence.length, selectedRows.length);
  for (const row of selectedRows) {
    const evidence = allEvidence.find((item) => item.queryId === row.queryId);
    assert.ok(evidence);
    assert.equal(evidence.rowIdentity, row.rowIdentity);
    assert.equal(evidence.sourceRecordId, row.sourceRecordId);
    assert.deepEqual(evidence.observationIds, row.observationIds);
    const cluster = report.clusters.find((item) => item.queryIds.includes(row.queryId));
    assert.ok(cluster);
    assert.ok(cluster.queries.includes(row.query));
  }
});

test('observed zero clicks remain numeric zero in a zero-click cluster', () => {
  const result = adapt();
  const assignments = targetRows(result).map((row): PageFocusAssignment => ({
    queryId: row.queryId,
    clusterId: row.query === 'synthetic alpha zero' ? 'cluster-zero' : 'cluster-other',
  }));
  const report = analyze(result, assignments, policy({
    minimumPageImpressions: 0,
    minimumClusterImpressions: 1,
    minimumClusterShare: 0,
  }));
  const zero = report.clusters.find((cluster) => cluster.clusterId === 'cluster-zero');
  assert.ok(zero);
  assert.equal(zero.queryCount, 1);
  assert.equal(zero.clicks, 0);
  assert.equal(zero.impressions, 40);
  assert.equal(zero.ctr, 0);
});

test('assignment order and source formatting do not affect canonical output; display labels do not affect report identity', () => {
  const leftResult = adapt();
  const rightValue = focusArtifact();
  rightValue.rows.reverse();
  const rightResult = adapt(rightValue, alphaScope, true);

  const leftAssignments = assignmentsFor(leftResult);
  const rightAssignments = assignmentsFor(rightResult).reverse();
  const left = analyze(leftResult, leftAssignments);
  const right = analyze(rightResult, rightAssignments);
  assert.deepEqual(left, right);

  const relabeled = assignmentsFor(leftResult).map((assignment) => ({ ...assignment }));
  const alpha = relabeled.find((assignment) => assignment.label === 'Core evidence');
  assert.ok(alpha);
  alpha.label = 'Renamed display label';
  const relabeledReport = analyze(leftResult, relabeled);
  assert.equal(relabeledReport.id, left.id);
  assert.notDeepEqual(relabeledReport.clusters, left.clusters);
});

test('ready evidence emits one neutral candidate with highest-impression dominance and deterministic clusterId tie-break', () => {
  const result = adapt();
  const report = analyze(result);
  assert.equal(report.state, 'candidate');
  if (report.state === 'candidate') {
    assert.deepEqual(report.dominantEvidenceCluster, {
      clusterId: 'cluster-a',
      impressions: 80,
      supportShare: 80 / 120,
    });
    assert.deepEqual(report.divergentEvidenceClusters, [{
      clusterId: 'cluster-b',
      impressions: 40,
      supportShare: 40 / 120,
    }]);
  }

  const tieAssignments = targetRows(result).map((row): PageFocusAssignment => ({
    queryId: row.queryId,
    clusterId: row.query === 'synthetic alpha zero' || row.query === 'synthetic gamma alternate'
      ? 'cluster-b'
      : 'cluster-a',
  }));
  const tie = analyze(result, tieAssignments, policy({ minimumClusterShare: 0.2 }));
  assert.equal(tie.state, 'candidate');
  if (tie.state === 'candidate') {
    assert.equal(tie.dominantEvidenceCluster.clusterId, 'cluster-a');
    assert.equal(tie.dominantEvidenceCluster.impressions, 60);
    assert.deepEqual(tie.divergentEvidenceClusters.map((cluster) => cluster.clusterId), ['cluster-b']);
  }
});

test('thresholds are inclusive at exact boundaries and insufficient page/cluster support returns no_candidate', () => {
  const result = adapt();

  const inclusive = analyze(result, assignmentsFor(result), policy({
    minimumPageImpressions: 120,
    minimumClusterImpressions: 40,
    minimumClusterShare: 40 / 120,
  }));
  assert.equal(inclusive.state, 'candidate');

  const belowClusterImpressions = analyze(result, assignmentsFor(result), policy({
    minimumClusterImpressions: 41,
  }));
  assert.deepEqual(
    { state: belowClusterImpressions.state, reasons: belowClusterImpressions.state === 'no_candidate' ? belowClusterImpressions.reasons : [] },
    { state: 'no_candidate', reasons: ['fewer_than_two_supported_clusters'] },
  );

  const belowClusterShare = analyze(result, assignmentsFor(result), policy({
    minimumClusterShare: 0.34,
  }));
  assert.deepEqual(
    { state: belowClusterShare.state, reasons: belowClusterShare.state === 'no_candidate' ? belowClusterShare.reasons : [] },
    { state: 'no_candidate', reasons: ['fewer_than_two_supported_clusters'] },
  );

  const belowPage = analyze(result, assignmentsFor(result), policy({
    minimumPageImpressions: 121,
  }));
  assert.deepEqual(
    { state: belowPage.state, reasons: belowPage.state === 'no_candidate' ? belowPage.reasons : [] },
    { state: 'no_candidate', reasons: ['page_below_minimum_impressions'] },
  );

  const oneSupported = analyze(result, assignmentsFor(result), policy({
    minimumClusterImpressions: 50,
  }));
  assert.equal(oneSupported.state, 'no_candidate');
  if (oneSupported.state === 'no_candidate') {
    assert.deepEqual(oneSupported.reasons, ['fewer_than_two_supported_clusters']);
  }
});

test('preliminary, incomplete, unknown, truncated, and anonymized coverage are not_ready while preserving observed summaries', () => {
  const scenarios: Array<{
    mutate: (value: MutableJson) => void;
    reasons: string[];
  }> = [
    {
      mutate: (value) => {
        value.freshness = { dataState: 'preliminary', freshThrough: value.effectiveWindow.end };
      },
      reasons: ['source_not_final'],
    },
    {
      mutate: (value) => {
        value.coverage = { state: 'partial', truncated: false, anonymized: false, reason: 'Synthetic partial coverage.' };
      },
      reasons: ['coverage_incomplete'],
    },
    {
      mutate: (value) => {
        value.coverage = { state: 'unknown', truncated: false, anonymized: false, reason: 'Synthetic unknown coverage.' };
      },
      reasons: ['coverage_incomplete'],
    },
    {
      mutate: (value) => {
        value.coverage = { state: 'partial', truncated: true, anonymized: false, reason: 'Synthetic truncated coverage.' };
      },
      reasons: ['coverage_incomplete', 'coverage_truncated'],
    },
    {
      mutate: (value) => {
        value.coverage = { state: 'unknown', truncated: false, anonymized: true, reason: 'Synthetic anonymized coverage.' };
      },
      reasons: ['coverage_incomplete', 'coverage_anonymized'],
    },
  ];

  for (const scenario of scenarios) {
    const value = focusArtifact();
    scenario.mutate(value);
    const result = adapt(value);
    const report = analyze(result);
    assert.equal(report.state, 'not_ready');
    if (report.state === 'not_ready') assert.deepEqual(report.reasons, scenario.reasons);
    assert.deepEqual(report.pageTotals, {
      queryCount: 4,
      clicks: 10,
      impressions: 120,
      ctr: 10 / 120,
    });
    assert.equal(report.clusters.length, 2);
    assert.equal(Object.hasOwn(report, 'dominantEvidenceCluster'), false);
    assert.equal(Object.hasOwn(report, 'divergentEvidenceClusters'), false);
  }
});

test('every output requires separate SERP validation and creates no recommendation/action/conclusion contract', () => {
  const result = adapt();
  for (const report of [
    analyze(result),
    analyze(result, assignmentsFor(result), policy({ minimumPageImpressions: 121 })),
  ]) {
    assert.equal(report.serpValidationRequired, true);
    assert.equal(report.validationRequirement, PAGE_FOCUS_VALIDATION_REQUIREMENT);
    assert.equal(Object.hasOwn(report, 'recommendation'), false);
    assert.equal(Object.hasOwn(report, 'action'), false);
    assert.equal(Object.hasOwn(report, 'conclusion'), false);
  }
});

test('assignment/policy data cannot mint authority and Alpha/Beta scopes remain isolated in output', () => {
  const alphaResult = adapt(focusArtifact(), alphaScope);
  const betaResult = adapt(focusArtifact(), betaScope);
  const alphaAssignments = assignmentsFor(alphaResult);

  const alphaReport = analyze(alphaResult, alphaAssignments);
  const betaReport = analyze(betaResult, alphaAssignments);

  assert.deepEqual(alphaReport.source.scope, alphaScope);
  assert.deepEqual(betaReport.source.scope, betaScope);
  assert.notDeepEqual(alphaReport.source.scope, betaReport.source.scope);
  assert.notEqual(alphaReport.source.collectionId, betaReport.source.collectionId);
  assert.notEqual(alphaReport.id, betaReport.id);

  assert.throws(
    () => analyzePageFocusCandidate({
      window: alphaResult,
      pageId: targetPageId(alphaResult),
      assignments: alphaAssignments.map((assignment, index) =>
        index === 0 ? { ...assignment, scope: betaScope } : assignment),
      policy: policy(),
    }),
    (error: unknown) => error instanceof PageFocusError && error.code === 'invalid_input',
  );

  assert.throws(
    () => analyzePageFocusCandidate({
      window: alphaResult,
      pageId: targetPageId(alphaResult),
      assignments: alphaAssignments,
      policy: { ...policy(), tenantId: betaScope.tenantId },
    }),
    (error: unknown) => error instanceof PageFocusError && error.code === 'invalid_input',
  );
});
