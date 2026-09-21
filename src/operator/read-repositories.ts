import type { EvidenceRepository } from '../persistence/repository.js';
import type { ReviewLedgerRepository } from '../review/repository.js';

/**
 * Exact read capabilities used by the accepted Release 0.7 persisted diff.
 * Full evidence repositories remain unchanged; read-only cloud adapters can
 * implement only this structural boundary.
 */
export type EvidenceSnapshotReadRepository = Pick<
  EvidenceRepository,
  'getCollectionSnapshot'
>;

/** Exact evidence reads needed to resolve canonical recommendation evidence. */
export type RecommendationEvidenceReadRepository = Pick<
  EvidenceRepository,
  'getObservation'
>;

/** Exact review-ledger reads needed to resolve current/historical recommendation evidence. */
export type RecommendationEvidenceReviewRepository = Pick<
  ReviewLedgerRepository,
  'getCurrentRecommendation' | 'getRecommendationRevision'
>;

/** Exact evidence reads consumed by the accepted Release 0.9 operator assembler. */
export type OperatorEvidenceReadRepository = Pick<
  EvidenceRepository,
  'getCollectionSnapshot' | 'getObservation'
>;

/** Exact review-ledger reads consumed by the accepted Release 0.9 operator assembler. */
export type OperatorReviewReadRepository = Pick<
  ReviewLedgerRepository,
  | 'getCurrentRecommendation'
  | 'getRecommendationRevision'
  | 'listRecommendationHistory'
  | 'listCurrentRecommendations'
  | 'listMeasurements'
  | 'listOutcomes'
>;
