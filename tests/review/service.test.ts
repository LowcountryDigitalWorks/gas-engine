import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import type { CollectionBatch, Scope } from '../../src/persistence/repository.js';
import { ReviewRevisionConflictError } from '../../src/review/errors.js';
import { LocalReviewLedgerRepository } from '../../src/review/sqlite.js';
import {
  createHumanRecommendation, getRecommendationEvidence, recordHumanOutcome, recordMeasurement,
  transitionHumanRecommendation,
} from '../../src/review/service.js';
import { alpha, batch, beta, repository, temporaryDatabase } from '../persistence/helpers.js';

function recommendation(observation: Contract<'observation'>, id: string): Contract<'recommendation'> {
  const owner = observation.cohort.context.scope;
  return {
    schemaVersion: '1.0', kind: 'recommendation', id, scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: observation.id }],
    rationale: 'Synthetic human selected changed evidence and authored this recommendation.',
    priority: { level: 'unassessed', basis: 'Synthetic operator intentionally assigned no priority.' },
    authorityClass: 'internal_review', lifecycle: 'proposed', revision: 1,
    createdAt: '2026-01-01T02:00:00.000Z', updatedAt: '2026-01-01T02:00:00.000Z',
  };
}

function measured(
  observation: Contract<'observation'>,
  id: string,
  relationship: Contract<'measurement'>['relationship'],
): Contract<'measurement'> {
  return {
    schemaVersion: '1.0', kind: 'measurement', id,
    cohort: structuredClone(observation.cohort), relationship: structuredClone(relationship),
    dueWindow: structuredClone(observation.provenance.sourceTime),
    result: {
      state: 'measured', observedWindow: structuredClone(observation.provenance.sourceTime),
      observations: [{
        reference: { scope: structuredClone(observation.cohort.context.scope), id: observation.id },
        value: structuredClone(observation.value),
      }],
    },
    comparability: { state: 'comparable' },
    methodology: { id: 'synthetic-ledger-measurement', version: '1.0' },
    createdAt: observation.provenance.receivedAt,
  };
}

function followUpBatch(suffix: string): CollectionBatch {
  const value = batch('alpha', suffix);
  value.collection.sourceTime = { start: '2026-01-02T00:00:00.000Z', end: '2026-01-02T01:00:00.000Z' };
  value.collection.startedAt = '2026-01-02T01:00:00.000Z';
  value.collection.endedAt = '2026-01-02T01:01:00.000Z';
  value.collection.collectedAt = '2026-01-02T01:02:00.000Z';
  value.collection.receivedAt = '2026-01-02T01:03:00.000Z';
  const observation = value.observations[0]!.record;
  observation.value = { state: 'observed', value: { type: 'number', value: 1 } };
  observation.provenance.sourceTime = structuredClone(value.collection.sourceTime);
  observation.provenance.collectedAt = value.collection.collectedAt;
  observation.provenance.receivedAt = value.collection.receivedAt;
  return value;
}

async function secondAlphaScope(evidence: Awaited<ReturnType<typeof repository>>): Promise<CollectionBatch> {
  const value = batch('alpha', '-other-scope');
  const other: Scope = {
    tenantId: 'tenant-alpha', siteId: 'synthetic-site-alpha-two', siteScopeRevisionId: 'synthetic-scope-alpha-two-r1',
  };
  await evidence.createSite(alpha, { id: other.siteId, label: 'Synthetic Alpha two' });
  await evidence.createScope(alpha, other);
  await evidence.createConnection(alpha, { id: 'synthetic-connection-two', scope: other, providerId: value.collection.providerId });
  value.collection.scope = structuredClone(other);
  value.collection.providerConnectionId = 'synthetic-connection-two';
  value.sources[0]!.record.identity.scope = structuredClone(other);
  value.sources[0]!.record.identity.providerConnectionId = 'synthetic-connection-two';
  const observation = value.observations[0]!.record;
  observation.cohort.context.scope = structuredClone(other);
  observation.cohort.context.subject.reference = other.siteId;
  observation.provenance.source.scope = structuredClone(other);
  observation.provenance.source.providerConnectionId = 'synthetic-connection-two';
  return value;
}

test('synthetic service-history proof preserves review revisions, measurements, outcomes and rejection', async (t) => {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const baselineBatch = batch('alpha', '-review-baseline');
  const futureBatch = followUpBatch('-review-follow-up');
  await evidence.persistCollection(alpha, baselineBatch);
  await evidence.persistCollection(alpha, futureBatch);
  const baselineObservation = baselineBatch.observations[0]!.record;
  const followUpObservation = futureBatch.observations[0]!.record;

  const proposed = await createHumanRecommendation(review, evidence, alpha, {
    recommendation: recommendation(baselineObservation, 'synthetic-review-primary'),
  });
  const inReview = await transitionHumanRecommendation(review, evidence, alpha, {
    scope: proposed.scope, id: proposed.id, expectedCurrentRevision: 1,
    lifecycle: 'in_review', updatedAt: '2026-01-01T02:10:00.000Z',
  });
  const accepted = await transitionHumanRecommendation(review, evidence, alpha, {
    scope: inReview.scope, id: inReview.id, expectedCurrentRevision: 2,
    lifecycle: 'accepted', updatedAt: '2026-01-01T02:20:00.000Z',
  });
  assert.equal(accepted.priority.level, 'unassessed');
  assert.equal('action' in accepted, false);

  const baseline = measured(baselineObservation, 'synthetic-measurement-baseline-review', { role: 'baseline' });
  const followUp = measured(followUpObservation, 'synthetic-measurement-follow-up-review', {
    role: 'follow_up', baselineMeasurementId: baseline.id,
  });
  await recordMeasurement(review, evidence, alpha, {
    measurement: baseline, cohortObservationId: baselineObservation.id, recommendationId: accepted.id,
  });
  await recordMeasurement(review, evidence, alpha, {
    measurement: followUp, cohortObservationId: followUpObservation.id, recommendationId: accepted.id,
  });

  const outcome: Contract<'outcome'> = {
    schemaVersion: '1.0', kind: 'outcome', id: 'synthetic-outcome-review', scope: structuredClone(accepted.scope),
    recommendationId: accepted.id,
    assessment: {
      direction: 'regressed',
      measurements: [
        { scope: structuredClone(accepted.scope), id: baseline.id },
        { scope: structuredClone(accepted.scope), id: followUp.id },
      ],
      comparability: 'comparable',
      rationale: 'Synthetic human declaration; numeric direction itself has no quality meaning.',
    },
    attribution: { strength: 'technical_verification', basis: 'Synthetic technical verification only; no causal claim.' },
    createdAt: '2026-01-02T02:00:00.000Z',
  };
  assert.equal((await recordHumanOutcome(review, alpha, { outcome })).assessment.direction, 'regressed');
  assert.deepEqual((await review.listRecommendationHistory(alpha, accepted.scope, accepted.id)).map((item) => item.lifecycle),
    ['proposed', 'in_review', 'accepted']);
  assert.deepEqual((await review.listMeasurements(alpha, { scope: accepted.scope, recommendationId: accepted.id })).map((item) => item.record.id),
    [baseline.id, followUp.id]);
  assert.deepEqual((await review.listOutcomes(alpha, { scope: accepted.scope, recommendationId: accepted.id })).map((item) => item.id), [outcome.id]);
  assert.deepEqual((await getRecommendationEvidence(review, evidence, alpha, accepted.scope, accepted.id)).map((item) => item.id), [baselineObservation.id]);

  const rejected = await createHumanRecommendation(review, evidence, alpha, {
    recommendation: recommendation(baselineObservation, 'synthetic-review-rejected'),
  });
  await transitionHumanRecommendation(review, evidence, alpha, {
    scope: rejected.scope, id: rejected.id, expectedCurrentRevision: 1,
    lifecycle: 'rejected', updatedAt: '2026-01-01T02:30:00.000Z',
  });
  assert.deepEqual(await review.listMeasurements(alpha, { scope: rejected.scope, recommendationId: rejected.id }), []);
  assert.deepEqual(await review.listOutcomes(alpha, { scope: rejected.scope, recommendationId: rejected.id }), []);

  const betaScope = batch('beta').collection.scope;
  assert.equal(await review.getCurrentRecommendation(beta, betaScope, accepted.id), null);
  assert.deepEqual(await review.listCurrentRecommendations(beta, { scope: betaScope }), []);
  await assert.rejects(transitionHumanRecommendation(review, evidence, beta, {
    scope: accepted.scope, id: accepted.id, expectedCurrentRevision: 3,
    lifecycle: 'superseded', updatedAt: '2026-01-02T03:00:00.000Z',
  }));

  await evidence.deleteCollection(alpha, baselineBatch.collection.id);
  await assert.rejects(getRecommendationEvidence(review, evidence, alpha, accepted.scope, accepted.id), /not found/);
});

test('service rejects stale revisions, cross-scope evidence, fabricated values and gated attribution', async (t) => {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const baselineBatch = batch('alpha', '-adversarial-baseline');
  const futureBatch = followUpBatch('-adversarial-follow-up');
  await evidence.persistCollection(alpha, baselineBatch);
  await evidence.persistCollection(alpha, futureBatch);
  const observation = baselineBatch.observations[0]!.record;
  const proposed = await createHumanRecommendation(review, evidence, alpha, {
    recommendation: recommendation(observation, 'synthetic-review-adversarial'),
  });
  await transitionHumanRecommendation(review, evidence, alpha, {
    scope: proposed.scope, id: proposed.id, expectedCurrentRevision: 1,
    lifecycle: 'in_review', updatedAt: '2026-01-01T02:10:00.000Z',
  });
  await assert.rejects(transitionHumanRecommendation(review, evidence, alpha, {
    scope: proposed.scope, id: proposed.id, expectedCurrentRevision: 1,
    lifecycle: 'accepted', updatedAt: '2026-01-01T02:20:00.000Z',
  }), ReviewRevisionConflictError);

  const other = await secondAlphaScope(evidence);
  await evidence.persistCollection(alpha, other);
  const deceptive = recommendation(observation, 'synthetic-review-cross-scope');
  deceptive.evidence[0]!.id = other.observations[0]!.record.id;
  await assert.rejects(createHumanRecommendation(review, evidence, alpha, { recommendation: deceptive }), /outside the owning scope/);

  const baseline = measured(observation, 'synthetic-measurement-adversarial-base', { role: 'baseline' });
  const bad = structuredClone(baseline);
  bad.id = 'synthetic-measurement-fabricated-value';
  if (bad.result.state === 'measured') bad.result.observations[0]!.value = { state: 'observed', value: { type: 'number', value: 999 } };
  await assert.rejects(recordMeasurement(review, evidence, alpha, {
    measurement: bad, cohortObservationId: observation.id, recommendationId: proposed.id,
  }), /differs from canonical observation value/);

  await recordMeasurement(review, evidence, alpha, {
    measurement: baseline, cohortObservationId: observation.id, recommendationId: proposed.id,
  });
  const followObservation = futureBatch.observations[0]!.record;
  const followUp = measured(followObservation, 'synthetic-measurement-adversarial-follow', {
    role: 'follow_up', baselineMeasurementId: baseline.id,
  });
  await recordMeasurement(review, evidence, alpha, {
    measurement: followUp, cohortObservationId: followObservation.id, recommendationId: proposed.id,
  });
  const gated: Contract<'outcome'> = {
    schemaVersion: '1.0', kind: 'outcome', id: 'synthetic-outcome-gated-attribution', scope: structuredClone(proposed.scope),
    recommendationId: proposed.id,
    assessment: {
      direction: 'improved', measurements: [
        { scope: structuredClone(proposed.scope), id: baseline.id },
        { scope: structuredClone(proposed.scope), id: followUp.id },
      ], comparability: 'comparable', rationale: 'Synthetic human declaration.',
    },
    attribution: { strength: 'association', basis: 'Synthetic association is deliberately gated at Release 0.8.' },
    createdAt: '2026-01-02T02:00:00.000Z',
  };
  await assert.rejects(recordHumanOutcome(review, alpha, { outcome: gated }), /permits only none or technical_verification/);
  gated.attribution = {
    strength: 'controlled_evidence', basis: 'Synthetic controlled claim remains gated.',
    method: { id: 'synthetic-control', version: '1.0' },
  };
  await assert.rejects(recordHumanOutcome(review, alpha, { outcome: gated }), /permits only none or technical_verification/);
});

test('not_due and not_measured remain explicit records and never schedule work', async (t) => {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const value = batch('alpha', '-pending-measurement');
  await evidence.persistCollection(alpha, value);
  const observation = value.observations[0]!.record;
  const base = measured(observation, 'synthetic-measurement-pending-template', { role: 'baseline' });
  const notDue: Contract<'measurement'> = {
    ...structuredClone(base), id: 'synthetic-measurement-not-due-review',
    dueWindow: { start: '2026-01-03T00:00:00.000Z', end: '2026-01-03T01:00:00.000Z' },
    result: { state: 'not_due', reason: 'Synthetic measurement is not due.' },
    comparability: { state: 'unknown', reason: 'No measurement exists yet.' },
    createdAt: '2026-01-02T23:00:00.000Z',
  };
  const notMeasured: Contract<'measurement'> = {
    ...structuredClone(base), id: 'synthetic-measurement-not-measured-review',
    dueWindow: { start: '2026-01-03T00:00:00.000Z', end: '2026-01-03T01:00:00.000Z' },
    result: { state: 'not_measured', reason: 'Synthetic operator recorded that measurement was not performed.' },
    comparability: { state: 'unknown', reason: 'No measurement exists.' },
    createdAt: '2026-01-03T01:30:00.000Z',
  };
  await recordMeasurement(review, evidence, alpha, { measurement: notDue, cohortObservationId: observation.id });
  await recordMeasurement(review, evidence, alpha, { measurement: notMeasured, cohortObservationId: observation.id });
  assert.deepEqual((await review.listMeasurements(alpha, { scope: observation.cohort.context.scope })).map((item) => item.record.result.state),
    ['not_due', 'not_measured']);
});
