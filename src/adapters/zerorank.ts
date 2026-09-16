import { z } from 'zod';
import {
  availability as availabilitySchema,
  identifier,
  scope as scopeSchema,
  timestamp,
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

export const ZERORANK_INPUT_SCHEMA_VERSION = 'ldw.zerorank-evidence.v1' as const;
export const ZERORANK_INPUT_SCHEMA_MINOR_VERSION = 0 as const;
export const ZERORANK_ADAPTER_ID = 'ldw-zerorank-sanitized' as const;
export const ZERORANK_ADAPTER_MAPPING_VERSION = '1.0.0' as const;
export const ZERORANK_SOURCE_SCHEMA_ID = 'ldw.zerorank-evidence' as const;
export const ZERORANK_SOURCE_SCHEMA_VERSION = 'v1.0' as const;
export const ZERORANK_PROVIDER_ID = 'zerorank' as const;
export const MAX_ZERORANK_ARTIFACT_BYTES = MAX_HASH_INPUT_BYTES;

export type ZeroRankEndpointId = 'rankings' | 'prompts' | 'chats' | 'sources' | 'sourceUrls';
export type ZeroRankWorkspaceId = string | number;
export type ZeroRankAdapterErrorCode =
  | 'invalid_input'
  | 'input_too_large'
  | 'invalid_utf8'
  | 'invalid_json'
  | 'unsupported_schema'
  | 'invalid_source'
  | 'configuration_mismatch'
  | 'duplicate_source_id'
  | 'too_many_source_units'
  | 'unit_too_large'
  | 'too_many_parts'
  | 'invalid_output';

export class ZeroRankAdapterError extends Error {
  override name = 'ZeroRankAdapterError';

  constructor(
    readonly code: ZeroRankAdapterErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface ZeroRankAdapterTiming {
  readonly observedAt: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly collectedAt: string;
  readonly receivedAt: string;
}

export interface ZeroRankAdapterConfig {
  readonly scope: Scope;
  readonly expectedWorkspaceId: ZeroRankWorkspaceId;
  readonly expectedTargetOrigin: string;
  readonly providerConnectionId: string;
  readonly timing: ZeroRankAdapterTiming;
  readonly availability: Contract<'sourceRecord'>['availability'];
}

export interface ZeroRankAdaptedCollection {
  readonly endpoint: ZeroRankEndpointId;
  readonly providerId: typeof ZERORANK_PROVIDER_ID;
  readonly collectionId: string;
  readonly idempotencyKey: string;
  readonly batches: readonly CollectionBatch[];
}

export interface ZeroRankAdaptationResult {
  /** SHA-256 of the exact sanitized artifact bytes. Diagnostic integrity only. */
  readonly inputSha256: string;
  readonly collections: readonly [
    ZeroRankAdaptedCollection,
    ZeroRankAdaptedCollection,
    ZeroRankAdaptedCollection,
    ZeroRankAdaptedCollection,
    ZeroRankAdaptedCollection,
  ];
}

const boundedText = z.string().max(16_384);
const nonemptyBoundedText = boundedText.min(1).regex(/\S/);
const count = z.number().int().min(0).max(1_000_000);
const workspaceIdSchema = z.union([
  z.string().min(1).max(128).regex(/\S/),
  z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
]);
const projected = z.unknown().optional();

const rootWorkspaceSchema = z.strictObject({
  id: z.unknown(),
  name: projected,
});
const collectionSchema = z.strictObject({
  cadence: z.strictObject({
    type: z.literal('weekly'),
    schedule: z.literal('Monday 12:00 UTC'),
  }),
  sourceApiBase: z.literal('https://api.zerorank.ai/api/v1'),
  sourceApiVersionSignal: z.literal('/api/v1'),
  runId: nonemptyBoundedText.optional(),
  startedAt: nonemptyBoundedText.optional(),
  endedAt: nonemptyBoundedText.optional(),
});

const workspaceRequestSchema = z.strictObject({ method: z.literal('GET'), path: z.literal('/workspace') });
const rankingsRequestSchema = z.strictObject({
  method: z.literal('GET'),
  path: z.literal('/rankings'),
  query: z.strictObject({ days: z.literal(7) }),
});
const promptsRequestSchema = z.strictObject({
  method: z.literal('GET'),
  path: z.literal('/prompts'),
  query: z.strictObject({ limit: z.literal(100) }),
});
const chatsRequestSchema = z.strictObject({
  method: z.literal('GET'),
  path: z.literal('/chats'),
  query: z.strictObject({ limit: z.literal(20) }),
});
const sourcesRequestSchema = z.strictObject({
  method: z.literal('GET'),
  path: z.literal('/sources'),
  query: z.strictObject({ limit: z.literal(20) }),
});
const sourceUrlsRequestSchema = z.strictObject({
  method: z.literal('GET'),
  path: z.literal('/source-urls'),
  query: z.strictObject({ limit: z.literal(20) }),
});

const workspaceRecordSchema = z.strictObject({
  id: projected,
  name: projected,
  rateLimitPerMinute: projected,
  organization: z.strictObject({
    plan: projected,
    subscriptionStatus: projected,
  }).optional(),
});
const workspaceEndpointSchema = z.strictObject({
  status: z.enum(['success', 'failed']),
  request: workspaceRequestSchema,
  completeness: z.enum(['not_applicable', 'failed']),
  record: workspaceRecordSchema.nullable(),
});

const rankingRowSchema = z.strictObject({
  id: projected,
  name: projected,
  type: projected,
  domain: projected,
  color: projected,
  rank: projected,
  mentions: projected,
  sentiment: projected,
  visibilityPercentage: projected,
  growth: projected,
});
const promptRowSchema = z.strictObject({
  id: projected,
  text: projected,
  status: projected,
  location: projected,
  workspaceId: projected,
  createdAt: projected,
  updatedAt: projected,
  topicId: projected,
  lastScheduledAt: projected,
  source: projected,
  sourceMetadata: projected,
  aiSearchVolume: projected,
  lastAnswerAt: projected,
  topic: projected,
  tags: projected,
});
const chatRowSchema = z.strictObject({
  id: projected,
  promptId: projected,
  question: projected,
  aiModel: projected,
  location: projected,
  sourceCount: projected,
  citationCount: projected,
  parsingStatus: projected,
  createdAt: projected,
});
const sourceRowSchema = z.strictObject({
  id: projected,
  domain: projected,
  domainType: projected,
  usage: projected,
  avgCitations: projected,
  urlCount: projected,
});
const sourceUrlRowSchema = z.strictObject({
  id: projected,
  sourceUrl: projected,
  sourceDomain: projected,
  domainType: projected,
  urlType: projected,
  totalUsage: projected,
  totalCitations: projected,
  uniqueChats: projected,
  usagePercentage: projected,
  lastUpdated: projected,
  brandIds: projected,
  isAnalyzed: projected,
});

const emptyPaginationSchema = z.strictObject({});
const promptPaginationSchema = z.strictObject({
  total: projected,
  page: projected,
  perPage: projected,
  lastPage: projected,
});

function listEndpointSchema<Request extends z.ZodTypeAny, Row extends z.ZodTypeAny, Pagination extends z.ZodTypeAny>(
  request: Request,
  row: Row,
  pagination: Pagination,
) {
  return z.strictObject({
    status: z.enum(['success', 'failed']),
    request,
    returnedCount: count,
    completeness: z.enum(['complete', 'unknown', 'failed']),
    pagination,
    rows: z.array(row).max(2_048),
  });
}

const rankingsEndpointSchema = listEndpointSchema(rankingsRequestSchema, rankingRowSchema, emptyPaginationSchema);
const promptsEndpointSchema = listEndpointSchema(promptsRequestSchema, promptRowSchema, promptPaginationSchema);
const chatsEndpointSchema = listEndpointSchema(chatsRequestSchema, chatRowSchema, emptyPaginationSchema);
const sourcesEndpointSchema = listEndpointSchema(sourcesRequestSchema, sourceRowSchema, emptyPaginationSchema);
const sourceUrlsEndpointSchema = listEndpointSchema(sourceUrlsRequestSchema, sourceUrlRowSchema, promptPaginationSchema);

const artifactSchema = z.strictObject({
  schemaVersion: z.string().min(1).max(128),
  schemaMinorVersion: z.number().int().min(0).max(1_000_000),
  workspace: rootWorkspaceSchema,
  targetOrigin: z.literal('https://lowcountrydigitalworks.com'),
  collection: collectionSchema,
  endpoints: z.strictObject({
    workspace: workspaceEndpointSchema,
    rankings: rankingsEndpointSchema,
    prompts: promptsEndpointSchema,
    chats: chatsEndpointSchema,
    sources: sourcesEndpointSchema,
    sourceUrls: sourceUrlsEndpointSchema,
  }),
});
const configSchema = z.strictObject({
  scope: scopeSchema,
  expectedWorkspaceId: workspaceIdSchema,
  expectedTargetOrigin: nonemptyBoundedText,
  providerConnectionId: identifier,
  timing: z.strictObject({
    observedAt: timestamp,
    startedAt: timestamp,
    endedAt: timestamp,
    collectedAt: timestamp,
    receivedAt: timestamp,
  }),
  availability: availabilitySchema,
});

type ZeroRankArtifact = z.infer<typeof artifactSchema>;
type ParsedConfig = z.infer<typeof configSchema>;
type ObservationValue = Contract<'observationValue'>;
type Row = Record<string, unknown>;
type CollectionCompleteness = Contract<'collection'>['completeness'];
type CohortDimensions = Contract<'cohort'>['context']['dimensions'];
type CohortSubject = Contract<'cohort'>['context']['subject'];

interface ObservationSpec {
  readonly suffix: string;
  readonly metricId: string;
  readonly valueType: 'number' | 'text';
  readonly value: ObservationValue;
}
interface SourceUnit {
  readonly endpoint: ZeroRankEndpointId;
  readonly stableKey: string;
  readonly sourceRecordId: string;
  readonly digest: string;
  readonly subject: CohortSubject;
  readonly dimensions: CohortDimensions;
  readonly observations: readonly ObservationSpec[];
}
interface PreparedUnit {
  readonly source: CollectionBatch['sources'][number];
  readonly observations: readonly CollectionBatch['observations'][number][];
}
interface ListEndpointLike {
  readonly status: 'success' | 'failed';
  readonly returnedCount: number;
  readonly completeness: 'complete' | 'unknown' | 'failed';
  readonly pagination: Record<string, unknown>;
  readonly rows: readonly Row[];
  readonly request: unknown;
}

function fail(code: ZeroRankAdapterErrorCode, message: string): never {
  throw new ZeroRankAdapterError(code, message);
}

function parseInput(bytes: Uint8Array): { artifact: ZeroRankArtifact; inputSha256: string } {
  let inputSha256: string;
  try {
    inputSha256 = sha256Bytes(bytes);
  } catch (error) {
    if (error instanceof RangeError) fail('input_too_large', `Sanitized ZeroRank artifact exceeds ${MAX_ZERORANK_ARTIFACT_BYTES} bytes.`);
    fail('invalid_input', 'Sanitized ZeroRank input must be an ordinary Uint8Array or Buffer.');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail('invalid_utf8', 'Sanitized ZeroRank input is not valid UTF-8.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    fail('invalid_json', 'Sanitized ZeroRank input is not valid JSON.');
  }

  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    fail('invalid_source', 'Sanitized ZeroRank input must be the inner artifact object.');
  }
  const envelope = decoded as Record<string, unknown>;
  if (envelope['schemaVersion'] !== ZERORANK_INPUT_SCHEMA_VERSION
      || envelope['schemaMinorVersion'] !== ZERORANK_INPUT_SCHEMA_MINOR_VERSION) {
    fail('unsupported_schema', `Only ${ZERORANK_INPUT_SCHEMA_VERSION} minor ${ZERORANK_INPUT_SCHEMA_MINOR_VERSION} is supported.`);
  }

  const parsed = artifactSchema.safeParse(decoded);
  if (!parsed.success) fail('invalid_source', 'Sanitized ZeroRank artifact shape is invalid or contains unsupported fields.');
  return { artifact: parsed.data, inputSha256 };
}

function parseConfig(input: ZeroRankAdapterConfig): ParsedConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Trusted ZeroRank adapter configuration is invalid.');
  const config = parsed.data;
  let origin: URL;
  try {
    origin = new URL(config.expectedTargetOrigin);
  } catch {
    fail('invalid_input', 'Trusted expected ZeroRank target must be a canonical HTTPS origin.');
  }
  if (origin.protocol !== 'https:' || origin.origin !== config.expectedTargetOrigin) {
    fail('invalid_input', 'Trusted expected ZeroRank target must be an exact canonical HTTPS origin.');
  }
  const timing = config.timing;
  if (!(timing.startedAt <= timing.endedAt && timing.endedAt <= timing.collectedAt
      && timing.observedAt <= timing.collectedAt && timing.collectedAt <= timing.receivedAt)) {
    fail('invalid_input', 'Trusted ZeroRank canonical timing is inconsistent.');
  }
  return config;
}

function validateWorkspaceEndpoint(artifact: ZeroRankArtifact): ZeroRankWorkspaceId {
  const rootWorkspaceId = workspaceIdSchema.safeParse(artifact.workspace.id);
  if (!rootWorkspaceId.success) fail('invalid_source', 'ZeroRank root workspace ID is missing, null, or unusable.');

  const endpoint = artifact.endpoints.workspace;
  if (endpoint.status === 'failed') {
    if (endpoint.completeness !== 'failed' || endpoint.record !== null) {
      fail('invalid_source', 'Failed ZeroRank workspace endpoint does not match the published failure envelope.');
    }
    return rootWorkspaceId.data;
  }
  if (endpoint.completeness !== 'not_applicable' || endpoint.record === null) {
    fail('invalid_source', 'Successful ZeroRank workspace endpoint does not match the published envelope.');
  }

  const record = endpoint.record;
  if (!Object.hasOwn(record, 'id')) {
    fail('invalid_source', 'Successful ZeroRank workspace endpoint is missing its required projected workspace ID.');
  }
  const endpointWorkspaceId = workspaceIdSchema.safeParse(record.id);
  if (!endpointWorkspaceId.success) {
    fail('invalid_source', 'Successful ZeroRank workspace endpoint has an unusable projected workspace ID.');
  }
  if (canonicalJson(endpointWorkspaceId.data) !== canonicalJson(rootWorkspaceId.data)) {
    fail('invalid_source', 'ZeroRank root and endpoint workspace ID projections do not reconcile.');
  }

  const rootOwnsName = Object.hasOwn(artifact.workspace, 'name');
  const endpointOwnsName = Object.hasOwn(record, 'name');
  if (rootOwnsName !== endpointOwnsName) {
    fail('invalid_source', 'ZeroRank root and endpoint workspace name projections do not reconcile.');
  }
  if (rootOwnsName) {
    let namesMatch: boolean;
    try {
      namesMatch = canonicalJson(artifact.workspace.name) === canonicalJson(record.name);
    } catch {
      fail('invalid_source', 'ZeroRank duplicated workspace name projection is not safely comparable.');
    }
    if (!namesMatch) {
      fail('invalid_source', 'ZeroRank root and endpoint workspace name projections do not reconcile.');
    }
  }

  return rootWorkspaceId.data;
}

function promptCompletenessIsProven(endpoint: ListEndpointLike): boolean {
  const pagination = endpoint.pagination;
  return pagination['page'] === 1
    && pagination['lastPage'] === 1
    && Object.hasOwn(pagination, 'total')
    && typeof pagination['total'] === 'number'
    && Number.isInteger(pagination['total'])
    && pagination['total'] >= 0
    && endpoint.rows.length === pagination['total'];
}

function validateListEndpoint(endpointId: ZeroRankEndpointId, endpoint: ListEndpointLike): void {
  if (endpoint.returnedCount !== endpoint.rows.length) {
    fail('invalid_source', `ZeroRank ${endpointId} returnedCount does not match projected row count.`);
  }
  if (endpoint.status === 'failed') {
    if (endpoint.returnedCount !== 0 || endpoint.completeness !== 'failed'
        || Object.keys(endpoint.pagination).length !== 0 || endpoint.rows.length !== 0) {
      fail('invalid_source', `Failed ZeroRank ${endpointId} endpoint does not match the published failure envelope.`);
    }
    return;
  }
  if (endpointId === 'prompts') {
    const expected = promptCompletenessIsProven(endpoint) ? 'complete' : 'unknown';
    if (endpoint.completeness !== expected) {
      fail('invalid_source', 'ZeroRank prompts completeness does not match the published pagination predicate.');
    }
    return;
  }
  if (endpoint.completeness !== 'unknown') {
    fail('invalid_source', `Successful ZeroRank ${endpointId} endpoint must preserve unknown exhaustion.`);
  }
}

function validateArtifactSemantics(artifact: ZeroRankArtifact, config: ParsedConfig): void {
  const workspaceId = validateWorkspaceEndpoint(artifact);
  if (canonicalJson(workspaceId) !== canonicalJson(config.expectedWorkspaceId)) {
    fail('configuration_mismatch', 'ZeroRank workspace ID does not match trusted adapter configuration.');
  }
  if (artifact.targetOrigin !== config.expectedTargetOrigin) {
    fail('configuration_mismatch', 'ZeroRank target origin does not match trusted adapter configuration.');
  }

  validateListEndpoint('rankings', artifact.endpoints.rankings as ListEndpointLike);
  validateListEndpoint('prompts', artifact.endpoints.prompts as ListEndpointLike);
  validateListEndpoint('chats', artifact.endpoints.chats as ListEndpointLike);
  validateListEndpoint('sources', artifact.endpoints.sources as ListEndpointLike);
  validateListEndpoint('sourceUrls', artifact.endpoints.sourceUrls as ListEndpointLike);
}

function sourceDigest(material: unknown): string {
  try {
    return hashCanonicalJson(material);
  } catch (error) {
    if (error instanceof RangeError) {
      fail('unit_too_large', 'A sanitized ZeroRank source unit exceeds the bounded canonical integrity representation.');
    }
    fail('invalid_source', 'A sanitized ZeroRank source unit cannot be represented by G.A.S. canonical JSON.');
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

function numericStableId(value: unknown, label: string): { key: string; order: bigint } {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) fail('invalid_source', `${label} stable ID is not a supported nonnegative integer.`);
    const key = String(value);
    return { key, order: BigInt(value) };
  }
  if (typeof value === 'string' && /^(?:0|[1-9][0-9]{0,63})$/.test(value)) {
    return { key: BigInt(value).toString(), order: BigInt(value) };
  }
  fail('invalid_source', `${label} stable ID is missing, null, or unusable.`);
}

function stringStableId(value: unknown, label: string): { key: string } {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || !/\S/.test(value)) {
    fail('invalid_source', `${label} stable ID is missing, null, or unusable.`);
  }
  return { key: value };
}

function mappedNumber(row: Row, key: string, label: string): ObservationValue {
  if (!Object.hasOwn(row, key)) return { state: 'unknown', reason: `ZeroRank ${label} is absent.` };
  const value = row[key];
  if (value === null) return { state: 'unknown', reason: `ZeroRank ${label} is explicitly null.` };
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) {
    return { state: 'unknown', reason: `ZeroRank ${label} is not a supported JSON number.` };
  }
  if (Math.abs(value) > 1e15) return { state: 'unknown', reason: `ZeroRank ${label} exceeds G.A.S. numeric bounds.` };
  return { state: 'observed', value: { type: 'number', value } };
}

function mappedText(row: Row, key: string, label: string): ObservationValue {
  if (!Object.hasOwn(row, key)) return { state: 'unknown', reason: `ZeroRank ${label} is absent.` };
  const value = row[key];
  if (value === null) return { state: 'unknown', reason: `ZeroRank ${label} is explicitly null.` };
  if (typeof value !== 'string' || value.length === 0 || value.length > 2_048 || !/\S/.test(value)) {
    return { state: 'unknown', reason: `ZeroRank ${label} is not a supported bounded JSON string.` };
  }
  return { state: 'observed', value: { type: 'text', value } };
}

function modelDimension(value: unknown): string | undefined {
  if (typeof value === 'string' && value.length > 0 && value.length <= 128 && /\S/.test(value)) return value;
  return undefined;
}

function promptRelationship(value: unknown): { id: string; revision: number } | undefined {
  try {
    const prompt = numericStableId(value, 'chat promptId');
    return { id: readableOrHashedIdentifier('zerorank.prompt', prompt.key), revision: 1 };
  } catch (error) {
    if (error instanceof ZeroRankAdapterError && error.code === 'invalid_source') return undefined;
    throw error;
  }
}

function commonDimensions(endpoint: ZeroRankEndpointId): CohortDimensions {
  return {
    providerId: ZERORANK_PROVIDER_ID,
    surface: endpoint,
    configuration: { id: 'zerorank-artifact-v1', version: ZERORANK_ADAPTER_MAPPING_VERSION },
  };
}

function sourceMaterial(
  artifact: ZeroRankArtifact,
  endpoint: ZeroRankEndpointId,
  endpointEnvelope: ListEndpointLike,
  stableSourceId: unknown,
  row: Row,
): unknown {
  return {
    artifactSchemaVersion: artifact.schemaVersion,
    artifactSchemaMinorVersion: artifact.schemaMinorVersion,
    workspace: artifact.workspace,
    targetOrigin: artifact.targetOrigin,
    collection: artifact.collection,
    endpoint,
    endpointStatus: endpointEnvelope.status,
    request: endpointEnvelope.request,
    returnedCount: endpointEnvelope.returnedCount,
    completeness: endpointEnvelope.completeness,
    pagination: endpointEnvelope.pagination,
    stableSourceId,
    row,
  };
}

function makeRankingsUnits(artifact: ZeroRankArtifact): SourceUnit[] {
  const endpoint = artifact.endpoints.rankings as ListEndpointLike;
  if (endpoint.status === 'failed') return [];
  const seen = new Set<string>();
  const prepared = endpoint.rows.map((row) => {
    const stable = numericStableId(row['id'], 'ranking');
    if (seen.has(stable.key)) fail('duplicate_source_id', 'Duplicate ZeroRank ranking stable ID.');
    seen.add(stable.key);
    return { row, stable };
  }).sort((left, right) => left.stable.order < right.stable.order ? -1 : left.stable.order > right.stable.order ? 1 : 0);

  return prepared.map(({ row, stable }) => {
    const sourceRecordId = readableOrHashedIdentifier('zerorank.rankings', stable.key);
    return {
      endpoint: 'rankings',
      stableKey: stable.key,
      sourceRecordId,
      digest: sourceDigest(sourceMaterial(artifact, 'rankings', endpoint, row['id'], row)),
      subject: { kind: 'entity', reference: sourceRecordId },
      dimensions: commonDimensions('rankings'),
      observations: [
        { suffix: 'rank', metricId: 'zerorank-ranking-rank', valueType: 'number', value: mappedNumber(row, 'rank', 'ranking rank') },
        { suffix: 'mentions', metricId: 'zerorank-ranking-mentions', valueType: 'number', value: mappedNumber(row, 'mentions', 'ranking mentions') },
        { suffix: 'sentiment', metricId: 'zerorank-ranking-sentiment', valueType: 'number', value: mappedNumber(row, 'sentiment', 'ranking sentiment') },
        { suffix: 'visibility', metricId: 'zerorank-ranking-visibility-percentage', valueType: 'number', value: mappedNumber(row, 'visibilityPercentage', 'ranking visibilityPercentage') },
        { suffix: 'growth', metricId: 'zerorank-ranking-growth', valueType: 'number', value: mappedNumber(row, 'growth', 'ranking growth') },
      ],
    };
  });
}

function makePromptsUnits(artifact: ZeroRankArtifact): SourceUnit[] {
  const endpoint = artifact.endpoints.prompts as ListEndpointLike;
  if (endpoint.status === 'failed') return [];
  const seen = new Set<string>();
  const prepared = endpoint.rows.map((row) => {
    const stable = numericStableId(row['id'], 'prompt');
    if (seen.has(stable.key)) fail('duplicate_source_id', 'Duplicate ZeroRank prompt stable ID.');
    seen.add(stable.key);
    return { row, stable };
  }).sort((left, right) => left.stable.order < right.stable.order ? -1 : left.stable.order > right.stable.order ? 1 : 0);

  return prepared.map(({ row, stable }) => {
    const sourceRecordId = readableOrHashedIdentifier('zerorank.prompts', stable.key);
    return {
      endpoint: 'prompts',
      stableKey: stable.key,
      sourceRecordId,
      digest: sourceDigest(sourceMaterial(artifact, 'prompts', endpoint, row['id'], row)),
      subject: { kind: 'prompt', reference: sourceRecordId },
      dimensions: commonDimensions('prompts'),
      observations: [
        { suffix: 'status', metricId: 'zerorank-prompt-status', valueType: 'text', value: mappedText(row, 'status', 'prompt status') },
        { suffix: 'ai-search-volume', metricId: 'zerorank-prompt-ai-search-volume', valueType: 'number', value: mappedNumber(row, 'aiSearchVolume', 'prompt aiSearchVolume') },
      ],
    };
  });
}

function makeChatsUnits(artifact: ZeroRankArtifact): SourceUnit[] {
  const endpoint = artifact.endpoints.chats as ListEndpointLike;
  if (endpoint.status === 'failed') return [];
  const seen = new Set<string>();
  const prepared = endpoint.rows.map((row) => {
    const stable = stringStableId(row['id'], 'chat');
    if (seen.has(stable.key)) fail('duplicate_source_id', 'Duplicate ZeroRank chat stable ID.');
    seen.add(stable.key);
    return { row, stable };
  }).sort((left, right) => left.stable.key < right.stable.key ? -1 : left.stable.key > right.stable.key ? 1 : 0);

  return prepared.map(({ row, stable }) => {
    const sourceRecordId = readableOrHashedIdentifier('zerorank.chats', stable.key);
    const dimensions = commonDimensions('chats');
    const model = modelDimension(row['aiModel']);
    if (model !== undefined) dimensions.model = model;
    if (Object.hasOwn(row, 'promptId') && row['promptId'] !== null) {
      const relation = promptRelationship(row['promptId']);
      if (relation !== undefined) dimensions.promptCohort = relation;
    }
    return {
      endpoint: 'chats',
      stableKey: stable.key,
      sourceRecordId,
      digest: sourceDigest(sourceMaterial(artifact, 'chats', endpoint, row['id'], row)),
      subject: { kind: 'entity', reference: sourceRecordId },
      dimensions,
      observations: [
        { suffix: 'source-count', metricId: 'zerorank-chat-source-count', valueType: 'number', value: mappedNumber(row, 'sourceCount', 'chat sourceCount') },
        { suffix: 'citation-count', metricId: 'zerorank-chat-citation-count', valueType: 'number', value: mappedNumber(row, 'citationCount', 'chat citationCount') },
        { suffix: 'parsing-status', metricId: 'zerorank-chat-parsing-status', valueType: 'text', value: mappedText(row, 'parsingStatus', 'chat parsingStatus') },
      ],
    };
  });
}

function makeSourcesUnits(artifact: ZeroRankArtifact): SourceUnit[] {
  const endpoint = artifact.endpoints.sources as ListEndpointLike;
  if (endpoint.status === 'failed') return [];
  const seen = new Set<string>();
  const prepared = endpoint.rows.map((row) => {
    const stable = stringStableId(row['id'], 'source');
    if (seen.has(stable.key)) fail('duplicate_source_id', 'Duplicate ZeroRank source stable ID.');
    seen.add(stable.key);
    return { row, stable };
  }).sort((left, right) => left.stable.key < right.stable.key ? -1 : left.stable.key > right.stable.key ? 1 : 0);

  return prepared.map(({ row, stable }) => {
    const sourceRecordId = readableOrHashedIdentifier('zerorank.sources', stable.key);
    return {
      endpoint: 'sources',
      stableKey: stable.key,
      sourceRecordId,
      digest: sourceDigest(sourceMaterial(artifact, 'sources', endpoint, row['id'], row)),
      subject: { kind: 'entity', reference: sourceRecordId },
      dimensions: commonDimensions('sources'),
      observations: [
        { suffix: 'avg-citations', metricId: 'zerorank-source-avg-citations', valueType: 'number', value: mappedNumber(row, 'avgCitations', 'source avgCitations') },
      ],
    };
  });
}

function makeSourceUrlsUnits(artifact: ZeroRankArtifact): SourceUnit[] {
  const endpoint = artifact.endpoints.sourceUrls as ListEndpointLike;
  if (endpoint.status === 'failed') return [];
  const seen = new Set<string>();
  const prepared = endpoint.rows.map((row) => {
    const stable = stringStableId(row['id'], 'sourceUrl');
    if (seen.has(stable.key)) fail('duplicate_source_id', 'Duplicate ZeroRank sourceUrl stable ID.');
    seen.add(stable.key);
    return { row, stable };
  }).sort((left, right) => left.stable.key < right.stable.key ? -1 : left.stable.key > right.stable.key ? 1 : 0);

  return prepared.map(({ row, stable }) => {
    const sourceRecordId = readableOrHashedIdentifier('zerorank.sourceUrls', stable.key);
    return {
      endpoint: 'sourceUrls',
      stableKey: stable.key,
      sourceRecordId,
      digest: sourceDigest(sourceMaterial(artifact, 'sourceUrls', endpoint, row['id'], row)),
      subject: { kind: 'entity', reference: sourceRecordId },
      dimensions: commonDimensions('sourceUrls'),
      observations: [
        { suffix: 'total-usage', metricId: 'zerorank-source-url-total-usage', valueType: 'number', value: mappedNumber(row, 'totalUsage', 'sourceUrl totalUsage') },
        { suffix: 'total-citations', metricId: 'zerorank-source-url-total-citations', valueType: 'number', value: mappedNumber(row, 'totalCitations', 'sourceUrl totalCitations') },
        { suffix: 'unique-chats', metricId: 'zerorank-source-url-unique-chats', valueType: 'number', value: mappedNumber(row, 'uniqueChats', 'sourceUrl uniqueChats') },
        { suffix: 'usage-percentage', metricId: 'zerorank-source-url-usage-percentage', valueType: 'number', value: mappedNumber(row, 'usagePercentage', 'sourceUrl usagePercentage') },
      ],
    };
  });
}

function methodFor(endpoint: ZeroRankEndpointId): Contract<'collection'>['method'] {
  return {
    id: `ldw-zerorank-${endpoint}`,
    version: ZERORANK_ADAPTER_MAPPING_VERSION,
    configurationId: `zerorank-${endpoint}-artifact-v1`,
    configurationRevision: 1,
  };
}

function endpointEnvelope(artifact: ZeroRankArtifact, endpoint: ZeroRankEndpointId): ListEndpointLike {
  return artifact.endpoints[endpoint] as ListEndpointLike;
}

function completenessFor(artifact: ZeroRankArtifact, endpoint: ZeroRankEndpointId): CollectionCompleteness {
  const source = endpointEnvelope(artifact, endpoint);
  if (source.status === 'failed') {
    return {
      state: 'unavailable',
      receivedCount: 0,
      reason: `ZeroRank ${endpoint} endpoint failed in sanitized artifact.`,
    };
  }
  if (endpoint === 'prompts' && source.completeness === 'complete') {
    const total = source.pagination['total'];
    if (typeof total !== 'number' || !Number.isInteger(total) || total < 0 || total !== source.rows.length) {
      fail('invalid_source', 'ZeroRank prompts complete envelope lacks a usable exact total.');
    }
    return { state: 'complete', expectedCount: total, receivedCount: source.rows.length };
  }
  return {
    state: 'partial',
    receivedCount: source.rows.length,
    reason: endpoint === 'prompts'
      ? 'ZeroRank prompts pagination does not prove endpoint exhaustion.'
      : `ZeroRank ${endpoint} endpoint exhaustion is unknown in artifact v1.`,
  };
}

function buildEndpointCollection(
  artifact: ZeroRankArtifact,
  config: ParsedConfig,
  endpoint: ZeroRankEndpointId,
  units: SourceUnit[],
): ZeroRankAdaptedCollection {
  if (units.length > INGESTION_PART_BOUNDS.parts * INGESTION_PART_BOUNDS.sourcesPerPart) {
    fail('too_many_source_units', 'ZeroRank endpoint evidence exceeds 1,024 source units and cannot fit within 64 bounded parts.');
  }
  const source = endpointEnvelope(artifact, endpoint);
  const method = methodFor(endpoint);
  const completeness = completenessFor(artifact, endpoint);
  const sourceTime = { start: config.timing.observedAt, end: config.timing.observedAt };
  const seedDigest = hashCanonicalJson({
    algorithm: 'gas-zerorank-endpoint-seed-v1',
    adapter: { id: ZERORANK_ADAPTER_ID, version: ZERORANK_ADAPTER_MAPPING_VERSION },
    sourceSchema: { id: ZERORANK_SOURCE_SCHEMA_ID, version: ZERORANK_SOURCE_SCHEMA_VERSION },
    trusted: {
      scope: config.scope,
      expectedWorkspaceId: config.expectedWorkspaceId,
      expectedTargetOrigin: config.expectedTargetOrigin,
      providerConnectionId: config.providerConnectionId,
      timing: config.timing,
      availability: config.availability,
    },
    artifact: {
      workspace: artifact.workspace,
      targetOrigin: artifact.targetOrigin,
      collection: artifact.collection,
    },
    endpoint,
    endpointEnvelope: {
      status: source.status,
      request: source.request,
      returnedCount: source.returnedCount,
      completeness: source.completeness,
      pagination: source.pagination,
    },
    method,
  });
  const runDigest = sha256Bytes(Buffer.from([
    'gas-zerorank-endpoint-collection-v1',
    seedDigest,
    ...units.map((unit) => unit.digest),
  ].join('\n'), 'utf8'));
  const collectionId = `zerorank.collection.${endpoint}:${runDigest}`;
  const idempotencyKey = `zerorank.idempotency.${endpoint}:${runDigest}`;
  const collection = parseContract('collection', {
    schemaVersion: '1.0',
    kind: 'collection',
    id: collectionId,
    scope: config.scope,
    providerId: ZERORANK_PROVIDER_ID,
    providerConnectionId: config.providerConnectionId,
    adapter: { id: ZERORANK_ADAPTER_ID, version: ZERORANK_ADAPTER_MAPPING_VERSION },
    sourceSchema: { id: ZERORANK_SOURCE_SCHEMA_ID, version: ZERORANK_SOURCE_SCHEMA_VERSION },
    method,
    sourceTime,
    startedAt: config.timing.startedAt,
    endedAt: config.timing.endedAt,
    collectedAt: config.timing.collectedAt,
    receivedAt: config.timing.receivedAt,
    completeness,
  });

  const prepared: PreparedUnit[] = units.map((unit) => {
    const identity: Contract<'sourceRecord'>['identity'] = {
      scope: config.scope,
      providerId: ZERORANK_PROVIDER_ID,
      providerConnectionId: config.providerConnectionId,
      sourceRecordId: unit.sourceRecordId,
    };
    const integrity: Contract<'sourceRecord'>['integrity'] = {
      state: 'hashed',
      algorithm: 'sha256',
      representation: 'canonical_json_v1',
      digest: unit.digest,
    };
    const sourceRecord = parseContract('sourceRecord', {
      schemaVersion: '1.0',
      kind: 'source_record',
      identity,
      integrity,
      availability: config.availability,
    });
    const sourceRowId = derivedIdentifier('zerorank.src', {
      runDigest,
      endpoint,
      sourceRecordId: unit.sourceRecordId,
      unitDigest: unit.digest,
    });
    const observations = unit.observations.map((spec) => {
      const cohortId = readableOrHashedIdentifier(
        `zerorank.cohort.${endpoint}`,
        `${unit.stableKey}:${spec.suffix}`,
      );
      const observationId = derivedIdentifier('zerorank.obs', {
        runDigest,
        endpoint,
        unitDigest: unit.digest,
        suffix: spec.suffix,
      });
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
            subject: unit.subject,
            metric: {
              id: spec.metricId,
              meaningVersion: ZERORANK_ADAPTER_MAPPING_VERSION,
              valueType: spec.valueType,
            },
            dimensions: unit.dimensions,
            method,
            timeWindowRules: {
              id: 'zerorank-point-observation',
              version: ZERORANK_ADAPTER_MAPPING_VERSION,
              alignment: 'point',
              durationSeconds: 0,
              timezone: 'UTC',
            },
          },
        },
        value: spec.value,
        provenance: {
          schemaVersion: '1.0',
          source: identity,
          adapter: { id: ZERORANK_ADAPTER_ID, version: ZERORANK_ADAPTER_MAPPING_VERSION },
          sourceSchema: { id: ZERORANK_SOURCE_SCHEMA_ID, version: ZERORANK_SOURCE_SCHEMA_VERSION },
          runId: collectionId,
          sourceTime,
          collectedAt: config.timing.collectedAt,
          receivedAt: config.timing.receivedAt,
          sourceTimezone: 'UTC',
          completeness,
          integrity,
          normalization: { id: ZERORANK_ADAPTER_ID, version: ZERORANK_ADAPTER_MAPPING_VERSION },
          availability: config.availability,
        },
      });
      return { sourceId: sourceRowId, record: observation };
    });
    return { source: { id: sourceRowId, record: sourceRecord }, observations };
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
    if (current.length === 0) {
      fail('unit_too_large', 'A single ZeroRank source unit cannot fit one bounded G.A.S. persistence part.');
    }
    groups.push(current);
    current = [unit];
    if (unit.observations.length > INGESTION_PART_BOUNDS.observationsPerPart || !fitsWorstCase(current)) {
      fail('unit_too_large', 'A single ZeroRank source unit cannot fit one bounded G.A.S. persistence part.');
    }
  }
  if (current.length > 0 || prepared.length === 0) groups.push(current);
  if (groups.length > INGESTION_PART_BOUNDS.parts) {
    fail('too_many_parts', 'ZeroRank endpoint evidence requires more than 64 bounded G.A.S. persistence parts.');
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
      fail('invalid_output', 'Adapted ZeroRank evidence failed current G.A.S. collection-part validation.');
    }
  });
  return {
    endpoint,
    providerId: ZERORANK_PROVIDER_ID,
    collectionId,
    idempotencyKey,
    batches,
  };
}

/**
 * Adapt one already-sanitized ZeroRank v1/minor0 artifact into five deterministic
 * local G.A.S. endpoint collection streams. This pure function performs no
 * authentication, tenant-authority issuance, persistence, file I/O, networking,
 * Activepieces runtime work, ZeroRank API work, recommendations, or actions.
 */
export function adaptZeroRankSanitizedEvidence(
  bytes: Uint8Array,
  trustedConfig: ZeroRankAdapterConfig,
): ZeroRankAdaptationResult {
  const { artifact, inputSha256 } = parseInput(bytes);
  const config = parseConfig(trustedConfig);
  validateArtifactSemantics(artifact, config);

  const rankings = buildEndpointCollection(artifact, config, 'rankings', makeRankingsUnits(artifact));
  const prompts = buildEndpointCollection(artifact, config, 'prompts', makePromptsUnits(artifact));
  const chats = buildEndpointCollection(artifact, config, 'chats', makeChatsUnits(artifact));
  const sources = buildEndpointCollection(artifact, config, 'sources', makeSourcesUnits(artifact));
  const sourceUrls = buildEndpointCollection(artifact, config, 'sourceUrls', makeSourceUrlsUnits(artifact));
  return { inputSha256, collections: [rankings, prompts, chats, sources, sourceUrls] };
}
