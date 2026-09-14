import type { z } from 'zod';
import type { scope } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import type { TenantContext } from './tenant-context.js';

export type Scope = z.infer<typeof scope>;
export interface Site { id: string; label: string }
export interface Connection { id: string; scope: Scope; providerId: string }
export interface SourceContext { scope: Scope; providerId: string; providerConnectionId: string }
export interface StoredSource { id: string; collectionId: string; record: Contract<'sourceRecord'> }
/**
 * One bounded part of a collection. `idempotencyKey` plus the source context names
 * the whole collection request; `part`/`parts` name this chunk within it. A collection
 * carrying more evidence than one part can hold is persisted as ordered parts that all
 * repeat the identical canonical collection record. `completeness.receivedCount` keeps
 * its canonical meaning and is reconciled against persisted sources, never redefined.
 */
export interface CollectionBatch {
  idempotencyKey: string;
  collection: Contract<'collection'>;
  part: number;
  parts: number;
  sources: { id: string; record: Contract<'sourceRecord'> }[];
  observations: { sourceId: string; record: Contract<'observation'> }[];
}
/** Derived, never stored as a second completeness opinion. */
export interface CollectionProgress {
  receivedCount: number;
  persistedSources: number;
  parts: number;
  partsPersisted: number;
  complete: boolean;
}
export interface PersistResult { collectionId: string; replayed: boolean; complete: boolean }
export interface ObservationFilter { siteId?: string; collectionId?: string; providerId?: string }
export interface Evidence {
  collection: Contract<'collection'>;
  source: StoredSource;
  observation: Contract<'observation'>;
}

/** Provider-neutral application boundary. Inputs are also validated at runtime. */
export interface EvidenceRepository {
  createTenant(context: TenantContext): Promise<void>;
  getTenant(context: TenantContext): Promise<{ id: string } | null>;
  createSite(context: TenantContext, site: Site): Promise<void>;
  getSite(context: TenantContext, id: string): Promise<Site | null>;
  setSiteLabel(context: TenantContext, id: string, label: string): Promise<boolean>;
  createScope(context: TenantContext, value: Scope): Promise<void>;
  createConnection(context: TenantContext, connection: Connection): Promise<void>;
  persistCollection(context: TenantContext, batch: CollectionBatch): Promise<PersistResult>;
  getCollection(context: TenantContext, id: string): Promise<Contract<'collection'> | null>;
  getCollectionProgress(context: TenantContext, id: string): Promise<CollectionProgress | null>;
  findCollectionByIdempotency(context: TenantContext, source: SourceContext, key: string): Promise<Contract<'collection'> | null>;
  getSource(context: TenantContext, id: string): Promise<StoredSource | null>;
  findSource(context: TenantContext, source: SourceContext, collectionId: string, externalId: string): Promise<StoredSource | null>;
  getObservation(context: TenantContext, id: string): Promise<Contract<'observation'> | null>;
  listObservations(context: TenantContext, filter?: ObservationFilter): Promise<Contract<'observation'>[]>;
  getObservations(context: TenantContext, ids: string[]): Promise<Contract<'observation'>[]>;
  getObservationEvidence(context: TenantContext, id: string): Promise<Evidence | null>;
  deleteCollection(context: TenantContext, id: string): Promise<boolean>;
  close(): void;
}
