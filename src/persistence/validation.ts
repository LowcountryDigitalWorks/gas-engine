import { z } from 'zod';
import { identifier } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { parseContract } from '../domain/validate.js';
import { canonicalJson } from '../lib/canonical-json.js';
import type { CollectionBatch } from './repository.js';

const partIndex = z.number().int().min(1).max(64);
export const INGESTION_PART_BOUNDS = Object.freeze({ parts: 64, sourcesPerPart: 16, observationsPerPart: 32 });
export const batchSchema = z.strictObject({
  idempotencyKey: identifier,
  collection: z.unknown(),
  part: partIndex,
  parts: partIndex,
  sources: z.array(z.strictObject({ id: identifier, record: z.unknown() })).max(INGESTION_PART_BOUNDS.sourcesPerPart),
  observations: z.array(z.strictObject({ sourceId: identifier, record: z.unknown() })).max(INGESTION_PART_BOUNDS.observationsPerPart),
});
function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function same(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }

export function checkSource(collection: Contract<'collection'>, source: Contract<'sourceRecord'>): void {
  invariant(same(source.identity.scope, collection.scope) && source.identity.providerId === collection.providerId
    && source.identity.providerConnectionId === collection.providerConnectionId, 'Source does not belong to this collection connection/scope');
}
export function checkObservation(collection: Contract<'collection'>, source: Contract<'sourceRecord'>, observation: Contract<'observation'>): void {
  const provenance = observation.provenance;
  invariant(provenance.runId === collection.id && same(provenance.source, source.identity), 'Observation does not belong to this source/run');
  for (const key of ['adapter', 'sourceSchema', 'sourceTime', 'collectedAt', 'receivedAt', 'completeness'] as const) {
    invariant(same(provenance[key], collection[key]), `Observation collection provenance mismatch: ${key}`);
  }
  invariant(same(provenance.integrity, source.integrity) && same(provenance.availability, source.availability), 'Observation source provenance mismatch');
  invariant(same(observation.cohort.context.method, collection.method), 'Observation collection method mismatch');
}

/** Same evidence rules as atomic persistence, usable before exact-grant authorization. */
export function parseCollectionBatch(input: unknown): CollectionBatch {
  canonicalJson(input);
  const batch = batchSchema.parse(input);
  invariant(batch.part <= batch.parts, 'Part index exceeds the declared part count');
  const collection = parseContract('collection', batch.collection);
  identifier.parse(collection.providerConnectionId);
  invariant(collection.completeness.receivedCount <= batch.parts * INGESTION_PART_BOUNDS.sourcesPerPart,
    'Declared collection receivedCount exceeds the evidence the declared parts can carry');
  const sources = batch.sources.map((source) => ({ id: source.id, record: parseContract('sourceRecord', source.record) }));
  const observations = batch.observations.map((observation) => ({ sourceId: observation.sourceId, record: parseContract('observation', observation.record) }));
  for (const source of sources) checkSource(collection, source.record);
  for (const observation of observations) {
    const source = sources.find((candidate) => candidate.id === observation.sourceId);
    invariant(source !== undefined, 'Observation source must be part of this atomic collection part');
    checkObservation(collection, source.record, observation.record);
  }
  return { idempotencyKey: batch.idempotencyKey, collection, part: batch.part, parts: batch.parts, sources, observations };
}
