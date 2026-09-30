import { z } from 'zod';
import { identifier, version } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import {
  type SearchAnalyticsAdaptationResult,
  type SearchAnalyticsCoverage,
  type SearchAnalyticsFreshness,
  type SearchAnalyticsMetricKey,
} from '../adapters/search-analytics.js';
import {
  validateSearchAnalyticsWindow,
  type ValidatedSearchAnalyticsRow,
} from './search-analytics.js';

export const PAGE_FOCUS_VALIDATION_REQUIREMENT =
  'Separate SERP/result comparison is required before any intent, split, consolidation, redirect, canonical, or content-architecture conclusion.' as const;

const boundedLabel = z.string()
  .min(1)
  .max(128)
  .regex(/\S/)
  .regex(/^[^\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]*$/);
const nonNegativeThreshold = z.number().finite().min(0).max(1e15).refine((value) => !Object.is(value, -0));
const shareThreshold = z.number().finite().min(0).max(1).refine((value) => !Object.is(value, -0));

const assignmentSchema = z.strictObject({
  queryId: identifier,
  clusterId: identifier,
  label: boundedLabel.optional(),
});

const policySchema = z.strictObject({
  id: identifier,
  version,
  minimumPageImpressions: nonNegativeThreshold,
  minimumClusterImpressions: nonNegativeThreshold,
  minimumClusterShare: shareThreshold,
});

const invocationSchema = z.strictObject({
  window: z.unknown(),
  pageId: identifier,
  assignments: z.array(assignmentSchema).min(1).max(384),
  policy: policySchema,
});

export type PageFocusAssignment = z.infer<typeof assignmentSchema>;
export type PageFocusPolicy = z.infer<typeof policySchema>;

export type PageFocusNotReadyReason =
  | 'source_not_final'
  | 'coverage_incomplete'
  | 'coverage_truncated'
  | 'coverage_anonymized';

export type PageFocusNoCandidateReason =
  | 'page_below_minimum_impressions'
  | 'fewer_than_two_supported_clusters';

export type PageFocusErrorCode =
  | 'invalid_input'
  | 'target_not_found'
  | 'invalid_assignments'
  | 'invalid_output';

export class PageFocusError extends Error {
  override name = 'PageFocusError';

  constructor(
    readonly code: PageFocusErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface PageFocusEvidenceRef {
  readonly queryId: string;
  readonly rowIdentity: string;
  readonly sourceRecordId: string;
  readonly observationIds: Readonly<Record<SearchAnalyticsMetricKey, string>>;
}

export interface PageFocusClusterSummary {
  readonly clusterId: string;
  readonly label?: string;
  readonly queryCount: number;
  readonly queryIds: readonly string[];
  readonly queries: readonly string[];
  readonly clicks: number;
  readonly impressions: number;
  readonly ctr: number;
  readonly averagePositionRange: {
    readonly minimum: number;
    readonly maximum: number;
  };
  readonly supportShare: number;
  readonly evidence: readonly PageFocusEvidenceRef[];
}

export interface PageFocusClusterEvidenceRef {
  readonly clusterId: string;
  readonly impressions: number;
  readonly supportShare: number;
}

interface PageFocusReportBase {
  readonly id: string;
  readonly source: {
    readonly scope: Contract<'collection'>['scope'];
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
    readonly freshness: SearchAnalyticsFreshness;
    readonly coverage: SearchAnalyticsCoverage;
  };
  readonly page: string;
  readonly pageId: string;
  readonly policy: PageFocusPolicy;
  readonly pageTotals: {
    readonly queryCount: number;
    readonly clicks: number;
    readonly impressions: number;
    readonly ctr: number;
  };
  readonly clusters: readonly PageFocusClusterSummary[];
  readonly serpValidationRequired: true;
  readonly validationRequirement: typeof PAGE_FOCUS_VALIDATION_REQUIREMENT;
}

export type PageFocusReport = PageFocusReportBase & (
  | {
      readonly state: 'candidate';
      readonly dominantEvidenceCluster: PageFocusClusterEvidenceRef;
      readonly divergentEvidenceClusters: readonly PageFocusClusterEvidenceRef[];
    }
  | {
      readonly state: 'no_candidate';
      readonly reasons: readonly PageFocusNoCandidateReason[];
    }
  | {
      readonly state: 'not_ready';
      readonly reasons: readonly PageFocusNotReadyReason[];
    }
);

interface ParsedInvocation {
  readonly window: SearchAnalyticsAdaptationResult;
  readonly pageId: string;
  readonly assignments: readonly PageFocusAssignment[];
  readonly policy: PageFocusPolicy;
}

function fail(code: PageFocusErrorCode, message: string): never {
  throw new PageFocusError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseInvocation(input: unknown): ParsedInvocation {
  const parsed = invocationSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Page-focus invocation, assignments, or policy are invalid.');
  try {
    canonicalJson({
      pageId: parsed.data.pageId,
      assignments: parsed.data.assignments,
      policy: parsed.data.policy,
    });
  } catch {
    fail('invalid_input', 'Page-focus selectors, assignments, and policy must be bounded canonical data.');
  }
  return {
    window: parsed.data.window as SearchAnalyticsAdaptationResult,
    pageId: parsed.data.pageId,
    assignments: parsed.data.assignments,
    policy: parsed.data.policy,
  };
}

function safeAddCount(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    fail('invalid_output', 'Page-focus aggregate count exceeds safe numeric bounds.');
  }
  return result;
}

function readinessReasons(
  freshness: SearchAnalyticsFreshness,
  coverage: SearchAnalyticsCoverage,
): PageFocusNotReadyReason[] {
  const reasons: PageFocusNotReadyReason[] = [];
  if (freshness.dataState !== 'final') reasons.push('source_not_final');
  if (coverage.state !== 'complete') reasons.push('coverage_incomplete');
  if (coverage.truncated) reasons.push('coverage_truncated');
  if (coverage.anonymized) reasons.push('coverage_anonymized');
  return reasons;
}

function normalizeAssignments(
  rows: readonly ValidatedSearchAnalyticsRow[],
  assignments: readonly PageFocusAssignment[],
): Map<string, PageFocusAssignment> {
  const selectedQueryIds = new Set(rows.map((row) => row.sidecar.queryId));
  if (selectedQueryIds.size !== rows.length) {
    fail('invalid_output', 'Selected page contains duplicated query identities.');
  }

  const normalized = [...assignments].sort((left, right) => {
    const queryOrder = asciiCompare(left.queryId, right.queryId);
    return queryOrder !== 0 ? queryOrder : asciiCompare(left.clusterId, right.clusterId);
  });
  const byQuery = new Map<string, PageFocusAssignment>();
  for (const assignment of normalized) {
    if (!selectedQueryIds.has(assignment.queryId)) {
      fail('invalid_assignments', 'Cluster assignment contains a query outside the selected page.');
    }
    if (byQuery.has(assignment.queryId)) {
      fail('invalid_assignments', 'Each selected-page query must have exactly one cluster assignment.');
    }
    byQuery.set(assignment.queryId, assignment);
  }
  if (byQuery.size !== selectedQueryIds.size) {
    fail('invalid_assignments', 'Every selected-page query must have exactly one cluster assignment.');
  }
  return byQuery;
}

function aggregate(
  rows: readonly ValidatedSearchAnalyticsRow[],
  assignments: Map<string, PageFocusAssignment>,
): {
  pageTotals: PageFocusReportBase['pageTotals'];
  clusters: PageFocusClusterSummary[];
} {
  let pageClicks = 0;
  let pageImpressions = 0;

  interface ClusterAccumulator {
    clusterId: string;
    label?: string;
    rows: ValidatedSearchAnalyticsRow[];
    clicks: number;
    impressions: number;
    minimumPosition: number;
    maximumPosition: number;
  }

  const clusters = new Map<string, ClusterAccumulator>();
  for (const row of rows) {
    const assignment = assignments.get(row.sidecar.queryId);
    if (assignment === undefined) {
      fail('invalid_assignments', 'Every selected-page query must have exactly one cluster assignment.');
    }

    pageClicks = safeAddCount(pageClicks, row.metrics.clicks);
    pageImpressions = safeAddCount(pageImpressions, row.metrics.impressions);

    const existing = clusters.get(assignment.clusterId);
    if (existing !== undefined) {
      if (assignment.label !== undefined
          && existing.label !== undefined
          && assignment.label !== existing.label) {
        fail('invalid_assignments', 'One clusterId cannot carry conflicting display labels.');
      }
      if (existing.label === undefined && assignment.label !== undefined) existing.label = assignment.label;
      existing.rows.push(row);
      existing.clicks = safeAddCount(existing.clicks, row.metrics.clicks);
      existing.impressions = safeAddCount(existing.impressions, row.metrics.impressions);
      existing.minimumPosition = Math.min(existing.minimumPosition, row.metrics.averagePosition);
      existing.maximumPosition = Math.max(existing.maximumPosition, row.metrics.averagePosition);
      continue;
    }

    clusters.set(assignment.clusterId, {
      clusterId: assignment.clusterId,
      ...(assignment.label === undefined ? {} : { label: assignment.label }),
      rows: [row],
      clicks: row.metrics.clicks,
      impressions: row.metrics.impressions,
      minimumPosition: row.metrics.averagePosition,
      maximumPosition: row.metrics.averagePosition,
    });
  }

  if (pageImpressions <= 0) {
    fail('invalid_output', 'Selected page must contain positive canonical impressions.');
  }

  const summaries = [...clusters.values()]
    .sort((left, right) => asciiCompare(left.clusterId, right.clusterId))
    .map((cluster): PageFocusClusterSummary => {
      const sortedRows = [...cluster.rows].sort((left, right) => {
        const queryOrder = asciiCompare(left.sidecar.queryId, right.sidecar.queryId);
        return queryOrder !== 0 ? queryOrder : asciiCompare(left.sidecar.rowIdentity, right.sidecar.rowIdentity);
      });
      return {
        clusterId: cluster.clusterId,
        ...(cluster.label === undefined ? {} : { label: cluster.label }),
        queryCount: sortedRows.length,
        queryIds: sortedRows.map((row) => row.sidecar.queryId),
        queries: sortedRows.map((row) => row.sidecar.query),
        clicks: cluster.clicks,
        impressions: cluster.impressions,
        ctr: cluster.clicks / cluster.impressions,
        averagePositionRange: {
          minimum: cluster.minimumPosition,
          maximum: cluster.maximumPosition,
        },
        supportShare: cluster.impressions / pageImpressions,
        evidence: sortedRows.map((row) => ({
          queryId: row.sidecar.queryId,
          rowIdentity: row.sidecar.rowIdentity,
          sourceRecordId: row.sidecar.sourceRecordId,
          observationIds: structuredClone(row.sidecar.observationIds),
        })),
      };
    });

  return {
    pageTotals: {
      queryCount: rows.length,
      clicks: pageClicks,
      impressions: pageImpressions,
      ctr: pageClicks / pageImpressions,
    },
    clusters: summaries,
  };
}

function clusterRef(cluster: PageFocusClusterSummary): PageFocusClusterEvidenceRef {
  return {
    clusterId: cluster.clusterId,
    impressions: cluster.impressions,
    supportShare: cluster.supportShare,
  };
}

/**
 * Analyze one exact Release 0.10 page using caller-supplied cluster semantics.
 * Pure/local only: no cluster inference, provider access, persistence, recommendation,
 * action, SERP retrieval, runtime AI, tenant authority issuance, or content decision.
 */
export function analyzePageFocusCandidate(input: unknown): PageFocusReport {
  const request = parseInvocation(input);
  const window = validateSearchAnalyticsWindow(request.window);
  const rows = window.rows.filter((row) => row.sidecar.pageId === request.pageId);
  if (rows.length === 0) fail('target_not_found', 'Selected pageId is not present in the validated search window.');

  const page = rows[0]!.sidecar.page;
  if (rows.some((row) => row.sidecar.page !== page)) {
    fail('invalid_output', 'Selected pageId resolves to inconsistent exact page strings.');
  }

  const assignments = normalizeAssignments(rows, request.assignments);
  const aggregated = aggregate(rows, assignments);
  const canonicalAssignments = [...assignments.values()]
    .map((assignment) => ({ queryId: assignment.queryId, clusterId: assignment.clusterId }))
    .sort((left, right) => {
      const queryOrder = asciiCompare(left.queryId, right.queryId);
      return queryOrder !== 0 ? queryOrder : asciiCompare(left.clusterId, right.clusterId);
    });

  const id = `gsc.page-focus:${hashCanonicalJson({
    algorithm: 'gas-page-focus-report-v1',
    collectionId: window.collection.id,
    pageId: request.pageId,
    assignments: canonicalAssignments,
    policy: request.policy,
  })}`;

  const base: PageFocusReportBase = {
    id,
    source: {
      scope: structuredClone(window.collection.scope),
      providerId: window.collection.providerId,
      ...(window.collection.providerConnectionId === undefined
        ? {}
        : { providerConnectionId: window.collection.providerConnectionId }),
      collectionId: window.collection.id,
      property: window.semantics.property,
      adapter: structuredClone(window.collection.adapter),
      sourceSchema: structuredClone(window.collection.sourceSchema),
      period: {
        requested: structuredClone(window.semantics.requestedWindow),
        effective: structuredClone(window.semantics.effectiveWindow),
      },
      freshness: structuredClone(window.semantics.freshness),
      coverage: structuredClone(window.semantics.coverage),
    },
    page,
    pageId: request.pageId,
    policy: structuredClone(request.policy),
    pageTotals: aggregated.pageTotals,
    clusters: aggregated.clusters,
    serpValidationRequired: true,
    validationRequirement: PAGE_FOCUS_VALIDATION_REQUIREMENT,
  };

  const notReady = readinessReasons(window.semantics.freshness, window.semantics.coverage);
  if (notReady.length > 0) {
    return { ...base, state: 'not_ready', reasons: notReady };
  }

  if (aggregated.pageTotals.impressions < request.policy.minimumPageImpressions) {
    return { ...base, state: 'no_candidate', reasons: ['page_below_minimum_impressions'] };
  }

  const supported = aggregated.clusters.filter((cluster) =>
    cluster.impressions >= request.policy.minimumClusterImpressions
      && cluster.supportShare >= request.policy.minimumClusterShare
  );
  if (supported.length < 2) {
    return { ...base, state: 'no_candidate', reasons: ['fewer_than_two_supported_clusters'] };
  }

  const ranked = [...supported].sort((left, right) => {
    if (left.impressions !== right.impressions) return right.impressions - left.impressions;
    return asciiCompare(left.clusterId, right.clusterId);
  });
  const dominant = ranked[0]!;
  return {
    ...base,
    state: 'candidate',
    dominantEvidenceCluster: clusterRef(dominant),
    divergentEvidenceClusters: ranked.slice(1).map(clusterRef),
  };
}
