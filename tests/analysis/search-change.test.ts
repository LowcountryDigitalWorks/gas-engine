import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
  type SearchAnalyticsAdaptationResult,
} from '../../src/adapters/search-analytics.js';
import {
  composeSearchChangeOutcomeCohort,
  SEARCH_CHANGE_METHODOLOGY,
  SearchChangeError,
} from '../../src/analysis/search-change.js';
import { parseContract } from '../../src/domain/validate.js';
import type { Scope } from '../../src/persistence/repository.js';
import {
  createHumanRecommendation,
  recordHumanOutcome,
  recordMeasurement,
} from '../../src/review/service.js';
import { LocalReviewLedgerRepository } from '../../src/review/sqlite.js';
import { alpha, batch, beta, repository, temporaryDatabase } from '../persistence/helpers.js';

type MutableJson = Record<string, any>;
const fixtureText = readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8');
const owner: Scope = structuredClone(batch('alpha').collection.scope);
const providerConnectionId = 'synthetic-gsc-change-connection';
const dueWindow = {
  start: '2026-09-23T00:00:00.000Z',
  end: '2026-09-30T00:00:00.000Z',
} as const;

function fixture(): MutableJson {
  return JSON.parse(fixtureText) as MutableJson;
}

function followUpFixture(): MutableJson {
  const value = fixture();
  value.observedAt = '2026-10-01T08:00:00.000Z';
  value.exportedAt = '2026-10-01T08:05:00.000Z';
  value.requestedWindow = structuredClone(dueWindow);
  value.effectiveWindow = structuredClone(dueWindow);
  value.freshness = { dataState: 'final', freshThrough: dueWindow.end };
  value.rows = [
    {
      query: 'synthetic alpha search',
      page: 'https://example.test/alpha',
      clicks: 5,
      impressions: 50,
      ctr: 0.1,
      averagePosition: 8.5,
    },
    {
      query: 'synthetic beta search',
      page: 'https://example.test/beta',
      clicks: 6,
      impressions: 120,
      ctr: 0.05,
      averagePosition: 13,
    },
  ];
  return value;
}

function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
}

function configFor(
  value: MutableJson,
  options: Partial<Pick<SearchAnalyticsAdapterConfig, 'scope' | 'expectedProperty' | 'providerConnectionId'>> = {},
): SearchAnalyticsAdapterConfig {
  const exported = new Date(value.exportedAt).getTime();
  return {
    scope: structuredClone(options.scope ?? owner),
    expectedProperty: options.expectedProperty ?? value.property,
    providerConnectionId: options.providerConnectionId ?? providerConnectionId,
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
    availability: { state: 'available', reference: 'synthetic-search-change-artifact' },
  };
}

function adapt(
  value: MutableJson,
  options: Partial<Pick<SearchAnalyticsAdapterConfig, 'scope' | 'expectedProperty' | 'providerConnectionId'>> = {},
  pretty = false,
): SearchAnalyticsAdaptationResult {
  return adaptSearchAnalyticsEvidence(bytes(value, pretty), configFor(value, options));
}

function annotation(overrides: Partial<Record<'id' | 'occurredAt' | 'recordedAt' | 'summary' | 'recommendationId', string>> = {}) {
  return {
    id: overrides.id ?? 'synthetic-search-change',
    occurredAt: overrides.occurredAt ?? '2026-09-16T00:00:00.000Z',
    recordedAt: overrides.recordedAt ?? '2026-09-16T09:00:00.000Z',
    summary: overrides.summary ?? 'Synthetic human-recorded search change for Release 0.11.',
    ...(overrides.recommendationId === undefined ? {} : { recommendationId: overrides.recommendationId }),
  };
}

function targetRowIdentity(baseline: SearchAnalyticsAdaptationResult): string {
  const row = baseline.rows.find((item) => item.query === 'synthetic alpha search');
  assert.ok(row);
  return row.rowIdentity;
}

function invocation(
  baseline: SearchAnalyticsAdaptationResult,
  followUp?: SearchAnalyticsAdaptationResult,
  overrides: {
    annotation?: ReturnType<typeof annotation>;
    dueWindow?: { start: string; end: string };
    evaluatedAt?: string;
    metric?: 'clicks' | 'impressions' | 'ctr' | 'averagePosition';
  } = {},
) {
  return {
    annotation: overrides.annotation ?? annotation(),
    baseline,
    baselineRowIdentity: targetRowIdentity(baseline),
    metric: overrides.metric ?? 'clicks',
    dueWindow: overrides.dueWindow ?? structuredClone(dueWindow),
    evaluatedAt: overrides.evaluatedAt ?? '2026-10-01T09:00:00.000Z',
    ...(followUp === undefined ? {} : { followUp }),
  };
}

function observationById(result: SearchAnalyticsAdaptationResult, id: string): Contract<'observation'> {
  for (const part of result.batches) {
    const found = part.observations.find((item) => item.record.id === id);
    if (found !== undefined) return found.record;
  }
  throw new Error(`Synthetic observation not found: ${id}`);
}

function recommendation(observation: Contract<'observation'>, id: string): Contract<'recommendation'> {
  const scope = observation.cohort.context.scope;
  return {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id,
    scope: structuredClone(scope),
    evidence: [{ scope: structuredClone(scope), kind: 'observation', id: observation.id }],
    rationale: 'Synthetic human recommendation association for Release 0.11 integration proof.',
    priority: { level: 'unassessed', basis: 'Synthetic operator assigned no priority.' },
    authorityClass: 'internal_review',
    lifecycle: 'proposed',
    revision: 1,
    createdAt: '2026-09-16T09:10:00.000Z',
    updatedAt: '2026-09-16T09:10:00.000Z',
  };
}

function setQuality(
  value: MutableJson,
  dataState: 'final' | 'preliminary',
  coverage: MutableJson,
): MutableJson {
  value.freshness = { dataState, freshThrough: value.effectiveWindow.end };
  value.coverage = coverage;
  return value;
}

test('strict annotation validation rejects empty, oversized, authority-shaped, and reversed-time input', () => {
  const baseline = adapt(fixture());

  for (const badSummary of ['', 'x'.repeat(513)]) {
    assert.throws(
      () => composeSearchChangeOutcomeCohort(invocation(baseline, undefined, {
        annotation: annotation({ summary: badSummary }),
        evaluatedAt: '2026-09-20T00:00:00.000Z',
      })),
      (error: unknown) => error instanceof SearchChangeError && error.code === 'invalid_input',
    );
  }

  const authorityShaped = {
    ...annotation(),
    scope: owner,
    providerConnectionId: 'forged-provider-connection',
  };
  assert.throws(
    () => composeSearchChangeOutcomeCohort({
      ...invocation(baseline, undefined, { evaluatedAt: '2026-09-20T00:00:00.000Z' }),
      annotation: authorityShaped,
    }),
    (error: unknown) => error instanceof SearchChangeError && error.code === 'invalid_input',
  );

  assert.throws(
    () => composeSearchChangeOutcomeCohort(invocation(baseline, undefined, {
      annotation: annotation({
        occurredAt: '2026-09-16T10:00:00.000Z',
        recordedAt: '2026-09-16T09:00:00.000Z',
      }),
      evaluatedAt: '2026-09-20T00:00:00.000Z',
    })),
    (error: unknown) => error instanceof SearchChangeError && error.code === 'invalid_chronology',
  );
});

test('baseline resolves the exact canonical observation, preserves zero, and enforces change/due chronology', () => {
  const baseline = adapt(fixture());
  const result = composeSearchChangeOutcomeCohort(invocation(baseline, undefined, {
    evaluatedAt: '2026-09-20T00:00:00.000Z',
  }));
  assert.equal(result.baseline.measurement.relationship.role, 'baseline');
  assert.equal(result.baseline.cohortObservationId, result.target.baselineObservationId);
  assert.equal(result.baseline.measurement.methodology.id, SEARCH_CHANGE_METHODOLOGY.id);
  assert.equal(result.baseline.measurement.methodology.version, SEARCH_CHANGE_METHODOLOGY.version);
  assert.equal(result.baseline.measurement.result.state, 'measured');
  if (result.baseline.measurement.result.state === 'measured') {
    assert.deepEqual(result.baseline.measurement.result.observations[0]?.value, {
      state: 'observed',
      value: { type: 'number', value: 0 },
    });
  }
  assert.doesNotThrow(() => parseContract('measurement', result.baseline.measurement));

  assert.throws(
    () => composeSearchChangeOutcomeCohort(invocation(baseline, undefined, {
      annotation: annotation({ occurredAt: '2026-09-14T00:00:00.000Z', recordedAt: '2026-09-16T09:00:00.000Z' }),
      evaluatedAt: '2026-09-20T00:00:00.000Z',
    })),
    (error: unknown) => error instanceof SearchChangeError && error.code === 'invalid_chronology',
  );

  assert.throws(
    () => composeSearchChangeOutcomeCohort(invocation(baseline, undefined, {
      dueWindow: { start: '2026-09-15T23:59:59.000Z', end: '2026-09-30T00:00:00.000Z' },
      evaluatedAt: '2026-09-20T00:00:00.000Z',
    })),
    (error: unknown) => error instanceof SearchChangeError && error.code === 'invalid_chronology',
  );
});

test('no follow-up produces canonical not_due before the due window and not_measured at or after it', () => {
  const baseline = adapt(fixture());

  const before = composeSearchChangeOutcomeCohort(invocation(baseline, undefined, {
    evaluatedAt: '2026-09-20T00:00:00.000Z',
  }));
  assert.equal(before.followUp.measurement.result.state, 'not_due');
  assert.deepEqual(before.readiness, { state: 'not_ready', reasons: ['follow_up_not_due'] });
  assert.doesNotThrow(() => parseContract('measurement', before.followUp.measurement));

  const after = composeSearchChangeOutcomeCohort(invocation(baseline, undefined, {
    evaluatedAt: dueWindow.start,
  }));
  assert.equal(after.followUp.measurement.result.state, 'not_measured');
  assert.deepEqual(after.readiness, { state: 'not_ready', reasons: ['follow_up_not_measured'] });
  assert.doesNotThrow(() => parseContract('measurement', after.followUp.measurement));
});

test('compatible final complete follow-up prepares a measured comparable pair ready for human assessment', () => {
  const baseline = adapt(fixture());
  const followUp = adapt(followUpFixture());
  const result = composeSearchChangeOutcomeCohort(invocation(baseline, followUp));

  assert.equal(result.baseline.measurement.result.state, 'measured');
  assert.equal(result.followUp.measurement.result.state, 'measured');
  assert.equal(result.baseline.measurement.comparability.state, 'comparable');
  assert.equal(result.followUp.measurement.comparability.state, 'comparable');
  assert.deepEqual(result.readiness, { state: 'ready_for_human_assessment' });
  assert.equal(result.followUp.measurement.relationship.role, 'follow_up');
  if (result.followUp.measurement.relationship.role === 'follow_up') {
    assert.equal(result.followUp.measurement.relationship.baselineMeasurementId, result.baseline.measurement.id);
  }
  assert.deepEqual(result.baseline.measurement.methodology, result.followUp.measurement.methodology);
  assert.doesNotThrow(() => parseContract('measurement', result.followUp.measurement));
  assert.equal(Object.hasOwn(result, 'outcome'), false);
});

test('preliminary and incomplete coverage preserve measured evidence while blocking directional readiness', () => {
  const preliminaryBaseline = adapt(setQuality(
    fixture(),
    'preliminary',
    { state: 'complete', truncated: false, anonymized: false },
  ));
  const preliminaryFollow = adapt(setQuality(
    followUpFixture(),
    'preliminary',
    { state: 'complete', truncated: false, anonymized: false },
  ));
  const preliminary = composeSearchChangeOutcomeCohort(invocation(preliminaryBaseline, preliminaryFollow));
  assert.equal(preliminary.followUp.measurement.result.state, 'measured');
  assert.equal(preliminary.followUp.measurement.comparability.state, 'unknown');
  assert.deepEqual(preliminary.readiness, { state: 'not_ready', reasons: ['source_not_final'] });

  for (const state of ['partial', 'unknown'] as const) {
    const coverage = {
      state,
      truncated: true,
      anonymized: true,
      reason: `Synthetic ${state} coverage for Release 0.11.`,
    };
    const baseline = adapt(setQuality(fixture(), 'final', structuredClone(coverage)));
    const followUp = adapt(setQuality(followUpFixture(), 'final', structuredClone(coverage)));
    const result = composeSearchChangeOutcomeCohort(invocation(baseline, followUp));
    assert.equal(result.followUp.measurement.result.state, 'measured');
    assert.equal(result.followUp.measurement.comparability.state, 'unknown');
    assert.deepEqual(result.readiness, {
      state: 'not_ready',
      reasons: ['coverage_incomplete', 'coverage_anonymized', 'coverage_truncated'],
    });
  }
});

test('target absence is not zero and produces an explicit non-measured not-ready state', () => {
  const baseline = adapt(fixture());
  const current = followUpFixture();
  current.rows = current.rows.filter((row: MutableJson) => row.query !== 'synthetic alpha search');
  const followUp = adapt(current);
  const result = composeSearchChangeOutcomeCohort(invocation(baseline, followUp));

  assert.equal(result.followUp.measurement.result.state, 'not_measured');
  assert.deepEqual(result.readiness, { state: 'not_ready', reasons: ['target_missing'] });
  assert.equal(result.target.followUpObservationId, undefined);
  assert.doesNotMatch(JSON.stringify(result.followUp.measurement), /"value":0/);
});

test('Release 0.10 exact compatibility remains authoritative across semantic drift', () => {
  const baseline = adapt(fixture());
  const normalFollow = adapt(followUpFixture());
  const variants: SearchAnalyticsAdaptationResult[] = [];

  const forgedProvider = structuredClone(normalFollow) as any;
  forgedProvider.providerId = 'forged-provider';
  variants.push(forgedProvider);

  variants.push(adapt(followUpFixture(), { providerConnectionId: 'synthetic-other-gsc-connection' }));

  const forgedMethod = structuredClone(normalFollow) as any;
  for (const part of forgedMethod.batches) part.collection.method.configurationRevision = 2;
  variants.push(forgedMethod);

  const forgedSchema = structuredClone(normalFollow) as any;
  for (const part of forgedSchema.batches) part.collection.sourceSchema.version = 'v9.9';
  variants.push(forgedSchema);

  const propertyDrift = followUpFixture();
  propertyDrift.property = 'sc-domain:other.example.test';
  variants.push(adapt(propertyDrift));

  const forgedType = structuredClone(normalFollow) as any;
  forgedType.semantics.searchType = 'image';
  for (const row of forgedType.rows) row.searchType = 'image';
  variants.push(forgedType);

  const forgedDimensions = structuredClone(normalFollow) as any;
  forgedDimensions.semantics.dimensions = ['query'];
  variants.push(forgedDimensions);

  const filterDrift = followUpFixture();
  filterDrift.filters = [{ dimension: 'query', operator: 'contains', expression: 'synthetic' }];
  variants.push(adapt(filterDrift));

  const durationDrift = followUpFixture();
  durationDrift.requestedWindow.start = '2026-09-24T00:00:00.000Z';
  durationDrift.effectiveWindow.start = '2026-09-24T00:00:00.000Z';
  variants.push(adapt(durationDrift));

  for (const candidate of variants) {
    assert.throws(() => composeSearchChangeOutcomeCohort(invocation(baseline, candidate)));
  }
});

test('follow-up before the annotated change fails closed and IDs ignore irrelevant source ordering/formatting', () => {
  const baseline = adapt(fixture());
  const beforeChangeValue = followUpFixture();
  beforeChangeValue.requestedWindow = {
    start: '2026-09-15T00:00:00.000Z',
    end: '2026-09-22T00:00:00.000Z',
  };
  beforeChangeValue.effectiveWindow = structuredClone(beforeChangeValue.requestedWindow);
  beforeChangeValue.freshness = { dataState: 'final', freshThrough: '2026-09-22T00:00:00.000Z' };
  beforeChangeValue.observedAt = '2026-09-23T08:00:00.000Z';
  beforeChangeValue.exportedAt = '2026-09-23T08:05:00.000Z';
  const beforeChange = adapt(beforeChangeValue);
  assert.throws(
    () => composeSearchChangeOutcomeCohort(invocation(baseline, beforeChange)),
    (error: unknown) => error instanceof SearchChangeError && error.code === 'invalid_chronology',
  );

  const baselineReordered = fixture();
  baselineReordered.rows.reverse();
  const followReordered = followUpFixture();
  followReordered.rows.reverse();

  const left = composeSearchChangeOutcomeCohort(invocation(
    adapt(fixture()),
    adapt(followUpFixture()),
  ));
  const rightBaseline = adapt(baselineReordered, {}, true);
  const rightFollow = adapt(followReordered, {}, true);
  const right = composeSearchChangeOutcomeCohort(invocation(rightBaseline, rightFollow));

  assert.equal(left.id, right.id);
  assert.equal(left.baseline.measurement.id, right.baseline.measurement.id);
  assert.equal(left.followUp.measurement.id, right.followUp.measurement.id);
});

test('follow-up identity binds the exact baseline relationship when annotation recordedAt changes', () => {
  const baseline = adapt(fixture());
  const followUp = adapt(followUpFixture());

  const first = composeSearchChangeOutcomeCohort(invocation(baseline, followUp, {
    annotation: annotation({ recordedAt: '2026-09-16T09:00:00.000Z' }),
  }));
  const second = composeSearchChangeOutcomeCohort(invocation(baseline, followUp, {
    annotation: annotation({ recordedAt: '2026-09-16T10:00:00.000Z' }),
  }));

  assert.notEqual(first.baseline.measurement.id, second.baseline.measurement.id);

  assert.equal(first.followUp.measurement.relationship.role, 'follow_up');
  assert.equal(second.followUp.measurement.relationship.role, 'follow_up');
  if (first.followUp.measurement.relationship.role === 'follow_up'
      && second.followUp.measurement.relationship.role === 'follow_up') {
    assert.equal(
      first.followUp.measurement.relationship.baselineMeasurementId,
      first.baseline.measurement.id,
    );
    assert.equal(
      second.followUp.measurement.relationship.baselineMeasurementId,
      second.baseline.measurement.id,
    );
  }

  assert.notEqual(first.followUp.measurement.id, second.followUp.measurement.id);
  assert.notEqual(first.id, second.id);

  assert.doesNotThrow(() => parseContract('measurement', first.baseline.measurement));
  assert.doesNotThrow(() => parseContract('measurement', first.followUp.measurement));
  assert.doesNotThrow(() => parseContract('measurement', second.baseline.measurement));
  assert.doesNotThrow(() => parseContract('measurement', second.followUp.measurement));
});

test('prepared measurements persist through Release 0.8; recommendation scope, human outcome, and Alpha/Beta isolation remain authoritative', async (t) => {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  await evidence.createConnection(alpha, {
    id: providerConnectionId,
    scope: structuredClone(owner),
    providerId: 'google-search-console',
  });
  const review = database.track(new LocalReviewLedgerRepository(database.path));

  const baseline = adapt(fixture());
  const followUp = adapt(followUpFixture());
  for (const part of baseline.batches) await evidence.persistCollection(alpha, structuredClone(part));
  for (const part of followUp.batches) await evidence.persistCollection(alpha, structuredClone(part));

  const baselineRow = baseline.rows.find((row) => row.query === 'synthetic alpha search');
  assert.ok(baselineRow);
  const baselineObservation = observationById(baseline, baselineRow.observationIds.clicks);
  const createdRecommendation = await createHumanRecommendation(review, evidence, alpha, {
    recommendation: recommendation(baselineObservation, 'synthetic-search-change-recommendation'),
  });

  const prepared = composeSearchChangeOutcomeCohort(invocation(baseline, followUp, {
    annotation: annotation({ recommendationId: createdRecommendation.id }),
  }));
  assert.deepEqual(prepared.readiness, { state: 'ready_for_human_assessment' });

  const recordedBaseline = await recordMeasurement(review, evidence, alpha, prepared.baseline);
  const recordedFollowUp = await recordMeasurement(review, evidence, alpha, prepared.followUp);
  assert.equal(recordedBaseline.id, prepared.baseline.measurement.id);
  assert.equal(recordedFollowUp.id, prepared.followUp.measurement.id);

  await assert.rejects(
    recordMeasurement(review, evidence, beta, prepared.baseline),
  );

  const missingAssociation = composeSearchChangeOutcomeCohort(invocation(baseline, followUp, {
    annotation: annotation({
      id: 'synthetic-search-change-missing-recommendation',
      recommendationId: 'synthetic-missing-recommendation',
    }),
  }));
  await assert.rejects(
    recordMeasurement(review, evidence, alpha, missingAssociation.baseline),
    /Recommendation is not present in the measurement\/outcome scope/,
  );

  const humanOutcome: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'synthetic-search-change-human-outcome',
    scope: structuredClone(owner),
    recommendationId: createdRecommendation.id,
    assessment: {
      direction: 'unchanged',
      measurements: [
        { scope: structuredClone(owner), id: recordedBaseline.id },
        { scope: structuredClone(owner), id: recordedFollowUp.id },
      ],
      comparability: 'comparable',
      rationale: 'Synthetic human-declared outcome; Release 0.11 inferred no direction.',
    },
    attribution: {
      strength: 'none',
      reason: 'Synthetic human record makes no causal attribution.',
    },
    createdAt: '2026-10-01T10:00:00.000Z',
  };
  const storedOutcome = await recordHumanOutcome(review, alpha, { outcome: humanOutcome });
  assert.equal(storedOutcome.assessment.direction, 'unchanged');
  assert.equal(Object.hasOwn(prepared, 'outcome'), false);
});
