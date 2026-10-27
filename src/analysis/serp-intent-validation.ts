import { z } from 'zod';
import { identifier, shortText, timestamp, version } from '../contracts/primitives.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';

export const SERP_INTENT_PROFILE_VERSION = '0.23.0' as const;
export const SERP_INTENT_LIMITATIONS = Object.freeze([
  'SERP overlap is result-family evidence, not user-intent truth.',
  'Result-shape context is descriptive only and cannot determine profile state.',
  'The profile grants no split, merge, consolidation, redirect, canonical, content-creation, rewrite, or other page-change authority.',
  'Provider observations are accepted only as supplied evidence; this module performs no provider request, crawling, scraping, persistence, scheduling, or runtime AI.',
] as const);

const boundedQuery = z.string().min(1).max(512).regex(/\S/);
const boundedType = z.string().min(1).max(64).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const boundedUrl = z.string().min(1).max(2048).regex(/^https?:\/\//i);
const boundedDomain = z.string().min(1).max(253).regex(/^[A-Za-z0-9.-]+$/);
const positiveRank = z.number().int().min(1).max(1_000_000);
const boundedDepth = z.number().int().min(1).max(1_000);
const overlapThreshold = z.number().finite().min(0).max(1).refine((value) => !Object.is(value, -0));

const resultRowSchema = z.strictObject({
  type: boundedType,
  url: boundedUrl.optional(),
  sameTypeRank: positiveRank.optional(),
  absoluteRank: positiveRank.optional(),
  registrableDomain: boundedDomain.optional(),
});

const sourceSchema = z.strictObject({
  providerId: identifier,
  methodId: identifier,
  methodVersion: version,
  location: shortText,
  language: shortText,
  device: shortText,
  searchSurface: shortText,
  observedAt: timestamp,
  receivedAt: timestamp.optional(),
  sourceSchemaVersion: version,
  requestedDepth: boundedDepth,
  coverage: z.enum(['complete', 'partial', 'failed']),
  truncated: z.boolean(),
});

const snapshotSchema = z.strictObject({
  queryId: identifier,
  query: boundedQuery,
  source: sourceSchema,
  results: z.array(resultRowSchema).max(200),
});

const representativeSchema = z.strictObject({
  clusterId: identifier,
  queryId: identifier,
});

const selectionSchema = z.strictObject({
  id: identifier,
  version,
  upstreamPageFocusCandidateId: identifier.optional(),
  representatives: z.array(representativeSchema).min(2).max(12),
});

const comparabilitySchema = z.strictObject({
  provider: z.literal(true),
  method: z.literal(true),
  location: z.literal(true),
  language: z.literal(true),
  device: z.literal(true),
  searchSurface: z.literal(true),
  sourceSchemaVersion: z.literal(true),
});

const policySchema = z.strictObject({
  id: identifier,
  version,
  topK: z.number().int().min(1).max(20),
  minimumComparableQueryPairs: z.number().int().min(1).max(66),
  exactUrlOverlapSameFamilyThreshold: overlapThreshold,
  exactUrlOverlapDistinctFamilyThreshold: overlapThreshold,
  maximumCollectionTimeSkewSeconds: z.number().int().min(0).max(604_800),
  minimumBorderlineSnapshots: z.number().int().min(1).max(5),
  comparability: comparabilitySchema,
  urlComparison: z.literal('exact'),
  duplicateUrlPolicy: z.literal('dedupe_exact_only'),
  domainComparison: z.literal('supplied_registrable_domain'),
});

const invocationSchema = z.strictObject({
  selection: selectionSchema,
  policy: policySchema,
  snapshots: z.array(snapshotSchema).min(1).max(60),
});

export type SerpIntentPolicy = z.infer<typeof policySchema>;
export type SerpIntentSelection = z.infer<typeof selectionSchema>;
export type SerpSnapshot = z.infer<typeof snapshotSchema>;

export type SerpIntentState =
  | 'same_result_family_candidate'
  | 'distinct_result_family_candidate'
  | 'ambiguous'
  | 'not_ready';

export type SerpIntentNotReadyReason =
  | 'missing_serp_evidence'
  | 'failed_serp_evidence'
  | 'partial_serp_evidence'
  | 'truncated_serp_evidence'
  | 'query_not_in_selection'
  | 'query_text_inconsistent'
  | 'provider_mismatch'
  | 'method_mismatch'
  | 'location_mismatch'
  | 'language_mismatch'
  | 'device_mismatch'
  | 'search_surface_mismatch'
  | 'source_schema_mismatch'
  | 'collection_time_skew_exceeded'
  | 'insufficient_eligible_organic_depth'
  | 'incompatible_result_typing'
  | 'incompatible_organic_rank_semantics'
  | 'too_few_comparable_query_pairs'
  | 'snapshot_count_mismatch'
  | 'borderline_repeat_requirement_unmet';

export class SerpIntentValidationError extends Error {
  override name = 'SerpIntentValidationError';

  constructor(
    readonly code: 'invalid_input' | 'invalid_policy' | 'invalid_output',
    message: string,
  ) {
    super(message);
  }
}

export interface SerpResultShapeContext {
  readonly countsByType: Readonly<Record<string, number>>;
}

export interface SerpDomainOverlap {
  readonly available: boolean;
  readonly intersectionCount?: number;
  readonly unionCount?: number;
  readonly jaccard?: number;
  readonly sharedRegistrableDomains?: readonly string[];
  readonly reason?: 'registrable_domain_missing';
}

export interface SerpSnapshotComparison {
  readonly leftObservedAt: string;
  readonly rightObservedAt: string;
  readonly requestedDepth: {
    readonly left: number;
    readonly right: number;
  };
  readonly actualEligibleOrganicDepth: {
    readonly left: number;
    readonly right: number;
  };
  readonly organicOrdering: {
    readonly left: 'provider_same_type_rank' | 'provider_result_order';
    readonly right: 'provider_same_type_rank' | 'provider_result_order';
  };
  readonly exactUrlOverlap: {
    readonly intersectionCount: number;
    readonly unionCount: number;
    readonly jaccard: number;
    readonly sharedUrls: readonly string[];
    readonly leftTopKUrls: readonly string[];
    readonly rightTopKUrls: readonly string[];
  };
  readonly registrableDomainOverlap: SerpDomainOverlap;
  readonly resultShape: {
    readonly left: SerpResultShapeContext;
    readonly right: SerpResultShapeContext;
  };
  readonly state: Exclude<SerpIntentState, 'not_ready'>;
}

export interface SerpQueryPairComparison {
  readonly left: { readonly clusterId: string; readonly queryId: string; readonly query: string };
  readonly right: { readonly clusterId: string; readonly queryId: string; readonly query: string };
  readonly snapshots: readonly SerpSnapshotComparison[];
  readonly state: Exclude<SerpIntentState, 'not_ready'>;
}

interface SerpIntentProfileBase {
  readonly id: string;
  readonly methodologyVersion: typeof SERP_INTENT_PROFILE_VERSION;
  readonly selection: SerpIntentSelection;
  readonly policy: SerpIntentPolicy;
  readonly sourceContexts: readonly SerpSnapshot['source'][];
  readonly comparisons: readonly SerpQueryPairComparison[];
  readonly resultShapeContextIsDescriptiveOnly: true;
  readonly humanIntentReviewRequired: true;
  readonly noAutomaticPageChange: true;
  readonly limitations: typeof SERP_INTENT_LIMITATIONS;
}

export type SerpIntentValidationProfile = SerpIntentProfileBase & (
  | {
      readonly state: Exclude<SerpIntentState, 'not_ready'>;
      readonly reasons: readonly [];
    }
  | {
      readonly state: 'not_ready';
      readonly reasons: readonly SerpIntentNotReadyReason[];
    }
);

interface OrganicSelection {
  urls: string[];
  domains?: string[];
  actualEligibleDepth: number;
  ordering: 'provider_same_type_rank' | 'provider_result_order';
}

function fail(code: SerpIntentValidationError['code'], message: string): never {
  throw new SerpIntentValidationError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(asciiCompare);
}

function safeUrl(text: string): void {
  try {
    const parsed = new URL(text);
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) {
      fail('invalid_input', 'SERP result URLs must be credential-free HTTP(S) URLs.');
    }
  } catch (error) {
    if (error instanceof SerpIntentValidationError) throw error;
    fail('invalid_input', 'SERP result URLs must be valid absolute HTTP(S) URLs.');
  }
}

function parseInput(input: unknown): z.infer<typeof invocationSchema> {
  const parsed = invocationSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'SERP intent validation input is invalid.');
  if (parsed.data.policy.exactUrlOverlapDistinctFamilyThreshold
      >= parsed.data.policy.exactUrlOverlapSameFamilyThreshold) {
    fail('invalid_policy', 'Distinct-family threshold must be lower than same-family threshold to preserve an ambiguity band.');
  }
  for (const snapshot of parsed.data.snapshots) {
    for (const result of snapshot.results) {
      if (result.url !== undefined) safeUrl(result.url);
      if (result.registrableDomain !== undefined && result.registrableDomain !== result.registrableDomain.toLowerCase()) {
        fail('invalid_input', 'registrableDomain must be lowercase when supplied.');
      }
    }
  }
  try {
    canonicalJson(parsed.data);
  } catch {
    fail('invalid_input', 'SERP intent validation input must be bounded canonical data.');
  }
  return parsed.data;
}

function resultShape(snapshot: SerpSnapshot): SerpResultShapeContext {
  const counts = new Map<string, number>();
  for (const result of snapshot.results) counts.set(result.type, (counts.get(result.type) ?? 0) + 1);
  return {
    countsByType: Object.fromEntries([...counts.entries()].sort(([left], [right]) => asciiCompare(left, right))),
  };
}

function selectOrganic(snapshot: SerpSnapshot, topK: number): OrganicSelection | SerpIntentNotReadyReason {
  const resultRows = snapshot.results.map((row, index) => ({ row, index }));
  if (resultRows.some(({ row }) => row.type === 'organic' && row.url === undefined)) {
    return 'incompatible_result_typing';
  }

  const organic = resultRows.filter(({ row }) => row.type === 'organic');
  const anySameTypeRank = organic.some(({ row }) => row.sameTypeRank !== undefined);
  if (anySameTypeRank && organic.some(({ row }) => row.sameTypeRank === undefined)) {
    return 'incompatible_organic_rank_semantics';
  }
  if (anySameTypeRank) {
    const ranks = organic.map(({ row }) => row.sameTypeRank!);
    if (new Set(ranks).size !== ranks.length) return 'incompatible_organic_rank_semantics';
  }

  const ordered = [...organic].sort((left, right) => {
    if (anySameTypeRank) {
      const rank = left.row.sameTypeRank! - right.row.sameTypeRank!;
      if (rank !== 0) return rank;
      const urlOrder = asciiCompare(left.row.url!, right.row.url!);
      if (urlOrder !== 0) return urlOrder;
    }
    return left.index - right.index;
  });

  const selected: typeof ordered = [];
  const seen = new Set<string>();
  for (const candidate of ordered) {
    const url = candidate.row.url!;
    if (seen.has(url)) continue;
    seen.add(url);
    selected.push(candidate);
  }

  if (selected.length < topK) return 'insufficient_eligible_organic_depth';
  const top = selected.slice(0, topK);
  const domainsAvailable = top.every(({ row }) => row.registrableDomain !== undefined);
  return {
    urls: top.map(({ row }) => row.url!),
    ...(domainsAvailable ? { domains: top.map(({ row }) => row.registrableDomain!) } : {}),
    actualEligibleDepth: selected.length,
    ordering: anySameTypeRank ? 'provider_same_type_rank' : 'provider_result_order',
  };
}

function mismatchReasons(
  left: SerpSnapshot,
  right: SerpSnapshot,
  policy: SerpIntentPolicy,
): SerpIntentNotReadyReason[] {
  const reasons: SerpIntentNotReadyReason[] = [];
  if (left.source.providerId !== right.source.providerId) reasons.push('provider_mismatch');
  if (left.source.methodId !== right.source.methodId || left.source.methodVersion !== right.source.methodVersion) reasons.push('method_mismatch');
  if (left.source.location !== right.source.location) reasons.push('location_mismatch');
  if (left.source.language !== right.source.language) reasons.push('language_mismatch');
  if (left.source.device !== right.source.device) reasons.push('device_mismatch');
  if (left.source.searchSurface !== right.source.searchSurface) reasons.push('search_surface_mismatch');
  if (left.source.sourceSchemaVersion !== right.source.sourceSchemaVersion) reasons.push('source_schema_mismatch');
  const skewSeconds = Math.abs(Date.parse(left.source.observedAt) - Date.parse(right.source.observedAt)) / 1000;
  if (!Number.isFinite(skewSeconds) || skewSeconds > policy.maximumCollectionTimeSkewSeconds) {
    reasons.push('collection_time_skew_exceeded');
  }
  return reasons;
}

function snapshotReadiness(snapshot: SerpSnapshot): SerpIntentNotReadyReason[] {
  if (snapshot.source.coverage === 'failed') return ['failed_serp_evidence'];
  const reasons: SerpIntentNotReadyReason[] = [];
  if (snapshot.source.coverage === 'partial') reasons.push('partial_serp_evidence');
  if (snapshot.source.truncated) reasons.push('truncated_serp_evidence');
  return reasons;
}

function overlap(left: readonly string[], right: readonly string[]): {
  intersectionCount: number;
  unionCount: number;
  jaccard: number;
  shared: string[];
} {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const shared = uniqueSorted([...leftSet].filter((value) => rightSet.has(value)));
  const union = new Set([...leftSet, ...rightSet]);
  if (union.size === 0) fail('invalid_output', 'Comparable top-K URL sets cannot both be empty.');
  return {
    intersectionCount: shared.length,
    unionCount: union.size,
    jaccard: shared.length / union.size,
    shared,
  };
}

function classify(jaccard: number, policy: SerpIntentPolicy): Exclude<SerpIntentState, 'not_ready'> {
  if (jaccard >= policy.exactUrlOverlapSameFamilyThreshold) return 'same_result_family_candidate';
  if (jaccard <= policy.exactUrlOverlapDistinctFamilyThreshold) return 'distinct_result_family_candidate';
  return 'ambiguous';
}

function compareSnapshotPair(
  left: SerpSnapshot,
  right: SerpSnapshot,
  policy: SerpIntentPolicy,
): SerpSnapshotComparison | SerpIntentNotReadyReason[] {
  const readiness = [...snapshotReadiness(left), ...snapshotReadiness(right), ...mismatchReasons(left, right, policy)];
  if (readiness.length > 0) return uniqueSorted(readiness) as SerpIntentNotReadyReason[];

  const leftOrganic = selectOrganic(left, policy.topK);
  const rightOrganic = selectOrganic(right, policy.topK);
  if (typeof leftOrganic === 'string' || typeof rightOrganic === 'string') {
    const organicReasons: SerpIntentNotReadyReason[] = [];
    if (typeof leftOrganic === 'string') organicReasons.push(leftOrganic);
    if (typeof rightOrganic === 'string') organicReasons.push(rightOrganic);
    return uniqueSorted(organicReasons) as SerpIntentNotReadyReason[];
  }

  const exact = overlap(leftOrganic.urls, rightOrganic.urls);
  let registrableDomainOverlap: SerpDomainOverlap;
  if (leftOrganic.domains === undefined || rightOrganic.domains === undefined) {
    registrableDomainOverlap = { available: false, reason: 'registrable_domain_missing' };
  } else {
    const domains = overlap(uniqueSorted(leftOrganic.domains), uniqueSorted(rightOrganic.domains));
    registrableDomainOverlap = {
      available: true,
      intersectionCount: domains.intersectionCount,
      unionCount: domains.unionCount,
      jaccard: domains.jaccard,
      sharedRegistrableDomains: domains.shared,
    };
  }

  return {
    leftObservedAt: left.source.observedAt,
    rightObservedAt: right.source.observedAt,
    requestedDepth: { left: left.source.requestedDepth, right: right.source.requestedDepth },
    actualEligibleOrganicDepth: { left: leftOrganic.actualEligibleDepth, right: rightOrganic.actualEligibleDepth },
    organicOrdering: { left: leftOrganic.ordering, right: rightOrganic.ordering },
    exactUrlOverlap: {
      intersectionCount: exact.intersectionCount,
      unionCount: exact.unionCount,
      jaccard: exact.jaccard,
      sharedUrls: exact.shared,
      leftTopKUrls: [...leftOrganic.urls],
      rightTopKUrls: [...rightOrganic.urls],
    },
    registrableDomainOverlap,
    resultShape: { left: resultShape(left), right: resultShape(right) },
    state: classify(exact.jaccard, policy),
  };
}

function normalizedRepresentatives(selection: SerpIntentSelection): SerpIntentSelection['representatives'] {
  const sorted = [...selection.representatives].sort((left, right) => {
    const cluster = asciiCompare(left.clusterId, right.clusterId);
    return cluster !== 0 ? cluster : asciiCompare(left.queryId, right.queryId);
  });
  const queryIds = new Set<string>();
  for (const representative of sorted) {
    if (queryIds.has(representative.queryId)) fail('invalid_input', 'Representative query IDs must be unique.');
    queryIds.add(representative.queryId);
  }
  if (new Set(sorted.map((item) => item.clusterId)).size < 2) {
    fail('invalid_input', 'SERP intent validation requires representatives from at least two clusters.');
  }
  return sorted;
}

function snapshotStableKey(snapshot: SerpSnapshot): string {
  return `${snapshot.source.observedAt}:${hashCanonicalJson(snapshot)}`;
}

function buildBase(
  input: z.infer<typeof invocationSchema>,
  representatives: SerpIntentSelection['representatives'],
  comparisons: SerpQueryPairComparison[],
  sourceContexts: SerpSnapshot['source'][],
): SerpIntentProfileBase {
  const normalizedSelection: SerpIntentSelection = {
    id: input.selection.id,
    version: input.selection.version,
    ...(input.selection.upstreamPageFocusCandidateId === undefined
      ? {}
      : { upstreamPageFocusCandidateId: input.selection.upstreamPageFocusCandidateId }),
    representatives,
  };
  const identityComparisons = comparisons.map((pair) => ({
    left: pair.left,
    right: pair.right,
    snapshots: pair.snapshots.map((snapshot) => ({
      leftObservedAt: snapshot.leftObservedAt,
      rightObservedAt: snapshot.rightObservedAt,
      exactUrlOverlap: snapshot.exactUrlOverlap,
      registrableDomainOverlap: snapshot.registrableDomainOverlap,
    })),
  }));
  const id = `gas.serp-intent:${hashCanonicalJson({
    algorithm: 'gas-serp-intent-validation-v1',
    methodologyVersion: SERP_INTENT_PROFILE_VERSION,
    selection: normalizedSelection,
    policy: input.policy,
    sourceContexts,
    comparisons: identityComparisons,
  })}`;
  return {
    id,
    methodologyVersion: SERP_INTENT_PROFILE_VERSION,
    selection: normalizedSelection,
    policy: structuredClone(input.policy),
    sourceContexts,
    comparisons,
    resultShapeContextIsDescriptiveOnly: true,
    humanIntentReviewRequired: true,
    noAutomaticPageChange: true,
    limitations: SERP_INTENT_LIMITATIONS,
  };
}

/**
 * Pure/local Release 0.23 SERP Intent Validation Profile.
 * Consumes already-sanitized caller-supplied SERP snapshots only. It performs no
 * provider/network access, crawling, scraping, persistence, scheduling, runtime AI,
 * recommendation creation, or page/content action.
 */
export function validateSerpIntentProfile(inputValue: unknown): SerpIntentValidationProfile {
  const input = parseInput(inputValue);
  const representatives = normalizedRepresentatives(input.selection);
  const selectedIds = new Set(representatives.map((item) => item.queryId));
  const reasons = new Set<SerpIntentNotReadyReason>();
  const snapshotsByQuery = new Map<string, SerpSnapshot[]>();

  for (const snapshot of input.snapshots) {
    if (!selectedIds.has(snapshot.queryId)) {
      reasons.add('query_not_in_selection');
      continue;
    }
    const values = snapshotsByQuery.get(snapshot.queryId) ?? [];
    values.push(snapshot);
    snapshotsByQuery.set(snapshot.queryId, values);
  }

  for (const representative of representatives) {
    const snapshots = snapshotsByQuery.get(representative.queryId);
    if (snapshots === undefined || snapshots.length === 0) reasons.add('missing_serp_evidence');
  }

  for (const [queryId, snapshots] of snapshotsByQuery) {
    const queries = new Set(snapshots.map((snapshot) => snapshot.query));
    if (queries.size > 1) reasons.add('query_text_inconsistent');
    snapshots.sort((left, right) => asciiCompare(snapshotStableKey(left), snapshotStableKey(right)));
    snapshotsByQuery.set(queryId, snapshots);
  }

  const comparisons: SerpQueryPairComparison[] = [];
  for (let leftIndex = 0; leftIndex < representatives.length; leftIndex += 1) {
    const leftRef = representatives[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < representatives.length; rightIndex += 1) {
      const rightRef = representatives[rightIndex]!;
      if (leftRef.clusterId === rightRef.clusterId) continue;
      const leftSnapshots = snapshotsByQuery.get(leftRef.queryId) ?? [];
      const rightSnapshots = snapshotsByQuery.get(rightRef.queryId) ?? [];
      if (leftSnapshots.length === 0 || rightSnapshots.length === 0) continue;
      if (leftSnapshots.length !== rightSnapshots.length) {
        reasons.add('snapshot_count_mismatch');
        continue;
      }

      const snapshotComparisons: SerpSnapshotComparison[] = [];
      for (let index = 0; index < leftSnapshots.length; index += 1) {
        const compared = compareSnapshotPair(leftSnapshots[index]!, rightSnapshots[index]!, input.policy);
        if (Array.isArray(compared)) {
          for (const reason of compared) reasons.add(reason);
        } else {
          snapshotComparisons.push(compared);
        }
      }
      if (snapshotComparisons.length !== leftSnapshots.length) continue;

      const states = new Set(snapshotComparisons.map((snapshot) => snapshot.state));
      const pairState: Exclude<SerpIntentState, 'not_ready'> = states.size === 1
        ? snapshotComparisons[0]!.state
        : 'ambiguous';
      if (pairState === 'ambiguous' && snapshotComparisons.length < input.policy.minimumBorderlineSnapshots) {
        reasons.add('borderline_repeat_requirement_unmet');
      }

      comparisons.push({
        left: { clusterId: leftRef.clusterId, queryId: leftRef.queryId, query: leftSnapshots[0]!.query },
        right: { clusterId: rightRef.clusterId, queryId: rightRef.queryId, query: rightSnapshots[0]!.query },
        snapshots: snapshotComparisons,
        state: pairState,
      });
    }
  }

  comparisons.sort((left, right) => {
    const leftKey = `${left.left.clusterId}:${left.left.queryId}:${left.right.clusterId}:${left.right.queryId}`;
    const rightKey = `${right.left.clusterId}:${right.left.queryId}:${right.right.clusterId}:${right.right.queryId}`;
    return asciiCompare(leftKey, rightKey);
  });
  if (comparisons.length < input.policy.minimumComparableQueryPairs) reasons.add('too_few_comparable_query_pairs');

  const sourceContexts = input.snapshots
    .filter((snapshot) => selectedIds.has(snapshot.queryId))
    .sort((left, right) => {
      const query = asciiCompare(left.queryId, right.queryId);
      return query !== 0 ? query : asciiCompare(snapshotStableKey(left), snapshotStableKey(right));
    })
    .map((snapshot) => structuredClone(snapshot.source));

  const base = buildBase(input, representatives, comparisons, sourceContexts);
  if (reasons.size > 0) {
    return {
      ...base,
      state: 'not_ready',
      reasons: uniqueSorted(reasons) as SerpIntentNotReadyReason[],
    };
  }

  const states = new Set(comparisons.map((comparison) => comparison.state));
  const state: Exclude<SerpIntentState, 'not_ready'> = states.size === 1
    ? comparisons[0]!.state
    : 'ambiguous';
  return { ...base, state, reasons: [] };
}
