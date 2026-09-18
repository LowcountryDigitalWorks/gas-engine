import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import type { CollectionBatch, EvidenceRepository, Scope } from '../../src/persistence/repository.js';
import { LocalReviewLedgerRepository } from '../../src/review/sqlite.js';
import type { ReviewLedgerRepository } from '../../src/review/repository.js';
import {
  createHumanRecommendation,
  recordHumanOutcome,
  recordMeasurement,
  transitionHumanRecommendation,
} from '../../src/review/service.js';
import {
  assembleOperatorCaseView,
  OperatorCaseViewError,
} from '../../src/operator/case-view.js';
import { alpha, batch, beta, repository, temporaryDatabase } from '../persistence/helpers.js';

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
  const baseline = batch('alpha', '-operator-baseline');
  baseline.collection.completeness = { state: 'complete', expectedCount: 2, receivedCount: 2 };
  const extraSource = structuredClone(baseline.sources[0]!);
  extraSource.id = 'synthetic-source-row-operator-baseline-extra';
  extraSource.record.identity.sourceRecordId = 'synthetic-external-operator-baseline-extra';
  const extraObservation = structuredClone(baseline.observations[0]!);
  extraObservation.sourceId = extraSource.id;
  extraObservation.record.id = 'synthetic-observation-operator-baseline-extra';
  extraObservation.record.cohort.id = 'synthetic-cohort-operator-coverage';
  extraObservation.record.cohort.context.metric.id = 'synthetic-metric-operator-coverage';
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

  const current = batch('alpha', '-operator-current');
  current.collection.completeness = {
    state: 'partial', expectedCount: 2, receivedCount: 1, reason: 'Synthetic partial coverage.',
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
): Contract<'recommendation'> {
  const owner = observation.cohort.context.scope;
  return {
    schemaVersion: '1.0', kind: 'recommendation', id, scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: observation.id }],
    rationale: 'Synthetic human-authored operator case recommendation.',
    priority: { level: 'unassessed', basis: 'Synthetic proof intentionally assigns no priority.' },
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
    methodology: { id: 'synthetic-operator-method', version: '1.0' },
    createdAt: observation.provenance.receivedAt,
  };
}

async function prepareCase(t: TestContext) {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const { baseline, current } = caseBatches();
  await evidence.persistCollection(alpha, baseline);
  await evidence.persistCollection(alpha, current);

  const baselineObservation = baseline.observations[0]!.record;
  const currentObservation = current.observations[0]!.record;
  const proposed = await createHumanRecommendation(review, evidence, alpha, {
    recommendation: recommendation(baselineObservation, 'synthetic-operator-selected'),
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
    recommendation: recommendation(baseline.observations[1]!.record, 'synthetic-operator-rejected'),
  });
  await transitionHumanRecommendation(review, evidence, alpha, {
    scope: rejected.scope, id: rejected.id, expectedCurrentRevision: 1,
    lifecycle: 'rejected', updatedAt: '2026-01-01T03:30:00.000Z',
  });

  const baselineMeasurement = measurement(
    baselineObservation,
    'synthetic-operator-measurement-baseline',
    { role: 'baseline' },
  );
  const followUpMeasurement = measurement(
    currentObservation,
    'synthetic-operator-measurement-follow-up',
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
    schemaVersion: '1.0', kind: 'outcome', id: 'synthetic-operator-outcome',
    scope: structuredClone(accepted.scope), recommendationId: accepted.id,
    assessment: {
      direction: 'regressed',
      measurements: [
        { scope: structuredClone(accepted.scope), id: baselineMeasurement.id },
        { scope: structuredClone(accepted.scope), id: followUpMeasurement.id },
      ],
      comparability: 'comparable',
      rationale: 'Synthetic human-declared outcome; numeric increase is not interpreted by G.A.S.',
    },
    attribution: {
      strength: 'technical_verification',
      basis: 'Synthetic technical verification only; no causal marketing claim.',
    },
    createdAt: '2026-01-03T00:00:00.000Z',
  };
  await recordHumanOutcome(review, alpha, { outcome });

  return { evidence, review, baseline, current, accepted };
}

function expectOperatorCode(code: OperatorCaseViewError['code']): (error: unknown) => boolean {
  return (error) => error instanceof OperatorCaseViewError && error.code === code;
}

test('operator case assembles changed evidence, coverage uncertainty, human decisions, measurements and outcomes read-only', async (t) => {
  const prepared = await prepareCase(t);
  const view = await assembleOperatorCaseView(prepared.evidence, prepared.review, alpha, {
    scope: prepared.accepted.scope,
    baselineCollectionId: prepared.baseline.collection.id,
    currentCollectionId: prepared.current.collection.id,
    selectedRecommendationId: prepared.accepted.id,
  });

  assert.equal(view.evidenceDiff.summary.changed, 1);
  assert.equal(view.evidenceDiff.summary.coverageUnknown, 1);
  assert.deepEqual(view.reviewAttention.map((entry) => entry.state).sort(), ['changed', 'coverage_unknown']);
  assert.equal(view.reviewAttention.find((entry) => entry.state === 'changed')?.numericDelta, 1);
  assert.deepEqual(view.recommendations.map((record) => record.id), [
    'synthetic-operator-rejected',
    'synthetic-operator-selected',
  ]);
  assert.equal(view.recommendations.every((record) =>
    record.authorityClass === 'internal_review' && record.priority.level === 'unassessed'), true);
  assert.deepEqual(view.selectedRecommendation.history.map((record) => record.lifecycle),
    ['proposed', 'in_review', 'accepted']);
  assert.deepEqual(view.selectedRecommendation.evidence.map((record) => record.id),
    [prepared.baseline.observations[0]!.record.id]);
  assert.equal(view.selectedRecommendation.measurements.length, 2);
  assert.equal(view.selectedRecommendation.outcomes[0]?.assessment.direction, 'regressed');
});

test('Beta, same-tenant wrong scope, wrong-scope recommendation and wrong-scope collection selection fail closed', async (t) => {
  const prepared = await prepareCase(t);
  const request = {
    scope: prepared.accepted.scope,
    baselineCollectionId: prepared.baseline.collection.id,
    currentCollectionId: prepared.current.collection.id,
    selectedRecommendationId: prepared.accepted.id,
  };

  await assert.rejects(
    assembleOperatorCaseView(prepared.evidence, prepared.review, beta, request),
    expectOperatorCode('collection_not_found'),
  );

  const wrongScope: Scope = {
    tenantId: 'tenant-alpha',
    siteId: 'synthetic-site-alpha-operator-other',
    siteScopeRevisionId: 'synthetic-scope-alpha-operator-other-r1',
  };
  await assert.rejects(
    assembleOperatorCaseView(prepared.evidence, prepared.review, alpha, { ...request, scope: wrongScope }),
    expectOperatorCode('scope_mismatch'),
  );

  await prepared.evidence.createSite(alpha, { id: wrongScope.siteId, label: 'Synthetic operator other scope' });
  await prepared.evidence.createScope(alpha, wrongScope);
  const wrongRecommendation = recommendation(prepared.baseline.observations[0]!.record, 'synthetic-operator-other-recommendation');
  wrongRecommendation.scope = structuredClone(wrongScope);
  wrongRecommendation.evidence[0]!.scope = structuredClone(wrongScope);
  await prepared.review.createRecommendation(alpha, wrongRecommendation);
  await assert.rejects(
    assembleOperatorCaseView(prepared.evidence, prepared.review, alpha, {
      ...request, selectedRecommendationId: wrongRecommendation.id,
    }),
    expectOperatorCode('recommendation_not_found'),
  );

  const otherCollection = batch('alpha', '-operator-other-scope');
  await prepared.evidence.createConnection(alpha, {
    id: 'synthetic-connection-operator-other',
    scope: wrongScope,
    providerId: otherCollection.collection.providerId,
  });
  otherCollection.collection.scope = structuredClone(wrongScope);
  otherCollection.collection.providerConnectionId = 'synthetic-connection-operator-other';
  otherCollection.sources[0]!.record.identity.scope = structuredClone(wrongScope);
  otherCollection.sources[0]!.record.identity.providerConnectionId = 'synthetic-connection-operator-other';
  otherCollection.observations[0]!.record.cohort.context.scope = structuredClone(wrongScope);
  otherCollection.observations[0]!.record.cohort.context.subject.reference = wrongScope.siteId;
  otherCollection.observations[0]!.record.provenance.source.scope = structuredClone(wrongScope);
  otherCollection.observations[0]!.record.provenance.source.providerConnectionId = 'synthetic-connection-operator-other';
  await prepared.evidence.persistCollection(alpha, otherCollection);
  await assert.rejects(
    assembleOperatorCaseView(prepared.evidence, prepared.review, alpha, {
      ...request, currentCollectionId: otherCollection.collection.id,
    }),
    expectOperatorCode('scope_mismatch'),
  );
});

test('operator assembler performs no repository writes and reuses each scope-level bounded list once', async (t) => {
  const prepared = await prepareCase(t);
  const evidenceWrites: string[] = [];
  const reviewWrites: string[] = [];
  const listReads: string[] = [];

  const evidenceWriteMethods = new Set([
    'createTenant','createSite','setSiteLabel','createScope','createConnection','persistCollection','deleteCollection','close',
  ]);
  const reviewWriteMethods = new Set(['createRecommendation','appendRecommendationRevision','persistMeasurement','persistOutcome','close']);

  const evidence = new Proxy(prepared.evidence, {
    get(target, property) {
      if (typeof property === 'string' && evidenceWriteMethods.has(property)) {
        return (..._args: unknown[]) => {
          evidenceWrites.push(property);
          throw new Error(`Unexpected evidence write: ${property}`);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as EvidenceRepository;

  const review = new Proxy(prepared.review, {
    get(target, property) {
      if (typeof property === 'string' && reviewWriteMethods.has(property)) {
        return (..._args: unknown[]) => {
          reviewWrites.push(property);
          throw new Error(`Unexpected review write: ${property}`);
        };
      }
      if (typeof property === 'string' && ['listCurrentRecommendations','listMeasurements','listOutcomes'].includes(property)) {
        const value = Reflect.get(target, property, target) as (...args: unknown[]) => unknown;
        return (...args: unknown[]) => {
          listReads.push(property);
          return value.apply(target, args);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  }) as ReviewLedgerRepository;

  await assembleOperatorCaseView(evidence, review, alpha, {
    scope: prepared.accepted.scope,
    baselineCollectionId: prepared.baseline.collection.id,
    currentCollectionId: prepared.current.collection.id,
    selectedRecommendationId: prepared.accepted.id,
  });

  assert.deepEqual(evidenceWrites, []);
  assert.deepEqual(reviewWrites, []);
  assert.deepEqual(listReads.sort(), ['listCurrentRecommendations','listMeasurements','listOutcomes']);
});

test('accepted list overflow propagates explicitly instead of truncating operator scope history', async (t) => {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const { baseline, current } = caseBatches();
  await evidence.persistCollection(alpha, baseline);
  await evidence.persistCollection(alpha, current);
  const owner = baseline.collection.scope;

  for (let index = 0; index <= 100; index += 1) {
    await review.createRecommendation(alpha, recommendation(
      baseline.observations[0]!.record,
      `synthetic-operator-overflow-${String(index).padStart(3, '0')}`,
    ));
  }

  await assert.rejects(
    assembleOperatorCaseView(evidence, review, alpha, {
      scope: owner,
      baselineCollectionId: baseline.collection.id,
      currentCollectionId: current.collection.id,
      selectedRecommendationId: 'synthetic-operator-overflow-000',
    }),
    /Recommendation list exceeds 100 records/,
  );
});
