import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Contract } from '../src/contracts/wire.js';
import type { CollectionBatch } from '../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  createHumanRecommendation,
  recordHumanOutcome,
  recordMeasurement,
  transitionHumanRecommendation,
} from '../src/review/service.js';
import { assembleOperatorCaseView } from '../src/operator/case-view.js';
import {
  buildOperatorCasePresentation,
  renderOperatorCaseHtml,
} from '../src/operator/html.js';
import { alpha, batch } from '../tests/persistence/helpers.js';

const artifactDirectory = resolve('local-artifacts');
const databasePath = resolve(artifactDirectory, 'release-0.9-preview.sqlite');
const outputPath = resolve(artifactDirectory, 'release-0.9-operator-case-preview.html');

function setWindow(
  value: CollectionBatch,
  start: string,
  end: string,
  collectedAt: string,
  receivedAt: string,
): void {
  value.collection.sourceTime = { start, end };
  value.collection.startedAt = start;
  value.collection.endedAt = end;
  value.collection.collectedAt = collectedAt;
  value.collection.receivedAt = receivedAt;
  for (const item of value.observations) {
    item.record.provenance.sourceTime = structuredClone(value.collection.sourceTime);
    item.record.provenance.collectedAt = collectedAt;
    item.record.provenance.receivedAt = receivedAt;
  }
}

function caseBatches(): { baseline: CollectionBatch; current: CollectionBatch } {
  const baseline = batch('alpha', '-release-09-preview-baseline');
  baseline.collection.completeness = { state: 'complete', expectedCount: 2, receivedCount: 2 };
  const extraSource = structuredClone(baseline.sources[0]!);
  extraSource.id = 'synthetic-source-row-release-09-preview-extra';
  extraSource.record.identity.sourceRecordId = 'synthetic-external-release-09-preview-extra';
  const extraObservation = structuredClone(baseline.observations[0]!);
  extraObservation.sourceId = extraSource.id;
  extraObservation.record.id = 'synthetic-observation-release-09-preview-extra';
  extraObservation.record.cohort.id = 'synthetic-cohort-release-09-preview-coverage';
  extraObservation.record.cohort.context.metric.id = 'synthetic-metric-release-09-preview-coverage';
  extraObservation.record.provenance.source = structuredClone(extraSource.record.identity);
  extraObservation.record.provenance.runId = baseline.collection.id;
  baseline.sources.push(extraSource);
  baseline.observations.push(extraObservation);
  for (const item of baseline.observations) {
    item.record.provenance.completeness = structuredClone(baseline.collection.completeness);
  }
  setWindow(
    baseline,
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T01:00:00.000Z',
    '2026-01-01T01:01:00.000Z',
    '2026-01-01T01:02:00.000Z',
  );

  const current = batch('alpha', '-release-09-preview-current');
  current.collection.completeness = {
    state: 'partial', expectedCount: 2, receivedCount: 1, reason: 'Synthetic preview intentionally preserves incomplete coverage.',
  };
  current.observations[0]!.record.cohort = structuredClone(baseline.observations[0]!.record.cohort);
  current.observations[0]!.record.value = { state: 'observed', value: { type: 'number', value: 1 } };
  current.observations[0]!.record.provenance.completeness = structuredClone(current.collection.completeness);
  setWindow(
    current,
    '2026-01-02T00:00:00.000Z',
    '2026-01-02T01:00:00.000Z',
    '2026-01-02T01:01:00.000Z',
    '2026-01-02T01:02:00.000Z',
  );
  return { baseline, current };
}

function recommendation(
  observation: Contract<'observation'>,
  id: string,
  rationale: string,
): Contract<'recommendation'> {
  const owner = observation.cohort.context.scope;
  return {
    schemaVersion: '1.0', kind: 'recommendation', id, scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: observation.id }],
    rationale,
    priority: { level: 'unassessed', basis: 'Synthetic preview intentionally assigns no priority.' },
    authorityClass: 'internal_review', lifecycle: 'proposed', revision: 1,
    createdAt: '2026-01-01T03:00:00.000Z', updatedAt: '2026-01-01T03:00:00.000Z',
  };
}

function measurement(
  observation: Contract<'observation'>,
  id: string,
  relationship: Contract<'measurement'>['relationship'],
): Contract<'measurement'> {
  return {
    schemaVersion: '1.0', kind: 'measurement', id,
    cohort: structuredClone(observation.cohort),
    relationship: structuredClone(relationship),
    dueWindow: structuredClone(observation.provenance.sourceTime),
    result: {
      state: 'measured',
      observedWindow: structuredClone(observation.provenance.sourceTime),
      observations: [{
        reference: { scope: structuredClone(observation.cohort.context.scope), id: observation.id },
        value: structuredClone(observation.value),
      }],
    },
    comparability: { state: 'comparable' },
    methodology: { id: 'synthetic-release-09-preview-method', version: '1.0' },
    createdAt: observation.provenance.receivedAt,
  };
}

async function generatePreview(): Promise<void> {
  mkdirSync(artifactDirectory, { recursive: true });
  for (const path of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`, outputPath]) {
    rmSync(path, { force: true });
  }

  const evidence = new LocalEvidenceRepository(databasePath);
  const review = new LocalReviewLedgerRepository(databasePath);
  try {
    const owner = batch('alpha').collection.scope;
    const connectionId = batch('alpha').collection.providerConnectionId!;
    const providerId = batch('alpha').collection.providerId;
    await evidence.createTenant(alpha);
    await evidence.createSite(alpha, { id: owner.siteId, label: 'Synthetic Release 0.9 preview site' });
    await evidence.createScope(alpha, owner);
    await evidence.createConnection(alpha, { id: connectionId, scope: owner, providerId });

    const { baseline, current } = caseBatches();
    await evidence.persistCollection(alpha, baseline);
    await evidence.persistCollection(alpha, current);
    const baselineObservation = baseline.observations[0]!.record;
    const currentObservation = current.observations[0]!.record;

    const proposed = await createHumanRecommendation(review, evidence, alpha, {
      recommendation: recommendation(
        baselineObservation,
        'synthetic-release-09-selected',
        'Synthetic human reviewer selected canonical changed evidence for follow-up.',
      ),
    });
    const inReview = await transitionHumanRecommendation(review, evidence, alpha, {
      scope: proposed.scope, id: proposed.id, expectedCurrentRevision: 1,
      lifecycle: 'in_review', updatedAt: '2026-01-01T03:10:00.000Z',
    });
    const accepted = await transitionHumanRecommendation(review, evidence, alpha, {
      scope: inReview.scope, id: inReview.id, expectedCurrentRevision: 2,
      lifecycle: 'accepted', updatedAt: '2026-01-01T03:20:00.000Z',
    });

    const rejected = await createHumanRecommendation(review, evidence, alpha, {
      recommendation: recommendation(
        baseline.observations[1]!.record,
        'synthetic-release-09-rejected',
        'Synthetic human reviewer rejected this separate recommendation.',
      ),
    });
    await transitionHumanRecommendation(review, evidence, alpha, {
      scope: rejected.scope, id: rejected.id, expectedCurrentRevision: 1,
      lifecycle: 'rejected', updatedAt: '2026-01-01T03:30:00.000Z',
    });

    const baselineMeasurement = measurement(
      baselineObservation,
      'synthetic-release-09-measurement-baseline',
      { role: 'baseline' },
    );
    const followUpMeasurement = measurement(
      currentObservation,
      'synthetic-release-09-measurement-follow-up',
      { role: 'follow_up', baselineMeasurementId: baselineMeasurement.id },
    );
    await recordMeasurement(review, evidence, alpha, {
      measurement: baselineMeasurement,
      cohortObservationId: baselineObservation.id,
      recommendationId: accepted.id,
    });
    await recordMeasurement(review, evidence, alpha, {
      measurement: followUpMeasurement,
      cohortObservationId: currentObservation.id,
      recommendationId: accepted.id,
    });

    const outcome: Contract<'outcome'> = {
      schemaVersion: '1.0', kind: 'outcome', id: 'synthetic-release-09-outcome',
      scope: structuredClone(accepted.scope), recommendationId: accepted.id,
      assessment: {
        direction: 'regressed',
        measurements: [
          { scope: structuredClone(accepted.scope), id: baselineMeasurement.id },
          { scope: structuredClone(accepted.scope), id: followUpMeasurement.id },
        ],
        comparability: 'comparable',
        rationale: 'Synthetic human declaration. Numeric increase itself is not interpreted by G.A.S.',
      },
      attribution: {
        strength: 'technical_verification',
        basis: 'Synthetic technical verification only; no causal marketing claim.',
      },
      createdAt: '2026-01-03T00:00:00.000Z',
    };
    await recordHumanOutcome(review, alpha, { outcome });

    const view = await assembleOperatorCaseView(evidence, review, alpha, {
      scope: owner,
      baselineCollectionId: baseline.collection.id,
      currentCollectionId: current.collection.id,
      selectedRecommendationId: accepted.id,
    });
    const html = renderOperatorCaseHtml(buildOperatorCasePresentation(view));
    writeFileSync(outputPath, html, { encoding: 'utf8', flag: 'wx' });
    console.log(`Generated synthetic operator preview: local-artifacts/release-0.9-operator-case-preview.html (${new TextEncoder().encode(html).byteLength} bytes)`);
  } finally {
    review.close();
    evidence.close();
    for (const path of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) {
      rmSync(path, { force: true });
    }
  }
}

await generatePreview();
