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
    observedAt: '2026-10-04T20:00:00.000Z',
    startedAt: '2026-10-04T19:55:00.000Z',
    endedAt: '2026-10-04T19:59:00.000Z',
    collectedAt: '2026-10-04T20:01:00.000Z',
    receivedAt: '2026-10-04T20:02:00.000Z',
  },
  availability: {
    siteone: { state: 'available', reference: 'synthetic-wqt-siteone-artifact' },
    lighthouse: { state: 'available', reference: 'synthetic-wqt-lighthouse-artifact' },
  },
};

function minor1(): MutableJson {
  return JSON.parse(minor1Text) as MutableJson;
}

function minor2(): MutableJson {
  return JSON.parse(minor2Text) as MutableJson;
}

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

function repeatedFindings(minor: 1 | 2 | 3): MutableJson {
  const value = minor === 1 ? minor1() : minor2();
  value.schemaMinorVersion = minor;
  const facts10 = minor === 1 ? {} : {
    facts: [{ id: 'protocol-order', valueType: 'number', value: 10, unit: 'count' }],
  };
  const facts11 = minor === 1 ? {} : {
    facts: [{ id: 'protocol-order', valueType: 'number', value: 11, unit: 'count' }],
  };
  value.sources.siteone.observations.push(
    {
      source: 'siteone',
      code: 'ssl-protocol-unsafe',
      sourceStatus: 'TLS10_UNSAFE',
      message: 'Synthetic TLSv1.0 protocol finding.',
      ...facts10,
    },
    {
      source: 'siteone',
      code: 'ssl-protocol-unsafe',
      sourceStatus: 'TLS11_UNSAFE',
      message: 'Synthetic TLSv1.1 protocol finding.',
      ...facts11,
    },
  );
  refreshFlattened(value);
  return value;
}

function provider(result: WqtAdaptationResult, id: 'siteone' | 'lighthouse') {
  const found = result.collections.find((item) => item.providerId === id);
  assert.ok(found);
  return found;
}

function siteOneObservationRows(result: WqtAdaptationResult): any[] {
  return provider(result, 'siteone').batches.flatMap((batch) => batch.observations);
}

function observedText(record: any): string | undefined {
  return record.value?.state === 'observed' && record.value?.value?.type === 'text'
    ? record.value.value.value
    : undefined;
}

function statusRecord(result: WqtAdaptationResult, value: string): any {
  const row = siteOneObservationRows(result).find((item) =>
    item.record.cohort.context.metric.id === 'wqt-siteone-source-status'
    && observedText(item.record) === value);
  assert.ok(row, `expected status observation ${value}`);
  return row.record;
}

function factRecordForSource(result: WqtAdaptationResult, sourceRecordId: string): any {
  const row = siteOneObservationRows(result).find((item) =>
    item.record.cohort.context.metric.id === 'wqt-siteone-fact-protocol-order'
    && item.record.provenance.source.sourceRecordId === sourceRecordId);
  assert.ok(row, `expected fact observation for ${sourceRecordId}`);
  return row.record;
}

function expectDuplicateSourceKey(value: MutableJson): void {
  assert.throws(
    () => adaptWqtNormalizedEvidence(bytes(value), trustedConfig),
    (error: unknown) => error instanceof WqtAdapterError && error.code === 'duplicate_source_key',
  );
}

test('Maintenance 0.18.1 accepts deterministic distinct same-code SiteOne findings for minors 1/2/3', () => {
  const expected = new Map<number, readonly [string, string, number]>([
    [1, ['1.0.0', 'v1.1', 1]],
    [2, ['2.0.0', 'v1.2', 2]],
    [3, ['3.0.0', 'v1.3', 3]],
  ]);

  for (const minor of [1, 2, 3] as const) {
    const result = adaptWqtNormalizedEvidence(bytes(repeatedFindings(minor)), trustedConfig);
    const first = statusRecord(result, 'TLS10_UNSAFE');
    const second = statusRecord(result, 'TLS11_UNSAFE');
    assert.notEqual(first.provenance.source.sourceRecordId, second.provenance.source.sourceRecordId);
    assert.notEqual(first.cohort.id, second.cohort.id);
    assert.notEqual(first.cohort.context.dimensions.surface, second.cohort.context.dimensions.surface);

    const collection = provider(result, 'siteone').batches[0]!.collection;
    const [mappingVersion, sourceSchemaVersion, revision] = expected.get(minor)!;
    assert.deepEqual(collection.adapter, { id: 'ldw-wqt-normalized', version: mappingVersion });
    assert.deepEqual(collection.sourceSchema, { id: 'ldw.website-quality', version: sourceSchemaVersion });
    assert.equal(collection.method.version, mappingVersion);
    assert.equal(collection.method.configurationRevision, revision);
  }
});

test('Maintenance 0.18.1 repeated finding order is canonical and replay is idempotent', () => {
  const value = repeatedFindings(3);
  const first = adaptWqtNormalizedEvidence(bytes(value), trustedConfig);
  const replay = adaptWqtNormalizedEvidence(bytes(value), trustedConfig);
  assert.deepEqual(replay, first);

  const swapped = structuredClone(value);
  const observations = swapped.sources.siteone.observations as any[];
  const indexes = observations
    .map((item, index) => item.code === 'ssl-protocol-unsafe' ? index : -1)
    .filter((index) => index >= 0);
  assert.equal(indexes.length, 2);
  const left = observations[indexes[0]!]!;
  observations[indexes[0]!] = observations[indexes[1]!]!;
  observations[indexes[1]!] = left;
  refreshFlattened(swapped);
  const reordered = adaptWqtNormalizedEvidence(bytes(swapped), trustedConfig);

  assert.notEqual(reordered.inputSha256, first.inputSha256, 'exact input byte hash may reflect source ordering');
  assert.deepEqual(reordered.collections, first.collections, 'semantic provider output must not depend on repeated-finding occurrence order');
});

test('Maintenance 0.18.1 mutable status/fact values preserve duplicate variant cohort and source identity', () => {
  const baselineValue = repeatedFindings(2);
  const baseline = adaptWqtNormalizedEvidence(bytes(baselineValue), trustedConfig);
  const baselineStatus = statusRecord(baseline, 'TLS10_UNSAFE');
  const baselineSourceId = baselineStatus.provenance.source.sourceRecordId;
  const baselineFact = factRecordForSource(baseline, baselineSourceId);

  const statusChangedValue = structuredClone(baselineValue);
  const statusFinding = statusChangedValue.sources.siteone.observations.find((item: any) =>
    item.code === 'ssl-protocol-unsafe' && item.message === 'Synthetic TLSv1.0 protocol finding.');
  assert.ok(statusFinding);
  statusFinding.sourceStatus = 'TLS10_CHANGED';
  refreshFlattened(statusChangedValue);
  const statusChanged = adaptWqtNormalizedEvidence(bytes(statusChangedValue), trustedConfig);
  const changedStatus = statusRecord(statusChanged, 'TLS10_CHANGED');
  assert.equal(changedStatus.provenance.source.sourceRecordId, baselineSourceId);
  assert.equal(changedStatus.cohort.id, baselineStatus.cohort.id);
  assert.equal(changedStatus.cohort.context.dimensions.surface, baselineStatus.cohort.context.dimensions.surface);
  assert.notEqual(changedStatus.id, baselineStatus.id, 'changed observed status must alter exact observation provenance identity');

  const factChangedValue = structuredClone(baselineValue);
  const factFinding = factChangedValue.sources.siteone.observations.find((item: any) =>
    item.code === 'ssl-protocol-unsafe' && item.message === 'Synthetic TLSv1.0 protocol finding.');
  assert.ok(factFinding);
  factFinding.facts[0].value = 12;
  refreshFlattened(factChangedValue);
  const factChanged = adaptWqtNormalizedEvidence(bytes(factChangedValue), trustedConfig);
  const factChangedStatus = statusRecord(factChanged, 'TLS10_UNSAFE');
  const changedFact = factRecordForSource(factChanged, factChangedStatus.provenance.source.sourceRecordId);
  assert.equal(factChangedStatus.provenance.source.sourceRecordId, baselineSourceId);
  assert.equal(changedFact.cohort.id, baselineFact.cohort.id);
  assert.equal(changedFact.cohort.context.dimensions.surface, baselineFact.cohort.context.dimensions.surface);
  assert.notEqual(changedFact.id, baselineFact.id, 'changed fact value must alter exact observation provenance identity');
});

test('Maintenance 0.18.1 stable descriptor changes and unique/multiple transitions are conservative discontinuities', () => {
  const repeated = repeatedFindings(2);
  const repeatedResult = adaptWqtNormalizedEvidence(bytes(repeated), trustedConfig);
  const repeatedTls10 = statusRecord(repeatedResult, 'TLS10_UNSAFE');

  const messageChanged = structuredClone(repeated);
  const messageFinding = messageChanged.sources.siteone.observations.find((item: any) =>
    item.code === 'ssl-protocol-unsafe' && item.sourceStatus === 'TLS10_UNSAFE');
  assert.ok(messageFinding);
  messageFinding.message = 'Synthetic TLSv1.0 protocol finding with changed stable shape.';
  refreshFlattened(messageChanged);
  const messageResult = adaptWqtNormalizedEvidence(bytes(messageChanged), trustedConfig);
  const messageTls10 = statusRecord(messageResult, 'TLS10_UNSAFE');
  assert.notEqual(messageTls10.provenance.source.sourceRecordId, repeatedTls10.provenance.source.sourceRecordId);
  assert.notEqual(messageTls10.cohort.id, repeatedTls10.cohort.id);
  assert.notEqual(messageTls10.cohort.context.dimensions.surface, repeatedTls10.cohort.context.dimensions.surface);

  const unique = minor2();
  unique.sources.siteone.observations.push(structuredClone(
    repeated.sources.siteone.observations.find((item: any) =>
      item.code === 'ssl-protocol-unsafe' && item.sourceStatus === 'TLS10_UNSAFE'),
  ));
  refreshFlattened(unique);
  const uniqueResult = adaptWqtNormalizedEvidence(bytes(unique), trustedConfig);
  const uniqueTls10 = statusRecord(uniqueResult, 'TLS10_UNSAFE');
  assert.equal(uniqueTls10.provenance.source.sourceRecordId, 'wqt.siteone.finding:ssl-protocol-unsafe');
  assert.notEqual(uniqueTls10.provenance.source.sourceRecordId, repeatedTls10.provenance.source.sourceRecordId);
  assert.notEqual(uniqueTls10.cohort.id, repeatedTls10.cohort.id);
});

test('Maintenance 0.18.1 ambiguous same-code stable descriptors fail closed despite mutable differences', () => {
  const exact = repeatedFindings(2);
  const first = exact.sources.siteone.observations.find((item: any) =>
    item.code === 'ssl-protocol-unsafe' && item.sourceStatus === 'TLS10_UNSAFE');
  assert.ok(first);
  exact.sources.siteone.observations = exact.sources.siteone.observations
    .filter((item: any) => item.code !== 'ssl-protocol-unsafe');
  exact.sources.siteone.observations.push(structuredClone(first), structuredClone(first));
  refreshFlattened(exact);
  expectDuplicateSourceKey(exact);

  const mutableOnly = repeatedFindings(2);
  const tls10 = mutableOnly.sources.siteone.observations.find((item: any) =>
    item.code === 'ssl-protocol-unsafe' && item.sourceStatus === 'TLS10_UNSAFE');
  assert.ok(tls10);
  const collision = structuredClone(tls10);
  collision.sourceStatus = 'DIFFERENT_STATUS';
  collision.facts[0].value = 99;
  mutableOnly.sources.siteone.observations = mutableOnly.sources.siteone.observations
    .filter((item: any) => item.code !== 'ssl-protocol-unsafe');
  mutableOnly.sources.siteone.observations.push(tls10, collision);
  refreshFlattened(mutableOnly);
  expectDuplicateSourceKey(mutableOnly);
});

test('Maintenance 0.18.1 preserves existing unique finding/category/audit semantics', () => {
  const value = minor2();
  const baseline = adaptWqtNormalizedEvidence(bytes(value), trustedConfig);
  const affectedFact = siteOneObservationRows(baseline).find((item) =>
    item.record.cohort.context.metric.id === 'wqt-siteone-fact-affected-resource-count');
  assert.ok(affectedFact);
  assert.equal(affectedFact.record.provenance.source.sourceRecordId, 'wqt.siteone.finding:static-assets-short-cache');
  assert.equal(
    affectedFact.record.cohort.id,
    'wqt.cohort.siteone.finding:static-assets-short-cache:fact:affected-resource-count',
  );
  assert.equal(
    affectedFact.record.cohort.context.dimensions.surface,
    'wqt.surface:finding:static-assets-short-cache',
  );

  const wordingOnly = structuredClone(value);
  const finding = wordingOnly.sources.siteone.observations.find((item: any) => item.code === 'static-assets-short-cache');
  assert.ok(finding);
  finding.message = 'Synthetic wording-only update with the same unique source code.';
  refreshFlattened(wordingOnly);
  const changed = adaptWqtNormalizedEvidence(bytes(wordingOnly), trustedConfig);
  const changedFact = siteOneObservationRows(changed).find((item) =>
    item.record.cohort.context.metric.id === 'wqt-siteone-fact-affected-resource-count');
  assert.ok(changedFact);
  assert.equal(changedFact.record.provenance.source.sourceRecordId, affectedFact.record.provenance.source.sourceRecordId);
  assert.equal(changedFact.record.cohort.id, affectedFact.record.cohort.id);
  assert.equal(changedFact.record.cohort.context.dimensions.surface, affectedFact.record.cohort.context.dimensions.surface);
  assert.notEqual(changedFact.record.id, affectedFact.record.id);

  const duplicateCategory = minor2();
  duplicateCategory.sources.siteone.categoryScores.push(structuredClone(duplicateCategory.sources.siteone.categoryScores[0]));
  expectDuplicateSourceKey(duplicateCategory);

  const duplicateAudit = minor2();
  duplicateAudit.sources.lighthouse.observations.push(structuredClone(duplicateAudit.sources.lighthouse.observations[0]));
  expectDuplicateSourceKey(duplicateAudit);
});

test('Maintenance 0.18.1 provider snapshot reconstruction retains repeated-code SiteOne streams', () => {
  const adapted = adaptWqtNormalizedEvidence(bytes(repeatedFindings(3)), trustedConfig);
  const [siteone, lighthouse] = resolveWqtProviderSnapshots(adapted);
  assert.equal(siteone.providerId, 'siteone');
  assert.equal(lighthouse.providerId, 'lighthouse');
  const statuses = siteone.observations
    .filter((item) => item.cohort.context.metric.id === 'wqt-siteone-source-status')
    .map((item: any) => observedText(item))
    .filter((item): item is string => item !== undefined);
  assert.ok(statuses.includes('TLS10_UNSAFE'));
  assert.ok(statuses.includes('TLS11_UNSAFE'));
  assert.equal(new Set(siteone.observations.map((item) => item.id)).size, siteone.observations.length);
});

test('Maintenance 0.18.1 keeps the generic Release 0.7 comparator WQT-free', () => {
  const source = readFileSync('src/analysis/diff.ts', 'utf8');
  assert.doesNotMatch(source, /\bWQT\b|SiteOne|ssl-protocol-unsafe/i);
});
