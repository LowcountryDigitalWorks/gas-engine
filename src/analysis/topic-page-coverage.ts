import { z } from 'zod';
import { identifier, scope as scopeSchema, version } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import {
  SEARCH_ANALYTICS_PROVIDER_ID,
  SEARCH_ANALYTICS_REPORT_FAMILY,
  type SearchAnalyticsAdaptationResult,
  type SearchAnalyticsCoverage,
  type SearchAnalyticsFreshness,
  type SearchAnalyticsMinor1Semantics,
  type SearchAnalyticsSemantics,
  type SearchAnalyticsWebModality,
} from '../adapters/search-analytics.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import type { Scope } from '../persistence/repository.js';
import {
  SearchAnalyticsSignalError,
  validateSearchAnalyticsWindow,
  type ValidatedSearchAnalyticsRow,
} from './search-analytics.js';

export const TOPIC_PAGE_COVERAGE_ALGORITHM = 'gas-topic-page-coverage-v1' as const;
export const MAX_TOPIC_PAGE_TOPICS = 32 as const;
export const MAX_TOPIC_PAGE_PAGES = 64 as const;
export const MAX_TOPIC_PAGE_LINKS = MAX_TOPIC_PAGE_TOPICS * MAX_TOPIC_PAGE_PAGES;
export const MAX_TOPIC_LABEL_CHARS = 32 as const;
export const MAX_TOPIC_PAGE_OUTPUT_BYTES = 131_072 as const;

const topicLabel = z.string()
  .min(1)
  .max(MAX_TOPIC_LABEL_CHARS)
  .regex(/\S/)
  .regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/);

const httpsPageUrl = z.string()
  .min(1)
  .max(2048)
  .regex(/^https:\/\//)
  .regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/);

const topicSchema = z.strictObject({
  topicId: identifier,
  label: topicLabel,
  parentTopicId: identifier.optional(),
});

const pageSchema = z.strictObject({
  pageId: identifier,
  url: httpsPageUrl,
});

const topicPageLinkSchema = z.strictObject({
  topicId: identifier,
  pageId: identifier,
});

const queryTopicAssignmentSchema = z.strictObject({
  queryId: identifier,
  topicId: identifier,
});

const policySchema = z.strictObject({
  id: identifier,
  version,
});

const universeSchema = z.strictObject({
  id: identifier,
  revision: version,
});

const inputSchema = z.strictObject({
  scope: scopeSchema,
  universe: universeSchema,
  topics: z.array(topicSchema).min(1).max(MAX_TOPIC_PAGE_TOPICS),
  pages: z.array(pageSchema).min(1).max(MAX_TOPIC_PAGE_PAGES),
  topicPageLinks: z.array(topicPageLinkSchema).max(MAX_TOPIC_PAGE_LINKS),
  queryTopicAssignments: z.array(queryTopicAssignmentSchema).max(384),
  policy: policySchema,
  window: z.unknown().optional(),
});

export type TopicPageCoveragePolicy = z.infer<typeof policySchema>;
export type TopicPageCoverageMapping = 'mapped_by_human' | 'unmapped' | 'mapping_unknown';
export type TopicPageCoverageEvidenceState = 'observed' | 'not_returned' | 'unavailable' | 'incompatible';

export type TopicPageCoverageErrorCode =
  | 'invalid_input'
  | 'invalid_assignments'
  | 'invalid_source'
  | 'invalid_output'
  | 'scope_mismatch';

export class TopicPageCoverageError extends Error {
  override name = 'TopicPageCoverageError';

  constructor(
    readonly code: TopicPageCoverageErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface TopicPageCoverageRowEvidence {
  readonly queryId: string;
  readonly pageId: string;
  readonly rowIdentity: string;
  readonly sourceRecordId: string;
  readonly clicks: number;
  readonly impressions: number;
  readonly observationIds: Readonly<{
    readonly clicks: string;
    readonly impressions: string;
  }>;
}

export interface TopicPageCoverageRow {
  readonly topicId: string;
  readonly pageId: string;
  readonly mapping: TopicPageCoverageMapping;
  readonly evidenceState: TopicPageCoverageEvidenceState;
  readonly reason: string;
  readonly evidence?: TopicPageCoverageRowEvidence;
}

interface TopicPageCoverageSourceCore {
  readonly scope: Scope;
  readonly providerId: string;
  readonly providerConnectionId?: string;
  readonly collectionId: string;
  readonly property: string;
  readonly adapter: Contract<'collection'>['adapter'];
  readonly sourceSchema: Contract<'collection'>['sourceSchema'];
  readonly period: {
    readonly requested: Readonly<{ start: string; end: string }>;
    readonly effective: Readonly<{ start: string; end: string }>;
  };
  readonly freshness?: SearchAnalyticsFreshness;
  readonly coverage?: SearchAnalyticsCoverage;
}

interface TopicPageCoverageSearchUniverse {
  readonly reportFamily: typeof SEARCH_ANALYTICS_REPORT_FAMILY;
  readonly searchType: 'web';
  readonly webModality: SearchAnalyticsWebModality;
}

export type TopicPageCoverageSource =
  | (TopicPageCoverageSourceCore & { readonly state: 'absent' })
  | (TopicPageCoverageSourceCore & { readonly state: 'present' })
  | (TopicPageCoverageSourceCore & TopicPageCoverageSearchUniverse & { readonly state: 'present' });

export type TopicPageCoverageSummaryOutcome =
  | 'investigate_existing_page_fit'
  | 'unresolved_not_ready'
  | 'no_evidence_claim';

export interface TopicPageCoverageReport {
  readonly id: string;
  readonly universe: z.infer<typeof universeSchema>;
  readonly scope: Scope;
  readonly policy: TopicPageCoveragePolicy;
  readonly source: TopicPageCoverageSource;
  readonly topicPageCoverageRows: readonly TopicPageCoverageRow[];
  readonly summary: {
    readonly outcome: TopicPageCoverageSummaryOutcome;
    readonly humanEditorialReviewRequired: true;
    readonly noAutomaticContentAction: true;
    readonly sourceLimitations: readonly string[];
  };
}

interface ParsedInput {
  readonly scope: Scope;
  readonly universe: z.infer<typeof universeSchema>;
  readonly topics: readonly z.infer<typeof topicSchema>[];
  readonly pages: readonly z.infer<typeof pageSchema>[];
  readonly topicPageLinks: readonly z.infer<typeof topicPageLinkSchema>[];
  readonly queryTopicAssignments: readonly z.infer<typeof queryTopicAssignmentSchema>[];
  readonly policy: TopicPageCoveragePolicy;
  readonly window?: SearchAnalyticsAdaptationResult;
}

function fail(code: TopicPageCoverageErrorCode, message: string): never {
  throw new TopicPageCoverageError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function parseInput(input: unknown): ParsedInput {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Topic-page coverage invocation is invalid.');
  try {
    canonicalJson({
      scope: parsed.data.scope,
      universe: parsed.data.universe,
      topics: parsed.data.topics,
      pages: parsed.data.pages,
      topicPageLinks: parsed.data.topicPageLinks,
      queryTopicAssignments: parsed.data.queryTopicAssignments,
      policy: parsed.data.policy,
    });
  } catch {
    fail('invalid_input', 'Topic-page coverage selectors must be bounded canonical data.');
  }
  if (parsed.data.window === undefined) {
    return {
      scope: parsed.data.scope,
      universe: parsed.data.universe,
      topics: parsed.data.topics,
      pages: parsed.data.pages,
      topicPageLinks: parsed.data.topicPageLinks,
      queryTopicAssignments: parsed.data.queryTopicAssignments,
      policy: parsed.data.policy,
    };
  }
  return {
    scope: parsed.data.scope,
    universe: parsed.data.universe,
    topics: parsed.data.topics,
    pages: parsed.data.pages,
    topicPageLinks: parsed.data.topicPageLinks,
    queryTopicAssignments: parsed.data.queryTopicAssignments,
    policy: parsed.data.policy,
    window: parsed.data.window as SearchAnalyticsAdaptationResult,
  };
}

function validateTopicGraph(topics: readonly z.infer<typeof topicSchema>[]): void {
  const byId = new Map<string, z.infer<typeof topicSchema>>();
  for (const topic of topics) {
    if (byId.has(topic.topicId)) fail('invalid_assignments', 'Duplicate topic IDs are not allowed.');
    byId.set(topic.topicId, topic);
  }
  for (const topic of topics) {
    if (topic.parentTopicId === undefined) continue;
    if (topic.parentTopicId === topic.topicId) {
      fail('invalid_assignments', 'Topic parent reference cannot be self-referential.');
    }
    if (!byId.has(topic.parentTopicId)) {
      fail('invalid_assignments', 'Topic parent reference must resolve within the authored universe.');
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(topicId: string): void {
    if (visited.has(topicId)) return;
    if (visiting.has(topicId)) fail('invalid_assignments', 'Topic parent graph cannot contain a cycle.');
    visiting.add(topicId);
    const parent = byId.get(topicId)?.parentTopicId;
    if (parent !== undefined) visit(parent);
    visiting.delete(topicId);
    visited.add(topicId);
  }
  for (const topic of topics) visit(topic.topicId);
}

function validatePages(pages: readonly z.infer<typeof pageSchema>[]): Map<string, z.infer<typeof pageSchema>> {
  const byId = new Map<string, z.infer<typeof pageSchema>>();
  const seenUrls = new Set<string>();
  for (const page of pages) {
    if (byId.has(page.pageId)) fail('invalid_assignments', 'Duplicate page IDs are not allowed.');
    if (seenUrls.has(page.url)) fail('invalid_assignments', 'Duplicate canonical page URLs are not allowed.');
    byId.set(page.pageId, page);
    seenUrls.add(page.url);
  }
  return byId;
}

function validateLinks(
  links: readonly z.infer<typeof topicPageLinkSchema>[],
  topicIds: Set<string>,
  pageIds: Set<string>,
): void {
  const seen = new Set<string>();
  for (const link of links) {
    if (!topicIds.has(link.topicId) || !pageIds.has(link.pageId)) {
      fail('invalid_assignments', 'Topic-page links must reference declared topic and page IDs.');
    }
    const key = `${link.topicId}\0${link.pageId}`;
    if (seen.has(key)) fail('invalid_assignments', 'Duplicate topic-page links are not allowed.');
    seen.add(key);
  }
}

function validateQueryAssignments(
  assignments: readonly z.infer<typeof queryTopicAssignmentSchema>[],
  topicIds: Set<string>,
): Map<string, string> {
  const byQuery = new Map<string, string>();
  for (const assignment of assignments) {
    if (!topicIds.has(assignment.topicId)) {
      fail('invalid_assignments', 'Query-topic assignment references an unknown topic ID.');
    }
    if (byQuery.has(assignment.queryId)) {
      fail('invalid_assignments', 'Each query ID may map to at most one topic.');
    }
    byQuery.set(assignment.queryId, assignment.topicId);
  }
  return byQuery;
}

function sourceLimitations(
  freshness: SearchAnalyticsFreshness | undefined,
  coverage: SearchAnalyticsCoverage | undefined,
): { readonly limitations: readonly string[]; readonly readinessBlocked: boolean } {
  const limitations: string[] = [];
  let readinessBlocked = false;
  if (freshness === undefined || coverage === undefined) {
    return { limitations: ['gsc_rows_not_exhaustive'], readinessBlocked: false };
  }
  if (freshness.dataState !== 'final') {
    limitations.push('source_preliminary');
    readinessBlocked = true;
  }
  if (coverage.state !== 'complete') {
    limitations.push('coverage_incomplete');
    readinessBlocked = true;
  }
  if (coverage.truncated) {
    limitations.push('coverage_truncated');
    readinessBlocked = true;
  }
  if (coverage.anonymized) {
    limitations.push('coverage_anonymized');
    readinessBlocked = true;
  }
  limitations.push('gsc_rows_not_exhaustive');
  return { limitations, readinessBlocked };
}

function validatedSearchUniverse(semantics: SearchAnalyticsSemantics): TopicPageCoverageSearchUniverse | undefined {
  const hasReportFamily = Object.hasOwn(semantics, 'reportFamily');
  const hasWebModality = Object.hasOwn(semantics, 'webModality');
  if (!hasReportFamily && !hasWebModality) return undefined;
  const minor1 = semantics as SearchAnalyticsMinor1Semantics;
  return {
    reportFamily: minor1.reportFamily,
    searchType: minor1.searchType,
    webModality: minor1.webModality,
  };
}

function buildSourcePresent(
  collection: Contract<'collection'>,
  semantics: SearchAnalyticsSemantics,
): TopicPageCoverageSource {
  const core: TopicPageCoverageSourceCore & { state: 'present' } = {
    state: 'present',
    scope: structuredClone(collection.scope),
    providerId: collection.providerId,
    ...(collection.providerConnectionId === undefined
      ? {}
      : { providerConnectionId: collection.providerConnectionId }),
    collectionId: collection.id,
    property: semantics.property,
    adapter: structuredClone(collection.adapter),
    sourceSchema: structuredClone(collection.sourceSchema),
    period: {
      requested: structuredClone(semantics.requestedWindow),
      effective: structuredClone(semantics.effectiveWindow),
    },
    freshness: structuredClone(semantics.freshness),
    coverage: structuredClone(semantics.coverage),
  };
  const universe = validatedSearchUniverse(semantics);
  return universe === undefined ? core : { ...core, ...universe };
}

function rowEvidence(row: ValidatedSearchAnalyticsRow): TopicPageCoverageRowEvidence {
  return {
    queryId: row.sidecar.queryId,
    pageId: row.sidecar.pageId,
    rowIdentity: row.sidecar.rowIdentity,
    sourceRecordId: row.sidecar.sourceRecordId,
    clicks: row.metrics.clicks,
    impressions: row.metrics.impressions,
    observationIds: {
      clicks: row.sidecar.observationIds.clicks,
      impressions: row.sidecar.observationIds.impressions,
    },
  };
}

function canonicalTopics(topics: readonly z.infer<typeof topicSchema>[]) {
  return [...topics]
    .map((topic) => ({
      topicId: topic.topicId,
      label: topic.label,
      ...(topic.parentTopicId === undefined ? {} : { parentTopicId: topic.parentTopicId }),
    }))
    .sort((left, right) => asciiCompare(left.topicId, right.topicId));
}

function canonicalPages(pages: readonly z.infer<typeof pageSchema>[]) {
  return [...pages]
    .map((page) => ({ pageId: page.pageId, url: page.url }))
    .sort((left, right) => asciiCompare(left.pageId, right.pageId));
}

function canonicalLinks(links: readonly z.infer<typeof topicPageLinkSchema>[]) {
  return [...links]
    .map((link) => ({ topicId: link.topicId, pageId: link.pageId }))
    .sort((left, right) => {
      const topicOrder = asciiCompare(left.topicId, right.topicId);
      return topicOrder !== 0 ? topicOrder : asciiCompare(left.pageId, right.pageId);
    });
}

function canonicalQueryAssignments(assignments: readonly z.infer<typeof queryTopicAssignmentSchema>[]) {
  return [...assignments]
    .map((assignment) => ({ queryId: assignment.queryId, topicId: assignment.topicId }))
    .sort((left, right) => {
      const queryOrder = asciiCompare(left.queryId, right.queryId);
      return queryOrder !== 0 ? queryOrder : asciiCompare(left.topicId, right.topicId);
    });
}

function summaryOutcome(
  rows: readonly TopicPageCoverageRow[],
  readinessBlocked: boolean,
  sourcePresent: boolean,
): TopicPageCoverageSummaryOutcome {
  if (!sourcePresent) return 'no_evidence_claim';
  if (readinessBlocked) return 'unresolved_not_ready';
  if (rows.some((row) => row.evidenceState === 'observed')) return 'investigate_existing_page_fit';
  return 'no_evidence_claim';
}

/**
 * Source-preserving topic-to-existing-page coverage over zero or one validated GSC query×page window.
 * Pure/local only: no demand inference, content recommendations, aggregation across omitted rows,
 * persistence, provider access, or tenant authority issuance.
 */
export function analyzeTopicPageCoverage(input: unknown): TopicPageCoverageReport {
  const request = parseInput(input);
  validateTopicGraph(request.topics);
  const pagesById = validatePages(request.pages);
  const topicIds = new Set(request.topics.map((topic) => topic.topicId));
  const pageIds = new Set(request.pages.map((page) => page.pageId));
  validateLinks(request.topicPageLinks, topicIds, pageIds);
  const queryTopics = validateQueryAssignments(request.queryTopicAssignments, topicIds);

  const sortedLinks = canonicalLinks(request.topicPageLinks);
  let validatedRows: readonly ValidatedSearchAnalyticsRow[] = [];
  let source: TopicPageCoverageSource = {
    state: 'absent',
    scope: structuredClone(request.scope),
    providerId: SEARCH_ANALYTICS_PROVIDER_ID,
    collectionId: 'absent',
    property: 'absent',
    adapter: { id: 'absent', version: '0.0.0' },
    sourceSchema: { id: 'absent', version: '0.0.0' },
    period: { requested: { start: '1970-01-01T00:00:00.000Z', end: '1970-01-01T00:00:00.000Z' }, effective: { start: '1970-01-01T00:00:00.000Z', end: '1970-01-01T00:00:00.000Z' } },
  };
  let limitations: string[] = ['source_window_absent'];
  let readinessBlocked = false;
  let sourcePresent = false;

  if (request.window !== undefined) {
    if (request.window.providerId !== SEARCH_ANALYTICS_PROVIDER_ID) {
      fail('invalid_source', 'Topic-page coverage accepts only google-search-console search-performance windows.');
    }
    const windowScope = request.window.batches[0]?.collection.scope;
    if (windowScope === undefined || !same(windowScope, request.scope)) {
      fail('scope_mismatch', 'Accepted search window scope must match the trusted invocation scope.');
    }
    let validated;
    try {
      validated = validateSearchAnalyticsWindow(request.window);
    } catch (error) {
      if (error instanceof SearchAnalyticsSignalError) {
        fail('invalid_source', 'Search analytics window failed accepted validation.');
      }
      throw error;
    }
    if (!same(validated.collection.scope, request.scope)) {
      fail('scope_mismatch', 'Validated collection scope must match the trusted invocation scope.');
    }
    sourcePresent = true;
    source = buildSourcePresent(validated.collection, validated.semantics);
    validatedRows = validated.rows;
    const readiness = sourceLimitations(validated.semantics.freshness, validated.semantics.coverage);
    limitations = [...readiness.limitations];
    readinessBlocked = readiness.readinessBlocked;
  }

  const rowIndex = new Map<string, ValidatedSearchAnalyticsRow>();
  for (const row of validatedRows) {
    const key = `${row.sidecar.queryId}\0${row.sidecar.pageId}`;
    if (rowIndex.has(key)) {
      fail('invalid_source', 'Duplicate query-page identities in the validated source window.');
    }
    rowIndex.set(key, row);
  }

  const rows: TopicPageCoverageRow[] = [];
  for (const link of sortedLinks) {
    const assignedQueries = [...queryTopics.entries()]
      .filter(([, topicId]) => topicId === link.topicId)
      .map(([queryId]) => queryId)
      .sort(asciiCompare);

    if (!sourcePresent) {
      rows.push({
        topicId: link.topicId,
        pageId: link.pageId,
        mapping: 'mapped_by_human',
        evidenceState: 'unavailable',
        reason: 'source_window_absent',
      });
      continue;
    }

    const matches = assignedQueries
      .map((queryId) => rowIndex.get(`${queryId}\0${link.pageId}`))
      .filter((row): row is ValidatedSearchAnalyticsRow => row !== undefined);
    if (matches.length > 1) {
      fail('invalid_assignments', 'Multiple validated source rows match one topic-page link.');
    }
    if (matches.length === 1) {
      rows.push({
        topicId: link.topicId,
        pageId: link.pageId,
        mapping: 'mapped_by_human',
        evidenceState: 'observed',
        reason: 'exact_query_page_row_returned',
        evidence: rowEvidence(matches[0]!),
      });
      continue;
    }

    const pageUrl = pagesById.get(link.pageId)?.url;
    const pageInSource = pageUrl !== undefined && validatedRows.some((row) => row.sidecar.page === pageUrl);
    rows.push({
      topicId: link.topicId,
      pageId: link.pageId,
      mapping: 'mapped_by_human',
      evidenceState: 'not_returned',
      reason: pageInSource
        ? 'assigned_query_page_not_returned_in_source'
        : 'authored_page_not_in_accepted_source_rows',
    });
  }

  const linkedTopics = new Set(sortedLinks.map((link) => link.topicId));
  for (const topic of canonicalTopics(request.topics)) {
    if (linkedTopics.has(topic.topicId)) continue;
    rows.push({
      topicId: topic.topicId,
      pageId: 'unassigned',
      mapping: 'unmapped',
      evidenceState: sourcePresent ? 'not_returned' : 'unavailable',
      reason: sourcePresent ? 'topic_without_human_page_assignment' : 'source_window_absent',
    });
  }

  rows.sort((left, right) => {
    const topicOrder = asciiCompare(left.topicId, right.topicId);
    return topicOrder !== 0 ? topicOrder : asciiCompare(left.pageId, right.pageId);
  });

  if (rows.length > MAX_TOPIC_PAGE_LINKS + MAX_TOPIC_PAGE_TOPICS) {
    fail('invalid_output', 'Topic-page coverage row count exceeds the bounded maximum.');
  }

  const identityPayload = {
    algorithm: TOPIC_PAGE_COVERAGE_ALGORITHM,
    scope: request.scope,
    universe: request.universe,
    topics: canonicalTopics(request.topics),
    pages: canonicalPages(request.pages),
    topicPageLinks: sortedLinks,
    queryTopicAssignments: canonicalQueryAssignments(request.queryTopicAssignments),
    policy: request.policy,
    source: sourcePresent
      ? {
          collectionId: source.collectionId,
          providerId: source.providerId,
          period: source.period,
          ...(source.state === 'present' && 'webModality' in source
            ? { webModality: source.webModality, reportFamily: source.reportFamily }
            : {}),
        }
      : { state: 'absent' as const },
  };

  const report: TopicPageCoverageReport = {
    id: `gsc.topic-page-coverage:${hashCanonicalJson(identityPayload)}`,
    universe: structuredClone(request.universe),
    scope: structuredClone(request.scope),
    policy: structuredClone(request.policy),
    source,
    topicPageCoverageRows: rows,
    summary: {
      outcome: summaryOutcome(rows, readinessBlocked, sourcePresent),
      humanEditorialReviewRequired: true,
      noAutomaticContentAction: true,
      sourceLimitations: [...limitations].sort(asciiCompare),
    },
  };

  if (Buffer.byteLength(canonicalJson(report), 'utf8') > MAX_TOPIC_PAGE_OUTPUT_BYTES) {
    fail('invalid_output', 'Topic-page coverage report exceeds bounded output bytes.');
  }

  return report;
}
