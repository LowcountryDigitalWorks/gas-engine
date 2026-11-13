import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
  type SearchAnalyticsAdaptationResult,
} from '../../src/adapters/search-analytics.js';
import {
  analyzeTopicPageCoverage,
  MAX_TOPIC_PAGE_LINKS,
  MAX_TOPIC_PAGE_PAGES,
  MAX_TOPIC_PAGE_TOPICS,
  TopicPageCoverageError,
  type TopicPageCoverageReport,
} from '../../src/analysis/topic-page-coverage.js';
import { canonicalJson } from '../../src/lib/canonical-json.js';
import type { Scope } from '../../src/persistence/repository.js';
import { batch } from '../persistence/helpers.js';

type MutableJson = Record<string, any>;
const fixtureText = readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8');
const minor1TextFixtureText = readFileSync('tests/fixtures/search-analytics-evidence-v1.1-text-based.json', 'utf8');
const minor1MultimodalFixtureText = readFileSync('tests/fixtures/search-analytics-evidence-v1.1-multimodal.json', 'utf8');
const alphaScope: Scope = structuredClone(batch('alpha').collection.scope);
const betaScope: Scope = structuredClone(batch('beta').collection.scope);
const providerConnectionId = 'synthetic-gsc-topic-page-connection';

function topicArtifact(rows: MutableJson['rows']): MutableJson {
  const value = JSON.parse(fixtureText) as MutableJson;
  value.rows = rows;
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
    availability: { state: 'available', reference: 'synthetic-topic-page-artifact' },
  };
}

function adapt(value: MutableJson, scope: Scope = alphaScope, pretty = false): SearchAnalyticsAdaptationResult {
  return adaptSearchAnalyticsEvidence(bytes(value, pretty), configFor(value, scope));
}

const policy = { id: 'topic-page-policy', version: '1.0.0' } as const;
const universe = { id: 'ldw-topic-universe', revision: '2026-11-12' } as const;

function baseInvocation(
  result: SearchAnalyticsAdaptationResult | undefined,
  links: { topicId: string; pageId: string }[],
  assignments: { queryId: string; topicId: string }[],
  pages: { pageId: string; url: string }[],
  scope: Scope = alphaScope,
) {
  return {
    scope,
    universe,
    topics: [
      { topicId: 'topic-a', label: 'Topic Alpha' },
      { topicId: 'topic-b', label: 'Topic Beta' },
    ],
    pages,
    topicPageLinks: links,
    queryTopicAssignments: assignments,
    policy,
    ...(result === undefined ? {} : { window: result }),
  };
}

function jsonProof(report: TopicPageCoverageReport): unknown {
  return {
    id: report.id,
    summary: report.summary,
    rowCount: report.topicPageCoverageRows.length,
    observed: report.topicPageCoverageRows.filter((row) => row.evidenceState === 'observed').length,
    notReturned: report.topicPageCoverageRows.filter((row) => row.evidenceState === 'not_returned').length,
    evidenceRowCount: report.topicPageCoverageRows.reduce(
      (count, row) => count + (row.evidenceRows?.length ?? 0),
      0,
    ),
  };
}

test('1) mapped topic/page returns exact observed GSC clicks and impressions', () => {
  const pageUrl = 'https://example.test/services/alpha';
  const artifact = topicArtifact([
    {
      query: 'synthetic service alpha',
      page: pageUrl,
      clicks: 7,
      impressions: 140,
      ctr: 0.05,
      averagePosition: 8.5,
    },
  ]);
  const window = adapt(artifact);
  const row = window.rows[0]!;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId: 'custom-home' }],
    [{ queryId: row.queryId, topicId: 'topic-a' }],
    [{ pageId: 'custom-home', url: pageUrl }],
  ));
  assert.equal(report.topicPageCoverageRows.length, 2);
  const observed = report.topicPageCoverageRows.find((entry) => entry.topicId === 'topic-a' && entry.pageId === 'custom-home');
  assert.ok(observed);
  assert.equal(observed.evidenceState, 'observed');
  assert.equal(observed.evidenceRows?.length, 1);
  assert.equal(observed.evidenceRows?.[0]?.clicks, 7);
  assert.equal(observed.evidenceRows?.[0]?.impressions, 140);
  assert.equal(observed.evidenceRows?.[0]?.sourcePageUrl, pageUrl);
  assert.equal(observed.pageId, 'custom-home');
  assert.equal(observed.evidenceRows?.[0]?.sourcePageId, row.pageId);
  assert.equal(report.summary.outcome, 'investigate_existing_page_fit');
  assert.equal(report.summary.noAutomaticContentAction, true);
});

test('2) assigned query/page with no returned row stays not_returned without numeric zero', () => {
  const mappedUrl = 'https://example.test/services/alpha';
  const missingUrl = 'https://example.test/services/beta';
  const otherUrl = 'https://example.test/services/gamma';
  const artifact = topicArtifact([
    {
      query: 'synthetic service alpha',
      page: mappedUrl,
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      averagePosition: 6,
    },
    {
      query: 'synthetic service gamma',
      page: otherUrl,
      clicks: 1,
      impressions: 5,
      ctr: 0.2,
      averagePosition: 3,
    },
    {
      query: 'synthetic service beta only',
      page: missingUrl,
      clicks: 2,
      impressions: 8,
      ctr: 0.25,
      averagePosition: 5,
    },
  ]);
  const window = adapt(artifact);
  const mapped = window.rows.find((entry) => entry.page === mappedUrl)!;
  const gamma = window.rows.find((entry) => entry.page === otherUrl)!;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [
      { topicId: 'topic-a', pageId: 'page-alpha' },
      { topicId: 'topic-b', pageId: 'page-beta' },
    ],
    [
      { queryId: mapped.queryId, topicId: 'topic-a' },
      { queryId: gamma.queryId, topicId: 'topic-b' },
    ],
    [
      { pageId: 'page-alpha', url: mappedUrl },
      { pageId: 'page-beta', url: missingUrl },
    ],
  ));
  const missing = report.topicPageCoverageRows.find((entry) => entry.topicId === 'topic-b');
  assert.ok(missing);
  assert.equal(missing.evidenceState, 'not_returned');
  assert.equal(missing.evidenceRows, undefined);
  assert.equal(missing.reason, 'assigned_query_page_not_returned_in_source');
});

test('3) absent source window marks coverage unavailable/not ready', () => {
  const report = analyzeTopicPageCoverage({
    scope: alphaScope,
    universe,
    topics: [{ topicId: 'topic-a', label: 'Only topic' }],
    pages: [{ pageId: 'page-a', url: 'https://example.test/a' }],
    topicPageLinks: [{ topicId: 'topic-a', pageId: 'page-a' }],
    queryTopicAssignments: [],
    policy,
  });
  assert.equal(report.source.state, 'absent');
  assert.equal(Object.hasOwn(report.source, 'collectionId'), false);
  assert.deepEqual(report.source.scope, alphaScope);
  assert.equal(report.topicPageCoverageRows[0]!.evidenceState, 'unavailable');
  assert.equal(report.summary.outcome, 'no_evidence_claim');
  assert.ok(report.summary.sourceLimitations.includes('source_window_absent'));
});

test('4) non-GSC provider substitution fails closed as invalid source', () => {
  const artifact = topicArtifact([]);
  const window = adapt(artifact);
  const forged = structuredClone(window);
  (forged as { providerId: string }).providerId = 'bing-webmaster-tools';
  assert.throws(
    () => analyzeTopicPageCoverage(baseInvocation(
      forged,
      [{ topicId: 'topic-a', pageId: 'page-a' }],
      [],
      [{ pageId: 'page-a', url: 'https://example.test/a' }],
    )),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_source',
  );
});

test('5) mismatched trusted scope fails closed', () => {
  const artifact = topicArtifact([
    {
      query: 'synthetic scope',
      page: 'https://example.test/scope',
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      averagePosition: 5,
    },
  ]);
  const window = adapt(artifact, alphaScope);
  const row = window.rows[0]!;
  assert.throws(
    () => analyzeTopicPageCoverage(baseInvocation(
      window,
      [{ topicId: 'topic-a', pageId: row.pageId }],
      [{ queryId: row.queryId, topicId: 'topic-a' }],
      [{ pageId: row.pageId, url: row.page }],
      betaScope,
    )),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'scope_mismatch',
  );
});

test('6) duplicate topic, page URL, and query assignment rejections', () => {
  const artifact = topicArtifact([]);
  const window = adapt(artifact);
  const row = window.rows[0];
  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics: [
        { topicId: 'topic-a', label: 'A' },
        { topicId: 'topic-a', label: 'Dup' },
      ],
      pages: [{ pageId: 'page-a', url: 'https://example.test/a' }],
      topicPageLinks: [],
      queryTopicAssignments: [],
      policy,
      window,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_assignments',
  );

  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics: [{ topicId: 'topic-a', label: 'A' }],
      pages: [
        { pageId: 'page-a', url: 'https://example.test/shared' },
        { pageId: 'page-b', url: 'https://example.test/shared' },
      ],
      topicPageLinks: [],
      queryTopicAssignments: [],
      policy,
      window,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_assignments',
  );

  if (row) {
    assert.throws(
      () => analyzeTopicPageCoverage(baseInvocation(
        window,
        [{ topicId: 'topic-a', pageId: row.pageId }],
        [
          { queryId: row.queryId, topicId: 'topic-a' },
          { queryId: row.queryId, topicId: 'topic-b' },
        ],
        [{ pageId: row.pageId, url: 'https://example.test/a' }],
      )),
      (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_assignments',
    );
  }
});

test('7) report identity is stable across key reordering but changes when mapping or source changes', () => {
  const pageUrl = 'https://example.test/identity';
  const artifact = topicArtifact([
    {
      query: 'synthetic identity',
      page: pageUrl,
      clicks: 3,
      impressions: 30,
      ctr: 0.1,
      averagePosition: 4,
    },
  ]);
  const window = adapt(artifact);
  const row = window.rows[0]!;
  const invocation = baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId: row.pageId }],
    [{ queryId: row.queryId, topicId: 'topic-a' }],
    [{ pageId: row.pageId, url: pageUrl }],
  );
  const first = analyzeTopicPageCoverage(invocation);
  const reordered = analyzeTopicPageCoverage({
    ...invocation,
    topics: [...invocation.topics].reverse(),
    pages: [...invocation.pages].reverse(),
    topicPageLinks: [...invocation.topicPageLinks].reverse(),
    queryTopicAssignments: [...invocation.queryTopicAssignments].reverse(),
  });
  assert.equal(first.id, reordered.id);

  const mappedElsewhere = analyzeTopicPageCoverage({
    ...invocation,
    topicPageLinks: [{ topicId: 'topic-b', pageId: row.pageId }],
    queryTopicAssignments: [{ queryId: row.queryId, topicId: 'topic-b' }],
  });
  assert.notEqual(first.id, mappedElsewhere.id);
});

test('8) partial and preliminary source preserves limitations and summary not_ready', () => {
  const pageUrl = 'https://example.test/preliminary';
  const artifact = topicArtifact([
    {
      query: 'synthetic preliminary',
      page: pageUrl,
      clicks: 1,
      impressions: 5,
      ctr: 0.2,
      averagePosition: 3,
    },
  ]);
  artifact.freshness = { dataState: 'preliminary', freshThrough: artifact.effectiveWindow.end };
  artifact.coverage = { state: 'partial', truncated: true, anonymized: false, reason: 'synthetic partial' };
  const window = adapt(artifact);
  const row = window.rows[0]!;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId: row.pageId }],
    [{ queryId: row.queryId, topicId: 'topic-a' }],
    [{ pageId: row.pageId, url: pageUrl }],
  ));
  assert.equal(report.summary.outcome, 'unresolved_not_ready');
  assert.ok(report.summary.sourceLimitations.includes('source_preliminary'));
  assert.ok(report.summary.sourceLimitations.includes('coverage_truncated'));
  const observed = report.topicPageCoverageRows.find((entry) => entry.topicId === 'topic-a');
  assert.equal(observed?.evidenceState, 'observed');
});

test('9) topic/page/link bounds fail closed without silent truncation', () => {
  const topics = Array.from({ length: MAX_TOPIC_PAGE_TOPICS + 1 }, (_, index) => ({
    topicId: `topic-${index}`,
    label: `T${index}`,
  }));
  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics,
      pages: [{ pageId: 'page-0', url: 'https://example.test/0' }],
      topicPageLinks: [],
      queryTopicAssignments: [],
      policy,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_input',
  );

  const pages = Array.from({ length: MAX_TOPIC_PAGE_PAGES + 1 }, (_, index) => ({
    pageId: `page-${index}`,
    url: `https://example.test/page-${index}`,
  }));
  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics: [{ topicId: 'topic-0', label: 'Zero' }],
      pages,
      topicPageLinks: [],
      queryTopicAssignments: [],
      policy,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_input',
  );

  const links = Array.from({ length: MAX_TOPIC_PAGE_LINKS + 1 }, (_, index) => ({
    topicId: 'topic-0',
    pageId: `page-${index}`,
  }));
  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics: [{ topicId: 'topic-0', label: 'Zero' }],
      pages: links.map((link, index) => ({ pageId: link.pageId, url: `https://example.test/p-${index}` })),
      topicPageLinks: links,
      queryTopicAssignments: [],
      policy,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_input',
  );
});

test('10) addendum: duplicate exact query mapping across topics fails before totaling', () => {
  const pageUrl = 'https://example.test/dup';
  const artifact = topicArtifact([
    {
      query: 'synthetic dup',
      page: pageUrl,
      clicks: 4,
      impressions: 40,
      ctr: 0.1,
      averagePosition: 5,
    },
  ]);
  const window = adapt(artifact);
  const row = window.rows[0]!;
  assert.throws(
    () => analyzeTopicPageCoverage(baseInvocation(
      window,
      [{ topicId: 'topic-a', pageId: row.pageId }, { topicId: 'topic-b', pageId: row.pageId }],
      [{ queryId: row.queryId, topicId: 'topic-a' }, { queryId: row.queryId, topicId: 'topic-b' }],
      [{ pageId: row.pageId, url: pageUrl }],
    )),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_assignments',
  );
});

test('addendum: minor-1 text_based and multimodal windows cannot be blended in one invocation', () => {
  const textArtifact = JSON.parse(minor1TextFixtureText) as MutableJson;
  const multimodalArtifact = JSON.parse(minor1MultimodalFixtureText) as MutableJson;
  const textWindow = adapt(textArtifact);
  const multimodalWindow = adapt(multimodalArtifact);
  assert.notEqual(
    canonicalJson((textWindow.semantics as { webModality?: string }).webModality),
    canonicalJson((multimodalWindow.semantics as { webModality?: string }).webModality),
  );
  const textRow = textWindow.rows[0]!;
  const textReport = analyzeTopicPageCoverage(baseInvocation(
    textWindow,
    [{ topicId: 'topic-a', pageId: textRow.pageId }],
    [{ queryId: textRow.queryId, topicId: 'topic-a' }],
    [{ pageId: textRow.pageId, url: textRow.page }],
  ));
  const multimodalReport = analyzeTopicPageCoverage(baseInvocation(
    multimodalWindow,
    [{ topicId: 'topic-a', pageId: textRow.pageId }],
    [{ queryId: textWindow.rows[0]!.queryId, topicId: 'topic-a' }],
    [{ pageId: textWindow.rows[0]!.pageId, url: textWindow.rows[0]!.page }],
  ));
  assert.notEqual(textReport.id, multimodalReport.id);
  assert.equal('webModality' in textReport.source, true);
  assert.equal('webModality' in multimodalReport.source, true);
});

test('addendum: authored page outside accepted GSC rows remains inventory not_returned not measured zero', () => {
  const inSource = 'https://example.test/in-source';
  const artifact = topicArtifact([
    {
      query: 'synthetic only in source',
      page: inSource,
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      averagePosition: 4,
    },
    {
      query: 'synthetic orphan query',
      page: inSource,
      clicks: 1,
      impressions: 5,
      ctr: 0.2,
      averagePosition: 3,
    },
  ]);
  const window = adapt(artifact);
  const row = window.rows[0]!;
  const orphan = window.rows[1]!;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId: row.pageId }, { topicId: 'topic-b', pageId: 'inventory-only' }],
    [
      { queryId: row.queryId, topicId: 'topic-a' },
      { queryId: orphan.queryId, topicId: 'topic-b' },
    ],
    [
      { pageId: row.pageId, url: inSource },
      { pageId: 'inventory-only', url: 'https://example.test/never-in-gsc' },
    ],
  ));
  const inventoryOnly = report.topicPageCoverageRows.find((entry) => entry.pageId === 'inventory-only');
  assert.equal(inventoryOnly?.evidenceState, 'not_returned');
  assert.equal(inventoryOnly?.reason, 'authored_page_not_in_accepted_source_rows');
  assert.equal(inventoryOnly?.evidenceRows, undefined);
});

test('addendum: request/effective period and collection identity participate in deterministic hash', () => {
  const pageUrl = 'https://example.test/hash';
  const artifact = topicArtifact([
    {
      query: 'synthetic hash',
      page: pageUrl,
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      averagePosition: 2,
    },
  ]);
  const firstWindow = adapt(artifact);
  const row = firstWindow.rows[0]!;
  const base = baseInvocation(
    firstWindow,
    [{ topicId: 'topic-a', pageId: row.pageId }],
    [{ queryId: row.queryId, topicId: 'topic-a' }],
    [{ pageId: row.pageId, url: pageUrl }],
  );
  const first = analyzeTopicPageCoverage(base);
  artifact.requestedWindow = {
    start: '2026-08-01T00:00:00.000Z',
    end: '2026-08-31T00:00:00.000Z',
  };
  artifact.effectiveWindow = structuredClone(artifact.requestedWindow);
  const shifted = analyzeTopicPageCoverage({ ...base, window: adapt(artifact) });
  assert.notEqual(first.id, shifted.id);
});

test('correction: forged inventory pageId with different URL never inherits source metrics', () => {
  const trueUrl = 'https://example.test/real';
  const forgedUrl = 'https://example.test/forged';
  const artifact = topicArtifact([
    {
      query: 'synthetic forged',
      page: trueUrl,
      clicks: 9,
      impressions: 90,
      ctr: 0.1,
      averagePosition: 4,
    },
  ]);
  const window = adapt(artifact);
  const row = window.rows[0]!;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId: row.pageId }],
    [{ queryId: row.queryId, topicId: 'topic-a' }],
    [{ pageId: row.pageId, url: forgedUrl }],
  ));
  const entry = report.topicPageCoverageRows.find((item) => item.topicId === 'topic-a');
  assert.equal(entry?.evidenceState, 'not_returned');
  assert.equal(entry?.evidenceRows, undefined);
});

test('correction: multiple queries on one topic/page return bounded evidenceRows without aggregate', () => {
  const pageUrl = 'https://example.test/multi';
  const artifact = topicArtifact([
    {
      query: 'synthetic multi a',
      page: pageUrl,
      clicks: 3,
      impressions: 30,
      ctr: 0.1,
      averagePosition: 4,
    },
    {
      query: 'synthetic multi b',
      page: pageUrl,
      clicks: 5,
      impressions: 50,
      ctr: 0.1,
      averagePosition: 6,
    },
  ]);
  const window = adapt(artifact);
  const rows = window.rows.filter((entry) => entry.page === pageUrl);
  assert.equal(rows.length, 2);
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId: 'multi-page' }],
    rows.map((entry) => ({ queryId: entry.queryId, topicId: 'topic-a' })),
    [{ pageId: 'multi-page', url: pageUrl }],
  ));
  const entry = report.topicPageCoverageRows.find((item) => item.topicId === 'topic-a');
  assert.equal(entry?.evidenceRows?.length, 2);
  assert.deepEqual(
    entry?.evidenceRows?.map((evidence) => evidence.clicks).sort(),
    [3, 5],
  );
});

test('correction: unknown source query IDs fail closed when window present', () => {
  const pageUrl = 'https://example.test/unknown-query';
  const artifact = topicArtifact([
    {
      query: 'synthetic known',
      page: pageUrl,
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      averagePosition: 2,
    },
  ]);
  const window = adapt(artifact);
  const row = window.rows[0]!;
  assert.throws(
    () => analyzeTopicPageCoverage(baseInvocation(
      window,
      [{ topicId: 'topic-a', pageId: 'page-known' }],
      [
        { queryId: row.queryId, topicId: 'topic-a' },
        { queryId: 'gsc.query:never-in-source', topicId: 'topic-b' },
      ],
      [{ pageId: 'page-known', url: pageUrl }],
    )),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_assignments',
  );
});

test('correction: inventory URL outside sc-domain property is rejected when source present', () => {
  const pageUrl = 'https://example.test/inside';
  const artifact = topicArtifact([
    {
      query: 'synthetic inside',
      page: pageUrl,
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      averagePosition: 2,
    },
  ]);
  const window = adapt(artifact);
  assert.throws(
    () => analyzeTopicPageCoverage(baseInvocation(
      window,
      [{ topicId: 'topic-a', pageId: 'page-a' }],
      [],
      [
        { pageId: 'page-a', url: pageUrl },
        { pageId: 'page-outsider', url: 'https://outsider.test/a' },
      ],
    )),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_assignments',
  );
});

test('correction: malformed inventory URL and window null fail typed invalid_input', () => {
  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics: [{ topicId: 'topic-a', label: 'A' }],
      pages: [{ pageId: 'page-a', url: 'https://' }],
      topicPageLinks: [],
      queryTopicAssignments: [],
      policy,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_input',
  );

  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics: [{ topicId: 'topic-a', label: 'A' }],
      pages: [{ pageId: 'page-a', url: 'https://example.test/a' }],
      topicPageLinks: [],
      queryTopicAssignments: [],
      policy,
      window: null,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_input',
  );
});

test('correction: present source exposes method adapter schema provenance', () => {
  const pageUrl = 'https://example.test/provenance';
  const artifact = topicArtifact([
    {
      query: 'synthetic provenance',
      page: pageUrl,
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      averagePosition: 3,
    },
  ]);
  const window = adapt(artifact);
  const row = window.rows[0]!;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId: 'page-prov' }],
    [{ queryId: row.queryId, topicId: 'topic-a' }],
    [{ pageId: 'page-prov', url: pageUrl }],
  ));
  assert.equal(report.source.state, 'present');
  if (report.source.state === 'present') {
    assert.ok(report.source.method);
    assert.ok(report.source.adapter.id);
    assert.ok(report.source.sourceSchema.id);
  }
  assert.ok(report.topicPageCoverageRows[0]?.evidenceRows?.[0]?.observationIds.clicks);
});

test('correction: mapped link with zero query assignments is unavailable not not_returned', () => {
  const pageUrl = 'https://example.test/no-assign';
  const absentUrl = 'https://example.test/never-in-gsc';
  const artifact = topicArtifact([
    {
      query: 'synthetic assign present',
      page: pageUrl,
      clicks: 1,
      impressions: 10,
      ctr: 0.1,
      averagePosition: 2,
    },
  ]);
  const window = adapt(artifact);
  const report = analyzeTopicPageCoverage({
    scope: alphaScope,
    universe,
    topics: [{ topicId: 'topic-a', label: 'A' }, { topicId: 'topic-b', label: 'B' }],
    pages: [
      { pageId: 'page-in-gsc', url: pageUrl },
      { pageId: 'page-absent', url: absentUrl },
    ],
    topicPageLinks: [
      { topicId: 'topic-a', pageId: 'page-in-gsc' },
      { topicId: 'topic-b', pageId: 'page-absent' },
    ],
    queryTopicAssignments: [],
    policy,
    window,
  });
  const inGsc = report.topicPageCoverageRows.find((row) => row.pageId === 'page-in-gsc');
  const absent = report.topicPageCoverageRows.find((row) => row.pageId === 'page-absent');
  assert.equal(inGsc?.evidenceState, 'unavailable');
  assert.equal(inGsc?.reason, 'no_query_assignment');
  assert.equal(absent?.evidenceState, 'unavailable');
  assert.equal(absent?.reason, 'no_query_assignment');
  assert.equal(inGsc?.evidenceRows, undefined);
});

test('correction: revoked hostile window Proxy fails typed invalid_input', () => {
  const revoked = Proxy.revocable(
    { providerId: 'google-search-console' },
    {},
  );
  revoked.revoke();
  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics: [{ topicId: 'topic-a', label: 'A' }],
      pages: [{ pageId: 'page-a', url: 'https://example.test/a' }],
      topicPageLinks: [{ topicId: 'topic-a', pageId: 'page-a' }],
      queryTopicAssignments: [],
      policy,
      window: revoked.proxy,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_input',
  );
});

test('correction: empty-trailing-hash inventory URL is rejected', () => {
  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics: [{ topicId: 'topic-a', label: 'A' }],
      pages: [{ pageId: 'page-a', url: 'https://example.test/a#' }],
      topicPageLinks: [{ topicId: 'topic-a', pageId: 'page-a' }],
      queryTopicAssignments: [],
      policy,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_input',
  );

  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics: [{ topicId: 'topic-a', label: 'A' }],
      pages: [{ pageId: 'page-a', url: 'https://example.test/a#section' }],
      topicPageLinks: [],
      queryTopicAssignments: [],
      policy,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_input',
  );
});


test('frozen graph: valid authored hierarchy and self, missing-parent, cycle references', () => {
  const input = baseInvocation(
    undefined,
    [{ topicId: 'topic-a', pageId: 'page-a' }],
    [],
    [{ pageId: 'page-a', url: 'https://example.test/services/a' }],
  );
  const valid = {
    ...input,
    topics: [
      { topicId: 'topic-a', label: 'A' },
      { topicId: 'topic-b', label: 'B', parentTopicId: 'topic-a' },
      { topicId: 'topic-c', label: 'C', parentTopicId: 'topic-b' },
    ],
  };
  const report = analyzeTopicPageCoverage(valid);
  assert.equal(report.topicPageCoverageRows.length, 3);
  assert.equal(report.topicPageCoverageRows[0]?.evidenceState, 'unavailable');
  assert.equal(report.summary.noAutomaticContentAction, true);

  const badHierarchies = [
    [{ topicId: 'topic-a', label: 'A', parentTopicId: 'topic-a' }],
    [{ topicId: 'topic-a', label: 'A', parentTopicId: 'unlisted-topic' }],
    [
      { topicId: 'topic-a', label: 'A', parentTopicId: 'topic-b' },
      { topicId: 'topic-b', label: 'B', parentTopicId: 'topic-a' },
    ],
  ];
  for (const topics of badHierarchies) {
    assert.throws(
      () => analyzeTopicPageCoverage({ ...input, topics }),
      (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_assignments',
    );
  }
});

test('frozen max output bytes: full declared mapping matrix fails typed without truncation', () => {
  const topics = Array.from({ length: MAX_TOPIC_PAGE_TOPICS }, (_, i) => ({
    topicId: `topic-${i}`,
    label: `Synthetic topic ${i}`,
  }));
  const pages = Array.from({ length: MAX_TOPIC_PAGE_PAGES }, (_, i) => ({
    pageId: `page-${i}`,
    url: `https://example.test/known-page/${i}`,
  }));
  const topicPageLinks = topics.flatMap((topic) =>
    pages.map((page) => ({ topicId: topic.topicId, pageId: page.pageId })));
  assert.equal(topicPageLinks.length, MAX_TOPIC_PAGE_LINKS);

  assert.throws(
    () => analyzeTopicPageCoverage({
      scope: alphaScope,
      universe,
      topics,
      pages,
      topicPageLinks,
      queryTopicAssignments: [],
      policy,
    }),
    (error: unknown) => error instanceof TopicPageCoverageError && error.code === 'invalid_output',
  );
});

test('synthetic JSON proof excerpt for Product review', () => {
  const pageUrl = 'https://example.test/proof';
  const artifact = topicArtifact([
    {
      query: 'synthetic proof',
      page: pageUrl,
      clicks: 5,
      impressions: 50,
      ctr: 0.1,
      averagePosition: 6,
    },
  ]);
  const window = adapt(artifact);
  const row = window.rows[0]!;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId: row.pageId }],
    [{ queryId: row.queryId, topicId: 'topic-a' }],
    [{ pageId: row.pageId, url: pageUrl }],
  ));
  const proof = jsonProof(report);
  assert.equal((proof as { observed: number }).observed, 1);
  assert.equal((proof as { humanEditorialReviewRequired?: boolean }).humanEditorialReviewRequired, undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(proof), 'utf8') < 4096);
});
