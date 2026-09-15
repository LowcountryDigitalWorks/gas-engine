import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptWqtNormalizedEvidence,
  MAX_WQT_NORMALIZED_BYTES,
  WqtAdapterError,
  type WqtAdapterConfig,
  type WqtAdapterErrorCode,
  type WqtAdaptedCollection,
} from '../../src/adapters/wqt.js';
import type { Contract } from '../../src/contracts/wire.js';
import { canonicalJson } from '../../src/lib/canonical-json.js';
import { parseCollectionBatch } from '../../src/persistence/validation.js';
import { alpha, beta, repository } from '../persistence/helpers.js';

// This file is intentionally synthetic and mirrors only the public WQT normalized contract.
type MutableJson = Record<string, any>;
const fixtureText = readFileSync('tests/fixtures/wqt-normalized-v1.1.json', 'utf8');

function fixture(): MutableJson {
  return JSON.parse(fixtureText) as MutableJson;
}

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
    observedAt: '2026-08-16T00:05:00.000Z',
    startedAt: '2026-08-16T00:00:00.000Z',
    endedAt: '2026-08-16T00:04:00.000Z',
    collectedAt: '2026-08-16T00:06:00.000Z',
    receivedAt: '2026-08-16T00:07:00.000Z',
  },
  availability: {
    siteone: { state: 'available', reference: 'synthetic-wqt-siteone-artifact' },
    lighthouse: { state: 'available', reference: 'synthetic-wqt-lighthouse-artifact' },
  },
};

function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
}

function expectAdapterError(action: () => unknown, code: WqtAdapterErrorCode): void {
  assert.throws(action, (error: unknown) => error instanceof WqtAdapterError && error.code === code);
}

function collection(result: ReturnType<typeof adaptWqtNormalizedEvidence>, provider: 'siteone' | 'lighthouse'): WqtAdaptedCollection {
  const found = result.collections.find((item) => item.providerId === provider);
  assert.ok(found);
  return found;
}

function observations(value: WqtAdaptedCollection): Contract<'observation'>[] {
  return value.batches.flatMap((batch) => batch.observations.map((item) => item.record));
}

function refreshFlattened(value: MutableJson): void {
  value.observations = [
    ...value.sources.siteone.observations,
    ...value.sources.lighthouse.observations,
  ].sort((left: MutableJson, right: MutableJson) => `${left.source}:${left.code}`.localeCompare(`${right.source}:${right.code}`));
}

function replaceLighthouseCategories(value: MutableJson, count: number): void {
  value.sources.lighthouse.categoryScores = Array.from({ length: count }, (_, index) => ({
    id: `synthetic-category-${String(index).padStart(4, '0')}`,
    title: `Synthetic category ${index}`,
    score: index === 0 ? 0 : 0.5,
  }));
}

function replaceSiteOneFindings(value: MutableJson, count: number, statusLength = 7): void {
  value.sources.siteone.observations = Array.from({ length: count }, (_, index) => ({
    source: 'siteone',
    code: `synthetic-finding-${String(index).padStart(4, '0')}`,
    sourceStatus: `S${'X'.repeat(Math.max(1, statusLength - 1))}`,
    message: `Synthetic finding ${index}`,
  }));
  refreshFlattened(value);
}

test('adapts exact WQT v1/minor1 into two valid bounded G.A.S. provider streams', () => {
  const result = adaptWqtNormalizedEvidence(bytes(fixture()), trustedConfig);
  assert.match(result.inputSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.collections.map((item) => item.providerId), ['siteone', 'lighthouse']);
  const siteone = collection(result, 'siteone');
  const lighthouse = collection(result, 'lighthouse');
  assert.equal(siteone.batches[0]!.collection.completeness.receivedCount, 5);
  assert.equal(lighthouse.batches[0]!.collection.completeness.receivedCount, 4);
  for (const stream of result.collections) {
    assert.equal(new Set(stream.batches.map((batch) => batch.idempotencyKey)).size, 1);
    for (const batch of stream.batches) assert.doesNotThrow(() => parseCollectionBatch(batch));
  }

  const siteOneObservations = observations(siteone);
  const overall = siteOneObservations.find((item) => item.cohort.context.metric.id === 'wqt-siteone-overall-score');
  assert.deepEqual(overall?.value, { state: 'observed', value: { type: 'number', value: 0 } });
  const missingCategory = siteOneObservations.find((item) =>
    item.cohort.context.metric.id === 'wqt-siteone-category-score' && item.value.state === 'unknown');
  assert.ok(missingCategory);
  const missingStatus = siteOneObservations.find((item) =>
    item.cohort.context.metric.id === 'wqt-siteone-source-status' && item.value.state === 'unknown');
  assert.ok(missingStatus);

  const lighthouseObservations = observations(lighthouse);
  const zeroCategory = lighthouseObservations.find((item) =>
    item.cohort.context.metric.id === 'wqt-lighthouse-category-score'
    && item.value.state === 'observed' && item.value.value.type === 'number' && item.value.value.value === 0);
  assert.ok(zeroCategory);
  const numeric = lighthouseObservations.find((item) => item.cohort.context.metric.id === 'wqt-lighthouse-audit-numeric');
  assert.equal(numeric?.cohort.context.metric.unit, 'millisecond');
});

test('trusted configuration is authority input; WQT site/target and unknown authority fields cannot replace it', () => {
  const result = adaptWqtNormalizedEvidence(bytes(fixture()), trustedConfig);
  for (const stream of result.collections) {
    for (const batch of stream.batches) {
      assert.deepEqual(batch.collection.scope, trustedConfig.scope);
      assert.equal(batch.collection.providerConnectionId, trustedConfig.providerConnectionIds[stream.providerId]);
      for (const source of batch.sources) assert.deepEqual(source.record.identity.scope, trustedConfig.scope);
    }
  }

  const wrongSite = fixture();
  wrongSite.siteId = 'other-site';
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(wrongSite), trustedConfig), 'configuration_mismatch');
  const wrongTarget = fixture();
  wrongTarget.target = 'https://other.example.test';
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(wrongTarget), trustedConfig), 'configuration_mismatch');
  const forged = fixture();
  forged.scope = { tenantId: 'tenant-beta', siteId: 'site-beta', siteScopeRevisionId: 'forged' };
  forged.providerConnectionId = 'forged-connection';
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(forged), trustedConfig), 'invalid_source');
});

test('rejects oversized, malformed UTF-8/JSON, unsupported versions, and strict malformed source shapes', () => {
  expectAdapterError(() => adaptWqtNormalizedEvidence(new Uint8Array(MAX_WQT_NORMALIZED_BYTES + 1), trustedConfig), 'input_too_large');
  expectAdapterError(() => adaptWqtNormalizedEvidence(Uint8Array.from([0xc3, 0x28]), trustedConfig), 'invalid_utf8');
  expectAdapterError(() => adaptWqtNormalizedEvidence(Buffer.from('{', 'utf8'), trustedConfig), 'invalid_json');

  const wrongMajor = fixture();
  wrongMajor.schemaVersion = 'ldw.website-quality.v2';
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(wrongMajor), trustedConfig), 'unsupported_schema');
  const wrongMinor = fixture();
  wrongMinor.schemaMinorVersion = 2;
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(wrongMinor), trustedConfig), 'unsupported_schema');
  const extra = fixture();
  extra.sources.siteone.unexpected = true;
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(extra), trustedConfig), 'invalid_source');
  const badTool = fixture();
  badTool.sources.lighthouse.tool = 'Other Lighthouse';
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(badTool), trustedConfig), 'invalid_source');
});

test('enforces WQT evidence-only and no-gate policy without inventing LDW thresholds', () => {
  for (const mutate of [
    (value: MutableJson) => { value.evidenceOnly = false; },
    (value: MutableJson) => { value.gatePolicy.qualityThresholdsApplied = true; },
    (value: MutableJson) => { value.gatePolicy.siteOneCiModeEnabled = true; },
  ]) {
    const value = fixture();
    mutate(value);
    expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(value), trustedConfig), 'policy_violation');
  }
});

test('requires flattened WQT observations to exactly reconcile with nested deterministic observations', () => {
  const missing = fixture();
  missing.observations.pop();
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(missing), trustedConfig), 'flattened_observation_mismatch');
  const changed = fixture();
  changed.observations[0].title = 'Contradictory duplicate';
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(changed), trustedConfig), 'flattened_observation_mismatch');
});

test('source ordering and JSON formatting do not change semantic collection/source identity', () => {
  const originalValue = fixture();
  const reordered = fixture();
  reordered.sources.siteone.categoryScores.reverse();
  reordered.sources.siteone.observations.reverse();
  reordered.sources.lighthouse.categoryScores.reverse();
  reordered.sources.lighthouse.observations.reverse();
  const left = adaptWqtNormalizedEvidence(bytes(originalValue), trustedConfig);
  const right = adaptWqtNormalizedEvidence(bytes(reordered, true), trustedConfig);
  assert.notEqual(left.inputSha256, right.inputSha256);
  assert.equal(canonicalJson(left.collections), canonicalJson(right.collections));
});

test('duplicate WQT source keys fail closed instead of silently deduplicating', () => {
  const value = fixture();
  value.sources.siteone.categoryScores.push(structuredClone(value.sources.siteone.categoryScores[0]));
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(value), trustedConfig), 'duplicate_source_key');
  const audit = fixture();
  audit.sources.lighthouse.observations.push(structuredClone(audit.sources.lighthouse.observations[0]));
  refreshFlattened(audit);
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(audit), trustedConfig), 'duplicate_source_key');
});

test('source versions remain comparison-visible and SiteOne timezone-less executedAt is never promoted to canonical time', () => {
  const value = fixture();
  const first = adaptWqtNormalizedEvidence(bytes(value), trustedConfig);
  for (const stream of first.collections) {
    for (const observation of observations(stream)) {
      assert.equal(observation.provenance.sourceTime.start, trustedConfig.timing.observedAt);
      assert.equal(observation.provenance.sourceTime.end, trustedConfig.timing.observedAt);
      assert.equal(observation.cohort.context.timeWindowRules.timezone, 'UTC');
      assert.equal(observation.cohort.context.timeWindowRules.alignment, 'point');
      assert.equal(observation.cohort.context.timeWindowRules.durationSeconds, 0);
    }
  }
  assert.equal(observations(collection(first, 'siteone'))[0]!.cohort.context.dimensions.configuration?.version, '2.5.1');
  assert.equal(observations(collection(first, 'lighthouse'))[0]!.cohort.context.dimensions.configuration?.version, '13.4.1');

  const changed = fixture();
  changed.sources.siteone.executedAt = '2099-01-01 12:34:56';
  const second = adaptWqtNormalizedEvidence(bytes(changed), trustedConfig);
  assert.notEqual(collection(first, 'siteone').collectionId, collection(second, 'siteone').collectionId);
  assert.equal(collection(first, 'siteone').batches[0]!.collection.sourceTime.start, trustedConfig.timing.observedAt);
  assert.equal(collection(second, 'siteone').batches[0]!.collection.sourceTime.start, trustedConfig.timing.observedAt);
  assert.doesNotMatch(JSON.stringify(second.collections), /2099-01-01 12:34:56/);
});

test('deterministic IDs and integrity hashes repeat while exact-byte digest remains formatting-sensitive', () => {
  const value = fixture();
  const compact = adaptWqtNormalizedEvidence(bytes(value), trustedConfig);
  const pretty = adaptWqtNormalizedEvidence(bytes(value, true), trustedConfig);
  assert.notEqual(compact.inputSha256, pretty.inputSha256);
  assert.deepEqual(compact.collections, pretty.collections);
  for (const stream of compact.collections) {
    const ids = stream.batches.flatMap((batch) => batch.sources.map((source) => source.id));
    assert.equal(new Set(ids).size, ids.length);
    for (const batch of stream.batches) {
      for (const source of batch.sources) assert.match(source.record.integrity.state === 'hashed' ? source.record.integrity.digest : '', /^[a-f0-9]{64}$/);
    }
  }
});

test('more than 16 source units produces deterministic multipart output with every observation beside its source', () => {
  const value = fixture();
  replaceLighthouseCategories(value, 20);
  const result = adaptWqtNormalizedEvidence(bytes(value), trustedConfig);
  const lighthouse = collection(result, 'lighthouse');
  assert.ok(lighthouse.batches.length > 1);
  assert.deepEqual(lighthouse.batches.map((batch) => batch.part), lighthouse.batches.map((_, index) => index + 1));
  assert.ok(lighthouse.batches.every((batch) => batch.parts === lighthouse.batches.length));
  for (const batch of lighthouse.batches) {
    const sources = new Set(batch.sources.map((source) => source.id));
    assert.ok(batch.observations.every((observation) => sources.has(observation.sourceId)));
    assert.ok(batch.sources.length <= 16);
    assert.ok(batch.observations.length <= 32);
  }
});

test('packing is byte-aware and every final part remains inside the canonical 64 KiB bound', () => {
  const value = fixture();
  replaceSiteOneFindings(value, 40, 2_048);
  const result = adaptWqtNormalizedEvidence(bytes(value), trustedConfig);
  const siteone = collection(result, 'siteone');
  assert.ok(siteone.batches.length > 3);
  assert.ok(siteone.batches[0]!.sources.length < 16, 'large observations should close a part before the 16-source count limit');
  for (const batch of siteone.batches) {
    assert.ok(Buffer.byteLength(canonicalJson(batch), 'utf8') <= 65_536);
    assert.doesNotThrow(() => parseCollectionBatch(batch));
  }
});

test('capacity and single-unit canonical failures are explicit with no truncation or silent paging', () => {
  const tooMany = fixture();
  replaceLighthouseCategories(tooMany, 1_023);
  // Two audit units remain, so this provider has 1,025 source units and would require >64 count-bounded parts.
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(tooMany), trustedConfig), 'too_many_source_units');

  const tooLarge = fixture();
  const huge = 'x'.repeat(16_384);
  tooLarge.sources.lighthouse.fetchTime = huge;
  tooLarge.sources.lighthouse.requestedUrl = huge;
  tooLarge.sources.lighthouse.finalUrl = huge;
  tooLarge.sources.lighthouse.userAgent = huge;
  expectAdapterError(() => adaptWqtNormalizedEvidence(bytes(tooLarge), trustedConfig), 'unit_too_large');
});

test('adapted multipart persistence reports incomplete progress until the final part', async (t) => {
  const value = fixture();
  replaceLighthouseCategories(value, 20);
  const adapted = collection(adaptWqtNormalizedEvidence(bytes(value), trustedConfig), 'lighthouse');
  assert.ok(adapted.batches.length > 1);
  const repo = await repository(t);
  await repo.createConnection(alpha, {
    id: trustedConfig.providerConnectionIds.lighthouse,
    scope: trustedConfig.scope,
    providerId: 'lighthouse',
  });
  for (let index = 0; index < adapted.batches.length; index++) {
    const batch = adapted.batches[index]!;
    const persisted = await repo.persistCollection(alpha, batch);
    const progress = await repo.getCollectionProgress(alpha, adapted.collectionId);
    assert.ok(progress);
    assert.equal(progress.complete, index === adapted.batches.length - 1);
    assert.equal(persisted.complete, progress.complete);
  }
});

test('adapted evidence preserves Alpha/Beta tenant isolation in persistence', async (t) => {
  const adapted = collection(adaptWqtNormalizedEvidence(bytes(fixture()), trustedConfig), 'siteone');
  const repo = await repository(t);
  await repo.createConnection(alpha, {
    id: trustedConfig.providerConnectionIds.siteone,
    scope: trustedConfig.scope,
    providerId: 'siteone',
  });
  await assert.rejects(repo.persistCollection(beta, adapted.batches[0]!));
  assert.equal(await repo.getCollection(alpha, adapted.collectionId), null);
});

test('adapter production surface has no network/listener, authentication issuer, WQT runtime, ZeroRank, or Release 0.6 coupling', () => {
  const source = readFileSync('src/adapters/wqt.ts', 'utf8');
  assert.doesNotMatch(source, /from ['"]node:(?:http|https|net|tls|dns|dgram|child_process|worker_threads)['"]/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /\b(?:Request|Response)\b/);
  assert.doesNotMatch(source, /authentication|tenant-authority|issueTenantContext/);
  assert.doesNotMatch(source, /website-quality-toolkit|scripts\/normalize|GitHub|actions\/download-artifact/);
  assert.doesNotMatch(source, /ZeroRank|zerorank|Release 0\.6/);
});
