import { z } from 'zod';
import { identifier, version as versionSchema } from '../contracts/primitives.js';
import type { Contract } from '../contracts/wire.js';
import {
  SEARCH_ANALYTICS_ADAPTER_ID,
  SEARCH_ANALYTICS_MAPPING_VERSION,
  SEARCH_ANALYTICS_MAX_ROWS,
  SEARCH_ANALYTICS_METRIC_SPECS,
  SEARCH_ANALYTICS_PROVIDER_ID,
  SEARCH_ANALYTICS_SOURCE_SCHEMA_ID,
  SEARCH_ANALYTICS_SOURCE_SCHEMA_VERSION,
  searchAnalyticsCohortId,
  searchAnalyticsDimensionIdentity,
  searchAnalyticsMethod,
  type SearchAnalyticsAdaptationResult,
  type SearchAnalyticsAdaptedRow,
  type SearchAnalyticsCoverage,
  type SearchAnalyticsFreshness,
  type SearchAnalyticsMetricKey,
  type SearchAnalyticsSemantics,
} from '../adapters/search-analytics.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import { parseCollectionBatch } from '../persistence/validation.js';

const METRIC_KEYS = ['clicks', 'impressions', 'ctr', 'averagePosition'] as const satisfies readonly SearchAnalyticsMetricKey[];

export type SearchAnalyticsSignalKind =
  | 'window_delta'
  | 'striking_distance_candidate'
  | 'decay_candidate'
  | 'ctr_opportunity_candidate'
  | 'query_page_overlap_candidate';

export type SearchAnalyticsSignalErrorCode =
  | 'invalid_input'
  | 'invalid_window'
  | 'incompatible_windows';

export class SearchAnalyticsSignalError extends Error {
  override name = 'SearchAnalyticsSignalError';

  constructor(
    readonly code: SearchAnalyticsSignalErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const policyBase = {
  id: identifier,
  version: versionSchema,
};

const strikingDistancePolicySchema = z.strictObject({
  ...policyBase,
  minimumAveragePosition: z.number().min(0).max(1e15),
  maximumAveragePosition: z.number().min(0).max(1e15),
  minimumImpressions: z.number().int().min(0).max(1e15),
}).superRefine((policy, context) => {
  if (policy.minimumAveragePosition > policy.maximumAveragePosition) {
    context.addIssue({ code: 'custom', message: 'minimumAveragePosition must not exceed maximumAveragePosition.' });
  }
});

const decayPolicySchema = z.strictObject({
  ...policyBase,
  metric: z.enum(['clicks', 'impressions']),
  minimumBaseline: z.number().positive().max(1e15),
  maximumCurrentToBaselineRatio: z.number().min(0).max(1),
});

const ctrOpportunityPolicySchema = z.strictObject({
  ...policyBase,
  minimumAveragePosition: z.number().min(0).max(1e15),
  maximumAveragePosition: z.number().min(0).max(1e15),
  minimumImpressions: z.number().int().min(0).max(1e15),
  maximumCtr: z.number().min(0).max(1),
}).superRefine((policy, context) => {
  if (policy.minimumAveragePosition > policy.maximumAveragePosition) {
    context.addIssue({ code: 'custom', message: 'minimumAveragePosition must not exceed maximumAveragePosition.' });
  }
});

const overlapPolicySchema = z.strictObject({
  ...policyBase,
  minimumImpressions: z.number().int().min(0).max(1e15),
});

const policiesSchema = z.strictObject({
  strikingDistance: strikingDistancePolicySchema,
  decay: decayPolicySchema,
  ctrOpportunity: ctrOpportunityPolicySchema,
  overlap: overlapPolicySchema,
});

export type SearchAnalyticsSignalPolicies = z.infer<typeof policiesSchema>;

export interface SearchAnalyticsSignalEvidenceRef {
  readonly collectionId: string;
  readonly sourceRecordId: string;
  readonly observationIds: readonly [string, string, string, string];
}

export interface SearchAnalyticsSignal {
  readonly id: string;
  readonly kind: SearchAnalyticsSignalKind;
  readonly providerId: typeof SEARCH_ANALYTICS_PROVIDER_ID;
  readonly cohort: {
    readonly query: string;
    readonly queryId: string;
    readonly searchType: 'web';
    readonly page?: string;
    readonly pageId?: string;
    readonly pages?: readonly { page: string; pageId: string }[];
  };
  readonly periods: {
    readonly baseline?: { requested: SearchAnalyticsSemantics['requestedWindow']; effective: SearchAnalyticsSemantics['effectiveWindow'] };
    readonly current: { requested: SearchAnalyticsSemantics['requestedWindow']; effective: SearchAnalyticsSemantics['effectiveWindow'] };
  };
  readonly freshness: {
    readonly baseline?: SearchAnalyticsFreshness;
    readonly current: SearchAnalyticsFreshness;
  };
  readonly coverage: {
    readonly baseline?: SearchAnalyticsCoverage;
    readonly current: SearchAnalyticsCoverage;
  };
  readonly metricUnits: Readonly<Record<SearchAnalyticsMetricKey, string>>;
  readonly policy: {
    readonly id: string;
    readonly version: string;
    readonly thresholds: Readonly<Record<string, string | number>>;
  };
  readonly values: Readonly<Record<string, number>>;
  readonly provenance: {
    readonly baseline?: SearchAnalyticsSignalEvidenceRef;
    readonly current: SearchAnalyticsSignalEvidenceRef | readonly SearchAnalyticsSignalEvidenceRef[];
  };
}

export interface SearchAnalyticsSignalReport {
  readonly collectionPair: {
    readonly baselineCollectionId: string;
    readonly currentCollectionId: string;
  };
  readonly unmatched: {
    readonly baselineOnly: number;
    readonly currentOnly: number;
    readonly absenceSignalsEmitted: false;
  };
  readonly signals: readonly SearchAnalyticsSignal[];
}

interface ValidatedRow {
  readonly sidecar: SearchAnalyticsAdaptedRow;
  readonly metrics: Readonly<Record<SearchAnalyticsMetricKey, number>>;
  readonly evidence: SearchAnalyticsSignalEvidenceRef;
}

interface ValidatedWindow {
  readonly collection: Contract<'collection'>;
  readonly semantics: SearchAnalyticsSemantics;
  readonly rows: readonly ValidatedRow[];
}

function fail(code: SearchAnalyticsSignalErrorCode, message: string): never {
  throw new SearchAnalyticsSignalError(code, message);
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function durationSeconds(window: Readonly<{ start: string; end: string }>): number {
  return (new Date(window.end).getTime() - new Date(window.start).getTime()) / 1_000;
}

function parsePolicies(input: SearchAnalyticsSignalPolicies): SearchAnalyticsSignalPolicies {
  try {
    canonicalJson(input);
  } catch {
    fail('invalid_input', 'Search-analytics signal policies must be bounded plain canonical data.');
  }
  const parsed = policiesSchema.safeParse(input);
  if (!parsed.success) fail('invalid_input', 'Search-analytics signal policies are invalid.');
  return parsed.data;
}

function expectedCompleteness(semantics: SearchAnalyticsSemantics, rowCount: number): Contract<'collection'>['completeness'] {
  if (semantics.coverage.state === 'complete' && semantics.freshness.dataState === 'final') {
    return { state: 'complete', expectedCount: rowCount, receivedCount: rowCount };
  }
  return {
    state: 'partial',
    receivedCount: rowCount,
    reason: 'Search-analytics evidence is preliminary, partial, or coverage-unknown; unmatched row absence is not proven.',
  };
}

function validateWindow(input: SearchAnalyticsAdaptationResult): ValidatedWindow {
  if (input.providerId !== SEARCH_ANALYTICS_PROVIDER_ID
      || input.rows.length > SEARCH_ANALYTICS_MAX_ROWS
      || input.batches.length < 1
      || input.batches.length > 64) {
    fail('invalid_window', 'Search-analytics adapted window has invalid bounded metadata.');
  }

  const parsedBatches = input.batches.map((batch) => {
    try {
      return parseCollectionBatch(batch);
    } catch {
      fail('invalid_window', 'Search-analytics adapted batch is not valid canonical evidence.');
    }
  }).sort((left, right) => left.part - right.part);

  const first = parsedBatches[0]!;
  if (first.collection.id !== input.collectionId || first.idempotencyKey !== input.idempotencyKey) {
    fail('invalid_window', 'Search-analytics adapted identifiers do not match canonical batches.');
  }
  for (let index = 0; index < parsedBatches.length; index++) {
    const batch = parsedBatches[index]!;
    if (batch.part !== index + 1
        || batch.parts !== parsedBatches.length
        || batch.idempotencyKey !== input.idempotencyKey
        || !same(batch.collection, first.collection)) {
      fail('invalid_window', 'Search-analytics adapted batches are incomplete or inconsistent.');
    }
  }

  const collection = first.collection;
  const expectedMethod = searchAnalyticsMethod(
    input.semantics.searchType,
    input.semantics.dimensions,
    input.semantics.filterGroupType,
    input.semantics.filters,
  );
  const expectedAdapter = { id: SEARCH_ANALYTICS_ADAPTER_ID, version: SEARCH_ANALYTICS_MAPPING_VERSION };
  const expectedSourceSchema = { id: SEARCH_ANALYTICS_SOURCE_SCHEMA_ID, version: SEARCH_ANALYTICS_SOURCE_SCHEMA_VERSION };
  if (collection.providerId !== SEARCH_ANALYTICS_PROVIDER_ID
      || !Object.hasOwn(collection, 'providerConnectionId')
      || !same(collection.adapter, expectedAdapter)
      || !same(collection.sourceSchema, expectedSourceSchema)
      || !same(collection.method, expectedMethod)
      || !same(collection.sourceTime, input.semantics.effectiveWindow)
      || !same(collection.completeness, expectedCompleteness(input.semantics, input.rows.length))) {
    fail('invalid_window', 'Search-analytics canonical collection does not match adapted semantics.');
  }

  const sources = new Map<string, (typeof first.sources)[number]['record']>();
  const observations = new Map<string, { sourceId: string; record: Contract<'observation'> }>();
  for (const batch of parsedBatches) {
    for (const source of batch.sources) {
      if (sources.has(source.id)) fail('invalid_window', 'Search-analytics adapted source IDs must be unique.');
      sources.set(source.id, source.record);
    }
    for (const observation of batch.observations) {
      if (observations.has(observation.record.id)) fail('invalid_window', 'Search-analytics observation IDs must be unique.');
      observations.set(observation.record.id, observation);
    }
  }
  if (sources.size !== input.rows.length || observations.size !== input.rows.length * 4) {
    fail('invalid_window', 'Search-analytics row/source/observation cardinality is inconsistent.');
  }

  const sortedRows = [...input.rows].sort((left, right) => {
    if (left.query !== right.query) return left.query < right.query ? -1 : 1;
    if (left.page !== right.page) return left.page < right.page ? -1 : 1;
    return 0;
  });
  if (!same(sortedRows, input.rows)) {
    fail('invalid_window', 'Search-analytics adapted row ordering is not canonical.');
  }

  const seenRows = new Set<string>();
  const validatedRows: ValidatedRow[] = input.rows.map((row) => {
    if (row.searchType !== 'web') fail('invalid_window', 'Search-analytics row search type is unsupported.');
    const expectedDimensions = searchAnalyticsDimensionIdentity(row.query, row.page, row.searchType);
    if (row.rowIdentity !== expectedDimensions.rowIdentity
        || row.queryId !== expectedDimensions.queryId
        || row.pageId !== expectedDimensions.pageId
        || row.sourceRecordId !== expectedDimensions.rowIdentity
        || seenRows.has(row.rowIdentity)) {
      fail('invalid_window', 'Search-analytics row identity is invalid or duplicated.');
    }
    seenRows.add(row.rowIdentity);

    const source = sources.get(row.sourceId);
    if (source === undefined || source.identity.sourceRecordId !== row.sourceRecordId) {
      fail('invalid_window', 'Search-analytics row source reference cannot be reconstructed.');
    }

    const metrics: Record<SearchAnalyticsMetricKey, number> = {
      clicks: 0,
      impressions: 0,
      ctr: 0,
      averagePosition: 0,
    };
    const observationIds: string[] = [];
    for (const metricKey of METRIC_KEYS) {
      const observationId = row.observationIds[metricKey];
      const resolved = observations.get(observationId);
      const spec = SEARCH_ANALYTICS_METRIC_SPECS[metricKey];
      if (resolved === undefined
          || resolved.sourceId !== row.sourceId
          || resolved.record.provenance.source.sourceRecordId !== row.sourceRecordId
          || resolved.record.cohort.id !== searchAnalyticsCohortId(row.query, row.page, row.searchType, spec.id)
          || resolved.record.cohort.context.subject.kind !== 'page'
          || resolved.record.cohort.context.subject.reference !== row.pageId
          || resolved.record.cohort.context.dimensions.surface !== expectedDimensions.querySurface
          || resolved.record.cohort.context.dimensions.configuration?.id !== 'gsc-search-type'
          || resolved.record.cohort.context.dimensions.configuration?.version !== 'web'
          || resolved.record.cohort.context.metric.id !== spec.id
          || resolved.record.cohort.context.metric.unit !== spec.unit
          || resolved.record.cohort.context.metric.valueType !== 'number'
          || !same(resolved.record.cohort.context.method, collection.method)
          || resolved.record.value.state !== 'observed'
          || resolved.record.value.value.type !== 'number') {
        fail('invalid_window', 'Search-analytics canonical observation cannot be reconstructed from row identity.');
      }
      metrics[metricKey] = resolved.record.value.value.value;
      observationIds.push(observationId);
    }

    return {
      sidecar: row,
      metrics,
      evidence: {
        collectionId: collection.id,
        sourceRecordId: row.sourceRecordId,
        observationIds: observationIds as [string, string, string, string],
      },
    };
  });

  return { collection, semantics: input.semantics, rows: validatedRows };
}

function coverageCompatibility(value: SearchAnalyticsCoverage): unknown {
  return {
    state: value.state,
    truncated: value.truncated,
    anonymized: value.anonymized,
  };
}

function requireCompatible(baseline: ValidatedWindow, current: ValidatedWindow): void {
  if (baseline.collection.id === current.collection.id) {
    fail('incompatible_windows', 'Baseline and current search-analytics collections must be distinct.');
  }
  const sameStream = same(baseline.collection.scope, current.collection.scope)
    && baseline.collection.providerId === current.collection.providerId
    && baseline.collection.providerConnectionId === current.collection.providerConnectionId
    && same(baseline.collection.adapter, current.collection.adapter)
    && same(baseline.collection.sourceSchema, current.collection.sourceSchema)
    && same(baseline.collection.method, current.collection.method)
    && baseline.semantics.property === current.semantics.property
    && baseline.semantics.searchType === current.semantics.searchType
    && same(baseline.semantics.dimensions, current.semantics.dimensions)
    && baseline.semantics.filterGroupType === current.semantics.filterGroupType
    && same(baseline.semantics.filters, current.semantics.filters)
    && baseline.semantics.freshness.dataState === current.semantics.freshness.dataState
    && same(coverageCompatibility(baseline.semantics.coverage), coverageCompatibility(current.semantics.coverage))
    && durationSeconds(baseline.semantics.requestedWindow) === durationSeconds(current.semantics.requestedWindow)
    && durationSeconds(baseline.semantics.effectiveWindow) === durationSeconds(current.semantics.effectiveWindow);
  if (!sameStream) {
    fail('incompatible_windows', 'Baseline and current search-analytics windows do not have exact compatible semantics.');
  }
  if (baseline.semantics.effectiveWindow.start > current.semantics.effectiveWindow.start
      || baseline.semantics.effectiveWindow.end > current.semantics.effectiveWindow.end
      || (baseline.semantics.effectiveWindow.start === current.semantics.effectiveWindow.start
        && baseline.semantics.effectiveWindow.end === current.semantics.effectiveWindow.end)) {
    fail('incompatible_windows', 'Baseline/current search-analytics window chronology is invalid.');
  }
}

function period(semantics: SearchAnalyticsSemantics): {
  requested: SearchAnalyticsSemantics['requestedWindow'];
  effective: SearchAnalyticsSemantics['effectiveWindow'];
} {
  return { requested: semantics.requestedWindow, effective: semantics.effectiveWindow };
}

const metricUnits: Readonly<Record<SearchAnalyticsMetricKey, string>> = Object.freeze({
  clicks: SEARCH_ANALYTICS_METRIC_SPECS.clicks.unit,
  impressions: SEARCH_ANALYTICS_METRIC_SPECS.impressions.unit,
  ctr: SEARCH_ANALYTICS_METRIC_SPECS.ctr.unit,
  averagePosition: SEARCH_ANALYTICS_METRIC_SPECS.averagePosition.unit,
});

function delta(current: number, baseline: number): number {
  const value = current - baseline;
  return Object.is(value, -0) ? 0 : value;
}

function signalId(material: unknown): string {
  return `gsc.signal:${hashCanonicalJson(material)}`;
}

function baseSignal(
  kind: SearchAnalyticsSignalKind,
  row: ValidatedRow,
  current: ValidatedWindow,
  policy: SearchAnalyticsSignal['policy'],
  values: Readonly<Record<string, number>>,
  baseline?: ValidatedWindow,
  baselineRow?: ValidatedRow,
): SearchAnalyticsSignal {
  const identityMaterial = {
    kind,
    baselineCollectionId: baseline?.collection.id,
    currentCollectionId: current.collection.id,
    rowIdentity: row.sidecar.rowIdentity,
    policy,
  };
  return {
    id: signalId(identityMaterial),
    kind,
    providerId: SEARCH_ANALYTICS_PROVIDER_ID,
    cohort: {
      query: row.sidecar.query,
      queryId: row.sidecar.queryId,
      searchType: 'web',
      page: row.sidecar.page,
      pageId: row.sidecar.pageId,
    },
    periods: {
      ...(baseline === undefined ? {} : { baseline: period(baseline.semantics) }),
      current: period(current.semantics),
    },
    freshness: {
      ...(baseline === undefined ? {} : { baseline: baseline.semantics.freshness }),
      current: current.semantics.freshness,
    },
    coverage: {
      ...(baseline === undefined ? {} : { baseline: baseline.semantics.coverage }),
      current: current.semantics.coverage,
    },
    metricUnits,
    policy,
    values,
    provenance: {
      ...(baselineRow === undefined ? {} : { baseline: baselineRow.evidence }),
      current: row.evidence,
    },
  };
}

function policy(
  id: string,
  version: string,
  thresholds: Readonly<Record<string, string | number>>,
): SearchAnalyticsSignal['policy'] {
  return { id, version, thresholds };
}

const kindOrder: Readonly<Record<SearchAnalyticsSignalKind, number>> = Object.freeze({
  window_delta: 0,
  striking_distance_candidate: 1,
  decay_candidate: 2,
  ctr_opportunity_candidate: 3,
  query_page_overlap_candidate: 4,
});

/**
 * Deterministically derive the Release 0.10 mechanical signal pack from two already-adapted
 * compatible search-analytics windows. This function performs no repository access, writes,
 * provider calls, scheduling, ranking, recommendation generation, or runtime AI.
 */
export function analyzeSearchAnalyticsSignals(
  baselineInput: SearchAnalyticsAdaptationResult,
  currentInput: SearchAnalyticsAdaptationResult,
  policyInput: SearchAnalyticsSignalPolicies,
): SearchAnalyticsSignalReport {
  const policies = parsePolicies(policyInput);
  const baseline = validateWindow(baselineInput);
  const current = validateWindow(currentInput);
  requireCompatible(baseline, current);

  const baselineRows = new Map(baseline.rows.map((row) => [row.sidecar.rowIdentity, row] as const));
  const currentRows = new Map(current.rows.map((row) => [row.sidecar.rowIdentity, row] as const));
  const signals: SearchAnalyticsSignal[] = [];

  const matched = [...currentRows.keys()].filter((key) => baselineRows.has(key)).sort();
  for (const key of matched) {
    const before = baselineRows.get(key)!;
    const after = currentRows.get(key)!;
    signals.push(baseSignal(
      'window_delta',
      after,
      current,
      policy('ldw-search-window-delta', SEARCH_ANALYTICS_MAPPING_VERSION, {}),
      {
        clicksDelta: delta(after.metrics.clicks, before.metrics.clicks),
        impressionsDelta: delta(after.metrics.impressions, before.metrics.impressions),
        ctrDelta: delta(after.metrics.ctr, before.metrics.ctr),
        averagePositionDelta: delta(after.metrics.averagePosition, before.metrics.averagePosition),
      },
      baseline,
      before,
    ));

    const baselineMetric = before.metrics[policies.decay.metric];
    const currentMetric = after.metrics[policies.decay.metric];
    const ratio = currentMetric / baselineMetric;
    if (baselineMetric >= policies.decay.minimumBaseline
        && ratio <= policies.decay.maximumCurrentToBaselineRatio) {
      signals.push(baseSignal(
        'decay_candidate',
        after,
        current,
        policy(policies.decay.id, policies.decay.version, {
          metric: policies.decay.metric,
          minimumBaseline: policies.decay.minimumBaseline,
          maximumCurrentToBaselineRatio: policies.decay.maximumCurrentToBaselineRatio,
        }),
        {
          baselineValue: baselineMetric,
          currentValue: currentMetric,
          currentToBaselineRatio: ratio,
        },
        baseline,
        before,
      ));
    }
  }

  for (const after of current.rows) {
    if (after.metrics.averagePosition >= policies.strikingDistance.minimumAveragePosition
        && after.metrics.averagePosition <= policies.strikingDistance.maximumAveragePosition
        && after.metrics.impressions >= policies.strikingDistance.minimumImpressions) {
      signals.push(baseSignal(
        'striking_distance_candidate',
        after,
        current,
        policy(policies.strikingDistance.id, policies.strikingDistance.version, {
          minimumAveragePosition: policies.strikingDistance.minimumAveragePosition,
          maximumAveragePosition: policies.strikingDistance.maximumAveragePosition,
          minimumImpressions: policies.strikingDistance.minimumImpressions,
        }),
        {
          averagePosition: after.metrics.averagePosition,
          impressions: after.metrics.impressions,
        },
      ));
    }

    if (after.metrics.averagePosition >= policies.ctrOpportunity.minimumAveragePosition
        && after.metrics.averagePosition <= policies.ctrOpportunity.maximumAveragePosition
        && after.metrics.impressions >= policies.ctrOpportunity.minimumImpressions
        && after.metrics.ctr <= policies.ctrOpportunity.maximumCtr) {
      signals.push(baseSignal(
        'ctr_opportunity_candidate',
        after,
        current,
        policy(policies.ctrOpportunity.id, policies.ctrOpportunity.version, {
          minimumAveragePosition: policies.ctrOpportunity.minimumAveragePosition,
          maximumAveragePosition: policies.ctrOpportunity.maximumAveragePosition,
          minimumImpressions: policies.ctrOpportunity.minimumImpressions,
          maximumCtr: policies.ctrOpportunity.maximumCtr,
        }),
        {
          averagePosition: after.metrics.averagePosition,
          impressions: after.metrics.impressions,
          ctr: after.metrics.ctr,
        },
      ));
    }
  }

  const overlapGroups = new Map<string, ValidatedRow[]>();
  for (const row of current.rows) {
    if (row.metrics.impressions < policies.overlap.minimumImpressions) continue;
    const list = overlapGroups.get(row.sidecar.query) ?? [];
    list.push(row);
    overlapGroups.set(row.sidecar.query, list);
  }
  for (const query of [...overlapGroups.keys()].sort()) {
    const rows = overlapGroups.get(query)!.sort((left, right) =>
      left.sidecar.page < right.sidecar.page ? -1 : left.sidecar.page > right.sidecar.page ? 1 : 0);
    if (rows.length < 2) continue;
    const queryId = rows[0]!.sidecar.queryId;
    const overlapPolicy = policy(policies.overlap.id, policies.overlap.version, {
      minimumImpressions: policies.overlap.minimumImpressions,
    });
    signals.push({
      id: signalId({
        kind: 'query_page_overlap_candidate',
        currentCollectionId: current.collection.id,
        queryId,
        rows: rows.map((row) => row.sidecar.rowIdentity),
        policy: overlapPolicy,
      }),
      kind: 'query_page_overlap_candidate',
      providerId: SEARCH_ANALYTICS_PROVIDER_ID,
      cohort: {
        query,
        queryId,
        searchType: 'web',
        pages: rows.map((row) => ({ page: row.sidecar.page, pageId: row.sidecar.pageId })),
      },
      periods: { current: period(current.semantics) },
      freshness: { current: current.semantics.freshness },
      coverage: { current: current.semantics.coverage },
      metricUnits,
      policy: overlapPolicy,
      values: { pageCount: rows.length },
      provenance: { current: rows.map((row) => row.evidence) },
    });
  }

  const sortedSignals = signals.sort((left, right) => {
    const kind = kindOrder[left.kind] - kindOrder[right.kind];
    if (kind !== 0) return kind;
    if (left.cohort.query !== right.cohort.query) return left.cohort.query < right.cohort.query ? -1 : 1;
    const leftPage = left.cohort.page ?? left.cohort.pages?.map((item) => item.page).join('\n') ?? '';
    const rightPage = right.cohort.page ?? right.cohort.pages?.map((item) => item.page).join('\n') ?? '';
    if (leftPage !== rightPage) return leftPage < rightPage ? -1 : 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  return {
    collectionPair: {
      baselineCollectionId: baseline.collection.id,
      currentCollectionId: current.collection.id,
    },
    unmatched: {
      baselineOnly: [...baselineRows.keys()].filter((key) => !currentRows.has(key)).length,
      currentOnly: [...currentRows.keys()].filter((key) => !baselineRows.has(key)).length,
      absenceSignalsEmitted: false,
    },
    signals: sortedSignals,
  };
}
