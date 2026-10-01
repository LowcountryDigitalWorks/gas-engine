import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Contract } from '../src/contracts/wire.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  assembleServiceBrief,
} from '../src/operator/service-brief.js';
import {
  commitDecisionMeasurement,
  commitDecisionOutcome,
  commitDecisionRecommendation,
  prepareDecisionCycle,
  serializeDecisionCycleDossierJson,
  transitionDecisionRecommendation,
} from '../src/operator/decision-cycle.js';
import { renderDecisionCycleDossierHtml } from '../src/operator/decision-cycle-html.js';
import { alpha, batch } from '../tests/persistence/helpers.js';
import {
  serviceBriefScope,
  serviceBriefSearchModules,
} from '../tests/operator/service-brief-fixtures.js';
import { serviceBriefPolicy } from '../tests/operator/service-brief-repo-support.js';

const artifactDirectory = resolve('local-artifacts');
const databasePath = resolve(artifactDirectory, 'release-0.16-decision-cycle-preview.sqlite');
const jsonPath = resolve(artifactDirectory, 'release-0.16-decision-cycle-preview.json');
const htmlPath = resolve(artifactDirectory, 'release-0.16-decision-cycle-preview.html');

function recommendation(observation: Contract<'observation'>): Contract<'recommendation'> {
  return {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id: 'synthetic-release-016-recommendation',
    scope: structuredClone(observation.cohort.context.scope),
    evidence: [{
      scope: structuredClone(observation.cohort.context.scope),
      kind: 'observation',
      id: observation.id,
    }],
    rationale: 'Synthetic human-authored Release 0.16 recommendation created only after explicit commit.',
    priority: {
      level: 'unassessed',
      basis: 'Synthetic Release 0.16 preview intentionally assigns no priority.',
    },
    authorityClass: 'internal_review',
    lifecycle: 'proposed',
    revision: 1,
    createdAt: '2026-10-01T19:30:00.000Z',
    updatedAt: '2026-10-01T19:30:00.000Z',
  };
}

async function generate(): Promise<void> {
  mkdirSync(artifactDirectory, { recursive: true });
  for (const path of [
    databasePath,
    databasePath + '-shm',
    databasePath + '-wal',
    jsonPath,
    htmlPath,
  ]) rmSync(path, { force: true });

  const evidence = new LocalEvidenceRepository(databasePath);
  const review = new LocalReviewLedgerRepository(databasePath);
  try {
    const source = batch('alpha', '-release-016-evidence');
    await evidence.createTenant(alpha);
    await evidence.createSite(alpha, {
      id: serviceBriefScope.siteId,
      label: 'Synthetic Release 0.16 preview',
    });
    await evidence.createScope(alpha, serviceBriefScope);
    await evidence.createConnection(alpha, {
      id: source.collection.providerConnectionId!,
      scope: serviceBriefScope,
      providerId: source.collection.providerId,
    });
    await evidence.persistCollection(alpha, source);

    const modules = serviceBriefSearchModules('https://example.test', serviceBriefScope);
    const serviceBriefRequest = {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: serviceBriefPolicy(),
      searchAnalytics: modules.searchAnalytics,
    };
    const sourceBrief = await assembleServiceBrief(evidence, review, alpha, serviceBriefRequest);
    const selected = sourceBrief.attentionRegister.find((item) =>
      item.moduleId === 'search_analytics' && item.identity.url !== undefined,
    ) ?? sourceBrief.attentionRegister[0];
    if (selected === undefined) throw new Error('Synthetic Release 0.16 preview requires one Release 0.15 attention item.');

    const candidate = recommendation(source.observations[0]!.record);
    const searchChangePlan = structuredClone(modules.searchChanges[0]!);
    searchChangePlan.annotation = {
      ...searchChangePlan.annotation,
      id: 'synthetic-release-016-change',
      recommendationId: candidate.id,
      summary: 'Human recorded a synthetic search change for measurement.',
    };
    const references = selected.identity.url === undefined
      ? []
      : [{ kind: 'url' as const, value: selected.identity.url }];

    const cycleInput = {
      serviceBriefRequest,
      selectedAttentionIds: [selected.id],
      decision: {
        id: 'synthetic-release-016-decision',
        disposition: 'recommend' as const,
        summary: 'Human reviewed exact accepted evidence and chose to recommend a bounded follow-up.',
        recordedAt: '2026-10-01T19:35:00.000Z',
        references,
      },
      recommendation: candidate,
      searchChangePlan,
      policy: {
        id: 'release-016-preview-policy',
        version: '1.0.0',
        maxSelectedAttentionItems: 8,
      },
      generatedAt: '2026-10-01T20:00:00.000Z',
      evaluatedAt: '2026-09-16T09:00:00.000Z',
    };

    const prepared = await prepareDecisionCycle(evidence, review, alpha, cycleInput);
    if (prepared.readiness.state !== 'measurements_not_recorded') {
      throw new Error('Synthetic Release 0.16 preview expected prepared measurements before explicit recording.');
    }

    const proposed = await commitDecisionRecommendation(evidence, review, alpha, cycleInput);
    const inReview = await transitionDecisionRecommendation(
      evidence,
      review,
      alpha,
      cycleInput,
      {
        scope: serviceBriefScope,
        id: proposed.id,
        expectedCurrentRevision: proposed.revision,
        lifecycle: 'in_review',
        updatedAt: '2026-10-01T19:40:00.000Z',
      },
    );
    await transitionDecisionRecommendation(
      evidence,
      review,
      alpha,
      cycleInput,
      {
        scope: serviceBriefScope,
        id: inReview.id,
        expectedCurrentRevision: inReview.revision,
        lifecycle: 'accepted',
        updatedAt: '2026-10-01T19:45:00.000Z',
      },
    );

    const baseline = await commitDecisionMeasurement(evidence, review, alpha, cycleInput, 'baseline');
    const followUp = await commitDecisionMeasurement(evidence, review, alpha, cycleInput, 'follow_up');

    const ready = await prepareDecisionCycle(evidence, review, alpha, cycleInput);
    if (ready.readiness.state !== 'ready_for_human_assessment') {
      throw new Error('Synthetic Release 0.16 preview did not reach ready_for_human_assessment.');
    }

    await commitDecisionOutcome(
      evidence,
      review,
      alpha,
      cycleInput,
      {
        schemaVersion: '1.0',
        kind: 'outcome',
        id: 'synthetic-release-016-outcome',
        scope: structuredClone(serviceBriefScope),
        recommendationId: candidate.id,
        assessment: {
          direction: 'unchanged',
          measurements: [
            { scope: structuredClone(serviceBriefScope), id: baseline.id },
            { scope: structuredClone(serviceBriefScope), id: followUp.id },
          ],
          comparability: 'comparable',
          rationale: 'Human-declared synthetic outcome; numeric movement does not choose direction.',
        },
        attribution: {
          strength: 'technical_verification',
          basis: 'Synthetic technical verification only; no causal claim.',
        },
        createdAt: '2026-10-01T19:50:00.000Z',
      } satisfies Contract<'outcome'>,
    );

    const final = await prepareDecisionCycle(evidence, review, alpha, cycleInput);
    if (final.readiness.state !== 'outcome_recorded') {
      throw new Error('Synthetic Release 0.16 preview did not preserve the human outcome.');
    }

    const json = serializeDecisionCycleDossierJson(final);
    const html = renderDecisionCycleDossierHtml(final);
    writeFileSync(jsonPath, json, { encoding: 'utf8', flag: 'wx' });
    writeFileSync(htmlPath, html, { encoding: 'utf8', flag: 'wx' });
    console.log(
      'Generated synthetic Release 0.16 decision cycle: ' +
      'local-artifacts/release-0.16-decision-cycle-preview.json (' +
      String(Buffer.byteLength(json, 'utf8')) + ' bytes); ' +
      'local-artifacts/release-0.16-decision-cycle-preview.html (' +
      String(Buffer.byteLength(html, 'utf8')) + ' bytes); ' +
      String(final.selectedAttention.length) + ' selected attention item(s); ' +
      String(final.recordedMeasurements.length) + ' recorded measurement(s); ' +
      String(final.humanOutcomes.length) + ' human outcome(s); readiness=' +
      final.readiness.state,
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
