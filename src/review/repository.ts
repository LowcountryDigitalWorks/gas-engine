import type { Contract } from '../contracts/wire.js';
import type { Scope } from '../persistence/repository.js';
import type { TenantContext } from '../persistence/tenant-context.js';

export type RecommendationLifecycle = Contract<'recommendation'>['lifecycle'];

export interface RecommendationFilter {
  scope: Scope;
  lifecycle?: RecommendationLifecycle;
}
export interface MeasurementFilter {
  scope: Scope;
  recommendationId?: string;
}
export interface OutcomeFilter {
  scope: Scope;
  recommendationId?: string;
}
export interface StoredMeasurement {
  record: Contract<'measurement'>;
  recommendationId: string | undefined;
}

/** Tenant-safe Release 0.8 review/history boundary. IDs never create authority. */
export interface ReviewLedgerRepository {
  createRecommendation(context: TenantContext, record: Contract<'recommendation'>): Promise<void>;
  appendRecommendationRevision(
    context: TenantContext,
    record: Contract<'recommendation'>,
    expectedCurrentRevision: number,
  ): Promise<void>;
  getCurrentRecommendation(context: TenantContext, owner: Scope, id: string): Promise<Contract<'recommendation'> | null>;
  getRecommendationRevision(
    context: TenantContext,
    owner: Scope,
    id: string,
    revision: number,
  ): Promise<Contract<'recommendation'> | null>;
  listRecommendationHistory(context: TenantContext, owner: Scope, id: string): Promise<Contract<'recommendation'>[]>;
  listCurrentRecommendations(context: TenantContext, filter: RecommendationFilter): Promise<Contract<'recommendation'>[]>;

  persistMeasurement(
    context: TenantContext,
    record: Contract<'measurement'>,
    recommendationId: string | undefined,
  ): Promise<void>;
  getMeasurement(context: TenantContext, owner: Scope, id: string): Promise<StoredMeasurement | null>;
  listMeasurements(context: TenantContext, filter: MeasurementFilter): Promise<StoredMeasurement[]>;

  persistOutcome(context: TenantContext, record: Contract<'outcome'>): Promise<void>;
  getOutcome(context: TenantContext, owner: Scope, id: string): Promise<Contract<'outcome'> | null>;
  listOutcomes(context: TenantContext, filter: OutcomeFilter): Promise<Contract<'outcome'>[]>;
  close(): void;
}
