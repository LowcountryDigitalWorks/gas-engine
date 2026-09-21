import type { z } from 'zod';
import { sourceIdentity, scope } from '../contracts/primitives.js';
import { wireSchemas, type Contract, type ContractName } from '../contracts/wire.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';

export class ContractInvariantError extends Error {
  override name = 'ContractInvariantError';
}

export const DOMAIN_INVARIANT_COVERAGE = {
  timestampProperties: [
    'start', 'end', 'collectedAt', 'receivedAt', 'startedAt', 'endedAt',
    'createdAt', 'updatedAt', 'requestedAt', 'executedAt', 'cancelledAt',
    'verifiedAt', 'checkedAt', 'expiresAt',
  ],
  timeWindowProperties: ['sourceTime', 'dueWindow', 'observedWindow'],
  orderedTimestampPairs: [
    ['start', 'end'], ['createdAt', 'updatedAt'], ['startedAt', 'endedAt'],
    ['endedAt', 'collectedAt'], ['collectedAt', 'receivedAt'], ['requestedAt', 'executedAt'],
  ],
  embeddedScopeProperties: ['scope'],
} as const;

const timestampProperties = new Set<string>(DOMAIN_INVARIANT_COVERAGE.timestampProperties);
const embeddedScopeProperties = new Set<string>(DOMAIN_INVARIANT_COVERAGE.embeddedScopeProperties);

function requireInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ContractInvariantError(message);
}

function ordered(earlier: string, later: string, label: string): void {
  requireInvariant(earlier <= later, `${label}: timestamps are reversed`);
}

// Called only after portable wire validation. This bounded walk applies shared
// calendar/range/completeness checks without embedding hidden Zod refinements.
function checkCommon(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(checkCommon);
    return;
  }
  if (value === null || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  for (const [key, child] of Object.entries(record)) {
    if (typeof child === 'string' && timestampProperties.has(key)) {
      const time = new Date(child);
      requireInvariant(Number.isFinite(time.getTime()) && time.toISOString() === child, `Invalid canonical UTC timestamp at ${key}`);
    }
    checkCommon(child);
  }
  for (const [first, second] of DOMAIN_INVARIANT_COVERAGE.orderedTimestampPairs) {
    if (typeof record[first] === 'string' && typeof record[second] === 'string') {
      ordered(record[first], record[second], `${first}/${second}`);
    }
  }
  if (record['sourceTime'] && typeof record['collectedAt'] === 'string') {
    const window = record['sourceTime'] as { end: string };
    ordered(window.end, record['collectedAt'], 'sourceTime/collectedAt');
  }
  if (record['state'] === 'complete') {
    requireInvariant(record['expectedCount'] === record['receivedCount'], 'Complete collection must account for every expected record');
  }
  if (record['state'] === 'partial' && typeof record['expectedCount'] === 'number') {
    requireInvariant((record['receivedCount'] as number) < record['expectedCount'], 'Partial collection must have an explicit shortfall when expectedCount is known');
  }
}

type Scope = z.infer<typeof scope>;
function requireSameScopes(value: unknown, owner: Scope, ownerCanonical = canonicalJson(owner)): void {
  if (Array.isArray(value)) {
    value.forEach((child) => requireSameScopes(child, owner, ownerCanonical));
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      if (embeddedScopeProperties.has(key)) {
        requireInvariant(canonicalJson(child) === ownerCanonical, 'Embedded reference scope differs from the owning tenant/site/scope revision');
      } else requireSameScopes(child, owner, ownerCanonical);
    }
  }
}

function uniqueIds(references: ReadonlyArray<{ id: string }>, label: string): void {
  requireInvariant(new Set(references.map((ref) => ref.id)).size === references.length, `${label}: duplicate references`);
}

function checkMetricValue(value: Contract<'observationValue'>, valueType: string): void {
  if (value.state === 'observed') {
    requireInvariant(value.value.type === valueType, 'Observed value type does not match metric meaning');
  }
}

function checkWindowDuration(window: { start: string; end: string }, cohort: Contract<'cohort'>): void {
  const actual = new Date(window.end).getTime() - new Date(window.start).getTime();
  requireInvariant(actual === cohort.context.timeWindowRules.durationSeconds * 1000, 'Observation window duration differs from declared cohort rules');
}

function checkSpecific(name: ContractName, value: unknown): void {
  switch (name) {
    case 'sourceRecord': {
      const record = value as Contract<'sourceRecord'>;
      requireSameScopes(record, record.identity.scope);
      break;
    }
    case 'provenance': {
      const record = value as Contract<'provenance'>;
      requireSameScopes(record, record.source.scope);
      break;
    }
    case 'cohort': {
      const record = value as Contract<'cohort'>;
      requireSameScopes(record, record.context.scope);
      const rules = record.context.timeWindowRules;
      requireInvariant(rules.alignment === 'point' ? rules.durationSeconds === 0 : rules.durationSeconds > 0, 'Time-window alignment and duration disagree');
      break;
    }
    case 'observation': {
      const record = value as Contract<'observation'>;
      requireSameScopes(record, record.cohort.context.scope);
      checkSpecific('cohort', record.cohort);
      checkMetricValue(record.value, record.cohort.context.metric.valueType);
      checkWindowDuration(record.provenance.sourceTime, record.cohort);
      const provider = record.cohort.context.dimensions.providerId;
      requireInvariant(provider === undefined || provider === record.provenance.source.providerId, 'Cohort provider differs from provenance');
      if (record.value.state === 'observed') {
        requireInvariant(record.provenance.completeness.receivedCount > 0, 'Observed evidence requires a received source record');
      }
      break;
    }
    case 'collection': {
      const record = value as Contract<'collection'>;
      requireSameScopes(record, record.scope);
      break;
    }
    case 'inference': {
      const record = value as Contract<'inference'>;
      requireSameScopes(record, record.scope);
      uniqueIds(record.supportingObservations, 'Supporting observations');
      uniqueIds(record.contradictingObservations, 'Contradicting observations');
      const support = new Set(record.supportingObservations.map((ref) => ref.id));
      requireInvariant(!record.contradictingObservations.some((ref) => support.has(ref.id)), 'The same observation cannot both support and contradict this inference');
      break;
    }
    case 'recommendation': {
      const record = value as Contract<'recommendation'>;
      requireSameScopes(record, record.scope);
      const refs = record.evidence.map((ref) => `${ref.kind}:${ref.id}`);
      requireInvariant(new Set(refs).size === refs.length, 'Duplicate recommendation evidence');
      break;
    }
    case 'action': {
      const record = value as Contract<'action'>;
      requireSameScopes(record, record.scope);
      if (record.verification.state === 'verified') {
        const refs = record.verification.evidence.map((ref) => `${ref.kind}:${ref.id}`);
        requireInvariant(new Set(refs).size === refs.length, 'Duplicate action verification evidence');
      }
      if (record.verification.state !== 'not_verified') {
        requireInvariant(record.execution.state === 'succeeded' || record.execution.state === 'failed', 'Verification requires an execution record');
        const checkedAt = record.verification.state === 'verified' ? record.verification.verifiedAt : record.verification.checkedAt;
        ordered(record.execution.executedAt, checkedAt, 'execution/verification');
      }
      break;
    }
    case 'measurement': {
      const record = value as Contract<'measurement'>;
      requireSameScopes(record, record.cohort.context.scope);
      checkSpecific('cohort', record.cohort);
      if (record.relationship.role === 'follow_up') {
        requireInvariant(record.relationship.baselineMeasurementId !== record.id, 'A follow-up cannot be its own baseline');
      }
      if (record.result.state === 'not_due') {
        requireInvariant(record.createdAt < record.dueWindow.start, 'A not-due measurement must be created before its due window starts');
      } else if (record.result.state === 'not_measured') {
        ordered(record.dueWindow.start, record.createdAt, 'measurement dueWindow/createdAt');
      } else {
        ordered(record.dueWindow.start, record.result.observedWindow.start, 'measurement dueWindow/observedWindow start');
        ordered(record.result.observedWindow.end, record.dueWindow.end, 'measurement observedWindow/dueWindow end');
        ordered(record.result.observedWindow.end, record.createdAt, 'measurement observedWindow/createdAt');
        checkWindowDuration(record.result.observedWindow, record.cohort);
        uniqueIds(record.result.observations.map((item) => item.reference), 'Measurement observations');
        record.result.observations.forEach((item) => checkMetricValue(item.value, record.cohort.context.metric.valueType));
      }
      break;
    }
    case 'outcome': {
      const record = value as Contract<'outcome'>;
      requireSameScopes(record, record.scope);
      if ('measurements' in record.assessment) uniqueIds(record.assessment.measurements, 'Outcome measurements');
      break;
    }
    case 'observationValue': break;
  }
}

/** Parse a wire value, then check cross-field invariants. This is NOT authorization. */
export function parseContract<N extends ContractName>(name: N, value: unknown): Contract<N> {
  // Reject unsupported JS values, hidden properties, cycles and oversized input
  // before Zod can clone/strip/coerce them. No coercion or mutation is performed.
  canonicalJson(value);
  const parsed = wireSchemas[name].parse(value) as Contract<N>;
  checkCommon(parsed);
  checkSpecific(name, parsed);
  return parsed;
}

/** Identity includes the full tenant/site/scope/provider/connection tuple, never secrets. */
export function sourceRecordIdentityHash(value: unknown): string {
  canonicalJson(value);
  const identity = sourceIdentity.parse(value);
  return hashCanonicalJson({ algorithm: 'gas-source-identity-v1', identity });
}

/** Semantic cohort identity deliberately excludes wire-envelope metadata. */
export function cohortIdentityHash(value: unknown): string {
  const cohort = parseContract('cohort', value);
  const semanticCohort = { id: cohort.id, revision: cohort.revision, context: cohort.context };
  return hashCanonicalJson({ algorithm: 'gas-cohort-identity-v1', cohort: semanticCohort });
}

/** Equality is conservative: omitted dimensions are not wildcards. No scoring. */
export function compareCohorts(left: unknown, right: unknown): Contract<'measurement'>['comparability'] {
  return cohortIdentityHash(left) === cohortIdentityHash(right)
    ? { state: 'comparable' }
    : { state: 'discontinuous', reason: 'Cohort identity, revision, scope, metric, dimensions, method, or window rules differ.' };
}

/** Call with resolved local records; references alone cannot prove comparability. */
export function assertComparableMeasurements(baselineInput: unknown, followUpInput: unknown): void {
  const baseline = parseContract('measurement', baselineInput);
  const followUp = parseContract('measurement', followUpInput);
  requireInvariant(baseline.relationship.role === 'baseline', 'Expected a baseline measurement');
  requireInvariant(followUp.relationship.role === 'follow_up' && followUp.relationship.baselineMeasurementId === baseline.id, 'Follow-up does not reference this baseline');
  requireInvariant(compareCohorts(baseline.cohort, followUp.cohort).state === 'comparable', 'Incompatible cohort context');
  requireInvariant(canonicalJson(baseline.methodology) === canonicalJson(followUp.methodology), 'Measurement methodology changed');
  requireInvariant(baseline.result.state === 'measured' && followUp.result.state === 'measured', 'Both measurements must be observed');
  requireInvariant(baseline.result.observations.every((item) => item.value.state === 'observed') && followUp.result.observations.every((item) => item.value.state === 'observed'), 'Missing observations do not establish a comparable measured result');
  ordered(baseline.result.observedWindow.end, followUp.result.observedWindow.start, 'baseline/follow-up');
  requireInvariant(baseline.comparability.state === 'comparable' && followUp.comparability.state === 'comparable', 'Measurement records do not declare comparability');
}
