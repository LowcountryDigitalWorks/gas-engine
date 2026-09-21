import { z } from 'zod';
import {
  diffResolvedCollectionSnapshots,
  type EvidenceDeltaEntry,
  type EvidenceDeltaReport,
} from '../analysis/diff.js';
import { identifier, scope } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { canonicalJson } from '../lib/canonical-json.js';
import type { Scope } from '../persistence/repository.js';
import type { TenantContext } from '../persistence/tenant-context.js';
import { getRecommendationEvidence } from '../review/service.js';
import type {
  OperatorEvidenceReadRepository,
  OperatorReviewReadRepository,
} from './read-repositories.js';

export type OperatorCaseViewErrorCode =
  | 'invalid_request'
  | 'collection_not_found'
  | 'scope_mismatch'
  | 'recommendation_not_found';

export class OperatorCaseViewError extends Error {
  override name = 'OperatorCaseViewError';

  constructor(
    readonly code: OperatorCaseViewErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface OperatorCaseViewRequest {
  readonly scope: Scope;
  readonly baselineCollectionId: string;
  readonly currentCollectionId: string;
  readonly selectedRecommendationId: string;
}

export interface SelectedRecommendationCase {
  readonly current: Contract<'recommendation'>;
  readonly history: readonly Contract<'recommendation'>[];
  readonly evidence: readonly Contract<'observation'>[];
  readonly measurements: readonly Contract<'measurement'>[];
  readonly outcomes: readonly Contract<'outcome'>[];
}

export interface OperatorCaseView {
  readonly scope: Scope;
  readonly evidenceDiff: EvidenceDeltaReport;
  readonly reviewAttention: readonly EvidenceDeltaEntry[];
  readonly recommendations: readonly Contract<'recommendation'>[];
  readonly selectedRecommendation: SelectedRecommendationCase;
}

const requestSchema = z.strictObject({
  scope,
  baselineCollectionId: identifier,
  currentCollectionId: identifier,
  selectedRecommendationId: identifier,
});

function fail(code: OperatorCaseViewErrorCode, message: string): never {
  throw new OperatorCaseViewError(code, message);
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/**
 * Assemble one bounded Release 0.9 operator case from accepted Release 0.7/0.8
 * read surfaces only. IDs select records; the already-issued TenantContext remains
 * the authority boundary. This function performs no persistence mutation.
 */
export async function assembleOperatorCaseView(
  evidenceRepository: OperatorEvidenceReadRepository,
  reviewRepository: OperatorReviewReadRepository,
  context: TenantContext,
  input: OperatorCaseViewRequest,
): Promise<OperatorCaseView> {
  let request: OperatorCaseViewRequest;
  try {
    canonicalJson(input);
    request = requestSchema.parse(input);
  } catch {
    fail('invalid_request', 'Operator case request is invalid.');
  }

  if (request.baselineCollectionId === request.currentCollectionId) {
    fail('invalid_request', 'Baseline and current collection IDs must be distinct.');
  }

  const baselineSnapshot = await evidenceRepository.getCollectionSnapshot(context, request.baselineCollectionId);
  if (baselineSnapshot === null) fail('collection_not_found', 'Baseline collection is unavailable under trusted tenant context.');
  const currentSnapshot = await evidenceRepository.getCollectionSnapshot(context, request.currentCollectionId);
  if (currentSnapshot === null) fail('collection_not_found', 'Current collection is unavailable under trusted tenant context.');

  if (!same(baselineSnapshot.collection.scope, request.scope) || !same(currentSnapshot.collection.scope, request.scope)) {
    fail('scope_mismatch', 'Selected collection pair is outside the requested operator scope.');
  }

  const evidenceDiff = diffResolvedCollectionSnapshots(baselineSnapshot, currentSnapshot);

  const recommendations = await reviewRepository.listCurrentRecommendations(context, { scope: request.scope });
  const measurements = await reviewRepository.listMeasurements(context, { scope: request.scope });
  const outcomes = await reviewRepository.listOutcomes(context, { scope: request.scope });

  const selected = recommendations.find((record) => record.id === request.selectedRecommendationId);
  if (selected === undefined) {
    fail('recommendation_not_found', 'Selected recommendation is not present in the requested operator scope.');
  }

  const history = await reviewRepository.listRecommendationHistory(
    context,
    request.scope,
    request.selectedRecommendationId,
  );
  const evidence = await getRecommendationEvidence(
    reviewRepository,
    evidenceRepository,
    context,
    request.scope,
    request.selectedRecommendationId,
  );

  return {
    scope: request.scope,
    evidenceDiff,
    reviewAttention: evidenceDiff.entries.filter((entry) => entry.state !== 'unchanged'),
    recommendations,
    selectedRecommendation: {
      current: selected,
      history,
      evidence,
      measurements: measurements
        .filter((entry) => entry.recommendationId === selected.id)
        .map((entry) => entry.record),
      outcomes: outcomes.filter((outcome) => outcome.recommendationId === selected.id),
    },
  };
}
