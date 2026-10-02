import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptWqtNormalizedEvidence,
  resolveWqtProviderSnapshots,
  WqtAdapterError,
  type WqtAdapterConfig,
  type WqtAdaptationResult,
} from '../../src/adapters/wqt.js';
import { compareEvidenceSnapshots, EvidenceDiffError } from '../../src/analysis/diff.js';

type MutableJson = Record<string, any>;
const minor1Text = readFileSync('tests/fixtures/wqt-normalized-v1.1.json', 'utf8');
const minor2Text = readFileSync('tests/fixtures/wqt-normalized-v1.2.json', 'utf8');

const trustedConfig: WqtAdapterConfig = {
  scope: {
    tenantId: 'tenant-alpha',
    siteId: 'site-alpha',
    siteScopeRevisionId: 'synthetic-scope-alpha-r1',
  },
  expectedSiteId: 'example-site',
  expectedTargetOrigin: 'https://example.test',
  providerConnectionIds: {
    siteone: 'synthetic-siteone-connection',
    lighthouse: 'synthetic-lighthouse-connection',
  },
  timing: {
    observedAt: '2026-10-02T00:05:00.000Z',
    startedAt: '2026-10-02T00:00:00.000Z',
    endedAt: '2026-10-02T00:04:00.000Z',
    collectedAt: '2026-10-02T00:06:00.000Z',
    receivedAt: '2026-10-02T00:07:00.000Z',
  },
  availability: {
    siteone: { state: 'available', reference: 'synthetic-wqt-siteone-artifact' },
    lighthouse: { state: 'available', reference: 'synthetic-wqt-lighthouse-artifact' },
  },
};

function bytes(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function refreshFlattened(value: MutableJson): void {
  value.observations = [
    ...value.sources.siteone.observations,
    ...value.sources.lighthouse.observations,
  ].sort((left: MutableJson, right: MutableJson) =>
    `${left.source}:${left.code}`.localeCompare(`${right.source}:${right.code}`));
}

function minor1(): MutableJson {
  return JSON.parse(minor1Text) as MutableJson;
}

function minor2(): MutableJson {
  return JSON.parse(minor2Text) as MutableJson;
}

function minor3(): MutableJson {
  const value = minor2();
  value.schemaMinorVersion = 3;
  value.sources.siteone.observations.push({
    source: 'siteone',
    code: 'crawl-skipped-urls',
    sourceStatus: 'NOTICE',
    message: 'Synthetic skipped URL context.',
    facts: [
      { id: 'skipped-url-count', valueType: 'number', value: 7, unit: 'count' },
      { id: 'external-not-allowed-host-count', valueType: 'number', value: 2, unit: 'count' },
      { id: 'internal-skipped-url-count', valueType: 'number', value: 4, unit: 'count' },
      { id: 'other-skipped-url-count', valueType: 'number', value: 1, unit: 'count' },
    ],
  });
  refreshFlattened(value);
  return value;
}

function provider(result: WqtAdaptationResult, id: 'siteone' | 'lighthouse') {
  const found = result.collections.find((item) => item.providerId === id);
  assert.ok(found);
  return found;
}

test('Release 0.18 deliberately accepts WQT minor 3 through generic typed-fact machinery', () => {
  const result = adaptWqtNormalizedEvidence(bytes(minor3()), trustedConfig);
  const siteone = provider(result, 'siteone');
  const collection = siteone.batches[0]!.collection;
  assert.deepEqual(collection.adapter, { id: 'ldw-wqt-normalized', version: '3.0.0' });
  assert.deepEqual(collection.sourceSchema, { id: 'ldw.website-quality', version: 'v1.3' });
  assert.equal(collection.method.version, '3.0.0');
  assert.equal(collection.method.configurationRevision, 3);

  const observations = siteone.batches.flatMap((batch) => batch.observations.map((item) => item.record));
  const expected = new Map([
    ['wqt-siteone-fact-skipped-url-count', 7],
    ['wqt-siteone-fact-external-not-allowed-host-count', 2],
    ['wqt-siteone-fact-internal-skipped-url-count', 4],
    ['wqt-siteone-fact-other-skipped-url-count', 1],
  ]);
  for (const [metricId, expectedValue] of expected) {
    const observation = observations.find((item) => item.cohort.context.metric.id === metricId);
    assert.ok(observation);
    assert.equal(observation.cohort.context.metric.valueType, 'number');
    assert.equal(observation.cohort.context.metric.unit, 'count');
    assert.deepEqual(observation.value, {
      state: 'observed',
      value: { type: 'number', value: expectedValue },
    });
  }

  const production = readFileSync('src/adapters/wqt.ts', 'utf8');
  assert.doesNotMatch(
    production,
    /skipped-url-count|external-not-allowed-host-count|internal-skipped-url-count|other-skipped-url-count/,
    'minor-3 count facts must not be special-cased in production logic',
  );
});

test('Release 0.18 preserves exact minor1/minor2 identities and future minors fail closed', () => {
  const one = provider(adaptWqtNormalizedEvidence(bytes(minor1()), trustedConfig), 'siteone').batches[0]!.collection;
  const two = provider(adaptWqtNormalizedEvidence(bytes(minor2()), trustedConfig), 'siteone').batches[0]!.collection;
  assert.deepEqual(one.adapter, { id: 'ldw-wqt-normalized', version: '1.0.0' });
  assert.deepEqual(one.sourceSchema, { id: 'ldw.website-quality', version: 'v1.1' });
  assert.equal(one.method.configurationRevision, 1);
  assert.deepEqual(two.adapter, { id: 'ldw-wqt-normalized', version: '2.0.0' });
  assert.deepEqual(two.sourceSchema, { id: 'ldw.website-quality', version: 'v1.2' });
  assert.equal(two.method.configurationRevision, 2);

  const future = minor3();
  future.schemaMinorVersion = 4;
  assert.throws(
    () => adaptWqtNormalizedEvidence(bytes(future), trustedConfig),
    (error: unknown) => error instanceof WqtAdapterError && error.code === 'unsupported_schema',
  );
});

test('Release 0.18 keeps minor2/minor3 as an ordinary semantic discontinuity', () => {
  const baseline = resolveWqtProviderSnapshots(adaptWqtNormalizedEvidence(bytes(minor2()), trustedConfig))[0];
  const current = resolveWqtProviderSnapshots(adaptWqtNormalizedEvidence(bytes(minor3()), trustedConfig))[0];
  assert.throws(
    () => compareEvidenceSnapshots(baseline, current),
    (error: unknown) => error instanceof EvidenceDiffError && error.code === 'collection_discontinuity',
  );
});

test('Release 0.18 resolves exact complete provider snapshots from bounded multipart adapter output', () => {
  const value = minor3();
  value.sources.lighthouse.categoryScores = Array.from({ length: 40 }, (_, index) => ({
    id: `synthetic-category-${String(index).padStart(3, '0')}`,
    title: `Synthetic category ${index}`,
    score: index === 0 ? 0 : 0.5,
  }));
  refreshFlattened(value);
  const adapted = adaptWqtNormalizedEvidence(bytes(value), trustedConfig);
  assert.ok(provider(adapted, 'lighthouse').batches.length > 1);

  const [siteone, lighthouse] = resolveWqtProviderSnapshots(adapted);
  assert.equal(siteone.providerId, 'siteone');
  assert.equal(lighthouse.providerId, 'lighthouse');
  assert.equal(siteone.collection.id, provider(adapted, 'siteone').collectionId);
  assert.equal(lighthouse.collection.id, provider(adapted, 'lighthouse').collectionId);
  assert.equal(
    lighthouse.collection.completeness.receivedCount,
    provider(adapted, 'lighthouse').batches.flatMap((batch) => batch.sources).length,
  );
  assert.deepEqual(
    lighthouse.observations.map((item) => item.id),
    [...lighthouse.observations.map((item) => item.id)].sort(),
  );
});

test('Release 0.18 WQT snapshot resolution fails closed on broken multipart material', () => {
  const value = minor3();
  value.sources.lighthouse.categoryScores = Array.from({ length: 40 }, (_, index) => ({
    id: `synthetic-category-${String(index).padStart(3, '0')}`,
    title: `Synthetic category ${index}`,
    score: 0.5,
  }));
  refreshFlattened(value);
  const adapted = structuredClone(adaptWqtNormalizedEvidence(bytes(value), trustedConfig));
  const lighthouse = provider(adapted, 'lighthouse');
  assert.ok(lighthouse.batches.length > 1);

  const missing = structuredClone(adapted);
  (provider(missing, 'lighthouse').batches as any[]).pop();
  assert.throws(
    () => resolveWqtProviderSnapshots(missing),
    (error: unknown) => error instanceof WqtAdapterError && error.code === 'invalid_output',
  );

  const inconsistent = structuredClone(adapted);
  (provider(inconsistent, 'lighthouse').batches[1] as any).idempotencyKey = 'tampered';
  assert.throws(
    () => resolveWqtProviderSnapshots(inconsistent),
    (error: unknown) => error instanceof WqtAdapterError && error.code === 'invalid_output',
  );

  const duplicateObservation = structuredClone(adapted);
  const stream = provider(duplicateObservation, 'lighthouse');
  const firstObservation = stream.batches[0]!.observations[0];
  assert.ok(firstObservation);
  (stream.batches[1]!.observations as any[]).push(structuredClone(firstObservation));
  assert.throws(
    () => resolveWqtProviderSnapshots(duplicateObservation),
    (error: unknown) => error instanceof WqtAdapterError && error.code === 'invalid_output',
  );
});
