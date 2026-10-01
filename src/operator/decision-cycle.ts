import { z } from 'zod';
import { identifier, scope as scopeSchema, timestamp, version as versionSchema } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { parseContract } from '../domain/validate.js';
import { hashCanonicalJson } from '../lib/canonical-json.js';
import type { EvidenceRepository, Scope } from '../persistence/repository.js';
import { requireTenantContext, type TenantContext } from '../persistence/tenant-context.js';
import {
  composeSearchChangeOutcomeCohort,
  type PreparedSearchChangeMeasurement,
  type SearchChangeOutcomeCohort,
} from '../analysis/search-change.js';
import {
  assembleServiceBrief,
  type ServiceBrief,
  type ServiceBriefAttentionItem,
} from './service-brief.js';
import { prepareNewRecommendation } from '../review/lifecycle.js';
import type { ReviewLedgerRepository } from '../review/repository.js';
import {
  createHumanRecommendation,
  recordHumanOutcome,
  recordMeasurement,
  reviseHumanRecommendation,
  transitionHumanRecommendation,
} from '../review/service.js';

export const DECISION_CYCLE_VERSION = '0.16.0' as const;
export const MAX_DECISION_DOSSIER_JSON_BYTES = 1_500_000;

export const DECISION_CYCLE_HARD_LIMITS = Object.freeze({
  selectedAttentionItems: 32,
  decisionReferences: 64,
} as const);

const boundedText = z.string()
  .min(1)
  .max(2_048)
  .regex(/\S/)
  .regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/);

const decisionReferenceSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('url'), value: z.string().min(1).max(2_048).regex(/\S/) }),
  z.strictObject({ kind: z.literal('query'), value: z.string().min(1).max(2_048).regex(/\S/) }),
  z.strictObject({ kind: z.literal('prompt_id'), value: identifier }),
  z.strictObject({ kind: z.literal('cohort_hash'), value: z.string().min(1).max(256).regex(/\S/) }),
]);

const decisionInputSchema = z.strictObject({
  id: identifier,
  disposition: z.enum(['investigate', 'recommend', 'defer', 'dismiss']),
  summary: boundedText,
  recordedAt: timestamp,
  references: z.array(decisionReferenceSchema).max(DECISION_CYCLE_HARD_LIMITS.decisionReferences).optional(),
});

const policySchema = z.strictObject({
  id: identifier,
  version: versionSchema,
  maxSelectedAttentionItems: z.number().int().min(1).max(DECISION_CYCLE_HARD_LIMITS.selectedAttentionItems),
});

const requestSchema = z.strictObject({
  serviceBriefRequest: z.unknown(),
  selectedAttentionIds: z.array(identifier).min(1).max(DECISION_CYCLE_HARD_LIMITS.selectedAttentionItems),
  decision: decisionInputSchema,
  recommendation: z.unknown().optional(),
  existingRecommendationId: identifier.optional(),
  searchChangePlan: z.unknown().optional(),
  policy: policySchema,
  generatedAt: timestamp,
  evaluatedAt: timestamp,
});

const transitionSchema = z.strictObject({
  scope: scopeSchema,
  id: identifier,
  expectedCurrentRevision: z.number().int().min(1).max(1_000_000),
  lifecycle: z.enum(['proposed', 'in_review', 'accepted', 'rejected', 'superseded']),
  updatedAt: timestamp,
});

const revisionSchema = z.strictObject({
  scope: scopeSchema,
  expectedCurrentRevision: z.number().int().min(1).max(1_000_000),
  recommendation: z.unknown(),
});

export type DecisionCyclePolicy = z.infer<typeof policySchema>;
export type HumanDecisionReference = z.infer<typeof decisionReferenceSchema>;
export type HumanDecisionDisposition = z.infer<typeof decisionInputSchema>['disposition'];

export interface HumanDecisionStatement {
  readonly id: string;
  readonly disposition: HumanDecisionDisposition;
  readonly summary: string;
  readonly recordedAt: string;
  readonly selectedAttentionIds: readonly string[];
  readonly references: readonly HumanDecisionReference[];
}

export type DecisionCycleReadinessState =
  | 'deferred_or_dismissed'
  | 'recommendation_not_created'
  | 'recommendation_proposed'
  | 'recommendation_in_review'
  | 'recommendation_accepted'
  | 'recommendation_rejected'
  | 'recommendation_superseded'
  | 'measurement_not_planned'
  | 'measurements_not_recorded'
  | 'follow_up_not_due'
  | 'follow_up_not_measured'
  | 'follow_up_not_comparable'
  | 'follow_up_not_ready'
  | 'ready_for_human_assessment'
  | 'outcome_recorded';

export interface DecisionCycleReadiness {
  readonly state: DecisionCycleReadinessState;
  readonly reasons: readonly string[];
}

export interface DecisionCycleRecommendationState {
  readonly candidate?: Contract<'recommendation'>;
  readonly current?: Contract<'recommendation'>;
  readonly history: readonly Contract<'recommendation'>[];
}

export interface DecisionCycleProvenance {
  readonly sourceServiceBriefId: string;
  readonly selectedAttentionEvidenceIdentities: readonly string[];
  readonly recommendationId?: string;
  readonly measurementPlanId?: string;
  readonly measurementIds: readonly string[];
  readonly outcomeIds: readonly string[];
}

export interface DecisionCycleDossier {
  readonly version: typeof DECISION_CYCLE_VERSION;
  readonly id: string;
  readonly scope: Scope;
  readonly trustedTarget: string;
  readonly generatedAt: string;
  readonly evaluatedAt: string;
  readonly policy: DecisionCyclePolicy;
  readonly sourceServiceBrief: Readonly<{
    id: string;
    version: string;
    generatedAt: string;
  }>;
  readonly selectedAttention: readonly ServiceBriefAttentionItem[];
  readonly decision: HumanDecisionStatement;
  readonly recommendation?: DecisionCycleRecommendationState;
  readonly measurementPlan?: SearchChangeOutcomeCohort;
  readonly recordedMeasurements: readonly Contract<'measurement'>[];
  readonly humanOutcomes: readonly Contract<'outcome'>[];
  readonly readiness: DecisionCycleReadiness;
  readonly provenance: DecisionCycleProvenance;
  readonly authorityNotes: readonly string[];
  readonly limitations: readonly string[];
}

export type DecisionCycleErrorCode =
  | 'invalid_request'
  | 'invalid_selection'
  | 'scope_mismatch'
  | 'target_mismatch'
  | 'bound_exceeded'
  | 'invalid_state'
  | 'invalid_output';

export class DecisionCycleError extends Error {
  override name = 'DecisionCycleError';

  constructor(readonly code: DecisionCycleErrorCode, message: string) {
    super(message);
  }
}

interface ParsedRequest {
  readonly serviceBriefRequest: unknown;
  readonly selectedAttentionIds: readonly string[];
  readonly decision: z.infer<typeof decisionInputSchema>;
  readonly recommendation?: unknown;
  readonly existingRecommendationId?: string;
  readonly searchChangePlan?: unknown;
  readonly policy: DecisionCyclePolicy;
  readonly generatedAt: string;
  readonly evaluatedAt: string;
}

const authorityNotes = Object.freeze([
  'Release 0.16 records an internal human work cycle only. A human decision, recommendation acceptance, measurement, or outcome does not authorize a production change.',
  'Canonical recommendations, measurements, and outcomes remain owned by accepted Release 0.8 services and tenant-safe repositories.',
  'Search-change planning remains owned by accepted Release 0.11 semantics. Release 0.16 does not infer outcome direction, causality, priority, severity, materiality, or business impact.',
]);

const limitations = Object.freeze([
  'Selected attention means only that a human chose to review an exact Release 0.15 attention item; selection is not a G.A.S. ranking.',
  'Only exact Release 0.11 Search Analytics change evidence has an accepted measurement-plan methodology in this release.',
  'The decision statement and dossier are application-local and are not persisted as a new canonical contract or table.',
  'The dossier is deterministic read/composition output plus explicit accepted Release 0.8 write call-throughs; it is not a task manager, scheduler, action engine, experiment platform, or production mutation system.',
]);

function fail(code: DecisionCycleErrorCode, message: string): never {
  throw new DecisionCycleError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId
    && left.siteId === right.siteId
    && left.siteScopeRevisionId === right.siteScopeRevisionId;
}

function pageMatchesTarget(page: string, target: string): boolean {
  try {
    return new URL(page).origin === target;
  } catch {
    return false;
  }
}

function parseRequest(input: unknown): ParsedRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    fail('invalid_request', 'Release 0.16 decision-cycle request is invalid or contains unsupported fields.');
  }
  if (new Set(parsed.data.selectedAttentionIds).size !== parsed.data.selectedAttentionIds.length) {
    fail('invalid_selection', 'Selected attention IDs must be unique.');
  }
  if (parsed.data.selectedAttentionIds.length > parsed.data.policy.maxSelectedAttentionItems) {
    fail('bound_exceeded', 'Selected attention exceeds the Release 0.16 policy bound.');
  }
  if (parsed.data.recommendation !== undefined && parsed.data.decision.disposition !== 'recommend') {
    fail('invalid_request', 'A canonical recommendation candidate is allowed only for an explicit human recommend decision.');
  }
  return {
    serviceBriefRequest: parsed.data.serviceBriefRequest,
    selectedAttentionIds: parsed.data.selectedAttentionIds,
    decision: parsed.data.decision,
    ...(parsed.data.recommendation === undefined ? {} : { recommendation: parsed.data.recommendation }),
    ...(parsed.data.existingRecommendationId === undefined ? {} : { existingRecommendationId: parsed.data.existingRecommendationId }),
    ...(parsed.data.searchChangePlan === undefined ? {} : { searchChangePlan: parsed.data.searchChangePlan }),
    policy: parsed.data.policy,
    generatedAt: parsed.data.generatedAt,
    evaluatedAt: parsed.data.evaluatedAt,
  };
}

function referenceKey(reference: HumanDecisionReference): string {
  return reference.kind + ':' + reference.value;
}

function allowedReferenceKeys(selected: readonly ServiceBriefAttentionItem[]): Set<string> {
  const allowed = new Set<string>();
  for (const item of selected) {
    if (item.identity.url !== undefined) allowed.add('url:' + item.identity.url);
    if (item.identity.query !== undefined) allowed.add('query:' + item.identity.query);
    if (item.identity.promptId !== undefined) allowed.add('prompt_id:' + item.identity.promptId);
    if (item.identity.cohortHash !== undefined) allowed.add('cohort_hash:' + item.identity.cohortHash);
  }
  return allowed;
}

function selectAttention(
  brief: ServiceBrief,
  selectedIds: readonly string[],
  policy: DecisionCyclePolicy,
): ServiceBriefAttentionItem[] {
  if (selectedIds.length > policy.maxSelectedAttentionItems) {
    fail('bound_exceeded', 'Selected attention exceeds the configured Release 0.16 policy bound.');
  }
  const byId = new Map(brief.attentionRegister.map((item) => [item.id, item] as const));
  const selected = selectedIds.map((id) => {
    const item = byId.get(id);
    if (item === undefined) fail('invalid_selection', 'A selected attention ID is not present in the recomputed Release 0.15 service brief.');
    return structuredClone(item);
  });
  selected.sort((left, right) => left.navigationOrder - right.navigationOrder || asciiCompare(left.id, right.id));
  return selected;
}

function humanDecision(
  parsed: ParsedRequest,
  selected: readonly ServiceBriefAttentionItem[],
): HumanDecisionStatement {
  const allowed = allowedReferenceKeys(selected);
  const references = [...(parsed.decision.references ?? [])]
    .map((reference) => structuredClone(reference))
    .sort((left, right) => asciiCompare(referenceKey(left), referenceKey(right)));
  if (new Set(references.map(referenceKey)).size !== references.length) {
    fail('invalid_request', 'Human decision references must be unique.');
  }
  for (const reference of references) {
    if (!allowed.has(referenceKey(reference))) {
      fail('invalid_selection', 'Human decision references must already exist in the exact selected Release 0.15 attention evidence.');
    }
  }
  return {
    id: parsed.decision.id,
    disposition: parsed.decision.disposition,
    summary: parsed.decision.summary,
    recordedAt: parsed.decision.recordedAt,
    selectedAttentionIds: selected.map((item) => item.id),
    references,
  };
}

async function validateRecommendationCandidate(
  evidenceRepository: EvidenceRepository,
  context: TenantContext,
  owner: Scope,
  input: unknown,
): Promise<Contract<'recommendation'>> {
  let candidate: Contract<'recommendation'>;
  try {
    candidate = prepareNewRecommendation(input);
  } catch {
    fail('invalid_request', 'Release 0.16 recommendation candidate must satisfy accepted Release 0.8 creation semantics.');
  }
  if (!sameScope(candidate.scope, owner)) {
    fail('scope_mismatch', 'Recommendation candidate is outside the Release 0.16 decision scope.');
  }
  for (const reference of candidate.evidence) {
    if (reference.kind !== 'observation' || !sameScope(reference.scope, owner)) {
      fail('scope_mismatch', 'Recommendation evidence must be canonical observations in the exact decision scope.');
    }
    const observation = await evidenceRepository.getObservation(context, reference.id);
    if (observation === null) {
      fail('invalid_selection', 'Recommendation evidence must independently resolve to a canonical accepted observation.');
    }
    if (!sameScope(observation.cohort.context.scope, owner)) {
      fail('scope_mismatch', 'Resolved recommendation evidence is outside the Release 0.16 decision scope.');
    }
  }
  return structuredClone(candidate);
}

function validatePlanScopeAndTarget(plan: SearchChangeOutcomeCohort, brief: ServiceBrief): void {
  if (!sameScope(plan.baseline.measurement.cohort.context.scope, brief.scope)
      || !sameScope(plan.followUp.measurement.cohort.context.scope, brief.scope)) {
    fail('scope_mismatch', 'Release 0.11 measurement plan is outside the Release 0.16 decision scope.');
  }
  if (!pageMatchesTarget(plan.target.page, brief.trustedTarget)) {
    fail('target_mismatch', 'Release 0.11 measurement plan target is outside the Release 0.16 trusted target.');
  }
}

function candidateRecommendationId(
  candidate: Contract<'recommendation'> | undefined,
  existingRecommendationId: string | undefined,
  plan: SearchChangeOutcomeCohort | undefined,
): string | undefined {
  const ids = [
    candidate?.id,
    existingRecommendationId,
    plan?.annotation.recommendationId,
  ].filter((value): value is string => value !== undefined);
  const unique = [...new Set(ids)];
  if (unique.length > 1) {
    fail('invalid_selection', 'Release 0.16 recommendation selectors and plan association must name one exact recommendation.');
  }
  return unique[0];
}

async function recommendationState(
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  owner: Scope,
  recommendationId: string | undefined,
  candidate: Contract<'recommendation'> | undefined,
  existingRecommendationId: string | undefined,
): Promise<DecisionCycleRecommendationState | undefined> {
  if (recommendationId === undefined && candidate === undefined) return undefined;
  let current: Contract<'recommendation'> | undefined;
  let history: Contract<'recommendation'>[] = [];
  if (recommendationId !== undefined) {
    const found = await reviewRepository.getCurrentRecommendation(context, owner, recommendationId);
    if (found !== null) {
      if (!sameScope(found.scope, owner)) fail('scope_mismatch', 'Resolved recommendation is outside the Release 0.16 decision scope.');
      current = structuredClone(found);
      history = (await reviewRepository.listRecommendationHistory(context, owner, recommendationId))
        .map((record) => structuredClone(record))
        .sort((left, right) => left.revision - right.revision);
    } else if (existingRecommendationId !== undefined) {
      fail('invalid_selection', 'Selected existing recommendation is not present in the Release 0.16 decision scope.');
    }
  }
  return {
    ...(candidate === undefined ? {} : { candidate: structuredClone(candidate) }),
    ...(current === undefined ? {} : { current }),
    history,
  };
}

async function recordedMeasurements(
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  owner: Scope,
  recommendationId: string | undefined,
  plan: SearchChangeOutcomeCohort | undefined,
): Promise<Contract<'measurement'>[]> {
  if (recommendationId !== undefined) {
    return (await reviewRepository.listMeasurements(context, { scope: owner, recommendationId }))
      .map((entry) => structuredClone(entry.record))
      .sort((left, right) => asciiCompare(left.id, right.id));
  }
  if (plan === undefined) return [];
  const ids = [plan.baseline.measurement.id, plan.followUp.measurement.id];
  const records: Contract<'measurement'>[] = [];
  for (const id of ids) {
    const stored = await reviewRepository.getMeasurement(context, owner, id);
    if (stored !== null) records.push(structuredClone(stored.record));
  }
  return records.sort((left, right) => asciiCompare(left.id, right.id));
}

function outcomeBelongsToMeasurementPlan(
  outcome: Contract<'outcome'>,
  owner: Scope,
  recommendationId: string | undefined,
  plan: SearchChangeOutcomeCohort,
): boolean {
  if (!sameScope(outcome.scope, owner)) return false;
  if (outcome.recommendationId !== recommendationId) return false;
  if (!('measurements' in outcome.assessment)) return false;

  const references = outcome.assessment.measurements;
  if (references.length !== 2 || references.some((reference) => !sameScope(reference.scope, owner))) {
    return false;
  }

  const actualIds = references.map((reference) => reference.id).sort(asciiCompare);
  if (new Set(actualIds).size !== 2) return false;
  const expectedIds = [
    plan.baseline.measurement.id,
    plan.followUp.measurement.id,
  ].sort(asciiCompare);

  return actualIds[0] === expectedIds[0] && actualIds[1] === expectedIds[1];
}

async function recordedOutcomes(
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  owner: Scope,
  recommendationId: string | undefined,
  plan: SearchChangeOutcomeCohort | undefined,
): Promise<Contract<'outcome'>[]> {
  if (plan === undefined) {
    if (recommendationId === undefined) return [];
    return (await reviewRepository.listOutcomes(context, { scope: owner, recommendationId }))
      .map((record) => structuredClone(record))
      .sort((left, right) => asciiCompare(left.id, right.id));
  }

  const candidates = await reviewRepository.listOutcomes(context, {
    scope: owner,
    ...(recommendationId === undefined ? {} : { recommendationId }),
  });
  return candidates
    .filter((record) => outcomeBelongsToMeasurementPlan(record, owner, recommendationId, plan))
    .map((record) => structuredClone(record))
    .sort((left, right) => asciiCompare(left.id, right.id));
}

function readiness(
  decision: HumanDecisionStatement,
  recommendation: DecisionCycleRecommendationState | undefined,
  plan: SearchChangeOutcomeCohort | undefined,
  measurements: readonly Contract<'measurement'>[],
  outcomes: readonly Contract<'outcome'>[],
): DecisionCycleReadiness {
  if (decision.disposition === 'defer' || decision.disposition === 'dismiss') {
    return { state: 'deferred_or_dismissed', reasons: [] };
  }
  if (outcomes.length > 0) {
    return { state: 'outcome_recorded', reasons: [] };
  }
  if (plan !== undefined) {
    const followUp = plan.followUp.measurement;
    if (followUp.result.state === 'not_due') {
      return { state: 'follow_up_not_due', reasons: ['follow_up_not_due'] };
    }
    if (followUp.result.state === 'not_measured') {
      return { state: 'follow_up_not_measured', reasons: plan.readiness.state === 'not_ready' ? [...plan.readiness.reasons] : [] };
    }
    if (followUp.comparability.state !== 'comparable') {
      return { state: 'follow_up_not_comparable', reasons: plan.readiness.state === 'not_ready' ? [...plan.readiness.reasons] : ['incomparable'] };
    }
    if (plan.readiness.state === 'not_ready') {
      return { state: 'follow_up_not_ready', reasons: [...plan.readiness.reasons] };
    }
    const persisted = new Set(measurements.map((record) => record.id));
    if (!persisted.has(plan.baseline.measurement.id) || !persisted.has(plan.followUp.measurement.id)) {
      return { state: 'measurements_not_recorded', reasons: ['prepared_measurements_not_yet_recorded'] };
    }
    return { state: 'ready_for_human_assessment', reasons: [] };
  }
  const lifecycle = recommendation?.current?.lifecycle;
  if (lifecycle === 'proposed') return { state: 'recommendation_proposed', reasons: [] };
  if (lifecycle === 'in_review') return { state: 'recommendation_in_review', reasons: [] };
  if (lifecycle === 'accepted') return { state: 'recommendation_accepted', reasons: [] };
  if (lifecycle === 'rejected') return { state: 'recommendation_rejected', reasons: [] };
  if (lifecycle === 'superseded') return { state: 'recommendation_superseded', reasons: [] };
  if (decision.disposition === 'recommend') return { state: 'recommendation_not_created', reasons: [] };
  return { state: 'measurement_not_planned', reasons: [] };
}

function dossierIdentityMaterial(
  dossier: Omit<DecisionCycleDossier, 'id'>,
): unknown {
  // Bind emitted cycle semantics, but not generated presentation/governance prose.
  // Authority/limitation wording may be refined without changing the decision evidence.
  const { authorityNotes: _authorityNotes, limitations: _limitations, ...semantic } = dossier;
  return semantic;
}

function buildDossierId(dossier: Omit<DecisionCycleDossier, 'id'>): string {
  try {
    return 'decision-cycle:' + hashCanonicalJson(dossierIdentityMaterial(dossier));
  } catch {
    fail('invalid_output', 'Release 0.16 dossier semantic state exceeds deterministic identity bounds.');
  }
}

function validatePlainOutput(output: DecisionCycleDossier): void {
  try {
    structuredClone(output);
    const json = JSON.stringify(output);
    if (json === undefined) fail('invalid_output', 'Release 0.16 dossier is not JSON serializable.');
    if (Buffer.byteLength(json, 'utf8') > MAX_DECISION_DOSSIER_JSON_BYTES) {
      fail('bound_exceeded', 'Release 0.16 dossier exceeds the JSON output byte bound.');
    }
  } catch (error) {
    if (error instanceof DecisionCycleError) throw error;
    fail('invalid_output', 'Release 0.16 dossier must remain bounded plain data.');
  }
}

/**
 * Recompute accepted Release 0.15 evidence, resolve exact human attention selection,
 * compose optional accepted Release 0.11 planning, and read accepted Release 0.8 state.
 * Pure/read-only: no recommendation, measurement, outcome, action, network, or authority
 * is created here.
 */
export async function prepareDecisionCycle(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  input: unknown,
): Promise<DecisionCycleDossier> {
  const request = parseRequest(input);
  const brief = await assembleServiceBrief(
    evidenceRepository,
    reviewRepository,
    context,
    request.serviceBriefRequest,
  );
  if (requireTenantContext(context) !== brief.scope.tenantId) {
    fail('scope_mismatch', 'Trusted tenant context does not own the recomputed Release 0.15 decision scope.');
  }
  const selectedAttention = selectAttention(brief, request.selectedAttentionIds, request.policy);
  const decision = humanDecision(request, selectedAttention);

  const recommendationCandidate = request.recommendation === undefined
    ? undefined
    : await validateRecommendationCandidate(evidenceRepository, context, brief.scope, request.recommendation);

  let measurementPlan: SearchChangeOutcomeCohort | undefined;
  if (request.searchChangePlan !== undefined) {
    try {
      measurementPlan = composeSearchChangeOutcomeCohort(request.searchChangePlan);
    } catch {
      fail('invalid_request', 'Accepted Release 0.11 rejected the supplied Release 0.16 search-change plan input.');
    }
    validatePlanScopeAndTarget(measurementPlan, brief);
  }

  const recommendationId = candidateRecommendationId(
    recommendationCandidate,
    request.existingRecommendationId,
    measurementPlan,
  );
  const recommendation = await recommendationState(
    reviewRepository,
    context,
    brief.scope,
    recommendationId,
    recommendationCandidate,
    request.existingRecommendationId,
  );
  const measurements = await recordedMeasurements(
    reviewRepository,
    context,
    brief.scope,
    recommendationId,
    measurementPlan,
  );
  const outcomes = await recordedOutcomes(
    reviewRepository,
    context,
    brief.scope,
    recommendationId,
    measurementPlan,
  );
  const cycleReadiness = readiness(decision, recommendation, measurementPlan, measurements, outcomes);

  const base: Omit<DecisionCycleDossier, 'id'> = {
    version: DECISION_CYCLE_VERSION,
    scope: structuredClone(brief.scope),
    trustedTarget: brief.trustedTarget,
    generatedAt: request.generatedAt,
    evaluatedAt: request.evaluatedAt,
    policy: structuredClone(request.policy),
    sourceServiceBrief: {
      id: brief.id,
      version: brief.version,
      generatedAt: brief.generatedAt,
    },
    selectedAttention,
    decision,
    ...(recommendation === undefined ? {} : { recommendation }),
    ...(measurementPlan === undefined ? {} : { measurementPlan }),
    recordedMeasurements: measurements,
    humanOutcomes: outcomes,
    readiness: cycleReadiness,
    provenance: {
      sourceServiceBriefId: brief.id,
      selectedAttentionEvidenceIdentities: [...new Set(selectedAttention.map((item) => item.evidenceIdentity))].sort(asciiCompare),
      ...(recommendationId === undefined ? {} : { recommendationId }),
      ...(measurementPlan === undefined ? {} : { measurementPlanId: measurementPlan.id }),
      measurementIds: measurements.map((record) => record.id).sort(asciiCompare),
      outcomeIds: outcomes.map((record) => record.id).sort(asciiCompare),
    },
    authorityNotes: [...authorityNotes],
    limitations: [...limitations],
  };
  const output: DecisionCycleDossier = { ...base, id: buildDossierId(base) };
  validatePlainOutput(output);
  return output;
}

export function serializeDecisionCycleDossierJson(dossier: DecisionCycleDossier): string {
  let json: string;
  try {
    json = JSON.stringify(dossier, null, 2) + '\n';
  } catch {
    fail('invalid_output', 'Release 0.16 decision dossier cannot be serialized as JSON.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_DECISION_DOSSIER_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.16 decision dossier JSON exceeds the output byte bound.');
  }
  return json;
}

/** Explicit human commit. Recomputes the complete cycle and then delegates to accepted Release 0.8 creation. */
export async function commitDecisionRecommendation(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  input: unknown,
): Promise<Contract<'recommendation'>> {
  const dossier = await prepareDecisionCycle(evidenceRepository, reviewRepository, context, input);
  if (dossier.decision.disposition !== 'recommend' || dossier.recommendation?.candidate === undefined) {
    fail('invalid_state', 'Explicit recommendation commit requires a prepared human recommend decision and candidate.');
  }
  return createHumanRecommendation(reviewRepository, evidenceRepository, context, {
    recommendation: dossier.recommendation.candidate,
  });
}

/** Explicit human lifecycle transition through accepted Release 0.8 semantics. */
export async function transitionDecisionRecommendation(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  cycleInput: unknown,
  transitionInput: unknown,
): Promise<Contract<'recommendation'>> {
  const dossier = await prepareDecisionCycle(evidenceRepository, reviewRepository, context, cycleInput);
  const parsed = transitionSchema.safeParse(transitionInput);
  if (!parsed.success) fail('invalid_request', 'Release 0.16 recommendation transition request is invalid.');
  if (!sameScope(parsed.data.scope, dossier.scope)) fail('scope_mismatch', 'Recommendation transition is outside the decision scope.');
  const expectedId = dossier.recommendation?.current?.id ?? dossier.recommendation?.candidate?.id;
  if (expectedId === undefined || parsed.data.id !== expectedId) {
    fail('invalid_selection', 'Recommendation transition must target the exact decision-cycle recommendation.');
  }
  return transitionHumanRecommendation(reviewRepository, evidenceRepository, context, parsed.data);
}

/** Explicit human content revision through accepted Release 0.8 semantics. */
export async function reviseDecisionRecommendation(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  cycleInput: unknown,
  revisionInput: unknown,
): Promise<Contract<'recommendation'>> {
  const dossier = await prepareDecisionCycle(evidenceRepository, reviewRepository, context, cycleInput);
  const parsed = revisionSchema.safeParse(revisionInput);
  if (!parsed.success) fail('invalid_request', 'Release 0.16 recommendation revision request is invalid.');
  if (!sameScope(parsed.data.scope, dossier.scope)) fail('scope_mismatch', 'Recommendation revision is outside the decision scope.');
  const candidate = parseContract('recommendation', parsed.data.recommendation);
  const expectedId = dossier.recommendation?.current?.id ?? dossier.recommendation?.candidate?.id;
  if (expectedId === undefined || candidate.id !== expectedId) {
    fail('invalid_selection', 'Recommendation revision must target the exact decision-cycle recommendation.');
  }
  return reviseHumanRecommendation(reviewRepository, evidenceRepository, context, parsed.data);
}

/** Explicitly record exactly one prepared Release 0.11 measurement through Release 0.8. */
export async function commitDecisionMeasurement(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  cycleInput: unknown,
  role: 'baseline' | 'follow_up',
): Promise<Contract<'measurement'>> {
  const dossier = await prepareDecisionCycle(evidenceRepository, reviewRepository, context, cycleInput);
  const plan = dossier.measurementPlan;
  if (plan === undefined) fail('invalid_state', 'No accepted Release 0.11 measurement plan is present.');
  const prepared: PreparedSearchChangeMeasurement = role === 'baseline' ? plan.baseline : plan.followUp;
  return recordMeasurement(reviewRepository, evidenceRepository, context, {
    measurement: prepared.measurement,
    cohortObservationId: prepared.cohortObservationId,
    ...(prepared.recommendationId === undefined ? {} : { recommendationId: prepared.recommendationId }),
  });
}

/** Explicit human outcome commit through accepted Release 0.8 validation. */
export async function commitDecisionOutcome(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  cycleInput: unknown,
  outcomeInput: unknown,
): Promise<Contract<'outcome'>> {
  const dossier = await prepareDecisionCycle(evidenceRepository, reviewRepository, context, cycleInput);
  const outcome = parseContract('outcome', outcomeInput);
  if (!sameScope(outcome.scope, dossier.scope)) fail('scope_mismatch', 'Human outcome is outside the Release 0.16 decision scope.');
  const expectedRecommendationId = dossier.recommendation?.current?.id ?? dossier.recommendation?.candidate?.id;
  if (dossier.measurementPlan !== undefined) {
    if (!outcomeBelongsToMeasurementPlan(
      outcome,
      dossier.scope,
      expectedRecommendationId,
      dossier.measurementPlan,
    )) {
      fail(
        'invalid_selection',
        'Human outcome must reference the exact current Release 0.11 baseline/follow-up measurement pair and recommendation association.',
      );
    }
  } else {
    if (expectedRecommendationId === undefined) {
      fail(
        'invalid_state',
        'Explicit outcome commit requires an exact recommendation association when no Release 0.11 measurement plan is present.',
      );
    }
    if (outcome.recommendationId !== expectedRecommendationId) {
      fail(
        'invalid_selection',
        'Human outcome recommendation must exactly match the Release 0.16 decision recommendation when no measurement plan is present.',
      );
    }
  }
  return recordHumanOutcome(reviewRepository, context, { outcome });
}
