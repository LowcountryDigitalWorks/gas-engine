import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
} from '../../src/adapters/search-analytics.js';
import { OperatorWorkspaceError, prepareOperatorWorkspace, type OperatorWorkspace } from '../../src/operator/workspace.js';
import { renderOperatorWorkspaceHtml } from '../../src/operator/workspace-html.js';
import { alpha } from '../persistence/helpers.js';
import { decisionCycleFixture } from './decision-cycle-support.js';

async function trustedWorkspace(t: TestContext): Promise<OperatorWorkspace> {
  const fixture = await decisionCycleFixture(t);
  return prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, {
    serviceBriefRequest: fixture.serviceBriefRequest,
    decisionCycleInput: fixture.input,
    generatedAt: '2026-10-01T21:00:00.000Z',
    evaluatedAt: '2026-10-01T20:55:00.000Z',
    policy: {
      id: 'topic-matrix-test-workspace-policy',
      version: '1.0.0',
      maxTimelineEntries: 128,
      maxAttentionRows: 128,
      maxEvidenceRows: 256,
    },
  });
}

function authoredInput(workspace: OperatorWorkspace) {
  const target = new URL(workspace.trustedTarget).origin;
  return {
    scope: structuredClone(workspace.scope),
    universe: { id: 'synthetic-topic-universe', revision: '2026-11-13' },
    topics: [
      { topicId: 'topic-focus', label: '<img src=x onerror=alert(1)>' },
      { topicId: 'topic-missing', label: 'Missing is not zero' },
      { topicId: 'topic-unknown', label: 'Unknown source state' },
    ],
    pages: [
      { pageId: 'page-focus', url: target + '/focus' },
      { pageId: 'page-missing', url: target + '/missing' },
      { pageId: 'page-unknown', url: target + '/unknown' },
    ],
    topicPageLinks: [
      { topicId: 'topic-focus', pageId: 'page-focus' },
      { topicId: 'topic-missing', pageId: 'page-missing' },
      { topicId: 'topic-unknown', pageId: 'page-unknown' },
    ],
    queryTopicAssignments: [] as { queryId: string; topicId: string }[],
    policy: { id: 'synthetic-topic-matrix-policy', version: '1.0.0' },
  };
}

function acceptedSyntheticWindow(workspace: OperatorWorkspace) {
  const target = new URL(workspace.trustedTarget).origin;
  const artifact = JSON.parse(readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8')) as
    Record<string, any>;
  artifact.property = 'sc-domain:' + new URL(workspace.trustedTarget).hostname;
  artifact.rows = [
    { query: 'synthetic zero', page: target + '/focus', clicks: 0, impressions: 42, ctr: 0, averagePosition: 9.5 },
    { query: 'synthetic positive', page: target + '/focus', clicks: 7, impressions: 70, ctr: 0.1, averagePosition: 10 },
    { query: 'synthetic other page', page: target + '/different', clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 7 },
  ];
  const exported = Date.parse(String(artifact.exportedAt));
  const config: SearchAnalyticsAdapterConfig = {
    scope: structuredClone(workspace.scope),
    expectedProperty: String(artifact.property),
    providerConnectionId: 'synthetic-topic-matrix-connection',
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
    availability: { state: 'available', reference: 'synthetic-offline-only' },
  };
  return adaptSearchAnalyticsEvidence(Buffer.from(JSON.stringify(artifact), 'utf8'), config);
}

test('optional matrix is honestly not assessed when trusted invocation is absent', async (t) => {
  const workspace = await trustedWorkspace(t);
  const html = renderOperatorWorkspaceHtml(workspace);
  assert.match(html, /Topic–page evidence matrix/);
  assert.match(html, /Not assessed — no trusted topic\/page invocation was supplied/);
  assert.match(html, /<html lang="en" data-theme="dark">/);
  assert.match(html, /role="switch" id="theme-toggle"/);
  assert.equal((html.match(/data-nav=/g) ?? []).length, 6, 'no seventh workspace panel');
  assert.match(html, /connect-src 'none'/);
});

test('source-free authored mapping remains unavailable and labels are escaped, not treated as markup', async (t) => {
  const workspace = await trustedWorkspace(t);
  const input = authoredInput(workspace);
  const html = renderOperatorWorkspaceHtml(workspace, input);
  assert.match(html, /source_window_absent/);
  assert.match(html, /unavailable/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img src=x onerror=alert\(1\)>/);
  assert.match(html, /No GSC source window was supplied/);
  assert.match(html, /No individual observed GSC query×page rows/);
  assert.doesNotMatch(html, /No GSC source window was supplied; all mapped-pair evidence remains zero/);
});

test('observed numeric zero and positive rows remain separate; missing query×page is not zero', async (t) => {
  const workspace = await trustedWorkspace(t);
  const input = authoredInput(workspace);
  const window = acceptedSyntheticWindow(workspace);
  const zero = window.rows.find((row) => row.query === 'synthetic zero');
  const positive = window.rows.find((row) => row.query === 'synthetic positive');
  const other = window.rows.find((row) => row.query === 'synthetic other page');
  assert.ok(zero && positive && other);
  const html = renderOperatorWorkspaceHtml(workspace, {
    ...input,
    queryTopicAssignments: [
      { queryId: zero.queryId, topicId: 'topic-focus' },
      { queryId: positive.queryId, topicId: 'topic-focus' },
      { queryId: other.queryId, topicId: 'topic-missing' },
    ],
    window,
  });
  assert.match(html, /exact_query_page_row_returned/);
  assert.match(html, /not_returned/);
  assert.match(html, /assigned_query_page_not_returned_in_source|authored_page_not_in_accepted_source_rows/);
  assert.match(html, /no_query_assignment/);
  assert.match(html, /gsc_rows_not_exhaustive/);
  assert.match(html, /Observed clicks/);
  assert.match(html, /<td>0<\/td><td>42<\/td>/, 'zero must remain an observed numeric value');
  assert.match(html, /<td>7<\/td><td>70<\/td>/, 'second source row must stay independent');
  assert.ok(html.includes(zero.rowIdentity) && html.includes(positive.rowIdentity));
  assert.equal((html.match(/data-nav=/g) ?? []).length, 6);
  assert.ok(Buffer.byteLength(html, 'utf8') <= 3_000_000);
});

test('source scope, canonical URLs and trusted origin are all required before optional rendering', async (t) => {
  const workspace = await trustedWorkspace(t);
  const input = authoredInput(workspace);
  assert.throws(
    () => renderOperatorWorkspaceHtml(workspace, {
      ...input,
      scope: { ...input.scope, siteId: 'untrusted-other-site' },
    }),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'scope_mismatch',
  );
  assert.throws(
    () => renderOperatorWorkspaceHtml(workspace, {
      ...input,
      pages: [{ pageId: 'page-focus', url: 'https://untrusted.test/focus' }, ...input.pages.slice(1)],
    }),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'target_mismatch',
  );
  assert.throws(
    () => renderOperatorWorkspaceHtml(workspace, {
      ...input,
      pages: [{ pageId: 'page-focus', url: 'https://' + new URL(workspace.trustedTarget).hostname + ':443/focus' }, ...input.pages.slice(1)],
    }),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'invalid_request',
  );
});
