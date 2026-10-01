import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Contract } from '../src/contracts/wire.js';
import type { CollectionBatch, Scope } from '../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  createHumanRecommendation,
  recordHumanOutcome,
  recordMeasurement,
  transitionHumanRecommendation,
} from '../src/review/service.js';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
  type SearchAnalyticsAdaptationResult,
} from '../src/adapters/search-analytics.js';
import {
  adaptDiscoveryDiagnosticsEvidence,
  type DiscoveryAdapterConfig,
  type DiscoveryProviderId,
} from '../src/adapters/discovery-diagnostics.js';
import {
  adaptBingAiPerformanceEvidence,
  type BingAiAdapterConfig,
} from '../src/adapters/bing-ai-performance.js';
import type { ZeroRankAdapterConfig } from '../src/adapters/zerorank.js';
import {
  assembleServiceBrief,
  serializeServiceBriefJson,
} from '../src/operator/service-brief.js';
import { renderServiceBriefHtml } from '../src/operator/service-brief-html.js';
import { alpha, batch } from '../tests/persistence/helpers.js';

type MutableJson = Record<string, any>;

const artifactDirectory = resolve('local-artifacts');
const databasePath = resolve(artifactDirectory, 'release-0.15-service-brief-preview.sqlite');
const jsonPath = resolve(artifactDirectory, 'release-0.15-service-brief-preview.json');
const htmlPath = resolve(artifactDirectory, 'release-0.15-service-brief-preview.html');
const target = 'https://lowcountrydigitalworks.com';
const property = 'sc-domain:lowcountrydigitalworks.com';
const scope: Scope = structuredClone(batch('alpha').collection.scope);

function bytes(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function setWindow(value: CollectionBatch, start: string, end: string): void {
  value.collection.sourceTime = { start, end };
  value.collection.startedAt = start;
  value.collection.endedAt = end;
  value.collection.collectedAt = end;
  value.collection.receivedAt = new Date(Date.parse(end) + 60_000).toISOString();
  for (const observation of value.observations) {
    observation.record.provenance.sourceTime = structuredClone(value.collection.sourceTime);
    observation.record.provenance.collectedAt = value.collection.collectedAt;
    observation.record.provenance.receivedAt = value.collection.receivedAt;
  }
}

function evidenceBatches(): { baseline: CollectionBatch; current: CollectionBatch } {
  const baseline = batch('alpha', '-release-015-baseline');
  const current = batch('alpha', '-release-015-current');
  baseline.collection.completeness = { state: 'complete', expectedCount: 1, receivedCount: 1 };
  current.collection.completeness = { state: 'complete', expectedCount: 1, receivedCount: 1 };
  baseline.observations[0]!.record.provenance.completeness = structuredClone(baseline.collection.completeness);
  current.observations[0]!.record.provenance.completeness = structuredClone(current.collection.completeness);
  current.observations[0]!.record.cohort = structuredClone(baseline.observations[0]!.record.cohort);
  current.observations[0]!.record.value = { state: 'observed', value: { type: 'number', value: 2 } };
  setWindow(baseline, '2026-09-01T00:00:00.000Z', '2026-09-01T01:00:00.000Z');
  setWindow(current, '2026-09-08T00:00:00.000Z', '2026-09-08T01:00:00.000Z');
  return { baseline, current };
}

function searchArtifact(role: 'baseline' | 'current'): MutableJson {
  const value = JSON.parse(
    readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8')
      .replaceAll('example.test', 'lowcountrydigitalworks.com'),
  ) as MutableJson;
  value.property = property;
  if (role === 'baseline') {
    value.observedAt = '2026-09-08T08:00:00.000Z';
    value.exportedAt = '2026-09-08T08:05:00.000Z';
    value.requestedWindow = { start: '2026-09-01T00:00:00.000Z', end: '2026-09-08T00:00:00.000Z' };
    value.effectiveWindow = structuredClone(value.requestedWindow);
    value.freshness = { dataState: 'final', freshThrough: '2026-09-08T00:00:00.000Z' };
    value.rows = [
      { query: 'synthetic shared', page: target + '/shared', clicks: 12, impressions: 120, ctr: 0.1, averagePosition: 12 },
      { query: 'synthetic focus core a', page: target + '/focus', clicks: 5, impressions: 50, ctr: 0.1, averagePosition: 8 },
      { query: 'synthetic focus core b', page: target + '/focus', clicks: 3, impressions: 30, ctr: 0.1, averagePosition: 10 },
      { query: 'synthetic focus alt a', page: target + '/focus', clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 18 },
      { query: 'synthetic focus alt b', page: target + '/focus', clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 20 },
    ];
  } else {
    value.observedAt = '2026-09-16T08:00:00.000Z';
    value.exportedAt = '2026-09-16T08:05:00.000Z';
    value.requestedWindow = { start: '2026-09-08T00:00:00.000Z', end: '2026-09-15T00:00:00.000Z' };
    value.effectiveWindow = structuredClone(value.requestedWindow);
    value.freshness = { dataState: 'final', freshThrough: '2026-09-15T00:00:00.000Z' };
    value.rows = [
      { query: 'synthetic shared', page: target + '/shared', clicks: 5, impressions: 120, ctr: 0.041666666666666664, averagePosition: 10 },
      { query: 'synthetic overlap', page: target + '/overlap-a', clicks: 3, impressions: 30, ctr: 0.1, averagePosition: 7 },
      { query: 'synthetic overlap', page: target + '/overlap-b', clicks: 4, impressions: 40, ctr: 0.1, averagePosition: 6 },
      { query: 'synthetic focus core a', page: target + '/focus', clicks: 5, impressions: 50, ctr: 0.1, averagePosition: 8 },
      { query: 'synthetic focus core b', page: target + '/focus', clicks: 3, impressions: 30, ctr: 0.1, averagePosition: 10 },
      { query: 'synthetic focus alt a', page: target + '/focus', clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 18 },
      { query: 'synthetic focus alt b', page: target + '/focus', clicks: 2, impressions: 20, ctr: 0.1, averagePosition: 20 },
    ];
  }
  return value;
}

function adaptSearch(value: MutableJson, connection: string): SearchAnalyticsAdaptationResult {
  const exported = Date.parse(value.exportedAt);
  const config: SearchAnalyticsAdapterConfig = {
    scope: structuredClone(scope),
    expectedProperty: value.property,
    providerConnectionId: connection,
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
    availability: { state: 'available', reference: 'synthetic-release-015-search' },
  };
  return adaptSearchAnalyticsEvidence(bytes(value), config);
}

function adaptDiscovery(name: 'google' | 'bing' | 'yandex' | 'indexnow') {
  const corpus = JSON.parse(
    readFileSync('tests/fixtures/discovery-diagnostics-evidence-v1.0.json', 'utf8')
      .replaceAll('example.test', 'lowcountrydigitalworks.com'),
  ) as Record<string, MutableJson>;
  const value = structuredClone(corpus[name]!);
  value.site = property;
  const exported = Date.parse(value.exportedAt);
  const config: DiscoveryAdapterConfig = {
    scope: structuredClone(scope),
    expectedProvider: value.provider as DiscoveryProviderId,
    expectedSite: value.site,
    providerConnectionId: 'synthetic-release-015-' + value.provider,
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
    availability: { state: 'available', reference: 'synthetic-release-015-discovery' },
  };
  return adaptDiscoveryDiagnosticsEvidence(bytes(value), config);
}

function aiInput() {
  const bing = JSON.parse(
    readFileSync('tests/fixtures/bing-ai-performance-evidence-v1.0.json', 'utf8')
      .replaceAll('https://example.test', target),
  ) as MutableJson;
  bing.property = target + '/';
  const bingConfig: BingAiAdapterConfig = {
    scope: structuredClone(scope),
    expectedProperty: bing.property,
    providerConnectionId: 'synthetic-release-015-bing-ai',
    collectedAt: '2026-09-30T12:11:00.000Z',
    receivedAt: '2026-09-30T12:12:00.000Z',
    availability: { state: 'available', reference: 'synthetic-release-015-bing-ai' },
  };
  const zeroRankText = readFileSync('tests/fixtures/zerorank-evidence-v1.0.json', 'utf8');
  const zeroRankConfig: ZeroRankAdapterConfig = {
    scope: structuredClone(scope),
    expectedWorkspaceId: 'example-workspace',
    expectedTargetOrigin: target,
    providerConnectionId: 'synthetic-release-015-zerorank',
    timing: {
      observedAt: '2026-09-30T12:00:00.000Z',
      startedAt: '2026-09-30T11:50:00.000Z',
      endedAt: '2026-09-30T11:58:00.000Z',
      collectedAt: '2026-09-30T12:01:00.000Z',
      receivedAt: '2026-09-30T12:02:00.000Z',
    },
    availability: { state: 'available', reference: 'synthetic-release-015-zerorank' },
  };
  return {
    bingCurrent: adaptBingAiPerformanceEvidence(bytes(bing), bingConfig),
    zeroRankCurrent: { bytes: Buffer.from(zeroRankText, 'utf8'), trustedConfig: zeroRankConfig },
    evaluatedAt: '2026-09-30T13:00:00.000Z',
    policy: {
      id: 'release-015-ai-visibility',
      version: '1.0.0',
      maxEvidenceAgeSeconds: 86_400,
      topN: 1,
      concentrationShareThresholdPct: 60,
    },
    cohortMappings: [],
  };
}

function recommendation(observation: Contract<'observation'>): Contract<'recommendation'> {
  const owner = observation.cohort.context.scope;
  return {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id: 'synthetic-release-015-recommendation',
    scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: observation.id }],
    rationale: 'Synthetic human-authored service brief recommendation.',
    priority: { level: 'unassessed', basis: 'Synthetic service brief preview assigns no priority.' },
    authorityClass: 'internal_review',
    lifecycle: 'proposed',
    revision: 1,
    createdAt: '2026-09-01T02:00:00.000Z',
    updatedAt: '2026-09-01T02:00:00.000Z',
  };
}

function measurement(
  observation: Contract<'observation'>,
  id: string,
  relationship: Contract<'measurement'>['relationship'],
): Contract<'measurement'> {
  return {
    schemaVersion: '1.0',
    kind: 'measurement',
    id,
    cohort: structuredClone(observation.cohort),
    relationship: structuredClone(relationship),
    dueWindow: structuredClone(observation.provenance.sourceTime),
    result: {
      state: 'measured',
      observedWindow: structuredClone(observation.provenance.sourceTime),
      observations: [{
        reference: { scope: structuredClone(observation.cohort.context.scope), id: observation.id },
        value: structuredClone(observation.value),
      }],
    },
    comparability: { state: 'comparable' },
    methodology: { id: 'synthetic-release-015-method', version: '1.0.0' },
    createdAt: observation.provenance.receivedAt,
  };
}

async function generate(): Promise<void> {
  mkdirSync(artifactDirectory, { recursive: true });
  for (const path of [databasePath, databasePath + '-shm', databasePath + '-wal', jsonPath, htmlPath]) rmSync(path, { force: true });

  const evidence = new LocalEvidenceRepository(databasePath);
  const review = new LocalReviewLedgerRepository(databasePath);
  try {
    const base = batch('alpha').collection;
    await evidence.createTenant(alpha);
    await evidence.createSite(alpha, { id: scope.siteId, label: 'Synthetic Release 0.15 preview' });
    await evidence.createScope(alpha, scope);
    await evidence.createConnection(alpha, {
      id: base.providerConnectionId!,
      scope,
      providerId: base.providerId,
    });

    const pair = evidenceBatches();
    await evidence.persistCollection(alpha, pair.baseline);
    await evidence.persistCollection(alpha, pair.current);

    const proposed = await createHumanRecommendation(review, evidence, alpha, {
      recommendation: recommendation(pair.baseline.observations[0]!.record),
    });
    const inReview = await transitionHumanRecommendation(review, evidence, alpha, {
      scope: proposed.scope,
      id: proposed.id,
      expectedCurrentRevision: 1,
      lifecycle: 'in_review',
      updatedAt: '2026-09-01T03:00:00.000Z',
    });
    const accepted = await transitionHumanRecommendation(review, evidence, alpha, {
      scope: inReview.scope,
      id: inReview.id,
      expectedCurrentRevision: 2,
      lifecycle: 'accepted',
      updatedAt: '2026-09-01T04:00:00.000Z',
    });

    const baselineMeasurement = measurement(
      pair.baseline.observations[0]!.record,
      'synthetic-release-015-measurement-baseline',
      { role: 'baseline' },
    );
    const followUpMeasurement = measurement(
      pair.current.observations[0]!.record,
      'synthetic-release-015-measurement-follow-up',
      { role: 'follow_up', baselineMeasurementId: baselineMeasurement.id },
    );
    await recordMeasurement(review, evidence, alpha, {
      measurement: baselineMeasurement,
      cohortObservationId: pair.baseline.observations[0]!.record.id,
      recommendationId: accepted.id,
    });
    await recordMeasurement(review, evidence, alpha, {
      measurement: followUpMeasurement,
      cohortObservationId: pair.current.observations[0]!.record.id,
      recommendationId: accepted.id,
    });
    await recordHumanOutcome(review, alpha, {
      outcome: {
        schemaVersion: '1.0',
        kind: 'outcome',
        id: 'synthetic-release-015-outcome',
        scope: structuredClone(scope),
        recommendationId: accepted.id,
        assessment: {
          direction: 'inconclusive',
          measurements: [
            { scope: structuredClone(scope), id: baselineMeasurement.id },
            { scope: structuredClone(scope), id: followUpMeasurement.id },
          ],
          reason: 'Synthetic preview preserves a human-declared inconclusive outcome.',
        },
        attribution: { strength: 'none', reason: 'Synthetic preview makes no causal attribution.' },
        createdAt: '2026-09-18T00:00:00.000Z',
      },
    });

    const baselineSearch = adaptSearch(searchArtifact('baseline'), 'synthetic-release-015-gsc');
    const currentSearch = adaptSearch(searchArtifact('current'), 'synthetic-release-015-gsc');
    const shared = baselineSearch.rows.find((row) => row.query === 'synthetic shared' && row.page === target + '/shared')!;
    const focusRows = currentSearch.rows.filter((row) => row.page === target + '/focus');

    const brief = await assembleServiceBrief(evidence, review, alpha, {
      scope,
      trustedTarget: target,
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: {
        id: 'release-015-preview-policy',
        version: '1.0.0',
        maxAttentionItems: 128,
        maxPageIndexEntries: 128,
        maxReferencesPerPage: 32,
        maxDetailedRecommendationHistories: 5,
        maxSearchChanges: 8,
        maxPageFocusReports: 8,
      },
      evidenceDiff: {
        baselineCollectionId: pair.baseline.collection.id,
        currentCollectionId: pair.current.collection.id,
      },
      serviceHistory: { selectedRecommendationIds: [accepted.id] },
      searchAnalytics: {
        baseline: baselineSearch,
        current: currentSearch,
        policy: {
          strikingDistance: { id: 'preview-striking', version: '1.0.0', minimumAveragePosition: 8, maximumAveragePosition: 12, minimumImpressions: 40 },
          decay: { id: 'preview-decay', version: '1.0.0', metric: 'clicks', minimumBaseline: 10, maximumCurrentToBaselineRatio: 0.5 },
          ctrOpportunity: { id: 'preview-ctr', version: '1.0.0', minimumAveragePosition: 8, maximumAveragePosition: 12, minimumImpressions: 40, maximumCtr: 0.05 },
          overlap: { id: 'preview-overlap', version: '1.0.0', minimumImpressions: 20 },
        },
      },
      searchChanges: [{
        annotation: {
          id: 'synthetic-release-015-change',
          occurredAt: '2026-09-08T00:00:00.000Z',
          recordedAt: '2026-09-08T01:00:00.000Z',
          summary: 'Synthetic human-recorded site change.',
          recommendationId: accepted.id,
        },
        baseline: baselineSearch,
        baselineRowIdentity: shared.rowIdentity,
        metric: 'clicks',
        dueWindow: { start: '2026-09-08T00:00:00.000Z', end: '2026-09-15T00:00:00.000Z' },
        evaluatedAt: '2026-09-16T09:00:00.000Z',
        followUp: currentSearch,
      }],
      pageFocus: [{
        window: currentSearch,
        pageId: focusRows[0]!.pageId,
        assignments: focusRows.map((row) => ({
          queryId: row.queryId,
          clusterId: row.query.includes('core') ? 'cluster-core' : 'cluster-alt',
        })),
        policy: {
          id: 'release-015-focus-policy',
          version: '1.0.0',
          minimumPageImpressions: 100,
          minimumClusterImpressions: 30,
          minimumClusterShare: 0.2,
        },
      }],
      discoveryDiagnostics: {
        windows: [adaptDiscovery('google'), adaptDiscovery('bing'), adaptDiscovery('yandex')],
        indexNow: adaptDiscovery('indexnow'),
        evaluatedAt: '2026-09-29T13:00:00.000Z',
        policy: {
          id: 'release-015-discovery-policy',
          version: '1.0.0',
          maxEvidenceAgeSeconds: 7_200,
          minimumReadySearchEngines: 2,
          maxSubmissionConfirmationAgeSeconds: 14_400,
        },
      },
      aiVisibility: aiInput(),
    });

    const json = serializeServiceBriefJson(brief);
    const html = renderServiceBriefHtml(brief);
    writeFileSync(jsonPath, json, { encoding: 'utf8', flag: 'wx' });
    writeFileSync(htmlPath, html, { encoding: 'utf8', flag: 'wx' });
    console.log(
      'Generated synthetic Release 0.15 service brief: ' +
      'local-artifacts/release-0.15-service-brief-preview.json (' + String(Buffer.byteLength(json, 'utf8')) + ' bytes); ' +
      'local-artifacts/release-0.15-service-brief-preview.html (' + String(Buffer.byteLength(html, 'utf8')) + ' bytes); ' +
      String(brief.attentionRegister.length) + ' attention records; ' +
      String(brief.exactUrlEvidenceIndex.length) + ' exact URLs; ' +
      String(brief.provenanceManifest.length) + ' manifest entries',
    );
  } finally {
    review.close();
    evidence.close();
    for (const path of [databasePath, databasePath + '-shm', databasePath + '-wal']) rmSync(path, { force: true });
  }
}

await generate();
