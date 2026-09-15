import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptZeroRankSanitizedEvidence,
  MAX_ZERORANK_ARTIFACT_BYTES,
  ZeroRankAdapterError,
  type ZeroRankAdapterConfig,
  type ZeroRankAdapterErrorCode,
  type ZeroRankAdaptedCollection,
  type ZeroRankEndpointId,
} from '../../src/adapters/zerorank.js';
import type { Contract } from '../../src/contracts/wire.js';
import { canonicalJson } from '../../src/lib/canonical-json.js';
import { parseCollectionBatch } from '../../src/persistence/validation.js';
import { alpha, beta, repository } from '../persistence/helpers.js';

// Entirely synthetic; structure mirrors only the accepted Step 9 v1/minor0 contract.
type MutableJson = Record<string, any>;
const fixtureText = readFileSync('tests/fixtures/zerorank-evidence-v1.0.json', 'utf8');

function fixture(): MutableJson {
  return JSON.parse(fixtureText) as MutableJson;
}

const trustedConfig: ZeroRankAdapterConfig = {
  scope: {
    tenantId: 'tenant-alpha',
    siteId: 'site-alpha',
    siteScopeRevisionId: 'synthetic-scope-alpha-r1',
  },
  expectedWorkspaceId: 'example-workspace',
  expectedTargetOrigin: 'https://lowcountrydigitalworks.com',
  providerConnectionId: 'synthetic-zerorank-connection',
  timing: {
    observedAt: '2026-09-14T12:10:00.000Z',
    startedAt: '2026-09-14T12:00:00.000Z',
    endedAt: '2026-09-14T12:08:00.000Z',
    collectedAt: '2026-09-14T12:11:00.000Z',
    receivedAt: '2026-09-14T12:12:00.000Z',
  },
  availability: { state: 'available', reference: 'synthetic-zerorank-artifact' },
};

function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
}

function expectAdapterError(action: () => unknown, code: ZeroRankAdapterErrorCode): void {
  assert.throws(action, (error: unknown) => error instanceof ZeroRankAdapterError && error.code === code);
}

function collection(
  result: ReturnType<typeof adaptZeroRankSanitizedEvidence>,
  endpoint: ZeroRankEndpointId,
): ZeroRankAdaptedCollection {
  const found = result.collections.find((item) => item.endpoint === endpoint);
  assert.ok(found);
  return found;
}

function observations(value: ZeroRankAdaptedCollection): Contract<'observation'>[] {
  return value.batches.flatMap((batch) => batch.observations.map((item) => item.record));
}

function metric(
  value: ZeroRankAdaptedCollection,
  metricId: string,
): Contract<'observation'>[] {
  return observations(value).filter((item) => item.cohort.context.metric.id === metricId);
}

function cloneConfig(overrides: Partial<ZeroRankAdapterConfig> = {}): ZeroRankAdapterConfig {
  return { ...structuredClone(trustedConfig), ...overrides };
}

function replaceRankings(value: MutableJson, count: number): void {
  value.endpoints.rankings.rows = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    name: `Synthetic ranking ${index}`,
    rank: index === 0 ? 0 : index + 1,
    mentions: index,
    sentiment: 0,
    visibilityPercentage: index % 100,
    growth: 0,
  }));
  value.endpoints.rankings.returnedCount = count;
}

function replacePrompts(value: MutableJson, count: number, statusLength = 6): void {
  value.endpoints.prompts.rows = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    text: `Synthetic prompt ${index}`,
    status: `S${'X'.repeat(Math.max(1, statusLength - 1))}`,
    aiSearchVolume: index === 0 ? 0 : index,
    sourceMetadata: { synthetic: true, index },
    topic: { synthetic: `topic-${index}` },
    tags: [`tag-${index}`],
  }));
  value.endpoints.prompts.returnedCount = count;
  value.endpoints.prompts.pagination = { total: count, page: 1, perPage: 100, lastPage: 1 };
  value.endpoints.prompts.completeness = 'complete';
}

test('adapts exact Step 9 artifact object into five valid bounded endpoint collections', () => {
  const result = adaptZeroRankSanitizedEvidence(bytes(fixture()), trustedConfig);
  assert.match(result.inputSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(result.collections.map((item) => item.endpoint), [
    'rankings', 'prompts', 'chats', 'sources', 'sourceUrls',
  ]);

  for (const stream of result.collections) {
    assert.equal(stream.providerId, 'zerorank');
    assert.equal(new Set(stream.batches.map((batch) => batch.idempotencyKey)).size, 1);
    for (const batch of stream.batches) assert.doesNotThrow(() => parseCollectionBatch(batch));
  }

  const prompts = collection(result, 'prompts');
  assert.deepEqual(prompts.batches[0]!.collection.completeness, {
    state: 'complete', expectedCount: 2, receivedCount: 2,
  });
  for (const endpoint of ['rankings', 'chats', 'sources', 'sourceUrls'] as const) {
    const completeness = collection(result, endpoint).batches[0]!.collection.completeness;
    assert.equal(completeness.state, 'partial');
    assert.equal(completeness.receivedCount, 2);
    assert.equal('expectedCount' in completeness, false);
  }
});

test('consumes the artifact object only; outer wrapper and closed-envelope extras fail closed', () => {
  expectAdapterError(
    () => adaptZeroRankSanitizedEvidence(bytes({ artifact: fixture(), meta: { synthetic: true } }), trustedConfig),
    'unsupported_schema',
  );

  const extraRoot = fixture();
  extraRoot.unexpected = true;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(extraRoot), trustedConfig), 'invalid_source');

  const extraEndpoint = fixture();
  extraEndpoint.endpoints.rankings.unexpected = true;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(extraEndpoint), trustedConfig), 'invalid_source');

  const extraRow = fixture();
  extraRow.endpoints.rankings.rows[0].unexpected = true;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(extraRow), trustedConfig), 'invalid_source');
});

test('accepts optional row keys while preserving null and absent mapped values distinctly', () => {
  const value = fixture();
  value.endpoints.prompts.rows[0].status = null;
  delete value.endpoints.prompts.rows[1].status;
  delete value.endpoints.prompts.rows[1].text;
  delete value.endpoints.prompts.rows[1].topic;
  delete value.endpoints.prompts.rows[1].tags;
  const result = adaptZeroRankSanitizedEvidence(bytes(value), trustedConfig);
  const statuses = metric(collection(result, 'prompts'), 'zerorank-prompt-status');
  const reasons = statuses
    .map((item) => item.value.state === 'unknown' ? item.value.reason : '')
    .filter(Boolean);
  assert.ok(reasons.some((reason) => reason.includes('explicitly null')));
  assert.ok(reasons.some((reason) => reason.includes('absent')));
});

test('runtime scalar types are never coerced and observed numeric zero stays zero', () => {
  const value = fixture();
  value.endpoints.rankings.rows[0].rank = '7';
  value.endpoints.prompts.rows[0].status = 42;
  value.endpoints.sources.rows[0].avgCitations = '3.5';
  value.endpoints.sourceUrls.rows[0].totalUsage = '9';
  const result = adaptZeroRankSanitizedEvidence(bytes(value), trustedConfig);

  assert.equal(metric(collection(result, 'rankings'), 'zerorank-ranking-rank')[0]!.value.state, 'unknown');
  assert.equal(metric(collection(result, 'prompts'), 'zerorank-prompt-status')[0]!.value.state, 'unknown');
  assert.equal(metric(collection(result, 'sources'), 'zerorank-source-avg-citations')[0]!.value.state, 'unknown');
  assert.equal(metric(collection(result, 'sourceUrls'), 'zerorank-source-url-total-usage')[0]!.value.state, 'unknown');

  const zeroMentions = metric(collection(result, 'rankings'), 'zerorank-ranking-mentions')
    .find((item) => item.value.state === 'observed'
      && item.value.value.type === 'number' && item.value.value.value === 4);
  assert.ok(zeroMentions);
  const zeroVisibility = metric(collection(result, 'rankings'), 'zerorank-ranking-visibility-percentage')
    .find((item) => item.value.state === 'observed'
      && item.value.value.type === 'number' && item.value.value.value === 0);
  assert.ok(zeroVisibility);
  const promptZero = metric(collection(result, 'prompts'), 'zerorank-prompt-ai-search-volume')
    .find((item) => item.value.state === 'observed'
      && item.value.value.type === 'number' && item.value.value.value === 0);
  assert.ok(promptZero);
});

test('stable source IDs are mandatory and duplicate usable IDs fail closed', () => {
  const missing = fixture();
  delete missing.endpoints.rankings.rows[0].id;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(missing), trustedConfig), 'invalid_source');

  const nullId = fixture();
  nullId.endpoints.chats.rows[0].id = null;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(nullId), trustedConfig), 'invalid_source');

  const duplicate = fixture();
  duplicate.endpoints.prompts.rows[1].id = duplicate.endpoints.prompts.rows[0].id;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(duplicate), trustedConfig), 'duplicate_source_id');

  const numericAlias = fixture();
  numericAlias.endpoints.prompts.rows[0].id = 10;
  numericAlias.endpoints.prompts.rows[1].id = '10';
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(numericAlias), trustedConfig), 'duplicate_source_id');
});

test('row order and JSON formatting do not change semantic collection identity', () => {
  const original = fixture();
  const reordered = fixture();
  for (const endpoint of ['rankings', 'prompts', 'chats', 'sources', 'sourceUrls']) {
    reordered.endpoints[endpoint].rows.reverse();
  }
  const left = adaptZeroRankSanitizedEvidence(bytes(original), trustedConfig);
  const right = adaptZeroRankSanitizedEvidence(bytes(reordered, true), trustedConfig);
  assert.notEqual(left.inputSha256, right.inputSha256);
  assert.equal(canonicalJson(left.collections), canonicalJson(right.collections));
});

test('trusted config supplies authority while artifact scope/provider smuggling is rejected', () => {
  const result = adaptZeroRankSanitizedEvidence(bytes(fixture()), trustedConfig);
  for (const stream of result.collections) {
    for (const batch of stream.batches) {
      assert.deepEqual(batch.collection.scope, trustedConfig.scope);
      assert.equal(batch.collection.providerConnectionId, trustedConfig.providerConnectionId);
      for (const source of batch.sources) {
        assert.deepEqual(source.record.identity.scope, trustedConfig.scope);
        assert.equal(source.record.identity.providerConnectionId, trustedConfig.providerConnectionId);
      }
    }
  }

  const forged = fixture();
  forged.scope = { tenantId: 'tenant-beta', siteId: 'site-beta', siteScopeRevisionId: 'forged' };
  forged.providerConnectionId = 'forged-connection';
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(forged), trustedConfig), 'invalid_source');
});

test('workspace and target values are match-only and must agree with trusted config', () => {
  expectAdapterError(
    () => adaptZeroRankSanitizedEvidence(bytes(fixture()), cloneConfig({ expectedWorkspaceId: 'other-workspace' })),
    'configuration_mismatch',
  );
  expectAdapterError(
    () => adaptZeroRankSanitizedEvidence(bytes(fixture()), cloneConfig({ expectedTargetOrigin: 'https://other.example.test' })),
    'configuration_mismatch',
  );
  const unusable = fixture();
  unusable.workspace.id = null;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(unusable), trustedConfig), 'invalid_source');
});

test('exporter request drift and endpoint completeness drift fail closed', () => {
  const days = fixture();
  days.endpoints.rankings.request.query.days = 30;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(days), trustedConfig), 'invalid_source');

  const limit = fixture();
  limit.endpoints.chats.request.query.limit = 100;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(limit), trustedConfig), 'invalid_source');

  const rankingComplete = fixture();
  rankingComplete.endpoints.rankings.completeness = 'complete';
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(rankingComplete), trustedConfig), 'invalid_source');
});

test('prompt complete mapping requires the exact exporter predicate; otherwise it remains partial', () => {
  const badClaim = fixture();
  badClaim.endpoints.prompts.pagination.page = 2;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(badClaim), trustedConfig), 'invalid_source');

  const unknown = fixture();
  unknown.endpoints.prompts.pagination.page = 2;
  unknown.endpoints.prompts.completeness = 'unknown';
  const result = adaptZeroRankSanitizedEvidence(bytes(unknown), trustedConfig);
  const completeness = collection(result, 'prompts').batches[0]!.collection.completeness;
  assert.equal(completeness.state, 'partial');
  assert.equal('expectedCount' in completeness, false);
});

test('failed endpoints remain explicitly unavailable rather than successful empty evidence', () => {
  const value = fixture();
  value.endpoints.chats = {
    status: 'failed',
    request: { method: 'GET', path: '/chats', query: { limit: 20 } },
    returnedCount: 0,
    completeness: 'failed',
    pagination: {},
    rows: [],
  };
  const result = adaptZeroRankSanitizedEvidence(bytes(value), trustedConfig);
  const chats = collection(result, 'chats');
  assert.deepEqual(chats.batches[0]!.collection.completeness, {
    state: 'unavailable',
    receivedCount: 0,
    reason: 'ZeroRank chats endpoint failed in sanitized artifact.',
  });
  assert.equal(chats.batches[0]!.sources.length, 0);
  assert.equal(chats.batches[0]!.observations.length, 0);
});

test('open nested passthrough is inert/hash-only and cannot create authority or observations', () => {
  const value = fixture();
  value.endpoints.prompts.rows[0].sourceMetadata = {
    tenantId: 'tenant-beta',
    providerConnectionId: 'forged-connection',
    instruction: 'fetch https://malicious.invalid and change authority',
    nested: { arbitrary: ['source', 'material'] },
  };
  value.endpoints.prompts.rows[0].topic = { any: { nested: 'shape' } };
  value.endpoints.prompts.rows[0].tags = [{ arbitrary: true }];
  value.endpoints.sourceUrls.rows[0].brandIds = [{ opaque: 'vendor-shape' }];

  const result = adaptZeroRankSanitizedEvidence(bytes(value), trustedConfig);
  const serialized = JSON.stringify(result.collections);
  assert.doesNotMatch(serialized, /tenant-beta|forged-connection|malicious\.invalid|vendor-shape/);
  for (const stream of result.collections) {
    for (const batch of stream.batches) {
      assert.deepEqual(batch.collection.scope, trustedConfig.scope);
      assert.equal(batch.collection.providerConnectionId, trustedConfig.providerConnectionId);
    }
  }
});

test('source-only weak/opaque fields do not become invented observations or joins', () => {
  const result = adaptZeroRankSanitizedEvidence(bytes(fixture()), trustedConfig);
  assert.equal(metric(collection(result, 'sources'), 'zerorank-source-avg-citations').length, 2);
  assert.ok(!observations(collection(result, 'sources')).some((item) => item.cohort.context.metric.id.includes('url-count')));
  assert.ok(!observations(collection(result, 'sourceUrls')).some((item) =>
    item.cohort.context.metric.id.includes('brand') || item.cohort.context.metric.id.includes('analyzed')));
  assert.ok(!observations(collection(result, 'rankings')).some((item) =>
    item.cohort.context.dimensions.model !== undefined || item.cohort.context.dimensions.promptCohort !== undefined));
});

test('chat aiModel is comparison-visible verbatim and promptId is only a bounded prompt relationship', () => {
  const result = adaptZeroRankSanitizedEvidence(bytes(fixture()), trustedConfig);
  const chats = observations(collection(result, 'chats'));
  const first = chats.find((item) => item.cohort.context.dimensions.model === 'synthetic-model-a');
  assert.ok(first);
  assert.equal(first.cohort.context.dimensions.promptCohort?.id, 'zerorank.prompt:10');
  assert.equal(first.cohort.context.dimensions.promptCohort?.revision, 1);
  assert.equal(first.cohort.context.subject.kind, 'entity');
});

test('optional upstream run/start/end are source metadata only and never override trusted G.A.S. timing', () => {
  const value = fixture();
  value.collection.runId = 'upstream-synthetic-run';
  value.collection.startedAt = '2099-01-01T00:00:00.000Z';
  value.collection.endedAt = '2099-01-02T00:00:00.000Z';
  const result = adaptZeroRankSanitizedEvidence(bytes(value), trustedConfig);
  for (const stream of result.collections) {
    for (const batch of stream.batches) {
      assert.equal(batch.collection.startedAt, trustedConfig.timing.startedAt);
      assert.equal(batch.collection.endedAt, trustedConfig.timing.endedAt);
      assert.equal(batch.collection.sourceTime.start, trustedConfig.timing.observedAt);
      assert.equal(batch.collection.sourceTime.end, trustedConfig.timing.observedAt);
      for (const item of batch.observations) {
        assert.equal(item.record.provenance.runId, batch.collection.id);
        assert.equal(item.record.provenance.sourceTime.start, trustedConfig.timing.observedAt);
      }
    }
  }
});

test('rejects malformed/oversized input and unsupported source versions', () => {
  expectAdapterError(
    () => adaptZeroRankSanitizedEvidence(new Uint8Array(MAX_ZERORANK_ARTIFACT_BYTES + 1), trustedConfig),
    'input_too_large',
  );
  expectAdapterError(
    () => adaptZeroRankSanitizedEvidence(Uint8Array.from([0xc3, 0x28]), trustedConfig),
    'invalid_utf8',
  );
  expectAdapterError(
    () => adaptZeroRankSanitizedEvidence(Buffer.from('{', 'utf8'), trustedConfig),
    'invalid_json',
  );
  const major = fixture();
  major.schemaVersion = 'ldw.zerorank-evidence.v2';
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(major), trustedConfig), 'unsupported_schema');
  const minor = fixture();
  minor.schemaMinorVersion = 1;
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(minor), trustedConfig), 'unsupported_schema');
});

test('more than 16 units produces deterministic multipart output with same-part source ownership', () => {
  const value = fixture();
  replaceRankings(value, 20);
  const result = adaptZeroRankSanitizedEvidence(bytes(value), trustedConfig);
  const rankings = collection(result, 'rankings');
  assert.ok(rankings.batches.length > 1);
  assert.deepEqual(rankings.batches.map((batch) => batch.part), rankings.batches.map((_, index) => index + 1));
  for (const batch of rankings.batches) {
    assert.ok(batch.sources.length <= 16);
    assert.ok(batch.observations.length <= 32);
    const sourceIds = new Set(batch.sources.map((source) => source.id));
    assert.ok(batch.observations.every((observation) => sourceIds.has(observation.sourceId)));
    assert.ok(Buffer.byteLength(canonicalJson(batch), 'utf8') <= 65_536);
  }
});

test('packing remains byte-aware under large bounded mapped text', () => {
  const value = fixture();
  replacePrompts(value, 16, 2_048);
  const longId = `x${'y'.repeat(110)}`;
  const config = cloneConfig({
    scope: { tenantId: longId, siteId: `s${'i'.repeat(110)}`, siteScopeRevisionId: `r${'v'.repeat(110)}` },
    providerConnectionId: `c${'n'.repeat(110)}`,
  });
  const result = adaptZeroRankSanitizedEvidence(bytes(value), config);
  const prompts = collection(result, 'prompts');
  assert.ok(prompts.batches.length > 1, 'large mapped text should require byte-aware splitting');
  for (const batch of prompts.batches) {
    assert.ok(Buffer.byteLength(canonicalJson(batch), 'utf8') <= 65_536);
    assert.doesNotThrow(() => parseCollectionBatch(batch));
  }
});

test('unrepresentable single source material and more-than-64-part output fail explicitly', () => {
  const tooLarge = fixture();
  tooLarge.endpoints.prompts.rows[0].sourceMetadata = 'x'.repeat(70_000);
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(tooLarge), trustedConfig), 'unit_too_large');

  const tooManyParts = fixture();
  replaceRankings(tooManyParts, 385);
  expectAdapterError(() => adaptZeroRankSanitizedEvidence(bytes(tooManyParts), trustedConfig), 'too_many_parts');
});

test('adapted multipart persistence stays incomplete until final part and Alpha/Beta authority remains isolated', async (t) => {
  const value = fixture();
  replaceRankings(value, 20);
  const adapted = adaptZeroRankSanitizedEvidence(bytes(value), trustedConfig);
  const rankings = collection(adapted, 'rankings');
  assert.ok(rankings.batches.length > 1);

  const repo = await repository(t);
  await repo.createConnection(alpha, {
    id: trustedConfig.providerConnectionId,
    scope: trustedConfig.scope,
    providerId: 'zerorank',
  });
  const betaScope = {
    tenantId: 'tenant-beta',
    siteId: 'site-beta',
    siteScopeRevisionId: 'synthetic-scope-beta-r1',
  };
  await repo.createConnection(beta, {
    id: trustedConfig.providerConnectionId,
    scope: betaScope,
    providerId: 'zerorank',
  });

  for (let index = 0; index < rankings.batches.length; index++) {
    const persisted = await repo.persistCollection(alpha, rankings.batches[index]!);
    assert.equal(persisted.complete, index === rankings.batches.length - 1);
    const progress = await repo.getCollectionProgress(alpha, rankings.collectionId);
    assert.equal(progress?.complete, index === rankings.batches.length - 1);
  }

  await assert.rejects(repo.persistCollection(beta, rankings.batches[0]!));
});

test('adapter source has no provider/network/runtime-authority or Release 0.7 implementation path', () => {
  const source = readFileSync('src/adapters/zerorank.ts', 'utf8');
  assert.doesNotMatch(source, /from ['"](?:node:http|node:https|undici|axios|activepieces|zerorank)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /issueTenantContext\s*\(/);
  assert.doesNotMatch(source, /tenant-authority/);
  assert.doesNotMatch(source, /from ['"].*(?:correlation|priority|recommendation)/i);
  assert.doesNotMatch(source, /create(?:Correlation|Priority|Recommendation)|Release 0\.7/);
});
