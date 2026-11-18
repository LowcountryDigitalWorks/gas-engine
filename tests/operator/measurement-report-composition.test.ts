import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  composeInternalMeasurementReadinessHtml,
} from '../../src/operator/measurement-report-composition.js';
import {
  composeCustomerServiceReport,
  serializeCustomerServiceReportJson,
} from '../../src/operator/customer-report.js';
import {
  MAX_CUSTOMER_REPORT_HTML_BYTES,
  renderCustomerServiceReportHtml,
} from '../../src/operator/customer-report-html.js';
import {
  prepareOperatorWorkspace,
  type OperatorWorkspace,
  type OperatorWorkspaceRequest,
} from '../../src/operator/workspace.js';
import { alpha, beta } from '../persistence/helpers.js';
import { decisionCycleFixture } from './decision-cycle-support.js';

type Fixture = Awaited<ReturnType<typeof decisionCycleFixture>>;

function workspaceRequest(fixture: Fixture): OperatorWorkspaceRequest {
  return {
    serviceBriefRequest: fixture.serviceBriefRequest,
    decisionCycleInput: fixture.input,
    generatedAt: '2026-10-01T21:00:00.000Z',
    evaluatedAt: '2026-10-01T20:55:00.000Z',
    policy: {
      id: 'internal-readiness-report-policy',
      version: '1.0.0',
      maxTimelineEntries: 128,
      maxAttentionRows: 128,
      maxEvidenceRows: 256,
    },
  };
}

function customerRequest(workspace: OperatorWorkspace) {
  assert.ok(workspace.attention.length > 0);
  return {
    version: '0.17.0' as const,
    requestId: 'synthetic-internal-readiness-report',
    createdAt: '2026-10-01T21:05:00.000Z',
    workspaceId: workspace.id,
    sourceBriefId: workspace.source.serviceBriefId,
    ...(workspace.source.decisionCycleDossierId === undefined
      ? {}
      : { sourceDossierId: workspace.source.decisionCycleDossierId }),
    title: 'Synthetic internal source-readiness review',
    executiveSummary: 'Human-authored synthetic data; no automatic health ranking.',
    selectedAttentionIds: [workspace.attention[0]!.id],
    observedChanges: [],
    nextReview: 'Review when an authorized new source is available.',
    includeInternalAppendix: false,
  };
}

function readinessRequest(workspace: OperatorWorkspace) {
  return {
    scope: structuredClone(workspace.scope),
    target: workspace.trustedTarget,
    evaluatedAt: workspace.evaluatedAt,
    sources: [
      { provider: 'google_search_console', state: 'verified' },
      { provider: 'google_analytics_4', state: 'configured_no_collection_proof' },
      {
        provider: 'wqt_scanner', state: 'scanner_blocked',
        limitation: 'SiteOne root HTTP 403; source access not restored.',
      },
    ],
    nextChecks: [
      { provider: 'google_analytics_4', humanCheck: 'Confirm consent gate before any event test.' },
    ],
  };
}

async function fixtureCase(t: Parameters<typeof decisionCycleFixture>[0]) {
  const fixture = await decisionCycleFixture(t);
  const request = workspaceRequest(fixture);
  const workspace = await prepareOperatorWorkspace(
    fixture.prepared.evidence, fixture.prepared.review, alpha, request,
  );
  return {
    fixture, workspace, request,
    customer: customerRequest(workspace),
    readiness: readinessRequest(workspace),
  };
}

test('trusted in-process composition adds only a clearly internal source-readiness fragment', async (t) => {
  const x = await fixtureCase(t);
  const { evidence, review } = x.fixture.prepared;
  const accepted = await composeCustomerServiceReport(evidence, review, alpha, x.request, x.customer);
  const legacy = renderCustomerServiceReportHtml(accepted);
  const originalJson = serializeCustomerServiceReportJson(accepted);
  assert.equal(legacy, renderCustomerServiceReportHtml(accepted, undefined));

  const result = await composeInternalMeasurementReadinessHtml(
    evidence, review, alpha, x.request, x.customer, x.readiness,
  );
  assert.equal(result, await composeInternalMeasurementReadinessHtml(
    evidence, review, alpha, x.request, x.customer, x.readiness,
  ));
  assert.ok(result.startsWith(legacy.slice(0, legacy.indexOf('\n</main>\n</body>\n</html>\n'))));
  assert.match(result, /id="measurement-readiness-annex"/);
  assert.match(result, /LDW INTERNAL REVIEW ONLY/);
  assert.match(result, /not approved for customer delivery/);
  assert.match(result, /configured no collection proof/);
  assert.match(result, /SiteOne root HTTP 403/);
  assert.match(result, /No trusted provider status supplied; absence is not an observed zero/);
  assert.match(result, /script-src 'none'/);
  assert.match(result, /connect-src 'none'/);
  assert.equal(result.includes('<script'), false);
  assert.equal(Buffer.byteLength(result, 'utf8') <= MAX_CUSTOMER_REPORT_HTML_BYTES, true);
  assert.equal(renderCustomerServiceReportHtml(accepted), legacy);
  assert.equal(serializeCustomerServiceReportJson(accepted), originalJson);
});

test('tenant authority is not supplied by matching site/target or serialized object fields', async (t) => {
  const x = await fixtureCase(t);
  const { evidence, review } = x.fixture.prepared;
  const args = [evidence, review] as const;
  await assert.rejects(composeInternalMeasurementReadinessHtml(
    ...args, beta, x.request, x.customer, x.readiness,
  ));
  await assert.rejects(composeInternalMeasurementReadinessHtml(
    ...args, structuredClone(alpha), x.request, x.customer, x.readiness,
  ));
  await assert.rejects(composeInternalMeasurementReadinessHtml(
    ...args, { tenantId: x.workspace.scope.tenantId } as unknown as typeof alpha,
    x.request, x.customer, x.readiness,
  ));
});

test('exact tenant/site/scope revision, origin, time and workspace source must all match', async (t) => {
  const x = await fixtureCase(t);
  const { evidence, review } = x.fixture.prepared;
  const call = (readiness: unknown, customer: unknown = x.customer) =>
    composeInternalMeasurementReadinessHtml(evidence, review, alpha, x.request, customer, readiness);
  const original = x.readiness;

  for (const override of [
    { scope: { ...x.workspace.scope, tenantId: 'tenant-foreign' } },
    { scope: { ...x.workspace.scope, siteId: 'site-foreign' } },
    { scope: { ...x.workspace.scope, siteScopeRevisionId: 'revision-foreign' } },
    { target: 'https://foreign.example.test' },
    { target: x.workspace.trustedTarget + '/different' },
    { target: 'http://example.test' },
    { evaluatedAt: '2026-10-01T20:54:00.000Z' },
  ]) {
    await assert.rejects(call({ ...original, ...override }));
  }
  await assert.rejects(call(original, { ...x.customer, workspaceId: 'workspace:' + 'f'.repeat(64) }));
  await assert.rejects(call(original, { ...x.customer, sourceBriefId: 'service-brief:stale' }));
  await assert.rejects(call(original, { ...x.customer, sourceDossierId: 'decision-cycle:stale' }));
  await assert.rejects(call(original, { ...x.customer, selectedAttentionIds: ['not-in-current-workspace'] }));
});

test('invalid observed collection, unrecognized states and forged display objects fail closed', async (t) => {
  const x = await fixtureCase(t);
  const { evidence, review } = x.fixture.prepared;
  const call = (readiness: unknown) =>
    composeInternalMeasurementReadinessHtml(evidence, review, alpha, x.request, x.customer, readiness);

  await assert.rejects(call({
    ...x.readiness, sources: [{ provider: 'google_analytics_4', state: 'collection_observed' }],
  }));
  await assert.rejects(call({
    ...x.readiness, sources: [{ provider: 'unknown_sensor', state: 'verified' }],
  }));
  await assert.rejects(call({
    ...x.readiness, sources: [{ provider: 'google_analytics_4', state: 'live', visits: 0 }],
  }));
  await assert.rejects(call({ ...x.readiness, customerApproved: true }));
  await assert.rejects(call({
    scope: x.workspace.scope, target: x.workspace.trustedTarget,
    evaluatedAt: x.workspace.evaluatedAt, sources: [], nextChecks: [],
    html: '<script>fetch("https://malicious.example")</script>',
  }));
});

test('provider-controlled and human text stays HTML-escaped and CSP remains deny-all', async (t) => {
  const x = await fixtureCase(t);
  const { evidence, review } = x.fixture.prepared;
  const readiness = {
    ...x.readiness,
    sources: [
      { provider: 'wqt_scanner', state: 'scanner_blocked',
        limitation: '<ScRiPt>alert(1)</ScRiPt> & <img src=x>' },
    ],
    nextChecks: [
      { provider: 'wqt_scanner', humanCheck: 'Review <IMG> and & source.' },
    ],
  };
  const html = await composeInternalMeasurementReadinessHtml(
    evidence, review, alpha, x.request, x.customer, readiness,
  );
  assert.match(html, /&lt;ScRiPt&gt;/);
  assert.match(html, /&lt;img src=x&gt;/);
  assert.match(html, /Review &lt;IMG&gt; and &amp; source/);
  assert.doesNotMatch(html, /<script\b|<img\b/i);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'none'/);
});
