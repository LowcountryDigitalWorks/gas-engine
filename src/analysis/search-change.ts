import { z } from 'zod';
import { identifier, timeWindow, timestamp } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { compareCohorts, parseContract } from '../domain/validate.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import {
  type SearchAnalyticsAdaptationResult,
  type SearchAnalyticsMetricKey,
} from '../adapters/search-analytics.js';
import {
  requireSearchAnalyticsCompatibility,
  validateSearchAnalyticsWindow,
  type ValidatedSearchAnalyticsRow,
  type ValidatedSearchAnalyticsWindow,
} from './search-analytics.js';

export const SEARCH_CHANGE_METHODOLOGY = Object.freeze({
  id: 'ldw-search-change-cohort',
  version: '1.0.0',
} as const);

const metricKey = z.enum(['clicks', 'impressions', 'ctr', 'averagePosition']);
const summary = z.string()
  .min(1)
  .max(512)
  .regex(/\S/)
  .regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/);

const annotationSchema = z.strictObject({
  id: identifier,
  occurredAt: timestamp,
  recordedAt: timestamp,
  summary,
  recommendationId: identifier.optional(),
});

const invocationSchema = z.strictObject({
  annotation: annotationSchema,
  baseline: z.unknown(),
  baselineRowIdentity: identifier,
  metric: metricKey,
  dueWindow: timeWindow,
  evaluatedAt: timestamp,
  followUp: z.unknown().optional(),
});

export type SearchChangeAnnotation = z.infer<typeof annotationSchema>;

export type SearchChangeReadinessReason =
  | 'follow_up_not_due'
  | 'follow_up_not_measured'
  | 'target_missing'
  | 'source_not_final'
  | 'coverage_incomplete'
  | 'coverage_anonymized'
  | 'coverage_truncated'
  | 'incomparable'
  | 'invalid_chronology';

export type SearchChangeErrorCode =
  | 'invalid_input'
  | 'target_not_found'
  | 'invalid_chronology'
  | 'invalid_output';

export class SearchChangeError extends Error {
  override name = 'SearchChangeError';

  constructor(
    readonly code: SearchChangeErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface PreparedSearchChangeMeasurement {
  readonly measurement: Contract<'measurement'>;
  readonly cohortObservationId: string;
  readonly recommendationId?: string;
}

export interface SearchChangeOutcomeCohort {
  readonly id: string;
  readonly annotation: SearchChangeAnnotation;
  readonly target: {
    readonly rowIdentity: string;
    readonly query: string;
    readonly page: string;
    readonly metric: SearchAnalyticsMetricKey;
    readonly baselineObservationId: string;
    readonly followUpObservationId?: string;
  };
  readonly baseline: PreparedSearchChangeMeasurement;
  readonly followUp: PreparedSearchChangeMeasurement;
  readonly readiness:
    | { readonly state: 'ready_for_human_assessment' }
    | { readonly state: 'not_ready'; readonly reasons: readonly SearchChangeReadinessReason[] };
}

interface ParsedInvocation {
  readonly annotation: SearchChangeAnnotation;
  readonly baseline: SearchAnalyticsAdaptationResult;
  readonly baselineRowIdentity: string;
  readonly metric: SearchAnalyticsMetricKey;
  readonly dueWindow: { readonly start: string; readonly end: string };
  readonly evaluatedAt: string;
  readonly followUp?: SearchAnalyticsAdaptationResult;
}

function fail(code: SearchChangeErrorCode, message: string): never {
  throw new SearchChangeError(code, message);
}

function parseInvocation(input: unknown): ParsedInvocation {
  let parsed: z.infer<typeof invocationSchema>;
  try {
    parsed = invocationSchema.parse(input);
    canonicalJson(parsed.annotation);
  } catch {
    fail('invalid_input', 'Search-change invocation or annotation is invalid.');
  }

  if (parsed.annotation.occurredAt > parsed.annotation.recordedAt) {
    fail('invalid_chronology', 'Change annotation recordedAt cannot precede occurredAt.');
  }
  if (parsed.dueWindow.start > parsed.dueWindow.end) {
    fail('invalid_chronology', 'Search-change dueWindow timestamps are reversed.');
  }
  if (parsed.dueWindow.start < parsed.annotation.occurredAt) {
    fail('invalid_chronology', 'Search-change dueWindow cannot begin before the annotated change.');
  }
  if (parsed.evaluatedAt < parsed.annotation.recordedAt) {
    fail('invalid_chronology', 'Search-change evaluation cannot precede annotation recording.');
  }

  return {
    annotation: parsed.annotation,
    baseline: parsed.baseline as SearchAnalyticsAdaptationResult,
    baselineRowIdentity: parsed.baselineRowIdentity,
    metric: parsed.metric,
    dueWindow: parsed.dueWindow,
    evaluatedAt: parsed.evaluatedAt,
    ...(parsed.followUp === undefined ? {} : { followUp: parsed.followUp as SearchAnalyticsAdaptationResult }),
  };
}

function findRow(
  window: ValidatedSearchAnalyticsWindow,
  rowIdentity: string,
): ValidatedSearchAnalyticsRow | undefined {
  return window.rows.find((row) => row.sidecar.rowIdentity === rowIdentity);
}

function resolveObservation(
  input: SearchAnalyticsAdaptationResult,
  row: ValidatedSearchAnalyticsRow,
  metric: SearchAnalyticsMetricKey,
): Contract<'observation'> {
  const observationId = row.sidecar.observationIds[metric];
  let resolved: Contract<'observation'> | undefined;
  for (const batch of input.batches) {
    for (const observation of batch.observations) {
      if (observation.record.id !== observationId) continue;
      if (resolved !== undefined) fail('invalid_output', 'Selected search observation is duplicated across adapted parts.');
      resolved = parseContract('observation', observation.record);
    }
  }
  if (resolved === undefined) fail('invalid_output', 'Selected search observation cannot be reconstructed.');
  return resolved;
}

function qualityReasons(
  ...windows: ValidatedSearchAnalyticsWindow[]
): SearchChangeReadinessReason[] {
  const found = new Set<SearchChangeReadinessReason>();
  for (const window of windows) {
    if (window.semantics.freshness.dataState !== 'final') found.add('source_not_final');
    if (window.semantics.coverage.state !== 'complete') found.add('coverage_incomplete');
    if (window.semantics.coverage.anonymized) found.add('coverage_anonymized');
    if (window.semantics.coverage.truncated) found.add('coverage_truncated');
  }
  const order: readonly SearchChangeReadinessReason[] = [
    'source_not_final',
    'coverage_incomplete',
    'coverage_anonymized',
    'coverage_truncated',
    'incomparable',
  ];
  return order.filter((reasonCode) => found.has(reasonCode));
}

function evidenceComparability(
  reasons: readonly SearchChangeReadinessReason[],
): Contract<'measurement'>['comparability'] {
  return reasons.length === 0
    ? { state: 'comparable' }
    : { state: 'unknown', reason: 'Search evidence quality is insufficient for directional human assessment.' };
}

function measurementId(material: {
  annotationId: string;
  annotationOccurredAt: string;
  rowIdentity: string;
  metric: SearchAnalyticsMetricKey;
  role: 'baseline' | 'follow_up';
  baselineCollectionId: string;
  followUpCollectionId?: string;
  dueWindow: { start: string; end: string };
  resultState: Contract<'measurement'>['result']['state'];
  createdAt: string;
}): string {
  return `gsc.change.measurement:${hashCanonicalJson({
    algorithm: 'gas-search-change-measurement-v1',
    ...material,
    methodology: SEARCH_CHANGE_METHODOLOGY,
  })}`;
}

function preparedInput(
  measurement: Contract<'measurement'>,
  cohortObservationId: string,
  annotation: SearchChangeAnnotation,
): PreparedSearchChangeMeasurement {
  return {
    measurement,
    cohortObservationId,
    ...(annotation.recommendationId === undefined ? {} : { recommendationId: annotation.recommendationId }),
  };
}

function measuredBaseline(
  annotation: SearchChangeAnnotation,
  row: ValidatedSearchAnalyticsRow,
  observation: Contract<'observation'>,
  baseline: ValidatedSearchAnalyticsWindow,
  metric: SearchAnalyticsMetricKey,
): PreparedSearchChangeMeasurement {
  const observedWindow = structuredClone(observation.provenance.sourceTime);
  const reasons = qualityReasons(baseline);
  const measurement = parseContract('measurement', {
    schemaVersion: '1.0',
    kind: 'measurement',
    id: measurementId({
      annotationId: annotation.id,
      annotationOccurredAt: annotation.occurredAt,
      rowIdentity: row.sidecar.rowIdentity,
      metric,
      role: 'baseline',
      baselineCollectionId: baseline.collection.id,
      dueWindow: observedWindow,
      resultState: 'measured',
      createdAt: annotation.recordedAt,
    }),
    cohort: structuredClone(observation.cohort),
    relationship: { role: 'baseline' },
    dueWindow: observedWindow,
    result: {
      state: 'measured',
      observedWindow,
      observations: [{
        reference: { scope: structuredClone(observation.cohort.context.scope), id: observation.id },
        value: structuredClone(observation.value),
      }],
    },
    comparability: evidenceComparability(reasons),
    methodology: SEARCH_CHANGE_METHODOLOGY,
    createdAt: annotation.recordedAt,
  });
  return preparedInput(measurement, observation.id, annotation);
}

function pendingFollowUp(
  annotation: SearchChangeAnnotation,
  baselineRow: ValidatedSearchAnalyticsRow,
  baselineObservation: Contract<'observation'>,
  baselineMeasurementId: string,
  baselineCollectionId: string,
  metric: SearchAnalyticsMetricKey,
  dueWindow: { start: string; end: string },
  evaluatedAt: string,
  state: 'not_due' | 'not_measured',
  reasonText: string,
  followUpCollectionId?: string,
): PreparedSearchChangeMeasurement {
  const measurement = parseContract('measurement', {
    schemaVersion: '1.0',
    kind: 'measurement',
    id: measurementId({
      annotationId: annotation.id,
      annotationOccurredAt: annotation.occurredAt,
      rowIdentity: baselineRow.sidecar.rowIdentity,
      metric,
      role: 'follow_up',
      baselineCollectionId,
      ...(followUpCollectionId === undefined ? {} : { followUpCollectionId }),
      dueWindow,
      resultState: state,
      createdAt: evaluatedAt,
    }),
    cohort: structuredClone(baselineObservation.cohort),
    relationship: { role: 'follow_up', baselineMeasurementId },
    dueWindow: structuredClone(dueWindow),
    result: { state, reason: reasonText },
    comparability: { state: 'unknown', reason: 'No comparable measured follow-up observation is available.' },
    methodology: SEARCH_CHANGE_METHODOLOGY,
    createdAt: evaluatedAt,
  });
  return preparedInput(measurement, baselineObservation.id, annotation);
}

function measuredFollowUp(
  annotation: SearchChangeAnnotation,
  baselineRow: ValidatedSearchAnalyticsRow,
  baselineObservation: Contract<'observation'>,
  followUpRow: ValidatedSearchAnalyticsRow,
  followUpObservation: Contract<'observation'>,
  baselineMeasurementId: string,
  baseline: ValidatedSearchAnalyticsWindow,
  followUp: ValidatedSearchAnalyticsWindow,
  metric: SearchAnalyticsMetricKey,
  dueWindow: { start: string; end: string },
  evaluatedAt: string,
): { prepared: PreparedSearchChangeMeasurement; reasons: SearchChangeReadinessReason[] } {
  const reasons = qualityReasons(baseline, followUp);
  const cohortComparability = compareCohorts(baselineObservation.cohort, followUpObservation.cohort);

  let comparability: Contract<'measurement'>['comparability'];
  if (cohortComparability.state !== 'comparable') {
    reasons.push('incomparable');
    comparability = cohortComparability;
  } else {
    comparability = evidenceComparability(reasons);
  }

  const observedWindow = structuredClone(followUpObservation.provenance.sourceTime);
  const measurement = parseContract('measurement', {
    schemaVersion: '1.0',
    kind: 'measurement',
    id: measurementId({
      annotationId: annotation.id,
      annotationOccurredAt: annotation.occurredAt,
      rowIdentity: followUpRow.sidecar.rowIdentity,
      metric,
      role: 'follow_up',
      baselineCollectionId: baseline.collection.id,
      followUpCollectionId: followUp.collection.id,
      dueWindow,
      resultState: 'measured',
      createdAt: evaluatedAt,
    }),
    cohort: structuredClone(followUpObservation.cohort),
    relationship: { role: 'follow_up', baselineMeasurementId },
    dueWindow: structuredClone(dueWindow),
    result: {
      state: 'measured',
      observedWindow,
      observations: [{
        reference: { scope: structuredClone(followUpObservation.cohort.context.scope), id: followUpObservation.id },
        value: structuredClone(followUpObservation.value),
      }],
    },
    comparability,
    methodology: SEARCH_CHANGE_METHODOLOGY,
    createdAt: evaluatedAt,
  });

  return { prepared: preparedInput(measurement, followUpObservation.id, annotation), reasons };
}

/**
 * Compose one human/trusted-caller search change annotation with one exact Release 0.10
 * baseline row/metric and zero or one compatible follow-up window. Pure/local only:
 * no repository write, authority issuance, provider access, scheduling, outcome inference,
 * recommendation generation, or runtime AI occurs here.
 */
export function composeSearchChangeOutcomeCohort(input: unknown): SearchChangeOutcomeCohort {
  const request = parseInvocation(input);
  const baseline = validateSearchAnalyticsWindow(request.baseline);
  const baselineRow = findRow(baseline, request.baselineRowIdentity);
  if (baselineRow === undefined) fail('target_not_found', 'Selected baseline search row is not present.');
  const baselineObservation = resolveObservation(request.baseline, baselineRow, request.metric);

  if (baselineObservation.provenance.sourceTime.end > request.annotation.occurredAt) {
    fail('invalid_chronology', 'Baseline search window must end on or before the annotated change.');
  }

  const baselinePrepared = measuredBaseline(
    request.annotation,
    baselineRow,
    baselineObservation,
    baseline,
    request.metric,
  );

  let followUpPrepared: PreparedSearchChangeMeasurement;
  let followUpObservationId: string | undefined;
  let readiness: SearchChangeOutcomeCohort['readiness'];

  if (request.followUp === undefined) {
    const state = request.evaluatedAt < request.dueWindow.start ? 'not_due' : 'not_measured';
    followUpPrepared = pendingFollowUp(
      request.annotation,
      baselineRow,
      baselineObservation,
      baselinePrepared.measurement.id,
      baseline.collection.id,
      request.metric,
      request.dueWindow,
      request.evaluatedAt,
      state,
      state === 'not_due'
        ? 'Follow-up measurement is not due.'
        : 'Follow-up measurement has not been supplied.',
    );
    readiness = {
      state: 'not_ready',
      reasons: [state === 'not_due' ? 'follow_up_not_due' : 'follow_up_not_measured'],
    };
  } else {
    const followUp = validateSearchAnalyticsWindow(request.followUp);
    requireSearchAnalyticsCompatibility(baseline, followUp);

    if (followUp.semantics.effectiveWindow.start < request.annotation.occurredAt) {
      fail('invalid_chronology', 'Follow-up search window cannot begin before the annotated change.');
    }
    if (followUp.semantics.effectiveWindow.start < request.dueWindow.start
        || followUp.semantics.effectiveWindow.end > request.dueWindow.end) {
      fail('invalid_chronology', 'Follow-up search window must fall within the supplied dueWindow.');
    }
    if (followUp.semantics.effectiveWindow.end > request.evaluatedAt) {
      fail('invalid_chronology', 'Follow-up evaluation cannot precede the observed search window end.');
    }

    const followUpRow = findRow(followUp, request.baselineRowIdentity);
    if (followUpRow === undefined) {
      followUpPrepared = pendingFollowUp(
        request.annotation,
        baselineRow,
        baselineObservation,
        baselinePrepared.measurement.id,
        baseline.collection.id,
        request.metric,
        request.dueWindow,
        request.evaluatedAt,
        'not_measured',
        'Selected target row is absent from compatible follow-up evidence.',
        followUp.collection.id,
      );
      readiness = { state: 'not_ready', reasons: ['target_missing'] };
    } else {
      const followUpObservation = resolveObservation(request.followUp, followUpRow, request.metric);
      followUpObservationId = followUpObservation.id;
      const composed = measuredFollowUp(
        request.annotation,
        baselineRow,
        baselineObservation,
        followUpRow,
        followUpObservation,
        baselinePrepared.measurement.id,
        baseline,
        followUp,
        request.metric,
        request.dueWindow,
        request.evaluatedAt,
      );
      followUpPrepared = composed.prepared;
      readiness = composed.reasons.length === 0
        ? { state: 'ready_for_human_assessment' }
        : { state: 'not_ready', reasons: composed.reasons };
    }
  }

  const packageId = `gsc.change.package:${hashCanonicalJson({
    algorithm: 'gas-search-change-package-v1',
    annotationId: request.annotation.id,
    annotationOccurredAt: request.annotation.occurredAt,
    rowIdentity: baselineRow.sidecar.rowIdentity,
    metric: request.metric,
    baselineCollectionId: baseline.collection.id,
    followUpMeasurementId: followUpPrepared.measurement.id,
    methodology: SEARCH_CHANGE_METHODOLOGY,
  })}`;

  return {
    id: packageId,
    annotation: request.annotation,
    target: {
      rowIdentity: baselineRow.sidecar.rowIdentity,
      query: baselineRow.sidecar.query,
      page: baselineRow.sidecar.page,
      metric: request.metric,
      baselineObservationId: baselineObservation.id,
      ...(followUpObservationId === undefined ? {} : { followUpObservationId }),
    },
    baseline: baselinePrepared,
    followUp: followUpPrepared,
    readiness,
  };
}
