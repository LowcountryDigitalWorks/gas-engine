import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptDiscoveryDiagnosticsEvidence,
  type DiscoveryAdapterConfig,
  type DiscoveryProviderId,
} from '../../src/adapters/discovery-diagnostics.js';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
} from '../../src/adapters/search-analytics.js';
import {
  analyzeDiscoveryDiagnostics,
  DiscoveryAnalysisError,
  type DiscoveryReadinessPolicy,
} from '../../src/analysis/discovery-diagnostics.js';
import type { Scope } from '../../src/persistence/repository.js';
import { batch } from '../persistence/helpers.js';

type MutableJson = Record<string, any>;
const corpus = JSON.parse(readFileSync('tests/fixtures/discovery-diagnostics-evidence-v1.0.json', 'utf8')) as Record<string, MutableJson>;
const searchFixture = JSON.parse(readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8')) as MutableJson;
const alphaScope: Scope = structuredClone(batch('alpha').collection.scope);
const betaScope: Scope = structuredClone(batch('beta').collection.scope);

function fixture(name: 'google' | 'bing' | 'yandex' | 'indexnow'): MutableJson {
  return structuredClone(corpus[name]!);
}
function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
}
function discoveryConfig(value: MutableJson, scope: Scope = alphaScope): DiscoveryAdapterConfig {
  const exported = new Date(value.exportedAt).getTime();
  return {
    scope: structuredClone(scope),
    expectedProvider: value.provider as DiscoveryProviderId,
    expectedSite: value.site,
    providerConnectionId: `synthetic-${value.provider}-connection`,
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
    availability: { state: 'available', reference: 'synthetic-discovery-artifact' },
  };
}
function adapt(name: 'google' | 'bing' | 'yandex' | 'indexnow', scope: Scope = alphaScope, mutate?: (value: MutableJson) => void) {
  const value = fixture(name);
  mutate?.(value);
  return adaptDiscoveryDiagnosticsEvidence(bytes(value), discoveryConfig(value, scope));
}
function policy(overrides: Partial<DiscoveryReadinessPolicy> = {}): DiscoveryReadinessPolicy {
  return {
    id: 'discovery-readiness-policy',
    version: '1.0.0',
    maxEvidenceAgeSeconds: 7_200,
    minimumReadySearchEngines: 2,
    maxSubmissionConfirmationAgeSeconds: 14_400,
    ...overrides,
  };
}
function analyze(
  windows = [adapt('google'), adapt('bing'), adapt('yandex')],
  indexNow = adapt('indexnow'),
  overrides: Partial<{ policy: DiscoveryReadinessPolicy; evaluatedAt: string; searchAnalytics: ReturnType<typeof adaptSearchAnalyticsEvidence> }> = {},
) {
  return analyzeDiscoveryDiagnostics({
    windows,
    indexNow,
    evaluatedAt: overrides.evaluatedAt ?? '2026-09-29T13:00:00.000Z',
    policy: overrides.policy ?? policy(),
    ...(overrides.searchAnalytics === undefined ? {} : { searchAnalytics: overrides.searchAnalytics }),
  });
}
function url(report: ReturnType<typeof analyzeDiscoveryDiagnostics>, suffix: string) {
  const found = report.urls.find((entry) => entry.url === `https://example.test/${suffix}`);
  assert.ok(found);
  return found;
}
function expectCode(code: DiscoveryAnalysisError['code']): (error: unknown) => boolean {
  return (error) => error instanceof DiscoveryAnalysisError && error.code === code;
}
function searchArtifact(): MutableJson {
  const value = structuredClone(searchFixture);
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
  return value;
}
function adaptSearch(scope: Scope = alphaScope, property = 'sc-domain:example.test') {
  const value = searchArtifact();
  value.property = property;
  const exported = new Date(value.exportedAt).getTime();
  const config: SearchAnalyticsAdapterConfig = {
    scope: structuredClone(scope),
    expectedProperty: property,
    providerConnectionId: 'synthetic-gsc-search-context',
    collectedAt: new Date(exported + 60_000).toISOString(),
    receivedAt: new Date(exported + 120_000).toISOString(),
    availability: { state: 'available', reference: 'synthetic-search-context' },
  };
  return adaptSearchAnalyticsEvidence(bytes(value), config);
}

test('three-engine analysis emits broad, divergence, canonical, permission and no-divergence findings without scores', () => {
  const report = analyze();
  assert.deepEqual(report.providers, [
    'bing-webmaster-tools',
    'google-search-console',
    'indexnow',
    'yandex-webmaster',
  ]);
  assert.equal(report.totals.uniqueUrls, 5);
  assert.equal(report.totals.readyUrls, 5);
  assert.equal(report.totals.notReadyUrls, 0);

  assert.deepEqual(url(report, 'broad').findings.map((finding) => finding.kind), [
    'broad_indexing_issue_candidate',
    'broad_crawl_access_issue_candidate',
    'canonical_divergence_candidate',
    'indexing_permission_divergence_candidate',
  ]);
  assert.deepEqual(url(report, 'diverge').findings.map((finding) => finding.kind), [
    'engine_specific_indexing_divergence_candidate',
  ]);
  assert.deepEqual(url(report, 'canonical').findings.map((finding) => finding.kind), [
    'canonical_divergence_candidate',
  ]);
  assert.deepEqual(url(report, 'permission').findings.map((finding) => finding.kind), [
    'indexing_permission_divergence_candidate',
  ]);
  assert.deepEqual(url(report, 'clean').findings.map((finding) => finding.kind), [
    'no_cross_engine_divergence_observed',
  ]);

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /healthScore|severityScore|priorityScore|businessImpact/);
  assert.match(report.navigationOrderNote, /not severity, priority, or business impact/);
});

test('exact URL alignment never merges trailing slash variants, aliases, canonical targets or redirects', () => {
  const bing = adapt('bing', alphaScope, (value) => {
    const row = value.rows.find((item: MutableJson) => item.url === 'https://example.test/diverge');
    row.url = 'https://example.test/diverge/';
    row.canonicalUrl = 'https://example.test/diverge/';
  });
  const report = analyze([adapt('google'), bing]);
  assert.ok(report.urls.some((entry) => entry.url === 'https://example.test/diverge'));
  assert.ok(report.urls.some((entry) => entry.url === 'https://example.test/diverge/'));
  assert.equal(url(report, 'diverge').state, 'not_ready');
  const slash = report.urls.find((entry) => entry.url === 'https://example.test/diverge/');
  assert.ok(slash);
  assert.equal(slash.state, 'not_ready');
});

test('two-engine and three-engine provider sets are deterministic regardless input order', () => {
  const google = adapt('google');
  const bing = adapt('bing');
  const yandex = adapt('yandex');
  const left = analyze([google, bing, yandex]);
  const right = analyze([yandex, google, bing]);
  assert.deepEqual(right, left);

  const two = analyze([google, bing], adapt('indexnow'), { policy: policy({ minimumReadySearchEngines: 2 }) });
  assert.equal(two.providerReadiness.filter((entry) => entry.providerId !== 'indexnow').length, 2);
  assert.equal(url(two, 'diverge').state, 'ready');

  const requiresThree = analyzeDiscoveryDiagnostics({
    windows: [google, bing],
    indexNow: adapt('indexnow'),
    evaluatedAt: '2026-09-29T13:00:00.000Z',
    policy: policy({ minimumReadySearchEngines: 3 }),
  });
  assert.equal(url(requiresThree, 'diverge').state, 'not_ready');
  assert.ok(url(requiresThree, 'diverge').readinessReasons.includes('insufficient_ready_search_engines'));
});

test('stale, preliminary, partial, unknown, truncated and unavailable provider evidence remain visible but do not count ready', () => {
  const cases: Array<{
    window: ReturnType<typeof adapt>;
    reason: string;
  }> = [
    {
      window: adapt('google', alphaScope, (value) => {
        value.freshness.freshThrough = '2026-09-29T10:00:00.000Z';
      }),
      reason: 'evidence_stale',
    },
    {
      window: adapt('google', alphaScope, (value) => {
        value.freshness.dataState = 'preliminary';
      }),
      reason: 'source_preliminary',
    },
    {
      window: adapt('google', alphaScope, (value) => {
        value.coverage = { state: 'partial', truncated: false, reason: 'Synthetic partial.' };
      }),
      reason: 'coverage_partial',
    },
    {
      window: adapt('google', alphaScope, (value) => {
        value.coverage = { state: 'unknown', truncated: false, reason: 'Synthetic unknown.' };
      }),
      reason: 'coverage_unknown',
    },
    {
      window: adapt('google', alphaScope, (value) => {
        value.coverage = { state: 'partial', truncated: true, reason: 'Synthetic truncated.' };
      }),
      reason: 'coverage_truncated',
    },
  ];

  for (const scenario of cases) {
    const report = analyze([scenario.window, adapt('bing')], adapt('indexnow'), {
      policy: policy({ minimumReadySearchEngines: 2 }),
    });
    const provider = report.providerReadiness.find((entry) => entry.providerId === 'google-search-console');
    assert.ok(provider);
    assert.equal(provider.state, 'not_ready');
    assert.ok(provider.reasons.includes(scenario.reason as any));
    const broad = url(report, 'broad');
    assert.equal(broad.state, 'not_ready');
    assert.ok(broad.readinessReasons.includes('insufficient_ready_search_engines'));
    assert.ok(broad.providers.some((entry) =>
      entry.providerId === 'google-search-console' && entry.observationState === 'observed_provider_not_ready'));
  }

  const value = fixture('google');
  const config: DiscoveryAdapterConfig = {
    ...discoveryConfig(value),
    availability: { state: 'unavailable', reason: 'Synthetic provider unavailable.' },
  };
  const unavailable = adaptDiscoveryDiagnosticsEvidence(bytes(value), config);
  const report = analyze([unavailable, adapt('bing')]);
  assert.ok(report.providerReadiness.find((entry) => entry.providerId === 'google-search-console')?.reasons.includes('provider_unavailable'));
});

test('IndexNow correlation is descriptive only across rejected, no-later, later-absent, mixed and later-present states', () => {
  const report = analyze();
  assert.equal(url(report, 'broad').indexNow.state, 'submission_accepted_later_absent_observed');
  assert.equal(url(report, 'diverge').indexNow.state, 'submission_accepted_mixed_later_observation');
  assert.equal(url(report, 'clean').indexNow.state, 'submission_rejected');
  assert.equal(url(report, 'canonical').indexNow.state, 'submission_accepted_no_later_engine_observation');
  assert.equal(url(report, 'permission').indexNow.state, 'no_submission_evidence');

  const indexValue = fixture('indexnow');
  indexValue.rows.push({
    url: 'https://example.test/permission',
    submittedAt: '2026-09-29T11:00:00.000Z',
    submissionResult: 'accepted',
    resultCode: 200,
  });
  const indexNow = adaptDiscoveryDiagnosticsEvidence(bytes(indexValue), discoveryConfig(indexValue));
  const withPresent = analyze([adapt('google'), adapt('bing'), adapt('yandex')], indexNow);
  assert.equal(url(withPresent, 'permission').indexNow.state, 'submission_accepted_later_present_observed');

  const text = JSON.stringify(withPresent);
  assert.doesNotMatch(text, /IndexNow caused indexing|IndexNow failed because|submission indexed/i);
  assert.match(url(withPresent, 'permission').indexNow.note, /does not prove or cause indexing/);
});

test('optional Release 0.10 search context aggregates exact page rows and never converts absence to zero', () => {
  const search = adaptSearch();
  const report = analyze(undefined, undefined, { searchAnalytics: search });
  const broad = url(report, 'broad');
  assert.equal(broad.searchContext.state, 'observed');
  if (broad.searchContext.state === 'observed') {
    assert.deepEqual({
      queryCount: broad.searchContext.queryCount,
      clicks: broad.searchContext.clicks,
      impressions: broad.searchContext.impressions,
      ctr: broad.searchContext.ctr,
      range: broad.searchContext.averagePositionRange,
    }, {
      queryCount: 2,
      clicks: 5,
      impressions: 50,
      ctr: 0.1,
      range: { minimum: 6, maximum: 9 },
    });
  }
  assert.equal(url(report, 'clean').searchContext.state, 'not_observed');
  assert.equal(Object.hasOwn(url(report, 'clean').searchContext, 'clicks'), false);

  const withoutSearch = analyze();
  assert.equal(url(withoutSearch, 'broad').searchContext.state, 'not_supplied');
  assert.equal(report.totals.withSearchContext, 2);
  assert.equal(report.totals.withoutObservedSearchContext, 3);
});

test('search context cannot change diagnostic finding kinds', () => {
  const withoutSearch = analyze();
  const withSearch = analyze(undefined, undefined, { searchAnalytics: adaptSearch() });
  for (const suffix of ['broad', 'diverge', 'clean', 'canonical', 'permission']) {
    assert.deepEqual(
      url(withSearch, suffix).findings,
      url(withoutSearch, suffix).findings,
    );
  }
});

test('scope/site incompatibility, duplicate providers and cross-tenant blending fail closed', () => {
  assert.throws(
    () => analyzeDiscoveryDiagnostics({
      windows: [adapt('google'), adapt('google')],
      evaluatedAt: '2026-09-29T13:00:00.000Z',
      policy: policy(),
    }),
    expectCode('invalid_provider_set'),
  );

  const betaBing = adapt('bing', betaScope);
  assert.throws(
    () => analyzeDiscoveryDiagnostics({
      windows: [adapt('google'), betaBing],
      evaluatedAt: '2026-09-29T13:00:00.000Z',
      policy: policy(),
    }),
    expectCode('incompatible_scope'),
  );

  const wrongTarget = adapt('bing', alphaScope, (value) => { value.site = 'sc-domain:other.example.test'; });
  assert.throws(
    () => analyzeDiscoveryDiagnostics({
      windows: [adapt('google'), wrongTarget],
      evaluatedAt: '2026-09-29T13:00:00.000Z',
      policy: policy(),
    }),
    expectCode('incompatible_scope'),
  );

  assert.throws(
    () => analyze(undefined, undefined, { searchAnalytics: adaptSearch(betaScope) }),
    expectCode('invalid_search_context'),
  );
  assert.throws(
    () => analyze(undefined, undefined, { searchAnalytics: adaptSearch(alphaScope, 'sc-domain:other.example.test') }),
    expectCode('invalid_search_context'),
  );
});

test('Alpha and Beta produce isolated deterministic reports with the same inert provider evidence', () => {
  const alpha = analyze();
  const beta = analyze(
    [adapt('google', betaScope), adapt('bing', betaScope), adapt('yandex', betaScope)],
    adapt('indexnow', betaScope),
  );
  assert.deepEqual(alpha.scope, alphaScope);
  assert.deepEqual(beta.scope, betaScope);
  assert.notEqual(alpha.id, beta.id);
  assert.notDeepEqual(alpha.scope, beta.scope);
});

test('analysis production surface has no network, persistence, runtime AI, action, recommendation or score path', () => {
  const source = readFileSync('src/analysis/discovery-diagnostics.ts', 'utf8');
  assert.doesNotMatch(source, /from ['"](?:node:http|node:https|node:net|undici|axios|googleapis)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(|new\s+WebSocket\s*\(|from ['"].*(?:googleapis|oauth|credential)/i);
  assert.doesNotMatch(source, /from ['"].*(?:sqlite|repository)|persist(?:Collection|Measurement|Outcome|Recommendation)\s*\(|CREATE TABLE|ALTER TABLE|INSERT INTO/i);
  assert.doesNotMatch(source, /Contract<'(?:recommendation|action)'>|create(?:Recommendation|Action)/i);
  assert.doesNotMatch(source, /\b(?:OpenAI|Anthropic|BYOK|embedding|LLM)\b/i);
  assert.doesNotMatch(source, /severityScore|healthScore|priorityScore|businessImpact/i);
});
