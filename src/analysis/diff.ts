import { z } from 'zod';
import { identifier } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { cohortIdentityHash, parseContract } from '../domain/validate.js';
import { canonicalJson } from '../lib/canonical-json.js';
import type { EvidenceRepository } from '../persistence/repository.js';
import type { TenantContext } from '../persistence/tenant-context.js';

/**
 * One accepted G.A.S. collection can persist at most 64 parts * 32 observations.
 * Release 0.7 deliberately uses that existing canonical capacity as its per-snapshot bound.
 */
export const MAX_DIFF_OBSERVATIONS_PER_SNAPSHOT = 2_048;

export type EvidenceDeltaState =
  | 'unchanged'
  | 'changed'
  | 'appeared'
  | 'missing_from_current'
  | 'coverage_unknown';

export type EvidenceDiffErrorCode =
  | 'invalid_request'
  | 'collection_not_found'
  | 'collection_discontinuity'
  | 'invalid_snapshot'
  | 'ambiguous_cohort'
  | 'observation_limit_exceeded';

export class EvidenceDiffError extends Error {
  override name = 'EvidenceDiffError';

  constructor(
    readonly code: EvidenceDiffErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface EvidenceSnapshot {
  readonly collection: Contract<'collection'>;
  readonly observations: readonly Contract<'observation'>[];
}

export interface EvidenceDeltaEntry {
  readonly cohortHash: string;
  readonly state: EvidenceDeltaState;
  readonly baselineObservationId?: string;
  readonly currentObservationId?: string;
  readonly baselineValue?: Contract<'observationValue'>;
  readonly currentValue?: Contract<'observationValue'>;
  readonly numericDelta?: number;
  readonly reason?: string;
}

export interface EvidenceDeltaSummary {
  readonly total: number;
  readonly unchanged: number;
  readonly changed: number;
  readonly appeared: number;
  readonly missingFromCurrent: number;
  readonly coverageUnknown: number;
  readonly attentionCount: number;
}

export interface EvidenceDeltaReport {
  readonly collectionPair: {
    readonly baselineCollectionId: string;
    readonly currentCollectionId: string;
  };
  readonly summary: EvidenceDeltaSummary;
  readonly entries: readonly EvidenceDeltaEntry[];
}

export interface DiffEvidenceCollectionsRequest {
  readonly baselineCollectionId: string;
  readonly currentCollectionId: string;
}

const requestSchema = z.strictObject({
  baselineCollectionId: identifier,
  currentCollectionId: identifier,
});

type ParsedSnapshot = {
  collection: Contract<'collection'>;
  observations: Map<string, Contract<'observation'>>;
};

function fail(code: EvidenceDiffErrorCode, message: string): never {
  throw new EvidenceDiffError(code, message);
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function sameOptionalProviderConnection(
  left: Contract<'collection'> | Contract<'observation'>['provenance']['source'],
  right: Contract<'collection'> | Contract<'observation'>['provenance']['source'],
): boolean {
  const leftOwns = Object.hasOwn(left, 'providerConnectionId');
  const rightOwns = Object.hasOwn(right, 'providerConnectionId');
  return leftOwns === rightOwns && (!leftOwns || left.providerConnectionId === right.providerConnectionId);
}

function parseCollectionForDiff(input: unknown): Contract<'collection'> {
  try {
    return parseContract('collection', input);
  } catch {
    fail('invalid_snapshot', 'Evidence diff collection is not a valid canonical collection contract.');
  }
}

function validateCollectionPair(
  baselineInput: unknown,
  currentInput: unknown,
): { baseline: Contract<'collection'>; current: Contract<'collection'> } {
  const baseline = parseCollectionForDiff(baselineInput);
  const current = parseCollectionForDiff(currentInput);

  if (baseline.id === current.id) {
    fail('invalid_request', 'Baseline and current collection IDs must be distinct.');
  }

  const compatible = same(baseline.scope, current.scope)
    && baseline.providerId === current.providerId
    && sameOptionalProviderConnection(baseline, current)
    && same(baseline.adapter, current.adapter)
    && same(baseline.sourceSchema, current.sourceSchema)
    && same(baseline.method, current.method);
  if (!compatible) {
    fail('collection_discontinuity', 'Baseline and current collections do not represent the same semantic collection stream.');
  }

  if (baseline.sourceTime.start > current.sourceTime.start || baseline.sourceTime.end > current.sourceTime.end) {
    fail('collection_discontinuity', 'Baseline collection source period is after the current collection source period.');
  }

  return { baseline, current };
}

function validateObservationOwnership(
  collection: Contract<'collection'>,
  input: unknown,
): Contract<'observation'> {
  let observation: Contract<'observation'>;
  try {
    observation = parseContract('observation', input);
  } catch {
    fail('invalid_snapshot', 'Evidence diff observation is not a valid canonical observation contract.');
  }

  const provenance = observation.provenance;
  const belongs = provenance.runId === collection.id
    && same(observation.cohort.context.scope, collection.scope)
    && same(provenance.source.scope, collection.scope)
    && provenance.source.providerId === collection.providerId
    && sameOptionalProviderConnection(collection, provenance.source)
    && same(observation.cohort.context.method, collection.method)
    && same(provenance.adapter, collection.adapter)
    && same(provenance.sourceSchema, collection.sourceSchema)
    && same(provenance.sourceTime, collection.sourceTime)
    && provenance.collectedAt === collection.collectedAt
    && provenance.receivedAt === collection.receivedAt
    && same(provenance.completeness, collection.completeness);
  if (!belongs) {
    fail('invalid_snapshot', 'Evidence diff observation does not belong to its declared collection snapshot.');
  }
  return observation;
}

function parseSnapshot(label: 'baseline' | 'current', input: EvidenceSnapshot): ParsedSnapshot {
  const collection = parseCollectionForDiff(input.collection);
  if (input.observations.length > MAX_DIFF_OBSERVATIONS_PER_SNAPSHOT) {
    fail(
      'observation_limit_exceeded',
      `${label === 'baseline' ? 'Baseline' : 'Current'} snapshot exceeds the bounded Release 0.7 observation limit.`,
    );
  }

  const observations = new Map<string, Contract<'observation'>>();
  for (const raw of input.observations) {
    const observation = validateObservationOwnership(collection, raw);
    const key = cohortIdentityHash(observation.cohort);
    if (observations.has(key)) {
      fail('ambiguous_cohort', `${label === 'baseline' ? 'Baseline' : 'Current'} snapshot contains duplicate semantic cohort identity.`);
    }
    observations.set(key, observation);
  }
  return { collection, observations };
}

function unmatchedReason(side: 'baseline' | 'current', state: Contract<'collection'>['completeness']['state']): string {
  const label = side === 'baseline' ? 'Baseline' : 'Current';
  return `${label} collection completeness is ${state}; unmatched cohort absence is not proven.`;
}

function numericDelta(
  baseline: Contract<'observationValue'>,
  current: Contract<'observationValue'>,
): number | undefined {
  if (baseline.state !== 'observed' || current.state !== 'observed') return undefined;
  if (baseline.value.type !== 'number' || current.value.type !== 'number') return undefined;
  const delta = current.value.value - baseline.value.value;
  return Object.is(delta, -0) ? 0 : delta;
}

function pairedEntry(
  cohortHash: string,
  baseline: Contract<'observation'>,
  current: Contract<'observation'>,
): EvidenceDeltaEntry {
  const unchanged = same(baseline.value, current.value);
  const delta = unchanged ? undefined : numericDelta(baseline.value, current.value);
  return {
    cohortHash,
    state: unchanged ? 'unchanged' : 'changed',
    baselineObservationId: baseline.id,
    currentObservationId: current.id,
    baselineValue: baseline.value,
    currentValue: current.value,
    ...(delta === undefined ? {} : { numericDelta: delta }),
  };
}

function currentOnlyEntry(
  cohortHash: string,
  baselineCollection: Contract<'collection'>,
  current: Contract<'observation'>,
): EvidenceDeltaEntry {
  if (baselineCollection.completeness.state === 'complete') {
    return {
      cohortHash,
      state: 'appeared',
      currentObservationId: current.id,
      currentValue: current.value,
      reason: 'Baseline complete collection contains no matching cohort in the declared stream.',
    };
  }
  return {
    cohortHash,
    state: 'coverage_unknown',
    currentObservationId: current.id,
    currentValue: current.value,
    reason: unmatchedReason('baseline', baselineCollection.completeness.state),
  };
}

function baselineOnlyEntry(
  cohortHash: string,
  currentCollection: Contract<'collection'>,
  baseline: Contract<'observation'>,
): EvidenceDeltaEntry {
  if (currentCollection.completeness.state === 'complete') {
    return {
      cohortHash,
      state: 'missing_from_current',
      baselineObservationId: baseline.id,
      baselineValue: baseline.value,
      reason: 'Current complete collection contains no matching cohort in the declared stream.',
    };
  }
  return {
    cohortHash,
    state: 'coverage_unknown',
    baselineObservationId: baseline.id,
    baselineValue: baseline.value,
    reason: unmatchedReason('current', currentCollection.completeness.state),
  };
}

function summarize(entries: readonly EvidenceDeltaEntry[]): EvidenceDeltaSummary {
  let unchanged = 0;
  let changed = 0;
  let appeared = 0;
  let missingFromCurrent = 0;
  let coverageUnknown = 0;
  for (const entry of entries) {
    switch (entry.state) {
      case 'unchanged': unchanged++; break;
      case 'changed': changed++; break;
      case 'appeared': appeared++; break;
      case 'missing_from_current': missingFromCurrent++; break;
      case 'coverage_unknown': coverageUnknown++; break;
    }
  }
  return {
    total: entries.length,
    unchanged,
    changed,
    appeared,
    missingFromCurrent,
    coverageUnknown,
    attentionCount: entries.length - unchanged,
  };
}

/**
 * Pure deterministic comparator over two already-resolved canonical evidence snapshots.
 * It performs no repository access, persistence, authority issuance, network access, or writes.
 */
export function compareEvidenceSnapshots(
  baselineInput: EvidenceSnapshot,
  currentInput: EvidenceSnapshot,
): EvidenceDeltaReport {
  const compatible = validateCollectionPair(baselineInput.collection, currentInput.collection);
  const baseline = parseSnapshot('baseline', { collection: compatible.baseline, observations: baselineInput.observations });
  const current = parseSnapshot('current', { collection: compatible.current, observations: currentInput.observations });

  const keys = new Set<string>([...baseline.observations.keys(), ...current.observations.keys()]);
  const entries = [...keys].sort().map((cohortHash): EvidenceDeltaEntry => {
    const before = baseline.observations.get(cohortHash);
    const after = current.observations.get(cohortHash);
    if (before !== undefined && after !== undefined) return pairedEntry(cohortHash, before, after);
    if (after !== undefined) return currentOnlyEntry(cohortHash, baseline.collection, after);
    if (before !== undefined) return baselineOnlyEntry(cohortHash, current.collection, before);
    throw new Error('Unreachable evidence-diff cohort state.');
  });

  return {
    collectionPair: {
      baselineCollectionId: baseline.collection.id,
      currentCollectionId: current.collection.id,
    },
    summary: summarize(entries),
    entries,
  };
}

/**
 * Tenant-safe read service. Caller IDs select records only; the already-issued TenantContext
 * remains the repository authority boundary. This service calls no repository write method.
 */
export async function diffEvidenceCollections(
  repository: EvidenceRepository,
  context: TenantContext,
  input: DiffEvidenceCollectionsRequest,
): Promise<EvidenceDeltaReport> {
  let request: DiffEvidenceCollectionsRequest;
  try {
    canonicalJson(input);
    request = requestSchema.parse(input);
  } catch {
    fail('invalid_request', 'Evidence diff request is invalid.');
  }
  if (request.baselineCollectionId === request.currentCollectionId) {
    fail('invalid_request', 'Baseline and current collection IDs must be distinct.');
  }

  const baseline = await repository.getCollection(context, request.baselineCollectionId);
  if (baseline === null) fail('collection_not_found', 'Baseline collection is unavailable under trusted tenant context.');
  const current = await repository.getCollection(context, request.currentCollectionId);
  if (current === null) fail('collection_not_found', 'Current collection is unavailable under trusted tenant context.');

  const compatible = validateCollectionPair(baseline, current);
  const baselineObservations = await repository.listObservations(context, { collectionId: compatible.baseline.id });
  const currentObservations = await repository.listObservations(context, { collectionId: compatible.current.id });

  return compareEvidenceSnapshots(
    { collection: compatible.baseline, observations: baselineObservations },
    { collection: compatible.current, observations: currentObservations },
  );
}
