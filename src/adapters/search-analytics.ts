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

export const SEARCH_ANALYTICS_INPUT_SCHEMA_VERSION = 'ldw.search-analytics-evidence.v1' as const;
export const SEARCH_ANALYTICS_INPUT_SCHEMA_MINOR_VERSION = 0 as const;
export const SEARCH_ANALYTICS_PROVIDER_ID = 'google-search-console' as const;
export const SEARCH_ANALYTICS_ADAPTER_ID = 'ldw-search-analytics-sanitized' as const;
export const SEARCH_ANALYTICS_MAPPING_VERSION = '1.0.0' as const;
export const SEARCH_ANALYTICS_SOURCE_SCHEMA_ID = 'ldw.search-analytics-evidence' as const;
export const SEARCH_ANALYTICS_SOURCE_SCHEMA_VERSION = 'v1.0' as const;
export const SEARCH_ANALYTICS_MAX_ROWS = 384 as const;
export const MAX_SEARCH_ANALYTICS_INPUT_BYTES = MAX_HASH_INPUT_BYTES;

export const SEARCH_ANALYTICS_METRIC_SPECS = Object.freeze({
  clicks: Object.freeze({ id: 'gsc-clicks', unit: 'clicks' }),
  impressions: Object.freeze({ id: 'gsc-impressions', unit: 'impressions' }),
  ctr: Object.freeze({ id: 'gsc-ctr', unit: 'ratio_0_to_1' }),
  averagePosition: Object.freeze({ id: 'gsc-average-position', unit: 'average_position' }),
} as const);

export type SearchAnalyticsMetricKey = keyof typeof SEARCH_ANALYTICS_METRIC_SPECS;
export type SearchAnalyticsAdapterErrorCode =
  | 'invalid_input'
  | 'input_too_large'
  | 'invalid_utf8'
  | 'invalid_json'
  | 'unsupported_schema'
  | 'invalid_source'
  | 'configuration_mismatch'
  | 'duplicate_row'
  | 'too_many_rows'
  | 'row_too_large'
  | 'too_many_parts'
  | 'invalid_output';

export class SearchAnalyticsAdapterError extends Error {
  override name = 'SearchAnalyticsAdapterError';

  constructor(
    readonly code: SearchAnalyticsAdapterErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface SearchAnalyticsAdapterConfig {
  readonly scope: Scope;
  readonly expectedProperty: string;
  readonly providerConnectionId: string;
  readonly collectedAt: string;
  readonly receivedAt: string;
  readonly availability: Contract<'sourceRecord'>['availability'];
}

export interface SearchAnalyticsFilter {
  readonly dimension: 'query' | 'page';
  readonly operator: string;
  readonly expression: string;
}

export type SearchAnalyticsCoverage =
  | { readonly state: 'complete'; readonly truncated: false; readonly anonymized: false }
  | { readonly state: 'partial' | 'unknown'; readonly truncated: boolean; readonly anonymized: boolean; readonly reason: string };

export interface SearchAnalyticsFreshness {
  readonly dataState: 'final' | 'preliminary';
  readonly freshThrough: string;
}

export interface SearchAnalyticsSemantics {
  readonly property: string;
  readonly observedAt: string;
  readonly exportedAt: string;
  readonly requestedWindow: Readonly<{ start: string; end: string }>;
  readonly effectiveWindow: Readonly<{ start: string; end: string }>;
  readonly freshness: SearchAnalyticsFreshness;
  readonly searchType: 'web';
  readonly dimensions: readonly ['query', 'page'];
  readonly filterGroupType: 'and';
  readonly filters: readonly SearchAnalyticsFilter[];
  readonly coverage: SearchAnalyticsCoverage;
}

export interface SearchAnalyticsAdaptedRow {
  readonly rowIdentity: string;
  readonly query: string;
  readonly page: string;
  readonly searchType: 'web';
  readonly queryId: string;
  readonly pageId: string;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly observationIds: Readonly<Record<SearchAnalyticsMetricKey, string>>;
}

export interface SearchAnalyticsAdaptationResult {
  /** SHA-256 of the exact sanitized source bytes. Diagnostic integrity only; never authority or semantic identity. */
  readonly inputSha256: string;
  readonly providerId: typeof SEARCH_ANALYTICS_PROVIDER_ID;
  readonly collectionId: string;
  readonly idempotencyKey: string;
  readonly semantics: SearchAnalyticsSemantics;
  readonly rows: readonly SearchAnalyticsAdaptedRow[];
  readonly batches: readonly CollectionBatch[];
}

const boundedProperty = z.string().min(1).max(2_048).regex(/\S/);
const boundedQuery = z.string().min(1).max(512).regex(/\S/);
const boundedPage = z.string().min(1).max(2_048).regex(/\S/);
const filterToken = z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const filterExpression = z.string().max(512);
const canonicalNonNegativeNumber = z.number().min(0).max(1e15).refine((value) => !Object.is(value, -0));
const canonicalNonNegativeInteger = canonicalNonNegativeNumber.refine(Number.isSafeInteger);
const ctrNumber = z.number().min(0).max(1).refine((value) => !Object.is(value, -0));

const filterSchema = z.strictObject({
  dimension: z.enum(['query', 'page']),
  operator: filterToken,
  expression: filterExpression,
});

const coverageSchema = z.discriminatedUnion('state', [
  z.strictObject({
    state: z.literal('complete'),
    truncated: z.literal(false),
    anonymized: z.literal(false),
  }),
  z.strictObject({
    state: z.literal('partial'),
    truncated: z.boolean(),
    anonymized: z.boolean(),
    reason,
  }),
  z.strictObject({
    state: z.literal('unknown'),
    truncated: z.boolean(),
    anonymized: z.boolean(),
    reason,
  }),
]);

const freshnessSchema = z.strictObject({
  dataState: z.enum(['final', 'preliminary']),
  freshThrough: timestamp,
});

const rowSchema = z.strictObject({
  query: boundedQuery,
  page: boundedPage,
  clicks: canonicalNonNegativeInteger,
  impressions: canonicalNonNegativeInteger,
  ctr: ctrNumber,
  averagePosition: canonicalNonNegativeNumber,
});

const artifactSchema = z.strictObject({
  schemaVersion: z.literal(SEARCH_ANALYTICS_INPUT_SCHEMA_VERSION),
  schemaMinorVersion: z.literal(SEARCH_ANALYTICS_INPUT_SCHEMA_MINOR_VERSION),
  provider: z.literal(SEARCH_ANALYTICS_PROVIDER_ID),
  property: boundedProperty,
  observedAt: timestamp,
  exportedAt: timestamp,
  requestedWindow: z.strictObject({ start: timestamp, end: timestamp }),
  effectiveWindow: z.strictObject({ start: timestamp, end: timestamp }),
  freshness: freshnessSchema,
  searchType: z.literal('web'),
  dimensions: z.tuple([z.literal('query'), z.literal('page')]),
  filterGroupType: z.literal('and'),
  filters: z.array(filterSchema).max(16),
  coverage: coverageSchema,
  rows: z.array(rowSchema).max(SEARCH_ANALYTICS_MAX_ROWS),
});

const configSchema = z.strictObject({
  scope: scopeSchema,
  expectedProperty: boundedProperty,
  providerConnectionId: identifier,
  collectedAt: timestamp,
  receivedAt: timestamp,
  availability: availabilitySchema,
});

type SearchAnalyticsArtifact = z.infer<typeof artifactSchema>;
type ParsedConfig = z.infer<typeof configSchema>;
type ParsedRow = z.infer<typeof rowSchema>;

interface PreparedRow {
  readonly row: SearchAnalyticsAdaptedRow;
  readonly source: CollectionBatch['sources'][number];
  readonly observations: readonly CollectionBatch['observations'][number][];
}

function fail(code: SearchAnalyticsAdapterErrorCode, message: string): never {
  throw new SearchAnalyticsAdapterError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function derivedIdentifier(prefix: string, material: unknown): string {
  return `${prefix}:${hashCanonicalJson(material)}`;
}

export function searchAnalyticsDimensionIdentity(
  query: string,
  page: string,
  searchType: 'web',
): { queryId: string; pageId: string; rowIdentity: string; querySurface: string } {
  const queryHash = hashCanonicalJson({ query });
  return {
    queryId: `gsc.query:${queryHash}`,
    pageId: derivedIdentifier('gsc.page', { page }),
    rowIdentity: derivedIdentifier('gsc.row', { query, page, searchType }),
    querySurface: `gsc-query:${queryHash}`,
  };
}

export function searchAnalyticsCohortId(
  query: string,
  page: string,
  searchType: 'web',
  metricId: string,
): string {
  return derivedIdentifier('gsc.cohort', { query, page, searchType, metricId });
}

export function searchAnalyticsMethod(
  searchType: 'web',
  dimensions: readonly ['query', 'page'],
  filterGroupType: 'and',
  filters: readonly SearchAnalyticsFilter[],
): Contract<'collection'>['method'] {
  const configurationDigest = hashCanonicalJson({
    provider: SEARCH_ANALYTICS_PROVIDER_ID,
    searchType,
    dimensions,
    filterGroupType,
    filters,
  });
  return {
    id: 'ldw-gsc-search-analytics',
    version: SEARCH_ANALYTICS_MAPPING_VERSION,
    configurationId: `gsc-config:${configurationDigest}`,
    configurationRevision: 1,
  };
}

function parseInput(bytes: Uint8Array): { artifact: SearchAnalyticsArtifact; inputSha256: string } {
  let inputSha256: string;
  try {
    inputSha256 = sha256Bytes(bytes);
  } catch (error) {
    if (error instanceof RangeError) {
      fail('input_too_large', `Sanitized search-analytics input exceeds ${MAX_SEARCH_ANALYTICS_INPUT_BYTES} bytes.`);
    }
    fail('invalid_input', 'Sanitized search-analytics input must be an ordinary Uint8Array or Buffer.');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail('invalid_utf8', 'Sanitized search-analytics input is not valid UTF-8.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    fail('invalid_json', 'Sanitized search-analytics input is not valid JSON.');
  }

  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    fail('invalid_source', 'Sanitized search-analytics input must be an object.');
  }
  const envelope = decoded as Record<string, unknown>;
  if (envelope['schemaVersion'] !== SEARCH_ANALYTICS_INPUT_SCHEMA_VERSION
      || envelope['schemaMinorVersion'] !== SEARCH_ANALYTICS_INPUT_SCHEMA_MINOR_VERSION) {
    fail(
      'unsupported_schema',
      `Only ${SEARCH_ANALYTICS_INPUT_SCHEMA_VERSION} minor ${SEARCH_ANALYTICS_INPUT_SCHEMA_MINOR_VERSION} is supported.`,
    );
  }
  if (Array.isArray(envelope['rows']) && envelope['rows'].length > SEARCH_ANALYTICS_MAX_ROWS) {
    fail('too_many_rows', `Search-analytics artifact exceeds the exact ${SEARCH_ANALYTICS_MAX_ROWS}-row bound.`);
  }

  const parsed = artifactSchema.safeParse(decoded);
  if (!parsed.success) {
    fail('invalid_source', 'Sanitized search-analytics source shape is invalid or contains unsupported fields.');
  }
  return { artifact: parsed.data, inputSha256 };
}

function parseConfig(input: SearchAnalyticsAdapterConfig): ParsedConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Trusted search-analytics adapter configuration is invalid.');
  if (parsed.data.collectedAt > parsed.data.receivedAt) {
    fail('invalid_input', 'Trusted search-analytics collectedAt/receivedAt ordering is invalid.');
  }
  return parsed.data;
}

function validateHttpsPage(page: string): void {
  let url: URL;
  try {
    url = new URL(page);
  } catch {
    fail('invalid_source', 'Search-analytics page dimension must be an absolute HTTPS URL.');
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hash !== '') {
    fail('invalid_source', 'Search-analytics page dimension must be an absolute HTTPS URL without credentials or a fragment.');
  }
}

function milliseconds(value: string): number {
  return new Date(value).getTime();
}

function validateSemantics(artifact: SearchAnalyticsArtifact, config: ParsedConfig): number {
  if (artifact.property !== config.expectedProperty) {
    fail('configuration_mismatch', 'Search-analytics property does not match trusted adapter configuration.');
  }
  if (artifact.requestedWindow.start > artifact.requestedWindow.end
      || artifact.effectiveWindow.start > artifact.effectiveWindow.end
      || artifact.requestedWindow.start > artifact.effectiveWindow.start
      || artifact.effectiveWindow.end > artifact.requestedWindow.end) {
    fail('invalid_source', 'Search-analytics requested/effective windows are inconsistent.');
  }
  if (artifact.observedAt > artifact.exportedAt
      || artifact.exportedAt > config.collectedAt
      || artifact.effectiveWindow.end > artifact.observedAt
      || artifact.freshness.freshThrough > artifact.observedAt) {
    fail('invalid_source', 'Search-analytics source timing/freshness is inconsistent.');
  }

  const durationMs = milliseconds(artifact.effectiveWindow.end) - milliseconds(artifact.effectiveWindow.start);
  if (durationMs <= 0 || durationMs % 1_000 !== 0 || durationMs / 1_000 > 31_622_400) {
    fail('invalid_source', 'Search-analytics effective window must be a positive whole-second canonical window within G.A.S. bounds.');
  }

  for (const row of artifact.rows) validateHttpsPage(row.page);
  return durationMs / 1_000;
}

function normalizedFilters(artifact: SearchAnalyticsArtifact): SearchAnalyticsFilter[] {
  return [...artifact.filters].sort((left, right) => asciiCompare(canonicalJson(left), canonicalJson(right)));
}

function normalizedRows(artifact: SearchAnalyticsArtifact): ParsedRow[] {
  const rows = [...artifact.rows].sort((left, right) => {
    const queryOrder = asciiCompare(left.query, right.query);
    return queryOrder !== 0 ? queryOrder : asciiCompare(left.page, right.page);
  });
  for (let index = 1; index < rows.length; index++) {
    if (rows[index - 1]!.query === rows[index]!.query && rows[index - 1]!.page === rows[index]!.page) {
      fail('duplicate_row', 'Search-analytics query/page rows must be unique within one window.');
    }
  }
  return rows;
}

function canonicalCompleteness(
  artifact: SearchAnalyticsArtifact,
  rowCount: number,
): Contract<'collection'>['completeness'] {
  if (artifact.coverage.state === 'complete' && artifact.freshness.dataState === 'final') {
    return { state: 'complete', expectedCount: rowCount, receivedCount: rowCount };
  }
  return {
    state: 'partial',
    receivedCount: rowCount,
    reason: 'Search-analytics evidence is preliminary, partial, or coverage-unknown; unmatched row absence is not proven.',
  };
}

function sourceDigest(
  artifact: SearchAnalyticsArtifact,
  filters: readonly SearchAnalyticsFilter[],
  row: ParsedRow,
): string {
  try {
    return hashCanonicalJson({
      schemaVersion: artifact.schemaVersion,
      schemaMinorVersion: artifact.schemaMinorVersion,
      provider: artifact.provider,
      property: artifact.property,
      observedAt: artifact.observedAt,
      exportedAt: artifact.exportedAt,
      requestedWindow: artifact.requestedWindow,
      effectiveWindow: artifact.effectiveWindow,
      freshness: artifact.freshness,
      searchType: artifact.searchType,
      dimensions: artifact.dimensions,
      filterGroupType: artifact.filterGroupType,
      filters,
      coverage: artifact.coverage,
      row,
    });
  } catch {
    fail('row_too_large', 'A sanitized search-analytics row cannot fit the bounded canonical source-integrity representation.');
  }
}

function makePreparedRows(
  artifact: SearchAnalyticsArtifact,
  config: ParsedConfig,
  filters: readonly SearchAnalyticsFilter[],
  rows: readonly ParsedRow[],
  collection: Contract<'collection'>,
  runDigest: string,
  durationSeconds: number,
): PreparedRow[] {
  return rows.map((sourceRow) => {
    const dimensions = searchAnalyticsDimensionIdentity(sourceRow.query, sourceRow.page, artifact.searchType);
    const digest = sourceDigest(artifact, filters, sourceRow);
    const sourceRecordId = dimensions.rowIdentity;
    const identity: Contract<'sourceRecord'>['identity'] = {
      scope: config.scope,
      providerId: SEARCH_ANALYTICS_PROVIDER_ID,
      providerConnectionId: config.providerConnectionId,
      sourceRecordId,
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
    const sourceId = derivedIdentifier('gsc.src', { runDigest, sourceRecordId, digest });
    const observationIds: Record<SearchAnalyticsMetricKey, string> = {
      clicks: '',
      impressions: '',
      ctr: '',
      averagePosition: '',
    };

    const values: Record<SearchAnalyticsMetricKey, number> = {
      clicks: sourceRow.clicks,
      impressions: sourceRow.impressions,
      ctr: sourceRow.ctr,
      averagePosition: sourceRow.averagePosition,
    };

    const observations = (Object.keys(SEARCH_ANALYTICS_METRIC_SPECS) as SearchAnalyticsMetricKey[]).map((metricKey) => {
      const spec = SEARCH_ANALYTICS_METRIC_SPECS[metricKey];
      const observationId = derivedIdentifier('gsc.obs', { runDigest, sourceRecordId, metricId: spec.id });
      observationIds[metricKey] = observationId;
      const observation = parseContract('observation', {
        schemaVersion: '1.0',
        kind: 'observation',
        id: observationId,
        cohort: {
          schemaVersion: '1.0',
          kind: 'cohort',
          id: searchAnalyticsCohortId(sourceRow.query, sourceRow.page, artifact.searchType, spec.id),
          revision: 1,
          context: {
            scope: config.scope,
            subject: { kind: 'page', reference: dimensions.pageId },
            metric: {
              id: spec.id,
              meaningVersion: SEARCH_ANALYTICS_MAPPING_VERSION,
              valueType: 'number',
              unit: spec.unit,
            },
            dimensions: {
              providerId: SEARCH_ANALYTICS_PROVIDER_ID,
              surface: dimensions.querySurface,
              configuration: { id: 'gsc-search-type', version: artifact.searchType },
            },
            method: collection.method,
            timeWindowRules: {
              id: 'gsc-aggregate-window',
              version: SEARCH_ANALYTICS_MAPPING_VERSION,
              alignment: 'rolling',
              durationSeconds,
              timezone: 'UTC',
            },
          },
        },
        value: { state: 'observed', value: { type: 'number', value: values[metricKey] } },
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
          availability: config.availability,
        },
      });
      return { sourceId, record: observation };
    });

    return {
      row: {
        rowIdentity: dimensions.rowIdentity,
        query: sourceRow.query,
        page: sourceRow.page,
        searchType: artifact.searchType,
        queryId: dimensions.queryId,
        pageId: dimensions.pageId,
        sourceId,
        sourceRecordId,
        observationIds,
      },
      source: { id: sourceId, record: source },
      observations,
    };
  });
}

function packRows(
  prepared: readonly PreparedRow[],
  idempotencyKey: string,
  collection: Contract<'collection'>,
): CollectionBatch[] {
  const fitsWorstCase = (group: readonly PreparedRow[]): boolean => {
    const candidate = {
      idempotencyKey,
      collection,
      part: INGESTION_PART_BOUNDS.parts,
      parts: INGESTION_PART_BOUNDS.parts,
      sources: group.map((item) => item.source),
      observations: group.flatMap((item) => item.observations),
    };
    try {
      canonicalJson(candidate);
      return true;
    } catch (error) {
      if (error instanceof RangeError) return false;
      throw error;
    }
  };

  const groups: PreparedRow[][] = [];
  let current: PreparedRow[] = [];
  for (const row of prepared) {
    const candidate = [...current, row];
    const observationCount = candidate.length * 4;
    const fitsCounts = candidate.length <= INGESTION_PART_BOUNDS.sourcesPerPart
      && observationCount <= INGESTION_PART_BOUNDS.observationsPerPart;
    if (fitsCounts && fitsWorstCase(candidate)) {
      current = candidate;
      continue;
    }
    if (current.length === 0) {
      fail('row_too_large', 'A single search-analytics row cannot fit one bounded G.A.S. persistence part.');
    }
    groups.push(current);
    current = [row];
    if (row.observations.length > INGESTION_PART_BOUNDS.observationsPerPart || !fitsWorstCase(current)) {
      fail('row_too_large', 'A single search-analytics row cannot fit one bounded G.A.S. persistence part.');
    }
  }
  if (current.length > 0 || prepared.length === 0) groups.push(current);
  if (groups.length > INGESTION_PART_BOUNDS.parts) {
    fail('too_many_parts', 'Search-analytics evidence requires more than 64 bounded G.A.S. persistence parts.');
  }

  const parts = groups.length;
  return groups.map((group, index) => {
    const batch = {
      idempotencyKey,
      collection,
      part: index + 1,
      parts,
      sources: group.map((item) => item.source),
      observations: group.flatMap((item) => item.observations),
    };
    try {
      return parseCollectionBatch(batch);
    } catch {
      fail('invalid_output', 'Adapted search-analytics evidence failed current G.A.S. collection-part validation.');
    }
  });
}

/**
 * Adapt one bounded sanitized Google Search Console-style artifact into an existing
 * canonical observation stream. The function is pure/local: it does not authenticate,
 * issue tenant authority, persist, read files, call a provider, or use the network.
 */
export function adaptSearchAnalyticsEvidence(
  bytes: Uint8Array,
  trustedConfig: SearchAnalyticsAdapterConfig,
): SearchAnalyticsAdaptationResult {
  const { artifact, inputSha256 } = parseInput(bytes);
  const config = parseConfig(trustedConfig);
  const durationSeconds = validateSemantics(artifact, config);
  const filters = normalizedFilters(artifact);
  const rows = normalizedRows(artifact);
  const method = searchAnalyticsMethod(artifact.searchType, artifact.dimensions, artifact.filterGroupType, filters);
  const completeness = canonicalCompleteness(artifact, rows.length);

  const seedDigest = hashCanonicalJson({
    algorithm: 'gas-search-analytics-seed-v1',
    adapter: { id: SEARCH_ANALYTICS_ADAPTER_ID, version: SEARCH_ANALYTICS_MAPPING_VERSION },
    sourceSchema: { id: SEARCH_ANALYTICS_SOURCE_SCHEMA_ID, version: SEARCH_ANALYTICS_SOURCE_SCHEMA_VERSION },
    scope: config.scope,
    providerId: SEARCH_ANALYTICS_PROVIDER_ID,
    providerConnectionId: config.providerConnectionId,
    expectedProperty: config.expectedProperty,
    semantics: {
      property: artifact.property,
      observedAt: artifact.observedAt,
      exportedAt: artifact.exportedAt,
      requestedWindow: artifact.requestedWindow,
      effectiveWindow: artifact.effectiveWindow,
      freshness: artifact.freshness,
      searchType: artifact.searchType,
      dimensions: artifact.dimensions,
      filterGroupType: artifact.filterGroupType,
      filters,
      coverage: artifact.coverage,
    },
    method,
    availability: config.availability,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
  });
  const rowDigests = rows.map((row) => sourceDigest(artifact, filters, row));
  const runDigest = sha256Bytes(Buffer.from([
    'gas-search-analytics-collection-v1',
    seedDigest,
    ...rowDigests,
  ].join('\n'), 'utf8'));

  const collectionId = `gsc.collection:${runDigest}`;
  const idempotencyKey = `gsc.idempotency:${runDigest}`;
  const collection = parseContract('collection', {
    schemaVersion: '1.0',
    kind: 'collection',
    id: collectionId,
    scope: config.scope,
    providerId: SEARCH_ANALYTICS_PROVIDER_ID,
    providerConnectionId: config.providerConnectionId,
    adapter: { id: SEARCH_ANALYTICS_ADAPTER_ID, version: SEARCH_ANALYTICS_MAPPING_VERSION },
    sourceSchema: { id: SEARCH_ANALYTICS_SOURCE_SCHEMA_ID, version: SEARCH_ANALYTICS_SOURCE_SCHEMA_VERSION },
    method,
    sourceTime: artifact.effectiveWindow,
    startedAt: artifact.observedAt,
    endedAt: artifact.exportedAt,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
    completeness,
  });

  const prepared = makePreparedRows(artifact, config, filters, rows, collection, runDigest, durationSeconds);
  const batches = packRows(prepared, idempotencyKey, collection);
  const semantics: SearchAnalyticsSemantics = {
    property: artifact.property,
    observedAt: artifact.observedAt,
    exportedAt: artifact.exportedAt,
    requestedWindow: artifact.requestedWindow,
    effectiveWindow: artifact.effectiveWindow,
    freshness: artifact.freshness,
    searchType: artifact.searchType,
    dimensions: artifact.dimensions,
    filterGroupType: artifact.filterGroupType,
    filters,
    coverage: artifact.coverage,
  };

  return {
    inputSha256,
    providerId: SEARCH_ANALYTICS_PROVIDER_ID,
    collectionId,
    idempotencyKey,
    semantics,
    rows: prepared.map((item) => item.row),
    batches,
  };
}
