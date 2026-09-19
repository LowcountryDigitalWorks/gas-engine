import { z } from 'zod';
import { identifier, revision, scope, timestamp } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { assertComparableMeasurements, compareCohorts, parseContract } from '../domain/validate.js';
import { canonicalJson } from '../lib/canonical-json.js';
import type { EvidenceRepository, Scope } from '../persistence/repository.js';
import type {
  RecommendationEvidenceReadRepository,
  RecommendationEvidenceReviewRepository,
} from '../operator/read-repositories.js';
import type { TenantContext } from '../persistence/tenant-context.js';
import {
  assertRelease08Recommendation, prepareNewRecommendation, reviseRecommendationContent,
  transitionRecommendationRevision,
} from './lifecycle.js';
import type { RecommendationLifecycle, ReviewLedgerRepository } from './repository.js';

const createRecommendationRequest = z.strictObject({ recommendation: z.unknown() });
const lifecycle = z.enum(['proposed', 'in_review', 'accepted', 'rejected', 'superseded']);
const transitionRequest = z.strictObject({
  scope, id: identifier, expectedCurrentRevision: revision, lifecycle, updatedAt: timestamp,
});
const reviseRequest = z.strictObject({ scope, expectedCurrentRevision: revision, recommendation: z.unknown() });
const measurementRequest = z.strictObject({
  measurement: z.unknown(), cohortObservationId: identifier, recommendationId: identifier.optional(),
});
const outcomeRequest = z.strictObject({ outcome: z.unknown() });

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }
function measurementOwner(record: Contract<'measurement'>): Scope { return record.cohort.context.scope; }

async function resolveRecommendationEvidence(
  evidenceRepository: RecommendationEvidenceReadRepository,
  context: TenantContext,
  record: Contract<'recommendation'>,
): Promise<Contract<'observation'>[]> {
  const observations: Contract<'observation'>[] = [];
  for (const reference of record.evidence) {
    invariant(reference.kind === 'observation', 'Release 0.8 evidence must reference observations');
    invariant(same(reference.scope, record.scope), 'Recommendation evidence scope differs from recommendation scope');
    const observation = await evidenceRepository.getObservation(context, reference.id);
    invariant(observation !== null, `Recommendation evidence observation not found: ${reference.id}`);
    invariant(same(observation.cohort.context.scope, record.scope), 'Resolved recommendation evidence is outside the owning scope');
    observations.push(observation);
  }
  return observations;
}

export async function createHumanRecommendation(
  reviewRepository: ReviewLedgerRepository,
  evidenceRepository: EvidenceRepository,
  context: TenantContext,
  input: unknown,
): Promise<Contract<'recommendation'>> {
  const request = createRecommendationRequest.parse(input);
  const record = prepareNewRecommendation(request.recommendation);
  await resolveRecommendationEvidence(evidenceRepository, context, record);
  await reviewRepository.createRecommendation(context, record);
  return record;
}

export async function transitionHumanRecommendation(
  reviewRepository: ReviewLedgerRepository,
  evidenceRepository: EvidenceRepository,
  context: TenantContext,
  input: unknown,
): Promise<Contract<'recommendation'>> {
  const request = transitionRequest.parse(input);
  const current = await reviewRepository.getCurrentRecommendation(context, request.scope, request.id);
  invariant(current !== null, 'Recommendation not found');
  await resolveRecommendationEvidence(evidenceRepository, context, current);
  const next = transitionRecommendationRevision(
    current,
    request.expectedCurrentRevision,
    request.lifecycle as RecommendationLifecycle,
    request.updatedAt,
  );
  await reviewRepository.appendRecommendationRevision(context, next, request.expectedCurrentRevision);
  return next;
}

export async function reviseHumanRecommendation(
  reviewRepository: ReviewLedgerRepository,
  evidenceRepository: EvidenceRepository,
  context: TenantContext,
  input: unknown,
): Promise<Contract<'recommendation'>> {
  const request = reviseRequest.parse(input);
  const candidate = assertRelease08Recommendation(request.recommendation);
  invariant(same(candidate.scope, request.scope), 'Content revision request scope differs from recommendation scope');
  const current = await reviewRepository.getCurrentRecommendation(context, request.scope, candidate.id);
  invariant(current !== null, 'Recommendation not found');
  const next = reviseRecommendationContent(current, request.expectedCurrentRevision, candidate);
  await resolveRecommendationEvidence(evidenceRepository, context, next);
  await reviewRepository.appendRecommendationRevision(context, next, request.expectedCurrentRevision);
  return next;
}

async function requireRecommendationInScope(
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  owner: Scope,
  recommendationId: string | undefined,
): Promise<void> {
  if (recommendationId === undefined) return;
  const recommendation = await reviewRepository.getCurrentRecommendation(context, owner, recommendationId);
  invariant(recommendation !== null, 'Recommendation is not present in the measurement/outcome scope');
}

async function resolveMeasuredObservations(
  evidenceRepository: EvidenceRepository,
  context: TenantContext,
  measurement: Contract<'measurement'>,
): Promise<Contract<'observation'>[]> {
  if (measurement.result.state !== 'measured') return [];
  const owner = measurementOwner(measurement);
  const observations: Contract<'observation'>[] = [];
  for (const item of measurement.result.observations) {
    invariant(same(item.reference.scope, owner), 'Measurement observation reference scope differs from measurement scope');
    const observation = await evidenceRepository.getObservation(context, item.reference.id);
    invariant(observation !== null, `Measurement observation not found: ${item.reference.id}`);
    invariant(same(observation.cohort.context.scope, owner), 'Resolved measurement observation is outside the owning scope');
    invariant(compareCohorts(observation.cohort, measurement.cohort).state === 'comparable',
      'Resolved measurement observation does not match the measurement cohort');
    invariant(same(observation.value, item.value), 'Caller-supplied measurement value differs from canonical observation value');
    invariant(same(observation.provenance.sourceTime, measurement.result.observedWindow),
      'Measurement observedWindow differs from the canonical observation source window');
    observations.push(observation);
  }
  return observations;
}

export async function recordMeasurement(
  reviewRepository: ReviewLedgerRepository,
  evidenceRepository: EvidenceRepository,
  context: TenantContext,
  input: unknown,
): Promise<Contract<'measurement'>> {
  const request = measurementRequest.parse(input);
  const measurement = parseContract('measurement', request.measurement);
  const owner = measurementOwner(measurement);
  const anchor = await evidenceRepository.getObservation(context, request.cohortObservationId);
  invariant(anchor !== null, 'Measurement cohort observation not found');
  invariant(same(anchor.cohort.context.scope, owner), 'Measurement cohort observation is outside the owning scope');
  invariant(compareCohorts(anchor.cohort, measurement.cohort).state === 'comparable',
    'Measurement cohort differs from the selected canonical observation');
  const resolved = await resolveMeasuredObservations(evidenceRepository, context, measurement);
  if (measurement.result.state === 'measured') {
    invariant(resolved.some((observation) => observation.id === anchor.id),
      'Measured result must include the explicitly selected cohort observation');
  }
  await requireRecommendationInScope(reviewRepository, context, owner, request.recommendationId);
  if (measurement.relationship.role === 'follow_up') {
    const baseline = await reviewRepository.getMeasurement(context, owner, measurement.relationship.baselineMeasurementId);
    invariant(baseline !== null, 'Follow-up baseline measurement not found in scope');
    invariant(baseline.record.createdAt <= measurement.createdAt, 'Follow-up cannot precede its baseline');
    if (measurement.comparability.state === 'comparable') assertComparableMeasurements(baseline.record, measurement);
  }
  await reviewRepository.persistMeasurement(context, measurement, request.recommendationId);
  return measurement;
}

async function resolveOutcomeMeasurements(
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  outcome: Contract<'outcome'>,
): Promise<Contract<'measurement'>[]> {
  if (!('measurements' in outcome.assessment)) return [];
  const records: Contract<'measurement'>[] = [];
  for (const reference of outcome.assessment.measurements) {
    invariant(same(reference.scope, outcome.scope), 'Outcome measurement reference scope differs from outcome scope');
    const stored = await reviewRepository.getMeasurement(context, outcome.scope, reference.id);
    invariant(stored !== null, `Outcome measurement not found: ${reference.id}`);
    records.push(stored.record);
  }
  return records;
}

export async function recordHumanOutcome(
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  input: unknown,
): Promise<Contract<'outcome'>> {
  const request = outcomeRequest.parse(input);
  const outcome = parseContract('outcome', request.outcome);
  invariant(outcome.attribution.strength === 'none' || outcome.attribution.strength === 'technical_verification',
    'Release 0.8 permits only none or technical_verification attribution');
  await requireRecommendationInScope(reviewRepository, context, outcome.scope, outcome.recommendationId);
  const measurements = await resolveOutcomeMeasurements(reviewRepository, context, outcome);
  if (outcome.assessment.direction === 'improved'
    || outcome.assessment.direction === 'regressed'
    || outcome.assessment.direction === 'unchanged') {
    const baselines = measurements.filter((measurement) => measurement.relationship.role === 'baseline');
    invariant(baselines.length === 1, 'Directional Release 0.8 outcomes require exactly one resolved baseline');
    const baseline = baselines[0]!;
    const followUps = measurements.filter((measurement) => measurement.relationship.role === 'follow_up');
    invariant(followUps.length >= 1, 'Directional Release 0.8 outcomes require at least one resolved follow-up');
    invariant(measurements.length === 1 + followUps.length, 'Directional outcome measurements must form one baseline/follow-up set');
    for (const followUp of followUps) assertComparableMeasurements(baseline, followUp);
  }
  await reviewRepository.persistOutcome(context, outcome);
  return outcome;
}

/** Resolve current or historical recommendation evidence. Missing/deleted evidence fails closed. */
export async function getRecommendationEvidence(
  reviewRepository: RecommendationEvidenceReviewRepository,
  evidenceRepository: RecommendationEvidenceReadRepository,
  context: TenantContext,
  ownerInput: Scope,
  recommendationId: string,
  recommendationRevision?: number,
): Promise<Contract<'observation'>[]> {
  const owner = scope.parse(ownerInput);
  const recommendation = recommendationRevision === undefined
    ? await reviewRepository.getCurrentRecommendation(context, owner, identifier.parse(recommendationId))
    : await reviewRepository.getRecommendationRevision(context, owner, identifier.parse(recommendationId), revision.parse(recommendationRevision));
  invariant(recommendation !== null, 'Recommendation not found');
  return resolveRecommendationEvidence(evidenceRepository, context, recommendation);
}
