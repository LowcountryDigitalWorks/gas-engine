import { z } from 'zod';
import { identifier, scope as scopeSchema, timestamp, version as versionSchema } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import { hashCanonicalJson, sha256Bytes } from '../lib/canonical-json.js';
import {
  diffEvidenceCollections,
  type EvidenceDeltaEntry,
  type EvidenceDeltaReport,
} from '../analysis/diff.js';
import {
  analyzeSearchAnalyticsSignals,
  validateSearchAnalyticsWindow,
  type SearchAnalyticsSignal,
  type SearchAnalyticsSignalPolicies,
  type SearchAnalyticsSignalReport,
  type ValidatedSearchAnalyticsWindow,
} from '../analysis/search-analytics.js';
import {
  composeSearchChangeOutcomeCohort,
  type SearchChangeOutcomeCohort,
} from '../analysis/search-change.js';
import {
  analyzePageFocusCandidate,
  type PageFocusReport,
} from '../analysis/page-focus.js';
import {
  analyzeDiscoveryDiagnostics,
  type DiscoverySiteReport,
} from '../analysis/discovery-diagnostics.js';
import {
  analyzeAiVisibility,
  type AiVisibilitySiteReport,
} from '../analysis/ai-visibility.js';
import type { SearchAnalyticsAdaptationResult } from '../adapters/search-analytics.js';
import type { EvidenceRepository, Scope } from '../persistence/repository.js';
import type { TenantContext } from '../persistence/tenant-context.js';
import type { ReviewLedgerRepository } from '../review/repository.js';
import { getRecommendationEvidence } from '../review/service.js';

export const SERVICE_BRIEF_VERSION = '0.15.0' as const;
export const MAX_SERVICE_BRIEF_JSON_BYTES = 1_500_000;

export const SERVICE_BRIEF_HARD_LIMITS = Object.freeze({
  attentionItems: 512,
  pageIndexEntries: 256,
  referencesPerPage: 64,
  detailedRecommendationHistories: 10,
  searchChanges: 32,
  pageFocusReports: 64,
} as const);

const policySchema = z.strictObject({
  id: identifier,
  version: versionSchema,
  maxAttentionItems: z.number().int().min(1).max(SERVICE_BRIEF_HARD_LIMITS.attentionItems),
  maxPageIndexEntries: z.number().int().min(1).max(SERVICE_BRIEF_HARD_LIMITS.pageIndexEntries),
  maxReferencesPerPage: z.number().int().min(1).max(SERVICE_BRIEF_HARD_LIMITS.referencesPerPage),
  maxDetailedRecommendationHistories: z.number().int().min(0).max(SERVICE_BRIEF_HARD_LIMITS.detailedRecommendationHistories),
  maxSearchChanges: z.number().int().min(0).max(SERVICE_BRIEF_HARD_LIMITS.searchChanges),
  maxPageFocusReports: z.number().int().min(0).max(SERVICE_BRIEF_HARD_LIMITS.pageFocusReports),
});

const evidenceDiffSchema = z.strictObject({
  baselineCollectionId: identifier,
  currentCollectionId: identifier,
});

const historySchema = z.strictObject({
  selectedRecommendationIds: z.array(identifier).max(SERVICE_BRIEF_HARD_LIMITS.detailedRecommendationHistories),
});

const searchAnalyticsSchema = z.strictObject({
  baseline: z.unknown(),
  current: z.unknown(),
  policy: z.unknown(),
});

const discoverySchema = z.strictObject({
  windows: z.array(z.unknown()).min(2).max(3),
  indexNow: z.unknown().optional(),
  evaluatedAt: timestamp,
  policy: z.unknown(),
  searchAnalytics: z.unknown().optional(),
});

const aiVisibilitySchema = z.strictObject({
  bingCurrent: z.unknown(),
  bingBaseline: z.unknown().optional(),
  zeroRankCurrent: z.unknown(),
  zeroRankBaseline: z.unknown().optional(),
  evaluatedAt: timestamp,
  policy: z.unknown(),
  cohortMappings: z.array(z.unknown()).max(128).optional(),
});

const requestSchema = z.strictObject({
  scope: scopeSchema,
  trustedTarget: z.string().min(1).max(2_048).regex(/\S/),
  generatedAt: timestamp,
  policy: policySchema,
  evidenceDiff: evidenceDiffSchema.optional(),
  serviceHistory: historySchema.optional(),
  searchAnalytics: searchAnalyticsSchema.optional(),
  searchChanges: z.array(z.unknown()).max(SERVICE_BRIEF_HARD_LIMITS.searchChanges).optional(),
  pageFocus: z.array(z.unknown()).max(SERVICE_BRIEF_HARD_LIMITS.pageFocusReports).optional(),
  discoveryDiagnostics: discoverySchema.optional(),
  aiVisibility: aiVisibilitySchema.optional(),
});

export type ServiceBriefPolicy = z.infer<typeof policySchema>;

export type ServiceBriefReadinessState =
  | 'not_supplied'
  | 'ready'
  | 'limited'
  | 'not_ready'
  | 'unavailable';

export type ServiceBriefModuleId =
  | 'evidence_diff'
  | 'review_history'
  | 'search_analytics'
  | 'search_change'
  | 'page_focus'
  | 'discovery_diagnostics'
  | 'ai_visibility';

export interface ServiceBriefReadinessEntry {
  readonly moduleId: ServiceBriefModuleId;
  readonly state: ServiceBriefReadinessState;
  readonly reasons: readonly string[];
}

export interface ServiceBriefAttentionIdentity {
  readonly url?: string;
  readonly query?: string;
  readonly promptId?: string;
  readonly cohortHash?: string;
}

export interface ServiceBriefAttentionItem {
  readonly id: string;
  readonly navigationOrder: number;
  readonly moduleId: ServiceBriefModuleId;
  readonly originalKind: string;
  readonly originalState: string;
  readonly evidenceIdentity: string;
  readonly identity: ServiceBriefAttentionIdentity;
  readonly readinessContext: readonly string[];
}

export interface ServiceBriefUrlReference {
  readonly moduleId: ServiceBriefModuleId;
  readonly kind: string;
  readonly evidenceIdentity: string;
}

export interface ServiceBriefPageIndexEntry {
  readonly url: string;
  readonly references: readonly ServiceBriefUrlReference[];
}

export interface ServiceBriefRecommendationSummary {
  readonly id: string;
  readonly lifecycle: Contract<'recommendation'>['lifecycle'];
  readonly revision: number;
  readonly priority: Contract<'recommendation'>['priority'];
  readonly authorityClass: Contract<'recommendation'>['authorityClass'];
  readonly rationale: string;
  readonly updatedAt: string;
}

export interface ServiceBriefSelectedRecommendationHistory {
  readonly recommendationId: string;
  readonly history: readonly Contract<'recommendation'>[];
  readonly evidence: readonly Contract<'observation'>[];
  readonly measurements: readonly Contract<'measurement'>[];
  readonly outcomes: readonly Contract<'outcome'>[];
}

export interface ServiceBriefHistorySummary {
  readonly lifecycleCounts: Readonly<Record<Contract<'recommendation'>['lifecycle'], number>>;
  readonly measurementStateCounts: Readonly<Record<Contract<'measurement'>['result']['state'], number>>;
  readonly outcomeDirectionCounts: Readonly<Record<Contract<'outcome'>['assessment']['direction'], number>>;
  readonly currentRecommendations: readonly ServiceBriefRecommendationSummary[];
  readonly selectedHistories: readonly ServiceBriefSelectedRecommendationHistory[];
}

export interface ServiceBriefManifestEntry {
  readonly moduleId: ServiceBriefModuleId;
  readonly release: string;
  readonly identity: string;
  readonly providerIds: readonly string[];
  readonly scope: Scope;
  readonly target?: string;
  readonly sourcePeriods: readonly Readonly<{ start: string; end: string }>[];
  readonly evaluatedAt?: string;
  readonly readiness: ServiceBriefReadinessState;
  readonly reasons: readonly string[];
  readonly policy?: Readonly<{ id: string; version: string }>;
}

export interface ServiceBriefModules {
  readonly evidenceDiff?: EvidenceDeltaReport;
  readonly searchAnalytics?: SearchAnalyticsSignalReport;
  readonly searchChanges: readonly SearchChangeOutcomeCohort[];
  readonly pageFocus: readonly PageFocusReport[];
  readonly discoveryDiagnostics?: DiscoverySiteReport;
  readonly aiVisibility?: AiVisibilitySiteReport;
}

export interface ServiceBrief {
  readonly version: typeof SERVICE_BRIEF_VERSION;
  readonly id: string;
  readonly scope: Scope;
  readonly trustedTarget: string;
  readonly generatedAt: string;
  readonly policy: ServiceBriefPolicy;
  readonly readiness: readonly ServiceBriefReadinessEntry[];
  readonly attentionRegister: readonly ServiceBriefAttentionItem[];
  readonly exactUrlEvidenceIndex: readonly ServiceBriefPageIndexEntry[];
  readonly serviceHistory?: ServiceBriefHistorySummary;
  readonly modules: ServiceBriefModules;
  readonly provenanceManifest: readonly ServiceBriefManifestEntry[];
  readonly limitations: readonly string[];
}

export type ServiceBriefErrorCode =
  | 'invalid_request'
  | 'scope_mismatch'
  | 'target_mismatch'
  | 'invalid_selection'
  | 'bound_exceeded'
  | 'invalid_output';

export class ServiceBriefError extends Error {
  override name = 'ServiceBriefError';

  constructor(readonly code: ServiceBriefErrorCode, message: string) {
    super(message);
  }
}

interface ParsedRequest {
  readonly scope: Scope;
  readonly trustedTarget: string;
  readonly generatedAt: string;
  readonly policy: ServiceBriefPolicy;
  readonly evidenceDiff?: z.infer<typeof evidenceDiffSchema>;
  readonly serviceHistory?: z.infer<typeof historySchema>;
  readonly searchAnalytics?: z.infer<typeof searchAnalyticsSchema>;
  readonly searchChanges: readonly unknown[];
  readonly pageFocus: readonly unknown[];
  readonly discoveryDiagnostics?: z.infer<typeof discoverySchema>;
  readonly aiVisibility?: z.infer<typeof aiVisibilitySchema>;
}

const moduleOrder: readonly ServiceBriefModuleId[] = [
  'evidence_diff',
  'review_history',
  'search_analytics',
  'search_change',
  'page_focus',
  'discovery_diagnostics',
  'ai_visibility',
];

const acceptedDiscoveryCandidateKinds = new Set([
  'broad_indexing_issue_candidate',
  'engine_specific_indexing_divergence_candidate',
  'broad_crawl_access_issue_candidate',
  'canonical_divergence_candidate',
  'indexing_permission_divergence_candidate',
]);

const limitations = Object.freeze([
  'Module ordering and attention-register ordering are deterministic navigation only; they are not priority, severity, materiality, or business impact.',
  'Exact-URL grouping means only that accepted records reference the same exact URL string; co-occurrence is not correlation or causation.',
  'Missing, unknown, partial, unavailable, preliminary, filtered, truncated, or non-exhaustive evidence never becomes observed zero or proven absence unless the accepted producer explicitly establishes that state.',
  'Human recommendation acceptance is non-executing. Human-declared outcome direction and attribution are preserved as recorded and are not recalculated by Release 0.15.',
  'The service brief creates no recommendation, remediation, publishing, provider-write, or other production action authority.',
]);

function fail(code: ServiceBriefErrorCode, message: string): never {
  throw new ServiceBriefError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(asciiCompare);
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId
    && left.siteId === right.siteId
    && left.siteScopeRevisionId === right.siteScopeRevisionId;
}

function parseTrustedTarget(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail('invalid_request', 'Service-brief trustedTarget must be an exact canonical HTTPS origin.');
  }
  if (parsed.protocol !== 'https:'
      || parsed.username !== ''
      || parsed.password !== ''
      || parsed.search !== ''
      || parsed.hash !== ''
      || parsed.pathname !== '/'
      || parsed.origin !== value) {
    fail('invalid_request', 'Service-brief trustedTarget must be an exact canonical HTTPS origin.');
  }
  return parsed.origin;
}

function propertyMatchesTarget(property: string, target: string): boolean {
  const expected = new URL(target);
  if (property.startsWith('sc-domain:')) {
    return property.slice('sc-domain:'.length).toLowerCase() === expected.hostname.toLowerCase();
  }
  try {
    const parsed = new URL(property);
    return parsed.protocol === 'https:'
      && parsed.username === ''
      && parsed.password === ''
      && parsed.search === ''
      && parsed.hash === ''
      && parsed.pathname === '/'
      && parsed.origin === expected.origin;
  } catch {
    return false;
  }
}

function pageMatchesTarget(page: string, target: string): boolean {
  try {
    return new URL(page).origin === target;
  } catch {
    return false;
  }
}

function parseRequest(input: unknown): ParsedRequest {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) fail('invalid_request', 'Release 0.15 service-brief request is invalid or contains unsupported fields.');
  const trustedTarget = parseTrustedTarget(parsed.data.trustedTarget);
  const selected = parsed.data.serviceHistory?.selectedRecommendationIds ?? [];
  if (new Set(selected).size !== selected.length) {
    fail('invalid_request', 'Selected recommendation IDs must be unique.');
  }
  if (selected.length > parsed.data.policy.maxDetailedRecommendationHistories) {
    fail('bound_exceeded', 'Selected recommendation histories exceed the Release 0.15 policy bound.');
  }
  const searchChanges = parsed.data.searchChanges ?? [];
  if (searchChanges.length > parsed.data.policy.maxSearchChanges) {
    fail('bound_exceeded', 'Search Change inputs exceed the Release 0.15 policy bound.');
  }
  const pageFocus = parsed.data.pageFocus ?? [];
  if (pageFocus.length > parsed.data.policy.maxPageFocusReports) {
    fail('bound_exceeded', 'Page-Focus inputs exceed the Release 0.15 policy bound.');
  }
  return {
    scope: parsed.data.scope,
    trustedTarget,
    generatedAt: parsed.data.generatedAt,
    policy: parsed.data.policy,
    ...(parsed.data.evidenceDiff === undefined ? {} : { evidenceDiff: parsed.data.evidenceDiff }),
    ...(parsed.data.serviceHistory === undefined ? {} : { serviceHistory: parsed.data.serviceHistory }),
    ...(parsed.data.searchAnalytics === undefined ? {} : { searchAnalytics: parsed.data.searchAnalytics }),
    searchChanges,
    pageFocus,
    ...(parsed.data.discoveryDiagnostics === undefined ? {} : { discoveryDiagnostics: parsed.data.discoveryDiagnostics }),
    ...(parsed.data.aiVisibility === undefined ? {} : { aiVisibility: parsed.data.aiVisibility }),
  };
}

function hashJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) fail('invalid_output', 'Service-brief deterministic identity material is not JSON serializable.');
  try {
    return sha256Bytes(Buffer.from(json, 'utf8'));
  } catch {
    fail('invalid_output', 'Service-brief deterministic identity material exceeds bounded hashing limits.');
  }
}

function readiness(
  moduleId: ServiceBriefModuleId,
  state: ServiceBriefReadinessState,
  reasons: readonly string[] = [],
): ServiceBriefReadinessEntry {
  return { moduleId, state, reasons: uniqueSorted(reasons) };
}

function searchReadiness(window: ValidatedSearchAnalyticsWindow): { state: ServiceBriefReadinessState; reasons: string[] } {
  const reasons: string[] = [];
  if (window.semantics.freshness.dataState !== 'final') reasons.push('source_preliminary');
  if (window.semantics.coverage.state !== 'complete') reasons.push(`coverage_${window.semantics.coverage.state}`);
  if (window.semantics.coverage.truncated) reasons.push('coverage_truncated');
  if (window.semantics.coverage.anonymized) reasons.push('coverage_anonymized');
  return { state: reasons.length === 0 ? 'ready' : 'limited', reasons };
}

function assertSearchWindowScopeAndTarget(window: ValidatedSearchAnalyticsWindow, scope: Scope, target: string): void {
  if (!sameScope(window.collection.scope, scope)) fail('scope_mismatch', 'Search Analytics evidence is outside the requested Release 0.15 scope.');
  if (!propertyMatchesTarget(window.semantics.property, target)) fail('target_mismatch', 'Search Analytics evidence does not match the requested Release 0.15 target.');
  for (const row of window.rows) {
    if (!pageMatchesTarget(row.sidecar.page, target)) {
      fail('target_mismatch', 'Search Analytics row references a page outside the requested Release 0.15 target.');
    }
  }
}

function fixedCounts<T extends string>(keys: readonly T[], values: readonly T[]): Record<T, number> {
  const result = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  for (const value of values) result[value] += 1;
  return result;
}

async function serviceHistory(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  scope: Scope,
  selectedIds: readonly string[],
): Promise<ServiceBriefHistorySummary> {
  const recommendations = await reviewRepository.listCurrentRecommendations(context, { scope });
  const measurements = await reviewRepository.listMeasurements(context, { scope });
  const outcomes = await reviewRepository.listOutcomes(context, { scope });

  const currentById = new Map(recommendations.map((record) => [record.id, record] as const));
  const selectedHistories: ServiceBriefSelectedRecommendationHistory[] = [];
  for (const id of [...selectedIds].sort(asciiCompare)) {
    const current = currentById.get(id);
    if (current === undefined) {
      fail('invalid_selection', 'Selected recommendation is not present in the requested Release 0.15 scope.');
    }
    const history = await reviewRepository.listRecommendationHistory(context, scope, id);
    if (history.length === 0) fail('invalid_selection', 'Selected recommendation history is unavailable.');
    const evidence = await getRecommendationEvidence(reviewRepository, evidenceRepository, context, scope, id);
    selectedHistories.push({
      recommendationId: id,
      history: history.map((record) => structuredClone(record)),
      evidence: evidence.map((record) => structuredClone(record)),
      measurements: measurements
        .filter((entry) => entry.recommendationId === id)
        .map((entry) => structuredClone(entry.record)),
      outcomes: outcomes
        .filter((entry) => entry.recommendationId === id)
        .map((entry) => structuredClone(entry)),
    });
  }

  const lifecycleKeys = ['proposed', 'in_review', 'accepted', 'rejected', 'superseded'] as const;
  const measurementKeys = ['not_due', 'not_measured', 'measured'] as const;
  const outcomeKeys = ['improved', 'regressed', 'unchanged', 'inconclusive', 'not_due', 'not_measured'] as const;

  return {
    lifecycleCounts: fixedCounts(lifecycleKeys, recommendations.map((record) => record.lifecycle)),
    measurementStateCounts: fixedCounts(measurementKeys, measurements.map((entry) => entry.record.result.state)),
    outcomeDirectionCounts: fixedCounts(outcomeKeys, outcomes.map((entry) => entry.assessment.direction)),
    currentRecommendations: [...recommendations]
      .sort((left, right) => asciiCompare(left.id, right.id))
      .map((record) => ({
        id: record.id,
        lifecycle: record.lifecycle,
        revision: record.revision,
        priority: structuredClone(record.priority),
        authorityClass: record.authorityClass,
        rationale: record.rationale,
        updatedAt: record.updatedAt,
      })),
    selectedHistories,
  };
}

function searchSignalReadinessContext(signal: SearchAnalyticsSignal): string[] {
  const reasons = [
    `current_freshness:${signal.freshness.current.dataState}`,
    `current_coverage:${signal.coverage.current.state}`,
  ];
  if (signal.freshness.baseline !== undefined) reasons.push(`baseline_freshness:${signal.freshness.baseline.dataState}`);
  if (signal.coverage.baseline !== undefined) reasons.push(`baseline_coverage:${signal.coverage.baseline.state}`);
  return uniqueSorted(reasons);
}

function rawAttentionItems(
  evidenceDiff: EvidenceDeltaReport | undefined,
  searchAnalytics: SearchAnalyticsSignalReport | undefined,
  searchChanges: readonly SearchChangeOutcomeCohort[],
  pageFocus: readonly PageFocusReport[],
  discovery: DiscoverySiteReport | undefined,
  aiVisibility: AiVisibilitySiteReport | undefined,
): Omit<ServiceBriefAttentionItem, 'navigationOrder'>[] {
  const items: Omit<ServiceBriefAttentionItem, 'navigationOrder'>[] = [];

  for (const entry of evidenceDiff?.entries ?? []) {
    if (entry.state === 'unchanged') continue;
    items.push({
      id: `service-brief.attention:${hashJson({ moduleId: 'evidence_diff', cohortHash: entry.cohortHash, state: entry.state, baseline: entry.baselineObservationId, current: entry.currentObservationId })}`,
      moduleId: 'evidence_diff',
      originalKind: entry.state,
      originalState: entry.state,
      evidenceIdentity: entry.currentObservationId ?? entry.baselineObservationId ?? entry.cohortHash,
      identity: { cohortHash: entry.cohortHash },
      readinessContext: entry.reason === undefined ? [] : [entry.reason],
    });
  }

  for (const signal of searchAnalytics?.signals ?? []) {
    if (signal.kind === 'window_delta') continue;
    const pages = signal.cohort.page === undefined
      ? signal.cohort.pages?.map((entry) => entry.page) ?? []
      : [signal.cohort.page];
    items.push({
      id: `service-brief.attention:${hashJson({ moduleId: 'search_analytics', id: signal.id })}`,
      moduleId: 'search_analytics',
      originalKind: signal.kind,
      originalState: 'candidate',
      evidenceIdentity: signal.id,
      identity: {
        ...(pages.length === 1 ? { url: pages[0] } : {}),
        query: signal.cohort.query,
      },
      readinessContext: searchSignalReadinessContext(signal),
    });
  }

  for (const change of searchChanges) {
    if (change.readiness.state === 'ready_for_human_assessment') {
      items.push({
        id: `service-brief.attention:${hashJson({ moduleId: 'search_change', id: change.id })}`,
        moduleId: 'search_change',
        originalKind: 'search_change_outcome_cohort',
        originalState: change.readiness.state,
        evidenceIdentity: change.id,
        identity: { url: change.target.page, query: change.target.query },
        readinessContext: [],
      });
    }
  }

  for (const report of pageFocus) {
    if (report.state !== 'candidate') continue;
    items.push({
      id: `service-brief.attention:${hashJson({ moduleId: 'page_focus', id: report.id })}`,
      moduleId: 'page_focus',
      originalKind: 'page_focus_candidate',
      originalState: report.state,
      evidenceIdentity: report.id,
      identity: { url: report.page },
      readinessContext: [report.validationRequirement],
    });
  }

  for (const urlReport of discovery?.urls ?? []) {
    for (const finding of urlReport.findings) {
      if (!acceptedDiscoveryCandidateKinds.has(finding.kind)) continue;
      items.push({
        id: `service-brief.attention:${hashJson({ moduleId: 'discovery_diagnostics', reportId: urlReport.id, kind: finding.kind })}`,
        moduleId: 'discovery_diagnostics',
        originalKind: finding.kind,
        originalState: urlReport.state,
        evidenceIdentity: urlReport.id,
        identity: { url: urlReport.url },
        readinessContext: urlReport.readinessReasons,
      });
    }
  }

  for (const finding of aiVisibility?.concentrationFindings ?? []) {
    items.push({
      id: `service-brief.attention:${hashJson({ moduleId: 'ai_visibility', id: finding.id })}`,
      moduleId: 'ai_visibility',
      originalKind: finding.kind,
      originalState: 'candidate',
      evidenceIdentity: finding.id,
      identity: {},
      readinessContext: finding.context,
    });
  }
  for (const finding of aiVisibility?.crossSourceFindings ?? []) {
    items.push({
      id: `service-brief.attention:${hashJson({ moduleId: 'ai_visibility', id: finding.id })}`,
      moduleId: 'ai_visibility',
      originalKind: finding.kind,
      originalState: `${finding.bingState}_vs_${finding.zeroRankState}`,
      evidenceIdentity: finding.id,
      identity: {
        ...(finding.bingIdentity === undefined ? {} : { query: finding.bingIdentity }),
        ...(finding.zeroRankIdentity === undefined ? {} : { promptId: finding.zeroRankIdentity }),
      },
      readinessContext: [],
    });
  }

  const byId = new Map<string, Omit<ServiceBriefAttentionItem, 'navigationOrder'>>();
  for (const item of items) {
    const previous = byId.get(item.id);
    if (previous !== undefined && JSON.stringify(previous) !== JSON.stringify(item)) {
      fail('invalid_output', 'Conflicting Release 0.15 attention identities were produced.');
    }
    byId.set(item.id, item);
  }
  return [...byId.values()].sort((left, right) => {
    const module = moduleOrder.indexOf(left.moduleId) - moduleOrder.indexOf(right.moduleId);
    return module
      || asciiCompare(left.originalKind, right.originalKind)
      || asciiCompare(left.evidenceIdentity, right.evidenceIdentity)
      || asciiCompare(left.id, right.id);
  });
}

function buildAttentionRegister(
  policy: ServiceBriefPolicy,
  evidenceDiff: EvidenceDeltaReport | undefined,
  searchAnalytics: SearchAnalyticsSignalReport | undefined,
  searchChanges: readonly SearchChangeOutcomeCohort[],
  pageFocus: readonly PageFocusReport[],
  discovery: DiscoverySiteReport | undefined,
  aiVisibility: AiVisibilitySiteReport | undefined,
): ServiceBriefAttentionItem[] {
  const raw = rawAttentionItems(evidenceDiff, searchAnalytics, searchChanges, pageFocus, discovery, aiVisibility);
  if (raw.length > policy.maxAttentionItems) fail('bound_exceeded', 'Release 0.15 attention register exceeds the configured bound.');
  return raw.map((item, index) => ({ ...item, navigationOrder: index + 1 }));
}

function addUrlReference(
  index: Map<string, ServiceBriefUrlReference[]>,
  url: string,
  reference: ServiceBriefUrlReference,
): void {
  const list = index.get(url) ?? [];
  if (!list.some((entry) =>
    entry.moduleId === reference.moduleId
    && entry.kind === reference.kind
    && entry.evidenceIdentity === reference.evidenceIdentity)) {
    list.push(reference);
  }
  index.set(url, list);
}

function buildExactUrlIndex(
  policy: ServiceBriefPolicy,
  searchAnalytics: SearchAnalyticsSignalReport | undefined,
  searchChanges: readonly SearchChangeOutcomeCohort[],
  pageFocus: readonly PageFocusReport[],
  discovery: DiscoverySiteReport | undefined,
  aiVisibility: AiVisibilitySiteReport | undefined,
): ServiceBriefPageIndexEntry[] {
  const index = new Map<string, ServiceBriefUrlReference[]>();

  for (const signal of searchAnalytics?.signals ?? []) {
    if (signal.cohort.page !== undefined) {
      addUrlReference(index, signal.cohort.page, { moduleId: 'search_analytics', kind: signal.kind, evidenceIdentity: signal.id });
    }
    for (const page of signal.cohort.pages ?? []) {
      addUrlReference(index, page.page, { moduleId: 'search_analytics', kind: signal.kind, evidenceIdentity: signal.id });
    }
  }
  for (const change of searchChanges) {
    addUrlReference(index, change.target.page, { moduleId: 'search_change', kind: 'target_page', evidenceIdentity: change.id });
  }
  for (const report of pageFocus) {
    addUrlReference(index, report.page, { moduleId: 'page_focus', kind: report.state, evidenceIdentity: report.id });
  }
  for (const report of discovery?.urls ?? []) {
    addUrlReference(index, report.url, { moduleId: 'discovery_diagnostics', kind: 'url_report', evidenceIdentity: report.id });
    for (const finding of report.findings) {
      addUrlReference(index, report.url, { moduleId: 'discovery_diagnostics', kind: finding.kind, evidenceIdentity: report.id });
    }
  }
  for (const page of aiVisibility?.bing.pages ?? []) {
    addUrlReference(index, page.url, { moduleId: 'ai_visibility', kind: 'bing_cited_page', evidenceIdentity: page.rowIdentity });
  }
  for (const context of aiVisibility?.traditionalSearchContext ?? []) {
    addUrlReference(index, context.page, { moduleId: 'ai_visibility', kind: `traditional_search_${context.state}`, evidenceIdentity: aiVisibility!.id });
  }

  const urls = [...index.keys()].sort(asciiCompare);
  if (urls.length > policy.maxPageIndexEntries) fail('bound_exceeded', 'Release 0.15 exact-URL index exceeds the configured URL bound.');
  return urls.map((url) => {
    const references = index.get(url)!
      .sort((left, right) =>
        moduleOrder.indexOf(left.moduleId) - moduleOrder.indexOf(right.moduleId)
        || asciiCompare(left.kind, right.kind)
        || asciiCompare(left.evidenceIdentity, right.evidenceIdentity));
    if (references.length > policy.maxReferencesPerPage) {
      fail('bound_exceeded', 'Release 0.15 exact-URL index exceeds the configured per-page reference bound.');
    }
    return { url, references };
  });
}

function diffReadiness(
  baseline: Contract<'collection'>,
  current: Contract<'collection'>,
  report: EvidenceDeltaReport,
): ServiceBriefReadinessEntry {
  const states = [baseline.completeness.state, current.completeness.state];
  const reasons = [
    `baseline_coverage:${baseline.completeness.state}`,
    `current_coverage:${current.completeness.state}`,
    ...(report.summary.coverageUnknown === 0 ? [] : [`coverage_unknown_entries:${report.summary.coverageUnknown}`]),
  ];
  if (states.includes('unavailable')) return readiness('evidence_diff', 'unavailable', reasons);
  if (states.includes('failed')) return readiness('evidence_diff', 'not_ready', reasons);
  if (states.includes('partial') || report.summary.coverageUnknown > 0) return readiness('evidence_diff', 'limited', reasons);
  return readiness('evidence_diff', 'ready', reasons);
}

function searchChangeReadiness(reports: readonly SearchChangeOutcomeCohort[]): ServiceBriefReadinessEntry {
  if (reports.length === 0) return readiness('search_change', 'not_supplied');
  const notReady = reports.filter((report) => report.readiness.state === 'not_ready');
  const reasons = notReady.flatMap((report) => report.readiness.state === 'not_ready' ? report.readiness.reasons : []);
  if (notReady.length === reports.length) return readiness('search_change', 'not_ready', reasons);
  if (notReady.length > 0) return readiness('search_change', 'limited', reasons);
  return readiness('search_change', 'ready');
}

function pageFocusReadiness(reports: readonly PageFocusReport[]): ServiceBriefReadinessEntry {
  if (reports.length === 0) return readiness('page_focus', 'not_supplied');
  const notReady = reports.filter((report) => report.state === 'not_ready');
  const reasons = notReady.flatMap((report) => report.state === 'not_ready' ? report.reasons : []);
  if (notReady.length === reports.length) return readiness('page_focus', 'not_ready', reasons);
  if (notReady.length > 0) return readiness('page_focus', 'limited', reasons);
  return readiness('page_focus', 'ready');
}

function discoveryReadiness(report: DiscoverySiteReport | undefined): ServiceBriefReadinessEntry {
  if (report === undefined) return readiness('discovery_diagnostics', 'not_supplied');
  const notReady = report.providerReadiness.filter((entry) => entry.state === 'not_ready');
  const reasons = notReady.flatMap((entry) => entry.reasons.map((reason) => `${entry.providerId}:${reason}`));
  if (notReady.length === 0) return readiness('discovery_diagnostics', 'ready');
  if (notReady.length === report.providerReadiness.length
      && notReady.every((entry) => entry.reasons.includes('provider_unavailable'))) {
    return readiness('discovery_diagnostics', 'unavailable', reasons);
  }
  if (notReady.length === report.providerReadiness.length) return readiness('discovery_diagnostics', 'not_ready', reasons);
  return readiness('discovery_diagnostics', 'limited', reasons);
}

function aiReadiness(report: AiVisibilitySiteReport | undefined): ServiceBriefReadinessEntry {
  if (report === undefined) return readiness('ai_visibility', 'not_supplied');
  const reasons = report.readiness.flatMap((entry) => entry.reasons.map((reason) => `${entry.providerId}:${reason}`));
  if (report.readiness.every((entry) => entry.state === 'ready')) return readiness('ai_visibility', 'ready', reasons);
  if (report.readiness.every((entry) => entry.state === 'not_ready')) {
    return readiness(
      'ai_visibility',
      report.readiness.every((entry) => entry.reasons.includes('source_unavailable')) ? 'unavailable' : 'not_ready',
      reasons,
    );
  }
  return readiness('ai_visibility', 'limited', reasons);
}

function manifestIdentity(moduleId: ServiceBriefModuleId, semanticIds: readonly string[]): string {
  return `service-brief.manifest:${moduleId}:${hashJson([...semanticIds].sort(asciiCompare))}`;
}

function buildManifest(
  request: ParsedRequest,
  readinessEntries: readonly ServiceBriefReadinessEntry[],
  baselineCollection: Contract<'collection'> | undefined,
  currentCollection: Contract<'collection'> | undefined,
  history: ServiceBriefHistorySummary | undefined,
  searchWindow: ValidatedSearchAnalyticsWindow | undefined,
  searchReport: SearchAnalyticsSignalReport | undefined,
  searchChanges: readonly SearchChangeOutcomeCohort[],
  pageFocus: readonly PageFocusReport[],
  discovery: DiscoverySiteReport | undefined,
  aiVisibility: AiVisibilitySiteReport | undefined,
): ServiceBriefManifestEntry[] {
  const readinessByModule = new Map(readinessEntries.map((entry) => [entry.moduleId, entry] as const));
  const entries: ServiceBriefManifestEntry[] = [];
  const push = (
    moduleId: ServiceBriefModuleId,
    release: string,
    identity: string,
    providerIds: readonly string[],
    sourcePeriods: readonly Readonly<{ start: string; end: string }>[],
    evaluatedAt?: string,
    policy?: Readonly<{ id: string; version: string }>,
  ) => {
    const state = readinessByModule.get(moduleId)!;
    entries.push({
      moduleId,
      release,
      identity,
      providerIds: uniqueSorted(providerIds),
      scope: structuredClone(request.scope),
      target: request.trustedTarget,
      sourcePeriods: sourcePeriods.map((value) => structuredClone(value)),
      ...(evaluatedAt === undefined ? {} : { evaluatedAt }),
      readiness: state.state,
      reasons: state.reasons,
      ...(policy === undefined ? {} : { policy: structuredClone(policy) }),
    } as ServiceBriefManifestEntry);
  };

  if (baselineCollection !== undefined && currentCollection !== undefined) {
    push(
      'evidence_diff',
      '0.7',
      manifestIdentity('evidence_diff', [baselineCollection.id, currentCollection.id]),
      [baselineCollection.providerId, currentCollection.providerId],
      [baselineCollection.sourceTime, currentCollection.sourceTime],
    );
  }
  if (history !== undefined) {
    const recommendationDigest = hashJson(history.currentRecommendations.map((record) => record.id));
    const measurementDigest = hashJson(history.selectedHistories.flatMap((entry) => entry.measurements.map((record) => record.id)).sort(asciiCompare));
    const outcomeDigest = hashJson(history.selectedHistories.flatMap((entry) => entry.outcomes.map((record) => record.id)).sort(asciiCompare));
    push(
      'review_history',
      '0.8/0.9',
      manifestIdentity('review_history', [recommendationDigest, measurementDigest, outcomeDigest]),
      [],
      [],
    );
  }
  if (searchWindow !== undefined && searchReport !== undefined) {
    push(
      'search_analytics',
      '0.10',
      manifestIdentity('search_analytics', [
        searchReport.collectionPair.baselineCollectionId,
        searchReport.collectionPair.currentCollectionId,
        hashJson(searchReport.signals.map((signal) => signal.id)),
      ]),
      [searchWindow.collection.providerId],
      [searchWindow.collection.sourceTime],
      undefined,
      undefined,
    );
  }
  if (searchChanges.length > 0) {
    push(
      'search_change',
      '0.11',
      manifestIdentity('search_change', searchChanges.map((entry) => entry.id)),
      ['google-search-console'],
      searchChanges.map((entry) => entry.baseline.measurement.dueWindow),
      request.generatedAt,
    );
  }
  if (pageFocus.length > 0) {
    push(
      'page_focus',
      '0.12',
      manifestIdentity('page_focus', pageFocus.map((entry) => entry.id)),
      uniqueSorted(pageFocus.map((entry) => entry.source.providerId)),
      pageFocus.map((entry) => entry.source.period.effective),
      request.generatedAt,
    );
  }
  if (discovery !== undefined) {
    push(
      'discovery_diagnostics',
      '0.13',
      discovery.id,
      discovery.providers,
      discovery.providerReadiness.map((entry) => ({ start: entry.observedAt, end: entry.freshThrough })),
      discovery.evaluatedAt,
      { id: discovery.policy.id, version: discovery.policy.version },
    );
  }
  if (aiVisibility !== undefined) {
    push(
      'ai_visibility',
      '0.14',
      aiVisibility.id,
      ['bing-webmaster-ai-performance', 'zerorank'],
      [{ start: aiVisibility.bing.period.start, end: aiVisibility.bing.period.end }],
      aiVisibility.evaluatedAt,
      { id: aiVisibility.policy.id, version: aiVisibility.policy.version },
    );
  }
  return entries.sort((left, right) => moduleOrder.indexOf(left.moduleId) - moduleOrder.indexOf(right.moduleId));
}

function briefIdentity(
  request: ParsedRequest,
  readinessEntries: readonly ServiceBriefReadinessEntry[],
  manifest: readonly ServiceBriefManifestEntry[],
): string {
  const material = {
    algorithm: 'gas-service-brief-v1',
    version: SERVICE_BRIEF_VERSION,
    scope: request.scope,
    trustedTarget: request.trustedTarget,
    generatedAt: request.generatedAt,
    policy: request.policy,
    suppliedModules: moduleOrder.map((moduleId) => ({
      moduleId,
      state: readinessEntries.find((entry) => entry.moduleId === moduleId)?.state ?? 'not_supplied',
      identity: manifest.find((entry) => entry.moduleId === moduleId)?.identity ?? null,
    })),
    selectedRecommendationIds: [...(request.serviceHistory?.selectedRecommendationIds ?? [])].sort(asciiCompare),
  };
  return `service-brief:${hashCanonicalJson(material)}`;
}

function validatePlainOutput(value: ServiceBrief): void {
  let json: string;
  try {
    json = JSON.stringify(value);
    structuredClone(value);
  } catch {
    fail('invalid_output', 'Release 0.15 service brief is not cloneable plain JSON data.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_SERVICE_BRIEF_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.15 service brief exceeds the JSON output byte bound.');
  }
}

export function serializeServiceBriefJson(brief: ServiceBrief): string {
  let json: string;
  try {
    json = JSON.stringify(brief, null, 2) + '\n';
  } catch {
    fail('invalid_output', 'Release 0.15 service brief cannot be serialized as JSON.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_SERVICE_BRIEF_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.15 service brief JSON exceeds the output byte bound.');
  }
  return json;
}

/**
 * Compose the Release 0.15 service brief from accepted read/producers only.
 * This function performs no persistence mutation, tenant-authority issuance, provider
 * networking, action, recommendation creation, remediation, scheduling, or runtime AI.
 */
export async function assembleServiceBrief(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  input: unknown,
): Promise<ServiceBrief> {
  const request = parseRequest(input);

  let diff: EvidenceDeltaReport | undefined;
  let baselineCollection: Contract<'collection'> | undefined;
  let currentCollection: Contract<'collection'> | undefined;
  let diffReady = readiness('evidence_diff', 'not_supplied');
  if (request.evidenceDiff !== undefined) {
    diff = await diffEvidenceCollections(evidenceRepository, context, request.evidenceDiff);
    const baseline = await evidenceRepository.getCollection(context, request.evidenceDiff.baselineCollectionId);
    const current = await evidenceRepository.getCollection(context, request.evidenceDiff.currentCollectionId);
    if (baseline === null || current === null) fail('invalid_output', 'Accepted diff collections became unavailable during service-brief assembly.');
    if (!sameScope(baseline.scope, request.scope) || !sameScope(current.scope, request.scope)) {
      fail('scope_mismatch', 'Evidence diff collections are outside the requested Release 0.15 scope.');
    }
    baselineCollection = baseline;
    currentCollection = current;
    diffReady = diffReadiness(baseline, current, diff);
  }

  let history: ServiceBriefHistorySummary | undefined;
  let historyReady = readiness('review_history', 'not_supplied');
  if (request.serviceHistory !== undefined) {
    history = await serviceHistory(
      evidenceRepository,
      reviewRepository,
      context,
      request.scope,
      request.serviceHistory.selectedRecommendationIds,
    );
    historyReady = readiness('review_history', 'ready');
  }

  let searchReport: SearchAnalyticsSignalReport | undefined;
  let searchCurrentWindow: ValidatedSearchAnalyticsWindow | undefined;
  let searchReady = readiness('search_analytics', 'not_supplied');
  let searchCurrentInput: SearchAnalyticsAdaptationResult | undefined;
  if (request.searchAnalytics !== undefined) {
    const baselineInput = request.searchAnalytics.baseline as SearchAnalyticsAdaptationResult;
    const currentInput = request.searchAnalytics.current as SearchAnalyticsAdaptationResult;
    const baselineWindow = validateSearchAnalyticsWindow(baselineInput);
    const currentWindow = validateSearchAnalyticsWindow(currentInput);
    assertSearchWindowScopeAndTarget(baselineWindow, request.scope, request.trustedTarget);
    assertSearchWindowScopeAndTarget(currentWindow, request.scope, request.trustedTarget);
    searchReport = analyzeSearchAnalyticsSignals(
      baselineInput,
      currentInput,
      request.searchAnalytics.policy as SearchAnalyticsSignalPolicies,
    );
    searchCurrentWindow = currentWindow;
    searchCurrentInput = currentInput;
    const before = searchReadiness(baselineWindow);
    const after = searchReadiness(currentWindow);
    searchReady = readiness(
      'search_analytics',
      before.state === 'ready' && after.state === 'ready' ? 'ready' : 'limited',
      [...before.reasons.map((reason) => `baseline:${reason}`), ...after.reasons.map((reason) => `current:${reason}`)],
    );
  }

  const searchChanges = request.searchChanges
    .map((value) => composeSearchChangeOutcomeCohort(value))
    .sort((left, right) => asciiCompare(left.id, right.id));
  for (const report of searchChanges) {
    if (!sameScope(report.baseline.measurement.cohort.context.scope, request.scope)) {
      fail('scope_mismatch', 'Search Change evidence is outside the requested Release 0.15 scope.');
    }
    if (!pageMatchesTarget(report.target.page, request.trustedTarget)) {
      fail('target_mismatch', 'Search Change target page is outside the requested Release 0.15 target.');
    }
  }

  const pageFocus = request.pageFocus
    .map((value) => analyzePageFocusCandidate(value))
    .sort((left, right) => asciiCompare(left.id, right.id));
  for (const report of pageFocus) {
    if (!sameScope(report.source.scope, request.scope)) {
      fail('scope_mismatch', 'Page-Focus evidence is outside the requested Release 0.15 scope.');
    }
    if (!propertyMatchesTarget(report.source.property, request.trustedTarget)
        || !pageMatchesTarget(report.page, request.trustedTarget)) {
      fail('target_mismatch', 'Page-Focus evidence is outside the requested Release 0.15 target.');
    }
  }

  let discovery: DiscoverySiteReport | undefined;
  if (request.discoveryDiagnostics !== undefined) {
    const invocation = {
      ...request.discoveryDiagnostics,
      ...(request.discoveryDiagnostics.searchAnalytics === undefined && searchCurrentInput !== undefined
        ? { searchAnalytics: searchCurrentInput }
        : {}),
    };
    discovery = analyzeDiscoveryDiagnostics(invocation);
    if (!sameScope(discovery.scope, request.scope)) {
      fail('scope_mismatch', 'Discovery Diagnostics evidence is outside the requested Release 0.15 scope.');
    }
    if (discovery.trustedTarget !== request.trustedTarget) {
      fail('target_mismatch', 'Discovery Diagnostics evidence does not match the requested Release 0.15 target.');
    }
    if (discovery.urls.some((entry) => !pageMatchesTarget(entry.url, request.trustedTarget))) {
      fail('target_mismatch', 'Discovery Diagnostics URL is outside the requested Release 0.15 target.');
    }
  }

  let aiVisibility: AiVisibilitySiteReport | undefined;
  if (request.aiVisibility !== undefined) {
    const invocation = {
      ...request.aiVisibility,
      ...(searchCurrentInput === undefined ? {} : { searchAnalytics: searchCurrentInput }),
      ...(searchChanges[0] === undefined ? {} : { searchChange: searchChanges[0] }),
      ...(pageFocus[0] === undefined ? {} : { pageFocus: pageFocus[0] }),
    };
    aiVisibility = analyzeAiVisibility(invocation);
    if (!sameScope(aiVisibility.scope, request.scope)) {
      fail('scope_mismatch', 'AI Visibility evidence is outside the requested Release 0.15 scope.');
    }
    if (aiVisibility.trustedTarget !== request.trustedTarget) {
      fail('target_mismatch', 'AI Visibility evidence does not match the requested Release 0.15 target.');
    }
    if (aiVisibility.bing.pages.some((entry) => !pageMatchesTarget(entry.url, request.trustedTarget))) {
      fail('target_mismatch', 'AI Visibility page evidence is outside the requested Release 0.15 target.');
    }
  }

  const readinessEntries: ServiceBriefReadinessEntry[] = [
    diffReady,
    historyReady,
    searchReady,
    searchChangeReadiness(searchChanges),
    pageFocusReadiness(pageFocus),
    discoveryReadiness(discovery),
    aiReadiness(aiVisibility),
  ];

  const attentionRegister = buildAttentionRegister(
    request.policy,
    diff,
    searchReport,
    searchChanges,
    pageFocus,
    discovery,
    aiVisibility,
  );
  const exactUrlEvidenceIndex = buildExactUrlIndex(
    request.policy,
    searchReport,
    searchChanges,
    pageFocus,
    discovery,
    aiVisibility,
  );
  const provenanceManifest = buildManifest(
    request,
    readinessEntries,
    baselineCollection,
    currentCollection,
    history,
    searchCurrentWindow,
    searchReport,
    searchChanges,
    pageFocus,
    discovery,
    aiVisibility,
  );

  const output: ServiceBrief = {
    version: SERVICE_BRIEF_VERSION,
    id: briefIdentity(request, readinessEntries, provenanceManifest),
    scope: structuredClone(request.scope),
    trustedTarget: request.trustedTarget,
    generatedAt: request.generatedAt,
    policy: structuredClone(request.policy),
    readiness: readinessEntries,
    attentionRegister,
    exactUrlEvidenceIndex,
    ...(history === undefined ? {} : { serviceHistory: history }),
    modules: {
      ...(diff === undefined ? {} : { evidenceDiff: diff }),
      ...(searchReport === undefined ? {} : { searchAnalytics: searchReport }),
      searchChanges,
      pageFocus,
      ...(discovery === undefined ? {} : { discoveryDiagnostics: discovery }),
      ...(aiVisibility === undefined ? {} : { aiVisibility }),
    },
    provenanceManifest,
    limitations: [...limitations],
  };
  validatePlainOutput(output);
  return output;
}
