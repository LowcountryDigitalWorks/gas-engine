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

export const DISCOVERY_INPUT_SCHEMA_VERSION = 'ldw.discovery-diagnostics-evidence.v1' as const;
export const DISCOVERY_INPUT_SCHEMA_MINOR_VERSION = 0 as const;
export const DISCOVERY_ADAPTER_ID = 'ldw-discovery-diagnostics-adapter' as const;
export const DISCOVERY_MAPPING_VERSION = '1.0.0' as const;
export const DISCOVERY_SOURCE_SCHEMA_ID = 'ldw.discovery-diagnostics-evidence' as const;
export const DISCOVERY_SOURCE_SCHEMA_VERSION = 'v1.0' as const;
export const DISCOVERY_MAX_ROWS = 256 as const;
export const MAX_DISCOVERY_INPUT_BYTES = MAX_HASH_INPUT_BYTES;

export const DISCOVERY_SEARCH_ENGINE_PROVIDERS = Object.freeze([
  'google-search-console',
  'bing-webmaster-tools',
  'yandex-webmaster',
] as const);

export const DISCOVERY_PROVIDERS = Object.freeze([
  ...DISCOVERY_SEARCH_ENGINE_PROVIDERS,
  'indexnow',
] as const);

export type DiscoverySearchEngineProviderId = typeof DISCOVERY_SEARCH_ENGINE_PROVIDERS[number];
export type DiscoveryProviderId = typeof DISCOVERY_PROVIDERS[number];
export type DiscoverySearchPresence = 'present' | 'absent' | 'unknown';
export type DiscoveryCrawlState =
  | 'success'
  | 'blocked'
  | 'not_found'
  | 'server_error'
  | 'redirect'
  | 'other_error'
  | 'unknown';
export type DiscoveryIndexingPermission = 'allowed' | 'blocked' | 'unknown';
export type DiscoveryCanonicalState = 'self' | 'other' | 'unknown';
export type DiscoverySubmissionResult = 'accepted' | 'rejected' | 'rate_limited' | 'unknown';

export type DiscoveryCoverage =
  | { readonly state: 'complete'; readonly truncated: false }
  | { readonly state: 'partial' | 'unknown'; readonly truncated: boolean; readonly reason: string };

export interface DiscoveryFreshness {
  readonly dataState: 'final' | 'preliminary';
  readonly freshThrough: string;
}

export interface DiscoverySemantics {
  readonly trustedTarget: string;
  readonly artifactSite: string;
  readonly observedAt: string;
  readonly exportedAt: string;
  readonly freshness: DiscoveryFreshness;
  readonly coverage: DiscoveryCoverage;
  readonly availability: Contract<'sourceRecord'>['availability'];
}

export interface DiscoverySearchEngineRow {
  readonly kind: 'search_engine';
  readonly providerId: DiscoverySearchEngineProviderId;
  readonly url: string;
  readonly urlId: string;
  readonly rowIdentity: string;
  readonly searchPresence: DiscoverySearchPresence;
  readonly crawlState: DiscoveryCrawlState;
  readonly indexingPermission: DiscoveryIndexingPermission;
  readonly canonicalState: DiscoveryCanonicalState;
  readonly canonicalTarget?: string;
  readonly httpStatus?: number;
  readonly lastCrawlAt?: string;
  readonly providerState: Readonly<Record<string, unknown>>;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly observationIds: Readonly<{
    searchPresence: string;
    crawlState: string;
    indexingPermission: string;
    canonicalState: string;
    httpStatus?: string;
  }>;
}

export interface DiscoveryIndexNowRow {
  readonly kind: 'indexnow';
  readonly providerId: 'indexnow';
  readonly url: string;
  readonly urlId: string;
  readonly rowIdentity: string;
  readonly submittedAt: string;
  readonly submissionResult: DiscoverySubmissionResult;
  readonly resultCode?: number;
  readonly providerState: Readonly<Record<string, unknown>>;
  readonly sourceId: string;
  readonly sourceRecordId: string;
  readonly observationIds: Readonly<{
    submissionState: string;
    httpStatus?: string;
  }>;
}

export type DiscoveryAdaptedRow = DiscoverySearchEngineRow | DiscoveryIndexNowRow;

export interface DiscoveryAdaptationResult {
  readonly providerId: DiscoveryProviderId;
  readonly collectionId: string;
  readonly idempotencyKey: string;
  readonly semantics: DiscoverySemantics;
  readonly rows: readonly DiscoveryAdaptedRow[];
  readonly batches: readonly CollectionBatch[];
}

export type DiscoveryAdapterErrorCode =
  | 'invalid_input'
  | 'input_too_large'
  | 'invalid_utf8'
  | 'invalid_json'
  | 'unsupported_schema'
  | 'unsupported_provider'
  | 'invalid_source'
  | 'configuration_mismatch'
  | 'duplicate_url'
  | 'too_many_rows'
  | 'row_too_large'
  | 'too_many_parts'
  | 'invalid_output';

export class DiscoveryAdapterError extends Error {
  override name = 'DiscoveryAdapterError';

  constructor(
    readonly code: DiscoveryAdapterErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface DiscoveryAdapterConfig {
  readonly scope: Scope;
  readonly expectedProvider: DiscoveryProviderId;
  readonly expectedSite: string;
  readonly providerConnectionId: string;
  readonly collectedAt: string;
  readonly receivedAt: string;
  readonly availability: Contract<'sourceRecord'>['availability'];
}

const providerIdSchema = z.enum(DISCOVERY_PROVIDERS);
const boundedSite = z.string().min(1).max(2_048).regex(/\S/);
const boundedStatus = z.string().min(1).max(128).regex(/\S/);
const boundedReason = z.string().min(1).max(512).regex(/\S/);
const absoluteUrl = z.string().min(1).max(2_048).regex(/\S/);
const httpStatus = z.number().int().min(100).max(599);

const coverageSchema = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('complete'), truncated: z.literal(false) }),
  z.strictObject({ state: z.literal('partial'), truncated: z.boolean(), reason }),
  z.strictObject({ state: z.literal('unknown'), truncated: z.boolean(), reason }),
]);

const freshnessSchema = z.strictObject({
  dataState: z.enum(['final', 'preliminary']),
  freshThrough: timestamp,
});

const googleRowSchema = z.strictObject({
  url: absoluteUrl,
  verdict: z.enum(['PASS', 'FAIL', 'NEUTRAL', 'UNKNOWN']),
  coverageState: boundedStatus.optional(),
  robotsTxtState: z.enum(['ALLOWED', 'DISALLOWED', 'UNKNOWN']),
  indexingState: z.enum(['ALLOWED', 'BLOCKED_BY_META_TAG', 'BLOCKED_BY_HTTP_HEADER', 'UNKNOWN']),
  pageFetchState: z.enum([
    'SUCCESSFUL',
    'SOFT_404',
    'BLOCKED_ROBOTS_TXT',
    'NOT_FOUND',
    'ACCESS_DENIED',
    'SERVER_ERROR',
    'REDIRECT_ERROR',
    'ACCESS_FORBIDDEN',
    'BLOCKED_4XX',
    'INTERNAL_CRAWL_ERROR',
    'INVALID_URL',
    'UNKNOWN',
  ]),
  lastCrawlAt: timestamp.optional(),
  googleCanonical: absoluteUrl.optional(),
  userCanonical: absoluteUrl.optional(),
});

const bingRowSchema = z.strictObject({
  url: absoluteUrl,
  indexStatus: z.enum(['indexed', 'not_indexed', 'unknown']),
  crawlState: z.enum(['success', 'blocked', 'not_found', 'server_error', 'redirect', 'other_error', 'unknown']),
  indexingPermission: z.enum(['allowed', 'blocked', 'unknown']),
  canonicalUrl: absoluteUrl.optional(),
  httpStatus: httpStatus.optional(),
  discoveredAt: timestamp.optional(),
  lastCrawlAt: timestamp.optional(),
  statusCode: boundedStatus.optional(),
  reason: boundedReason.optional(),
});

const yandexRowSchema = z.strictObject({
  url: absoluteUrl,
  searchable: z.union([z.boolean(), z.literal('unknown')]),
  crawlState: z.enum(['success', 'blocked', 'not_found', 'server_error', 'redirect', 'other_error', 'unknown']),
  indexingPermission: z.enum(['allowed', 'blocked', 'unknown']),
  targetUrl: absoluteUrl.optional(),
  targetKind: z.enum(['canonical', 'redirect', 'duplicate', 'unknown']).optional(),
  httpStatus: httpStatus.optional(),
  lastCrawlAt: timestamp.optional(),
  exclusionReason: boundedReason.optional(),
  sourceStatus: boundedStatus.optional(),
});

const indexNowRowSchema = z.strictObject({
  url: absoluteUrl,
  submittedAt: timestamp,
  submissionResult: z.enum(['accepted', 'rejected', 'rate_limited', 'unknown']),
  resultCode: httpStatus.optional(),
});

const commonRoot = {
  schemaVersion: z.literal(DISCOVERY_INPUT_SCHEMA_VERSION),
  schemaMinorVersion: z.literal(DISCOVERY_INPUT_SCHEMA_MINOR_VERSION),
  site: boundedSite,
  observedAt: timestamp,
  exportedAt: timestamp,
  freshness: freshnessSchema,
  coverage: coverageSchema,
};

const artifactSchema = z.discriminatedUnion('provider', [
  z.strictObject({
    ...commonRoot,
    provider: z.literal('google-search-console'),
    rows: z.array(googleRowSchema).max(DISCOVERY_MAX_ROWS),
  }),
  z.strictObject({
    ...commonRoot,
    provider: z.literal('bing-webmaster-tools'),
    rows: z.array(bingRowSchema).max(DISCOVERY_MAX_ROWS),
  }),
  z.strictObject({
    ...commonRoot,
    provider: z.literal('yandex-webmaster'),
    rows: z.array(yandexRowSchema).max(DISCOVERY_MAX_ROWS),
  }),
  z.strictObject({
    ...commonRoot,
    provider: z.literal('indexnow'),
    rows: z.array(indexNowRowSchema).max(DISCOVERY_MAX_ROWS),
  }),
]);

const configSchema = z.strictObject({
  scope: scopeSchema,
  expectedProvider: providerIdSchema,
  expectedSite: boundedSite,
  providerConnectionId: identifier,
  collectedAt: timestamp,
  receivedAt: timestamp,
  availability: availabilitySchema,
});

type DiscoveryArtifact = z.infer<typeof artifactSchema>;
type ParsedConfig = z.infer<typeof configSchema>;
type GoogleRow = z.infer<typeof googleRowSchema>;
type BingRow = z.infer<typeof bingRowSchema>;
type YandexRow = z.infer<typeof yandexRowSchema>;
type IndexNowRow = z.infer<typeof indexNowRowSchema>;
interface NormalizedSearchRow {
  readonly kind: 'search_engine';
  readonly providerId: DiscoverySearchEngineProviderId;
  readonly url: string;
  readonly urlId: string;
  readonly rowIdentity: string;
  readonly searchPresence: DiscoverySearchPresence;
  readonly crawlState: DiscoveryCrawlState;
  readonly indexingPermission: DiscoveryIndexingPermission;
  readonly canonicalState: DiscoveryCanonicalState;
  readonly canonicalTarget?: string;
  readonly httpStatus?: number;
  readonly lastCrawlAt?: string;
  readonly providerState: Readonly<Record<string, unknown>>;
}

interface NormalizedIndexNowRow {
  readonly kind: 'indexnow';
  readonly providerId: 'indexnow';
  readonly url: string;
  readonly urlId: string;
  readonly rowIdentity: string;
  readonly submittedAt: string;
  readonly submissionResult: DiscoverySubmissionResult;
  readonly resultCode?: number;
  readonly providerState: Readonly<Record<string, unknown>>;
}

type NormalizedRow = NormalizedSearchRow | NormalizedIndexNowRow;

interface PreparedRow {
  readonly row: DiscoveryAdaptedRow;
  readonly source: CollectionBatch['sources'][number];
  readonly observations: readonly CollectionBatch['observations'][number][];
}

const SEARCH_METRICS = Object.freeze({
  searchPresence: { id: 'discovery.search_presence', valueType: 'text', unit: 'state' },
  crawlState: { id: 'discovery.crawl_state', valueType: 'text', unit: 'state' },
  indexingPermission: { id: 'discovery.indexing_permission', valueType: 'text', unit: 'state' },
  canonicalState: { id: 'discovery.canonical_state', valueType: 'text', unit: 'state' },
  httpStatus: { id: 'discovery.http_status', valueType: 'number', unit: 'http_status' },
} as const);

const INDEXNOW_METRICS = Object.freeze({
  submissionState: { id: 'discovery.submission_state', valueType: 'text', unit: 'state' },
  httpStatus: { id: 'discovery.http_status', valueType: 'number', unit: 'http_status' },
} as const);

function fail(code: DiscoveryAdapterErrorCode, message: string): never {
  throw new DiscoveryAdapterError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function derivedIdentifier(prefix: string, material: unknown): string {
  return `${prefix}:${hashCanonicalJson(material)}`;
}

function validateAbsoluteUrl(value: string, label: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail('invalid_source', `${label} must be an absolute HTTP(S) URL.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.hash !== '') {
    fail('invalid_source', `${label} must be an absolute HTTP(S) URL without credentials or a fragment.`);
  }
}

function parseInput(bytes: Uint8Array): DiscoveryArtifact {
  try {
    sha256Bytes(bytes);
  } catch (error) {
    if (error instanceof RangeError) {
      fail('input_too_large', `Sanitized discovery input exceeds ${MAX_DISCOVERY_INPUT_BYTES} bytes.`);
    }
    fail('invalid_input', 'Sanitized discovery input must be an ordinary Uint8Array or Buffer.');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail('invalid_utf8', 'Sanitized discovery input is not valid UTF-8.');
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(text) as unknown;
  } catch {
    fail('invalid_json', 'Sanitized discovery input is not valid JSON.');
  }

  if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
    fail('invalid_source', 'Sanitized discovery input must be an object.');
  }
  const envelope = decoded as Record<string, unknown>;
  if (envelope['schemaVersion'] !== DISCOVERY_INPUT_SCHEMA_VERSION
      || envelope['schemaMinorVersion'] !== DISCOVERY_INPUT_SCHEMA_MINOR_VERSION) {
    fail(
      'unsupported_schema',
      `Only ${DISCOVERY_INPUT_SCHEMA_VERSION} minor ${DISCOVERY_INPUT_SCHEMA_MINOR_VERSION} is supported.`,
    );
  }
  if (!DISCOVERY_PROVIDERS.includes(envelope['provider'] as DiscoveryProviderId)) {
    fail('unsupported_provider', 'Discovery provider is unsupported.');
  }
  if (Array.isArray(envelope['rows']) && envelope['rows'].length > DISCOVERY_MAX_ROWS) {
    fail('too_many_rows', `Discovery artifact exceeds the exact ${DISCOVERY_MAX_ROWS}-row bound.`);
  }
  const parsed = artifactSchema.safeParse(decoded);
  if (!parsed.success) {
    fail('invalid_source', 'Sanitized discovery source shape is invalid or contains unsupported fields.');
  }
  return parsed.data;
}

function parseConfig(input: DiscoveryAdapterConfig): ParsedConfig {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Trusted discovery adapter configuration is invalid.');
  if (parsed.data.collectedAt > parsed.data.receivedAt) {
    fail('invalid_input', 'Trusted discovery collectedAt/receivedAt ordering is invalid.');
  }
  return parsed.data;
}

function googleCrawlState(value: GoogleRow['pageFetchState']): DiscoveryCrawlState {
  switch (value) {
    case 'SUCCESSFUL': return 'success';
    case 'SOFT_404':
    case 'NOT_FOUND': return 'not_found';
    case 'BLOCKED_ROBOTS_TXT':
    case 'ACCESS_DENIED':
    case 'ACCESS_FORBIDDEN':
    case 'BLOCKED_4XX': return 'blocked';
    case 'SERVER_ERROR': return 'server_error';
    case 'REDIRECT_ERROR': return 'redirect';
    case 'INTERNAL_CRAWL_ERROR':
    case 'INVALID_URL': return 'other_error';
    case 'UNKNOWN': return 'unknown';
  }
}

function googleIndexingPermission(row: GoogleRow): DiscoveryIndexingPermission {
  if (row.robotsTxtState === 'DISALLOWED'
      || row.indexingState === 'BLOCKED_BY_META_TAG'
      || row.indexingState === 'BLOCKED_BY_HTTP_HEADER') {
    return 'blocked';
  }
  if (row.robotsTxtState === 'ALLOWED' && row.indexingState === 'ALLOWED') return 'allowed';
  return 'unknown';
}

function canonicalState(url: string, target: string | undefined): {
  state: DiscoveryCanonicalState;
  target?: string;
} {
  if (target === undefined) return { state: 'unknown' };
  validateAbsoluteUrl(target, 'Canonical target URL');
  return target === url ? { state: 'self' } : { state: 'other', target };
}

function normalizeGoogle(row: GoogleRow): NormalizedSearchRow {
  validateAbsoluteUrl(row.url, 'Google discovery URL');
  if (row.googleCanonical !== undefined) validateAbsoluteUrl(row.googleCanonical, 'Google canonical URL');
  if (row.userCanonical !== undefined) validateAbsoluteUrl(row.userCanonical, 'User canonical URL');
  const canonical = canonicalState(row.url, row.googleCanonical);
  return {
    kind: 'search_engine',
    providerId: 'google-search-console',
    url: row.url,
    urlId: derivedIdentifier('discovery.url', { url: row.url }),
    rowIdentity: derivedIdentifier('discovery.row', { provider: 'google-search-console', url: row.url }),
    searchPresence: row.verdict === 'PASS' ? 'present' : row.verdict === 'UNKNOWN' ? 'unknown' : 'absent',
    crawlState: googleCrawlState(row.pageFetchState),
    indexingPermission: googleIndexingPermission(row),
    canonicalState: canonical.state,
    ...(canonical.target === undefined ? {} : { canonicalTarget: canonical.target }),
    ...(row.lastCrawlAt === undefined ? {} : { lastCrawlAt: row.lastCrawlAt }),
    providerState: structuredClone(row) as Readonly<Record<string, unknown>>,
  };
}

function normalizeBing(row: BingRow): NormalizedSearchRow {
  validateAbsoluteUrl(row.url, 'Bing discovery URL');
  if (row.canonicalUrl !== undefined) validateAbsoluteUrl(row.canonicalUrl, 'Bing canonical URL');
  const canonical = canonicalState(row.url, row.canonicalUrl);
  return {
    kind: 'search_engine',
    providerId: 'bing-webmaster-tools',
    url: row.url,
    urlId: derivedIdentifier('discovery.url', { url: row.url }),
    rowIdentity: derivedIdentifier('discovery.row', { provider: 'bing-webmaster-tools', url: row.url }),
    searchPresence: row.indexStatus === 'indexed' ? 'present' : row.indexStatus === 'not_indexed' ? 'absent' : 'unknown',
    crawlState: row.crawlState,
    indexingPermission: row.indexingPermission,
    canonicalState: canonical.state,
    ...(canonical.target === undefined ? {} : { canonicalTarget: canonical.target }),
    ...(row.httpStatus === undefined ? {} : { httpStatus: row.httpStatus }),
    ...(row.lastCrawlAt === undefined ? {} : { lastCrawlAt: row.lastCrawlAt }),
    providerState: structuredClone(row) as Readonly<Record<string, unknown>>,
  };
}

function normalizeYandex(row: YandexRow): NormalizedSearchRow {
  validateAbsoluteUrl(row.url, 'Yandex discovery URL');
  if (row.targetUrl !== undefined) validateAbsoluteUrl(row.targetUrl, 'Yandex target URL');
  const canonical = canonicalState(row.url, row.targetUrl);
  return {
    kind: 'search_engine',
    providerId: 'yandex-webmaster',
    url: row.url,
    urlId: derivedIdentifier('discovery.url', { url: row.url }),
    rowIdentity: derivedIdentifier('discovery.row', { provider: 'yandex-webmaster', url: row.url }),
    searchPresence: row.searchable === true ? 'present' : row.searchable === false ? 'absent' : 'unknown',
    crawlState: row.crawlState,
    indexingPermission: row.indexingPermission,
    canonicalState: canonical.state,
    ...(canonical.target === undefined ? {} : { canonicalTarget: canonical.target }),
    ...(row.httpStatus === undefined ? {} : { httpStatus: row.httpStatus }),
    ...(row.lastCrawlAt === undefined ? {} : { lastCrawlAt: row.lastCrawlAt }),
    providerState: structuredClone(row) as Readonly<Record<string, unknown>>,
  };
}

function normalizeIndexNow(row: IndexNowRow): NormalizedIndexNowRow {
  validateAbsoluteUrl(row.url, 'IndexNow submission URL');
  return {
    kind: 'indexnow',
    providerId: 'indexnow',
    url: row.url,
    urlId: derivedIdentifier('discovery.url', { url: row.url }),
    rowIdentity: derivedIdentifier('discovery.row', { provider: 'indexnow', url: row.url }),
    submittedAt: row.submittedAt,
    submissionResult: row.submissionResult,
    ...(row.resultCode === undefined ? {} : { resultCode: row.resultCode }),
    providerState: structuredClone(row) as Readonly<Record<string, unknown>>,
  };
}

function normalizeRows(artifact: DiscoveryArtifact): NormalizedRow[] {
  const rows: NormalizedRow[] = (() => {
    switch (artifact.provider) {
      case 'google-search-console': return artifact.rows.map(normalizeGoogle);
      case 'bing-webmaster-tools': return artifact.rows.map(normalizeBing);
      case 'yandex-webmaster': return artifact.rows.map(normalizeYandex);
      case 'indexnow': return artifact.rows.map(normalizeIndexNow);
    }
  })();

  rows.sort((left, right) => asciiCompare(left.url, right.url));
  for (let index = 1; index < rows.length; index++) {
    if (rows[index - 1]!.urlId === rows[index]!.urlId || rows[index - 1]!.url === rows[index]!.url) {
      fail('duplicate_url', 'Discovery artifact URL rows must be unique within one provider snapshot.');
    }
  }
  return rows;
}

function validateSemantics(
  artifact: DiscoveryArtifact,
  config: ParsedConfig,
  rows: readonly NormalizedRow[],
): void {
  if (artifact.provider !== config.expectedProvider) {
    fail('configuration_mismatch', 'Discovery provider does not match trusted adapter configuration.');
  }
  if (artifact.site !== config.expectedSite) {
    fail('configuration_mismatch', 'Discovery site/property projection does not match trusted adapter configuration.');
  }
  if (artifact.observedAt > artifact.exportedAt
      || artifact.exportedAt > config.collectedAt
      || artifact.freshness.freshThrough > artifact.observedAt) {
    fail('invalid_source', 'Discovery source timing/freshness is inconsistent.');
  }
  for (const row of rows) {
    if (row.kind === 'search_engine') {
      if (row.lastCrawlAt !== undefined && row.lastCrawlAt > artifact.observedAt) {
        fail('invalid_source', 'Discovery last-crawl timestamp cannot exceed source observation time.');
      }
    } else if (row.submittedAt > artifact.observedAt) {
      fail('invalid_source', 'IndexNow submission timestamp cannot exceed source observation time.');
    }
  }
}

function canonicalCompleteness(
  artifact: DiscoveryArtifact,
  rowCount: number,
): Contract<'collection'>['completeness'] {
  if (artifact.coverage.state === 'complete' && artifact.freshness.dataState === 'final') {
    return { state: 'complete', expectedCount: rowCount, receivedCount: rowCount };
  }
  return {
    state: 'partial',
    receivedCount: rowCount,
    reason: 'Discovery evidence is preliminary, partial, or coverage-unknown; missing URL rows are not evidence of absence.',
  };
}

function discoveryMethod(provider: DiscoveryProviderId, trustedTarget: string): Contract<'collection'>['method'] {
  const digest = hashCanonicalJson({ provider, trustedTarget, mappingVersion: DISCOVERY_MAPPING_VERSION });
  return {
    id: 'ldw-discovery-diagnostics',
    version: DISCOVERY_MAPPING_VERSION,
    configurationId: `discovery-config:${digest}`,
    configurationRevision: 1,
  };
}

function sourceDigest(
  artifact: DiscoveryArtifact,
  normalized: NormalizedRow,
): string {
  try {
    return hashCanonicalJson({
      schemaVersion: artifact.schemaVersion,
      schemaMinorVersion: artifact.schemaMinorVersion,
      provider: artifact.provider,
      site: artifact.site,
      observedAt: artifact.observedAt,
      exportedAt: artifact.exportedAt,
      freshness: artifact.freshness,
      coverage: artifact.coverage,
      normalized,
    });
  } catch {
    fail('row_too_large', 'A sanitized discovery row cannot fit bounded canonical source-integrity representation.');
  }
}

function textObservation(
  id: string,
  sourceId: string,
  metricId: string,
  value: string,
  urlId: string,
  collection: Contract<'collection'>,
  identity: Contract<'sourceRecord'>['identity'],
  integrity: Contract<'sourceRecord'>['integrity'],
  availability: Contract<'sourceRecord'>['availability'],
): CollectionBatch['observations'][number] {
  const record = parseContract('observation', {
    schemaVersion: '1.0',
    kind: 'observation',
    id,
    cohort: {
      schemaVersion: '1.0',
      kind: 'cohort',
      id: derivedIdentifier('discovery.cohort', { provider: collection.providerId, urlId, metricId }),
      revision: 1,
      context: {
        scope: collection.scope,
        subject: { kind: 'page', reference: urlId },
        metric: {
          id: metricId,
          meaningVersion: DISCOVERY_MAPPING_VERSION,
          valueType: 'text',
          unit: 'state',
        },
        dimensions: {
          providerId: collection.providerId,
          surface: 'discovery-url',
          configuration: { id: 'discovery-provider', version: DISCOVERY_MAPPING_VERSION },
        },
        method: collection.method,
        timeWindowRules: {
          id: 'discovery-snapshot-point',
          version: DISCOVERY_MAPPING_VERSION,
          alignment: 'point',
          durationSeconds: 0,
          timezone: 'UTC',
        },
      },
    },
    value: { state: 'observed', value: { type: 'text', value } },
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

function numberObservation(
  id: string,
  sourceId: string,
  metricId: string,
  value: number,
  urlId: string,
  collection: Contract<'collection'>,
  identity: Contract<'sourceRecord'>['identity'],
  integrity: Contract<'sourceRecord'>['integrity'],
  availability: Contract<'sourceRecord'>['availability'],
): CollectionBatch['observations'][number] {
  const record = parseContract('observation', {
    schemaVersion: '1.0',
    kind: 'observation',
    id,
    cohort: {
      schemaVersion: '1.0',
      kind: 'cohort',
      id: derivedIdentifier('discovery.cohort', { provider: collection.providerId, urlId, metricId }),
      revision: 1,
      context: {
        scope: collection.scope,
        subject: { kind: 'page', reference: urlId },
        metric: {
          id: metricId,
          meaningVersion: DISCOVERY_MAPPING_VERSION,
          valueType: 'number',
          unit: 'http_status',
        },
        dimensions: {
          providerId: collection.providerId,
          surface: 'discovery-url',
          configuration: { id: 'discovery-provider', version: DISCOVERY_MAPPING_VERSION },
        },
        method: collection.method,
        timeWindowRules: {
          id: 'discovery-snapshot-point',
          version: DISCOVERY_MAPPING_VERSION,
          alignment: 'point',
          durationSeconds: 0,
          timezone: 'UTC',
        },
      },
    },
    value: { state: 'observed', value: { type: 'number', value } },
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

function makePreparedRows(
  artifact: DiscoveryArtifact,
  config: ParsedConfig,
  rows: readonly NormalizedRow[],
  collection: Contract<'collection'>,
  runDigest: string,
): PreparedRow[] {
  return rows.map((row) => {
    const digest = sourceDigest(artifact, row);
    const sourceRecordId = row.rowIdentity;
    const identity: Contract<'sourceRecord'>['identity'] = {
      scope: config.scope,
      providerId: artifact.provider,
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
    const sourceId = derivedIdentifier('discovery.src', { runDigest, sourceRecordId, digest });
    const observations: CollectionBatch['observations'] = [];

    if (row.kind === 'search_engine') {
      const ids: {
        searchPresence: string;
        crawlState: string;
        indexingPermission: string;
        canonicalState: string;
        httpStatus?: string;
      } = {
        searchPresence: derivedIdentifier('discovery.obs', { runDigest, sourceRecordId, metricId: SEARCH_METRICS.searchPresence.id }),
        crawlState: derivedIdentifier('discovery.obs', { runDigest, sourceRecordId, metricId: SEARCH_METRICS.crawlState.id }),
        indexingPermission: derivedIdentifier('discovery.obs', { runDigest, sourceRecordId, metricId: SEARCH_METRICS.indexingPermission.id }),
        canonicalState: derivedIdentifier('discovery.obs', { runDigest, sourceRecordId, metricId: SEARCH_METRICS.canonicalState.id }),
      };
      observations.push(
        textObservation(ids.searchPresence, sourceId, SEARCH_METRICS.searchPresence.id, row.searchPresence, row.urlId, collection, identity, integrity, config.availability),
        textObservation(ids.crawlState, sourceId, SEARCH_METRICS.crawlState.id, row.crawlState, row.urlId, collection, identity, integrity, config.availability),
        textObservation(ids.indexingPermission, sourceId, SEARCH_METRICS.indexingPermission.id, row.indexingPermission, row.urlId, collection, identity, integrity, config.availability),
        textObservation(ids.canonicalState, sourceId, SEARCH_METRICS.canonicalState.id, row.canonicalState, row.urlId, collection, identity, integrity, config.availability),
      );
      if (row.httpStatus !== undefined) {
        ids.httpStatus = derivedIdentifier('discovery.obs', { runDigest, sourceRecordId, metricId: SEARCH_METRICS.httpStatus.id });
        observations.push(numberObservation(ids.httpStatus, sourceId, SEARCH_METRICS.httpStatus.id, row.httpStatus, row.urlId, collection, identity, integrity, config.availability));
      }
      const adapted: DiscoverySearchEngineRow = {
        ...row,
        sourceId,
        sourceRecordId,
        observationIds: ids,
      };
      return { row: adapted, source: { id: sourceId, record: source }, observations };
    }

    const ids: { submissionState: string; httpStatus?: string } = {
      submissionState: derivedIdentifier('discovery.obs', { runDigest, sourceRecordId, metricId: INDEXNOW_METRICS.submissionState.id }),
    };
    observations.push(
      textObservation(ids.submissionState, sourceId, INDEXNOW_METRICS.submissionState.id, row.submissionResult, row.urlId, collection, identity, integrity, config.availability),
    );
    if (row.resultCode !== undefined) {
      ids.httpStatus = derivedIdentifier('discovery.obs', { runDigest, sourceRecordId, metricId: INDEXNOW_METRICS.httpStatus.id });
      observations.push(numberObservation(ids.httpStatus, sourceId, INDEXNOW_METRICS.httpStatus.id, row.resultCode, row.urlId, collection, identity, integrity, config.availability));
    }
    const adapted: DiscoveryIndexNowRow = {
      ...row,
      sourceId,
      sourceRecordId,
      observationIds: ids,
    };
    return { row: adapted, source: { id: sourceId, record: source }, observations };
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
    const observationCount = candidate.reduce((total, item) => total + item.observations.length, 0);
    const fitsCounts = candidate.length <= INGESTION_PART_BOUNDS.sourcesPerPart
      && observationCount <= INGESTION_PART_BOUNDS.observationsPerPart;
    if (fitsCounts && fitsWorstCase(candidate)) {
      current = candidate;
      continue;
    }
    if (current.length === 0) {
      fail('row_too_large', 'A single discovery row cannot fit one bounded G.A.S. persistence part.');
    }
    groups.push(current);
    current = [row];
    if (row.observations.length > INGESTION_PART_BOUNDS.observationsPerPart || !fitsWorstCase(current)) {
      fail('row_too_large', 'A single discovery row cannot fit one bounded G.A.S. persistence part.');
    }
  }
  if (current.length > 0 || prepared.length === 0) groups.push(current);
  if (groups.length > INGESTION_PART_BOUNDS.parts) {
    fail('too_many_parts', 'Discovery evidence requires more than 64 bounded G.A.S. persistence parts.');
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
      fail('invalid_output', 'Adapted discovery evidence failed current G.A.S. collection-part validation.');
    }
  });
}

/**
 * Pure/local adaptation of one bounded sanitized discovery artifact.
 * No provider call, credential, tenant-authority issuance, persistence, network, or runtime AI occurs here.
 */
export function adaptDiscoveryDiagnosticsEvidence(
  bytes: Uint8Array,
  trustedConfig: DiscoveryAdapterConfig,
): DiscoveryAdaptationResult {
  const artifact = parseInput(bytes);
  const config = parseConfig(trustedConfig);
  const rows = normalizeRows(artifact);
  validateSemantics(artifact, config, rows);

  const method = discoveryMethod(artifact.provider, config.expectedSite);
  const completeness = canonicalCompleteness(artifact, rows.length);
  const seedDigest = hashCanonicalJson({
    algorithm: 'gas-discovery-diagnostics-seed-v1',
    adapter: { id: DISCOVERY_ADAPTER_ID, version: DISCOVERY_MAPPING_VERSION },
    sourceSchema: { id: DISCOVERY_SOURCE_SCHEMA_ID, version: DISCOVERY_SOURCE_SCHEMA_VERSION },
    scope: config.scope,
    providerId: artifact.provider,
    providerConnectionId: config.providerConnectionId,
    trustedTarget: config.expectedSite,
    artifactSite: artifact.site,
    observedAt: artifact.observedAt,
    exportedAt: artifact.exportedAt,
    freshness: artifact.freshness,
    coverage: artifact.coverage,
    availability: config.availability,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
    method,
  });
  const rowDigests = rows.map((row) => sourceDigest(artifact, row));
  const runDigest = sha256Bytes(Buffer.from([
    'gas-discovery-diagnostics-collection-v1',
    seedDigest,
    ...rowDigests,
  ].join('\n'), 'utf8'));

  const collectionId = `discovery.collection:${runDigest}`;
  const idempotencyKey = `discovery.idempotency:${runDigest}`;
  const collection = parseContract('collection', {
    schemaVersion: '1.0',
    kind: 'collection',
    id: collectionId,
    scope: config.scope,
    providerId: artifact.provider,
    providerConnectionId: config.providerConnectionId,
    adapter: { id: DISCOVERY_ADAPTER_ID, version: DISCOVERY_MAPPING_VERSION },
    sourceSchema: { id: DISCOVERY_SOURCE_SCHEMA_ID, version: DISCOVERY_SOURCE_SCHEMA_VERSION },
    method,
    sourceTime: { start: artifact.observedAt, end: artifact.observedAt },
    startedAt: artifact.observedAt,
    endedAt: artifact.exportedAt,
    collectedAt: config.collectedAt,
    receivedAt: config.receivedAt,
    completeness,
  });

  const prepared = makePreparedRows(artifact, config, rows, collection, runDigest);
  const batches = packRows(prepared, idempotencyKey, collection);
  return {
    providerId: artifact.provider,
    collectionId,
    idempotencyKey,
    semantics: {
      trustedTarget: config.expectedSite,
      artifactSite: artifact.site,
      observedAt: artifact.observedAt,
      exportedAt: artifact.exportedAt,
      freshness: structuredClone(artifact.freshness),
      coverage: structuredClone(artifact.coverage),
      availability: structuredClone(config.availability),
    },
    rows: prepared.map((item) => item.row),
    batches,
  };
}
