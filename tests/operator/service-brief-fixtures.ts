import { readFileSync } from 'node:fs';
import type { Scope } from '../../src/persistence/repository.js';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
} from '../../src/adapters/search-analytics.js';
import {
  adaptDiscoveryDiagnosticsEvidence,
  type DiscoveryAdapterConfig,
  type DiscoveryProviderId,
} from '../../src/adapters/discovery-diagnostics.js';
import {
  adaptBingAiPerformanceEvidence,
  type BingAiAdapterConfig,
} from '../../src/adapters/bing-ai-performance.js';
import type { ZeroRankAdapterConfig } from '../../src/adapters/zerorank.js';
import { batch } from '../persistence/helpers.js';

type MutableJson = Record<string, any>;
const searchText = readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8');
const discoveryText = readFileSync('tests/fixtures/discovery-diagnostics-evidence-v1.0.json', 'utf8');
const bingText = readFileSync('tests/fixtures/bing-ai-performance-evidence-v1.0.json', 'utf8');
const zeroRankText = readFileSync('tests/fixtures/zerorank-evidence-v1.0.json', 'utf8');

export const serviceBriefScope: Scope = structuredClone(batch('alpha').collection.scope);

function bytes(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function searchArtifact(role: 'baseline' | 'current', target: string): MutableJson {
  const host = new URL(target).hostname;
  const value = JSON.parse(searchText.replaceAll('example.test', host)) as MutableJson;
  value.property = 'sc-domain:' + host;
  const baseline = role === 'baseline';
  value.observedAt = baseline ? '2026-09-08T08:00:00.000Z' : '2026-09-16T08:00:00.000Z';
  value.exportedAt = baseline ? '2026-09-08T08:05:00.000Z' : '2026-09-16T08:05:00.000Z';
  value.requestedWindow = baseline
    ? { start: '2026-09-01T00:00:00.000Z', end: '2026-09-08T00:00:00.000Z' }
    : { start: '2026-09-08T00:00:00.000Z', end: '2026-09-15T00:00:00.000Z' };
  value.effectiveWindow = structuredClone(value.requestedWindow);
  value.freshness = { dataState: 'final', freshThrough: baseline ? '2026-09-08T00:00:00.000Z' : '2026-09-15T00:00:00.000Z' };
  value.rows = baseline
    ? [
        { query: 'synthetic shared', page: target + '/shared', clicks: 12, impressions: 120, ctr: 0.1, averagePosition: 12 },
        { query: 'synthetic focus core a', page: target + '/focus', clicks: 5, impressions: 50, ctr: 0.1, averagePosition: 8 },
        { query: 'synthetic focus core b', page: target + '/focus', clicks: 3, impressions: 30, ctr: 0.1, averagePosition: 10 },
        { query: 'synthetic focus alt a', page: target + '/focus', clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 18 },
        { query: 'synthetic focus alt b', page: target + '/focus', clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 20 },
      ]
    : [
        { query: 'synthetic shared', page: target + '/shared', clicks: 5, impressions: 120, ctr: 0.041666666666666664, averagePosition: 10 },
        { query: 'synthetic slash exact', page: target + '/page', clicks: 1, impressions: 50, ctr: 0.02, averagePosition: 10 },
        { query: 'synthetic slash trailing', page: target + '/page/', clicks: 1, impressions: 50, ctr: 0.02, averagePosition: 10 },
        { query: 'synthetic query one', page: target + '/page?a=1', clicks: 1, impressions: 50, ctr: 0.02, averagePosition: 10 },
        { query: 'synthetic query two', page: target + '/page?a=2', clicks: 1, impressions: 50, ctr: 0.02, averagePosition: 10 },
        { query: 'synthetic overlap', page: target + '/overlap-a', clicks: 3, impressions: 30, ctr: 0.1, averagePosition: 7 },
        { query: 'synthetic overlap', page: target + '/overlap-b', clicks: 4, impressions: 40, ctr: 0.1, averagePosition: 6 },
        { query: 'synthetic focus core a', page: target + '/focus', clicks: 5, impressions: 50, ctr: 0.1, averagePosition: 8 },
        { query: 'synthetic focus core b', page: target + '/focus', clicks: 3, impressions: 30, ctr: 0.1, averagePosition: 10 },
        { query: 'synthetic focus alt a', page: target + '/focus', clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 18 },
        { query: 'synthetic focus alt b', page: target + '/focus', clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 20 },
      ];
  return value;
}

export function serviceBriefSearchModules(
  target = 'https://example.test',
  scope: Scope = serviceBriefScope,
) {
  const adapt = (value: MutableJson) => {
    const exported = Date.parse(value.exportedAt);
    const config: SearchAnalyticsAdapterConfig = {
      scope: structuredClone(scope),
      expectedProperty: value.property,
      providerConnectionId: 'synthetic-service-brief-gsc',
      collectedAt: new Date(exported + 60_000).toISOString(),
      receivedAt: new Date(exported + 120_000).toISOString(),
      availability: { state: 'available', reference: 'synthetic-service-brief-search' },
    };
    return adaptSearchAnalyticsEvidence(bytes(value), config);
  };
  const baseline = adapt(searchArtifact('baseline', target));
  const current = adapt(searchArtifact('current', target));
  const shared = baseline.rows.find((row) => row.query === 'synthetic shared')!;
  const focusRows = current.rows.filter((row) => row.page === target + '/focus');
  return {
    baseline,
    current,
    searchAnalytics: {
      baseline,
      current,
      policy: {
        strikingDistance: { id: 'service-brief-striking', version: '1.0.0', minimumAveragePosition: 8, maximumAveragePosition: 12, minimumImpressions: 40 },
        decay: { id: 'service-brief-decay', version: '1.0.0', metric: 'clicks', minimumBaseline: 10, maximumCurrentToBaselineRatio: 0.5 },
        ctrOpportunity: { id: 'service-brief-ctr', version: '1.0.0', minimumAveragePosition: 8, maximumAveragePosition: 12, minimumImpressions: 40, maximumCtr: 0.05 },
        overlap: { id: 'service-brief-overlap', version: '1.0.0', minimumImpressions: 20 },
      },
    },
    searchChanges: [{
      annotation: { id: 'synthetic-service-brief-change', occurredAt: '2026-09-08T00:00:00.000Z', recordedAt: '2026-09-08T01:00:00.000Z', summary: 'Synthetic human-recorded change.' },
      baseline,
      baselineRowIdentity: shared.rowIdentity,
      metric: 'clicks',
      dueWindow: { start: '2026-09-08T00:00:00.000Z', end: '2026-09-15T00:00:00.000Z' },
      evaluatedAt: '2026-09-16T09:00:00.000Z',
      followUp: current,
    }],
    pageFocus: [{
      window: current,
      pageId: focusRows[0]!.pageId,
      assignments: focusRows.map((row) => ({ queryId: row.queryId, clusterId: row.query.includes('core') ? 'cluster-core' : 'cluster-alt' })),
      policy: { id: 'service-brief-focus', version: '1.0.0', minimumPageImpressions: 100, minimumClusterImpressions: 30, minimumClusterShare: 0.2 },
    }],
  };
}

export function serviceBriefDiscoveryInput(target = 'https://example.test') {
  const host = new URL(target).hostname;
  const corpus = JSON.parse(discoveryText.replaceAll('example.test', host)) as Record<string, MutableJson>;
  const adapt = (name: 'google' | 'bing' | 'yandex' | 'indexnow') => {
    const value = structuredClone(corpus[name]!);
    value.site = 'sc-domain:' + host;
    const exported = Date.parse(value.exportedAt);
    const config: DiscoveryAdapterConfig = {
      scope: structuredClone(serviceBriefScope),
      expectedProvider: value.provider as DiscoveryProviderId,
      expectedSite: value.site,
      providerConnectionId: 'synthetic-service-brief-' + value.provider,
      collectedAt: new Date(exported + 60_000).toISOString(),
      receivedAt: new Date(exported + 120_000).toISOString(),
      availability: { state: 'available', reference: 'synthetic-service-brief-discovery' },
    };
    return adaptDiscoveryDiagnosticsEvidence(bytes(value), config);
  };
  return {
    windows: [adapt('google'), adapt('bing'), adapt('yandex')],
    indexNow: adapt('indexnow'),
    evaluatedAt: '2026-09-29T13:00:00.000Z',
    policy: { id: 'service-brief-discovery', version: '1.0.0', maxEvidenceAgeSeconds: 7_200, minimumReadySearchEngines: 2, maxSubmissionConfirmationAgeSeconds: 14_400 },
  };
}

export function serviceBriefAiInput() {
  const target = 'https://lowcountrydigitalworks.com';
  const bing = JSON.parse(bingText.replaceAll('https://example.test', target)) as MutableJson;
  bing.property = target + '/';
  const bingConfig: BingAiAdapterConfig = {
    scope: structuredClone(serviceBriefScope),
    expectedProperty: bing.property,
    providerConnectionId: 'synthetic-service-brief-bing-ai',
    collectedAt: '2026-09-30T12:11:00.000Z',
    receivedAt: '2026-09-30T12:12:00.000Z',
    availability: { state: 'available', reference: 'synthetic-service-brief-bing' },
  };
  const zeroRankConfig: ZeroRankAdapterConfig = {
    scope: structuredClone(serviceBriefScope),
    expectedWorkspaceId: 'example-workspace',
    expectedTargetOrigin: target,
    providerConnectionId: 'synthetic-service-brief-zr',
    timing: {
      observedAt: '2026-09-30T12:00:00.000Z',
      startedAt: '2026-09-30T11:50:00.000Z',
      endedAt: '2026-09-30T11:58:00.000Z',
      collectedAt: '2026-09-30T12:01:00.000Z',
      receivedAt: '2026-09-30T12:02:00.000Z',
    },
    availability: { state: 'available', reference: 'synthetic-service-brief-zr' },
  };
  return {
    bingCurrent: adaptBingAiPerformanceEvidence(bytes(bing), bingConfig),
    zeroRankCurrent: { bytes: Buffer.from(zeroRankText, 'utf8'), trustedConfig: zeroRankConfig },
    evaluatedAt: '2026-09-30T13:00:00.000Z',
    policy: { id: 'service-brief-ai', version: '1.0.0', maxEvidenceAgeSeconds: 86_400, topN: 1, concentrationShareThresholdPct: 60 },
    cohortMappings: [],
  };
}
