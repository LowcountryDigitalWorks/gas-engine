import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Contract } from '../src/contracts/wire.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  prepareOperatorWorkspace,
  serializeOperatorWorkspaceJson,
  type OperatorWorkspaceRequest,
} from '../src/operator/workspace.js';
import {
  applyOperatorWorkspaceAction,
  createOperatorActionArtifact,
  prepareOperatorWorkspaceDecision,
  serializeOperatorActionArtifact,
} from '../src/operator/workspace-action.js';
import { parseDecisionCycleRequest } from '../src/operator/decision-cycle.js';
import { renderOperatorWorkspaceHtml } from '../src/operator/workspace-html.js';
import {
  composeCustomerServiceReport,
  serializeCustomerServiceReportJson,
} from '../src/operator/customer-report.js';
import { renderCustomerServiceReportHtml } from '../src/operator/customer-report-html.js';
import { alpha, batch } from '../tests/persistence/helpers.js';
import {
  serviceBriefScope,
  serviceBriefSearchModules,
} from '../tests/operator/service-brief-fixtures.js';
import { serviceBriefPolicy } from '../tests/operator/service-brief-repo-support.js';

const artifactDirectory = resolve('local-artifacts');
const databasePath = resolve(artifactDirectory, 'release-0.17-workspace-preview.sqlite');
const workspaceJsonPath = resolve(artifactDirectory, 'release-0.17-workspace-preview.json');
const workspaceHtmlPath = resolve(artifactDirectory, 'release-0.17-workspace-preview.html');
const actionPath = resolve(artifactDirectory, 'release-0.17-action-preview.json');
const reportJsonPath = resolve(artifactDirectory, 'release-0.17-customer-report-preview.json');
const reportHtmlPath = resolve(artifactDirectory, 'release-0.17-customer-report-preview.html');

function recommendation(observation: Contract<'observation'>): Contract<'recommendation'> {
  return {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id: 'synthetic-release-017-recommendation',
    scope: structuredClone(observation.cohort.context.scope),
    evidence: [{
      scope: structuredClone(observation.cohort.context.scope),
      kind: 'observation',
      id: observation.id,
    }],
    rationale: 'Human-authored synthetic Release 0.17 recommendation for local operator-workspace preview only.',
    priority: {
      level: 'unassessed',
      basis: 'Synthetic Release 0.17 preview intentionally assigns no priority.',
    },
    authorityClass: 'internal_review',
    lifecycle: 'proposed',
    revision: 1,
    createdAt: '2026-10-01T21:10:00.000Z',
    updatedAt: '2026-10-01T21:10:00.000Z',
  };
}

async function generate(): Promise<void> {
  mkdirSync(artifactDirectory, { recursive: true });
  for (const path of [
    databasePath,
    databasePath + '-shm',
    databasePath + '-wal',
    workspaceJsonPath,
    workspaceHtmlPath,
    actionPath,
    reportJsonPath,
    reportHtmlPath,
  ]) rmSync(path, { force: true });

  const evidence = new LocalEvidenceRepository(databasePath);
  const review = new LocalReviewLedgerRepository(databasePath);
  try {
    const source = batch('alpha', '-release-017-evidence');
    await evidence.createTenant(alpha);
    await evidence.createSite(alpha, {
      id: serviceBriefScope.siteId,
      label: 'Synthetic Release 0.17 example.test workspace',
    });
    await evidence.createScope(alpha, serviceBriefScope);
    await evidence.createConnection(alpha, {
      id: source.collection.providerConnectionId!,
      scope: structuredClone(source.collection.scope),
      providerId: source.collection.providerId,
    });
    await evidence.persistCollection(alpha, source);

    const modules = serviceBriefSearchModules('https://example.test', serviceBriefScope);
    const searchCollection = modules.baseline.batches[0]!.collection;
    await evidence.createConnection(alpha, {
      id: searchCollection.providerConnectionId!,
      scope: structuredClone(searchCollection.scope),
      providerId: searchCollection.providerId,
    });
    for (const part of [...modules.baseline.batches, ...modules.current.batches]) {
      await evidence.persistCollection(alpha, part);
    }

    const serviceBriefRequest = {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T20:00:00.000Z',
      policy: serviceBriefPolicy(),
      searchAnalytics: modules.searchAnalytics,
    };
    const candidate = recommendation(source.observations[0]!.record);
    const sourcePlan = modules.searchChanges[0]!;
    const searchChangePlan = {
      ...structuredClone(sourcePlan),
      annotation: {
        ...structuredClone(sourcePlan.annotation),
        id: 'synthetic-release-017-change',
        recommendationId: candidate.id,
        summary: 'Human recorded one synthetic change for exact same-source measurement.',
      },
    };

    const firstBrief = await import('../src/operator/service-brief.js').then(({ assembleServiceBrief }) =>
      assembleServiceBrief(evidence, review, alpha, serviceBriefRequest));
    const attention = firstBrief.attentionRegister.find((item) => item.identity.url !== undefined)
      ?? firstBrief.attentionRegister[0];
    if (attention === undefined) throw new Error('Release 0.17 preview requires at least one attention item.');

    const initialWorkspaceRequest: OperatorWorkspaceRequest = {
      serviceBriefRequest,
      generatedAt: '2026-10-01T21:30:00.000Z',
      evaluatedAt: '2026-10-01T21:25:00.000Z',
      policy: {
        id: 'release-017-workspace-policy',
        version: '1.0.0',
        maxTimelineEntries: 128,
        maxAttentionRows: 128,
        maxEvidenceRows: 256,
      },
    };

    const initialWorkspace = await prepareOperatorWorkspace(
      evidence,
      review,
      alpha,
      initialWorkspaceRequest,
    );
    const decisionAction = createOperatorActionArtifact(
      initialWorkspace,
      'synthetic-release-017-decision',
      '2026-10-01T21:15:00.000Z',
      {
        type: 'prepare_decision',
        selectedAttentionIds: [attention.id],
        decision: {
          id: 'synthetic-release-017-decision',
          disposition: 'recommend',
          summary: 'Human selected an exact unranked attention item for bounded review.',
          recordedAt: '2026-10-01T21:15:00.000Z',
        },
        policy: {
          id: 'release-017-decision-policy',
          version: '1.0.0',
          maxSelectedAttentionItems: 8,
        },
        generatedAt: '2026-10-01T21:20:00.000Z',
        evaluatedAt: '2026-09-16T09:00:00.000Z',
      },
    );
    writeFileSync(actionPath, serializeOperatorActionArtifact(decisionAction), { encoding: 'utf8', flag: 'wx' });

    const preparedDecision = await prepareOperatorWorkspaceDecision(
      evidence,
      review,
      alpha,
      initialWorkspaceRequest,
      decisionAction,
    );
    const preparedCycleInput = parseDecisionCycleRequest(
      preparedDecision.nextWorkspaceRequest.decisionCycleInput,
    );
    const cycleInput = parseDecisionCycleRequest({
      ...preparedCycleInput,
      recommendation: candidate,
      searchChangePlan,
    });
    const workspaceRequest: OperatorWorkspaceRequest = {
      ...preparedDecision.nextWorkspaceRequest,
      decisionCycleInput: cycleInput,
    };

    let workspace = await prepareOperatorWorkspace(evidence, review, alpha, workspaceRequest);
    const recommendationAction = createOperatorActionArtifact(
      workspace,
      'release-017-preview-create-recommendation',
      '2026-10-01T21:31:00.000Z',
      { type: 'commit_recommendation' },
    );
    workspace = await applyOperatorWorkspaceAction(evidence, review, alpha, workspaceRequest, recommendationAction);

    const proposed = workspace.decisionCycle?.recommendation?.current;
    if (proposed === undefined) throw new Error('Release 0.17 preview expected persisted recommendation.');
    workspace = await applyOperatorWorkspaceAction(
      evidence,
      review,
      alpha,
      workspaceRequest,
      createOperatorActionArtifact(
        workspace,
        'release-017-preview-in-review',
        '2026-10-01T21:32:00.000Z',
        {
          type: 'transition_recommendation',
          input: {
            scope: serviceBriefScope,
            id: proposed.id,
            expectedCurrentRevision: proposed.revision,
            lifecycle: 'in_review',
            updatedAt: '2026-10-01T21:32:00.000Z',
          },
        },
      ),
    );

    const inReview = workspace.decisionCycle?.recommendation?.current;
    if (inReview === undefined) throw new Error('Release 0.17 preview expected in-review recommendation.');
    workspace = await applyOperatorWorkspaceAction(
      evidence,
      review,
      alpha,
      workspaceRequest,
      createOperatorActionArtifact(
        workspace,
        'release-017-preview-accepted',
        '2026-10-01T21:33:00.000Z',
        {
          type: 'transition_recommendation',
          input: {
            scope: serviceBriefScope,
            id: inReview.id,
            expectedCurrentRevision: inReview.revision,
            lifecycle: 'accepted',
            updatedAt: '2026-10-01T21:33:00.000Z',
          },
        },
      ),
    );

    const plan = workspace.decisionCycle?.measurementPlan;
    if (plan === undefined) throw new Error('Release 0.17 preview requires the accepted Release 0.11 plan.');
    workspace = await applyOperatorWorkspaceAction(
      evidence,
      review,
      alpha,
      workspaceRequest,
      createOperatorActionArtifact(
        workspace,
        'release-017-preview-baseline',
        '2026-10-01T21:34:00.000Z',
        {
          type: 'commit_measurement',
          role: 'baseline',
          expectedMeasurementId: plan.baseline.measurement.id,
        },
      ),
    );
    workspace = await applyOperatorWorkspaceAction(
      evidence,
      review,
      alpha,
      workspaceRequest,
      createOperatorActionArtifact(
        workspace,
        'release-017-preview-follow-up',
        '2026-10-01T21:35:00.000Z',
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
      id: 'synthetic-release-017-outcome',
      scope: structuredClone(serviceBriefScope),
      recommendationId: candidate.id,
      assessment: {
        direction: 'unchanged',
        measurements: [
          { scope: structuredClone(serviceBriefScope), id: plan.baseline.measurement.id },
          { scope: structuredClone(serviceBriefScope), id: plan.followUp.measurement.id },
        ],
        comparability: 'comparable',
        rationale: 'Human deliberately declares unchanged; G.A.S. does not infer direction from metric movement.',
      },
      attribution: {
        strength: 'technical_verification',
        basis: 'Synthetic preview technical verification only; no causal claim.',
      },
      createdAt: '2026-10-01T21:36:00.000Z',
    };
    workspace = await applyOperatorWorkspaceAction(
      evidence,
      review,
      alpha,
      workspaceRequest,
      createOperatorActionArtifact(
        workspace,
        'release-017-preview-outcome',
        '2026-10-01T21:36:00.000Z',
        { type: 'commit_outcome', outcome },
      ),
    );
    if (workspace.decisionCycle?.readiness.state !== 'outcome_recorded') {
      throw new Error('Release 0.17 preview did not reach outcome_recorded.');
    }

    const selectedAttentionIds = workspace.attention.slice(0, Math.min(3, workspace.attention.length))
      .map((item) => item.id);
    if (selectedAttentionIds.length === 0) throw new Error('Release 0.17 preview requires customer-report attention selection.');
    const report = await composeCustomerServiceReport(
      evidence,
      review,
      alpha,
      workspaceRequest,
      {
        version: '0.17.0',
        requestId: 'release-017-preview-report',
        createdAt: '2026-10-01T21:40:00.000Z',
        workspaceId: workspace.id,
        sourceBriefId: workspace.source.serviceBriefId,
        sourceDossierId: workspace.source.decisionCycleDossierId,
        title: 'Synthetic example.test search & visibility service review',
        executiveSummary: 'Human-authored preview summary: accepted evidence was reviewed, one bounded focus area was measured, and the recorded human outcome remains unchanged.',
        selectedAttentionIds,
        observedChanges: [
          'Human reviewed current accepted search analytics evidence for example.test.',
          'The exact accepted Release 0.11 baseline/follow-up pair was recorded for the current cycle.',
        ],
        nextReview: 'Reassess with a later comparable same-source window; no causal or ranking improvement claim is made by this report.',
        includeInternalAppendix: false,
      },
    );

    const workspaceJson = serializeOperatorWorkspaceJson(workspace);
    const workspaceHtml = renderOperatorWorkspaceHtml(workspace);
    const reportJson = serializeCustomerServiceReportJson(report);
    const reportHtml = renderCustomerServiceReportHtml(report);
    writeFileSync(workspaceJsonPath, workspaceJson, { encoding: 'utf8', flag: 'wx' });
    writeFileSync(workspaceHtmlPath, workspaceHtml, { encoding: 'utf8', flag: 'wx' });
    writeFileSync(reportJsonPath, reportJson, { encoding: 'utf8', flag: 'wx' });
    writeFileSync(reportHtmlPath, reportHtml, { encoding: 'utf8', flag: 'wx' });

    console.log(
      'Generated synthetic Release 0.17 workspace: ' +
      'workspace JSON ' + String(Buffer.byteLength(workspaceJson, 'utf8')) + ' bytes; ' +
      'workspace HTML ' + String(Buffer.byteLength(workspaceHtml, 'utf8')) + ' bytes; ' +
      'action JSON ' + String(Buffer.byteLength(serializeOperatorActionArtifact(decisionAction), 'utf8')) + ' bytes; ' +
      'customer report JSON ' + String(Buffer.byteLength(reportJson, 'utf8')) + ' bytes; ' +
      'customer report HTML ' + String(Buffer.byteLength(reportHtml, 'utf8')) + ' bytes; ' +
      String(workspace.attention.length) + ' unranked attention item(s); ' +
      String(workspace.decisionCycle.recordedMeasurements.length) + ' exact current-cycle measurement(s); ' +
      String(report.focusItems.length) + ' human-selected customer focus item(s); readiness=' +
      workspace.decisionCycle.readiness.state,
    );
  } finally {
    review.close();
    evidence.close();
    for (const path of [databasePath, databasePath + '-shm', databasePath + '-wal']) {
      rmSync(path, { force: true });
    }
  }
}

await generate();
