import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptSearchAnalyticsEvidence,
  MAX_SEARCH_ANALYTICS_INPUT_BYTES,
  SEARCH_ANALYTICS_ADAPTER_ID,
  SEARCH_ANALYTICS_CTR_ABSOLUTE_TOLERANCE,
  SEARCH_ANALYTICS_MAX_ROWS,
  SEARCH_ANALYTICS_SOURCE_SCHEMA_ID,
  SearchAnalyticsAdapterError,
  type SearchAnalyticsAdapterConfig,
  type SearchAnalyticsAdapterErrorCode,
  type SearchAnalyticsMinor1AdaptedRow,
  type SearchAnalyticsMinor1Semantics,
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
    impressions: 2,
    ctr: index === 0 ? 0 : 0.5,
    averagePosition: 10,
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

test('minor0 metric relationships fail closed while valid zero and CTR tolerance remain deterministic', () => {
  assert.equal(SEARCH_ANALYTICS_CTR_ABSOLUTE_TOLERANCE, 1e-12);

  const validZero = fixture();
  validZero.rows = [{
    query: 'synthetic valid zero',
    page: 'https://example.test/valid-zero',
    clicks: 0,
    impressions: 100,
    ctr: 0,
    averagePosition: 10,
  }];
  const zeroResult = adaptSearchAnalyticsEvidence(bytes(validZero), trustedConfig);
  const zeroObservations = allObservations(zeroResult);
  const zeroRow = zeroResult.rows[0]!;
  assert.deepEqual(
    zeroObservations.find((item) => item.id === zeroRow.observationIds.clicks)?.value,
    { state: 'observed', value: { type: 'number', value: 0 } },
  );
  assert.deepEqual(
    zeroObservations.find((item) => item.id === zeroRow.observationIds.ctr)?.value,
    { state: 'observed', value: { type: 'number', value: 0 } },
  );

  const clicksOverImpressions = fixture();
  clicksOverImpressions.rows[0] = {
    query: 'synthetic invalid clicks',
    page: 'https://example.test/invalid-clicks',
    clicks: 11,
    impressions: 10,
    ctr: 1,
    averagePosition: 10,
  };
  expectAdapterError(
    () => adaptSearchAnalyticsEvidence(bytes(clicksOverImpressions), trustedConfig),
    'invalid_source',
  );

  const zeroImpressions = fixture();
  zeroImpressions.rows[0] = {
    query: 'synthetic invalid impressions',
    page: 'https://example.test/invalid-impressions',
    clicks: 0,
    impressions: 0,
    ctr: 0,
    averagePosition: 10,
  };
  expectAdapterError(
    () => adaptSearchAnalyticsEvidence(bytes(zeroImpressions), trustedConfig),
    'invalid_source',
  );

  const invalidPosition = fixture();
  invalidPosition.rows[0] = {
    query: 'synthetic invalid position',
    page: 'https://example.test/invalid-position',
    clicks: 1,
    impressions: 8,
    ctr: 0.125,
    averagePosition: 0.999,
  };
  expectAdapterError(
    () => adaptSearchAnalyticsEvidence(bytes(invalidPosition), trustedConfig),
    'invalid_source',
  );

  const inconsistentCtr = fixture();
  inconsistentCtr.rows[0] = {
    query: 'synthetic inconsistent ctr',
    page: 'https://example.test/inconsistent-ctr',
    clicks: 1,
    impressions: 8,
    ctr: 0.1,
    averagePosition: 10,
  };
  expectAdapterError(
    () => adaptSearchAnalyticsEvidence(bytes(inconsistentCtr), trustedConfig),
    'invalid_source',
  );

  const exactCtr = fixture();
  exactCtr.rows[0] = {
    query: 'synthetic exact ctr',
    page: 'https://example.test/exact-ctr',
    clicks: 1,
    impressions: 8,
    ctr: 0.125,
    averagePosition: 10,
  };
  assert.doesNotThrow(() => adaptSearchAnalyticsEvidence(bytes(exactCtr), trustedConfig));

  const withinTolerance = fixture();
  withinTolerance.rows[0] = {
    query: 'synthetic within tolerance',
    page: 'https://example.test/within-tolerance',
    clicks: 1,
    impressions: 8,
    ctr: 0.125 + (SEARCH_ANALYTICS_CTR_ABSOLUTE_TOLERANCE / 2),
    averagePosition: 10,
  };
  assert.doesNotThrow(() => adaptSearchAnalyticsEvidence(bytes(withinTolerance), trustedConfig));

  const outsideTolerance = fixture();
  outsideTolerance.rows[0] = {
    query: 'synthetic outside tolerance',
    page: 'https://example.test/outside-tolerance',
    clicks: 1,
    impressions: 8,
    ctr: 0.125 + (SEARCH_ANALYTICS_CTR_ABSOLUTE_TOLERANCE * 2),
    averagePosition: 10,
  };
  expectAdapterError(
    () => adaptSearchAnalyticsEvidence(bytes(outsideTolerance), trustedConfig),
    'invalid_source',
  );
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
  wrongMinor.schemaMinorVersion = 2;
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(wrongMinor), trustedConfig), 'unsupported_schema');

  const minor1MissingModality = fixture();
  minor1MissingModality.schemaMinorVersion = 1;
  minor1MissingModality.reportFamily = 'search-performance';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(minor1MissingModality), trustedConfig), 'invalid_source');

  const minor1Combined = fixture();
  minor1Combined.schemaMinorVersion = 1;
  minor1Combined.reportFamily = 'search-performance';
  minor1Combined.webModality = 'combined';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(minor1Combined), trustedConfig), 'invalid_source');

  const minor1WrongFamily = fixture();
  minor1WrongFamily.schemaMinorVersion = 1;
  minor1WrongFamily.reportFamily = 'page-focus';
  minor1WrongFamily.webModality = 'text_based';
  expectAdapterError(() => adaptSearchAnalyticsEvidence(bytes(minor1WrongFamily), trustedConfig), 'invalid_source');

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

const minor1TextFixtureText = readFileSync('tests/fixtures/search-analytics-evidence-v1.1-text-based.json', 'utf8');
const minor1MultimodalFixtureText = readFileSync('tests/fixtures/search-analytics-evidence-v1.1-multimodal.json', 'utf8');

const LEGACY_APPLICATION_SEMANTICS_KEYS = [
  'coverage',
  'dimensions',
  'effectiveWindow',
  'exportedAt',
  'filterGroupType',
  'filters',
  'freshness',
  'observedAt',
  'property',
  'requestedWindow',
  'searchType',
] as const;

const LEGACY_APPLICATION_ROW_KEYS = [
  'observationIds',
  'page',
  'pageId',
  'query',
  'queryId',
  'rowIdentity',
  'searchType',
  'sourceId',
  'sourceRecordId',
] as const;

test('minor0 application-local semantics and rows preserve accepted pre-0.24 field shape exactly', () => {
  const result = adaptSearchAnalyticsEvidence(bytes(fixture()), trustedConfig);
  assert.deepEqual(Object.keys(result.semantics).sort(), [...LEGACY_APPLICATION_SEMANTICS_KEYS].sort());
  assert.equal(Object.hasOwn(result.semantics, 'schemaMinorVersion'), false);
  assert.equal(Object.hasOwn(result.semantics, 'reportFamily'), false);
  assert.equal(Object.hasOwn(result.semantics, 'webModality'), false);
  assert.deepEqual(result.semantics, {
    property: 'sc-domain:example.test',
    observedAt: '2026-09-16T08:00:00.000Z',
    exportedAt: '2026-09-16T08:05:00.000Z',
    requestedWindow: {
      start: '2026-09-08T00:00:00.000Z',
      end: '2026-09-15T00:00:00.000Z',
    },
    effectiveWindow: {
      start: '2026-09-08T00:00:00.000Z',
      end: '2026-09-15T00:00:00.000Z',
    },
    freshness: {
      dataState: 'final',
      freshThrough: '2026-09-15T00:00:00.000Z',
    },
    searchType: 'web',
    dimensions: ['query', 'page'],
    filterGroupType: 'and',
    filters: [],
    coverage: {
      state: 'complete',
      truncated: false,
      anonymized: false,
    },
  });
  for (const row of result.rows) {
    assert.deepEqual(Object.keys(row).sort(), [...LEGACY_APPLICATION_ROW_KEYS].sort());
    assert.equal(Object.hasOwn(row, 'schemaMinorVersion'), false);
    assert.equal(Object.hasOwn(row, 'reportFamily'), false);
    assert.equal(Object.hasOwn(row, 'webModality'), false);
  }
  assert.deepEqual(withoutExactInputHash(result), withoutExactInputHash(adaptSearchAnalyticsEvidence(bytes(fixture()), trustedConfig)));
});

const PROTECTED_MAIN_MINOR0_IDENTITIES = {
  collectionId: 'gsc.collection:67c96c6643b7e05e0c54128f22822289bee55f586c04dd7471cae8e1eb354b5e',
  idempotencyKey: 'gsc.idempotency:67c96c6643b7e05e0c54128f22822289bee55f586c04dd7471cae8e1eb354b5e',
  alpha: {
    rowIdentity: 'gsc.row:672f447d0752c5cf7bb55aee4808dd5661019db06b7030584711728730153a85',
    sourceRecordId: 'gsc.row:672f447d0752c5cf7bb55aee4808dd5661019db06b7030584711728730153a85',
    sourceId: 'gsc.src:d621004a7f969dbb4083abbc5285ccfd99372de7cf5098dd868e90859fc5b317',
    observationIds: {
      clicks: 'gsc.obs:6497a9a2131768ac0d4714b0f90d6701c72a4bbd665b3dc753bb9517e83e0634',
      impressions: 'gsc.obs:23f87e39b90f1f953da8d076671b36d808017de45b012d3bc46bd7b138340c82',
      ctr: 'gsc.obs:d49781d9af5690bc94c2d28c7b3e8a1a7e19c1969cab4f395751bd9cb1d0428b',
      averagePosition: 'gsc.obs:721661535983d9c6c75a706ce32ee1a5d40389f44e1bdbe3d8b952175b793def',
    },
  },
  beta: {
    rowIdentity: 'gsc.row:66941e286f6e886d4dea0b402143ee733aa3b5dd989eac6d27528890a046c98c',
    sourceRecordId: 'gsc.row:66941e286f6e886d4dea0b402143ee733aa3b5dd989eac6d27528890a046c98c',
    sourceId: 'gsc.src:a691e4b6e0a560a7fd8b9480a8a7b49efdec55c0d64bb124a7dcf0b083e22e3a',
    observationIds: {
      clicks: 'gsc.obs:cc1f206c84ae7a1fca6aae534403dcef033ca98ccbf8bdb556edd391ba737c04',
      impressions: 'gsc.obs:b9c2e9ee2ffd93c0d50a79e830d55bc25613af76754be6beb5e2241cfa1855b1',
      ctr: 'gsc.obs:bf1cb4fb77eda5d610ad81dcdfa8e72ad0214f31ef3961cbfe2c8b2244d7ebc7',
      averagePosition: 'gsc.obs:2d0f59d88e454990424b85050083b36099277bdd5567a158e7e1dda29eb54260',
    },
  },
  methodConfigurationId: 'gsc-config:f132b9509f7983ea3f72566b22b59aab3342a78f56c55869532fe62cd961a1ed',
  methodConfigurationRevision: 1,
} as const;

test('minor0 canonical identities match protected main Release 0.23 adapter material', () => {
  const result = adaptSearchAnalyticsEvidence(bytes(fixture()), trustedConfig);
  assert.equal(result.collectionId, PROTECTED_MAIN_MINOR0_IDENTITIES.collectionId);
  assert.equal(result.idempotencyKey, PROTECTED_MAIN_MINOR0_IDENTITIES.idempotencyKey);

  const alpha = result.rows.find((row) => row.query === 'synthetic alpha search');
  const beta = result.rows.find((row) => row.query === 'synthetic beta search');
  assert.ok(alpha);
  assert.ok(beta);
  assert.deepEqual(
    {
      rowIdentity: alpha.rowIdentity,
      sourceRecordId: alpha.sourceRecordId,
      sourceId: alpha.sourceId,
      observationIds: alpha.observationIds,
    },
    PROTECTED_MAIN_MINOR0_IDENTITIES.alpha,
  );
  assert.deepEqual(
    {
      rowIdentity: beta.rowIdentity,
      sourceRecordId: beta.sourceRecordId,
      sourceId: beta.sourceId,
      observationIds: beta.observationIds,
    },
    PROTECTED_MAIN_MINOR0_IDENTITIES.beta,
  );

  const method = result.batches[0]!.collection.method;
  assert.equal(method.configurationId, PROTECTED_MAIN_MINOR0_IDENTITIES.methodConfigurationId);
  assert.equal(method.configurationRevision, PROTECTED_MAIN_MINOR0_IDENTITIES.methodConfigurationRevision);
});

test('minor1 text_based and multimodal adapt with distinct mapping, source schema, method, and row identities', () => {
  const textBased = adaptSearchAnalyticsEvidence(Buffer.from(minor1TextFixtureText, 'utf8'), trustedConfig);
  const multimodal = adaptSearchAnalyticsEvidence(Buffer.from(minor1MultimodalFixtureText, 'utf8'), trustedConfig);

  for (const result of [textBased, multimodal]) {
    const semantics = result.semantics as SearchAnalyticsMinor1Semantics;
    assert.equal(Object.hasOwn(result.semantics, 'schemaMinorVersion'), false);
    assert.equal(semantics.reportFamily, 'search-performance');
    assert.ok(semantics.webModality === 'text_based' || semantics.webModality === 'multimodal');
    for (const row of result.rows) {
      const minor1Row = row as SearchAnalyticsMinor1AdaptedRow;
      assert.equal(Object.hasOwn(row, 'schemaMinorVersion'), false);
      assert.equal(minor1Row.reportFamily, semantics.reportFamily);
      assert.equal(minor1Row.webModality, semantics.webModality);
    }
    for (const batch of result.batches) {
      assert.deepEqual(batch.collection.adapter, { id: SEARCH_ANALYTICS_ADAPTER_ID, version: '1.1.0' });
      assert.deepEqual(batch.collection.sourceSchema, { id: SEARCH_ANALYTICS_SOURCE_SCHEMA_ID, version: 'v1.1' });
      assert.equal(batch.collection.method.version, '1.1.0');
      assert.equal(batch.collection.method.configurationRevision, 2);
    }
  }

  assert.notEqual(textBased.collectionId, multimodal.collectionId);
  assert.notEqual(textBased.rows[0]!.rowIdentity, multimodal.rows[0]!.rowIdentity);
  assert.equal(textBased.rows[0]!.query, multimodal.rows[0]!.query);
  assert.equal(textBased.rows[0]!.page, multimodal.rows[0]!.page);
  assert.deepEqual(
    allObservations(textBased).find((item) => item.id === textBased.rows[0]!.observationIds.clicks)?.value,
    allObservations(multimodal).find((item) => item.id === multimodal.rows[0]!.observationIds.clicks)?.value,
  );
});
