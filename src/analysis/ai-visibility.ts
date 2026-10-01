import { z } from 'zod';
import { identifier, timestamp, version } from '../contracts/primitives.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import type { Scope } from '../persistence/repository.js';
import {
  validateBingAiWindow,
  type BingAiAdaptationResult,
  type BingAiGroundingQueryRow,
  type BingAiPageRow,
  type BingAiQueryPageMappingRow,
  type ValidatedBingAiWindow,
} from '../adapters/bing-ai-performance.js';
import {
  projectValidatedZeroRankVisibility,
  type ZeroRankAdapterConfig,
  type ZeroRankVisibilityProjection,
} from '../adapters/zerorank.js';
import type { SearchAnalyticsAdaptationResult } from '../adapters/search-analytics.js';
import { validateSearchAnalyticsWindow } from './search-analytics.js';
import type { SearchChangeOutcomeCohort } from './search-change.js';
import type { PageFocusReport } from './page-focus.js';

export const AI_VISIBILITY_ANALYSIS_VERSION = '1.0.0' as const;

const policySchema = z.strictObject({
  id: identifier,
  version,
  maxEvidenceAgeSeconds: z.number().int().min(0).max(31_622_400),
  topN: z.number().int().min(1).max(10),
  concentrationShareThresholdPct: z.number().min(0).max(100),
});
const cohortMappingSchema = z.strictObject({
  bingGroundingQueryIdentity: identifier,
  zeroRankPromptId: z.string().min(1).max(128).regex(/\S/),
});
const invocationSchema = z.strictObject({
  bingCurrent: z.unknown(),
  bingBaseline: z.unknown().optional(),
  zeroRankCurrent: z.unknown(),
  zeroRankBaseline: z.unknown().optional(),
  evaluatedAt: timestamp,
  policy: policySchema,
  cohortMappings: z.array(cohortMappingSchema).max(128).optional(),
  searchAnalytics: z.unknown().optional(),
  searchChange: z.unknown().optional(),
  pageFocus: z.unknown().optional(),
});

export type AiVisibilityPolicy = z.infer<typeof policySchema>;

export interface ZeroRankAnalysisInput {
  readonly bytes: Uint8Array;
  readonly trustedConfig: ZeroRankAdapterConfig;
}
export type AiVisibilityChangeState =
  | 'increase_observed'
  | 'decrease_observed'
  | 'unchanged_observed'
  | 'not_comparable';

export type AiVisibilityReadinessReason =
  | 'source_unavailable'
  | 'preliminary'
  | 'processing'
  | 'stale'
  | 'filtered'
  | 'unknown_coverage'
  | 'sampled_aggregated'
  | 'incomplete_endpoint'
  | 'incompatible_scope'
  | 'incompatible_periods'
  | 'insufficient_comparable_windows';

export interface AiVisibilityProviderReadiness {
  readonly providerId: 'bing-webmaster-ai-performance' | 'zerorank';
  readonly state: 'ready' | 'limited' | 'not_ready';
  readonly reasons: readonly AiVisibilityReadinessReason[];
}

export interface AiVisibilityProviderComparability {
  readonly providerId: 'bing-webmaster-ai-performance' | 'zerorank';
  readonly state: 'comparable' | 'not_comparable';
  readonly reasons: readonly AiVisibilityReadinessReason[];
}

export interface AiVisibilityChange {
  readonly id: string;
  readonly providerId: 'bing-webmaster-ai-performance' | 'zerorank';
  readonly family: 'summary' | 'page' | 'grounding_query' | 'query_page_mapping' | 'ranking' | 'source_url';
  readonly identity: string;
  readonly metric: string;
  readonly state: AiVisibilityChangeState;
  readonly baseline?: number;
  readonly current?: number;
  readonly delta?: number;
}

export interface AiVisibilityConcentrationFinding {
  readonly id: string;
  readonly kind:
    | 'bing_page_citation_concentration_candidate'
    | 'zerorank_source_url_citation_concentration_candidate';
  readonly providerId: 'bing-webmaster-ai-performance' | 'zerorank';
  readonly numerator: number;
  readonly denominator: number;
  readonly calculatedSharePct: number;
  readonly policy: Readonly<{
    id: string;
    version: string;
    topN: number;
    concentrationShareThresholdPct: number;
  }>;
  readonly topRows: readonly Readonly<{ identity: string; value: number }>[];
  readonly context: readonly string[];
}

export interface AiVisibilityCrossSourceFinding {
  readonly id: string;
  readonly kind:
    | 'cross_source_visibility_presence_divergence_candidate'
    | 'cross_source_cohort_coverage_divergence_candidate';
  readonly bingState: 'present' | 'absent';
  readonly zeroRankState: 'present' | 'absent';
  readonly bingIdentity?: string;
  readonly zeroRankIdentity?: string;
  readonly note: string;
}

export interface AiVisibilityTraditionalSearchContext {
  readonly page: string;
  readonly state: 'observed' | 'not_observed';
  readonly queryCount?: number;
  readonly clicks?: number;
  readonly impressions?: number;
  readonly ctr?: number;
  readonly averagePositionRange?: Readonly<{ minimum: number; maximum: number }>;
  readonly period?: Readonly<{ start: string; end: string }>;
  readonly freshness?: string;
  readonly coverage?: string;
}

export interface AiVisibilitySiteReport {
  readonly id: string;
  readonly scope: Scope;
  readonly trustedTarget: string;
  readonly evaluatedAt: string;
  readonly policy: AiVisibilityPolicy;
  readonly readiness: readonly AiVisibilityProviderReadiness[];
  readonly comparability: readonly AiVisibilityProviderComparability[];
  readonly bing: Readonly<{
    collectionId: string;
    property: string;
    period: Readonly<{ start: string; end: string }>;
    dataState: string;
    coverageState: string;
    sampledAggregated: true;
    summary?: Readonly<{ totalCitations?: number; averageCitedPages?: number }>;
    pages: readonly Readonly<{ url: string; citationCount: number; rowIdentity: string }>[];
    groundingQueries: readonly Readonly<{
      phrase: string;
      citationCount: number;
      rowIdentity: string;
      intent?: string;
      topic?: string;
      citationSharePct?: number;
    }>[];
  }>;
  readonly zeroRank: Readonly<{
    collections: Readonly<Record<string, string>>;
    endpointCompleteness: Readonly<Record<string, string>>;
    rankings: ZeroRankVisibilityProjection['rankings'];
    prompts: ZeroRankVisibilityProjection['prompts'];
    chats: ZeroRankVisibilityProjection['chats'];
    sourceUrls: ZeroRankVisibilityProjection['sourceUrls'];
  }>;
  readonly changes: readonly AiVisibilityChange[];
  readonly concentrationFindings: readonly AiVisibilityConcentrationFinding[];
  readonly crossSourceFindings: readonly AiVisibilityCrossSourceFinding[];
  readonly traditionalSearchContext: readonly AiVisibilityTraditionalSearchContext[];
  readonly changeOutcomeContext?: Readonly<{
    id: string;
    annotationId: string;
    targetPage: string;
    metric: string;
    readinessState: string;
  }>;
  readonly pageFocusContext?: Readonly<{
    id: string;
    page: string;
    state: string;
    serpValidationRequired: true;
  }>;
  readonly semantics: Readonly<{
    bingSamplingWarning: string;
    groundingQueryWarning: string;
    metricBoundaryWarning: string;
    crossSourceWarning: string;
    causationWarning: string;
    navigationOrderNote: string;
  }>;
}

export type AiVisibilityAnalysisErrorCode =
  | 'invalid_input'
  | 'invalid_window'
  | 'configuration_mismatch'
  | 'invalid_context'
  | 'invalid_output';

export class AiVisibilityAnalysisError extends Error {
  override name = 'AiVisibilityAnalysisError';
  constructor(readonly code: AiVisibilityAnalysisErrorCode, message: string) {
    super(message);
  }
}

interface ParsedInvocation {
  readonly bingCurrent: BingAiAdaptationResult;
  readonly bingBaseline?: BingAiAdaptationResult;
  readonly zeroRankCurrent: ZeroRankAnalysisInput;
  readonly zeroRankBaseline?: ZeroRankAnalysisInput;
  readonly evaluatedAt: string;
  readonly policy: AiVisibilityPolicy;
  readonly cohortMappings: readonly z.infer<typeof cohortMappingSchema>[];
  readonly searchAnalytics?: SearchAnalyticsAdaptationResult;
  readonly searchChange?: SearchChangeOutcomeCohort;
  readonly pageFocus?: PageFocusReport;
}

function fail(code: AiVisibilityAnalysisErrorCode, message: string): never {
  throw new AiVisibilityAnalysisError(code, message);
}
function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}
function scopeOf(window: ValidatedBingAiWindow): Scope {
  return window.collection.scope;
}
function ageSeconds(evaluatedAt: string, sourceAt: string): number {
  return (Date.parse(evaluatedAt) - Date.parse(sourceAt)) / 1_000;
}
function stateFor(baseline: number, current: number): Exclude<AiVisibilityChangeState, 'not_comparable'> {
  return current > baseline
    ? 'increase_observed'
    : current < baseline
      ? 'decrease_observed'
      : 'unchanged_observed';
}
function changeId(value: Omit<AiVisibilityChange, 'id'>): string {
  return `ai-visibility.change:${hashCanonicalJson(value)}`;
}
function makeChange(
  providerId: AiVisibilityChange['providerId'],
  family: AiVisibilityChange['family'],
  identity: string,
  metric: string,
  baseline: number | undefined,
  current: number | undefined,
  comparable: boolean,
): AiVisibilityChange {
  const base = {
    providerId,
    family,
    identity,
    metric,
    state: !comparable || baseline === undefined || current === undefined
      ? 'not_comparable' as const
      : stateFor(baseline, current),
    ...(baseline === undefined ? {} : { baseline }),
    ...(current === undefined ? {} : { current }),
    ...(!comparable || baseline === undefined || current === undefined ? {} : { delta: current - baseline }),
  };
  return { id: changeId(base), ...base };
}

function parseZeroRankAnalysisInput(input: unknown, label: string): ZeroRankAnalysisInput {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('invalid_input', `${label} must provide sanitized bytes and trusted configuration.`);
  }
  const candidate = input as Record<string, unknown>;
  if (Object.keys(candidate).sort().join(',') !== 'bytes,trustedConfig'
      || !(candidate['bytes'] instanceof Uint8Array)
      || candidate['trustedConfig'] === null
      || typeof candidate['trustedConfig'] !== 'object'
      || Array.isArray(candidate['trustedConfig'])) {
    fail('invalid_input', `${label} must provide only sanitized bytes and trusted configuration.`);
  }
  try {
    return {
      bytes: Uint8Array.from(candidate['bytes'] as Uint8Array),
      trustedConfig: structuredClone(candidate['trustedConfig']) as ZeroRankAdapterConfig,
    };
  } catch {
    fail('invalid_input', `${label} must contain cloneable bounded analysis input.`);
  }
}

function parseInvocation(input: unknown): ParsedInvocation {
  const parsed = invocationSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'AI-visibility invocation or policy is invalid.');
  const data = parsed.data;
  try {
    canonicalJson({
      evaluatedAt: data.evaluatedAt,
      policy: data.policy,
      cohortMappings: data.cohortMappings ?? [],
    });
  } catch {
    fail('invalid_input', 'AI-visibility policy/mappings must be bounded canonical data.');
  }
  return {
    bingCurrent: data.bingCurrent as BingAiAdaptationResult,
    ...(data.bingBaseline === undefined ? {} : { bingBaseline: data.bingBaseline as BingAiAdaptationResult }),
    zeroRankCurrent: parseZeroRankAnalysisInput(data.zeroRankCurrent, 'zeroRankCurrent'),
    ...(data.zeroRankBaseline === undefined
      ? {}
      : { zeroRankBaseline: parseZeroRankAnalysisInput(data.zeroRankBaseline, 'zeroRankBaseline') }),
    evaluatedAt: data.evaluatedAt,
    policy: data.policy,
    cohortMappings: data.cohortMappings ?? [],
    ...(data.searchAnalytics === undefined ? {} : { searchAnalytics: data.searchAnalytics as SearchAnalyticsAdaptationResult }),
    ...(data.searchChange === undefined ? {} : { searchChange: data.searchChange as SearchChangeOutcomeCohort }),
    ...(data.pageFocus === undefined ? {} : { pageFocus: data.pageFocus as PageFocusReport }),
  };
}

function bingReadiness(
  window: ValidatedBingAiWindow,
  evaluatedAt: string,
  policy: AiVisibilityPolicy,
): AiVisibilityProviderReadiness {
  const reasons: AiVisibilityReadinessReason[] = ['sampled_aggregated'];
  if (window.semantics.availability.state !== 'available') reasons.push('source_unavailable');
  if (window.semantics.dataState === 'preliminary') reasons.push('preliminary');
  if (window.semantics.dataState === 'processing') reasons.push('processing');
  if (ageSeconds(evaluatedAt, window.semantics.exportedAt) > policy.maxEvidenceAgeSeconds) reasons.push('stale');
  if (window.semantics.coverage.state === 'filtered') reasons.push('filtered');
  if (window.semantics.coverage.state === 'unknown') reasons.push('unknown_coverage');
  const blockers = reasons.filter((reason) => reason !== 'sampled_aggregated');
  return {
    providerId: 'bing-webmaster-ai-performance',
    state: reasons.includes('source_unavailable')
      ? 'not_ready'
      : blockers.length === 0
        ? 'ready'
        : 'limited',
    reasons,
  };
}

function zeroRankReadiness(
  projection: ZeroRankVisibilityProjection,
  evaluatedAt: string,
  policy: AiVisibilityPolicy,
): AiVisibilityProviderReadiness {
  const reasons: AiVisibilityReadinessReason[] = [];
  if (projection.availability.state !== 'available') reasons.push('source_unavailable');
  if (ageSeconds(evaluatedAt, projection.observedAt) > policy.maxEvidenceAgeSeconds) reasons.push('stale');
  if (Object.values(projection.endpointCompleteness).some((value) => value !== 'complete')) reasons.push('incomplete_endpoint');
  return {
    providerId: 'zerorank',
    state: reasons.includes('source_unavailable')
      ? 'not_ready'
      : reasons.length === 0
        ? 'ready'
        : 'limited',
    reasons,
  };
}

function bingComparability(
  baseline: ValidatedBingAiWindow | undefined,
  current: ValidatedBingAiWindow,
): AiVisibilityProviderComparability {
  if (baseline === undefined) {
    return {
      providerId: 'bing-webmaster-ai-performance',
      state: 'not_comparable',
      reasons: ['insufficient_comparable_windows'],
    };
  }
  const reasons: AiVisibilityReadinessReason[] = [];
  if (!same(scopeOf(baseline), scopeOf(current))
      || baseline.semantics.trustedProperty !== current.semantics.trustedProperty) {
    reasons.push('incompatible_scope');
  }
  if (baseline.semantics.availability.state !== 'available'
      || current.semantics.availability.state !== 'available') {
    reasons.push('source_unavailable');
  }
  if (baseline.semantics.dataState === 'preliminary' || current.semantics.dataState === 'preliminary') reasons.push('preliminary');
  if (baseline.semantics.dataState === 'processing' || current.semantics.dataState === 'processing') reasons.push('processing');
  if (baseline.semantics.coverage.state === 'filtered' || current.semantics.coverage.state === 'filtered') reasons.push('filtered');
  if (baseline.semantics.coverage.state === 'unknown' || current.semantics.coverage.state === 'unknown') reasons.push('unknown_coverage');

  const baselineDuration = Date.parse(baseline.semantics.period.end) - Date.parse(baseline.semantics.period.start);
  const currentDuration = Date.parse(current.semantics.period.end) - Date.parse(current.semantics.period.start);
  if (baseline.semantics.period.end > current.semantics.period.start
      || baselineDuration !== currentDuration
      || !same(baseline.semantics.coverage, current.semantics.coverage)) {
    reasons.push('incompatible_periods');
  }
  return {
    providerId: 'bing-webmaster-ai-performance',
    state: reasons.length === 0 ? 'comparable' : 'not_comparable',
    reasons: [...new Set(reasons)],
  };
}

function zeroRankComparability(
  baseline: ZeroRankVisibilityProjection | undefined,
  current: ZeroRankVisibilityProjection,
): AiVisibilityProviderComparability {
  if (baseline === undefined) {
    return {
      providerId: 'zerorank',
      state: 'not_comparable',
      reasons: ['insufficient_comparable_windows'],
    };
  }
  const reasons: AiVisibilityReadinessReason[] = [];
  if (!same(baseline.scope, current.scope) || baseline.trustedTargetOrigin !== current.trustedTargetOrigin) {
    reasons.push('incompatible_scope');
  }
  if (baseline.availability.state !== 'available' || current.availability.state !== 'available') {
    reasons.push('source_unavailable');
  }
  if (!(baseline.observedAt < current.observedAt)) reasons.push('incompatible_periods');
  return {
    providerId: 'zerorank',
    state: reasons.length === 0 ? 'comparable' : 'not_comparable',
    reasons,
  };
}

function keyed<T>(values: readonly T[], key: (value: T) => string): Map<string, T> {
  return new Map(values.map((value) => [key(value), value]));
}

function bingChanges(
  baseline: ValidatedBingAiWindow | undefined,
  current: ValidatedBingAiWindow,
): AiVisibilityChange[] {
  const comparable = bingComparability(baseline, current).state === 'comparable';
  const changes: AiVisibilityChange[] = [];
  changes.push(makeChange(
    'bing-webmaster-ai-performance',
    'summary',
    current.semantics.trustedProperty,
    'total_citations',
    baseline?.summary?.totalCitations,
    current.summary?.totalCitations,
    comparable,
  ));

  const families: readonly {
    family: 'page' | 'grounding_query' | 'query_page_mapping';
    baseline: readonly (BingAiPageRow | BingAiGroundingQueryRow | BingAiQueryPageMappingRow)[];
    current: readonly (BingAiPageRow | BingAiGroundingQueryRow | BingAiQueryPageMappingRow)[];
    identity: (row: BingAiPageRow | BingAiGroundingQueryRow | BingAiQueryPageMappingRow) => string;
    value: (row: BingAiPageRow | BingAiGroundingQueryRow | BingAiQueryPageMappingRow) => number | undefined;
    metric: string;
  }[] = [
    {
      family: 'page',
      baseline: baseline?.rows.filter((row): row is BingAiPageRow => row.kind === 'page') ?? [],
      current: current.rows.filter((row): row is BingAiPageRow => row.kind === 'page'),
      identity: (row) => (row as BingAiPageRow).url,
      value: (row) => (row as BingAiPageRow).citationCount,
      metric: 'page_citations',
    },
    {
      family: 'grounding_query',
      baseline: baseline?.rows.filter((row): row is BingAiGroundingQueryRow => row.kind === 'grounding_query') ?? [],
      current: current.rows.filter((row): row is BingAiGroundingQueryRow => row.kind === 'grounding_query'),
      identity: (row) => (row as BingAiGroundingQueryRow).phrase,
      value: (row) => (row as BingAiGroundingQueryRow).citationCount,
      metric: 'grounding_query_citations',
    },
    {
      family: 'query_page_mapping',
      baseline: baseline?.rows.filter((row): row is BingAiQueryPageMappingRow => row.kind === 'query_page_mapping') ?? [],
      current: current.rows.filter((row): row is BingAiQueryPageMappingRow => row.kind === 'query_page_mapping'),
      identity: (row) => {
        const mapping = row as BingAiQueryPageMappingRow;
        return `${mapping.phrase}\u0000${mapping.url}`;
      },
      value: (row) => (row as BingAiQueryPageMappingRow).citationCount,
      metric: 'query_page_mapping_citations',
    },
  ];

  for (const family of families) {
    const before = keyed(family.baseline, family.identity);
    const after = keyed(family.current, family.identity);
    const identities = [...new Set([...before.keys(), ...after.keys()])].sort(asciiCompare);
    for (const identity of identities) {
      const left = before.get(identity);
      const right = after.get(identity);
      changes.push(makeChange(
        'bing-webmaster-ai-performance',
        family.family,
        identity,
        family.metric,
        left === undefined ? undefined : family.value(left),
        right === undefined ? undefined : family.value(right),
        comparable,
      ));
    }
  }
  return changes;
}

function zeroRankChanges(
  baseline: ZeroRankVisibilityProjection | undefined,
  current: ZeroRankVisibilityProjection,
): AiVisibilityChange[] {
  const comparable = zeroRankComparability(baseline, current).state === 'comparable';
  const changes: AiVisibilityChange[] = [];
  const rankingBefore = keyed(baseline?.rankings ?? [], (row) => row.id);
  const rankingAfter = keyed(current.rankings, (row) => row.id);
  for (const id of [...new Set([...rankingBefore.keys(), ...rankingAfter.keys()])].sort(asciiCompare)) {
    const before = rankingBefore.get(id);
    const after = rankingAfter.get(id);
    for (const metric of ['rank','mentions','visibilityPercentage','growth'] as const) {
      changes.push(makeChange('zerorank','ranking',id,metric,before?.[metric],after?.[metric],comparable));
    }
  }
  const sourceBefore = keyed(baseline?.sourceUrls ?? [], (row) => row.id);
  const sourceAfter = keyed(current.sourceUrls, (row) => row.id);
  for (const id of [...new Set([...sourceBefore.keys(), ...sourceAfter.keys()])].sort(asciiCompare)) {
    const before = sourceBefore.get(id);
    const after = sourceAfter.get(id);
    for (const metric of ['totalCitations','totalUsage','usagePercentage'] as const) {
      changes.push(makeChange('zerorank','source_url',id,metric,before?.[metric],after?.[metric],comparable));
    }
  }
  return changes;
}

function roundShare(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function concentrationFindings(
  currentBing: ValidatedBingAiWindow,
  currentZeroRank: ZeroRankVisibilityProjection,
  bingReadinessState: AiVisibilityProviderReadiness,
  zeroRankReadinessState: AiVisibilityProviderReadiness,
  policy: AiVisibilityPolicy,
): AiVisibilityConcentrationFinding[] {
  const findings: AiVisibilityConcentrationFinding[] = [];
  const pages = currentBing.rows.filter((row): row is BingAiPageRow => row.kind === 'page');
  const denominator = pages.reduce((sum, row) => sum + row.citationCount, 0);
  if (bingReadinessState.state === 'ready'
      && currentBing.semantics.coverage.state === 'complete_export_view'
      && denominator > 0) {
    const top = [...pages]
      .sort((left, right) => right.citationCount - left.citationCount || asciiCompare(left.url, right.url))
      .slice(0, policy.topN);
    const numerator = top.reduce((sum, row) => sum + row.citationCount, 0);
    const share = roundShare((numerator / denominator) * 100);
    if (share >= policy.concentrationShareThresholdPct) {
      const material = {
        kind: 'bing_page_citation_concentration_candidate' as const,
        providerId: 'bing-webmaster-ai-performance' as const,
        numerator,
        denominator,
        calculatedSharePct: share,
        policy: {
          id: policy.id,
          version: policy.version,
          topN: policy.topN,
          concentrationShareThresholdPct: policy.concentrationShareThresholdPct,
        },
        topRows: top.map((row) => ({ identity: row.url, value: row.citationCount })),
        context: ['sampled_aggregated', 'complete_export_view'],
      };
      findings.push({ id: `ai-visibility.concentration:${hashCanonicalJson(material)}`, ...material });
    }
  }

  const zeroRankConcentrationBlocked = zeroRankReadinessState.reasons.some((reason) =>
    reason === 'source_unavailable' || reason === 'stale' || reason === 'incompatible_scope');
  if (!zeroRankConcentrationBlocked && currentZeroRank.endpointCompleteness.sourceUrls === 'complete') {
    const rows = currentZeroRank.sourceUrls.filter((row) => row.totalCitations !== undefined);
    const zrDenominator = rows.reduce((sum, row) => sum + (row.totalCitations ?? 0), 0);
    if (zrDenominator > 0) {
      const top = [...rows]
        .sort((left, right) => (right.totalCitations ?? 0) - (left.totalCitations ?? 0) || asciiCompare(left.id, right.id))
        .slice(0, policy.topN);
      const numerator = top.reduce((sum, row) => sum + (row.totalCitations ?? 0), 0);
      const share = roundShare((numerator / zrDenominator) * 100);
      if (share >= policy.concentrationShareThresholdPct) {
        const material = {
          kind: 'zerorank_source_url_citation_concentration_candidate' as const,
          providerId: 'zerorank' as const,
          numerator,
          denominator: zrDenominator,
          calculatedSharePct: share,
          policy: {
            id: policy.id,
            version: policy.version,
            topN: policy.topN,
            concentrationShareThresholdPct: policy.concentrationShareThresholdPct,
          },
          topRows: top.map((row) => ({ identity: row.sourceUrl ?? row.id, value: row.totalCitations ?? 0 })),
          context: ['provider_specific', 'complete_source_url_endpoint'],
        };
        findings.push({ id: `ai-visibility.concentration:${hashCanonicalJson(material)}`, ...material });
      }
    }
  }
  return findings;
}

function bingPresence(window: ValidatedBingAiWindow): 'present' | 'absent' | 'unknown' {
  if (window.rows.some((row) => row.kind === 'page' && row.citationCount > 0)
      || (window.summary?.totalCitations ?? 0) > 0) return 'present';
  return window.semantics.dataState === 'final'
    && window.semantics.coverage.state === 'complete_export_view'
    && window.summary?.totalCitations === 0
    ? 'absent'
    : 'unknown';
}

function zeroRankPresence(projection: ZeroRankVisibilityProjection): 'present' | 'absent' | 'unknown' {
  let hostname = '';
  try {
    hostname = new URL(projection.trustedTargetOrigin).hostname;
  } catch {
    fail('invalid_window', 'ZeroRank trusted target origin is invalid.');
  }
  const positiveRanking = projection.rankings.some((row) =>
    row.domain === hostname
    && ((row.mentions ?? 0) > 0 || (row.visibilityPercentage ?? 0) > 0));
  const positiveSourceUrl = projection.sourceUrls.some((row) => {
    if ((row.totalCitations ?? 0) <= 0 || row.sourceUrl === undefined) return false;
    try {
      return new URL(row.sourceUrl).hostname === hostname;
    } catch {
      return false;
    }
  });
  if (positiveRanking || positiveSourceUrl) return 'present';
  return projection.endpointCompleteness.rankings === 'complete'
    && projection.endpointCompleteness.sourceUrls === 'complete'
    ? 'absent'
    : 'unknown';
}

function providerPropertyHostname(property: string): string | undefined {
  if (property.startsWith('sc-domain:')) {
    const raw = property.slice('sc-domain:'.length).toLowerCase();
    try {
      const parsed = new URL(`https://${raw}/`);
      return parsed.hostname.toLowerCase() === raw && parsed.port === '' ? raw : undefined;
    } catch {
      return undefined;
    }
  }
  try {
    const parsed = new URL(property);
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== '') return undefined;
    return parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

function bingPropertyIsWholeSite(property: string): boolean {
  if (property.startsWith('sc-domain:')) return providerPropertyHostname(property) !== undefined;
  try {
    const parsed = new URL(property);
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.pathname === '/';
  } catch {
    return false;
  }
}

function trustedTargetsCompatible(
  bing: ValidatedBingAiWindow,
  zeroRank: ZeroRankVisibilityProjection,
): boolean {
  if (!bingPropertyIsWholeSite(bing.semantics.trustedProperty)) return false;
  const propertyHostname = providerPropertyHostname(bing.semantics.trustedProperty);
  if (propertyHostname === undefined) return false;
  try {
    return new URL(zeroRank.trustedTargetOrigin).hostname.toLowerCase() === propertyHostname;
  } catch {
    return false;
  }
}

function crossSourceFindings(
  bing: ValidatedBingAiWindow,
  zeroRank: ZeroRankVisibilityProjection,
  bingReadinessState: AiVisibilityProviderReadiness,
  zeroRankReadinessState: AiVisibilityProviderReadiness,
  mappings: readonly z.infer<typeof cohortMappingSchema>[],
): AiVisibilityCrossSourceFinding[] {
  const findings: AiVisibilityCrossSourceFinding[] = [];
  if (!trustedTargetsCompatible(bing, zeroRank)) return findings;
  const hardBlockers = new Set<AiVisibilityReadinessReason>([
    'source_unavailable',
    'preliminary',
    'processing',
    'stale',
    'incompatible_scope',
  ]);
  const bingBlocked = bingReadinessState.reasons.some((reason) => hardBlockers.has(reason));
  const zeroRankBlocked = zeroRankReadinessState.reasons.some((reason) => hardBlockers.has(reason));
  if (bingBlocked || zeroRankBlocked) return findings;
  const bingState = bingPresence(bing);
  const zeroRankState = zeroRankPresence(zeroRank);
  if (bingState !== 'unknown' && zeroRankState !== 'unknown' && bingState !== zeroRankState) {
    const material = {
      kind: 'cross_source_visibility_presence_divergence_candidate' as const,
      bingState,
      zeroRankState,
      note: 'Explicit provider-specific presence states differ. This does not identify which provider is correct.',
    };
    findings.push({ id: `ai-visibility.cross-source:${hashCanonicalJson(material)}`, ...material });
  }

  const queries = keyed(
    bing.rows.filter((row): row is BingAiGroundingQueryRow => row.kind === 'grounding_query'),
    (row) => row.rowIdentity,
  );
  const prompts = keyed(zeroRank.prompts, (row) => row.id);
  const chatsByPrompt = new Map<string, ZeroRankVisibilityProjection['chats']>();
  for (const prompt of zeroRank.prompts) {
    chatsByPrompt.set(prompt.id, zeroRank.chats.filter((chat) => chat.promptId === prompt.id));
  }

  const uniqueMappings = new Set<string>();
  for (const mapping of mappings) {
    const key = canonicalJson(mapping);
    if (uniqueMappings.has(key)) fail('invalid_input', 'Explicit cross-source cohort mappings must be unique.');
    uniqueMappings.add(key);
    const query = queries.get(mapping.bingGroundingQueryIdentity);
    const prompt = prompts.get(mapping.zeroRankPromptId);
    if (query === undefined || prompt === undefined) continue;
    const bingMappedState: 'present' | 'absent' | 'unknown' = query.citationCount > 0
      ? 'present'
      : bing.semantics.dataState === 'final' && bing.semantics.coverage.state === 'complete_export_view'
        ? 'absent'
        : 'unknown';
    const chats = chatsByPrompt.get(prompt.id) ?? [];
    const positive = chats.some((chat) => (chat.citationCount ?? 0) > 0);
    const zeroMappedState: 'present' | 'absent' | 'unknown' = positive
      ? 'present'
      : zeroRank.endpointCompleteness.chats === 'complete'
        ? 'absent'
        : 'unknown';
    if (bingMappedState !== 'unknown' && zeroMappedState !== 'unknown' && bingMappedState !== zeroMappedState) {
      const material = {
        kind: 'cross_source_cohort_coverage_divergence_candidate' as const,
        bingState: bingMappedState,
        zeroRankState: zeroMappedState,
        bingIdentity: query.rowIdentity,
        zeroRankIdentity: prompt.id,
        note: 'Caller-supplied exact cohort mapping shows provider evidence coverage divergence only; no semantic or intent equivalence was inferred.',
      };
      findings.push({ id: `ai-visibility.cross-source:${hashCanonicalJson(material)}`, ...material });
    }
  }
  return findings;
}

function traditionalSearchContext(
  input: SearchAnalyticsAdaptationResult | undefined,
  scope: Scope,
  currentBingProperty: string,
  pages: readonly BingAiPageRow[],
): AiVisibilityTraditionalSearchContext[] {
  if (input === undefined) return [];
  const validated = validateSearchAnalyticsWindow(input);
  if (!same(validated.collection.scope, scope)) {
    fail('invalid_context', 'Search Analytics context trusted scope does not match AI-visibility evidence.');
  }
  const bingHostname = providerPropertyHostname(currentBingProperty);
  const searchHostname = providerPropertyHostname(validated.semantics.property);
  if (bingHostname === undefined || searchHostname === undefined || bingHostname !== searchHostname) {
    fail('invalid_context', 'Search Analytics context trusted property does not represent the same site as Bing evidence.');
  }
  const byPage = new Map<string, typeof validated.rows>();
  for (const page of pages) byPage.set(page.url, validated.rows.filter((row) => row.sidecar.page === page.url));
  return pages.map((page) => {
    const rows = byPage.get(page.url) ?? [];
    if (rows.length === 0) return { page: page.url, state: 'not_observed' as const };
    const clicks = rows.reduce((sum, row) => sum + row.metrics.clicks, 0);
    const impressions = rows.reduce((sum, row) => sum + row.metrics.impressions, 0);
    const positions = rows.map((row) => row.metrics.averagePosition);
    return {
      page: page.url,
      state: 'observed' as const,
      queryCount: rows.length,
      clicks,
      impressions,
      ctr: impressions === 0 ? 0 : clicks / impressions,
      averagePositionRange: { minimum: Math.min(...positions), maximum: Math.max(...positions) },
      period: structuredClone(validated.semantics.effectiveWindow),
      freshness: `${validated.semantics.freshness.dataState} through ${validated.semantics.freshness.freshThrough}`,
      coverage: validated.semantics.coverage.state,
    };
  });
}

function changeOutcomeContext(
  input: SearchChangeOutcomeCohort | undefined,
  scope: Scope,
  pageSet: ReadonlySet<string>,
): AiVisibilitySiteReport['changeOutcomeContext'] {
  if (input === undefined) return undefined;
  const measurementScope = input.baseline.measurement.cohort.context.scope;
  if (!same(measurementScope, scope) || !pageSet.has(input.target.page)) return undefined;
  return {
    id: input.id,
    annotationId: input.annotation.id,
    targetPage: input.target.page,
    metric: input.target.metric,
    readinessState: input.readiness.state,
  };
}

function pageFocusContext(
  input: PageFocusReport | undefined,
  scope: Scope,
  pageSet: ReadonlySet<string>,
): AiVisibilitySiteReport['pageFocusContext'] {
  if (input === undefined || !same(input.source.scope, scope) || !pageSet.has(input.page)) return undefined;
  return { id: input.id, page: input.page, state: input.state, serpValidationRequired: true };
}

/**
 * Analyze one current Bing + ZeroRank view, optional provider baselines, and optional
 * accepted context. All findings are descriptive/investigative; no score, severity,
 * priority, remediation, provider correctness, or causal inference is produced.
 */
export function analyzeAiVisibility(input: unknown): AiVisibilitySiteReport {
  const request = parseInvocation(input);
  const bing = validateBingAiWindow(request.bingCurrent);
  const bingBaseline = request.bingBaseline === undefined ? undefined : validateBingAiWindow(request.bingBaseline);
  const zeroRank = projectValidatedZeroRankVisibility(
    request.zeroRankCurrent.bytes,
    request.zeroRankCurrent.trustedConfig,
  );
  const zeroRankBaseline = request.zeroRankBaseline === undefined
    ? undefined
    : projectValidatedZeroRankVisibility(
        request.zeroRankBaseline.bytes,
        request.zeroRankBaseline.trustedConfig,
      );

  if (!same(scopeOf(bing), zeroRank.scope)) fail('configuration_mismatch', 'Bing and ZeroRank trusted scopes do not match.');
  const bingProviderReadiness = bingReadiness(bing, request.evaluatedAt, request.policy);
  const zeroRankProviderReadiness = zeroRankReadiness(zeroRank, request.evaluatedAt, request.policy);
  const readiness = !trustedTargetsCompatible(bing, zeroRank)
    ? [
        {
          ...bingProviderReadiness,
          state: bingProviderReadiness.state === 'not_ready' ? 'not_ready' as const : 'limited' as const,
          reasons: [...bingProviderReadiness.reasons, 'incompatible_scope' as const],
        },
        {
          ...zeroRankProviderReadiness,
          state: zeroRankProviderReadiness.state === 'not_ready' ? 'not_ready' as const : 'limited' as const,
          reasons: [...zeroRankProviderReadiness.reasons, 'incompatible_scope' as const],
        },
      ] as const
    : [bingProviderReadiness, zeroRankProviderReadiness] as const;

  const comparability = [
    bingComparability(bingBaseline, bing),
    zeroRankComparability(zeroRankBaseline, zeroRank),
  ] as const;

  const changes = [
    ...bingChanges(bingBaseline, bing),
    ...zeroRankChanges(zeroRankBaseline, zeroRank),
  ].sort((left, right) =>
    asciiCompare(left.providerId, right.providerId)
    || asciiCompare(left.family, right.family)
    || asciiCompare(left.identity, right.identity)
    || asciiCompare(left.metric, right.metric));

  const concentrations = concentrationFindings(bing, zeroRank, readiness[0], readiness[1], request.policy)
    .sort((left, right) => asciiCompare(left.id, right.id));
  const cross = crossSourceFindings(bing, zeroRank, readiness[0], readiness[1], request.cohortMappings)
    .sort((left, right) => asciiCompare(left.id, right.id));

  const pages = bing.rows.filter((row): row is BingAiPageRow => row.kind === 'page');
  const queries = bing.rows.filter((row): row is BingAiGroundingQueryRow => row.kind === 'grounding_query');
  const pageSet = new Set(pages.map((page) => page.url));
  const traditional = traditionalSearchContext(request.searchAnalytics, scopeOf(bing), bing.semantics.trustedProperty, pages);
  const changeContext = changeOutcomeContext(request.searchChange, scopeOf(bing), pageSet);
  const focusContext = pageFocusContext(request.pageFocus, scopeOf(bing), pageSet);

  const material = {
    algorithm: 'gas-ai-visibility-site-report-v1',
    scope: scopeOf(bing),
    target: zeroRank.trustedTargetOrigin,
    evaluatedAt: request.evaluatedAt,
    policy: request.policy,
    comparability,
    bingCollectionId: bing.collection.id,
    zeroRankCollections: zeroRank.collections,
    changes: changes.map((value) => value.id),
    concentrationFindings: concentrations.map((value) => value.id),
    crossSourceFindings: cross.map((value) => value.id),
    traditionalSearchContext: traditional,
    ...(changeContext === undefined ? {} : { changeOutcomeContext: changeContext }),
    ...(focusContext === undefined ? {} : { pageFocusContext: focusContext }),
  };

  return {
    id: `ai-visibility.site-report:${hashCanonicalJson(material)}`,
    scope: structuredClone(scopeOf(bing)),
    trustedTarget: zeroRank.trustedTargetOrigin,
    evaluatedAt: request.evaluatedAt,
    policy: structuredClone(request.policy),
    readiness,
    comparability,
    bing: {
      collectionId: bing.collection.id,
      property: bing.semantics.trustedProperty,
      period: structuredClone(bing.semantics.period),
      dataState: bing.semantics.dataState,
      coverageState: bing.semantics.coverage.state,
      sampledAggregated: true,
      ...(bing.summary === undefined ? {} : { summary: structuredClone(bing.summary) }),
      pages: pages.map((row) => ({ url: row.url, citationCount: row.citationCount, rowIdentity: row.rowIdentity })),
      groundingQueries: queries.map((row) => ({
        phrase: row.phrase,
        citationCount: row.citationCount,
        rowIdentity: row.rowIdentity,
        ...(row.intent === undefined ? {} : { intent: row.intent }),
        ...(row.topic === undefined ? {} : { topic: row.topic }),
        ...(row.citationSharePct === undefined ? {} : { citationSharePct: row.citationSharePct }),
      })),
    },
    zeroRank: {
      collections: structuredClone(zeroRank.collections),
      endpointCompleteness: structuredClone(zeroRank.endpointCompleteness),
      rankings: structuredClone(zeroRank.rankings),
      prompts: structuredClone(zeroRank.prompts),
      chats: structuredClone(zeroRank.chats),
      sourceUrls: structuredClone(zeroRank.sourceUrls),
    },
    changes,
    concentrationFindings: concentrations,
    crossSourceFindings: cross,
    traditionalSearchContext: traditional,
    ...(changeContext === undefined ? {} : { changeOutcomeContext: changeContext }),
    ...(focusContext === undefined ? {} : { pageFocusContext: focusContext }),
    semantics: {
      bingSamplingWarning: 'Bing AI Performance evidence is sampled/aggregated. A complete export is complete only for that exported provider view, not the underlying event population.',
      groundingQueryWarning: 'A Bing grounding query is a grouped provider phrase, not an exact user prompt.',
      metricBoundaryWarning: 'Bing citation evidence is not ranking, authority, traffic, engagement, or page quality. ZeroRank vendor metrics remain ZeroRank-specific.',
      crossSourceWarning: 'Cross-source divergence does not identify which provider is correct and never compares raw metric magnitudes across providers.',
      causationWarning: 'Observed change correlation and optional change/outcome context do not establish causation.',
      navigationOrderNote: 'Rows and findings use deterministic navigation ordering only; ordering is not severity, priority, or business impact.',
    },
  };
}
