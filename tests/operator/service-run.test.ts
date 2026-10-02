import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  composeManagedServiceRunPackage,
  ManagedServiceRunError,
  MANAGED_SERVICE_RUN_VERSION,
  parseManagedServiceRunRequest,
  parseServiceRunSourceReceipt,
  prepareManagedServiceRun,
  serializeManagedServiceRunJson,
  summarizeManagedServiceRun,
  type ManagedServiceRunSummary,
} from '../../src/operator/service-run.js';
import {
  prepareOperatorWorkspace,
  type OperatorWorkspace,
  type OperatorWorkspaceRequest,
} from '../../src/operator/workspace.js';
import {
  serializeCustomerServiceReportJson,
} from '../../src/operator/customer-report.js';
import { renderCustomerServiceReportHtml } from '../../src/operator/customer-report-html.js';
import { commitDecisionRecommendation } from '../../src/operator/decision-cycle.js';
import { alpha } from '../persistence/helpers.js';
import { decisionCycleFixture } from './decision-cycle-support.js';

function workspaceRequest(
  fixture: Awaited<ReturnType<typeof decisionCycleFixture>>,
): OperatorWorkspaceRequest {
  return {
    serviceBriefRequest: fixture.serviceBriefRequest,
    decisionCycleInput: fixture.input,
    generatedAt: '2026-10-02T13:00:00.000Z',
    evaluatedAt: '2026-10-02T12:55:00.000Z',
    policy: {
      id: 'release-018-workspace-policy',
      version: '1.0.0',
      maxTimelineEntries: 128,
      maxAttentionRows: 128,
      maxEvidenceRows: 256,
    },
  };
}

function receipts(state: 'supplied' | 'not_supplied' = 'supplied') {
  return [
    {
      id: 'wqt-normalized',
      sourceFamily: 'website_quality',
      state,
      ...(state === 'supplied'
        ? {
            artifactLabel: 'synthetic-wqt-normalized.json',
            sha256: 'a'.repeat(64),
            byteCount: 1234,
            sourceWindow: {
              start: '2026-10-01T00:00:00.000Z',
              end: '2026-10-01T00:05:00.000Z',
            },
            collectedAt: '2026-10-01T00:06:00.000Z',
            receivedAt: '2026-10-01T00:07:00.000Z',
            adapter: { id: 'ldw-wqt-normalized', version: '3.0.0' },
            sourceSchema: { id: 'ldw.website-quality', version: 'v1.3' },
          }
        : {}),
      limitations: ['Operational receipt only; authoritative readiness remains in the recomputed workspace.'],
    },
    {
      id: 'analytics-export',
      sourceFamily: 'search_analytics',
      state: 'unavailable' as const,
      limitations: ['Synthetic provider export intentionally unavailable for this run.'],
    },
    {
      id: 'manual-context',
      sourceFamily: 'manual_context',
      state: 'not_supplied' as const,
      limitations: [],
    },
  ];
}

function reportRequest(workspace: OperatorWorkspace) {
  const selected = workspace.attention.slice(0, Math.min(2, workspace.attention.length)).map((item) => item.id);
  assert.ok(selected.length > 0);
  return {
    version: '0.17.0' as const,
    requestId: 'release-018-customer-report',
    createdAt: '2026-10-02T13:10:00.000Z',
    workspaceId: workspace.id,
    sourceBriefId: workspace.source.serviceBriefId,
    ...(workspace.source.decisionCycleDossierId === undefined
      ? {}
      : { sourceDossierId: workspace.source.decisionCycleDossierId }),
    title: 'Synthetic example.test managed-service review',
    executiveSummary: 'Human-authored synthetic summary for Release 0.18 package regression.',
    selectedAttentionIds: selected,
    observedChanges: ['Human reviewed the current accepted evidence and recorded this synthetic note.'],
    nextReview: 'Review the next exact same-source evidence window when available.',
    includeInternalAppendix: false,
  };
}

function runRequest(
  fixture: Awaited<ReturnType<typeof decisionCycleFixture>>,
  options: {
    priorRun?: ManagedServiceRunSummary;
    reportRequest?: unknown;
    receiptState?: 'supplied' | 'not_supplied';
  } = {},
) {
  return {
    workspaceRequest: workspaceRequest(fixture),
    generatedAt: '2026-10-02T13:15:00.000Z',
    runPeriod: {
      start: '2026-10-01T00:00:00.000Z',
      end: '2026-10-02T12:55:00.000Z',
    },
    policy: {
      id: 'release-018-run-policy',
      version: '1.0.0',
      maxReceipts: 16,
      maxPriorAttentionIds: 128,
    },
    receipts: receipts(options.receiptState),
    ...(options.priorRun === undefined ? {} : { priorRun: options.priorRun }),
    ...(options.reportRequest === undefined ? {} : { customerReportRequest: options.reportRequest }),
  };
}

test('Release 0.18 source receipts are strict operational provenance and cannot mint authority/readiness', () => {
  const valid = receipts()[0]!;
  const parsed = parseServiceRunSourceReceipt(valid);
  assert.equal(parsed.state, 'supplied');

  assert.throws(
    () => parseServiceRunSourceReceipt({ ...valid, scope: { tenantId: 'x', siteId: 'y', siteScopeRevisionId: 'z' } }),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'invalid_request',
  );
  assert.throws(
    () => parseServiceRunSourceReceipt({ ...valid, tenantContext: { tenantId: 'tenant-alpha' } }),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'invalid_request',
  );
  assert.throws(
    () => parseServiceRunSourceReceipt({ ...valid, readiness: 'ready' }),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'invalid_request',
  );
});

test('Release 0.18 recomputes authoritative Release 0.17 workspace and semantic changes alter run identity', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = runRequest(fixture);
  const first = await prepareManagedServiceRun(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
  );
  const directWorkspace = await prepareOperatorWorkspace(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    workspaceRequest(fixture),
  );
  assert.equal(first.run.workspaceId, directWorkspace.id);
  assert.deepEqual(first.run.readiness, directWorkspace.readiness);
  assert.equal(first.run.followUp.readiness, directWorkspace.decisionCycle?.readiness.state);

  assert.throws(
    () => parseManagedServiceRunRequest({ ...request, workspace: directWorkspace }),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'invalid_request',
  );

  await commitDecisionRecommendation(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
  );
  const second = await prepareManagedServiceRun(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
  );
  assert.notEqual(second.run.workspaceId, first.run.workspaceId);
  assert.notEqual(second.run.id, first.run.id);

  const changedReceipt = await prepareManagedServiceRun(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    runRequest(fixture, { receiptState: 'not_supplied' }),
  );
  assert.notEqual(changedReceipt.run.id, second.run.id);
  assert.match(serializeManagedServiceRunJson(changedReceipt.run), /managed-service-run:/);
});

test('Release 0.18 prior-run comparison is exact, neutral, and fails closed on scope/target mismatch', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const first = await prepareManagedServiceRun(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    runRequest(fixture),
  );
  const baseSummary = summarizeManagedServiceRun(first.run);
  assert.equal(baseSummary.version, MANAGED_SERVICE_RUN_VERSION);

  const prior = structuredClone(baseSummary);
  const removed = prior.attentionIds.shift();
  assert.ok(removed);
  prior.attentionIds.push('synthetic-prior-only-attention');

  const current = await prepareManagedServiceRun(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    runRequest(fixture, { priorRun: prior, receiptState: 'not_supplied' }),
  );
  const continuity = current.run.priorComparison?.attention;
  assert.ok(continuity);
  assert.ok(continuity.some((entry) =>
    entry.attentionId === removed && entry.state === 'new_in_current'));
  assert.ok(continuity.some((entry) =>
    entry.attentionId === 'synthetic-prior-only-attention'
    && entry.state === 'not_present_in_current'));
  assert.doesNotMatch(JSON.stringify(current.run.priorComparison), /resolved|fixed|improved/i);
  assert.ok(current.run.priorComparison?.receipts.some((entry) =>
    entry.receiptId === 'wqt-normalized' && entry.changed));

  const wrongScope = structuredClone(baseSummary);
  wrongScope.scope.siteId = 'other-site';
  await assert.rejects(
    prepareManagedServiceRun(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      runRequest(fixture, { priorRun: wrongScope }),
    ),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'scope_mismatch',
  );

  const wrongTarget = structuredClone(baseSummary);
  wrongTarget.trustedTarget = 'https://other.example.test';
  await assert.rejects(
    prepareManagedServiceRun(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      runRequest(fixture, { priorRun: wrongTarget }),
    ),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'target_mismatch',
  );
});

test('Release 0.18 reuses the accepted Release 0.17 report model/renderer and packages exact bytes', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const workspace = await prepareOperatorWorkspace(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    workspaceRequest(fixture),
  );
  const request = runRequest(fixture, { reportRequest: reportRequest(workspace) });
  const pkg = await composeManagedServiceRunPackage(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
  );
  assert.ok(pkg.report);
  assert.equal(pkg.report.version, '0.17.0');
  assert.equal(pkg.run.customerReport.state, 'present');
  assert.equal(pkg.run.customerReport.reportId, pkg.report.id);
  assert.equal(pkg.report.focusItems.length <= 3, true);

  const reportJson = pkg.files.find((file) => file.role === 'customer_report_json');
  const reportHtml = pkg.files.find((file) => file.role === 'customer_report_html');
  assert.ok(reportJson);
  assert.ok(reportHtml);
  assert.equal(reportJson.content, serializeCustomerServiceReportJson(pkg.report));
  assert.equal(reportHtml.content, renderCustomerServiceReportHtml(pkg.report));
  assert.equal(reportJson.classification, 'customer_safe');
  assert.equal(reportHtml.classification, 'customer_safe');

  for (const entry of pkg.manifest.entries) {
    const file = pkg.files.find((candidate) => candidate.filename === entry.filename);
    assert.ok(file);
    assert.equal(entry.byteCount, Buffer.byteLength(file.content, 'utf8'));
    assert.equal(entry.sha256, createHash('sha256').update(file.content, 'utf8').digest('hex'));
    assert.equal(entry.source.runId, pkg.run.id);
    assert.equal(entry.source.workspaceId, pkg.workspace.id);
  }
  assert.equal(pkg.manifest.runId, pkg.run.id);
  assert.equal(pkg.manifest.workspaceId, pkg.workspace.id);
  assert.doesNotMatch(pkg.manifestJson, /\/tmp\/|[A-Z]:\\/i);
});

test('Release 0.18 run/package bounds fail closed with no receipt truncation', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = runRequest(fixture);
  const overPolicy = {
    ...request,
    policy: { ...request.policy, maxReceipts: 1 },
  };
  assert.throws(
    () => parseManagedServiceRunRequest(overPolicy),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'bound_exceeded',
  );

  const hugeReceipts = Array.from({ length: 30 }, (_, index) => ({
    id: `receipt-${index}`,
    sourceFamily: 'synthetic',
    state: 'not_supplied',
    limitations: Array.from({ length: 16 }, () => 'x'.repeat(2_000)),
  }));
  assert.throws(
    () => parseManagedServiceRunRequest({
      ...request,
      policy: { ...request.policy, maxReceipts: 64 },
      receipts: hugeReceipts,
    }),
    (error: unknown) => error instanceof ManagedServiceRunError && error.code === 'bound_exceeded',
  );

  const pkg = await composeManagedServiceRunPackage(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
  );
  assert.equal(pkg.run.receipts.length, request.receipts.length);
  assert.equal(pkg.files.some((file) => file.filename === 'service-run.json'), true);
  assert.equal(pkg.manifest.entries.length, pkg.files.length);
});

test('Release 0.18 adds no schema/migration/network/cloud/AI/private runtime/dependency expansion', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    version: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.equal(packageJson.version, '0.18.0');
  assert.deepEqual(packageJson.dependencies, { zod: '4.6.2' });
  assert.deepEqual(packageJson.devDependencies, {
    '@types/node': '24.13.4',
    typescript: '7.0.2',
  });

  const production = [
    readFileSync('src/operator/service-run.ts', 'utf8'),
    readFileSync('src/adapters/wqt.ts', 'utf8'),
  ].join('\n');
  assert.doesNotMatch(production, /CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO/i);
  assert.doesNotMatch(production, /from ['"]node:(?:http|https|net|tls|dns|dgram|child_process|worker_threads)['"]/);
  assert.doesNotMatch(production, /\bfetch\s*\(/);
  assert.doesNotMatch(production, /OAuth|API[_ -]?key|credential|Activepieces|SuiteDash/i);
  assert.doesNotMatch(production, /OpenAI|Anthropic|embedding|BYOK/i);
  assert.doesNotMatch(production, /wqt-operations|ldw\.gas-wqt-semantic-change\.v1/i);
  assert.doesNotMatch(production, /Issue\s*#(?:49|56|63)|Release\s+0\.19|Release\s+1\.0/i);
});
