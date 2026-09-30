import { z } from 'zod';
import { identifier, timestamp, version } from '../contracts/primitives.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import {
  DISCOVERY_SEARCH_ENGINE_PROVIDERS,
  type DiscoveryAdaptationResult,
  type DiscoveryIndexNowRow,
  type DiscoveryProviderId,
  type DiscoverySearchEngineProviderId,
  type DiscoverySearchEngineRow,
  validateDiscoveryWindow,
} from '../adapters/discovery-diagnostics.js';
import type { SearchAnalyticsAdaptationResult } from '../adapters/search-analytics.js';
import { validateSearchAnalyticsWindow } from './search-analytics.js';

const ageSeconds = z.number().int().min(0).max(31_622_400).refine((value) => !Object.is(value, -0));
const policySchema = z.strictObject({
  id: identifier,
  version,
  maxEvidenceAgeSeconds: ageSeconds,
  minimumReadySearchEngines: z.union([z.literal(2), z.literal(3)]),
  maxSubmissionConfirmationAgeSeconds: ageSeconds.optional(),
});
const invocationSchema = z.strictObject({
  windows: z.array(z.unknown()).min(2).max(3),
  indexNow: z.unknown().optional(),
  evaluatedAt: timestamp,
  policy: policySchema,
  searchAnalytics: z.unknown().optional(),
});

export type DiscoveryReadinessPolicy = z.infer<typeof policySchema>;
export type DiscoveryProviderReadinessReason =
  | 'source_preliminary'
  | 'coverage_partial'
  | 'coverage_unknown'
  | 'coverage_truncated'
  | 'evidence_stale'
  | 'provider_unavailable';

export type DiscoveryFindingKind =
  | 'broad_indexing_issue_candidate'
  | 'engine_specific_indexing_divergence_candidate'
  | 'broad_crawl_access_issue_candidate'
  | 'canonical_divergence_candidate'
  | 'indexing_permission_divergence_candidate'
  | 'no_cross_engine_divergence_observed';

export type IndexNowContextState =
  | 'no_submission_evidence'
  | 'submission_rejected'
  | 'submission_rate_limited'
  | 'submission_unknown'
  | 'submission_accepted_no_later_engine_observation'
  | 'submission_accepted_later_present_observed'
  | 'submission_accepted_later_absent_observed'
  | 'submission_accepted_mixed_later_observation';

export type DiscoveryAnalysisErrorCode =
  | 'invalid_input'
  | 'incompatible_scope'
  | 'invalid_provider_set'
  | 'invalid_search_context'
  | 'invalid_output';

export class DiscoveryAnalysisError extends Error {
  override name = 'DiscoveryAnalysisError';

  constructor(
    readonly code: DiscoveryAnalysisErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface DiscoveryProviderReadiness {
  readonly providerId: DiscoveryProviderId;
  readonly collectionId: string;
  readonly state: 'ready' | 'not_ready';
  readonly reasons: readonly DiscoveryProviderReadinessReason[];
  readonly observedAt: string;
  readonly freshThrough: string;
  readonly coverageState: 'complete' | 'partial' | 'unknown';
  readonly availabilityState: string;
}

export interface DiscoveryProviderUrlState {
  readonly providerId: DiscoverySearchEngineProviderId;
  readonly observationState: 'observed_ready' | 'observed_provider_not_ready' | 'not_observed';
  readonly providerReadiness: 'ready' | 'not_ready';
  readonly readinessReasons: readonly DiscoveryProviderReadinessReason[];
  readonly observedAt: string;
  readonly searchPresence?: string;
  readonly crawlState?: string;
  readonly indexingPermission?: string;
  readonly canonicalState?: string;
  readonly canonicalTarget?: string;
  readonly httpStatus?: number;
  readonly lastCrawlAt?: string;
  readonly rowIdentity?: string;
}

export interface DiscoveryFinding {
  readonly kind: DiscoveryFindingKind;
  readonly providers: readonly DiscoverySearchEngineProviderId[];
}

export interface DiscoveryIndexNowContext {
  readonly state: IndexNowContextState;
  readonly submittedAt?: string;
  readonly submissionResult?: string;
  readonly resultCode?: number;
  readonly laterProviders: readonly DiscoverySearchEngineProviderId[];
  readonly note: 'IndexNow submission is notification evidence only; it does not prove or cause indexing.';
}

export type DiscoverySearchContext =
  | { readonly state: 'not_supplied' }
  | { readonly state: 'not_observed' }
  | {
      readonly state: 'observed';
      readonly queryCount: number;
      readonly clicks: number;
      readonly impressions: number;
      readonly ctr: number;
      readonly averagePositionRange: { readonly minimum: number; readonly maximum: number };
      readonly sourcePeriod: { readonly start: string; readonly end: string };
      readonly freshness: SearchAnalyticsAdaptationResult['semantics']['freshness'];
      readonly coverage: SearchAnalyticsAdaptationResult['semantics']['coverage'];
    };

export interface DiscoveryUrlReport {
  readonly id: string;
  readonly url: string;
  readonly urlId: string;
  readonly state: 'ready' | 'not_ready';
  readonly readinessReasons: readonly ('insufficient_ready_search_engines' | DiscoveryProviderReadinessReason)[];
  readonly providers: readonly DiscoveryProviderUrlState[];
  readonly findings: readonly DiscoveryFinding[];
  readonly indexNow: DiscoveryIndexNowContext;
  readonly searchContext: DiscoverySearchContext;
}

export interface DiscoverySiteReport {
  readonly id: string;
  readonly scope: { readonly tenantId: string; readonly siteId: string; readonly siteScopeRevisionId: string };
  readonly trustedTarget: string;
  readonly evaluatedAt: string;
  readonly policy: DiscoveryReadinessPolicy;
  readonly providers: readonly DiscoveryProviderId[];
  readonly providerReadiness: readonly DiscoveryProviderReadiness[];
  readonly totals: {
    readonly uniqueUrls: number;
    readonly readyUrls: number;
    readonly notReadyUrls: number;
    readonly findingCounts: Readonly<Record<DiscoveryFindingKind, number>>;
    readonly indexNowCounts: Readonly<Record<IndexNowContextState, number>>;
    readonly withSearchContext: number;
    readonly withoutObservedSearchContext: number;
  };
  readonly urls: readonly DiscoveryUrlReport[];
  readonly navigationOrderNote: 'Candidate-bearing URLs are listed first for navigation only; ordering is not severity, priority, or business impact.';
}

interface ParsedInvocation {
  windows: DiscoveryAdaptationResult[];
  indexNow?: DiscoveryAdaptationResult;
  evaluatedAt: string;
  policy: DiscoveryReadinessPolicy;
  searchAnalytics?: SearchAnalyticsAdaptationResult;
}

const findingOrder: readonly DiscoveryFindingKind[] = [
  'broad_indexing_issue_candidate',
  'engine_specific_indexing_divergence_candidate',
  'broad_crawl_access_issue_candidate',
  'canonical_divergence_candidate',
  'indexing_permission_divergence_candidate',
  'no_cross_engine_divergence_observed',
];

const candidateKinds = new Set<DiscoveryFindingKind>(findingOrder.slice(0, 5));
const failingCrawl = new Set(['blocked', 'not_found', 'server_error', 'other_error']);

function fail(code: DiscoveryAnalysisErrorCode, message: string): never {
  throw new DiscoveryAnalysisError(code, message);
}
function same(left: unknown, right: unknown): boolean { return canonicalJson(left) === canonicalJson(right); }
function asciiCompare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function secondsBetween(earlier: string, later: string): number {
  return (new Date(later).getTime() - new Date(earlier).getTime()) / 1_000;
}

function parseInvocation(input: unknown): ParsedInvocation {
  const parsed = invocationSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Discovery analysis invocation or readiness policy is invalid.');
  try {
    canonicalJson({
      evaluatedAt: parsed.data.evaluatedAt,
      policy: parsed.data.policy,
    });
  } catch {
    fail('invalid_input', 'Discovery analysis timing and policy must be bounded canonical data.');
  }
  return parsed.data as ParsedInvocation;
}

function providerReadiness(
  window: ReturnType<typeof validateDiscoveryWindow>,
  evaluatedAt: string,
  policy: DiscoveryReadinessPolicy,
): DiscoveryProviderReadiness {
  if (evaluatedAt < window.collection.receivedAt) {
    fail('invalid_input', 'Discovery evaluatedAt cannot precede received evidence.');
  }
  const reasons: DiscoveryProviderReadinessReason[] = [];
  if (window.semantics.availability.state !== 'available') reasons.push('provider_unavailable');
  if (window.semantics.freshness.dataState !== 'final') reasons.push('source_preliminary');
  if (window.semantics.coverage.state === 'partial') reasons.push('coverage_partial');
  if (window.semantics.coverage.state === 'unknown') reasons.push('coverage_unknown');
  if (window.semantics.coverage.truncated) reasons.push('coverage_truncated');
  if (secondsBetween(window.semantics.freshness.freshThrough, evaluatedAt) > policy.maxEvidenceAgeSeconds) {
    reasons.push('evidence_stale');
  }
  return {
    providerId: window.collection.providerId as DiscoveryProviderId,
    collectionId: window.collection.id,
    state: reasons.length === 0 ? 'ready' : 'not_ready',
    reasons,
    observedAt: window.semantics.observedAt,
    freshThrough: window.semantics.freshness.freshThrough,
    coverageState: window.semantics.coverage.state,
    availabilityState: window.semantics.availability.state,
  };
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) fail('invalid_output', 'Discovery search-context count exceeds safe numeric bounds.');
  return result;
}

function searchContextForUrl(
  search: ReturnType<typeof validateSearchAnalyticsWindow> | undefined,
  url: string,
): DiscoverySearchContext {
  if (search === undefined) return { state: 'not_supplied' };
  const rows = search.rows.filter((row) => row.sidecar.page === url);
  if (rows.length === 0) return { state: 'not_observed' };
  let clicks = 0;
  let impressions = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const row of rows) {
    clicks = safeAdd(clicks, row.metrics.clicks);
    impressions = safeAdd(impressions, row.metrics.impressions);
    minimum = Math.min(minimum, row.metrics.averagePosition);
    maximum = Math.max(maximum, row.metrics.averagePosition);
  }
  return {
    state: 'observed',
    queryCount: rows.length,
    clicks,
    impressions,
    ctr: clicks / impressions,
    averagePositionRange: { minimum, maximum },
    sourcePeriod: structuredClone(search.semantics.effectiveWindow),
    freshness: structuredClone(search.semantics.freshness),
    coverage: structuredClone(search.semantics.coverage),
  };
}

function canonicalResolved(row: DiscoverySearchEngineRow): string | undefined {
  if (row.canonicalState === 'self') return row.url;
  if (row.canonicalState === 'other') return row.canonicalTarget;
  return undefined;
}

function findingsFor(rows: readonly DiscoverySearchEngineRow[]): DiscoveryFinding[] {
  const findings: DiscoveryFinding[] = [];
  const absent = rows.filter((row) => row.searchPresence === 'absent');
  const present = rows.filter((row) => row.searchPresence === 'present');
  if (absent.length >= 2) {
    findings.push({ kind: 'broad_indexing_issue_candidate', providers: absent.map((row) => row.providerId).sort(asciiCompare) });
  }
  if (absent.length >= 1 && present.length >= 1) {
    findings.push({
      kind: 'engine_specific_indexing_divergence_candidate',
      providers: [...new Set([...absent, ...present].map((row) => row.providerId))].sort(asciiCompare),
    });
  }
  const crawlFailures = rows.filter((row) => failingCrawl.has(row.crawlState));
  if (crawlFailures.length >= 2) {
    findings.push({ kind: 'broad_crawl_access_issue_candidate', providers: crawlFailures.map((row) => row.providerId).sort(asciiCompare) });
  }
  const canonicalRows = rows
    .map((row) => ({ row, target: canonicalResolved(row) }))
    .filter((value): value is { row: DiscoverySearchEngineRow; target: string } => value.target !== undefined);
  if (canonicalRows.length >= 2 && new Set(canonicalRows.map((value) => value.target)).size > 1) {
    findings.push({ kind: 'canonical_divergence_candidate', providers: canonicalRows.map((value) => value.row.providerId).sort(asciiCompare) });
  }
  const permissions = rows.filter((row) => row.indexingPermission !== 'unknown');
  if (permissions.some((row) => row.indexingPermission === 'allowed')
      && permissions.some((row) => row.indexingPermission === 'blocked')) {
    findings.push({ kind: 'indexing_permission_divergence_candidate', providers: permissions.map((row) => row.providerId).sort(asciiCompare) });
  }
  if (findings.length === 0) {
    findings.push({ kind: 'no_cross_engine_divergence_observed', providers: rows.map((row) => row.providerId).sort(asciiCompare) });
  }
  return findings.sort((left, right) => findingOrder.indexOf(left.kind) - findingOrder.indexOf(right.kind));
}

function indexNowContext(
  row: DiscoveryIndexNowRow | undefined,
  readyRows: readonly { row: DiscoverySearchEngineRow; observedAt: string }[],
  policy: DiscoveryReadinessPolicy,
): DiscoveryIndexNowContext {
  const note = 'IndexNow submission is notification evidence only; it does not prove or cause indexing.' as const;
  if (row === undefined) return { state: 'no_submission_evidence', laterProviders: [], note };
  const common = {
    submittedAt: row.submittedAt,
    submissionResult: row.submissionResult,
    ...(row.resultCode === undefined ? {} : { resultCode: row.resultCode }),
    note,
  };
  if (row.submissionResult === 'rejected') {
    return { ...common, state: 'submission_rejected', laterProviders: [] };
  }
  if (row.submissionResult === 'rate_limited') {
    return { ...common, state: 'submission_rate_limited', laterProviders: [] };
  }
  if (row.submissionResult === 'unknown') {
    return { ...common, state: 'submission_unknown', laterProviders: [] };
  }
  const later = readyRows.filter((value) => {
    if (value.observedAt <= row.submittedAt) return false;
    if (policy.maxSubmissionConfirmationAgeSeconds === undefined) return true;
    return secondsBetween(row.submittedAt, value.observedAt) <= policy.maxSubmissionConfirmationAgeSeconds;
  }).filter((value) => value.row.searchPresence !== 'unknown');
  const providers = later.map((value) => value.row.providerId).sort(asciiCompare);
  if (later.length === 0) return { ...common, state: 'submission_accepted_no_later_engine_observation', laterProviders: [] };
  const present = later.some((value) => value.row.searchPresence === 'present');
  const absent = later.some((value) => value.row.searchPresence === 'absent');
  if (present && absent) return { ...common, state: 'submission_accepted_mixed_later_observation', laterProviders: providers };
  if (present) return { ...common, state: 'submission_accepted_later_present_observed', laterProviders: providers };
  return { ...common, state: 'submission_accepted_later_absent_observed', laterProviders: providers };
}

function zeroFindingCounts(): Record<DiscoveryFindingKind, number> {
  return Object.fromEntries(findingOrder.map((kind) => [kind, 0])) as Record<DiscoveryFindingKind, number>;
}
function zeroIndexNowCounts(): Record<IndexNowContextState, number> {
  return {
    no_submission_evidence: 0,
    submission_rejected: 0,
    submission_rate_limited: 0,
    submission_unknown: 0,
    submission_accepted_no_later_engine_observation: 0,
    submission_accepted_later_present_observed: 0,
    submission_accepted_later_absent_observed: 0,
    submission_accepted_mixed_later_observation: 0,
  };
}

function urlSortRank(report: DiscoveryUrlReport): [number, number, string] {
  if (report.state === 'not_ready') return [2, findingOrder.length, report.url];
  const first = report.findings[0]?.kind;
  if (first !== undefined && candidateKinds.has(first)) return [0, findingOrder.indexOf(first), report.url];
  return [1, findingOrder.length, report.url];
}

/**
 * Pure/local provider-preserving discovery diagnostics. No provider retrieval,
 * persistence, authority issuance, ranking/priority score, remediation, or runtime AI.
 */
export function analyzeDiscoveryDiagnostics(input: unknown): DiscoverySiteReport {
  const request = parseInvocation(input);
  const windows = request.windows.map((window) => validateDiscoveryWindow(window));
  if (windows.some((window) => !DISCOVERY_SEARCH_ENGINE_PROVIDERS.includes(window.collection.providerId as DiscoverySearchEngineProviderId))) {
    fail('invalid_provider_set', 'Cross-engine windows must be Google, Bing, or Yandex discovery evidence.');
  }
  const providers = windows.map((window) => window.collection.providerId as DiscoverySearchEngineProviderId);
  if (new Set(providers).size !== providers.length) fail('invalid_provider_set', 'Cross-engine discovery providers must be distinct.');

  const indexNow = request.indexNow === undefined ? undefined : validateDiscoveryWindow(request.indexNow);
  if (indexNow !== undefined && indexNow.collection.providerId !== 'indexnow') {
    fail('invalid_provider_set', 'Optional submission context must be an IndexNow discovery window.');
  }

  const owner = windows[0]!;
  for (const window of [...windows.slice(1), ...(indexNow === undefined ? [] : [indexNow])]) {
    if (!same(window.collection.scope, owner.collection.scope)
        || window.semantics.trustedTarget !== owner.semantics.trustedTarget) {
      fail('incompatible_scope', 'Discovery windows do not share exact trusted scope/site target.');
    }
  }

  const readiness = windows.map((window) => providerReadiness(window, request.evaluatedAt, request.policy));
  const indexNowReadiness = indexNow === undefined ? undefined : providerReadiness(indexNow, request.evaluatedAt, request.policy);
  const readinessByProvider = new Map(readiness.map((entry) => [entry.providerId, entry] as const));

  let search: ReturnType<typeof validateSearchAnalyticsWindow> | undefined;
  if (request.searchAnalytics !== undefined) {
    search = validateSearchAnalyticsWindow(request.searchAnalytics);
    if (!same(search.collection.scope, owner.collection.scope)
        || search.semantics.property !== owner.semantics.trustedTarget) {
      fail('invalid_search_context', 'Search Analytics context does not share exact trusted scope/site target.');
    }
  }

  const indexRows = indexNow === undefined
    ? new Map<string, DiscoveryIndexNowRow>()
    : new Map(indexNow.rows.filter((row): row is DiscoveryIndexNowRow => row.kind === 'indexnow').map((row) => [row.url, row]));
  const allUrls = new Set<string>();
  for (const window of windows) for (const row of window.rows) allUrls.add(row.url);
  for (const row of indexRows.values()) allUrls.add(row.url);

  const reports: DiscoveryUrlReport[] = [];
  for (const url of [...allUrls].sort(asciiCompare)) {
    const providerStates: DiscoveryProviderUrlState[] = [];
    const readyRows: { row: DiscoverySearchEngineRow; observedAt: string }[] = [];
    const identityRows: { providerId: string; collectionId: string; rowIdentity?: string }[] = [];

    for (const window of windows) {
      const providerId = window.collection.providerId as DiscoverySearchEngineProviderId;
      const ready = readinessByProvider.get(providerId)!;
      const row = window.rows.find((candidate): candidate is DiscoverySearchEngineRow =>
        candidate.kind === 'search_engine' && candidate.url === url);
      identityRows.push({ providerId, collectionId: window.collection.id, ...(row === undefined ? {} : { rowIdentity: row.rowIdentity }) });
      if (row === undefined) {
        providerStates.push({
          providerId,
          observationState: 'not_observed',
          providerReadiness: ready.state,
          readinessReasons: ready.reasons,
          observedAt: window.semantics.observedAt,
        });
        continue;
      }
      if (ready.state === 'ready') readyRows.push({ row, observedAt: window.semantics.observedAt });
      providerStates.push({
        providerId,
        observationState: ready.state === 'ready' ? 'observed_ready' : 'observed_provider_not_ready',
        providerReadiness: ready.state,
        readinessReasons: ready.reasons,
        observedAt: window.semantics.observedAt,
        searchPresence: row.searchPresence,
        crawlState: row.crawlState,
        indexingPermission: row.indexingPermission,
        canonicalState: row.canonicalState,
        ...(row.canonicalTarget === undefined ? {} : { canonicalTarget: row.canonicalTarget }),
        ...(row.httpStatus === undefined ? {} : { httpStatus: row.httpStatus }),
        ...(row.lastCrawlAt === undefined ? {} : { lastCrawlAt: row.lastCrawlAt }),
        rowIdentity: row.rowIdentity,
      });
    }
    providerStates.sort((left, right) => asciiCompare(left.providerId, right.providerId));

    const urlReasons = new Set<'insufficient_ready_search_engines' | DiscoveryProviderReadinessReason>();
    for (const state of providerStates) {
      if (state.observationState === 'observed_provider_not_ready') {
        for (const reason of state.readinessReasons) urlReasons.add(reason);
      }
    }
    if (readyRows.length < request.policy.minimumReadySearchEngines) urlReasons.add('insufficient_ready_search_engines');
    const state = readyRows.length >= request.policy.minimumReadySearchEngines ? 'ready' : 'not_ready';
    const findings = state === 'ready' ? findingsFor(readyRows.map((value) => value.row)) : [];
    const submission = indexNowContext(indexRows.get(url), readyRows, request.policy);
    const searchContext = searchContextForUrl(search, url);
    const urlId = readyRows[0]?.row.urlId
      ?? windows.flatMap((window) => window.rows).find((row) => row.url === url)?.urlId
      ?? indexRows.get(url)?.urlId;
    if (urlId === undefined) fail('invalid_output', 'Discovery URL identity could not be reconstructed.');

    identityRows.sort((left, right) => asciiCompare(left.providerId, right.providerId));
    const indexNowRow = indexRows.get(url);
    const id = `discovery.url-report:${hashCanonicalJson({
      algorithm: 'gas-discovery-url-report-v1',
      url,
      urlId,
      evidence: identityRows,
      ...(indexNowRow === undefined ? {} : { indexNow: indexNowRow.rowIdentity }),
      ...(search === undefined ? {} : { searchCollectionId: search.collection.id }),
      evaluatedAt: request.evaluatedAt,
      policy: request.policy,
    })}`;
    reports.push({
      id,
      url,
      urlId,
      state,
      readinessReasons: [...urlReasons].sort(asciiCompare),
      providers: providerStates,
      findings,
      indexNow: submission,
      searchContext,
    });
  }

  reports.sort((left, right) => {
    const a = urlSortRank(left);
    const b = urlSortRank(right);
    return a[0] - b[0] || a[1] - b[1] || asciiCompare(a[2], b[2]);
  });

  const findingCounts = zeroFindingCounts();
  const indexNowCounts = zeroIndexNowCounts();
  let readyUrls = 0;
  let withSearchContext = 0;
  for (const report of reports) {
    if (report.state === 'ready') readyUrls += 1;
    for (const finding of report.findings) findingCounts[finding.kind] += 1;
    indexNowCounts[report.indexNow.state] += 1;
    if (report.searchContext.state === 'observed') withSearchContext += 1;
  }

  const allProviderReadiness = [
    ...readiness,
    ...(indexNowReadiness === undefined ? [] : [indexNowReadiness]),
  ].sort((left, right) => asciiCompare(left.providerId, right.providerId));
  const providerSet = allProviderReadiness.map((entry) => entry.providerId);
  const id = `discovery.site-report:${hashCanonicalJson({
    algorithm: 'gas-discovery-site-report-v1',
    collections: allProviderReadiness.map((entry) => ({ providerId: entry.providerId, collectionId: entry.collectionId })),
    ...(search === undefined ? {} : { searchCollectionId: search.collection.id }),
    evaluatedAt: request.evaluatedAt,
    policy: request.policy,
  })}`;

  return {
    id,
    scope: structuredClone(owner.collection.scope),
    trustedTarget: owner.semantics.trustedTarget,
    evaluatedAt: request.evaluatedAt,
    policy: structuredClone(request.policy),
    providers: providerSet,
    providerReadiness: allProviderReadiness,
    totals: {
      uniqueUrls: reports.length,
      readyUrls,
      notReadyUrls: reports.length - readyUrls,
      findingCounts,
      indexNowCounts,
      withSearchContext,
      withoutObservedSearchContext: reports.length - withSearchContext,
    },
    urls: reports,
    navigationOrderNote: 'Candidate-bearing URLs are listed first for navigation only; ordering is not severity, priority, or business impact.',
  };
}
