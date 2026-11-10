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

test('rejects valid or policy fields on non-spf/dmarc dns checks', () => {
  const dnssecPolicy = structuredClone(dnsFixture) as MutableJson;
  dnssecPolicy.checks = (dnssecPolicy.checks as MutableJson[]).map((check) =>
    check.code === 'dnssec' ? { code: 'dnssec', classification: 'absent', policy: 'reject' } : check,
  );
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(dnssecPolicy), dnsConfig()), expectCode('invalid_source'));
  const zoneValid = structuredClone(dnsFixture) as MutableJson;
  zoneValid.checks = (zoneValid.checks as MutableJson[]).map((check) =>
    check.code === 'zone_transfer' ? { code: 'zone_transfer', classification: 'inconclusive', valid: true } : check,
  );
  assert.throws(() => adaptDomscanSidecarEvidence(bytes(zoneValid), dnsConfig()), expectCode('invalid_source'));
});

test('trusted siteId with leading digit matches WQT opaque id pattern', () => {
  const digitSite = structuredClone(dnsFixture) as MutableJson;
  digitSite.siteId = '9synthetic-gas-domscan';
  const config = { ...dnsConfig(), expectedSiteId: '9synthetic-gas-domscan' };
  const result = adaptDomscanSidecarEvidence(bytes(digitSite), config);
  assert.equal(result.semantics.siteId, '9synthetic-gas-domscan');
  assert.doesNotThrow(() => validateDomscanWindow(result));
  const uppercaseSite = structuredClone(dnsFixture) as MutableJson;
  uppercaseSite.siteId = 'Bad_Site';
  assert.throws(
    () => adaptDomscanSidecarEvidence(bytes(uppercaseSite), { ...dnsConfig(), expectedSiteId: 'Bad_Site' }),
    expectCode('invalid_source'),
  );
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


test('valid long DomScan trusted identifiers split the same 12 signals into bounded parts', () => {
  const accepted = adaptDomscanSidecarEvidence(bytes(agentFixture), agentConfig());
  assert.equal(accepted.batches.length, 1, 'existing short-identity fixture must remain one part');
  assert.doesNotThrow(() => validateDomscanWindow(accepted));

  // Both strings are valid opaque G.A.S. identifiers (below 128 characters).
  // Their repeated canonical provenance previously pushed a valid 12-signal
  // WQT sidecar over the one-part 65,536-byte cap and caused row_too_large.
  const longConfig: DomscanAdapterConfig = {
    ...agentConfig(),
    providerConnectionId: `domscan-${'x'.repeat(110)}`,
    availability: { state: 'available', reference: `domscan-${'y'.repeat(110)}` },
  };
  const multipart = adaptDomscanSidecarEvidence(bytes(agentFixture), longConfig);
  assert.ok(multipart.batches.length > 1, 'long but valid identifiers must use bounded parts');
  assert.ok(multipart.batches.length <= 64);
  assert.equal(multipart.rows.length, 12);
  assert.equal(multipart.batches.flatMap((part) => part.sources).length, 12);
  assert.equal(multipart.batches.flatMap((part) => part.observations).length, 24);

  for (const [index, batch] of multipart.batches.entries()) {
    assert.equal(batch.part, index + 1);
    assert.equal(batch.parts, multipart.batches.length);
    assert.equal(batch.collection.id, multipart.collectionId);
    assert.equal(batch.idempotencyKey, multipart.idempotencyKey);
    assert.ok(batch.sources.length <= 16);
    assert.ok(batch.observations.length <= 32);
    assert.doesNotThrow(() => parseCollectionBatch(batch));
  }
  assert.doesNotThrow(() => validateDomscanWindow(multipart));
  const repeated = adaptDomscanSidecarEvidence(bytes(agentFixture, true), longConfig);
  assert.equal(repeated.collectionId, multipart.collectionId);
  assert.equal(repeated.idempotencyKey, multipart.idempotencyKey);
  assert.deepEqual(repeated.batches, multipart.batches);

  // No part may be reordered, silently lose an observation or claim a
  // conflicting part index without fail-closed downstream validation.
  const reversed = { ...multipart, batches: [...multipart.batches].reverse() };
  assert.throws(() => validateDomscanWindow(reversed), expectCode('invalid_output'));
  const wrongPart = {
    ...multipart,
    batches: multipart.batches.map((part, index) =>
      index === 0 ? { ...part, part: 2 } : part),
  };
  assert.throws(() => validateDomscanWindow(wrongPart), expectCode('invalid_output'));
  const droppedObservation = {
    ...multipart,
    batches: multipart.batches.map((part, index) =>
      index === 0 ? { ...part, observations: part.observations.slice(1) } : part),
  };
  assert.throws(() => validateDomscanWindow(droppedObservation), expectCode('invalid_output'));

  // A coordinated deletion must not pass as "complete" simply because the
  // remaining local rows and canonical sources still match each other.
  const removedRow = multipart.rows[0]!;
  const removedTogether = {
    ...multipart,
    rows: multipart.rows.slice(1),
    batches: multipart.batches.map((part) => ({
      ...part,
      sources: part.sources.filter((source) => source.id !== removedRow.sourceId),
      observations: part.observations.filter((observation) =>
        observation.sourceId !== removedRow.sourceId),
    })),
  };
  for (const part of removedTogether.batches) {
    assert.doesNotThrow(() => parseCollectionBatch(part), 'partial deletion still has valid part shape');
  }
  assert.throws(() => validateDomscanWindow(removedTogether), expectCode('invalid_output'));

  const duplicateRowIdentity = {
    ...multipart,
    rows: multipart.rows.map((row, index) =>
      index === 1 ? { ...row, rowIdentity: multipart.rows[0]!.rowIdentity } : row),
  };
  assert.throws(() => validateDomscanWindow(duplicateRowIdentity), expectCode('invalid_output'));

  const [metricKey, validObservationId] = Object.entries(multipart.rows[0]!.observationIds)[0]!;
  const relabeledMetricKey = {
    ...multipart,
    rows: multipart.rows.map((row, index) => index === 0
      ? {
        ...row,
        observationIds: Object.fromEntries([
          ...Object.entries(row.observationIds).filter(([key]) => key !== metricKey),
          ['synthetic-wrong-metric-key', validObservationId],
        ]),
      }
      : row),
  };
  assert.throws(() => validateDomscanWindow(relabeledMetricKey), expectCode('invalid_output'));
});


test('DomScan validation rejects accessor and Proxy inputs before reading mutable row identities', () => {
  const config: DomscanAdapterConfig = {
    ...agentConfig(),
    providerConnectionId: `domscan-${'x'.repeat(110)}`,
    availability: { state: 'available', reference: `domscan-${'y'.repeat(110)}` },
  };
  const valid = adaptDomscanSidecarEvidence(bytes(agentFixture), config);
  assert.ok(valid.batches.length > 1);
  assert.doesNotThrow(() => validateDomscanWindow(valid));

  const accessorRow = structuredClone(valid);
  let rowReads = 0;
  const actualIdentity = accessorRow.rows[0]!.rowIdentity;
  Object.defineProperty(accessorRow.rows[0]!, 'rowIdentity', {
    enumerable: true,
    configurable: true,
    get() {
      rowReads += 1;
      return rowReads <= 2 ? actualIdentity : 'synthetic-inconsistent-row';
    },
  });
  assert.throws(() => validateDomscanWindow(accessorRow), expectCode('invalid_output'));
  assert.equal(rowReads, 0, 'row getter must not be invoked by validation');

  const accessorOuter = { ...valid };
  let rowsReads = 0;
  Object.defineProperty(accessorOuter, 'rows', {
    enumerable: true,
    configurable: true,
    get() {
      rowsReads += 1;
      return valid.rows;
    },
  });
  assert.throws(() => validateDomscanWindow(accessorOuter), expectCode('invalid_output'));
  assert.equal(rowsReads, 0, 'top-level rows getter must not be invoked');

  const accessorMetric = structuredClone(valid);
  const metricMap = accessorMetric.rows[0]!.observationIds;
  const [metricName, metricId] = Object.entries(metricMap)[0]!;
  let metricReads = 0;
  Object.defineProperty(metricMap, metricName, {
    enumerable: true,
    configurable: true,
    get() {
      metricReads += 1;
      return metricId;
    },
  });
  assert.throws(() => validateDomscanWindow(accessorMetric), expectCode('invalid_output'));
  assert.equal(metricReads, 0, 'observation map getter must not be invoked');

  assert.throws(
    () => validateDomscanWindow({ ...valid, rows: new Proxy(valid.rows, {}) }),
    expectCode('invalid_output'),
  );
  assert.throws(
    () => validateDomscanWindow(new Proxy(valid, {})),
    expectCode('invalid_output'),
  );
});


test('DomScan window semantics cannot promote method authority or drift from canonical collection', () => {
  const config: DomscanAdapterConfig = {
    ...agentConfig(),
    providerConnectionId: `domscan-${'x'.repeat(110)}`,
    availability: { state: 'available', reference: `domscan-${'y'.repeat(110)}` },
  };
  const valid = adaptDomscanSidecarEvidence(bytes(agentFixture), config);
  assert.ok(valid.batches.length > 1);
  assert.doesNotThrow(() => validateDomscanWindow(valid));

  const mutate = (field: string, value: unknown) => {
    const altered = structuredClone(valid);
    (altered.semantics as unknown as MutableJson)[field] = value;
    assert.throws(
      () => validateDomscanWindow(altered),
      expectCode('invalid_output'),
      `tampered semantics ${field} must fail closed`,
    );
  };
  mutate('providerMethodEstablished', true);
  mutate('endpoint', 'dns_security');
  mutate('trustedOrigin', 'https://another-site.example.test');
  mutate('artifactOrigin', 'https://another-site.example.test');
  mutate('inputObservedAt', '2026-11-07T11:00:00.000Z');
  mutate('outcome', 'invented-outcome');
  mutate('availability', { state: 'available', reference: 'synthetic-wrong-availability' });
  mutate('sourceNativeMethodEstablished', true);

  const noOutcome = structuredClone(valid);
  delete (noOutcome.semantics as unknown as MutableJson).outcome;
  assert.throws(() => validateDomscanWindow(noOutcome), expectCode('invalid_output'));

  const invalidDns = structuredClone(adaptDomscanSidecarEvidence(bytes(dnsFixture), dnsConfig()));
  (invalidDns.semantics as unknown as MutableJson).outcome = 'partial';
  assert.throws(() => validateDomscanWindow(invalidDns), expectCode('invalid_output'));
});

test('DomScan batch array accessors and Proxies are rejected without executing user code', () => {
  const config: DomscanAdapterConfig = {
    ...agentConfig(),
    providerConnectionId: `domscan-${'x'.repeat(110)}`,
    availability: { state: 'available', reference: `domscan-${'y'.repeat(110)}` },
  };
  const valid = adaptDomscanSidecarEvidence(bytes(agentFixture), config);
  assert.ok(valid.batches.length > 1);
  assert.doesNotThrow(() => validateDomscanWindow(valid));

  const accessorBatches = [...valid.batches];
  let getterCalls = 0;
  Object.defineProperty(accessorBatches, '0', {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return valid.batches[0];
    },
  });
  assert.throws(
    () => validateDomscanWindow({ ...valid, batches: accessorBatches }),
    expectCode('invalid_output'),
  );
  assert.equal(getterCalls, 0, 'indexed batch getter must not be called');

  const proxyArray = new Proxy(valid.batches, {
    get(target, key) {
      getterCalls += 1;
      return Reflect.get(target, key);
    },
  });
  assert.throws(
    () => validateDomscanWindow({ ...valid, batches: proxyArray }),
    expectCode('invalid_output'),
  );
  assert.equal(getterCalls, 0, 'batch Proxy trap must not be called');

  const proxyPart = new Proxy(valid.batches[0]!, {});
  assert.throws(
    () => validateDomscanWindow({ ...valid, batches: [proxyPart, ...valid.batches.slice(1)] }),
    expectCode('invalid_output'),
  );
  const sparseBatches = new Array(valid.batches.length);
  sparseBatches[1] = valid.batches[1];
  assert.throws(
    () => validateDomscanWindow({ ...valid, batches: sparseBatches }),
    expectCode('invalid_output'),
  );
});


test('DomScan adapted classification and ordered endpoint codes must match canonical evidence', () => {
  const dns = adaptDomscanSidecarEvidence(bytes(dnsFixture), dnsConfig());
  const agent = adaptDomscanSidecarEvidence(bytes(agentFixture), agentConfig());
  assert.doesNotThrow(() => validateDomscanWindow(dns));
  assert.doesNotThrow(() => validateDomscanWindow(agent));

  const wrongClassification = structuredClone(dns);
  const original = wrongClassification.rows[0]!.classification;
  const flipped = original === 'absent' ? 'present' : 'absent';
  (wrongClassification.rows[0] as unknown as MutableJson).classification = flipped;
  assert.notEqual(flipped, original);
  assert.throws(() => validateDomscanWindow(wrongClassification), expectCode('invalid_output'));

  const relabeledUnknown = structuredClone(agent);
  (relabeledUnknown.rows[0] as unknown as MutableJson).classification = 'unknown';
  assert.throws(() => validateDomscanWindow(relabeledUnknown), expectCode('invalid_output'));

  const missingClassificationMetric = structuredClone(dns);
  const ids = missingClassificationMetric.rows[0]!.observationIds as unknown as MutableJson;
  delete ids['domscan-dns-check-classification'];
  assert.throws(() => validateDomscanWindow(missingClassificationMetric), expectCode('invalid_output'));

  const reordered = {
    ...agent,
    rows: [agent.rows[1]!, agent.rows[0]!, ...agent.rows.slice(2)],
  };
  assert.throws(() => validateDomscanWindow(reordered), expectCode('invalid_output'));
});
