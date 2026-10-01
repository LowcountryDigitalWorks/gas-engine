import type { TestContext } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import type { CollectionBatch } from '../../src/persistence/repository.js';
import { LocalReviewLedgerRepository } from '../../src/review/sqlite.js';
import {
  createHumanRecommendation,
  recordHumanOutcome,
  recordMeasurement,
  transitionHumanRecommendation,
} from '../../src/review/service.js';
import {
  assembleServiceBrief,
  type ServiceBrief,
} from '../../src/operator/service-brief.js';
import { alpha, batch, repository, temporaryDatabase } from '../persistence/helpers.js';
import {
  serviceBriefScope,
  serviceBriefSearchModules,
} from './service-brief-fixtures.js';

function setWindow(value: CollectionBatch, start: string, end: string): void {
  value.collection.sourceTime = { start, end };
  value.collection.startedAt = start;
  value.collection.endedAt = end;
  value.collection.collectedAt = end;
  value.collection.receivedAt = new Date(Date.parse(end) + 60_000).toISOString();
  for (const item of value.observations) {
    item.record.provenance.sourceTime = structuredClone(value.collection.sourceTime);
    item.record.provenance.collectedAt = value.collection.collectedAt;
    item.record.provenance.receivedAt = value.collection.receivedAt;
  }
}

function diffPair(): { baseline: CollectionBatch; current: CollectionBatch } {
  const baseline = batch('alpha', '-service-brief-baseline');
  const current = batch('alpha', '-service-brief-current');
  baseline.collection.completeness = { state: 'complete', expectedCount: 1, receivedCount: 1 };
  current.collection.completeness = { state: 'complete', expectedCount: 1, receivedCount: 1 };
  baseline.observations[0]!.record.provenance.completeness = structuredClone(baseline.collection.completeness);
  current.observations[0]!.record.provenance.completeness = structuredClone(current.collection.completeness);
  current.observations[0]!.record.cohort = structuredClone(baseline.observations[0]!.record.cohort);
  current.observations[0]!.record.value = { state: 'observed', value: { type: 'number', value: 2 } };
  setWindow(baseline, '2026-09-01T00:00:00.000Z', '2026-09-01T01:00:00.000Z');
  setWindow(current, '2026-09-08T00:00:00.000Z', '2026-09-08T01:00:00.000Z');
  return { baseline, current };
}

function recommendation(observation: Contract<'observation'>): Contract<'recommendation'> {
  const owner = observation.cohort.context.scope;
  return {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id: 'synthetic-service-brief-recommendation',
    scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: observation.id }],
    rationale: 'Synthetic human-authored service brief recommendation.',
    priority: { level: 'unassessed', basis: 'Synthetic service brief test intentionally assigns no priority.' },
    authorityClass: 'internal_review',
    lifecycle: 'proposed',
    revision: 1,
    createdAt: '2026-09-01T02:00:00.000Z',
    updatedAt: '2026-09-01T02:00:00.000Z',
  };
}

function measurement(
  observation: Contract<'observation'>,
  id: string,
  relationship: Contract<'measurement'>['relationship'],
): Contract<'measurement'> {
  return {
    schemaVersion: '1.0',
    kind: 'measurement',
    id,
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
    methodology: { id: 'synthetic-service-brief-method', version: '1.0.0' },
    createdAt: observation.provenance.receivedAt,
  };
}

export function serviceBriefPolicy(overrides: Record<string, number | string> = {}) {
  return {
    id: 'service-brief-policy',
    version: '1.0.0',
    maxAttentionItems: 128,
    maxPageIndexEntries: 128,
    maxReferencesPerPage: 32,
    maxDetailedRecommendationHistories: 5,
    maxSearchChanges: 8,
    maxPageFocusReports: 8,
    ...overrides,
  };
}

export async function prepareServiceBriefRepositories(t: TestContext) {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const pair = diffPair();
  await evidence.persistCollection(alpha, pair.baseline);
  await evidence.persistCollection(alpha, pair.current);

  const proposed = await createHumanRecommendation(review, evidence, alpha, {
    recommendation: recommendation(pair.baseline.observations[0]!.record),
  });
  const accepted = await transitionHumanRecommendation(review, evidence, alpha, {
    scope: proposed.scope,
    id: proposed.id,
    expectedCurrentRevision: 1,
    lifecycle: 'accepted',
    updatedAt: '2026-09-01T03:00:00.000Z',
  });

  const baselineMeasurement = measurement(
    pair.baseline.observations[0]!.record,
    'synthetic-service-brief-measurement-baseline',
    { role: 'baseline' },
  );
  const followUpMeasurement = measurement(
    pair.current.observations[0]!.record,
    'synthetic-service-brief-measurement-followup',
    { role: 'follow_up', baselineMeasurementId: baselineMeasurement.id },
  );
  await recordMeasurement(review, evidence, alpha, {
    measurement: baselineMeasurement,
    cohortObservationId: pair.baseline.observations[0]!.record.id,
    recommendationId: accepted.id,
  });
  await recordMeasurement(review, evidence, alpha, {
    measurement: followUpMeasurement,
    cohortObservationId: pair.current.observations[0]!.record.id,
    recommendationId: accepted.id,
  });
  await recordHumanOutcome(review, alpha, {
    outcome: {
      schemaVersion: '1.0',
      kind: 'outcome',
      id: 'synthetic-service-brief-outcome',
      scope: structuredClone(accepted.scope),
      recommendationId: accepted.id,
      assessment: {
        direction: 'regressed',
        measurements: [
          { scope: structuredClone(accepted.scope), id: baselineMeasurement.id },
          { scope: structuredClone(accepted.scope), id: followUpMeasurement.id },
        ],
        comparability: 'comparable',
        rationale: 'Human-declared synthetic direction intentionally is not recalculated from numeric movement.',
      },
      attribution: {
        strength: 'technical_verification',
        basis: 'Synthetic human declaration; no broader causal claim.',
      },
      createdAt: '2026-09-18T00:00:00.000Z',
    },
  });
  return { evidence, review, pair, accepted };
}

export async function baseServiceBrief(
  t: TestContext,
  overrides: Record<string, unknown> = {},
): Promise<{
  brief: ServiceBrief;
  prepared: Awaited<ReturnType<typeof prepareServiceBriefRepositories>>;
  request: Record<string, unknown>;
}> {
  const prepared = await prepareServiceBriefRepositories(t);
  const modules = serviceBriefSearchModules();
  const request: Record<string, unknown> = {
    scope: serviceBriefScope,
    trustedTarget: 'https://example.test',
    generatedAt: '2026-10-01T17:00:00.000Z',
    policy: serviceBriefPolicy(),
    evidenceDiff: {
      baselineCollectionId: prepared.pair.baseline.collection.id,
      currentCollectionId: prepared.pair.current.collection.id,
    },
    serviceHistory: { selectedRecommendationIds: [prepared.accepted.id] },
    searchAnalytics: modules.searchAnalytics,
    searchChanges: modules.searchChanges,
    pageFocus: modules.pageFocus,
    ...overrides,
  };
  const brief = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, request);
  return { brief, prepared, request };
}
