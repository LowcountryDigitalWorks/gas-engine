import { z } from 'zod';
import {
  availability as availabilitySchema,
  identifier,
  scope as scopeSchema,
  timestamp,
  version as versionSchema,
} from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { parseContract } from '../domain/validate.js';
import {
  canonicalJson,
  hashCanonicalJson,
  MAX_HASH_INPUT_BYTES,
  sha256Bytes,
} from '../lib/canonical-json.js';
import type { CollectionBatch, Scope } from '../persistence/repository.js';
import { INGESTION_PART_BOUNDS, parseCollectionBatch } from '../persistence/validation.js';

export const WQT_INPUT_SCHEMA_VERSION = 'ldw.website-quality.v1' as const;
export const WQT_INPUT_SCHEMA_MINOR_VERSION = 2 as const;
export const WQT_ADAPTER_ID = 'ldw-wqt-normalized' as const;
export const WQT_ADAPTER_MAPPING_VERSION = '2.0.0' as const;
export const WQT_SOURCE_SCHEMA_ID = 'ldw.website-quality' as const;
export const WQT_SOURCE_SCHEMA_VERSION = 'v1.2' as const;

const WQT_MINOR1_MAPPING_VERSION = '1.0.0' as const;
const WQT_MINOR1_SOURCE_SCHEMA_VERSION = 'v1.1' as const;
const WQT_MINOR2_MAPPING_VERSION = WQT_ADAPTER_MAPPING_VERSION;
const WQT_MINOR2_SOURCE_SCHEMA_VERSION = WQT_SOURCE_SCHEMA_VERSION;
export const MAX_WQT_NORMALIZED_BYTES = MAX_HASH_INPUT_BYTES;

export type WqtProviderId = 'siteone' | 'lighthouse';
export type WqtAdapterErrorCode =
  | 'invalid_input'
  | 'input_too_large'
  | 'invalid_utf8'
  | 'invalid_json'
  | 'unsupported_schema'
  | 'invalid_source'
  | 'policy_violation'
  | 'configuration_mismatch'
  | 'duplicate_source_key'
  | 'flattened_observation_mismatch'
  | 'too_many_source_units'
  | 'unit_too_large'
  | 'too_many_parts'
  | 'invalid_output';

export class WqtAdapterError extends Error {
  override name = 'WqtAdapterError';

  constructor(
    readonly code: WqtAdapterErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface WqtAdapterTiming {
  readonly observedAt: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly collectedAt: string;
  readonly receivedAt: string;
}

export interface WqtAdapterConfig {
  readonly scope: Scope;
  readonly expectedSiteId: string;
  readonly expectedTargetOrigin: string;
  readonly providerConnectionIds: Readonly<Record<WqtProviderId, string>>;
  readonly timing: WqtAdapterTiming;
  readonly availability: Readonly<Record<WqtProviderId, Contract<'sourceRecord'>['availability']>>;
}

export interface WqtAdaptedCollection {
  readonly providerId: WqtProviderId;
  readonly collectionId: string;
  readonly idempotencyKey: string;
  readonly batches: readonly CollectionBatch[];
}

export interface WqtAdaptationResult {
  /** SHA-256 of the exact normalized WQT bytes. Diagnostic integrity only; never authority or semantic identity. */
  readonly inputSha256: string;
  readonly collections: readonly [WqtAdaptedCollection, WqtAdaptedCollection];
}

const boundedText = z.string().max(16_384);
const nullableBoundedText = boundedText.nullable();
const sourceKey = boundedText.min(1).regex(/\S/);
const nullableScore = z.number().min(-1e15).max(1e15).nullable();
const wqtSiteId = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

const siteOneCategorySchema = z.strictObject({
  code: sourceKey,
  name: nullableBoundedText,
  score: nullableScore,
  label: nullableBoundedText,
});
const siteOneFactId = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const siteOneFactUnit = z.string().min(1).max(32).regex(/^[a-z][a-z0-9-]{0,31}$/);
const siteOneFactSchema = z.discriminatedUnion('valueType', [
  z.strictObject({
    id: siteOneFactId,
    valueType: z.literal('number'),
    value: z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable(),
    unit: siteOneFactUnit.optional(),
  }),
  z.strictObject({
    id: siteOneFactId,
    valueType: z.literal('text'),
    value: z.string().max(256).nullable(),
    unit: siteOneFactUnit.optional(),
  }),
  z.strictObject({
    id: siteOneFactId,
    valueType: z.literal('boolean'),
    value: z.boolean().nullable(),
    unit: siteOneFactUnit.optional(),
  }),
]).superRefine((fact, context) => {
  if (fact.unit === 'count') {
    if (fact.valueType !== 'number'
        || (fact.value !== null && (!Number.isSafeInteger(fact.value) || fact.value < 0))) {
      context.addIssue({
        code: 'custom',
        message: 'Normalized WQT count facts must be non-negative safe integers or explicit null.',
      });
    }
  }
});
const siteOneFactsSchema = z.array(siteOneFactSchema).max(8).superRefine((facts, context) => {
  const seen = new Set<string>();
  for (const fact of facts) {
    if (seen.has(fact.id)) {
      context.addIssue({ code: 'custom', message: 'Normalized WQT fact IDs must be unique within one finding.' });
    }
    seen.add(fact.id);
  }
});

const siteOneObservationMinor1Schema = z.strictObject({
  source: z.literal('siteone'),
  code: sourceKey,
  sourceStatus: z.string().min(1).max(2_048).regex(/\S/).nullable(),
  message: nullableBoundedText,
});
const siteOneObservationMinor2Schema = z.strictObject({
  source: z.literal('siteone'),
  code: sourceKey,
  sourceStatus: z.string().min(1).max(2_048).regex(/\S/).nullable(),
  message: nullableBoundedText,
  facts: siteOneFactsSchema.optional(),
});
const lighthouseCategorySchema = z.strictObject({
  id: sourceKey,
  title: nullableBoundedText,
  score: nullableScore,
});
const lighthouseObservationSchema = z.strictObject({
  source: z.literal('lighthouse'),
  code: sourceKey,
  title: nullableBoundedText,
  score: nullableScore,
  scoreDisplayMode: nullableBoundedText,
  displayValue: nullableBoundedText,
  numericValue: nullableScore,
  numericUnit: z.string().min(1).max(128).regex(/\S/).nullable(),
});
const siteOneSourceMinor1Schema = z.strictObject({
  tool: boundedText,
  version: versionSchema.nullable(),
  executedAt: nullableBoundedText,
  command: nullableBoundedText,
  overallScore: nullableScore,
  categoryScores: z.array(siteOneCategorySchema).max(2_048),
  observations: z.array(siteOneObservationMinor1Schema).max(2_048),
});
const siteOneSourceMinor2Schema = z.strictObject({
  tool: boundedText,
  version: versionSchema.nullable(),
  executedAt: nullableBoundedText,
  command: nullableBoundedText,
  overallScore: nullableScore,
  categoryScores: z.array(siteOneCategorySchema).max(2_048),
  observations: z.array(siteOneObservationMinor2Schema).max(2_048),
});
const lighthouseSourceSchema = z.strictObject({
  tool: boundedText,
  version: versionSchema,
  fetchTime: nullableBoundedText,
  requestedUrl: nullableBoundedText,
  finalUrl: nullableBoundedText,
  userAgent: nullableBoundedText,
  categoryScores: z.array(lighthouseCategorySchema).max(2_048),
  observations: z.array(lighthouseObservationSchema).max(2_048),
});
const artifactBase = {
  schemaVersion: z.literal(WQT_INPUT_SCHEMA_VERSION),
  siteId: wqtSiteId,
  target: boundedText.min(1),
  evidenceOnly: z.boolean(),
  gatePolicy: z.strictObject({
    qualityThresholdsApplied: z.boolean(),
    siteOneCiModeEnabled: z.boolean(),
  }),
};
const artifactMinor1Schema = z.strictObject({
  ...artifactBase,
  schemaMinorVersion: z.literal(1),
  sources: z.strictObject({ siteone: siteOneSourceMinor1Schema, lighthouse: lighthouseSourceSchema }),
  observations: z.array(z.discriminatedUnion('source', [siteOneObservationMinor1Schema, lighthouseObservationSchema])).max(4_096),
});
const artifactMinor2Schema = z.strictObject({
  ...artifactBase,
  schemaMinorVersion: z.literal(2),
  sources: z.strictObject({ siteone: siteOneSourceMinor2Schema, lighthouse: lighthouseSourceSchema }),
  observations: z.array(z.discriminatedUnion('source', [siteOneObservationMinor2Schema, lighthouseObservationSchema])).max(4_096),
});
const artifactSchema = z.discriminatedUnion('schemaMinorVersion', [artifactMinor1Schema, artifactMinor2Schema]);
const configSchema = z.strictObject({
  scope: scopeSchema,
  expectedSiteId: wqtSiteId,
  expectedTargetOrigin: boundedText.min(1),
  providerConnectionIds: z.strictObject({ siteone: identifier, lighthouse: identifier }),
  timing: z.strictObject({
    observedAt: timestamp,
    startedAt: timestamp,
    endedAt: timestamp,
    collectedAt: timestamp,
    receivedAt: timestamp,
  }),
  availability: z.strictObject({ siteone: availabilitySchema, lighthouse: availabilitySchema }),
});

type WqtArtifact = z.infer<typeof artifactSchema>;
type ParsedConfig = z.infer<typeof configSchema>;
type ObservationValue = Contract<'observationValue'>;

interface ObservationSpec {
  readonly suffix: string;
  readonly metricId: string;
  readonly meaningVersion: string;
  readonly valueType: 'number' | 'text' | 'boolean';
  readonly unit?: string;
  readonly value: ObservationValue;
}
interface SourceUnit {
  readonly providerId: WqtProviderId;
  readonly kind: string;
  readonly key: string;
  readonly digest: string;
  readonly observations: readonly ObservationSpec[];
}
interface PreparedUnit {
  readonly source: CollectionBatch['sources'][number];
  readonly observations: readonly CollectionBatch['observations'][number][];
}

function fail(code: WqtAdapterErrorCode, message: string): never {
  throw new WqtAdapterError(code, message);
}

function parseInput(bytes: Uint8Array): { artifact: WqtArtifact; inputSha256: string } {
  let inputSha256: string;
  try {
    inputSha256 = sha256Bytes(bytes);
  } catch (error) {
    if (error instanceof RangeError) fail('input_too_large', `Normalized WQT input exceeds ${MAX_WQT_NORMALIZED_BYTES} bytes.`);
    fail('invalid_input', 'Normalized WQT input must be an ordinary Uint8Array or Buffer.');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail('invalid_utf8', 'Normalized WQT input is not valid UTF-8.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    fail('invalid_json', 'Normalized WQT input is not valid JSON.');
  }

  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    fail('invalid_source', 'Normalized WQT input must be an object.');
  }
  const envelope = decoded as Record<string, unknown>;
  if (envelope['schemaVersion'] !== WQT_INPUT_SCHEMA_VERSION
      || (envelope['schemaMinorVersion'] !== 1 && envelope['schemaMinorVersion'] !== 2)) {
    fail('unsupported_schema', `Only ${WQT_INPUT_SCHEMA_VERSION} minors 1 and 2 are supported.`);
  }

  const parsed = artifactSchema.safeParse(decoded);
  if (!parsed.success) fail('invalid_source', 'Normalized WQT source shape is invalid or contains unsupported fields.');
  return { artifact: parsed.data, inputSha256 };
}

function parseConfig(input: WqtAdapterConfig): ParsedConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Trusted WQT adapter configuration is invalid.');
  const config = parsed.data;
  let origin: URL;
  try {
    origin = new URL(config.expectedTargetOrigin);
  } catch {
    fail('invalid_input', 'Trusted expected WQT target must be a canonical HTTPS origin.');
  }
  if (origin.protocol !== 'https:' || origin.origin !== config.expectedTargetOrigin) {
    fail('invalid_input', 'Trusted expected WQT target must be an exact canonical HTTPS origin.');
  }
  const timing = config.timing;
  if (!(timing.startedAt <= timing.endedAt && timing.endedAt <= timing.collectedAt
      && timing.observedAt <= timing.collectedAt && timing.collectedAt <= timing.receivedAt)) {
    fail('invalid_input', 'Trusted WQT canonical timing is inconsistent.');
  }
  return config;
}

function requireUniqueKeys<T>(items: readonly T[], key: (item: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) fail('duplicate_source_key', `Duplicate normalized WQT ${label} key.`);
    seen.add(value);
  }
}

function reconcileFlattened(artifact: WqtArtifact): void {
  const expected = [...artifact.sources.siteone.observations, ...artifact.sources.lighthouse.observations]
    .sort((left, right) => `${left.source}:${left.code}`.localeCompare(`${right.source}:${right.code}`));
  if (expected.length !== artifact.observations.length) {
    fail('flattened_observation_mismatch', 'Flattened WQT observations do not reconcile with nested source observations.');
  }
  for (let index = 0; index < expected.length; index++) {
    if (canonicalJson(expected[index]) !== canonicalJson(artifact.observations[index])) {
      fail('flattened_observation_mismatch', 'Flattened WQT observations do not reconcile with nested source observations.');
    }
  }
}

function numericValue(value: number | null, reason: string): ObservationValue {
  return value === null
    ? { state: 'unknown', reason }
    : { state: 'observed', value: { type: 'number', value } };
}
function textValue(value: string | null, reason: string): ObservationValue {
  return value === null
    ? { state: 'unknown', reason }
    : { state: 'observed', value: { type: 'text', value } };
}
function unrepresentableFact(
  fact: z.infer<typeof siteOneFactSchema>,
  rule: string,
): never {
  fail(
    'policy_violation',
    `Normalized WQT fact ${fact.id} (${fact.valueType}) is valid WQT evidence but is not representable by the accepted G.A.S. canonical value contract: ${rule}`,
  );
}

function factValue(fact: z.infer<typeof siteOneFactSchema>): ObservationValue {
  if (fact.value === null) {
    return { state: 'unknown', reason: `Normalized WQT fact ${fact.id} is explicitly unknown or missing.` };
  }
  switch (fact.valueType) {
    case 'number':
      if (fact.value < -1e15 || fact.value > 1e15) {
        unrepresentableFact(fact, 'observed numbers must be within -1e15 through +1e15.');
      }
      return { state: 'observed', value: { type: 'number', value: fact.value } };
    case 'text':
      if (fact.value.length < 1 || fact.value.length > 2_048 || !/\S/.test(fact.value)) {
        unrepresentableFact(fact, 'observed text must be non-empty, contain non-whitespace, and fit canonical text bounds.');
      }
      return { state: 'observed', value: { type: 'text', value: fact.value } };
    case 'boolean':
      return { state: 'observed', value: { type: 'boolean', value: fact.value } };
  }
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function mappingSemantics(artifact: WqtArtifact): {
  readonly mappingVersion: string;
  readonly sourceSchemaVersion: string;
  readonly configurationRevision: 1 | 2;
} {
  return artifact.schemaMinorVersion === 1
    ? {
        mappingVersion: WQT_MINOR1_MAPPING_VERSION,
        sourceSchemaVersion: WQT_MINOR1_SOURCE_SCHEMA_VERSION,
        configurationRevision: 1,
      }
    : {
        mappingVersion: WQT_MINOR2_MAPPING_VERSION,
        sourceSchemaVersion: WQT_MINOR2_SOURCE_SCHEMA_VERSION,
        configurationRevision: 2,
      };
}

function sourceDigest(material: unknown): string {
  try {
    return hashCanonicalJson(material);
  } catch {
    fail('unit_too_large', 'A normalized WQT source unit cannot fit the canonical source-integrity representation.');
  }
}

function readableOrHashedIdentifier(prefix: string, key: string): string {
  const candidate = `${prefix}:${key}`;
  if (identifier.safeParse(candidate).success) return candidate;
  return `${prefix}:sha256:${hashCanonicalJson({ key })}`;
}

function derivedIdentifier(prefix: string, material: unknown): string {
  return `${prefix}:${hashCanonicalJson(material)}`;
}

function makeSiteOneUnits(artifact: WqtArtifact): SourceUnit[] {
  const source = artifact.sources.siteone;
  requireUniqueKeys(source.categoryScores, (item) => item.code, 'SiteOne category');
  requireUniqueKeys(source.observations, (item) => item.code, 'SiteOne finding');
  const metadata = {
    tool: source.tool,
    version: source.version,
    executedAt: source.executedAt,
    command: source.command,
  };
  const base = {
    wqtSchemaVersion: artifact.schemaVersion,
    wqtSchemaMinorVersion: artifact.schemaMinorVersion,
    siteId: artifact.siteId,
    target: artifact.target,
    providerId: 'siteone',
    metadata,
  } as const;
  const units: SourceUnit[] = [];
  const add = (kind: string, key: string, slice: unknown, observations: ObservationSpec[]): void => {
    units.push({ providerId: 'siteone', kind, key, digest: sourceDigest({ ...base, sourceKind: kind, sourceKey: key, slice }), observations });
  };
  add('overall', 'overall', { score: source.overallScore }, [{
    suffix: 'score', metricId: 'wqt-siteone-overall-score', meaningVersion: '1.0.0', valueType: 'number',
    unit: 'siteone_source_score', value: numericValue(source.overallScore, 'SiteOne overall source score is missing.'),
  }]);
  for (const item of [...source.categoryScores].sort((left, right) => left.code.localeCompare(right.code))) {
    add('category', item.code, item, [{
      suffix: 'score', metricId: 'wqt-siteone-category-score', meaningVersion: '1.0.0', valueType: 'number',
      unit: 'siteone_source_score', value: numericValue(item.score, 'SiteOne category source score is missing.'),
    }]);
  }
  for (const item of [...source.observations].sort((left, right) => left.code.localeCompare(right.code))) {
    const facts = 'facts' in item && item.facts !== undefined
      ? [...item.facts].sort((left, right) => asciiCompare(left.id, right.id))
      : [];
    const normalizedSlice = facts.length === 0 ? item : { ...item, facts };
    const factObservations: ObservationSpec[] = facts.map((fact) => ({
      suffix: `fact:${fact.id}`,
      metricId: `wqt-siteone-fact-${fact.id}`,
      meaningVersion: '1.0.0',
      valueType: fact.valueType,
      ...(fact.unit === undefined ? {} : { unit: fact.unit }),
      value: factValue(fact),
    }));
    add('finding', item.code, normalizedSlice, [{
      suffix: 'status', metricId: 'wqt-siteone-source-status', meaningVersion: '1.0.0', valueType: 'text',
      value: textValue(item.sourceStatus, 'SiteOne finding source status is missing.'),
    }, ...factObservations]);
  }
  return units;
}

function makeLighthouseUnits(artifact: WqtArtifact): SourceUnit[] {
  const source = artifact.sources.lighthouse;
  requireUniqueKeys(source.categoryScores, (item) => item.id, 'Lighthouse category');
  requireUniqueKeys(source.observations, (item) => item.code, 'Lighthouse audit');
  const metadata = {
    tool: source.tool,
    version: source.version,
    fetchTime: source.fetchTime,
    requestedUrl: source.requestedUrl,
    finalUrl: source.finalUrl,
    userAgent: source.userAgent,
  };
  const base = {
    wqtSchemaVersion: artifact.schemaVersion,
    wqtSchemaMinorVersion: artifact.schemaMinorVersion,
    siteId: artifact.siteId,
    target: artifact.target,
    providerId: 'lighthouse',
    metadata,
  } as const;
  const units: SourceUnit[] = [];
  const add = (kind: string, key: string, slice: unknown, observations: ObservationSpec[]): void => {
    units.push({ providerId: 'lighthouse', kind, key, digest: sourceDigest({ ...base, sourceKind: kind, sourceKey: key, slice }), observations });
  };
  for (const item of [...source.categoryScores].sort((left, right) => left.id.localeCompare(right.id))) {
    add('category', item.id, item, [{
      suffix: 'score', metricId: 'wqt-lighthouse-category-score', meaningVersion: '1.0.0', valueType: 'number',
      unit: 'lighthouse_score_0_to_1', value: numericValue(item.score, 'Lighthouse category source score is missing.'),
    }]);
  }
  for (const item of [...source.observations].sort((left, right) => left.code.localeCompare(right.code))) {
    const observations: ObservationSpec[] = [{
      suffix: 'score', metricId: 'wqt-lighthouse-audit-score', meaningVersion: '1.0.0', valueType: 'number',
      unit: 'lighthouse_score_0_to_1', value: numericValue(item.score, 'Lighthouse audit source score is missing.'),
    }];
    if (item.numericValue !== null) {
      observations.push({
        suffix: 'numeric', metricId: 'wqt-lighthouse-audit-numeric', meaningVersion: '1.0.0', valueType: 'number',
        ...(item.numericUnit === null ? {} : { unit: item.numericUnit }),
        value: { state: 'observed', value: { type: 'number', value: item.numericValue } },
      });
    }
    add('audit', item.code, item, observations);
  }
  return units;
}

function providerVersion(artifact: WqtArtifact, providerId: WqtProviderId): string {
  return artifact.sources[providerId].version ?? 'unknown';
}

function methodFor(
  providerId: WqtProviderId,
  semantics: ReturnType<typeof mappingSemantics>,
): Contract<'collection'>['method'] {
  return {
    id: `ldw-wqt-${providerId}`,
    version: semantics.mappingVersion,
    configurationId: `wqt-${providerId}-normalized-v1`,
    configurationRevision: semantics.configurationRevision,
  };
}

function buildProviderCollection(
  artifact: WqtArtifact,
  config: ParsedConfig,
  providerId: WqtProviderId,
  units: SourceUnit[],
  semantics: ReturnType<typeof mappingSemantics>,
): WqtAdaptedCollection {
  if (units.length > INGESTION_PART_BOUNDS.parts * INGESTION_PART_BOUNDS.sourcesPerPart) {
    fail('too_many_source_units', 'Provider evidence exceeds 1,024 source units and cannot fit within 64 bounded parts.');
  }
  const version = providerVersion(artifact, providerId);
  const method = methodFor(providerId, semantics);
  const sourceTime = { start: config.timing.observedAt, end: config.timing.observedAt };
  const seedDigest = hashCanonicalJson({
    algorithm: 'gas-wqt-provider-seed-v1',
    adapter: { id: WQT_ADAPTER_ID, version: semantics.mappingVersion },
    sourceSchema: { id: WQT_SOURCE_SCHEMA_ID, version: semantics.sourceSchemaVersion },
    scope: config.scope,
    siteId: artifact.siteId,
    target: artifact.target,
    providerId,
    providerConnectionId: config.providerConnectionIds[providerId],
    providerVersion: version,
    timing: config.timing,
    availability: config.availability[providerId],
    method,
  });
  const runDigest = sha256Bytes(Buffer.from([
    'gas-wqt-provider-collection-v1',
    seedDigest,
    ...units.map((unit) => unit.digest),
  ].join('\n'), 'utf8'));
  const collectionId = `wqt.collection.${providerId}:${runDigest}`;
  const idempotencyKey = `wqt.idempotency.${providerId}:${runDigest}`;
  const completeness: Contract<'collection'>['completeness'] = {
    state: 'complete', expectedCount: units.length, receivedCount: units.length,
  };
  const collection = parseContract('collection', {
    schemaVersion: '1.0',
    kind: 'collection',
    id: collectionId,
    scope: config.scope,
    providerId,
    providerConnectionId: config.providerConnectionIds[providerId],
    adapter: { id: WQT_ADAPTER_ID, version: semantics.mappingVersion },
    sourceSchema: { id: WQT_SOURCE_SCHEMA_ID, version: semantics.sourceSchemaVersion },
    method,
    sourceTime,
    startedAt: config.timing.startedAt,
    endedAt: config.timing.endedAt,
    collectedAt: config.timing.collectedAt,
    receivedAt: config.timing.receivedAt,
    completeness,
  });

  const prepared: PreparedUnit[] = units.map((unit) => {
    const sourceRecordId = readableOrHashedIdentifier(`wqt.${providerId}.${unit.kind}`, unit.key);
    const identity: Contract<'sourceRecord'>['identity'] = {
      scope: config.scope,
      providerId,
      providerConnectionId: config.providerConnectionIds[providerId],
      sourceRecordId,
    };
    const integrity: Contract<'sourceRecord'>['integrity'] = {
      state: 'hashed', algorithm: 'sha256', representation: 'canonical_json_v1', digest: unit.digest,
    };
    const source = parseContract('sourceRecord', {
      schemaVersion: '1.0', kind: 'source_record', identity, integrity,
      availability: config.availability[providerId],
    });
    const sourceRowId = derivedIdentifier('wqt.src', { runDigest, providerId, sourceRecordId, unitDigest: unit.digest });
    const observations = unit.observations.map((spec) => {
      const metric = {
        id: spec.metricId,
        meaningVersion: spec.meaningVersion,
        valueType: spec.valueType,
        ...(spec.unit === undefined ? {} : { unit: spec.unit }),
      };
      const cohortId = readableOrHashedIdentifier(`wqt.cohort.${providerId}.${unit.kind}`, `${unit.key}:${spec.suffix}`);
      const observationId = derivedIdentifier('wqt.obs', { runDigest, providerId, unitDigest: unit.digest, suffix: spec.suffix });
      const observation = parseContract('observation', {
        schemaVersion: '1.0',
        kind: 'observation',
        id: observationId,
        cohort: {
          schemaVersion: '1.0',
          kind: 'cohort',
          id: cohortId,
          revision: 1,
          context: {
            scope: config.scope,
            subject: { kind: 'site', reference: config.scope.siteId },
            metric,
            dimensions: {
              providerId,
              surface: readableOrHashedIdentifier('wqt.surface', `${unit.kind}:${unit.key}`),
              configuration: { id: `wqt-${providerId}-tool`, version },
            },
            method,
            timeWindowRules: {
              id: 'wqt-point-observation', version: semantics.mappingVersion,
              alignment: 'point', durationSeconds: 0, timezone: 'UTC',
            },
          },
        },
        value: spec.value,
        provenance: {
          schemaVersion: '1.0',
          source: identity,
          adapter: { id: WQT_ADAPTER_ID, version: semantics.mappingVersion },
          sourceSchema: { id: WQT_SOURCE_SCHEMA_ID, version: semantics.sourceSchemaVersion },
          runId: collectionId,
          sourceTime,
          collectedAt: config.timing.collectedAt,
          receivedAt: config.timing.receivedAt,
          sourceTimezone: 'UTC',
          completeness,
          integrity,
          normalization: { id: WQT_ADAPTER_ID, version: semantics.mappingVersion },
          availability: config.availability[providerId],
        },
      });
      return { sourceId: sourceRowId, record: observation };
    });
    return { source: { id: sourceRowId, record: source }, observations };
  });

  const fitsWorstCase = (group: readonly PreparedUnit[]): boolean => {
    const candidate = {
      idempotencyKey,
      collection,
      part: INGESTION_PART_BOUNDS.parts,
      parts: INGESTION_PART_BOUNDS.parts,
      sources: group.map((unit) => unit.source),
      observations: group.flatMap((unit) => unit.observations),
    };
    try {
      canonicalJson(candidate);
      return true;
    } catch (error) {
      if (error instanceof RangeError) return false;
      throw error;
    }
  };

  const groups: PreparedUnit[][] = [];
  let current: PreparedUnit[] = [];
  for (const unit of prepared) {
    const candidate = [...current, unit];
    const observationCount = candidate.reduce((total, item) => total + item.observations.length, 0);
    const fitsCounts = candidate.length <= INGESTION_PART_BOUNDS.sourcesPerPart
      && observationCount <= INGESTION_PART_BOUNDS.observationsPerPart;
    if (fitsCounts && fitsWorstCase(candidate)) {
      current = candidate;
      continue;
    }
    if (current.length === 0) fail('unit_too_large', 'A single WQT source unit cannot fit one bounded G.A.S. persistence part.');
    groups.push(current);
    current = [unit];
    if (unit.observations.length > INGESTION_PART_BOUNDS.observationsPerPart || !fitsWorstCase(current)) {
      fail('unit_too_large', 'A single WQT source unit cannot fit one bounded G.A.S. persistence part.');
    }
  }
  if (current.length > 0 || prepared.length === 0) groups.push(current);
  if (groups.length > INGESTION_PART_BOUNDS.parts) {
    fail('too_many_parts', 'Provider evidence requires more than 64 bounded G.A.S. persistence parts.');
  }

  const parts = groups.length;
  const batches = groups.map((group, index) => {
    const batch = {
      idempotencyKey,
      collection,
      part: index + 1,
      parts,
      sources: group.map((unit) => unit.source),
      observations: group.flatMap((unit) => unit.observations),
    };
    try {
      return parseCollectionBatch(batch);
    } catch {
      fail('invalid_output', 'Adapted WQT evidence failed current G.A.S. collection-part validation.');
    }
  });
  return { providerId, collectionId, idempotencyKey, batches };
}

/**
 * Adapt already-normalized WQT evidence into two deterministic local G.A.S. provider streams.
 * This pure function does not authenticate, issue tenant authority, persist, read files, or perform network/provider work.
 */
export function adaptWqtNormalizedEvidence(bytes: Uint8Array, trustedConfig: WqtAdapterConfig): WqtAdaptationResult {
  const { artifact, inputSha256 } = parseInput(bytes);
  const config = parseConfig(trustedConfig);

  if (artifact.evidenceOnly !== true || artifact.gatePolicy.qualityThresholdsApplied !== false
      || artifact.gatePolicy.siteOneCiModeEnabled !== false) {
    fail('policy_violation', 'WQT input must remain evidence-only with quality thresholds and SiteOne CI mode disabled.');
  }
  if (artifact.sources.siteone.tool !== 'SiteOne Crawler' || artifact.sources.lighthouse.tool !== 'Lighthouse') {
    fail('invalid_source', 'Normalized WQT source tool identity is unsupported.');
  }
  if (artifact.siteId !== config.expectedSiteId || artifact.target !== config.expectedTargetOrigin) {
    fail('configuration_mismatch', 'WQT site identity/target does not match trusted adapter configuration.');
  }

  reconcileFlattened(artifact);
  const semantics = mappingSemantics(artifact);
  const siteOneUnits = makeSiteOneUnits(artifact);
  const lighthouseUnits = makeLighthouseUnits(artifact);
  const siteone = buildProviderCollection(artifact, config, 'siteone', siteOneUnits, semantics);
  const lighthouse = buildProviderCollection(artifact, config, 'lighthouse', lighthouseUnits, semantics);
  return { inputSha256, collections: [siteone, lighthouse] };
}
