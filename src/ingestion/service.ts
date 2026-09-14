import { z } from 'zod';
import { authenticatedAuthority, type AuthenticatedPrincipal } from '../authentication/principal.js';
import { identifier } from '../contracts/primitives.js';
import { canonicalJson } from '../lib/canonical-json.js';
import { PersistenceConflictError } from '../persistence/errors.js';
import type { EvidenceRepository } from '../persistence/repository.js';
import { parseCollectionBatch } from '../persistence/validation.js';
import { IngestionError } from './errors.js';

const contentSchema = z.strictObject({
  collection: z.unknown(),
  part: z.unknown(),
  parts: z.unknown(),
  sources: z.array(z.unknown()),
  observations: z.array(z.unknown()),
});
export interface IngestionResult { collectionId: string; replayed: boolean; complete: boolean }
export interface IngestionApplication {
  ingest(principal: AuthenticatedPrincipal, idempotencyKey: string, content: unknown): Promise<IngestionResult>;
}

export function createIngestionService(repository: EvidenceRepository): IngestionApplication {
  return {
    async ingest(principal, idempotencyKey, input) {
      const authority = authenticatedAuthority(principal);
      if (!authority) throw new IngestionError('unauthenticated');
      let content;
      try { content = contentSchema.parse(input); identifier.parse(idempotencyKey); }
      catch { throw new IngestionError('invalid_request'); }
      try { canonicalJson(content); }
      catch { throw new IngestionError('invalid_evidence'); }
      let batch;
      try { batch = parseCollectionBatch({ ...content, idempotencyKey }); }
      catch { throw new IngestionError('invalid_evidence'); }
      const collection = batch.collection;
      const allowed = authority.principal.grants.some((grant) =>
        grant.scope.tenantId === collection.scope.tenantId && grant.scope.siteId === collection.scope.siteId
        && grant.scope.siteScopeRevisionId === collection.scope.siteScopeRevisionId
        && grant.providerId === collection.providerId && grant.providerConnectionId === collection.providerConnectionId);
      if (!allowed) throw new IngestionError('forbidden');
      let result;
      try { result = await repository.persistCollection(authority.context, batch); }
      catch (error) {
        if (error instanceof PersistenceConflictError) throw new IngestionError('conflict');
        throw error;
      }
      const progress = await repository.getCollectionProgress(authority.context, result.collectionId);
      if (result.collectionId !== collection.id || progress === null
        || progress.receivedCount !== collection.completeness.receivedCount || progress.parts !== batch.parts
        || progress.partsPersisted > progress.parts || progress.persistedSources > progress.receivedCount
        || progress.complete !== result.complete) throw new Error('Persistence progress mismatch');
      return { collectionId: result.collectionId, replayed: result.replayed, complete: progress.complete };
    },
  };
}
