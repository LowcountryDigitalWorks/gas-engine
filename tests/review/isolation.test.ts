import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import type { Scope } from '../../src/persistence/repository.js';
import { recordHumanOutcome } from '../../src/review/service.js';
import { LocalReviewLedgerRepository } from '../../src/review/sqlite.js';
import { alpha, batch, beta, repository, temporaryDatabase } from '../persistence/helpers.js';

function recommendation(owner: Scope, id: string): Contract<'recommendation'> {
  return {
    schemaVersion: '1.0', kind: 'recommendation', id, scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: `synthetic-observation-${id}` }],
    rationale: 'Synthetic repository isolation recommendation.',
    priority: { level: 'unassessed', basis: 'Synthetic repository test intentionally assigns no priority.' },
    authorityClass: 'internal_review', lifecycle: 'proposed', revision: 1,
    createdAt: '2026-01-01T02:00:00.000Z', updatedAt: '2026-01-01T02:00:00.000Z',
  };
}

function measurement(
  owner: Scope,
  id: string,
  relationship: Contract<'measurement'>['relationship'],
): Contract<'measurement'> {
  const observation = structuredClone(batch('alpha').observations[0]!.record);
  observation.cohort.context.scope = structuredClone(owner);
  observation.cohort.context.subject.reference = owner.siteId;
  return {
    schemaVersion: '1.0', kind: 'measurement', id,
    cohort: structuredClone(observation.cohort), relationship: structuredClone(relationship),
    dueWindow: structuredClone(observation.provenance.sourceTime),
    result: {
      state: 'measured', observedWindow: structuredClone(observation.provenance.sourceTime),
      observations: [{
        reference: { scope: structuredClone(owner), id: observation.id },
        value: structuredClone(observation.value),
      }],
    },
    comparability: { state: 'comparable' },
    methodology: { id: 'synthetic-ledger-isolation', version: '1.0' },
    createdAt: observation.provenance.receivedAt,
  };
}

function outcome(
  owner: Scope,
  id: string,
  recommendationId: string,
  baselineMeasurementId: string,
  followUpMeasurementId: string,
): Contract<'outcome'> {
  return {
    schemaVersion: '1.0', kind: 'outcome', id, scope: structuredClone(owner), recommendationId,
    assessment: {
      direction: 'unchanged',
      measurements: [
        { scope: structuredClone(owner), id: baselineMeasurementId },
        { scope: structuredClone(owner), id: followUpMeasurementId },
      ],
      comparability: 'comparable',
      rationale: 'Synthetic human declaration used only to test ledger isolation.',
    },
    attribution: { strength: 'technical_verification', basis: 'Synthetic technical verification only.' },
    createdAt: '2026-01-03T00:00:00.000Z',
  };
}

async function createSecondAlphaScope(
  evidence: Awaited<ReturnType<typeof repository>>,
): Promise<Scope> {
  const owner: Scope = {
    tenantId: 'tenant-alpha',
    siteId: 'synthetic-site-alpha-ledger-two',
    siteScopeRevisionId: 'synthetic-scope-alpha-ledger-two-r1',
  };
  await evidence.createSite(alpha, { id: owner.siteId, label: 'Synthetic Alpha ledger two' });
  await evidence.createScope(alpha, owner);
  return owner;
}

test('measurement and outcome repository surfaces fail closed across tenant and same-tenant scope boundaries', async (t) => {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const owner = batch('alpha').collection.scope;
  const betaOwner = batch('beta').collection.scope;
  const otherOwner = await createSecondAlphaScope(evidence);

  const alphaRecommendation = recommendation(owner, 'synthetic-review-ledger-isolation');
  await review.createRecommendation(alpha, alphaRecommendation);

  const baseline = measurement(owner, 'synthetic-measurement-ledger-base', { role: 'baseline' });
  await assert.rejects(review.persistMeasurement(beta, baseline, undefined));
  await review.persistMeasurement(alpha, baseline, alphaRecommendation.id);

  const followUp = measurement(owner, 'synthetic-measurement-ledger-follow', {
    role: 'follow_up', baselineMeasurementId: baseline.id,
  });
  await review.persistMeasurement(alpha, followUp, alphaRecommendation.id);
  assert.deepEqual((await review.listMeasurements(alpha, { scope: owner })).map((item) => item.record.id),
    [baseline.id, followUp.id]);

  const otherBaseline = measurement(otherOwner, 'synthetic-measurement-ledger-other-base', { role: 'baseline' });
  await assert.rejects(review.persistMeasurement(alpha, otherBaseline, alphaRecommendation.id),
    /recommendation is not present in the owning scope/);
  await review.persistMeasurement(alpha, otherBaseline, undefined);

  const crossScopeFollowUp = measurement(otherOwner, 'synthetic-measurement-ledger-cross-scope-follow', {
    role: 'follow_up', baselineMeasurementId: baseline.id,
  });
  await assert.rejects(review.persistMeasurement(alpha, crossScopeFollowUp, undefined),
    /baseline measurement is not present in the owning scope/);

  assert.equal(await review.getMeasurement(beta, betaOwner, baseline.id), null);
  assert.deepEqual(await review.listMeasurements(beta, { scope: betaOwner }), []);
  assert.equal(await review.getMeasurement(alpha, otherOwner, baseline.id), null);
  assert.equal((await review.listMeasurements(alpha, { scope: otherOwner })).some((item) => item.record.id === baseline.id), false);

  const alphaOutcome = outcome(owner, 'synthetic-outcome-ledger-isolation', alphaRecommendation.id, baseline.id, followUp.id);
  await assert.rejects(review.persistOutcome(beta, alphaOutcome));
  await review.persistOutcome(alpha, alphaOutcome);

  const wrongScopeOutcome = outcome(
    otherOwner,
    'synthetic-outcome-ledger-wrong-scope',
    alphaRecommendation.id,
    otherBaseline.id,
    'synthetic-measurement-ledger-other-follow',
  );
  await assert.rejects(review.persistOutcome(alpha, wrongScopeOutcome),
    /recommendation is not present in the owning scope/);

  assert.equal(await review.getOutcome(beta, betaOwner, alphaOutcome.id), null);
  assert.deepEqual(await review.listOutcomes(beta, { scope: betaOwner }), []);
  assert.equal(await review.getOutcome(alpha, otherOwner, alphaOutcome.id), null);
  assert.deepEqual(await review.listOutcomes(alpha, { scope: otherOwner }), []);

  const crossScopeReference = outcome(
    owner,
    'synthetic-outcome-ledger-cross-measurement',
    alphaRecommendation.id,
    baseline.id,
    otherBaseline.id,
  );
  await assert.rejects(recordHumanOutcome(review, alpha, { outcome: crossScopeReference }),
    /Outcome measurement not found/);
});

test('measurement list fails explicitly above the Release 0.8 100-record bound instead of truncating', async (t) => {
  const database = temporaryDatabase(t);
  await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const owner = batch('alpha').collection.scope;

  for (let index = 0; index <= 100; index += 1) {
    const id = `synthetic-measurement-overflow-${String(index).padStart(3, '0')}`;
    await review.persistMeasurement(alpha, measurement(owner, id, { role: 'baseline' }), undefined);
  }

  assert.equal((await review.getMeasurement(alpha, owner, 'synthetic-measurement-overflow-100'))?.record.id,
    'synthetic-measurement-overflow-100');
  await assert.rejects(review.listMeasurements(alpha, { scope: owner }), /exceeds 100 records/);
});
