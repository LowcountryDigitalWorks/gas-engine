import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  composeSiteAuditAnnex,
  MAX_SITE_AUDIT_SELECTIONS,
  type SiteAuditSelection,
} from '../../src/operator/site-audit-annex.js';
import { renderCustomerServiceReportHtml } from '../../src/operator/customer-report-html.js';
import type { CustomerServiceReport } from '../../src/operator/customer-report.js';
import {
  WqtAdapterError,
  type WqtAdapterConfig,
} from '../../src/adapters/wqt.js';

const original = JSON.parse(readFileSync('tests/fixtures/wqt-normalized-v1.2.json', 'utf8')) as Record<string, any>;

const config: WqtAdapterConfig = {
  scope: {
    tenantId: 'tenant-alpha',
    siteId: 'site-alpha',
    siteScopeRevisionId: 'synthetic-scope-alpha-r1',
  },
  expectedSiteId: 'example-site',
  expectedTargetOrigin: 'https://example.test',
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
    siteone: { state: 'available', reference: 'synthetic-wqt-siteone-artifact' },
    lighthouse: { state: 'available', reference: 'synthetic-wqt-lighthouse-artifact' },
  },
};

const report: CustomerServiceReport = {
  version: '0.17.0',
  id: 'customer-report:' + 'a'.repeat(64),
  title: 'Synthetic source review — internal only',
  createdAt: '2026-10-02T01:00:00.000Z',
  context: { siteId: 'site-alpha', target: 'https://example.test', periods: [] },
  executiveSummary: 'Human-authored synthetic summary',
  readiness: [],
  limitations: [],
  observedChanges: [],
  focusItems: [],
  nextReview: 'Human review before any delivery',
  sourceNotes: [],
};

function fixture(): Record<string, any> {
  const value = structuredClone(original);
  value.schemaMinorVersion = 3;
  return value;
}
function bytes(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(value), 'utf8');
}
function refold(value: Record<string, any>): void {
  value.observations = [...value.sources.siteone.observations, ...value.sources.lighthouse.observations]
    .sort((a: any, b: any) => {
      const x = a.source + ':' + a.code;
      const y = b.source + ':' + b.code;
      return x < y ? -1 : x > y ? 1 : 0;
    });
}
const select: readonly SiteAuditSelection[] = [
  { provider: 'siteone', code: 'redirects' },
  { provider: 'lighthouse', code: 'first-contentful-paint' },
];

test('internal site audit annex uses accepted WQT validation, exact source byte hash and manual selection only', () => {
  const value = fixture();
  const a = composeSiteAuditAnnex(report, bytes(value), config, select);
  const b = composeSiteAuditAnnex(report, bytes(value), config, select);
  assert.deepEqual(b, a);
  assert.match(a.id, /^site-audit-annex:[a-f0-9]{64}$/);
  assert.match(a.inputSha256, /^[a-f0-9]{64}$/);
  assert.equal(a.reportId, report.id);
  assert.equal(a.siteId, 'site-alpha');
  assert.equal(a.target, 'https://example.test');
  assert.equal(a.wqtSiteId, 'example-site');
  assert.equal(a.observedAt, config.timing.observedAt);
  assert.deepEqual(a.sources.map((item) => item.provider), ['siteone', 'lighthouse']);
  assert.deepEqual(a.selected.map((item) => item.code), ['redirects', 'first-contentful-paint']);
  assert.equal(a.selected[0]!.sourceStatus, 'NOTICE');
  assert.deepEqual(a.selected[0]!.sourceFacts, [
    { id: 'redirect-count', valueType: 'number', value: 1, unit: 'count' },
  ]);
  assert.equal(a.selected[1]!.sourceMode, 'numeric');
  assert.equal(a.selected[1]!.sourceScore, 0.5);
  assert.equal(a.selected[1]!.sourceDisplay, '1.2 s');

  const html = renderCustomerServiceReportHtml(report, a);
  assert.match(html, /Internal technical site audit evidence annex/);
  assert.match(html, /not approved for customer delivery/);
  assert.match(html, /source-native/i);
  assert.match(html, /first-contentful-paint/);
  assert.match(html, /redirect-count=1 count/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /<script\b/i);
});

test('existing report HTML remains byte-identical when the optional annex is not supplied', () => {
  const a = renderCustomerServiceReportHtml(report);
  const b = renderCustomerServiceReportHtml(report, undefined);
  assert.equal(a, b);
  assert.equal(a.includes('site-audit'), false);
  const empty = composeSiteAuditAnnex(report, bytes(fixture()), config, []);
  assert.deepEqual(empty.selected, []);
  assert.match(renderCustomerServiceReportHtml(report, empty), /No technical observations were selected/);
});

test('Lighthouse numeric score zero is distinct from unscored manual zero and null', () => {
  const value = fixture();
  value.sources.lighthouse.observations[0].score = 0;
  value.sources.lighthouse.observations[1].score = 0;
  value.sources.lighthouse.observations[1].scoreDisplayMode = 'manual';
  refold(value);
  const annex = composeSiteAuditAnnex(report, bytes(value), config, [
    { provider: 'lighthouse', code: 'document-title' },
    { provider: 'lighthouse', code: 'first-contentful-paint' },
  ]);
  assert.equal(annex.selected[0]!.sourceScore, 0);
  assert.equal(annex.selected[1]!.sourceScore, null);
  const html = renderCustomerServiceReportHtml(report, annex);
  assert.match(html, /n\/a — unscored \/ unavailable/);
  assert.doesNotMatch(html, /universal health|automated priority/i);
});

test('notApplicable/missing source times are preserved as unscored/unknown, not passes', () => {
  const value = fixture();
  value.sources.siteone.executedAt = null;
  value.sources.lighthouse.fetchTime = null;
  value.sources.lighthouse.observations[0].scoreDisplayMode = 'notApplicable';
  value.sources.lighthouse.observations[0].score = null;
  refold(value);
  const annex = composeSiteAuditAnnex(report, bytes(value), config, [
    { provider: 'lighthouse', code: 'document-title' },
  ]);
  assert.equal(annex.sources[0]!.reportedAt, null);
  assert.equal(annex.sources[1]!.reportedAt, null);
  assert.equal(annex.selected[0]!.sourceScore, null);
  assert.match(renderCustomerServiceReportHtml(report, annex), /not supplied/);
});

test('adversarial WQT source title is bounded and HTML-escaped in the existing CSP report', () => {
  const value = fixture();
  const hostile = '</td><ScRiPt>alert(1)</ScRiPt><img src=x onerror=alert(1)>'.repeat(20);
  value.sources.lighthouse.observations[0].title = hostile;
  refold(value);
  const annex = composeSiteAuditAnnex(report, bytes(value), config, [
    { provider: 'lighthouse', code: 'document-title' },
  ]);
  assert.ok((annex.selected[0]!.sourceText?.length ?? 0) <= 241);
  const html = renderCustomerServiceReportHtml(report, annex);
  assert.ok(html.includes('&lt;ScRiPt&gt;'));
  assert.equal(html.toLowerCase().includes('<script'), false);
  assert.equal(html.toLowerCase().includes('<img '), false);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'none'/);
});

test('report site and origin must match separately issued trusted WQT authority', () => {
  assert.throws(
    () => composeSiteAuditAnnex(
      { ...report, context: { ...report.context, siteId: 'site-beta' } },
      bytes(fixture()), config, select),
    /scope/,
  );
  assert.throws(
    () => composeSiteAuditAnnex(
      { ...report, context: { ...report.context, target: 'https://wrong.example' } },
      bytes(fixture()), config, select),
    /scope/,
  );
  const bad = fixture();
  bad.siteId = 'other-site';
  assert.throws(() => composeSiteAuditAnnex(report, bytes(bad), config, select),
    (error: unknown) => error instanceof WqtAdapterError && error.code === 'configuration_mismatch');
});

test('exact human selections reject unknown, duplicate, extra keys and >3 without automatic priorities', () => {
  assert.equal(MAX_SITE_AUDIT_SELECTIONS, 3);
  const value = bytes(fixture());
  for (const selections of [
    [...select, select[0]!],
    [...select, { provider: 'lighthouse', code: 'document-title' }, select[0]!],
    [{ provider: 'lighthouse', code: 'missing-audit' }],
    [{ provider: 'siteone', code: 'redirects', priority: 1 }],
  ]) {
    assert.throws(() => composeSiteAuditAnnex(report, value, config, selections as any));
  }
  assert.equal(composeSiteAuditAnnex(report, value, config, select).selected.length, 2);
});

test('unavailable WQT provider cannot be promoted to observed audit evidence', () => {
  const unavailable: WqtAdapterConfig = {
    ...config,
    availability: { ...config.availability, lighthouse: { state: 'unavailable', reference: 'synthetic-missing-source' } },
  };
  assert.throws(() => composeSiteAuditAnnex(report, bytes(fixture()), unavailable, select), /unavailable/);
  const annex = composeSiteAuditAnnex(report, bytes(fixture()), unavailable, [
    { provider: 'siteone', code: 'redirects' },
  ]);
  assert.equal(annex.sources[1]!.availability, 'unavailable');
  assert.equal(annex.selected.length, 1);
});

test('malformed, blocked, old or tampered evidence fails closed; altered original bytes change annex identity', () => {
  const data = fixture();
  const first = composeSiteAuditAnnex(report, bytes(data), config, select);
  data.sources.siteone.observations[0].message += ' synthetic change';
  refold(data);
  const second = composeSiteAuditAnnex(report, bytes(data), config, select);
  assert.notEqual(second.inputSha256, first.inputSha256);
  assert.notEqual(second.id, first.id);

  const old = fixture();
  old.schemaMinorVersion = 2;
  assert.throws(() => composeSiteAuditAnnex(report, bytes(old), config, select), /minor3/);
  assert.throws(() => composeSiteAuditAnnex(report, Buffer.from('{"status":403}'), config, select),
    (error: unknown) => error instanceof WqtAdapterError);
  assert.throws(() => composeSiteAuditAnnex(report, Buffer.from('malformed JSON'), config, select),
    (error: unknown) => error instanceof WqtAdapterError);
});

test('HTML renderer refuses an annex for another report, even with matching site and target', () => {
  const annex = composeSiteAuditAnnex(report, bytes(fixture()), config, select);
  assert.throws(
    () => renderCustomerServiceReportHtml({ ...report, id: 'customer-report:' + 'b'.repeat(64) }, annex),
    /not bound/,
  );
  assert.throws(
    () => renderCustomerServiceReportHtml(report, { ...annex, inputSha256: 'bad' }),
    /not bound/,
  );
});
