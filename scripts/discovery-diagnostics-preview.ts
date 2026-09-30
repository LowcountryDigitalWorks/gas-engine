import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  adaptDiscoveryDiagnosticsEvidence,
  type DiscoveryAdapterConfig,
  type DiscoveryProviderId,
} from '../src/adapters/discovery-diagnostics.js';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
} from '../src/adapters/search-analytics.js';
import { analyzeDiscoveryDiagnostics } from '../src/analysis/discovery-diagnostics.js';
import { renderDiscoveryDiagnosticsHtml } from '../src/operator/discovery-diagnostics.js';
import type { Scope } from '../src/persistence/repository.js';

type MutableJson = Record<string, any>;
const artifactDirectory = resolve('local-artifacts');
const outputPath = resolve(artifactDirectory, 'release-0.13-discovery-diagnostics-preview.html');
const corpus = JSON.parse(readFileSync('tests/fixtures/discovery-diagnostics-evidence-v1.0.json', 'utf8')) as Record<string, MutableJson>;
const searchFixture = JSON.parse(readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8')) as MutableJson;
const scope: Scope = {
  tenantId: 'tenant-alpha',
  siteId: 'site-alpha',
  siteScopeRevisionId: 'synthetic-scope-alpha-r1',
};

function bytes(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function adapt(name: 'google' | 'bing' | 'yandex' | 'indexnow') {
  const value = structuredClone(corpus[name]!);
  const exported = new Date(value.exportedAt).getTime();
  const config: DiscoveryAdapterConfig = {
    scope: structuredClone(scope),
    expectedProvider: value.provider as DiscoveryProviderId,
    expectedSite: value.site,
    providerConnectionId: 'synthetic-preview-' + value.provider,
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
    availability: { state: 'available', reference: 'synthetic-release-013-preview' },
  };
  return adaptDiscoveryDiagnosticsEvidence(bytes(value), config);
}

function searchContext() {
  const value = structuredClone(searchFixture);
  value.property = 'sc-domain:example.test';
  value.observedAt = '2026-09-29T12:30:00.000Z';
  value.exportedAt = '2026-09-29T12:35:00.000Z';
  value.requestedWindow = { start: '2026-09-22T00:00:00.000Z', end: '2026-09-29T00:00:00.000Z' };
  value.effectiveWindow = structuredClone(value.requestedWindow);
  value.freshness = { dataState: 'final', freshThrough: '2026-09-29T00:00:00.000Z' };
  value.rows = [
    {
      query: 'synthetic broad query one',
      page: 'https://example.test/broad',
      clicks: 2,
      impressions: 20,
      ctr: 0.1,
      averagePosition: 6,
    },
    {
      query: 'synthetic broad query two',
      page: 'https://example.test/broad',
      clicks: 3,
      impressions: 30,
      ctr: 0.1,
      averagePosition: 9,
    },
    {
      query: 'synthetic canonical query',
      page: 'https://example.test/canonical',
      clicks: 0,
      impressions: 10,
      ctr: 0,
      averagePosition: 12,
    },
  ];
  const exported = new Date(value.exportedAt).getTime();
  const config: SearchAnalyticsAdapterConfig = {
    scope: structuredClone(scope),
    expectedProperty: value.property,
    providerConnectionId: 'synthetic-preview-gsc-search-context',
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
    availability: { state: 'available', reference: 'synthetic-release-013-preview-search' },
  };
  return adaptSearchAnalyticsEvidence(bytes(value), config);
}

mkdirSync(artifactDirectory, { recursive: true });
rmSync(outputPath, { force: true });

const report = analyzeDiscoveryDiagnostics({
  windows: [adapt('google'), adapt('bing'), adapt('yandex')],
  indexNow: adapt('indexnow'),
  searchAnalytics: searchContext(),
  evaluatedAt: '2026-09-29T13:00:00.000Z',
  policy: {
    id: 'discovery-preview-readiness',
    version: '1.0.0',
    maxEvidenceAgeSeconds: 7_200,
    minimumReadySearchEngines: 2,
    maxSubmissionConfirmationAgeSeconds: 14_400,
  },
});
const html = renderDiscoveryDiagnosticsHtml(report);
writeFileSync(outputPath, html, { encoding: 'utf8', flag: 'wx' });
console.log(
  'Generated synthetic discovery diagnostics preview: local-artifacts/release-0.13-discovery-diagnostics-preview.html (' +
  String(new TextEncoder().encode(html).byteLength) +
  ' bytes)',
);
