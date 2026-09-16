import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptZeroRankSanitizedEvidence,
  ZeroRankAdapterError,
  type ZeroRankAdapterConfig,
} from '../../src/adapters/zerorank.js';

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

function bytes(value: unknown): Uint8Array {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

function expectInvalidSource(value: MutableJson): void {
  assert.throws(
    () => adaptZeroRankSanitizedEvidence(bytes(value), trustedConfig),
    (error: unknown) => error instanceof ZeroRankAdapterError && error.code === 'invalid_source',
  );
}

test('successful workspace endpoint requires an owned usable ID matching the root projection', () => {
  const mismatched = fixture();
  mismatched.endpoints.workspace.record.id = 'different-workspace';
  expectInvalidSource(mismatched);

  const missing = fixture();
  delete missing.endpoints.workspace.record.id;
  expectInvalidSource(missing);

  const unusable = fixture();
  unusable.endpoints.workspace.record.id = null;
  expectInvalidSource(unusable);

  assert.doesNotThrow(() => adaptZeroRankSanitizedEvidence(bytes(fixture()), trustedConfig));
});

test('workspace name duplicate requires matching presence and JSON semantic value', () => {
  const endpointMissing = fixture();
  delete endpointMissing.endpoints.workspace.record.name;
  expectInvalidSource(endpointMissing);

  const rootMissing = fixture();
  delete rootMissing.workspace.name;
  expectInvalidSource(rootMissing);

  const mismatched = fixture();
  mismatched.endpoints.workspace.record.name = 'Different synthetic workspace';
  expectInvalidSource(mismatched);

  const matching = fixture();
  matching.workspace.name = {
    label: 'Synthetic ZeroRank Workspace',
    metadata: { alpha: 1, beta: 2 },
  };
  matching.endpoints.workspace.record.name = {
    metadata: { beta: 2, alpha: 1 },
    label: 'Synthetic ZeroRank Workspace',
  };
  assert.doesNotThrow(() => adaptZeroRankSanitizedEvidence(bytes(matching), trustedConfig));
});

test('reconciled workspace source material cannot change trusted scope, connection, or timing', () => {
  const value = fixture();
  value.endpoints.workspace.record.rateLimitPerMinute = {
    tenantId: 'tenant-beta',
    siteId: 'site-beta',
    siteScopeRevisionId: 'forged-scope',
  };
  value.endpoints.workspace.record.organization.plan = {
    providerConnectionId: 'forged-connection',
    startedAt: '2099-01-01T00:00:00.000Z',
    endedAt: '2099-01-02T00:00:00.000Z',
  };

  const result = adaptZeroRankSanitizedEvidence(bytes(value), trustedConfig);
  for (const stream of result.collections) {
    for (const batch of stream.batches) {
      assert.deepEqual(batch.collection.scope, trustedConfig.scope);
      assert.equal(batch.collection.providerConnectionId, trustedConfig.providerConnectionId);
      assert.equal(batch.collection.startedAt, trustedConfig.timing.startedAt);
      assert.equal(batch.collection.endedAt, trustedConfig.timing.endedAt);
      assert.equal(batch.collection.collectedAt, trustedConfig.timing.collectedAt);
      assert.equal(batch.collection.receivedAt, trustedConfig.timing.receivedAt);
      assert.equal(batch.collection.sourceTime.start, trustedConfig.timing.observedAt);
      assert.equal(batch.collection.sourceTime.end, trustedConfig.timing.observedAt);
      for (const source of batch.sources) {
        assert.deepEqual(source.record.identity.scope, trustedConfig.scope);
        assert.equal(source.record.identity.providerConnectionId, trustedConfig.providerConnectionId);
      }
    }
  }
});
