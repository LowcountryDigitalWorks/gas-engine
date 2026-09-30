import { z } from 'zod';
import {
  availability as availabilitySchema,
  identifier,
  reason,
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

export const BING_AI_INPUT_SCHEMA_VERSION = 'ldw.bing-ai-performance-evidence.v1' as const;
export const BING_AI_INPUT_SCHEMA_MINOR_VERSION = 0 as const;
export const BING_AI_PROVIDER_ID = 'bing-webmaster-ai-performance' as const;
export const BING_AI_ADAPTER_ID = 'ldw-bing-ai-performance-adapter' as const;
export const BING_AI_MAPPING_VERSION = '1.0.0' as const;
export const BING_AI_SOURCE_SCHEMA_ID = 'ldw.bing-ai-performance-evidence.v1' as const;
export const BING_AI_SOURCE_SCHEMA_VERSION = '1.0.0' as const;
export const MAX_BING_AI_INPUT_BYTES = MAX_HASH_INPUT_BYTES;
export const BING_AI_MAX_TOTAL_ROWS = 768 as const;
export const BING_AI_SECTION_LIMITS = Object.freeze({
  timeSeries: 366,
  pages: 256,
  groundingQueries: 192,
  queryPageMappings: 256,
} as const);

export type BingAiCoverage =
  | { readonly state: 'complete_export_view' }
  | { readonly state: 'filtered'; readonly filters: readonly string[]; readonly reason: string }
  | { readonly state: 'unknown'; readonly reason: string };

export interface BingAiPreviewState {
  readonly intents: boolean;
  readonly topics: boolean;
  readonly citationShare: boolean;
  readonly compare: boolean;
}

export interface BingAiSummary {
  readonly totalCitations?: number;
  readonly averageCitedPages?: number;
}

export interface BingAiTimeSeriesRow {
  readonly kind: 'time_series';
  readonly date: string;
  readonly citationCount: number;
  readonly citedPageCount?: number;
  readonly rowIdentity: string;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly observationIds: Readonly<{ citationCount: string; citedPageCount?: string }>;
}

export interface BingAiPageRow {
  readonly kind: 'page';
  readonly url: string;
  readonly citationCount: number;
  readonly rowIdentity: string;
  readonly urlId: string;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly observationIds: Readonly<{ citationCount: string }>;
}

export interface BingAiGroundingQueryRow {
  readonly kind: 'grounding_query';
  readonly phrase: string;
  readonly citationCount: number;
  readonly intent?: string;
  readonly topic?: string;
  readonly citationSharePct?: number;
  readonly rowIdentity: string;
  readonly queryId: string;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly observationIds: Readonly<{ citationCount: string; citationSharePct?: string }>;
}

export interface BingAiQueryPageMappingRow {
  readonly kind: 'query_page_mapping';
  readonly phrase: string;
  readonly url: string;
  readonly citationCount?: number;
  readonly rowIdentity: string;
  readonly queryId: string;
  readonly urlId: string;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly observationIds: Readonly<{ citationCount?: string }>;
}

export type BingAiAdaptedRow =
  | BingAiTimeSeriesRow
  | BingAiPageRow
  | BingAiGroundingQueryRow
  | BingAiQueryPageMappingRow;

export interface BingAiSemantics {
  readonly trustedProperty: string;
  readonly artifactProperty: string;
  readonly exportedAt: string;
  readonly period: Readonly<{ start: string; end: string }>;
  readonly dataState: 'final' | 'preliminary' | 'processing';
  readonly coverage: BingAiCoverage;
  readonly sampledSummary: true;
  readonly preview: BingAiPreviewState;
  readonly availability: Contract<'sourceRecord'>['availability'];
}

export interface BingAiAdaptationResult {
  readonly providerId: typeof BING_AI_PROVIDER_ID;
  readonly collectionId: string;
  readonly idempotencyKey: string;
  readonly inputSha256: string;
  readonly semantics: BingAiSemantics;
  readonly summary?: BingAiSummary;
  readonly rows: readonly BingAiAdaptedRow[];
  readonly batches: readonly CollectionBatch[];
}

export type BingAiAdapterErrorCode =
  | 'invalid_input'
  | 'input_too_large'
  | 'invalid_utf8'
  | 'invalid_json'
  | 'unsupported_schema'
  | 'invalid_source'
  | 'configuration_mismatch'
  | 'duplicate_source_id'
  | 'too_many_rows'
  | 'row_too_large'
  | 'too_many_parts'
  | 'invalid_output';

export class BingAiAdapterError extends Error {
  override name = 'BingAiAdapterError';
  constructor(readonly code: BingAiAdapterErrorCode, message: string) {
    super(message);
  }
}

export interface BingAiAdapterConfig {
  readonly scope: Scope;
  readonly expectedProperty: string;
  readonly providerConnectionId: string;
  readonly collectedAt: string;
  readonly receivedAt: string;
  readonly availability: Contract<'sourceRecord'>['availability'];
}

const boundedText = z.string().min(1).max(2_048).regex(/\S/);
const labelText = z.string().min(1).max(512).regex(/\S/);
const count = z.number().int().min(0).max(1_000_000_000);
const percentage = z.number().min(0).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const coverageSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('complete_export_view') }),
  z.strictObject({
    state: z.literal('filtered'),
    filters: z.array(labelText).min(1).max(32),
    reason,
  }),
  z.strictObject({ state: z.literal('unknown'), reason }),
]);

const previewSchema = z.strictObject({
  intents: z.boolean(),
  topics: z.boolean(),
  citationShare: z.boolean(),
  compare: z.boolean(),
});

const summarySchema = z.strictObject({
  totalCitations: count.optional(),
  averageCitedPages: z.number().min(0).max(1_000_000).optional(),
}).refine((value) => Object.keys(value).length > 0, 'summary must contain provider evidence');

const timeSeriesRowSchema = z.strictObject({
  date,
  citationCount: count,
  citedPageCount: count.optional(),
});
const pageRowSchema = z.strictObject({ url: boundedText, citationCount: count });
const groundingQueryRowSchema = z.strictObject({
  phrase: boundedText,
  citationCount: count,
  intent: labelText.optional(),
  topic: labelText.optional(),
  citationSharePct: percentage.optional(),
});
const mappingRowSchema = z.strictObject({
  phrase: boundedText,
  url: boundedText,
  citationCount: count.optional(),
});

const artifactSchema = z.strictObject({
  schemaVersion: z.string().min(1).max(128),
  schemaMinorVersion: z.number().int().min(0).max(1_000_000),
  property: boundedText,
  exportedAt: timestamp,
  period: z.strictObject({ start: timestamp, end: timestamp }),
  state: z.strictObject({
    dataState: z.enum(['final', 'preliminary', 'processing']),
    coverage: coverageSchema,
    sampledSummary: z.literal(true),
    preview: previewSchema,
  }),
  summary: summarySchema.optional(),
  timeSeries: z.array(timeSeriesRowSchema).max(BING_AI_SECTION_LIMITS.timeSeries),
  pages: z.array(pageRowSchema).max(BING_AI_SECTION_LIMITS.pages),
  groundingQueries: z.array(groundingQueryRowSchema).max(BING_AI_SECTION_LIMITS.groundingQueries),
  queryPageMappings: z.array(mappingRowSchema).max(BING_AI_SECTION_LIMITS.queryPageMappings).optional(),
});

const configSchema = z.strictObject({
  scope: scopeSchema,
  expectedProperty: boundedText,
  providerConnectionId: identifier,
  collectedAt: timestamp,
  receivedAt: timestamp,
  availability: availabilitySchema,
});

type Artifact = z.infer<typeof artifactSchema>;
type ParsedConfig = z.infer<typeof configSchema>;
type NormalizedRow =
  | { readonly kind: 'time_series'; readonly date: string; readonly citationCount: number; readonly citedPageCount?: number; readonly rowIdentity: string }
  | { readonly kind: 'page'; readonly url: string; readonly citationCount: number; readonly rowIdentity: string; readonly urlId: string }
  | { readonly kind: 'grounding_query'; readonly phrase: string; readonly citationCount: number; readonly intent?: string; readonly topic?: string; readonly citationSharePct?: number; readonly rowIdentity: string; readonly queryId: string }
  | { readonly kind: 'query_page_mapping'; readonly phrase: string; readonly url: string; readonly citationCount?: number; readonly rowIdentity: string; readonly queryId: string; readonly urlId: string };

interface ObservationSpec {
  readonly metricId: string;
  readonly unit: string;
  readonly subject: Contract<'cohort'>['context']['subject'];
  readonly dimensions: Contract<'cohort'>['context']['dimensions'];
  readonly value: number;
}
interface PreparedRow {
  readonly row: BingAiAdaptedRow;
  readonly source: CollectionBatch['sources'][number];
  readonly observations: readonly CollectionBatch['observations'][number][];
}

function fail(code: BingAiAdapterErrorCode, message: string): never {
  throw new BingAiAdapterError(code, message);
}
function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function derivedIdentifier(prefix: string, material: unknown): string {
  return `${prefix}:${hashCanonicalJson(material)}`;
}
function validateHttpsUrl(value: string, label: string): void {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.href !== value || url.username !== '' || url.password !== '') throw new Error('bad');
  } catch {
    fail('invalid_source', `${label} must be an exact absolute HTTPS URL.`);
  }
}

function parseInput(bytes: Uint8Array): { readonly artifact: Artifact; readonly inputSha256: string } {
  let inputSha256: string;
  try {
    inputSha256 = sha256Bytes(bytes);
  } catch (error) {
    if (error instanceof RangeError) fail('input_too_large', `Bing AI evidence exceeds ${MAX_BING_AI_INPUT_BYTES} bytes.`);
    fail('invalid_input', 'Bing AI evidence input must be an ordinary Uint8Array or Buffer.');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail('invalid_utf8', 'Bing AI evidence is not valid UTF-8.');
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    fail('invalid_json', 'Bing AI evidence is not valid JSON.');
  }
  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    fail('invalid_source', 'Bing AI evidence root must be an object.');
  }
  const root = decoded as Record<string, unknown>;
  if (root['schemaVersion'] !== BING_AI_INPUT_SCHEMA_VERSION
      || root['schemaMinorVersion'] !== BING_AI_INPUT_SCHEMA_MINOR_VERSION) {
    fail('unsupported_schema', `Only ${BING_AI_INPUT_SCHEMA_VERSION} minor ${BING_AI_INPUT_SCHEMA_MINOR_VERSION} is supported.`);
  }
  const parsed = artifactSchema.safeParse(decoded);
  if (!parsed.success) fail('invalid_source', 'Bing AI evidence shape is invalid or contains unsupported fields.');
  return { artifact: parsed.data, inputSha256 };
}

function parseConfig(input: BingAiAdapterConfig): ParsedConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Trusted Bing AI adapter configuration is invalid.');
  if (parsed.data.collectedAt > parsed.data.receivedAt) fail('invalid_input', 'Trusted Bing AI timing is inconsistent.');
  return parsed.data;
}

function validateSemantics(artifact: Artifact, config: ParsedConfig): void {
  if (artifact.property !== config.expectedProperty) {
    fail('configuration_mismatch', 'Bing AI property does not match trusted adapter configuration.');
  }
  if (!(artifact.period.start < artifact.period.end
      && artifact.period.end <= artifact.exportedAt
      && artifact.exportedAt <= config.collectedAt)) {
    fail('invalid_source', 'Bing AI source period/export timing is inconsistent.');
  }
  const aggregate = artifact.timeSeries.length
    + artifact.pages.length
    + artifact.groundingQueries.length
    + (artifact.queryPageMappings?.length ?? 0);
  if (aggregate > BING_AI_MAX_TOTAL_ROWS) {
    fail('too_many_rows', `Bing AI evidence exceeds the aggregate ${BING_AI_MAX_TOTAL_ROWS}-row bound.`);
  }
  const sets = {
    timeSeries: new Set<string>(),
    pages: new Set<string>(),
    groundingQueries: new Set<string>(),
    queryPageMappings: new Set<string>(),
  };
  for (const row of artifact.timeSeries) {
    if (sets.timeSeries.has(row.date)) fail('duplicate_source_id', 'Bing AI time-series dates must be unique.');
    sets.timeSeries.add(row.date);
  }
  for (const row of artifact.pages) {
    validateHttpsUrl(row.url, 'Bing AI page URL');
    if (sets.pages.has(row.url)) fail('duplicate_source_id', 'Bing AI page URLs must be unique.');
    sets.pages.add(row.url);
  }
  for (const row of artifact.groundingQueries) {
    if (sets.groundingQueries.has(row.phrase)) fail('duplicate_source_id', 'Bing AI grounding-query phrases must be unique.');
    sets.groundingQueries.add(row.phrase);
  }
  for (const row of artifact.queryPageMappings ?? []) {
    validateHttpsUrl(row.url, 'Bing AI query/page URL');
    const key = canonicalJson([row.phrase, row.url]);
    if (sets.queryPageMappings.has(key)) fail('duplicate_source_id', 'Bing AI query/page mapping identities must be unique.');
    sets.queryPageMappings.add(key);
  }
}

function normalizeRows(artifact: Artifact): NormalizedRow[] {
  const rows: NormalizedRow[] = [
    ...artifact.timeSeries.map((row): NormalizedRow => ({
      kind: 'time_series',
      date: row.date,
      citationCount: row.citationCount,
      ...(row.citedPageCount === undefined ? {} : { citedPageCount: row.citedPageCount }),
      rowIdentity: derivedIdentifier('bing-ai.row', { kind: 'time_series', date: row.date }),
    })),
    ...artifact.pages.map((row): NormalizedRow => ({
      kind: 'page',
      url: row.url,
      citationCount: row.citationCount,
      urlId: derivedIdentifier('bing-ai.url', { url: row.url }),
      rowIdentity: derivedIdentifier('bing-ai.row', { kind: 'page', url: row.url }),
    })),
    ...artifact.groundingQueries.map((row): NormalizedRow => ({
      kind: 'grounding_query',
      phrase: row.phrase,
      citationCount: row.citationCount,
      ...(row.intent === undefined ? {} : { intent: row.intent }),
      ...(row.topic === undefined ? {} : { topic: row.topic }),
      ...(row.citationSharePct === undefined ? {} : { citationSharePct: row.citationSharePct }),
      queryId: derivedIdentifier('bing-ai.query', { phrase: row.phrase }),
      rowIdentity: derivedIdentifier('bing-ai.row', { kind: 'grounding_query', phrase: row.phrase }),
    })),
    ...(artifact.queryPageMappings ?? []).map((row): NormalizedRow => ({
      kind: 'query_page_mapping',
      phrase: row.phrase,
      url: row.url,
      ...(row.citationCount === undefined ? {} : { citationCount: row.citationCount }),
      queryId: derivedIdentifier('bing-ai.query', { phrase: row.phrase }),
      urlId: derivedIdentifier('bing-ai.url', { url: row.url }),
      rowIdentity: derivedIdentifier('bing-ai.row', { kind: 'query_page_mapping', phrase: row.phrase, url: row.url }),
    })),
  ];
  rows.sort((left, right) => asciiCompare(left.rowIdentity, right.rowIdentity));
  return rows;
}

function normalizedSummary(summary: Artifact['summary']): BingAiSummary | undefined {
  if (summary === undefined) return undefined;
  return {
    ...(summary.totalCitations === undefined ? {} : { totalCitations: summary.totalCitations }),
    ...(summary.averageCitedPages === undefined ? {} : { averageCitedPages: summary.averageCitedPages }),
  };
}

function canonicalCompleteness(artifact: Artifact, rowCount: number): Contract<'collection'>['completeness'] {
  if (artifact.state.dataState === 'final' && artifact.state.coverage.state === 'complete_export_view') {
    return { state: 'complete', expectedCount: rowCount, receivedCount: rowCount };
  }
  return {
    state: 'partial',
    receivedCount: rowCount,
    reason: 'Bing AI evidence is sampled/aggregated and this exported view is preliminary, processing, filtered, or coverage-unknown; missing rows are not absence.',
  };
}

function method(config: ParsedConfig): Contract<'collection'>['method'] {
  return {
    id: 'ldw-bing-ai-performance',
    version: BING_AI_MAPPING_VERSION,
    configurationId: derivedIdentifier('bing-ai.config', {
      property: config.expectedProperty,
      providerConnectionId: config.providerConnectionId,
      mapping: BING_AI_MAPPING_VERSION,
    }),
    configurationRevision: 1,
  };
}

function rowObservations(row: NormalizedRow): readonly ObservationSpec[] {
  switch (row.kind) {
    case 'time_series':
      return [
        {
          metricId: 'bing-ai-time-series-citation-count',
          unit: 'citations',
          subject: { kind: 'site', reference: derivedIdentifier('bing-ai.site', { provider: BING_AI_PROVIDER_ID }) },
          dimensions: { providerId: BING_AI_PROVIDER_ID, surface: `time-series:${row.date}` },
          value: row.citationCount,
        },
        ...(row.citedPageCount === undefined ? [] : [{
          metricId: 'bing-ai-time-series-cited-page-count',
          unit: 'pages',
          subject: { kind: 'site' as const, reference: derivedIdentifier('bing-ai.site', { provider: BING_AI_PROVIDER_ID }) },
          dimensions: { providerId: BING_AI_PROVIDER_ID, surface: `time-series:${row.date}` },
          value: row.citedPageCount,
        }]),
      ];
    case 'page':
      return [{
        metricId: 'bing-ai-page-citation-count',
        unit: 'citations',
        subject: { kind: 'page', reference: row.urlId },
        dimensions: { providerId: BING_AI_PROVIDER_ID, surface: 'bing-ai-page' },
        value: row.citationCount,
      }];
    case 'grounding_query':
      return [
        {
          metricId: 'bing-ai-grounding-query-citation-count',
          unit: 'citations',
          subject: { kind: 'prompt', reference: row.queryId },
          dimensions: { providerId: BING_AI_PROVIDER_ID, surface: 'bing-grounding-query' },
          value: row.citationCount,
        },
        ...(row.citationSharePct === undefined ? [] : [{
          metricId: 'bing-ai-grounding-query-citation-share-pct',
          unit: 'percent',
          subject: { kind: 'prompt' as const, reference: row.queryId },
          dimensions: { providerId: BING_AI_PROVIDER_ID, surface: 'bing-grounding-query' },
          value: row.citationSharePct,
        }]),
      ];
    case 'query_page_mapping':
      return row.citationCount === undefined ? [] : [{
        metricId: 'bing-ai-query-page-citation-count',
        unit: 'citations',
        subject: { kind: 'page', reference: row.urlId },
        dimensions: { providerId: BING_AI_PROVIDER_ID, surface: 'bing-query-page', promptCohort: { id: row.queryId, revision: 1 } },
        value: row.citationCount,
      }];
  }
}

function makeObservation(
  spec: ObservationSpec,
  rowIdentity: string,
  sourceId: string,
  collection: Contract<'collection'>,
  identity: Contract<'sourceRecord'>['identity'],
  integrity: Contract<'sourceRecord'>['integrity'],
  availability: Contract<'sourceRecord'>['availability'],
): CollectionBatch['observations'][number] {
  const id = derivedIdentifier('bing-ai.obs', { collectionId: collection.id, rowIdentity, metricId: spec.metricId });
  const record = parseContract('observation', {
    schemaVersion: '1.0',
    kind: 'observation',
    id,
    cohort: {
      schemaVersion: '1.0',
      kind: 'cohort',
      id: derivedIdentifier('bing-ai.cohort', { subject: spec.subject, metricId: spec.metricId, dimensions: spec.dimensions }),
      revision: 1,
      context: {
        scope: collection.scope,
        subject: spec.subject,
        metric: {
          id: spec.metricId,
          meaningVersion: BING_AI_MAPPING_VERSION,
          valueType: 'number',
          unit: spec.unit,
        },
        dimensions: spec.dimensions,
        method: collection.method,
        timeWindowRules: {
          id: 'bing-ai-export-window',
          version: BING_AI_MAPPING_VERSION,
          alignment: 'calendar',
          durationSeconds: Math.max(0, Math.floor((Date.parse(collection.sourceTime.end) - Date.parse(collection.sourceTime.start)) / 1000)),
          timezone: 'UTC',
        },
      },
    },
    value: { state: 'observed', value: { type: 'number', value: spec.value } },
    provenance: {
      schemaVersion: '1.0',
      source: identity,
      adapter: collection.adapter,
      sourceSchema: collection.sourceSchema,
      runId: collection.id,
      sourceTime: collection.sourceTime,
      collectedAt: collection.collectedAt,
      receivedAt: collection.receivedAt,
      sourceTimezone: 'UTC',
      completeness: collection.completeness,
      integrity,
      normalization: collection.adapter,
      availability,
    },
  });
  return { sourceId, record };
}

function prepareRows(
  artifact: Artifact,
  config: ParsedConfig,
  rows: readonly NormalizedRow[],
  collection: Contract<'collection'>,
): PreparedRow[] {
  return rows.map((row) => {
    const digest = hashCanonicalJson({
      schemaVersion: BING_AI_INPUT_SCHEMA_VERSION,
      schemaMinorVersion: BING_AI_INPUT_SCHEMA_MINOR_VERSION,
      property: artifact.property,
      exportedAt: artifact.exportedAt,
      period: artifact.period,
      state: artifact.state,
      row,
    });
    const identity: Contract<'sourceRecord'>['identity'] = {
      scope: config.scope,
      providerId: BING_AI_PROVIDER_ID,
      providerConnectionId: config.providerConnectionId,
      sourceRecordId: row.rowIdentity,
    };
    const integrity: Contract<'sourceRecord'>['integrity'] = {
      state: 'hashed',
      algorithm: 'sha256',
      representation: 'canonical_json_v1',
      digest,
    };
    const source = parseContract('sourceRecord', {
      schemaVersion: '1.0',
      kind: 'source_record',
      identity,
      integrity,
      availability: config.availability,
    });
    const sourceId = derivedIdentifier('bing-ai.src', { collectionId: collection.id, rowIdentity: row.rowIdentity, digest });
    const observations = rowObservations(row).map((spec) =>
      makeObservation(spec, row.rowIdentity, sourceId, collection, identity, integrity, config.availability));
    const observationIds = Object.fromEntries(observations.map((entry) => [entry.record.cohort.context.metric.id, entry.record.id]));
    let adapted: BingAiAdaptedRow;
    switch (row.kind) {
      case 'time_series':
        adapted = {
          ...row,
          sourceId,
          sourceRecordId: row.rowIdentity,
          observationIds: {
            citationCount: observationIds['bing-ai-time-series-citation-count']!,
            ...(observationIds['bing-ai-time-series-cited-page-count'] === undefined
              ? {}
              : { citedPageCount: observationIds['bing-ai-time-series-cited-page-count'] }),
          },
        };
        break;
      case 'page':
        adapted = {
          ...row,
          sourceId,
          sourceRecordId: row.rowIdentity,
          observationIds: { citationCount: observationIds['bing-ai-page-citation-count']! },
        };
        break;
      case 'grounding_query':
        adapted = {
          ...row,
          sourceId,
          sourceRecordId: row.rowIdentity,
          observationIds: {
            citationCount: observationIds['bing-ai-grounding-query-citation-count']!,
            ...(observationIds['bing-ai-grounding-query-citation-share-pct'] === undefined
              ? {}
              : { citationSharePct: observationIds['bing-ai-grounding-query-citation-share-pct'] }),
          },
        };
        break;
      case 'query_page_mapping':
        adapted = {
          ...row,
          sourceId,
          sourceRecordId: row.rowIdentity,
          observationIds: observationIds['bing-ai-query-page-citation-count'] === undefined
            ? {}
            : { citationCount: observationIds['bing-ai-query-page-citation-count'] },
        };
        break;
    }
    return { row: adapted, source: { id: sourceId, record: source }, observations };
  });
}

function packRows(
  prepared: readonly PreparedRow[],
  idempotencyKey: string,
  collection: Contract<'collection'>,
): CollectionBatch[] {
  const groups: PreparedRow[][] = [];
  let current: PreparedRow[] = [];
  const fits = (items: readonly PreparedRow[]): boolean => {
    const observationCount = items.reduce((sum, item) => sum + item.observations.length, 0);
    if (items.length > INGESTION_PART_BOUNDS.sourcesPerPart || observationCount > INGESTION_PART_BOUNDS.observationsPerPart) return false;
    try {
      canonicalJson({
        idempotencyKey,
        collection,
        part: INGESTION_PART_BOUNDS.parts,
        parts: INGESTION_PART_BOUNDS.parts,
        sources: items.map((item) => item.source),
        observations: items.flatMap((item) => item.observations),
      });
      return true;
    } catch (error) {
      if (error instanceof RangeError) return false;
      throw error;
    }
  };
  for (const row of prepared) {
    const candidate = [...current, row];
    if (fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current.length === 0) fail('row_too_large', 'One Bing AI row cannot fit a bounded canonical persistence part.');
    groups.push(current);
    current = [row];
    if (!fits(current)) fail('row_too_large', 'One Bing AI row cannot fit a bounded canonical persistence part.');
  }
  if (current.length > 0 || prepared.length === 0) groups.push(current);
  if (groups.length > INGESTION_PART_BOUNDS.parts) fail('too_many_parts', 'Bing AI evidence requires too many persistence parts.');
  const parts = groups.length;
  return groups.map((group, index) => {
    try {
      return parseCollectionBatch({
        idempotencyKey,
        collection,
        part: index + 1,
        parts,
        sources: group.map((item) => item.source),
        observations: group.flatMap((item) => item.observations),
      });
    } catch {
      fail('invalid_output', 'Adapted Bing AI evidence failed canonical collection-part validation.');
    }
  });
}

function summaryObservations(
  artifact: Artifact,
  config: ParsedConfig,
  collection: Contract<'collection'>,
): PreparedRow[] {
  if (artifact.summary === undefined) return [];
  const rowIdentity = derivedIdentifier('bing-ai.row', { kind: 'summary' });
  const semantic = { kind: 'summary', summary: artifact.summary };
  const digest = hashCanonicalJson({
    schemaVersion: BING_AI_INPUT_SCHEMA_VERSION,
    schemaMinorVersion: BING_AI_INPUT_SCHEMA_MINOR_VERSION,
    property: artifact.property,
    exportedAt: artifact.exportedAt,
    period: artifact.period,
    state: artifact.state,
    row: semantic,
  });
  const identity: Contract<'sourceRecord'>['identity'] = {
    scope: config.scope,
    providerId: BING_AI_PROVIDER_ID,
    providerConnectionId: config.providerConnectionId,
    sourceRecordId: rowIdentity,
  };
  const integrity: Contract<'sourceRecord'>['integrity'] = {
    state: 'hashed',
    algorithm: 'sha256',
    representation: 'canonical_json_v1',
    digest,
  };
  const source = parseContract('sourceRecord', {
    schemaVersion: '1.0',
    kind: 'source_record',
    identity,
    integrity,
    availability: config.availability,
  });
  const sourceId = derivedIdentifier('bing-ai.src', { collectionId: collection.id, rowIdentity, digest });
  const specs: ObservationSpec[] = [];
  if (artifact.summary.totalCitations !== undefined) {
    specs.push({
      metricId: 'bing-ai-total-citations',
      unit: 'citations',
      subject: { kind: 'site', reference: derivedIdentifier('bing-ai.site', { property: artifact.property }) },
      dimensions: { providerId: BING_AI_PROVIDER_ID, surface: 'bing-ai-summary' },
      value: artifact.summary.totalCitations,
    });
  }
  if (artifact.summary.averageCitedPages !== undefined) {
    specs.push({
      metricId: 'bing-ai-average-cited-pages',
      unit: 'pages',
      subject: { kind: 'site', reference: derivedIdentifier('bing-ai.site', { property: artifact.property }) },
      dimensions: { providerId: BING_AI_PROVIDER_ID, surface: 'bing-ai-summary' },
      value: artifact.summary.averageCitedPages,
    });
  }
  const observations = specs.map((spec) => makeObservation(spec, rowIdentity, sourceId, collection, identity, integrity, config.availability));
  return [{
    row: {
      kind: 'time_series',
      date: artifact.period.end.slice(0, 10),
      citationCount: artifact.summary.totalCitations ?? 0,
      rowIdentity,
      sourceId,
      sourceRecordId: rowIdentity,
      observationIds: { citationCount: observations[0]?.record.id ?? derivedIdentifier('bing-ai.noop', { rowIdentity }) },
    },
    source: { id: sourceId, record: source },
    observations,
  }];
}

/**
 * Adapt one sanitized Bing Webmaster AI Performance export snapshot into the existing
 * canonical collection/source/observation contracts plus a bounded provider sidecar.
 * No provider retrieval, API client, OAuth, persistence, runtime AI, or action authority occurs.
 */
export function adaptBingAiPerformanceEvidence(
  bytes: Uint8Array,
  trustedConfig: BingAiAdapterConfig,
): BingAiAdaptationResult {
  const { artifact, inputSha256 } = parseInput(bytes);
  const config = parseConfig(trustedConfig);
  validateSemantics(artifact, config);
  const rows = normalizeRows(artifact);
  const m = method(config);
  const completeness = canonicalCompleteness(artifact, rows.length + (artifact.summary === undefined ? 0 : 1));
  const summary = normalizedSummary(artifact.summary);
  const collectionDigest = hashCanonicalJson({
    algorithm: 'gas-bing-ai-performance-collection-v1',
    scope: config.scope,
    providerConnectionId: config.providerConnectionId,
    trustedProperty: config.expectedProperty,
    exportedAt: artifact.exportedAt,
    period: artifact.period,
    state: artifact.state,
    summary,
    rows,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
  });
  const collectionId = `bing-ai.collection:${collectionDigest}`;
  const idempotencyKey = `bing-ai.idempotency:${collectionDigest}`;
  const collection = parseContract('collection', {
    schemaVersion: '1.0',
    kind: 'collection',
    id: collectionId,
    scope: config.scope,
    providerId: BING_AI_PROVIDER_ID,
    providerConnectionId: config.providerConnectionId,
    adapter: { id: BING_AI_ADAPTER_ID, version: BING_AI_MAPPING_VERSION },
    sourceSchema: { id: BING_AI_SOURCE_SCHEMA_ID, version: BING_AI_SOURCE_SCHEMA_VERSION },
    method: m,
    sourceTime: artifact.period,
    startedAt: artifact.period.start,
    endedAt: artifact.period.end,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
    completeness,
  });
  const prepared = prepareRows(artifact, config, rows, collection);
  const summaryPrepared = summaryObservations(artifact, config, collection);
  const batches = packRows([...summaryPrepared, ...prepared], idempotencyKey, collection);
  return {
    providerId: BING_AI_PROVIDER_ID,
    collectionId,
    idempotencyKey,
    inputSha256,
    semantics: {
      trustedProperty: config.expectedProperty,
      artifactProperty: artifact.property,
      exportedAt: artifact.exportedAt,
      period: structuredClone(artifact.period),
      dataState: artifact.state.dataState,
      coverage: structuredClone(artifact.state.coverage),
      sampledSummary: true,
      preview: structuredClone(artifact.state.preview),
      availability: structuredClone(config.availability),
    },
    ...(summary === undefined ? {} : { summary }),
    rows: prepared.map((item) => item.row),
    batches,
  };
}


export interface ValidatedBingAiWindow {
  readonly collection: Contract<'collection'>;
  readonly semantics: BingAiSemantics;
  readonly summary?: BingAiSummary;
  readonly rows: readonly BingAiAdaptedRow[];
}

function reconstructArtifactFromWindow(input: BingAiAdaptationResult): Artifact {
  const timeSeries: unknown[] = [];
  const pages: unknown[] = [];
  const groundingQueries: unknown[] = [];
  const queryPageMappings: unknown[] = [];

  for (const row of input.rows) {
    switch (row.kind) {
      case 'time_series':
        timeSeries.push({
          date: row.date,
          citationCount: row.citationCount,
          ...(row.citedPageCount === undefined ? {} : { citedPageCount: row.citedPageCount }),
        });
        break;
      case 'page':
        pages.push({ url: row.url, citationCount: row.citationCount });
        break;
      case 'grounding_query':
        groundingQueries.push({
          phrase: row.phrase,
          citationCount: row.citationCount,
          ...(row.intent === undefined ? {} : { intent: row.intent }),
          ...(row.topic === undefined ? {} : { topic: row.topic }),
          ...(row.citationSharePct === undefined ? {} : { citationSharePct: row.citationSharePct }),
        });
        break;
      case 'query_page_mapping':
        queryPageMappings.push({
          phrase: row.phrase,
          url: row.url,
          ...(row.citationCount === undefined ? {} : { citationCount: row.citationCount }),
        });
        break;
      default:
        fail('invalid_output', 'Bing AI sidecar contains an unsupported row kind.');
    }
  }

  const candidate = {
    schemaVersion: BING_AI_INPUT_SCHEMA_VERSION,
    schemaMinorVersion: BING_AI_INPUT_SCHEMA_MINOR_VERSION,
    property: input.semantics.artifactProperty,
    exportedAt: input.semantics.exportedAt,
    period: structuredClone(input.semantics.period),
    state: {
      dataState: input.semantics.dataState,
      coverage: structuredClone(input.semantics.coverage),
      sampledSummary: input.semantics.sampledSummary,
      preview: structuredClone(input.semantics.preview),
    },
    ...(input.summary === undefined ? {} : { summary: structuredClone(input.summary) }),
    timeSeries,
    pages,
    groundingQueries,
    ...(queryPageMappings.length === 0 ? {} : { queryPageMappings }),
  };
  const parsed = artifactSchema.safeParse(candidate);
  if (!parsed.success) {
    fail('invalid_output', 'Bing AI sidecar semantics cannot reconstruct a valid source artifact.');
  }
  return parsed.data;
}

function rebuildExpectedWindow(
  input: BingAiAdaptationResult,
  canonicalCollection: Contract<'collection'>,
): Readonly<{
  collection: Contract<'collection'>;
  idempotencyKey: string;
  summary?: BingAiSummary;
  rows: readonly BingAiAdaptedRow[];
  batches: readonly CollectionBatch[];
}> {
  const artifact = reconstructArtifactFromWindow(input);
  if (canonicalCollection.providerConnectionId === undefined) {
    fail('invalid_output', 'Bing AI canonical collection is missing provider connection identity.');
  }
  const config = parseConfig({
    scope: structuredClone(canonicalCollection.scope),
    expectedProperty: input.semantics.trustedProperty,
    providerConnectionId: canonicalCollection.providerConnectionId,
    collectedAt: canonicalCollection.collectedAt,
    receivedAt: canonicalCollection.receivedAt,
    availability: structuredClone(input.semantics.availability),
  });
  validateSemantics(artifact, config);

  const normalizedRows = normalizeRows(artifact);
  const summary = normalizedSummary(artifact.summary);
  const collectionDigest = hashCanonicalJson({
    algorithm: 'gas-bing-ai-performance-collection-v1',
    scope: config.scope,
    providerConnectionId: config.providerConnectionId,
    trustedProperty: config.expectedProperty,
    exportedAt: artifact.exportedAt,
    period: artifact.period,
    state: artifact.state,
    summary,
    rows: normalizedRows,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
  });
  const collectionId = `bing-ai.collection:${collectionDigest}`;
  const idempotencyKey = `bing-ai.idempotency:${collectionDigest}`;
  const collection = parseContract('collection', {
    schemaVersion: '1.0',
    kind: 'collection',
    id: collectionId,
    scope: config.scope,
    providerId: BING_AI_PROVIDER_ID,
    providerConnectionId: config.providerConnectionId,
    adapter: { id: BING_AI_ADAPTER_ID, version: BING_AI_MAPPING_VERSION },
    sourceSchema: { id: BING_AI_SOURCE_SCHEMA_ID, version: BING_AI_SOURCE_SCHEMA_VERSION },
    method: method(config),
    sourceTime: artifact.period,
    startedAt: artifact.period.start,
    endedAt: artifact.period.end,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
    completeness: canonicalCompleteness(
      artifact,
      normalizedRows.length + (artifact.summary === undefined ? 0 : 1),
    ),
  });
  const prepared = prepareRows(artifact, config, normalizedRows, collection);
  const summaryPrepared = summaryObservations(artifact, config, collection);
  const batches = packRows([...summaryPrepared, ...prepared], idempotencyKey, collection);

  return {
    collection,
    idempotencyKey,
    ...(summary === undefined ? {} : { summary }),
    rows: prepared.map((item) => item.row),
    batches,
  };
}

/**
 * Revalidate an application-local Bing adaptation before Release 0.14 analysis.
 * This proves bounded canonical/sidecar consistency; it does not establish provider authenticity.
 */
export function validateBingAiWindow(input: BingAiAdaptationResult): ValidatedBingAiWindow {
  if (input === null
      || typeof input !== 'object'
      || input.providerId !== BING_AI_PROVIDER_ID
      || !Array.isArray(input.rows)
      || input.rows.length > BING_AI_MAX_TOTAL_ROWS
      || !Array.isArray(input.batches)
      || input.batches.length < 1
      || input.batches.length > INGESTION_PART_BOUNDS.parts) {
    fail('invalid_output', 'Bing AI adapted window has invalid bounded metadata.');
  }

  const parsed = input.batches.map((batch) => {
    try {
      return parseCollectionBatch(batch);
    } catch {
      fail('invalid_output', 'Bing AI adapted batch is not valid canonical evidence.');
    }
  }).sort((left, right) => left.part - right.part);
  const first = parsed[0]!;
  for (let index = 0; index < parsed.length; index += 1) {
    const batch = parsed[index]!;
    if (batch.part !== index + 1
        || batch.parts !== parsed.length
        || batch.idempotencyKey !== input.idempotencyKey
        || canonicalJson(batch.collection) !== canonicalJson(first.collection)) {
      fail('invalid_output', 'Bing AI adapted batches are incomplete or inconsistent.');
    }
  }

  let expected: ReturnType<typeof rebuildExpectedWindow>;
  try {
    expected = rebuildExpectedWindow(input, first.collection);
  } catch (error) {
    if (error instanceof BingAiAdapterError) throw error;
    fail('invalid_output', 'Bing AI adapted window cannot be deterministically reconstructed.');
  }

  const summariesMatch = input.summary === undefined || expected.summary === undefined
    ? input.summary === undefined && expected.summary === undefined
    : canonicalJson(input.summary) === canonicalJson(expected.summary);

  if (input.collectionId !== expected.collection.id
      || input.idempotencyKey !== expected.idempotencyKey
      || !summariesMatch
      || canonicalJson(input.rows) !== canonicalJson(expected.rows)
      || canonicalJson(parsed) !== canonicalJson(expected.batches)) {
    fail('invalid_output', 'Bing AI sidecar and canonical evidence disagree.');
  }

  return {
    collection: structuredClone(expected.collection),
    semantics: structuredClone(input.semantics),
    ...(expected.summary === undefined ? {} : { summary: structuredClone(expected.summary) }),
    rows: structuredClone(expected.rows),
  };
}

