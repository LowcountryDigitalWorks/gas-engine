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
  const pageId = row.pageId;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId }],
    [{ queryId: row.queryId, topicId: 'topic-a' }],
    [{ pageId, url: pageUrl }],
  ));
  assert.equal(report.topicPageCoverageRows.length, 2);
  const observed = report.topicPageCoverageRows.find((entry) => entry.topicId === 'topic-a' && entry.pageId === pageId);
  assert.ok(observed);
  assert.equal(observed.evidenceState, 'observed');
  assert.equal(observed.evidence?.clicks, 7);
  assert.equal(observed.evidence?.impressions, 140);
  assert.equal(report.summary.outcome, 'investigate_existing_page_fit');
  assert.equal(report.summary.noAutomaticContentAction, true);
});

test('2) assigned query/page with no returned row stays not_returned without numeric zero', () => {
  const mappedUrl = 'https://example.test/services/alpha';
  const missingUrl = 'https://example.test/services/beta';
  const artifact = topicArtifact([
    {
      query: 'synthetic service alpha',
      page: mappedUrl,
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      averagePosition: 6,
    },
  ]);
  const window = adapt(artifact);
  const mapped = window.rows[0]!;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [
      { topicId: 'topic-a', pageId: mapped.pageId },
      { topicId: 'topic-b', pageId: 'page-beta' },
    ],
    [
      { queryId: mapped.queryId, topicId: 'topic-a' },
      { queryId: 'gsc.query:missing-assignment', topicId: 'topic-b' },
    ],
    [
      { pageId: mapped.pageId, url: mappedUrl },
      { pageId: 'page-beta', url: missingUrl },
    ],
  ));
  const missing = report.topicPageCoverageRows.find((entry) => entry.topicId === 'topic-b');
  assert.ok(missing);
  assert.equal(missing.evidenceState, 'not_returned');
  assert.equal(missing.evidence, undefined);
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
  ]);
  const window = adapt(artifact);
  const row = window.rows[0]!;
  const report = analyzeTopicPageCoverage(baseInvocation(
    window,
    [{ topicId: 'topic-a', pageId: row.pageId }, { topicId: 'topic-b', pageId: 'inventory-only' }],
    [{ queryId: row.queryId, topicId: 'topic-a' }],
    [
      { pageId: row.pageId, url: inSource },
      { pageId: 'inventory-only', url: 'https://example.test/never-in-gsc' },
    ],
  ));
  const inventoryOnly = report.topicPageCoverageRows.find((entry) => entry.pageId === 'inventory-only');
  assert.equal(inventoryOnly?.evidenceState, 'not_returned');
  assert.equal(inventoryOnly?.reason, 'authored_page_not_in_accepted_source_rows');
  assert.equal(inventoryOnly?.evidence, undefined);
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
