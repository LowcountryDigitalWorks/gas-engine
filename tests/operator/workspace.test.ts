import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import {
  MAX_OPERATOR_WORKSPACE_JSON_BYTES,
  OperatorWorkspaceError,
  prepareOperatorWorkspace,
  serializeOperatorWorkspaceJson,
  type OperatorWorkspace,
  type OperatorWorkspaceRequest,
} from '../../src/operator/workspace.js';
import {
  applyOperatorWorkspaceAction,
  createOperatorActionArtifact,
  parseOperatorActionArtifact,
} from '../../src/operator/workspace-action.js';
import { renderOperatorWorkspaceHtml } from '../../src/operator/workspace-html.js';
import {
  composeCustomerServiceReport,
  MAX_CUSTOMER_REPORT_PRIMARY_ITEMS,
  parseCustomerReportRequest,
} from '../../src/operator/customer-report.js';
import { renderCustomerServiceReportHtml } from '../../src/operator/customer-report-html.js';
import {
  classifyOperatorRuntimeError,
  executeOperatorWorkspaceCommand,
} from '../../src/operator/workspace-entrypoint.js';
import { ReviewRevisionConflictError } from '../../src/review/errors.js';
import { alpha, beta } from '../persistence/helpers.js';
import { serviceBriefScope } from './service-brief-fixtures.js';
import { decisionCycleFixture } from './decision-cycle-support.js';

function workspaceRequest(fixture: Awaited<ReturnType<typeof decisionCycleFixture>>): OperatorWorkspaceRequest {
  return {
    serviceBriefRequest: fixture.serviceBriefRequest,
    decisionCycleInput: fixture.input,
    generatedAt: '2026-10-01T21:00:00.000Z',
    evaluatedAt: '2026-10-01T20:55:00.000Z',
    policy: {
      id: 'release-017-workspace-policy',
      version: '1.0.0',
      maxTimelineEntries: 128,
      maxAttentionRows: 128,
      maxEvidenceRows: 256,
    },
  };
}

function reportRequest(workspace: OperatorWorkspace, selectedAttentionIds: string[]) {
  return {
    version: '0.17.0' as const,
    requestId: 'release-017-report-request',
    createdAt: '2026-10-01T21:05:00.000Z',
    workspaceId: workspace.id,
    sourceBriefId: workspace.source.serviceBriefId,
    ...(workspace.source.decisionCycleDossierId === undefined
      ? {}
      : { sourceDossierId: workspace.source.decisionCycleDossierId }),
    title: 'Synthetic example.test service report',
    executiveSummary: 'Human-authored synthetic summary describing accepted evidence without automatic ranking.',
    selectedAttentionIds,
    observedChanges: ['Human observed one bounded synthetic search-visibility change.'],
    nextReview: 'Review the exact same-source follow-up evidence after the declared measurement window.',
    includeInternalAppendix: false,
  };
}

test('Release 0.17 workspace recomputes accepted sources and has deterministic semantic identity', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = workspaceRequest(fixture);
  const first = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);
  const second = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);

  assert.equal(first.id, second.id);
  assert.equal(first.source.serviceBriefId, fixture.dossier.sourceServiceBrief.id);
  assert.equal(first.source.decisionCycleDossierId, fixture.dossier.id);
  assert.deepEqual(first.scope, serviceBriefScope);
  assert.equal(first.navigation.attention.semantics, 'human_review_selection_not_priority');
  assert.equal(
    first.navigation.overview.evidenceStateCounts.reduce((total, entry) => total + entry.count, 0),
    first.evidenceRows.length,
  );
  assert.equal(
    first.evidenceRows.every((row) => Array.isArray(row.providerIds)),
    true,
  );
  assert.equal(first.decisionCycle?.recordedMeasurements.length, 0);
  assert.equal(Buffer.byteLength(serializeOperatorWorkspaceJson(first), 'utf8') <= MAX_OPERATOR_WORKSPACE_JSON_BYTES, true);

  const changed = await prepareOperatorWorkspace(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    { ...request, generatedAt: '2026-10-01T21:01:00.000Z' },
  );
  assert.notEqual(changed.id, first.id);

  const before = serializeOperatorWorkspaceJson(first);
  renderOperatorWorkspaceHtml(first);
  assert.equal(serializeOperatorWorkspaceJson(first), before, 'presentation rendering must not mutate semantic workspace state');

  await assert.rejects(
    prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, beta, request),
  );
});

test('Release 0.17 action artifacts cannot mint authority and stale bindings fail before write', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = workspaceRequest(fixture);
  const workspace = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);
  const valid = createOperatorActionArtifact(
    workspace,
    'release-017-commit-recommendation',
    '2026-10-01T21:06:00.000Z',
    { type: 'commit_recommendation' },
  );

  assert.throws(
    () => parseOperatorActionArtifact({ ...valid, tenantContext: { tenantId: serviceBriefScope.tenantId } }),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'invalid_request',
  );

  await assert.rejects(
    applyOperatorWorkspaceAction(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      { ...valid, workspaceId: 'workspace:' + '0'.repeat(64) },
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_workspace',
  );
  await assert.rejects(
    applyOperatorWorkspaceAction(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      { ...valid, sourceBriefId: 'service-brief:stale' },
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_source',
  );
  await assert.rejects(
    applyOperatorWorkspaceAction(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      { ...valid, sourceDossierId: 'decision-cycle:stale' },
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_source',
  );

  const before = await fixture.prepared.review.getCurrentRecommendation(
    alpha,
    serviceBriefScope,
    fixture.recommendation.id,
  );
  assert.equal(before, null);

  await assert.rejects(
    applyOperatorWorkspaceAction(
      fixture.prepared.evidence,
      fixture.prepared.review,
      beta,
      request,
      valid,
    ),
  );
  const after = await fixture.prepared.review.getCurrentRecommendation(
    alpha,
    serviceBriefScope,
    fixture.recommendation.id,
  );
  assert.equal(after, null, 'cross-tenant action must not persist into the authorized tenant');
});

test('Release 0.17 delegates writes to accepted 0.16 and enforces exact current measurement identity', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = workspaceRequest(fixture);
  let workspace = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);

  workspace = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    createOperatorActionArtifact(
      workspace,
      'release-017-create-recommendation',
      '2026-10-01T21:06:00.000Z',
      { type: 'commit_recommendation' },
    ),
  );
  assert.equal(workspace.decisionCycle?.recommendation?.current?.id, fixture.recommendation.id);

  const current = workspace.decisionCycle?.recommendation?.current;
  assert.ok(current);
  const staleTransition = createOperatorActionArtifact(
    workspace,
    'release-017-stale-transition',
    '2026-10-01T21:07:00.000Z',
    {
      type: 'transition_recommendation',
      input: {
        scope: serviceBriefScope,
        id: current.id,
        expectedCurrentRevision: current.revision + 10,
        lifecycle: 'in_review',
        updatedAt: '2026-10-01T21:07:00.000Z',
      },
    },
  );
  await assert.rejects(
    applyOperatorWorkspaceAction(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      staleTransition,
    ),
    (error: unknown) => error instanceof ReviewRevisionConflictError,
  );

  const plan = workspace.decisionCycle?.measurementPlan;
  assert.ok(plan);
  const badMeasurement = createOperatorActionArtifact(
    workspace,
    'release-017-bad-measurement',
    '2026-10-01T21:08:00.000Z',
    {
      type: 'commit_measurement',
      role: 'baseline',
      expectedMeasurementId: 'not-the-current-prepared-measurement',
    },
  );
  await assert.rejects(
    applyOperatorWorkspaceAction(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      badMeasurement,
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_source',
  );

  const goodMeasurement = createOperatorActionArtifact(
    workspace,
    'release-017-tampered-measurement',
    '2026-10-01T21:08:30.000Z',
    {
      type: 'commit_measurement',
      role: 'baseline',
      expectedMeasurementId: plan.baseline.measurement.id,
    },
  );
  assert.throws(
    () => parseOperatorActionArtifact({
      ...goodMeasurement,
      action: {
        ...goodMeasurement.action,
        measurement: { result: { state: 'measured', observations: [{ forged: true }] } },
      },
    }),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'invalid_request',
  );

  workspace = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    createOperatorActionArtifact(
      workspace,
      'release-017-baseline',
      '2026-10-01T21:09:00.000Z',
      {
        type: 'commit_measurement',
        role: 'baseline',
        expectedMeasurementId: plan.baseline.measurement.id,
      },
    ),
  );
  assert.deepEqual(
    workspace.decisionCycle?.recordedMeasurements.map((record) => record.id),
    [plan.baseline.measurement.id],
  );
});

test('Release 0.17 action and entrypoint errors stay bounded and distinguishable', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = workspaceRequest(fixture);
  const workspace = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);
  const huge = createOperatorActionArtifact(
    workspace,
    'release-017-bounded-action',
    '2026-10-01T21:10:00.000Z',
    { type: 'commit_outcome', outcome: { note: 'x' } },
  ) as any;
  huge.action.outcome.note = 'x'.repeat(300_000);
  assert.throws(
    () => parseOperatorActionArtifact(huge),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'bound_exceeded',
  );

  await assert.rejects(
    executeOperatorWorkspaceCommand(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      { type: 'unknown', workspaceRequest: request },
    ),
    (error: unknown) =>
      error instanceof OperatorWorkspaceError
      && classifyOperatorRuntimeError(error) === 'invalid_input',
  );
});

test('Release 0.17 customer report is human-selected <=3, deterministic and customer-safe by default', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = workspaceRequest(fixture);
  const workspace = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);
  assert.ok(workspace.attention.length >= 1);

  const selected = workspace.attention.slice(0, Math.min(2, workspace.attention.length)).map((item) => item.id).reverse();
  const first = await composeCustomerServiceReport(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    reportRequest(workspace, selected),
  );
  const second = await composeCustomerServiceReport(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    reportRequest(workspace, selected),
  );
  assert.equal(first.id, second.id);
  assert.equal(first.focusItems.length, selected.length);
  assert.equal(MAX_CUSTOMER_REPORT_PRIMARY_ITEMS, 3);
  assert.equal(first.internalAppendix, undefined);

  const expectedLabels = selected.map((id) => {
    const item = workspace.attention.find((entry) => entry.id === id)!;
    return item.identity.url
      ?? item.identity.query
      ?? (item.identity.promptId === undefined ? undefined : 'AI visibility prompt evidence')
      ?? (item.identity.cohortHash === undefined ? undefined : 'AI visibility cohort evidence')
      ?? item.moduleId.replaceAll('_', ' ') + ' evidence';
  });
  assert.deepEqual(first.focusItems.map((item) => item.label), expectedLabels, 'human selection order is preserved without G.A.S. ranking');

  const changed = await composeCustomerServiceReport(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    { ...reportRequest(workspace, selected), executiveSummary: 'A materially different human-authored summary.' },
  );
  assert.notEqual(changed.id, first.id);

  const html = renderCustomerServiceReportHtml(first);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.equal(html.includes(workspace.id), false);
  assert.equal(html.includes(workspace.source.serviceBriefId), false);
  if (workspace.source.decisionCycleDossierId !== undefined) {
    assert.equal(html.includes(workspace.source.decisionCycleDossierId), false);
  }

  assert.throws(
    () => parseCustomerReportRequest({
      ...reportRequest(workspace, selected),
      selectedAttentionIds: ['a', 'b', 'c', 'd'],
    }),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'invalid_request',
  );
});

test('Release 0.17 customer report selections and source bindings fail closed', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = workspaceRequest(fixture);
  const workspace = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);
  const selected = [workspace.attention[0]!.id];

  await assert.rejects(
    composeCustomerServiceReport(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      { ...reportRequest(workspace, selected), workspaceId: 'workspace:' + 'f'.repeat(64) },
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_workspace',
  );

  await assert.rejects(
    composeCustomerServiceReport(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      { ...reportRequest(workspace, selected), selectedAttentionIds: ['not-current-attention'] },
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_source',
  );
});

test('Release 0.17 browser workbench escapes dynamic content and exposes no network or authoritative storage path', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const attacked = structuredClone(fixture.input) as any;
  attacked.decision.summary = '"><img src=x onerror="alert(1)"><script>alert(1)</script>';
  const request = {
    ...workspaceRequest(fixture),
    decisionCycleInput: attacked,
  };
  const workspace = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);
  const html = renderOperatorWorkspaceHtml(workspace);

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /script-src 'sha256-/);
  assert.match(html, /focus-visible/);
  assert.match(html, /<nav aria-label="Workspace sections">/);
  assert.match(html, /id="evidence-provider"/);
  assert.match(html, /Evidence state counts/);
  assert.match(html, /Source \/ method manifest/);
  assert.match(html, /<th scope="col">/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<img\s+src=x/i);

  const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(scriptMatch);
  const script = scriptMatch[1]!;
  assert.doesNotMatch(script, /\bfetch\s*\(/);
  assert.doesNotMatch(script, /XMLHttpRequest|WebSocket|EventSource|serviceWorker/);
  assert.doesNotMatch(script, /localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.doesNotMatch(script, /\.innerHTML\b|\beval\s*\(|new\s+Function\b/);
  assert.match(script, /textContent/);
  assert.match(script, /new Blob/);
});

test('Release 0.17 surfaces retain no schema, migration, runtime dependency, provider network, AI, Issue #49/#56 or 1.0 path under the current package', () => {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    version: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  assert.equal(packageJson.version, '0.20.0');
  assert.deepEqual(packageJson.dependencies, { zod: '4.6.2' });
  assert.deepEqual(packageJson.devDependencies, {
    '@types/node': '24.13.4',
    typescript: '7.0.2',
  });

  const sources = [
    'src/operator/workspace.ts',
    'src/operator/workspace-action.ts',
    'src/operator/workspace-html.ts',
    'src/operator/customer-report.ts',
    'src/operator/customer-report-html.ts',
    'src/operator/workspace-entrypoint.ts',
  ].map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO/i);
  assert.doesNotMatch(sources, /from ['"].*(?:sqlite|migrations)/i);
  assert.doesNotMatch(sources, /\b(?:OpenAI|Anthropic|embedding|BYOK)\b/i);
  assert.doesNotMatch(sources, /from ['"](?:node:http|node:https|node:net|undici|axios)/i);
  assert.doesNotMatch(sources, /\bfetch\s*\(/);
  assert.doesNotMatch(sources, /Issue\s*#(?:49|56)|Release\s+1\.0/i);
});

test('Release 0.17 report request with optional internal appendix stays explicitly separated', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = workspaceRequest(fixture);
  const workspace = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);
  const selected = [workspace.attention[0]!.id];
  const report = await composeCustomerServiceReport(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    { ...reportRequest(workspace, selected), includeInternalAppendix: true },
  );
  assert.equal(report.internalAppendix?.workspaceId, workspace.id);
  const html = renderCustomerServiceReportHtml(report);
  assert.match(html, /LDW internal appendix/);
  assert.match(html, /remove before customer delivery/i);
  assert.equal(html.includes(workspace.id), true);
});

test('Release 0.17 accepted Release 0.16 outcome constraints remain authoritative through action apply', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = workspaceRequest(fixture);
  let workspace = await prepareOperatorWorkspace(fixture.prepared.evidence, fixture.prepared.review, alpha, request);
  workspace = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    createOperatorActionArtifact(
      workspace,
      'release-017-rec-for-outcome',
      '2026-10-01T21:11:00.000Z',
      { type: 'commit_recommendation' },
    ),
  );
  const plan = workspace.decisionCycle!.measurementPlan!;
  workspace = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    createOperatorActionArtifact(
      workspace,
      'release-017-baseline-for-outcome',
      '2026-10-01T21:12:00.000Z',
      { type: 'commit_measurement', role: 'baseline', expectedMeasurementId: plan.baseline.measurement.id },
    ),
  );
  workspace = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    createOperatorActionArtifact(
      workspace,
      'release-017-followup-for-outcome',
      '2026-10-01T21:13:00.000Z',
      { type: 'commit_measurement', role: 'follow_up', expectedMeasurementId: plan.followUp.measurement.id },
    ),
  );

  const outcome: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'release-017-human-outcome',
    scope: structuredClone(serviceBriefScope),
    recommendationId: fixture.recommendation.id,
    assessment: {
      direction: 'unchanged',
      measurements: [
        { scope: structuredClone(serviceBriefScope), id: plan.baseline.measurement.id },
        { scope: structuredClone(serviceBriefScope), id: plan.followUp.measurement.id },
      ],
      comparability: 'comparable',
      rationale: 'Human explicitly declares unchanged; Release 0.17 does not infer direction.',
    },
    attribution: {
      strength: 'technical_verification',
      basis: 'Synthetic verification only; no causal claim.',
    },
    createdAt: '2026-10-01T21:14:00.000Z',
  };
  const final = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    createOperatorActionArtifact(
      workspace,
      'release-017-outcome',
      '2026-10-01T21:14:00.000Z',
      { type: 'commit_outcome', outcome },
    ),
  );
  assert.equal(final.decisionCycle?.readiness.state, 'outcome_recorded');
  assert.equal(final.decisionCycle?.humanOutcomes[0]?.assessment.direction, 'unchanged');
});