import { z } from 'zod';
import { identifier, version } from '../contracts/primitives.js';
import { measurementSchema } from '../contracts/wire.js';
import { compareCohorts, parseContract } from '../domain/validate.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';

export const MEASUREMENT_INTERPRETATION_METHODOLOGY = Object.freeze({
  id: 'ldw-measurement-interpretation-claim-ceilings',
  version: '1.0.0',
  release: '0.22.0',
} as const);

const designClass = z.enum([
  'annotated_pre_post', 'normalized_pre_post', 'group_pre_post', 'matched_control_test',
  'randomized_or_balanced_split_test', 'ai_referral_pre_post', 'ai_prompt_cohort_observation',
  'provider_native_experiment', 'other_explicit',
]);
const exposureState = z.enum([
  'not_applicable', 'unknown', 'not_yet_exposed', 'partially_exposed',
  'sufficiently_exposed', 'exposure_discontinuous',
]);
const safeRef = z.string().min(1).max(256).regex(/\S/)
  .regex(/^[^\u0000-\u001F\u007F]*$/);
const methodIdentity = z.strictObject({
  providerId: identifier,
  metricId: identifier,
  metricDefinitionVersion: version,
  methodId: identifier,
  methodVersion: version,
  model: identifier.optional(),
  location: identifier.optional(),
  promptCohortId: identifier.optional(),
  promptCohortRevision: z.number().int().min(1).max(1_000_000).optional(),
  entitySetId: identifier.optional(),
  entitySetRevision: z.number().int().min(1).max(1_000_000).optional(),
});
const qualityContext = z.strictObject({
  preliminary: z.boolean(),
  partial: z.boolean(),
  truncated: z.boolean(),
  anonymized: z.boolean(),
});
const externalResult = z.strictObject({
  providerId: identifier,
  methodId: identifier,
  methodVersion: version,
  statisticName: identifier,
  statisticValue: safeRef,
  resultReference: identifier,
  acceptedByCaller: z.boolean(),
});
const inputSchema = z.strictObject({
  designClass,
  exposure: z.strictObject({
    state: exposureState,
    methodId: identifier.optional(),
    methodVersion: version.optional(),
    evidenceReference: identifier.optional(),
  }),
  measurements: z.tuple([measurementSchema, measurementSchema]),
  methodContext: z.strictObject({
    baseline: methodIdentity,
    followUp: methodIdentity,
    normalizationMethodId: identifier.optional(),
    normalizationMethodVersion: version.optional(),
    controlCohortId: identifier.optional(),
    testCohortId: identifier.optional(),
    controlCount: z.number().int().min(1).max(1_000_000).optional(),
    testCount: z.number().int().min(1).max(1_000_000).optional(),
    balancedOrRandomized: z.boolean().optional(),
  }),
  quality: qualityContext,
  externalResult: externalResult.optional(),
});

export type MeasurementDesignClass = z.infer<typeof designClass>;
export type MeasurementExposureState = z.infer<typeof exposureState>;
export type MeasurementClaimCeiling =
  | 'not_interpretable'
  | 'descriptive_observation_only'
  | 'temporal_association_only'
  | 'normalized_association_only'
  | 'controlled_effect_consistent'
  | 'bounded_experimental_effect_consistent'
  | 'ai_referral_change_only'
  | 'ai_prompt_cohort_change_only';
export type MeasurementInterpretationErrorCode = 'invalid_input' | 'invalid_output';

export class MeasurementInterpretationError extends Error {
  override name = 'MeasurementInterpretationError';

  constructor(readonly code: MeasurementInterpretationErrorCode) {
    super(code === 'invalid_input'
      ? 'Measurement interpretation input is invalid, unsupported, or exceeds its bound.'
      : 'Measurement interpretation output exceeds its bound.');
  }
}

export interface MeasurementInterpretationProfile {
  readonly id: string;
  readonly methodology: typeof MEASUREMENT_INTERPRETATION_METHODOLOGY;
  readonly designClass: MeasurementDesignClass;
  readonly exposure: z.infer<typeof inputSchema>['exposure'];
  readonly comparability: {
    readonly state: 'comparable' | 'unknown' | 'discontinuous';
    readonly reasons: readonly string[];
    readonly baselineMeasurementId: string;
    readonly followUpMeasurementId: string;
  };
  readonly methodContext: z.infer<typeof inputSchema>['methodContext'];
  readonly measurements: readonly unknown[];
  readonly readiness: 'ready' | 'limited' | 'blocked';
  readonly claimCeiling: MeasurementClaimCeiling;
  readonly allowedClaimCodes: readonly string[];
  readonly prohibitedOverclaimCodes: readonly string[];
  readonly limitations: readonly string[];
  readonly externalResult?: z.infer<typeof externalResult>;
}

const MAX_INPUT_BYTES = 65_536;
const MAX_OUTPUT_BYTES = 131_072;

function orderedMeasurement(value: z.infer<typeof measurementSchema>): unknown {
  if (value.result.state !== 'measured') return value;
  const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
  return {
    ...value,
    result: {
      ...value.result,
      observations: [...value.result.observations].sort((a, b) =>
        compareText(canonicalJson(a.reference), canonicalJson(b.reference))
        || compareText(a.reference.id, b.reference.id)),
    },
  };
}

function contextChanged(input: z.infer<typeof inputSchema>): boolean {
  return canonicalJson(input.methodContext.baseline) !== canonicalJson(input.methodContext.followUp);
}

function build(input: z.infer<typeof inputSchema>): MeasurementInterpretationProfile {
  const [baseline, followUp] = input.measurements;
  const reasons = new Set<string>();
  const limitations = new Set<string>(['human_outcome_required_for_outcome_recording']);
  const cohort = compareCohorts(baseline.cohort, followUp.cohort);
  let comparison: 'comparable' | 'unknown' | 'discontinuous' = 'comparable';
  if (baseline.comparability.state !== 'comparable' || followUp.comparability.state !== 'comparable') {
    const values = [baseline.comparability, followUp.comparability];
    comparison = values.some((item) => item.state === 'discontinuous') ? 'discontinuous' : 'unknown';
    reasons.add(comparison === 'unknown' ? 'canonical_measurement_comparability_unknown' : 'canonical_measurement_discontinuous');
  }
  if (cohort.state !== 'comparable') {
    comparison = cohort.state === 'unknown' ? 'unknown' : 'discontinuous';
    reasons.add(cohort.state === 'unknown' ? 'canonical_cohort_comparability_unknown' : 'canonical_cohort_discontinuous');
  }
  if (contextChanged(input)) {
    comparison = 'discontinuous';
    reasons.add('source_or_method_context_changed');
  }
  if (input.designClass === 'ai_prompt_cohort_observation') {
    const before = input.methodContext.baseline;
    const after = input.methodContext.followUp;
    if (before.promptCohortId !== after.promptCohortId || before.promptCohortRevision !== after.promptCohortRevision) reasons.add('prompt_cohort_changed');
    if (before.entitySetId !== after.entitySetId || before.entitySetRevision !== after.entitySetRevision) reasons.add('entity_set_changed');
    if (before.providerId !== after.providerId || before.model !== after.model || before.location !== after.location) reasons.add('provider_model_or_location_changed');
    if (before.metricId !== after.metricId || before.metricDefinitionVersion !== after.metricDefinitionVersion
      || before.methodId !== after.methodId || before.methodVersion !== after.methodVersion) reasons.add('metric_or_methodology_changed');
  }
  const rolesValid = baseline.relationship.role === 'baseline'
    && followUp.relationship.role === 'follow_up'
    && followUp.relationship.baselineMeasurementId === baseline.id;
  if (!rolesValid) {
    comparison = 'unknown';
    reasons.add('canonical_measurement_relationship_invalid');
  }
  if (baseline.result.state !== 'measured' || followUp.result.state !== 'measured') {
    comparison = 'unknown';
    reasons.add('canonical_measurement_result_unavailable');
  } else {
    if (baseline.result.observations.some((item) => item.value.state !== 'observed')
      || followUp.result.observations.some((item) => item.value.state !== 'observed')) {
      comparison = 'unknown';
      reasons.add('canonical_measurement_observation_missing');
    }
    if (Date.parse(baseline.result.observedWindow.end) > Date.parse(followUp.result.observedWindow.start)) {
      comparison = 'discontinuous';
      reasons.add('canonical_measurement_windows_overlap_or_reverse');
    }
    if (canonicalJson(baseline.methodology) !== canonicalJson(followUp.methodology)) {
      comparison = 'discontinuous';
      reasons.add('canonical_measurement_methodology_changed');
    }
  }
  if (input.quality.preliminary) reasons.add('source_preliminary');
  if (input.quality.partial) reasons.add('source_partial');
  if (input.quality.truncated) reasons.add('source_truncated');
  if (input.quality.anonymized) reasons.add('source_anonymized');
  const qualityLimited = input.quality.preliminary || input.quality.partial
    || input.quality.truncated || input.quality.anonymized;
  const exposureBlocksEffect = input.exposure.state === 'not_yet_exposed'
    || input.exposure.state === 'partially_exposed'
    || input.exposure.state === 'exposure_discontinuous';
  if (input.exposure.state === 'not_yet_exposed') reasons.add('exposure_not_yet_observed');
  if (input.exposure.state === 'partially_exposed') reasons.add('exposure_partial');
  if (input.exposure.state === 'exposure_discontinuous') reasons.add('exposure_discontinuous');
  if (input.exposure.state === 'unknown') reasons.add('exposure_unknown');
  if (exposureBlocksEffect) limitations.add('exposure_does_not_support_effect_interpretation');
  if (qualityLimited) limitations.add('source_quality_limits_interpretation');
  if (input.externalResult !== undefined) limitations.add('external_statistic_preserved_without_recomputation');
  limitations.add('no_business_or_revenue_causality');
  limitations.add('no_universal_visibility_or_cross_provider_claim');

  let ceiling: MeasurementClaimCeiling;
  if (comparison !== 'comparable') {
    ceiling = 'not_interpretable';
  } else if (input.designClass === 'ai_referral_pre_post') {
    ceiling = 'ai_referral_change_only';
  } else if (input.designClass === 'ai_prompt_cohort_observation') {
    const before = input.methodContext.baseline;
    const promptIdentityComplete = before.promptCohortId !== undefined
      && before.promptCohortRevision !== undefined && before.providerId !== undefined
      && before.model !== undefined && before.location !== undefined
      && before.entitySetId !== undefined && before.entitySetRevision !== undefined;
    ceiling = promptIdentityComplete && !qualityLimited ? 'ai_prompt_cohort_change_only' : 'descriptive_observation_only';
    if (!promptIdentityComplete) reasons.add('ai_prompt_cohort_identity_incomplete');
  } else if (qualityLimited || exposureBlocksEffect) {
    ceiling = 'descriptive_observation_only';
  } else if (input.designClass === 'randomized_or_balanced_split_test'
      || input.designClass === 'provider_native_experiment') {
    const acceptedResult = input.externalResult?.acceptedByCaller === true;
    const balanced = input.methodContext.balancedOrRandomized === true
      && input.methodContext.controlCohortId !== undefined
      && input.methodContext.testCohortId !== undefined;
    ceiling = input.exposure.state === 'sufficiently_exposed' && acceptedResult && balanced
      ? 'bounded_experimental_effect_consistent' : 'descriptive_observation_only';
    if (!acceptedResult) reasons.add('accepted_external_result_required');
    if (!balanced) reasons.add('balanced_or_randomized_cohorts_required');
  } else if (input.designClass === 'matched_control_test') {
    const matched = input.methodContext.controlCohortId !== undefined
      && input.methodContext.testCohortId !== undefined;
    ceiling = matched && (input.exposure.state === 'unknown' || input.exposure.state === 'sufficiently_exposed')
      ? 'controlled_effect_consistent' : 'descriptive_observation_only';
    if (!matched) reasons.add('matched_control_and_test_cohorts_required');
  } else if (input.designClass === 'normalized_pre_post') {
    const normalized = input.methodContext.normalizationMethodId !== undefined
      && input.methodContext.normalizationMethodVersion !== undefined;
    ceiling = normalized ? 'normalized_association_only' : 'temporal_association_only';
    if (!normalized) reasons.add('normalization_method_not_supplied');
  } else if (input.designClass === 'annotated_pre_post' || input.designClass === 'group_pre_post') {
    ceiling = 'temporal_association_only';
  } else {
    ceiling = 'descriptive_observation_only';
  }

  if (input.designClass !== 'ai_prompt_cohort_observation' && input.designClass !== 'ai_referral_pre_post'
    && input.exposure.state === 'not_applicable') reasons.add('exposure_not_applicable_to_design');
  if (qualityLimited && ceiling !== 'not_interpretable') ceiling = 'descriptive_observation_only';
  const readiness = ceiling === 'not_interpretable' ? 'blocked'
    : (ceiling === 'descriptive_observation_only' || exposureBlocksEffect || qualityLimited ? 'limited' : 'ready');
  const allowedClaimCodes = ceiling === 'not_interpretable' ? ['no_change_claim_supported']
    : ceiling === 'temporal_association_only' ? ['observed_temporal_change']
      : ceiling === 'normalized_association_only' ? ['observed_normalized_association']
        : ceiling === 'controlled_effect_consistent' ? ['controlled_effect_consistent_under_supplied_method']
          : ceiling === 'bounded_experimental_effect_consistent' ? ['bounded_experimental_effect_consistent_under_supplied_method']
            : ceiling === 'ai_referral_change_only' ? ['ai_referral_metric_change']
              : ceiling === 'ai_prompt_cohort_change_only' ? ['frozen_ai_prompt_cohort_metric_change']
                : ['exact_observation_description'];
  const id = `measurement-interpretation:${hashCanonicalJson({
    methodology: MEASUREMENT_INTERPRETATION_METHODOLOGY,
    input: { ...input, measurements: input.measurements.map(orderedMeasurement) },
  })}`;
  return {
    id,
    methodology: MEASUREMENT_INTERPRETATION_METHODOLOGY,
    designClass: input.designClass,
    exposure: input.exposure,
    comparability: {
      state: comparison,
      reasons: [...reasons].sort(),
      baselineMeasurementId: baseline.id,
      followUpMeasurementId: followUp.id,
    },
    methodContext: input.methodContext,
    measurements: input.measurements.map(orderedMeasurement),
    readiness,
    claimCeiling: ceiling,
    allowedClaimCodes,
    prohibitedOverclaimCodes: [
      'causal_attribution', 'business_or_revenue_causality', 'universal_visibility',
      'cross_provider_equivalence', 'automatic_recommendation_or_action',
    ],
    limitations: [...limitations].sort(),
    ...(input.externalResult === undefined ? {} : { externalResult: input.externalResult }),
  };
}

/** Pure/local, bounded interpretation of canonical measurement records. */
export function interpretMeasurement(input: unknown): MeasurementInterpretationProfile {
  try {
    const inputJson = canonicalJson(input);
    if (Buffer.byteLength(inputJson, 'utf8') > MAX_INPUT_BYTES) throw new Error('input_bound');
    const parsed = inputSchema.parse(input);
    const measurements = parsed.measurements.map((item) => parseContract('measurement', item)) as [
      z.infer<typeof measurementSchema>, z.infer<typeof measurementSchema>,
    ];
    const output = build({ ...parsed, measurements });
    if (Buffer.byteLength(canonicalJson(output), 'utf8') > MAX_OUTPUT_BYTES) {
      throw new MeasurementInterpretationError('invalid_output');
    }
    return structuredClone(output);
  } catch (error) {
    if (error instanceof MeasurementInterpretationError) throw error;
    throw new MeasurementInterpretationError('invalid_input');
  }
}
