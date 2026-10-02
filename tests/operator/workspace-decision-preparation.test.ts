import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import { parseDecisionCycleRequest } from '../../src/operator/decision-cycle.js';
import {
  applyOperatorWorkspaceAction,
  createOperatorActionArtifact,
  parseOperatorActionArtifact,
  prepareOperatorWorkspaceDecision,
} from '../../src/operator/workspace-action.js';
import { renderOperatorWorkspaceHtml } from '../../src/operator/workspace-html.js';
import {
  OperatorWorkspaceError,
  prepareOperatorWorkspace,
  type OperatorWorkspace,
  type OperatorWorkspaceRequest,
} from '../../src/operator/workspace.js';
import { parseCustomerReportRequest } from '../../src/operator/customer-report.js';
import { alpha, beta } from '../persistence/helpers.js';
import { serviceBriefScope } from './service-brief-fixtures.js';
import { decisionCycleFixture } from './decision-cycle-support.js';

function baseWorkspaceRequest(
  fixture: Awaited<ReturnType<typeof decisionCycleFixture>>,
  includeDecisionCycle = true,
): OperatorWorkspaceRequest {
  return {
    serviceBriefRequest: fixture.serviceBriefRequest,
    ...(includeDecisionCycle ? { decisionCycleInput: fixture.input } : {}),
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

function prepareAction(
  workspace: OperatorWorkspace,
  selectedAttentionIds: string[],
  disposition: 'investigate' | 'recommend' | 'defer' | 'dismiss' = 'investigate',
  maxSelectedAttentionItems = 8,
) {
  return createOperatorActionArtifact(
    workspace,
    'release-017-human-decision',
    '2026-10-01T21:20:00.000Z',
    {
      type: 'prepare_decision',
      selectedAttentionIds,
      decision: {
        id: 'release-017-human-decision',
        disposition,
        summary: 'Explicit human decision summary supplied through the Release 0.17 browser request seam.',
        recordedAt: '2026-10-01T21:20:00.000Z',
      },
      policy: {
        id: 'decision-cycle-policy',
        version: '1.0.0',
        maxSelectedAttentionItems,
      },
      generatedAt: '2026-10-01T21:20:00.000Z',
      evaluatedAt: '2026-10-01T20:55:00.000Z',
    },
  );
}

async function ledgerCounts(fixture: Awaited<ReturnType<typeof decisionCycleFixture>>) {
  const [recommendations, measurements, outcomes] = await Promise.all([
    fixture.prepared.review.listCurrentRecommendations(alpha, { scope: serviceBriefScope }),
    fixture.prepared.review.listMeasurements(alpha, { scope: serviceBriefScope }),
    fixture.prepared.review.listOutcomes(alpha, { scope: serviceBriefScope }),
  ]);
  return {
    recommendations: recommendations.length,
    measurements: measurements.length,
    outcomes: outcomes.length,
  };
}

test('Release 0.17 prepares a new human decision from exact Attention selection without durable writes', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = baseWorkspaceRequest(fixture, false);
  const initial = await prepareOperatorWorkspace(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
  );
  assert.equal(initial.decisionCycle, undefined);
  assert.ok(initial.attention.length >= 2);

  const selected = [initial.attention[1]!.id, initial.attention[0]!.id];
  const before = await ledgerCounts(fixture);
  const result = await prepareOperatorWorkspaceDecision(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    prepareAction(initial, selected),
  );
  const after = await ledgerCounts(fixture);
  assert.deepEqual(after, before, 'decision preparation must not persist recommendation, measurement, or outcome state');

  const nextCycle = parseDecisionCycleRequest(result.nextWorkspaceRequest.decisionCycleInput);
  assert.deepEqual(nextCycle.selectedAttentionIds, selected, 'exact browser-selected Attention IDs must become the decision request selection');
  assert.equal(nextCycle.decision.disposition, 'investigate');
  assert.equal(nextCycle.decision.summary, 'Explicit human decision summary supplied through the Release 0.17 browser request seam.');
  assert.equal(result.workspace.decisionCycle?.decision.disposition, 'investigate');
  assert.equal(result.workspace.decisionCycle?.decision.summary, nextCycle.decision.summary);
  assert.equal(result.workspace.source.decisionCycleDossierId, result.workspace.decisionCycle?.id);
  assert.equal(result.workspace.navigation.attention.semantics, 'human_review_selection_not_priority');

  const html = renderOperatorWorkspaceHtml(initial);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  assert.match(html, /Prepare \/ update human decision request/);
  assert.match(html, /Human review choice — not G\.A\.S\. priority/);
  assert.match(script, /\.attention-select:checked/);
  assert.match(script, /type:'prepare_decision'/);
});

test('Release 0.17 decision preparation fails closed on duplicate, stale, over-bound, authority-smuggled and cross-tenant input', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = baseWorkspaceRequest(fixture, false);
  const workspace = await prepareOperatorWorkspace(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
  );
  assert.ok(workspace.attention.length >= 2);
  const first = workspace.attention[0]!.id;
  const second = workspace.attention[1]!.id;
  const valid = prepareAction(workspace, [first]);

  await assert.rejects(
    prepareOperatorWorkspaceDecision(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      { ...valid, workspaceId: 'workspace:' + '0'.repeat(64) },
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_workspace',
  );
  await assert.rejects(
    prepareOperatorWorkspaceDecision(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      { ...valid, sourceBriefId: 'service-brief:stale' },
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_source',
  );
  await assert.rejects(
    prepareOperatorWorkspaceDecision(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      prepareAction(workspace, [first, first]),
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'invalid_request',
  );
  await assert.rejects(
    prepareOperatorWorkspaceDecision(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      prepareAction(workspace, ['service-brief.attention:stale']),
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_source',
  );
  await assert.rejects(
    prepareOperatorWorkspaceDecision(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      prepareAction(workspace, [first, second], 'investigate', 1),
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'bound_exceeded',
  );
  assert.throws(
    () => parseOperatorActionArtifact({
      ...valid,
      action: {
        ...valid.action,
        scope: serviceBriefScope,
      },
    }),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'invalid_request',
  );
  assert.throws(
    () => parseOperatorActionArtifact({
      ...valid,
      tenantContext: { tenantId: serviceBriefScope.tenantId },
    }),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'invalid_request',
  );
  await assert.rejects(
    prepareOperatorWorkspaceDecision(
      fixture.prepared.evidence,
      fixture.prepared.review,
      beta,
      request,
      valid,
    ),
  );
});

test('Release 0.17 decision update preserves accepted optional inputs and returns continuity for later durable actions', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = baseWorkspaceRequest(fixture, true);
  const workspace = await prepareOperatorWorkspace(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
  );
  const original = parseDecisionCycleRequest(request.decisionCycleInput);
  const before = await ledgerCounts(fixture);

  const artifact = createOperatorActionArtifact(
    workspace,
    'release-017-human-decision-update',
    '2026-10-01T21:25:00.000Z',
    {
      type: 'prepare_decision',
      selectedAttentionIds: [fixture.selectedAttentionId],
      decision: {
        id: original.decision.id,
        disposition: 'recommend',
        summary: 'Updated human-authored Release 0.17 decision summary.',
        recordedAt: '2026-10-01T21:25:00.000Z',
      },
      policy: original.policy,
      generatedAt: '2026-10-01T21:25:00.000Z',
      evaluatedAt: original.evaluatedAt,
    },
  );

  await assert.rejects(
    prepareOperatorWorkspaceDecision(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      request,
      { ...artifact, sourceDossierId: 'decision-cycle:stale' },
    ),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'stale_source',
  );

  const prepared = await prepareOperatorWorkspaceDecision(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
    artifact,
  );
  const afterPrepare = await ledgerCounts(fixture);
  assert.deepEqual(afterPrepare, before, 'updating the human decision must remain non-durable');

  const next = parseDecisionCycleRequest(prepared.nextWorkspaceRequest.decisionCycleInput);
  assert.deepEqual(next.recommendation, original.recommendation);
  assert.equal(next.existingRecommendationId, original.existingRecommendationId);
  assert.deepEqual(next.searchChangePlan, original.searchChangePlan);
  assert.deepEqual(next.decision.references, original.decision.references, 'existing exact references are preserved when the browser does not edit them');
  assert.equal(next.decision.summary, 'Updated human-authored Release 0.17 decision summary.');

  let current = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    prepared.nextWorkspaceRequest,
    createOperatorActionArtifact(
      prepared.workspace,
      'release-017-continuation-recommendation',
      '2026-10-01T21:26:00.000Z',
      { type: 'commit_recommendation' },
    ),
  );
  assert.equal(current.decisionCycle?.recommendation?.current?.id, fixture.recommendation.id);

  const plan = current.decisionCycle?.measurementPlan;
  assert.ok(plan);
  current = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    prepared.nextWorkspaceRequest,
    createOperatorActionArtifact(
      current,
      'release-017-continuation-baseline',
      '2026-10-01T21:27:00.000Z',
      {
        type: 'commit_measurement',
        role: 'baseline',
        expectedMeasurementId: plan.baseline.measurement.id,
      },
    ),
  );
  current = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    prepared.nextWorkspaceRequest,
    createOperatorActionArtifact(
      current,
      'release-017-continuation-follow-up',
      '2026-10-01T21:28:00.000Z',
      {
        type: 'commit_measurement',
        role: 'follow_up',
        expectedMeasurementId: plan.followUp.measurement.id,
      },
    ),
  );

  const outcome: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'release-017-continuation-outcome',
    scope: structuredClone(serviceBriefScope),
    recommendationId: fixture.recommendation.id,
    assessment: {
      direction: 'unchanged',
      measurements: [
        { scope: structuredClone(serviceBriefScope), id: plan.baseline.measurement.id },
        { scope: structuredClone(serviceBriefScope), id: plan.followUp.measurement.id },
      ],
      comparability: 'comparable',
      rationale: 'Human explicitly declares unchanged through the continued authoritative request state.',
    },
    attribution: {
      strength: 'technical_verification',
      basis: 'Synthetic continuation regression only; no causal claim.',
    },
    createdAt: '2026-10-01T21:29:00.000Z',
  };
  current = await applyOperatorWorkspaceAction(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    prepared.nextWorkspaceRequest,
    createOperatorActionArtifact(
      current,
      'release-017-continuation-outcome',
      '2026-10-01T21:29:00.000Z',
      { type: 'commit_outcome', outcome },
    ),
  );
  assert.equal(current.decisionCycle?.readiness.state, 'outcome_recorded');
});

test('Release 0.17 report browser rejects 13 observed-change lines rather than truncating human input', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const request = baseWorkspaceRequest(fixture, true);
  const workspace = await prepareOperatorWorkspace(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    request,
  );
  const html = renderOperatorWorkspaceHtml(workspace);
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';

  assert.match(script, /values\.length>12/);
  assert.match(script, /Nothing was downloaded/);
  assert.doesNotMatch(script, /slice\(0,12\)/);

  const selected = [workspace.attention[0]!.id];
  assert.throws(
    () => parseCustomerReportRequest({
      version: '0.17.0',
      requestId: 'release-017-report-13-lines',
      createdAt: '2026-10-01T21:30:00.000Z',
      workspaceId: workspace.id,
      sourceBriefId: workspace.source.serviceBriefId,
      sourceDossierId: workspace.source.decisionCycleDossierId,
      title: 'Synthetic bounded report',
      executiveSummary: 'Human-authored report bound regression.',
      selectedAttentionIds: selected,
      observedChanges: Array.from({ length: 13 }, (_, index) => 'Human line ' + String(index + 1)),
      nextReview: 'Synthetic next review.',
      includeInternalAppendix: false,
    }),
    (error: unknown) => error instanceof OperatorWorkspaceError && error.code === 'invalid_request',
  );
});
