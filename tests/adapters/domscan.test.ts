import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptDomscanSidecarEvidence,
  assertDomscanCollectionsComparable,
  validateDomscanWindow,
  DOMSCAN_DNS_CHECK_CODES,
  MAX_DOMSCAN_INPUT_BYTES,
  DomscanAdapterError,
  type DomscanAdapterConfig,
} from '../../src/adapters/domscan.js';
import { parseCollectionBatch } from '../../src/persistence/validation.js';
import { batch } from '../persistence/helpers.js';

type MutableJson = Record<string, unknown>;

const dnsFixture = JSON.parse(
  readFileSync('tests/fixtures/domscan-dns-security-sidecar.v1.json', 'utf8'),
) as MutableJson;
const agentFixture = JSON.parse(
  readFileSync('tests/fixtures/domscan-agent-readiness-sidecar.v1.json', 'utf8'),
) as MutableJson;

const alphaScope = structuredClone(batch('alpha').collection.scope);

function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
}

function dnsConfig(scope = alphaScope): DomscanAdapterConfig {
  return {
    scope: structuredClone(scope),
    expectedSiteId: 'synthetic-gas-domscan',
    expectedOrigin: 'https://fixture-dns.example.test',
    expectedEndpoint: 'dns_security',
    providerConnectionId: 'synthetic-domscan-connection',
    collectedAt: '2026-11-07T12:05:00.000Z',
    receivedAt: '2026-11-07T12:06:00.000Z',
    availability: { state: 'available', reference: 'synthetic-domscan-dns-export' },
  };
}

function agentConfig(scope = alphaScope): DomscanAdapterConfig {
  return {
    scope: structuredClone(scope),
    expectedSiteId: 'synthetic-gas-domscan',
    expectedOrigin: 'https://fixture-agent.example.test',
    expectedEndpoint: 'agent_readiness',
    providerConnectionId: 'synthetic-domscan-connection',
    collectedAt: '2026-11-07T12:06:00.000Z',
    receivedAt: '2026-11-07T12:07:00.000Z',
    availability: { state: 'available', reference: 'synthetic-domscan-agent-export' },
  };
}

function expectCode(code: DomscanAdapterError['code']): (error: unknown) => boolean {
  return (error) => error instanceof DomscanAdapterError && error.code === code;
}

test('DomScan dns_security sidecar adapts into bounded domscan canonical evidence', () => {
  const result = adaptDomscanSidecarEvidence(bytes(dnsFixture), dnsConfig());
  assert.equal(result.providerId, 'domscan');
  assert.equal(result.endpoint, 'dns_security');
  assert.equal(result.rows.length, DOMSCAN_DNS_CHECK_CODES.length);
  assert.equal(result.batches.length, 1);
  assert.doesNotThrow(() => parseCollectionBatch(result.batches[0]!));
  assert.doesNotThrow(() => validateDomscanWindow(result));
  assert.equal(result.semantics.providerMethodEstablished, false);
  const part = parseCollectionBatch(result.batches[0]!);
  assert.equal(part.collection.providerId, 'domscan');
  assert.equal(part.collection.method.id, 'ldw-domscan-dns-security');
  assert.equal(part.collection.sourceSchema.id, 'ldw.wqt-domscan-sidecar');
  for (const observation of part.observations) {
    assert.equal(observation.record.cohort.context.dimensions.providerId, 'domscan');
    assert.notEqual(observation.record.cohort.context.metric.id, 'domscan-agent-readiness-score');
  }
  const spf = result.rows.find((row) => row.code === 'spf');
  assert.ok(spf?.observationIds['domscan-dns-spf-valid']);
  const dmarc = result.rows.find((row) => row.code === 'dmarc');
  assert.ok(dmarc?.observationIds['domscan-dns-dmarc-policy']);
  const mta = result.rows.find((row) => row.code === 'mta_sts');
  assert.equal(mta?.classification, 'not_detected');
  const mtaClassObs = part.observations.find(
    (entry) =>
      entry.record.cohort.context.dimensions.surface === 'domscan:mta_sts'
      && entry.record.cohort.context.metric.id === 'domscan-dns-check-classification',
  );
  assert.equal(mtaClassObs?.record.value.state, 'unknown');
});

test('DomScan agent_readiness sidecar adapts twelve sorted signals without canonical score metric', () => {
  const result = adaptDomscanSidecarEvidence(bytes(agentFixture), agentConfig());
  assert.equal(result.endpoint, 'agent_readiness');
  assert.equal(result.rows.length, 12);
  assert.equal(result.semantics.outcome, 'partial');
  const webmcp = result.rows.find((row) => row.code === 'webmcp');
  assert.equal(webmcp?.classification, 'unknown');
  const metrics = new Set(
    parseCollectionBatch(result.batches[0]!).observations.map((entry) => entry.record.cohort.context.metric.id),
  );
  assert.ok(!metrics.has('domscan-agent-readiness-score'));
  assert.ok(!metrics.has('agentReadinessScore'));
  assert.doesNotThrow(() => validateDomscanWindow(result));
  const part = parseCollectionBatch(result.batches[0]!);
  const catalogClass = part.observations.find(
    (entry) =>
      entry.record.cohort.context.dimensions.surface === 'domscan:api_catalog'
      && entry.record.cohort.context.metric.id === 'domscan-agent-signal-classification',
  );
  assert.equal(catalogClass?.record.value.state, 'not_applicable');
  assert.doesNotMatch(JSON.stringify(part), /@|mailto:/i);
});

test('JSON whitespace does not change semantic collection identity', () => {
  const compact = adaptDomscanSidecarEvidence(bytes(dnsFixture), dnsConfig());
  const pretty = adaptDomscanSidecarEvidence(bytes(dnsFixture, true), dnsConfig());
  assert.notEqual(compact.inputSha256, pretty.inputSha256);
  assert.equal(compact.collectionId, pretty.collectionId);
  assert.equal(compact.idempotencyKey, pretty.idempotencyKey);
  assert.deepEqual(compact.rows, pretty.rows);
});

test('semantic value change changes collection identity while byte hash also changes', () => {
  const tampered = structuredClone(dnsFixture) as MutableJson;
  const checks = tampered.checks as MutableJson[];
  checks[0] = { ...checks[0] as MutableJson, classification: 'absent', valid: undefined };
  const base = adaptDomscanSidecarEvidence(bytes(dnsFixture), dnsConfig());
  const changed = adaptDomscanSidecarEvidence(bytes(tampered), dnsConfig());
  assert.notEqual(base.inputSha256, changed.inputSha256);
  assert.notEqual(base.collectionId, changed.collectionId);
});

test('rejects unknown fields, schema drift, and oversize input', () => {
  const extra = structuredClone(dnsFixture);
  extra.unexpected = true;
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(extra), dnsConfig()), expectCode('invalid_source'));
  const wrongSchema = structuredClone(dnsFixture);
  wrongSchema.schemaVersion = 'ldw.wqt-domscan-sidecar.v2';
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(wrongSchema), dnsConfig()), expectCode('unsupported_schema'));
  const huge = Buffer.alloc(MAX_DOMSCAN_INPUT_BYTES + 1, 0x20);
  assert.throws(() => adaptDomscanSidecarEvidence(huge, dnsConfig()), expectCode('input_too_large'));
  assert.equal(MAX_DOMSCAN_INPUT_BYTES, 262_144);
  assert.throws(() => adaptDomscanSidecarEvidence(Buffer.from('{', 'utf8'), dnsConfig()), expectCode('invalid_json'));
  assert.throws(() => adaptDomscanSidecarEvidence(Buffer.from([0xff, 0xfe]), dnsConfig()), expectCode('invalid_utf8'));
});

test('trusted identity mismatches fail closed', () => {
  const wrongSite = { ...dnsConfig(), expectedSiteId: 'other-site' };
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(dnsFixture), wrongSite), expectCode('configuration_mismatch'));
  const wrongOrigin = { ...dnsConfig(), expectedOrigin: 'https://other.example.test' };
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(dnsFixture), wrongOrigin), expectCode('configuration_mismatch'));
  const wrongEndpoint = { ...dnsConfig(), expectedEndpoint: 'agent_readiness' as const };
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(dnsFixture), wrongEndpoint), expectCode('configuration_mismatch'));
  const betaScope = structuredClone(batch('beta').collection.scope);
  const alpha = adaptDomscanSidecarEvidence(bytes(dnsFixture), dnsConfig());
  const beta = adaptDomscanSidecarEvidence(bytes(dnsFixture), dnsConfig(betaScope));
  assert.notEqual(alpha.collectionId, beta.collectionId);
});

test('dns check order, count, and SPF/DMARC policy consistency are enforced', () => {
  const dup = structuredClone(dnsFixture) as MutableJson;
  const checks = dup.checks as MutableJson[];
  checks.push(structuredClone(checks[0]!));
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(dup), dnsConfig()), expectCode('invalid_source'));
  const reorder = structuredClone(dnsFixture) as MutableJson;
  (reorder.checks as MutableJson[])[0] = { code: 'dkim', classification: 'present' };
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(reorder), dnsConfig()), expectCode('invalid_source'));
  const badSpf = structuredClone(dnsFixture) as MutableJson;
  badSpf.checks = (badSpf.checks as MutableJson[]).map((check) =>
    check.code === 'spf' ? { code: 'spf', classification: 'absent', valid: false } : check,
  );
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(badSpf), dnsConfig()), expectCode('policy_violation'));
  const badDmarc = structuredClone(dnsFixture) as MutableJson;
  badDmarc.checks = (badDmarc.checks as MutableJson[]).map((check) =>
    check.code === 'dmarc' ? { code: 'dmarc', classification: 'absent', policy: 'reject' } : check,
  );
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(badDmarc), dnsConfig()), expectCode('policy_violation'));
});

test('off-scope timestamps and noncanonical origins are rejected', () => {
  const futureCollected = { ...dnsConfig(), collectedAt: '2025-01-01T00:00:00.000Z' };
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(dnsFixture), futureCollected), expectCode('invalid_source'));
  const badOrigin = structuredClone(dnsFixture);
  badOrigin.origin = 'http://fixture-dns.example.test';
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(badOrigin), dnsConfig()), expectCode('invalid_source'));
  const tzArtifact = structuredClone(dnsFixture);
  tzArtifact.inputObservedAt = '2026-11-07T12:00:00+00:00';
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(tzArtifact), dnsConfig()), expectCode('invalid_source'));
});

test('dns_security and agent_readiness collections are not mechanically comparable', () => {
  const dns = validateDomscanWindow(adaptDomscanSidecarEvidence(bytes(dnsFixture), dnsConfig()));
  const agent = validateDomscanWindow(adaptDomscanSidecarEvidence(bytes(agentFixture), agentConfig()));
  assert.throws(
    () => assertDomscanCollectionsComparable(dns.collection, agent.collection),
    expectCode('incompatible_collections'),
  );
});

test('rejects WQT-inconsistent DMARC policy, agent outcome, and method tokens', () => {
  const badPolicy = structuredClone(dnsFixture) as MutableJson;
  badPolicy.checks = (badPolicy.checks as MutableJson[]).map((check) =>
    check.code === 'dmarc' ? { code: 'dmarc', classification: 'present', policy: 'monitor' } : check,
  );
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(badPolicy), dnsConfig()), expectCode('invalid_source'));
  const badOutcome = structuredClone(agentFixture);
  badOutcome.outcome = 'mostly_ready';
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(badOutcome), agentConfig()), expectCode('invalid_source'));
  const badMethod = structuredClone(agentFixture) as MutableJson;
  const signals = badMethod.signals as MutableJson[];
  const webmcp = signals.find((signal) => signal.code === 'webmcp') as MutableJson;
  webmcp.method = 'Static_HTML';
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(badMethod), agentConfig()), expectCode('invalid_source'));
  const badCaveat = structuredClone(agentFixture) as MutableJson;
  const caveatSignals = badCaveat.signals as MutableJson[];
  const webmcpCaveat = caveatSignals.find((signal) => signal.code === 'webmcp') as MutableJson;
  webmcpCaveat.caveats = ['RUNTIME_OBSERVATION_REQUIRED'];
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(badCaveat), agentConfig()), expectCode('invalid_source'));
  const emailCaveat = structuredClone(agentFixture) as MutableJson;
  const emailSignals = emailCaveat.signals as MutableJson[];
  const webmcpEmail = emailSignals.find((signal) => signal.code === 'webmcp') as MutableJson;
  webmcpEmail.caveats = ['contact_team@example.test'];
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(emailCaveat), agentConfig()), expectCode('invalid_source'));
});

test('agent signal caveat changes shift semantic source and collection identity', () => {
  const base = adaptDomscanSidecarEvidence(bytes(agentFixture), agentConfig());
  const caveated = structuredClone(agentFixture) as MutableJson;
  const signals = caveated.signals as MutableJson[];
  const webmcp = signals.find((signal) => signal.code === 'webmcp') as MutableJson;
  webmcp.caveats = ['runtime_observation_required', 'static_html_only'];
  const changed = adaptDomscanSidecarEvidence(bytes(caveated), agentConfig());
  assert.notEqual(base.collectionId, changed.collectionId);
  const baseRow = base.rows.find((row) => row.code === 'webmcp');
  const changedRow = changed.rows.find((row) => row.code === 'webmcp');
  assert.notEqual(baseRow?.sourceId, changedRow?.sourceId);
});

test('provider connection mismatch is incompatible', () => {
  const left = validateDomscanWindow(adaptDomscanSidecarEvidence(bytes(dnsFixture), dnsConfig()));
  const otherConnection = adaptDomscanSidecarEvidence(bytes(dnsFixture), {
    ...dnsConfig(),
    providerConnectionId: 'other-domscan-connection',
  });
  assert.throws(
    () => assertDomscanCollectionsComparable(left.collection, validateDomscanWindow(otherConnection).collection),
    expectCode('incompatible_collections'),
  );
});
