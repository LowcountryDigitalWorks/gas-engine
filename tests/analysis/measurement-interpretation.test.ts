import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import {
  interpretMeasurement,
  MeasurementInterpretationError,
} from '../../src/analysis/measurement-interpretation.js';

const scope = { tenantId: 'synthetic-tenant', siteId: 'synthetic-site', siteScopeRevisionId: 'synthetic-scope-r1' };
const context = {
  scope,
  subject: { kind: 'site' as const, reference: 'synthetic-site' },
  metric: { id: 'synthetic-clicks', meaningVersion: '1.0.0', valueType: 'number' as const, unit: 'clicks' },
  dimensions: { providerId: 'synthetic-search-provider' },
  method: { id: 'synthetic-search-method', version: '1.0.0', configurationId: 'synthetic-config', configurationRevision: 1 },
  timeWindowRules: { id: 'synthetic-week', version: '1.0.0', alignment: 'calendar' as const, durationSeconds: 604800, timezone: 'UTC' },
};
const baseContext = {
  providerId: 'synthetic-search-provider', metricId: 'synthetic-clicks', metricDefinitionVersion: '1.0.0',
  methodId: 'synthetic-search-method', methodVersion: '1.0.0', metricClass: 'search_analytics',
};

function measurement(id: string, role: 'baseline' | 'follow_up', overrides: Partial<Contract<'measurement'>> = {}): Contract<'measurement'> {
  const baseline = role === 'baseline';
  const window = baseline
    ? { start: '2026-09-01T00:00:00.000Z', end: '2026-09-08T00:00:00.000Z' }
    : { start: '2026-09-08T00:00:00.000Z', end: '2026-09-15T00:00:00.000Z' };
  const value: Contract<'measurement'> = {
    schemaVersion: '1.0', kind: 'measurement', id,
    cohort: { schemaVersion: '1.0', kind: 'cohort', id: 'synthetic-cohort', revision: 1, context },
    relationship: baseline ? { role: 'baseline' } : { role: 'follow_up', baselineMeasurementId: 'synthetic-baseline' },
    dueWindow: window,
    result: {
      state: 'measured', observedWindow: window,
      observations: [{ reference: { scope, id: baseline ? 'synthetic-observation-baseline' : 'synthetic-observation-followup' }, value: { state: 'observed', value: { type: 'number', value: baseline ? 10 : 12 } } }],
    },
    comparability: { state: 'comparable' }, methodology: { id: 'synthetic-measurement', version: '1.0.0' },
    createdAt: baseline ? '2026-09-08T00:01:00.000Z' : '2026-09-15T00:01:00.000Z',
    ...overrides,
  };
  return value;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    designClass: 'annotated_pre_post',
    exposure: { state: 'unknown' },
    measurements: [measurement('synthetic-baseline', 'baseline'), measurement('synthetic-followup', 'follow_up')],
    methodContext: { baseline: baseContext, followUp: baseContext },
    quality: { preliminary: false, partial: false, truncated: false, anonymized: false },
    ...overrides,
  };
}

function armPair(prefix: string, cohortId: string) {
  const baselineId = `${prefix}-baseline`;
  return [
    measurement(baselineId, 'baseline', { cohort: { schemaVersion: '1.0', kind: 'cohort', id: cohortId, revision: 1, context } }),
    measurement(`${prefix}-followup`, 'follow_up', {
      cohort: { schemaVersion: '1.0', kind: 'cohort', id: cohortId, revision: 1, context },
      relationship: { role: 'follow_up', baselineMeasurementId: baselineId },
    }),
  ] as const;
}
const matchedArms = { control: armPair('synthetic-control', 'synthetic-control'), test: armPair('synthetic-test', 'synthetic-test') };

test('comparable annotated pre/post with unknown exposure supports temporal association only', () => {
  const result = interpretMeasurement(input());
  assert.equal(result.claimCeiling, 'temporal_association_only');
  assert.equal(result.readiness, 'ready');
  assert.ok(result.prohibitedOverclaimCodes.includes('causal_attribution'));
});

test('sufficient crawl exposure does not raise a pre/post design to causal language', () => {
  const result = interpretMeasurement(input({ exposure: { state: 'sufficiently_exposed', methodId: 'synthetic-crawl', methodVersion: '1.0.0', evidenceReference: 'synthetic-exposure' } }));
  assert.equal(result.claimCeiling, 'temporal_association_only');
});

test('normalized pre/post retains a normalized association ceiling without a causal claim', () => {
  const result = interpretMeasurement(input({ designClass: 'normalized_pre_post', methodContext: {
    baseline: baseContext, followUp: baseContext, normalizationMethodId: 'synthetic-normalizer', normalizationMethodVersion: '1.0.0',
  } }));
  assert.equal(result.claimCeiling, 'normalized_association_only');
});

test('matched concurrent canonical arms yield only a controlled-effect-consistent ceiling', () => {
  const result = interpretMeasurement(input({ designClass: 'matched_control_test', methodContext: {
    baseline: baseContext, followUp: baseContext, controlCohortId: 'synthetic-control', testCohortId: 'synthetic-test', controlCount: 8, testCount: 8,
  }, armEvidence: matchedArms }));
  assert.equal(result.claimCeiling, 'controlled_effect_consistent');
  assert.ok(result.prohibitedOverclaimCodes.includes('business_or_revenue_causality'));
});

test('caller arm labels or misaligned canonical arms cannot create a controlled claim', () => {
  const contextOnly = interpretMeasurement(input({ designClass: 'matched_control_test', methodContext: {
    baseline: baseContext, followUp: baseContext, controlCohortId: 'synthetic-control', testCohortId: 'synthetic-test', controlCount: 8, testCount: 8,
  } }));
  assert.equal(contextOnly.claimCeiling, 'descriptive_observation_only');
  const misaligned = structuredClone(matchedArms);
  const shiftedWindow = { start: '2026-09-02T00:00:00.000Z', end: '2026-09-09T00:00:00.000Z' };
  misaligned.test[0].dueWindow = shiftedWindow;
  misaligned.test[0].createdAt = '2026-09-09T00:01:00.000Z';
  if (misaligned.test[0].result.state === 'measured') misaligned.test[0].result.observedWindow = shiftedWindow;
  const result = interpretMeasurement(input({ designClass: 'matched_control_test', methodContext: {
    baseline: baseContext, followUp: baseContext, controlCohortId: 'synthetic-control', testCohortId: 'synthetic-test',
  }, armEvidence: misaligned }));
  assert.equal(result.claimCeiling, 'descriptive_observation_only');
  const crossScope = structuredClone(matchedArms);
  for (const item of crossScope.test) {
    item.cohort.context = structuredClone(item.cohort.context);
    item.cohort.context.scope.siteId = 'synthetic-other-site';
    item.cohort.context.subject.reference = 'synthetic-other-site';
    if (item.result.state === 'measured') {
      for (const observation of item.result.observations) observation.reference.scope = structuredClone(item.cohort.context.scope);
    }
  }
  const mismatched = interpretMeasurement(input({ designClass: 'matched_control_test', methodContext: {
    baseline: baseContext, followUp: baseContext, controlCohortId: 'synthetic-control', testCohortId: 'synthetic-test',
  }, armEvidence: crossScope }));
  assert.equal(mismatched.claimCeiling, 'descriptive_observation_only');
  const crossMethodology = structuredClone(matchedArms);
  for (const item of crossMethodology.test) {
    item.methodology = { id: 'synthetic-different-methodology', version: '2.0.0' };
  }
  const differentMethod = interpretMeasurement(input({ designClass: 'matched_control_test', methodContext: {
    baseline: baseContext, followUp: baseContext, controlCohortId: 'synthetic-control', testCohortId: 'synthetic-test',
  }, armEvidence: crossMethodology }));
  assert.equal(differentMethod.claimCeiling, 'descriptive_observation_only');
});

test('balanced experiment requires sufficient exposure and caller-accepted external result, preserved exactly', () => {
  const supplied = { providerId: baseContext.providerId, methodId: baseContext.methodId, methodVersion: baseContext.methodVersion, statisticName: 'p-value', statisticValue: '0.031', resultReference: 'synthetic-result', acceptedByCaller: true, measurementIds: ['synthetic-control-baseline', 'synthetic-control-followup', 'synthetic-test-baseline', 'synthetic-test-followup'] };
  const result = interpretMeasurement(input({ designClass: 'randomized_or_balanced_split_test', exposure: { state: 'sufficiently_exposed' }, methodContext: {
    baseline: baseContext, followUp: baseContext, controlCohortId: 'synthetic-control', testCohortId: 'synthetic-test', balancedOrRandomized: true, controlCount: 8, testCount: 8,
  }, armEvidence: matchedArms, externalResult: supplied }));
  assert.equal(result.claimCeiling, 'bounded_experimental_effect_consistent');
  assert.deepEqual(result.externalResult, supplied);
  assert.ok(result.prohibitedOverclaimCodes.includes('business_or_revenue_causality'));
});

test('experimental ceiling fails closed when external result IDs do not bind to arm evidence', () => {
  const result = interpretMeasurement(input({ designClass: 'randomized_or_balanced_split_test', exposure: { state: 'sufficiently_exposed' }, methodContext: {
    baseline: baseContext, followUp: baseContext, controlCohortId: 'synthetic-control', testCohortId: 'synthetic-test', balancedOrRandomized: true, controlCount: 8, testCount: 8,
  }, armEvidence: matchedArms, externalResult: {
    providerId: baseContext.providerId, methodId: baseContext.methodId, methodVersion: baseContext.methodVersion,
    statisticName: 'p-value', statisticValue: '0.031', resultReference: 'synthetic-result', acceptedByCaller: true,
    measurementIds: ['synthetic-control-baseline', 'synthetic-test-baseline', 'synthetic-control-followup', 'synthetic-test-followup'],
  } }));
  assert.equal(result.claimCeiling, 'descriptive_observation_only');
});

test('AI referral measurement is limited to the exact referral metric', () => {
  const referral = { ...baseContext, metricClass: 'ai_referral_acquisition' };
  const result = interpretMeasurement(input({ designClass: 'ai_referral_pre_post', methodContext: { baseline: referral, followUp: referral } }));
  assert.equal(result.claimCeiling, 'ai_referral_change_only');
  assert.ok(result.prohibitedOverclaimCodes.includes('universal_visibility'));
  assert.equal(interpretMeasurement(input({ designClass: 'ai_referral_pre_post' })).claimCeiling, 'descriptive_observation_only');
  const mismatchedCanonicalMetric = { ...referral, metricId: 'synthetic-ai-referrals' };
  const mismatch = interpretMeasurement(input({ designClass: 'ai_referral_pre_post', methodContext: {
    baseline: mismatchedCanonicalMetric, followUp: mismatchedCanonicalMetric,
  } }));
  assert.equal(mismatch.claimCeiling, 'not_interpretable');
  assert.ok(mismatch.comparability.reasons.includes('canonical_source_context_mismatch'));
});

test('frozen prompt cohort permits only exact cohort claims and changed identity blocks comparison', () => {
  const identity = { ...baseContext, model: 'synthetic-model', location: 'synthetic-location', promptCohortId: 'synthetic-prompts', promptCohortRevision: 1, entitySetId: 'synthetic-entities', entitySetRevision: 1 };
  const stable = interpretMeasurement(input({ designClass: 'ai_prompt_cohort_observation', methodContext: { baseline: identity, followUp: identity } }));
  assert.equal(stable.claimCeiling, 'ai_prompt_cohort_change_only');
  const changed = interpretMeasurement(input({ designClass: 'ai_prompt_cohort_observation', methodContext: {
    baseline: identity, followUp: { ...identity, promptCohortRevision: 2 },
  } }));
  assert.equal(changed.claimCeiling, 'not_interpretable');
  assert.ok(changed.comparability.reasons.includes('prompt_cohort_changed'));
  for (const field of ['entitySetRevision', 'model', 'methodVersion'] as const) {
    const changedIdentity = { ...identity, [field]: field === 'entitySetRevision' ? 2 : 'synthetic-changed' };
    const profile = interpretMeasurement(input({ designClass: 'ai_prompt_cohort_observation', methodContext: {
      baseline: identity, followUp: changedIdentity,
    } }));
    assert.equal(profile.claimCeiling, 'not_interpretable', field);
  }
});

test('canonical measurement comparability cannot be upgraded by design label', () => {
  const baseline = measurement('synthetic-baseline', 'baseline', { comparability: { state: 'unknown', reason: 'synthetic-not-known' } });
  const result = interpretMeasurement(input({ measurements: [baseline, measurement('synthetic-followup', 'follow_up')] }));
  assert.equal(result.claimCeiling, 'not_interpretable');
  assert.equal(result.comparability.state, 'unknown');
});

test('partial, preliminary, truncated, and anonymized context lowers the claim ceiling', () => {
  for (const key of ['preliminary', 'partial', 'truncated', 'anonymized']) {
    const result = interpretMeasurement(input({ quality: { preliminary: false, partial: false, truncated: false, anonymized: false, [key]: true } }));
    assert.equal(result.claimCeiling, 'descriptive_observation_only', key);
  }
});

test('not-yet, partial, and discontinuous exposure never support strong effect claims', () => {
  for (const state of ['not_yet_exposed', 'partially_exposed', 'exposure_discontinuous']) {
    const result = interpretMeasurement(input({ designClass: 'matched_control_test', exposure: { state }, methodContext: {
      baseline: baseContext, followUp: baseContext, controlCohortId: 'synthetic-control', testCohortId: 'synthetic-test',
    } }));
    assert.equal(result.claimCeiling, 'descriptive_observation_only', state);
  }
});

test('changed source method or provider context is a discontinuity', () => {
  const result = interpretMeasurement(input({ methodContext: { baseline: baseContext, followUp: { ...baseContext, methodVersion: '2.0.0' } } }));
  assert.equal(result.claimCeiling, 'not_interpretable');
  assert.equal(result.comparability.state, 'discontinuous');
});

test('all frozen first-release design and exposure taxonomies are accepted', () => {
  const designs = [
    'annotated_pre_post', 'normalized_pre_post', 'group_pre_post', 'matched_control_test',
    'randomized_or_balanced_split_test', 'ai_referral_pre_post', 'ai_prompt_cohort_observation',
    'provider_native_experiment', 'other_explicit',
  ];
  const exposures = ['not_applicable', 'unknown', 'not_yet_exposed', 'partially_exposed', 'sufficiently_exposed', 'exposure_discontinuous'];
  for (const designClass of designs) {
    const methodIdentity = designClass === 'ai_prompt_cohort_observation'
      ? { ...baseContext, model: 'synthetic-model', location: 'synthetic-location', promptCohortId: 'synthetic-prompts', promptCohortRevision: 1, entitySetId: 'synthetic-entities', entitySetRevision: 1 }
      : baseContext;
    const result = interpretMeasurement(input({ designClass, methodContext: { baseline: methodIdentity, followUp: methodIdentity } }));
    assert.equal(result.designClass, designClass);
  }
  for (const state of exposures) {
    assert.equal(interpretMeasurement(input({ exposure: { state } })).exposure.state, state);
  }
});

test('unknown fields and oversized input fail closed', () => {
  assert.throws(() => interpretMeasurement({ ...input(), future: true }), (error: unknown) => error instanceof MeasurementInterpretationError && error.code === 'invalid_input');
  assert.throws(() => interpretMeasurement(input({ padding: 'x'.repeat(66_000) })), (error: unknown) => error instanceof MeasurementInterpretationError && error.code === 'invalid_input');
});

test('unordered measurement observations do not change identity and output is plain cloneable JSON', () => {
  const first = measurement('synthetic-baseline', 'baseline');
  const second = structuredClone(first);
  if (first.result.state !== 'measured' || second.result.state !== 'measured') throw new Error('fixture error');
  const extra = structuredClone(first.result.observations[0]!);
  extra.reference.id = 'synthetic-observation-extra';
  first.result.observations.push(extra);
  second.result.observations.unshift(extra);
  const profileA = interpretMeasurement(input({ measurements: [first, measurement('synthetic-followup', 'follow_up')] }));
  const profileB = interpretMeasurement(input({ measurements: [second, measurement('synthetic-followup', 'follow_up')] }));
  assert.equal(profileA.id, profileB.id);
  assert.deepEqual(profileA, profileB);
  assert.deepEqual(structuredClone(profileA), profileA);
  assert.equal(JSON.parse(JSON.stringify(profileA)).id, profileA.id);
});

test('result relationships and result state are retained as canonical gates', () => {
  const followup = measurement('synthetic-followup', 'follow_up', {
    relationship: { role: 'follow_up', baselineMeasurementId: 'other-baseline' },
  });
  const result = interpretMeasurement(input({ measurements: [measurement('synthetic-baseline', 'baseline'), followup] }));
  assert.equal(result.claimCeiling, 'not_interpretable');
  assert.ok(result.comparability.reasons.includes('canonical_measurement_relationship_invalid'));
});
