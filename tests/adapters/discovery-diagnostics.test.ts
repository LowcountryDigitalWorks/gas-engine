import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptDiscoveryDiagnosticsEvidence,
  validateDiscoveryWindow,
  DISCOVERY_INPUT_SCHEMA_MINOR_VERSION,
  DISCOVERY_INPUT_SCHEMA_VERSION,
  DISCOVERY_MAX_ROWS,
  MAX_DISCOVERY_INPUT_BYTES,
  DiscoveryAdapterError,
  type DiscoveryAdapterConfig,
  type DiscoveryProviderId,
} from '../../src/adapters/discovery-diagnostics.js';
import { parseCollectionBatch } from '../../src/persistence/validation.js';
import type { Scope } from '../../src/persistence/repository.js';
import { batch } from '../persistence/helpers.js';

type MutableJson = Record<string, any>;
const corpus = JSON.parse(readFileSync('tests/fixtures/discovery-diagnostics-evidence-v1.0.json', 'utf8')) as Record<string, MutableJson>;
const alphaScope: Scope = structuredClone(batch('alpha').collection.scope);
const betaScope: Scope = structuredClone(batch('beta').collection.scope);

function fixture(name: 'google' | 'bing' | 'yandex' | 'indexnow'): MutableJson {
  return structuredClone(corpus[name]!);
}

function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
}

function configFor(value: MutableJson, scope: Scope = alphaScope): DiscoveryAdapterConfig {
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

function adapt(value: MutableJson, scope: Scope = alphaScope, pretty = false) {
  return adaptDiscoveryDiagnosticsEvidence(bytes(value, pretty), configFor(value, scope));
}

function expectCode(code: DiscoveryAdapterError['code']): (error: unknown) => boolean {
  return (error) => error instanceof DiscoveryAdapterError && error.code === code;
}

test('all four provider artifacts adapt into existing canonical batches with provider-preserving mappings', () => {
  const google = adapt(fixture('google'));
  const bing = adapt(fixture('bing'));
  const yandex = adapt(fixture('yandex'));
  const indexNow = adapt(fixture('indexnow'));

  assert.deepEqual(
    [google.providerId, bing.providerId, yandex.providerId, indexNow.providerId],
    ['google-search-console', 'bing-webmaster-tools', 'yandex-webmaster', 'indexnow'],
  );

  const googleBroad = google.rows.find((row) => row.url === 'https://example.test/broad');
  assert.ok(googleBroad?.kind === 'search_engine');
  assert.equal(googleBroad.searchPresence, 'absent');
  assert.equal(googleBroad.crawlState, 'blocked');
  assert.equal(googleBroad.indexingPermission, 'blocked');
  assert.equal(googleBroad.canonicalState, 'other');
  assert.equal(googleBroad.canonicalTarget, 'https://example.test/canonical-a');
  assert.equal(googleBroad.providerState['verdict'], 'NEUTRAL');
  assert.equal(googleBroad.providerState['coverageState'], 'Excluded by noindex');

  const bingBroad = bing.rows.find((row) => row.url === 'https://example.test/broad');
  assert.ok(bingBroad?.kind === 'search_engine');
  assert.equal(bingBroad.searchPresence, 'absent');
  assert.equal(bingBroad.crawlState, 'server_error');
  assert.equal(bingBroad.httpStatus, 503);
  assert.equal(bingBroad.canonicalTarget, 'https://example.test/canonical-b');
  assert.equal(bingBroad.providerState['statusCode'], 'SERVER_ERROR');

  const yandexBroad = yandex.rows.find((row) => row.url === 'https://example.test/broad');
  assert.ok(yandexBroad?.kind === 'search_engine');
  assert.equal(yandexBroad.searchPresence, 'absent');
  assert.equal(yandexBroad.crawlState, 'blocked');
  assert.equal(yandexBroad.indexingPermission, 'blocked');
  assert.equal(yandexBroad.canonicalState, 'self');
  assert.equal(yandexBroad.providerState['sourceStatus'], 'EXCLUDED');

  const submitted = indexNow.rows.find((row) => row.url === 'https://example.test/broad');
  assert.ok(submitted?.kind === 'indexnow');
  assert.equal(submitted.submissionResult, 'accepted');
  assert.equal(submitted.submittedAt, '2026-09-29T11:00:00.000Z');
  assert.equal(Object.hasOwn(submitted, 'searchPresence'), false);
  assert.equal(Object.hasOwn(submitted.observationIds, 'searchPresence'), false);

  for (const result of [google, bing, yandex, indexNow]) {
    for (const part of result.batches) assert.doesNotThrow(() => parseCollectionBatch(part));
    assert.equal(result.batches.every((part) => part.collection.providerId === result.providerId), true);
    assert.equal(result.batches.every((part) => part.collection.scope.tenantId === alphaScope.tenantId), true);
  }
});

test('unknown provider evidence remains unknown rather than being manufactured into presence or permission', () => {
  const value = fixture('google');
  value.rows = [{
    url: 'https://example.test/unknown',
    verdict: 'UNKNOWN',
    robotsTxtState: 'UNKNOWN',
    indexingState: 'UNKNOWN',
    pageFetchState: 'UNKNOWN',
  }];
  const result = adapt(value);
  const row = result.rows[0];
  assert.ok(row?.kind === 'search_engine');
  assert.equal(row.searchPresence, 'unknown');
  assert.equal(row.crawlState, 'unknown');
  assert.equal(row.indexingPermission, 'unknown');
  assert.equal(row.canonicalState, 'unknown');
});

test('schema/provider/configuration mismatch and strict unknown source fields fail closed', () => {
  const base = fixture('google');

  for (const [mutate, code] of [
    [(value: MutableJson) => { value.schemaMinorVersion = DISCOVERY_INPUT_SCHEMA_MINOR_VERSION + 1; }, 'unsupported_schema'],
    [(value: MutableJson) => { value.schemaVersion = `${DISCOVERY_INPUT_SCHEMA_VERSION}.future`; }, 'unsupported_schema'],
    [(value: MutableJson) => { value.provider = 'unsupported-provider'; }, 'unsupported_provider'],
    [(value: MutableJson) => { value.extra = true; }, 'invalid_source'],
    [(value: MutableJson) => { value.rows[0].extra = 'unsupported'; }, 'invalid_source'],
  ] as const) {
    const value = structuredClone(base);
    mutate(value);
    assert.throws(() => adaptDiscoveryDiagnosticsEvidence(bytes(value), configFor(base)), expectCode(code));
  }

  assert.throws(
    () => adaptDiscoveryDiagnosticsEvidence(bytes(base), {
      ...configFor(base),
      expectedProvider: 'bing-webmaster-tools',
    }),
    expectCode('configuration_mismatch'),
  );
  assert.throws(
    () => adaptDiscoveryDiagnosticsEvidence(bytes(base), {
      ...configFor(base),
      expectedSite: 'sc-domain:other.example.test',
    }),
    expectCode('configuration_mismatch'),
  );
});

test('duplicate URL, chronology, row bounds and byte bounds fail closed without truncation', () => {
  const duplicate = fixture('bing');
  duplicate.rows.push(structuredClone(duplicate.rows[0]));
  assert.throws(() => adapt(duplicate), expectCode('duplicate_url'));

  const chronology = fixture('indexnow');
  chronology.rows[0].submittedAt = '2026-09-29T12:07:00.000Z';
  assert.throws(() => adapt(chronology), expectCode('invalid_source'));

  const tooMany = fixture('indexnow');
  tooMany.rows = Array.from({ length: DISCOVERY_MAX_ROWS + 1 }, (_, index) => ({
    url: `https://example.test/bound-${index}`,
    submittedAt: '2026-09-29T11:00:00.000Z',
    submissionResult: 'accepted',
    resultCode: 200,
  }));
  assert.throws(() => adapt(tooMany), expectCode('too_many_rows'));

  assert.throws(
    () => adaptDiscoveryDiagnosticsEvidence(new Uint8Array(MAX_DISCOVERY_INPUT_BYTES + 1), configFor(fixture('google'))),
    expectCode('input_too_large'),
  );
});

test('semantic output is deterministic across harmless JSON formatting and source row order', () => {
  for (const name of ['google', 'bing', 'yandex', 'indexnow'] as const) {
    const leftValue = fixture(name);
    const rightValue = fixture(name);
    rightValue.rows.reverse();

    const left = adapt(leftValue, alphaScope, false);
    const right = adapt(rightValue, alphaScope, true);
    assert.deepEqual(right, left);
  }
});

test('trusted Alpha/Beta scope remains authoritative and inert provider/site fields cannot mint ownership', () => {
  const value = fixture('bing');
  const alpha = adapt(value, alphaScope);
  const beta = adapt(value, betaScope);

  assert.deepEqual(alpha.batches[0]!.collection.scope, alphaScope);
  assert.deepEqual(beta.batches[0]!.collection.scope, betaScope);
  assert.notDeepEqual(alpha.batches[0]!.collection.scope, beta.batches[0]!.collection.scope);
  assert.notEqual(alpha.collectionId, beta.collectionId);

  const forged = fixture('bing');
  forged.site = 'sc-domain:forged.example.test';
  assert.throws(
    () => adaptDiscoveryDiagnosticsEvidence(bytes(forged), configFor(value, alphaScope)),
    expectCode('configuration_mismatch'),
  );
});


test('adapted-window validator detects sidecar and canonical observation tampering before analysis', () => {
  const value = fixture('google');
  const result = adapt(value);
  assert.doesNotThrow(() => validateDiscoveryWindow(result));

  const sidecarTamper = structuredClone(result);
  const firstRow = sidecarTamper.rows[0];
  assert.ok(firstRow?.kind === 'search_engine');
  (firstRow as any).searchPresence = firstRow.searchPresence === 'present' ? 'absent' : 'present';
  assert.throws(
    () => validateDiscoveryWindow(sidecarTamper),
    (error: unknown) => error instanceof DiscoveryAdapterError && error.code === 'invalid_output',
  );

  const canonicalTamper = structuredClone(result);
  const firstObservation = canonicalTamper.batches[0]?.observations[0]?.record;
  assert.ok(firstObservation?.value.state === 'observed' && firstObservation.value.value.type === 'text');
  (firstObservation.value.value as any).value = 'forged-state';
  assert.throws(
    () => validateDiscoveryWindow(canonicalTamper),
    (error: unknown) => error instanceof DiscoveryAdapterError && error.code === 'invalid_output',
  );
});
test('adapter production surface has no authority issuer, provider client, persistence write, credential or runtime-AI path', () => {
  const source = readFileSync('src/adapters/discovery-diagnostics.ts', 'utf8');
  assert.doesNotMatch(source, /from ['"].*tenant-authority|issueTenantContext\s*\(|createTestTenantContext\s*\(/i);
  assert.doesNotMatch(source, /from ['"](?:node:http|node:https|node:net|undici|axios|googleapis)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(|new\s+WebSocket\s*\(|from ['"].*(?:googleapis|oauth|credential)/i);
  assert.doesNotMatch(source, /persistCollection|LocalEvidenceRepository|CREATE TABLE|ALTER TABLE|INSERT INTO/i);
  assert.doesNotMatch(source, /\b(?:OpenAI|Anthropic|BYOK|embedding|LLM)\b/i);
});
