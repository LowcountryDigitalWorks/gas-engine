import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { WqtAdapterConfig } from '../../src/adapters/wqt.js';
import {
  composeInternalMeasurementReadinessHtml,
  type InternalWqtSiteAuditInput,
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

import { composeSiteAuditAnnex } from '../../src/operator/site-audit-annex.js';

type Fixture = Awaited<ReturnType<typeof decisionCycleFixture>>;

// Independent literal expectations: do not import the private presentation helper.
const expectedBanner = '<p id="ldw-internal-classification">LDW INTERNAL REVIEW — NOT APPROVED FOR CUSTOMER DELIVERY</p>' + '\n';
const expectedPrintStyle = `#ldw-internal-classification{border:2px solid #102a3a;background:#102a3a;color:#fff;padding:.75rem;margin:0 0 1rem;font-weight:700;text-align:center;overflow-wrap:anywhere}
@media screen and (max-width:480px){main{padding:.75rem}}
@media print{
  @page{margin:.7in .55in;
    @top-center{content:"LDW INTERNAL REVIEW — NOT APPROVED FOR CUSTOMER DELIVERY";font:700 9pt system-ui,sans-serif;color:#102a3a}
    @bottom-center{content:"LDW INTERNAL REVIEW — Page " counter(page) " of " counter(pages);font:9pt system-ui,sans-serif;color:#102a3a}
  }
  main{padding:0}#ldw-internal-classification{background:#fff;color:#102a3a;break-inside:avoid}
  thead{display:table-header-group}tr{break-inside:avoid}
}
`;
const reportEnd = '\n</main>\n</body>\n</html>\n';
const readinessStart = '\n<div class="internal" id="measurement-readiness-annex" role="note">\n';

function assertOnlyInternalAdditions(html: string, original: string): void {
  assert.equal(html.split(expectedBanner).length, 2);
  assert.equal(html.split(expectedPrintStyle).length, 2);
  assert.ok(html.includes(expectedPrintStyle + '</style>\n</head>'));
  assert.ok(html.includes('<main>\n' + expectedBanner + '<header>'));
  assert.ok(html.indexOf(expectedBanner) < html.indexOf('<h1>'));
  assert.ok(html.endsWith(reportEnd));
  assert.equal(html.split(readinessStart).length, 2);
  const withoutMarkings = html.replace(expectedPrintStyle, '').replace(expectedBanner, '');
  const annexAt = withoutMarkings.indexOf(readinessStart);
  assert.ok(annexAt > 0);
  assert.equal(withoutMarkings.slice(0, annexAt) + reportEnd, original);
  assert.ok(!original.includes('id="ldw-internal-classification"'));
  assert.ok(!original.includes(expectedPrintStyle));
}


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

test('trusted in-process composition adds only internal classification and source-readiness presentation', async (t) => {
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
  assertOnlyInternalAdditions(result, legacy);
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


const originalWqtMinor2 = JSON.parse(
  readFileSync('tests/fixtures/wqt-normalized-v1.2.json', 'utf8'),
) as Record<string, any>;

function internalWqtInput(workspace: OperatorWorkspace): InternalWqtSiteAuditInput {
  const artifact = structuredClone(originalWqtMinor2);
  artifact.schemaMinorVersion = 3;
  const config: WqtAdapterConfig = {
    scope: structuredClone(workspace.scope),
    expectedSiteId: 'example-site',
    expectedTargetOrigin: workspace.trustedTarget,
    providerConnectionIds: {
      siteone: 'synthetic-siteone-connection',
      lighthouse: 'synthetic-lighthouse-connection',
    },
    timing: {
      observedAt: '2026-10-02T00:05:00.000Z',
      startedAt: '2026-10-02T00:00:00.000Z',
      endedAt: '2026-10-02T00:04:00.000Z',
      collectedAt: '2026-10-02T00:06:00.000Z',
      receivedAt: '2026-10-02T00:07:00.000Z',
    },
    availability: {
      siteone: { state: 'available', reference: 'synthetic-siteone-artifact' },
      lighthouse: { state: 'available', reference: 'synthetic-lighthouse-artifact' },
    },
  };
  return {
    normalizedWqtBytes: Buffer.from(JSON.stringify(artifact), 'utf8'),
    trustedConfig: config,
    selections: [
      { provider: 'siteone', code: 'redirects' },
      { provider: 'lighthouse', code: 'first-contentful-paint' },
    ],
  };
}

test('one tenant-verified internal report combines exact WQT audit and measurement readiness', async (t) => {
  const x = await fixtureCase(t);
  const { evidence, review } = x.fixture.prepared;
  const wqt = internalWqtInput(x.workspace);
  const accepted = await composeCustomerServiceReport(evidence, review, alpha, x.request, x.customer);
  const legacyHtml = renderCustomerServiceReportHtml(accepted);
  const legacyJson = serializeCustomerServiceReportJson(accepted);
  const html = await composeInternalMeasurementReadinessHtml(
    evidence, review, alpha, x.request, x.customer, x.readiness, wqt,
  );
  assert.match(html, /id="measurement-readiness-annex"/);
  assert.match(html, /id="site-audit"/);
  const originalDualHtml = renderCustomerServiceReportHtml(accepted, composeSiteAuditAnnex(
    accepted, wqt.normalizedWqtBytes, wqt.trustedConfig, wqt.selections,
  ));
  assertOnlyInternalAdditions(html, originalDualHtml);
  assert.equal((html.match(/id="site-audit"/g) ?? []).length, 1);
  assert.equal((html.match(/id="measurement-readiness-annex"/g) ?? []).length, 1);
  assert.match(html, /Original WQT source availability and timing/);
  assert.match(html, /first-contentful-paint/);
  assert.match(html, /redirect-count=1 count/);
  assert.match(html, /configured no collection proof/);
  assert.match(html, /not approved for customer delivery/);
  assert.match(html, /No trusted provider status supplied; absence is not an observed zero/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.equal(html.includes('<script'), false);
  assert.ok(Buffer.byteLength(html, 'utf8') <= MAX_CUSTOMER_REPORT_HTML_BYTES);
  assert.equal(renderCustomerServiceReportHtml(accepted), legacyHtml);
  assert.equal(serializeCustomerServiceReportJson(accepted), legacyJson);
  assert.equal(html, await composeInternalMeasurementReadinessHtml(
    evidence, review, alpha, x.request, x.customer, x.readiness, wqt,
  ));
});

test('WQT source cannot cross tenant, site, revision or HTTPS target with matching hostname', async (t) => {
  const x = await fixtureCase(t);
  const { evidence, review } = x.fixture.prepared;
  const wqt = internalWqtInput(x.workspace);
  const attempt = (input: InternalWqtSiteAuditInput) =>
    composeInternalMeasurementReadinessHtml(
      evidence, review, alpha, x.request, x.customer, x.readiness, input,
    );
  for (const scope of [
    { ...x.workspace.scope, tenantId: 'tenant-other' },
    { ...x.workspace.scope, siteId: 'site-other' },
    { ...x.workspace.scope, siteScopeRevisionId: 'site-revision-other' },
  ]) {
    await assert.rejects(attempt({
      ...wqt,
      trustedConfig: { ...wqt.trustedConfig, scope },
    }), /scope and target/);
  }
  await assert.rejects(attempt({
    ...wqt,
    trustedConfig: {
      ...wqt.trustedConfig,
      expectedTargetOrigin: 'https://other.example.test',
    },
  }), /scope and target/);
  await assert.rejects(attempt({
    ...wqt,
    trustedConfig: {
      ...wqt.trustedConfig,
      expectedSiteId: 'another-source-site',
    },
  }));
});

test('forged selection or malformed WQT bytes cannot enter the combined report', async (t) => {
  const x = await fixtureCase(t);
  const { evidence, review } = x.fixture.prepared;
  const wqt = internalWqtInput(x.workspace);
  const attempt = (input: InternalWqtSiteAuditInput) =>
    composeInternalMeasurementReadinessHtml(
      evidence, review, alpha, x.request, x.customer, x.readiness, input,
    );
  await assert.rejects(attempt({
    ...wqt,
    normalizedWqtBytes: Buffer.from('{"status":403}', 'utf8'),
  }));
  await assert.rejects(attempt({
    ...wqt,
    selections: [{ provider: 'siteone', code: 'nonexistent-source-observation' }],
  }));
  await assert.rejects(attempt({
    ...wqt,
    selections: [...wqt.selections, wqt.selections[0]!],
  }));
  await assert.rejects(attempt({
    ...wqt,
    selections: [
      { provider: 'siteone', code: 'redirects', priority: 999 },
    ] as unknown as InternalWqtSiteAuditInput['selections'],
  }));
  await assert.rejects(attempt({
    ...wqt,
    customerDeliveryAuthorized: true,
  } as InternalWqtSiteAuditInput));
});

test('unavailable WQT remains unverified, trusted limitation escaped, selection prohibited', async (t) => {
  const x = await fixtureCase(t);
  const { evidence, review } = x.fixture.prepared;
  const wqt = internalWqtInput(x.workspace);
  const unavailable: InternalWqtSiteAuditInput = {
    ...wqt,
    trustedConfig: {
      ...wqt.trustedConfig,
      availability: {
        ...wqt.trustedConfig.availability,
        siteone: {
          state: 'unavailable',
          reason: '<ScRiPt>alert(1)</ScRiPt> - scanner denied HTTP403',
        },
      },
    },
    selections: [{ provider: 'lighthouse', code: 'first-contentful-paint' }],
  };
  const html = await composeInternalMeasurementReadinessHtml(
    evidence, review, alpha, x.request, x.customer, x.readiness, unavailable,
  );
  assert.match(html, /not verified/);
  assert.match(html, /&lt;ScRiPt&gt;alert\(1\)&lt;\/ScRiPt&gt;/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /measurement-readiness-annex/);
  await assert.rejects(composeInternalMeasurementReadinessHtml(
    evidence, review, alpha, x.request, x.customer, x.readiness,
    { ...unavailable, selections: [{ provider: 'siteone', code: 'redirects' }] },
  ));
});
