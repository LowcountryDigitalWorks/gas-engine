import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptSearchAnalyticsEvidence,
  MAX_SEARCH_ANALYTICS_INPUT_BYTES,
  SEARCH_ANALYTICS_ADAPTER_ID,
  SEARCH_ANALYTICS_MAX_ROWS,
  SEARCH_ANALYTICS_SOURCE_SCHEMA_ID,
  SearchAnalyticsAdapterError,
  type SearchAnalyticsAdapterConfig,
  type SearchAnalyticsAdapterErrorCode,
} from '../../src/adapters/search-analytics.js';
import { canonicalJson } from '../../src/lib/canonical-json.js';
import { parseCollectionBatch } from '../../src/persistence/validation.js';

type MutableJson = Record<string, any>;
const fixtureText = readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json', 'utf8');

function fixture(): MutableJson {
  return JSON.parse(fixtureText) as MutableJson;
}

const trustedConfig: SearchAnalyticsAdapterConfig = {
  scope: {
    tenantId: 'tenant-alpha',
    siteId: 'site-alpha',
    siteScopeRevisionId: 'synthetic-scope-alpha-r1',
  },
  expectedProperty: 'sc-domain:example.test',
  providerConnectionId: 'synthetic-gsc-connection-alpha',
  collectedAt: '2026-09-16T08:06:00.000Z',
  receivedAt: '2026-09-16T08:07:00.000Z',
  availability: { state: 'available', reference: 'synthetic-search-analytics-artifact' },
};

function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
}

function expectAdapterError(action: () => unknown, code: SearchAnalyticsAdapterErrorCode): void {
  assert.throws(action, (error: unknown) =>
    error instanceof SearchAnalyticsAdapterError && error.code === code);
}

function allObservations(result: ReturnType<typeof adaptSearchAnalyticsEvidence>) {
  return result.batches.flatMap((batch) => batch.observations.map((item) => item.record));
}

function withoutExactInputHash(result: ReturnType<typeof adaptSearchAnalyticsEvidence>): unknown {
  const copy = structuredClone(result);
  delete (copy as { inputSha256?: string }).inputSha256;
  return copy;
}

function shortRows(count: number): MutableJson[] {
  return Array.from({ length: count }, (_, index) => ({
    query: `q${String(index).padStart(3, '0')}`,
    page: `https://example.test/p${index}`,
    clicks: index === 0 ? 0 : 1,
    impressions: index === 0 ? 0 : 2,
    ctr: index === 0 ? 0 : 0.5,
    averagePosition: index === 0 ? 0 : 10,
  }));
}

test('adapts exact search-analytics v1/minor0 into deterministic canonical metric observations', () => {
  const result = adaptSearchAnalyticsEvidence(bytes(fixture()), trustedConfig);
  assert.match(result.inputSha256, /^[a-f0-9]{64}$/);
  assert.equal(result.providerId, 'google-search-console');
  assert.equal(result.rows.length, 2);
  assert.equal(allObservations(result).length, 8);

  for (const batch of result.batches) {
    assert.doesNotThrow(() => parseCollectionBatch(batch));
    assert.deepEqual(batch.collection.scope, trustedConfig.scope);
    assert.equal(batch.collection.providerConnectionId, trustedConfig.providerConnectionId);
    assert.deepEqual(batch.collection.adapter, { id: SEARCH_ANALYTICS_ADAPTER_ID, version: '1.0.0' });
    assert.deepEqual(batch.collection.sourceSchema, { id: SEARCH_ANALYTICS_SOURCE_SCHEMA_ID, version: 'v1.0' });
  }

  const alpha = result.rows.find((row) => row.query === 'synthetic alpha search');
  assert.ok(alpha);
  const observations = allObservations(result);
  const clicks = observations.find((item) => item.id === alpha.observationIds.clicks);
  const impressions = observations.find((item) => item.id === alpha.observationIds.impressions);
  const ctr = observations.find((item) => item.id === alpha.observationIds.ctr);
  assert.deepEqual(clicks?.value, { state: 'observed', value: { type: 'number', value: 0 } });
  assert.deepEqual(impressions?.value, { state: 'observed', value: { type: 'number', value: 42 } });
  assert.deepEqual(ctr?.value, { state: 'observed', value: { type: 'number', value: 0 } });
});

test('trusted configuration is authority; property and injected authority-shaped evidence cannot replace it', () => {
  const result = adaptSearchAnalyticsEvidence(bytes(fixture()), trustedConfig);
  for (const batch of result.batches) {
    assert.deepEqual(batch.collection.scope, trustedConfig.scope);
    assert.equal(batch.collection.providerConnectionId, trustedConfig.providerConnectionId);
    for (const source of batch.sources) {
      assert.deepEqual(source.record.identity.scope, trustedConfig.scope);
      assert.equal(source.record.identity.providerConnectionId, trustedConfig.providerConnectionId);
    }
  }

  const wrongProperty = fixture();
  wrongProperty.property = 'sc-domain:other.example.test';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(wrongProperty), trustedConfig), 'configuration_mismatch');

  const forged = fixture();
  forged.scope = {
    tenantId: 'tenant-beta',
    siteId: 'site-beta',
    siteScopeRevisionId: 'forged-scope',
  };
  forged.providerConnectionId = 'forged-provider-connection';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(forged), trustedConfig), 'invalid_source');
});

test('rejects malformed bytes, unsupported versions/types, invalid pages, and unsupported source shapes', () => {
  expectAdapterError(
    () => adaptSearchAnalyticsEvidence(new Uint8Array(MAX_SEARCH_ANALYTICS_INPUT_BYTES + 1), trustedConfig),
    'input_too_large',
  );
  expectAdapterError(
    () => adaptSearchAnalyticsEvidence(Uint8Array.from([0xc3, 0x28]), trustedConfig),
    'invalid_utf8',
  );
  expectAdapterError(() => adaptSearchAnalyticsEvidence(Buffer.from('{', 'utf8'), trustedConfig), 'invalid_json');

  const wrongMajor = fixture();
  wrongMajor.schemaVersion = 'ldw.search-analytics-evidence.v2';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(wrongMajor), trustedConfig), 'unsupported_schema');

  const wrongMinor = fixture();
  wrongMinor.schemaMinorVersion = 1;
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(wrongMinor), trustedConfig), 'unsupported_schema');

  const wrongProvider = fixture();
  wrongProvider.provider = 'bing-webmaster-tools';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(wrongProvider), trustedConfig), 'invalid_source');

  const wrongSearchType = fixture();
  wrongSearchType.searchType = 'image';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(wrongSearchType), trustedConfig), 'invalid_source');

  const badPage = fixture();
  badPage.rows[0].page = 'http://example.test/alpha';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(badPage), trustedConfig), 'invalid_source');

  const extra = fixture();
  extra.customerId = 'not-supported';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(extra), trustedConfig), 'invalid_source');
});

test('preserves partial/preliminary coverage without manufacturing absent rows or canonical complete coverage', () => {
  const value = fixture();
  value.freshness = { dataState: 'preliminary', freshThrough: '2026-09-14T00:00:00.000Z' };
  value.coverage = {
    state: 'partial',
    truncated: true,
    anonymized: true,
    reason: 'Synthetic upstream row-limit/anonymization uncertainty.',
  };
  value.rows = [value.rows[0]];

  const result = adaptSearchAnalyticsEvidence(bytes(value), trustedConfig);
  assert.equal(result.rows.length, 1);
  assert.equal(allObservations(result).length, 4);
  assert.equal(result.batches[0]?.collection.completeness.state, 'partial');
  assert.equal(result.semantics.coverage.state, 'partial');
  assert.equal(result.semantics.freshness.dataState, 'preliminary');
});

test('input row order, filter order, and JSON formatting do not change canonical adapted output', () => {
  const leftInput = fixture();
  leftInput.filters = [
    { dimension: 'page', operator: 'contains', expression: '/alpha' },
    { dimension: 'query', operator: 'not_contains', expression: 'synthetic excluded' },
  ];
  const rightInput = structuredClone(leftInput);
  rightInput.rows.reverse();
  rightInput.filters.reverse();

  const left = adaptSearchAnalyticsEvidence(bytes(leftInput), trustedConfig);
  const right = adaptSearchAnalyticsEvidence(bytes(rightInput, true), trustedConfig);
  assert.notEqual(left.inputSha256, right.inputSha256);
  assert.equal(canonicalJson(withoutExactInputHash(left)), canonicalJson(withoutExactInputHash(right)));
});

test('duplicate query/page cohorts fail closed instead of silently merging or dropping rows', () => {
  const value = fixture();
  value.rows.push(structuredClone(value.rows[0]));
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(value), trustedConfig), 'duplicate_row');
});

test('exact 384-row bound maps to 1,536 observations; one-over fails closed without truncation', () => {
  const maximum = fixture();
  maximum.rows = shortRows(SEARCH_ANALYTICS_MAX_ROWS);
  const accepted = adaptSearchAnalyticsEvidence(bytes(maximum), trustedConfig);
  assert.equal(accepted.rows.length, SEARCH_ANALYTICS_MAX_ROWS);
  assert.equal(allObservations(accepted).length, SEARCH_ANALYTICS_MAX_ROWS * 4);
  assert.equal(accepted.batches.length, 64);
  assert.equal(accepted.batches.flatMap((batch) => batch.sources).length, SEARCH_ANALYTICS_MAX_ROWS);

  const oneOver = fixture();
  oneOver.rows = shortRows(SEARCH_ANALYTICS_MAX_ROWS + 1);
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(oneOver), trustedConfig), 'too_many_rows');
});

test('adapter executes under the repository no-network tripwire and introduces no provider client', () => {
  const result = adaptSearchAnalyticsEvidence(bytes(fixture()), trustedConfig);
  assert.equal(result.providerId, 'google-search-console');
  assert.ok(result.batches.length > 0);
});
