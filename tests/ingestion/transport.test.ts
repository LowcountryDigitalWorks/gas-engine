import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createIngestionHandler, MAX_INGESTION_BODY_BYTES, MAX_AUTHORIZATION_HEADER_LENGTH } from '../../src/ingestion/http.js';
import type { IngestionApplication } from '../../src/ingestion/service.js';
import { alpha, batch } from '../persistence/helpers.js';
import { content, principal, request, setup, synthetic } from './helpers.js';

const url = 'https://synthetic.invalid/v1/evidence/collections';
const encoder = new TextEncoder();
function streamRequest(stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}, signal?: AbortSignal): Request {
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST', body: stream, duplex: 'half', headers: {
      Authorization: `Bearer ${synthetic.alphaCredential}`, 'Content-Type': 'application/json', 'Idempotency-Key': batch().idempotencyKey, ...headers,
    },
  };
  if (signal) init.signal = signal;
  return new Request(url, init);
}
function chunks(values: Uint8Array[]): { stream: ReadableStream<Uint8Array>; pulls: () => number; cancelled: () => number } {
  let count = 0;
  let cancellations = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const value = values[count++];
      if (value) controller.enqueue(value); else controller.close();
    },
    cancel() { cancellations++; },
  }, { highWaterMark: 0 });
  return { stream, pulls: () => count, cancelled: () => cancellations };
}

test('transport proof retains explicit header/body bounds below the canonical 64 KiB bound', () => {
  assert.equal(MAX_AUTHORIZATION_HEADER_LENGTH, 1024);
  assert.equal(MAX_INGESTION_BODY_BYTES, 49_152);
  assert.ok(MAX_INGESTION_BODY_BYTES < 65_536);
});

test('route and method reject before authentication; no read endpoint exists', async (t) => {
  const { service } = await setup(t);
  let calls = 0;
  const handler = createIngestionHandler({ async authenticate() { calls++; return null; } }, service);
  for (const [path, method, status, code] of [
    ['/v1/evidence/unknown', 'POST', 404, 'not_found'], ['/v1/evidence/collections/', 'POST', 404, 'not_found'],
    ['/v1/evidence/collections', 'GET', 405, 'method_not_allowed'], ['/v1/evidence/collections', 'PUT', 405, 'method_not_allowed'],
  ] as const) {
    const response = await handler(new Request(`https://synthetic.invalid${path}`, { method }));
    assert.equal(response.status, status);
    assert.deepEqual(await response.json(), { error: { code } });
    if (status === 405) assert.equal(response.headers.get('Allow'), 'POST');
  }
  assert.equal(calls, 0);
});

test('authentication and media failures do not pull the body and cancel unused streams', async (t) => {
  const { handler } = await setup(t);
  for (const [headers, status] of [[{ Authorization: `Bearer ${synthetic.unknownCredential}` }, 401], [{ 'Content-Type': 'text/plain' }, 415]] as const) {
    const body = chunks([new Uint8Array(MAX_INGESTION_BODY_BYTES + 1)]);
    const response = await handler(streamRequest(body.stream, headers));
    assert.equal(response.status, status);
    assert.equal(body.pulls(), 0);
    assert.equal(body.cancelled(), 1);
    assert.equal(body.stream.locked, false);
  }
});

test('only bounded bearer syntax is parsed; credential value reaches the authenticator unchanged', async (t) => {
  const { service } = await setup(t);
  const seen: string[] = [];
  const handler = createIngestionHandler({ async authenticate(value) { seen.push(value); return principal('alpha'); } }, service);
  const opaque = synthetic.opaqueCredential;
  assert.equal((await handler(request(batch(), opaque, { Authorization: `bEaReR  ${opaque}` }))).status, 201);
  assert.deepEqual(seen, [opaque]);
  const oversized = request();
  oversized.headers.set('Authorization', 'x'.repeat(MAX_AUTHORIZATION_HEADER_LENGTH + 1));
  assert.equal((await handler(oversized)).status, 401);
  assert.equal(seen.length, 1);
});

test('JSON media type and UTF-8 charset are supported; encodings and unknown parameters reject', async (t) => {
  const { handler } = await setup(t);
  for (const media of ['application/json', 'Application/JSON; charset=UTF-8', 'application/json; charset="utf-8"']) {
    const response = await handler(request(batch(), synthetic.alphaCredential, { 'Content-Type': media, 'Content-Encoding': 'identity' }));
    assert.ok(response.status === 201 || response.status === 200);
  }
  for (const headers of [
    { 'Content-Type': 'text/json' }, { 'Content-Type': 'application/json; charset=iso-8859-1' },
    { 'Content-Type': 'application/json; boundary=synthetic' }, { 'Content-Type': 'application/json, application/json' },
    { 'Content-Encoding': 'gzip' }, { 'Content-Encoding': 'br' }, { 'Content-Encoding': 'identity,gzip' },
  ]) assert.equal((await handler(request(batch(), synthetic.alphaCredential, headers))).status, 415);
  const missing = request();
  missing.headers.delete('Content-Type');
  assert.equal((await handler(missing)).status, 415);
});

test('missing, malformed and oversized idempotency headers reject without reserving a key', async (t) => {
  const { handler, repo } = await setup(t);
  for (const key of [null, '', '*', '../synthetic', 'x'.repeat(129), 'synthetic-one,synthetic-two']) {
    const input = request();
    if (key === null) input.headers.delete('Idempotency-Key'); else input.headers.set('Idempotency-Key', key);
    assert.equal((await handler(input)).status, 400);
  }
  assert.equal(await repo.getCollection(alpha, batch().collection.id), null);
  assert.equal((await handler(request())).status, 201);
});

test('malformed JSON, invalid UTF-8, incomplete encodings and BOM fail with bounded error bodies', async (t) => {
  const { handler, repo } = await setup(t);
  for (const bytes of [
    encoder.encode('{ invalid synthetic private data'), new Uint8Array([0xc3, 0x28]), new Uint8Array([0xe2, 0x82]),
    new Uint8Array([0xff, 0xfe, 0x7b, 0]), new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]),
  ]) {
    const body = chunks([bytes]);
    const response = await handler(streamRequest(body.stream));
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: { code: 'invalid_request' } });
    assert.equal(body.stream.locked, false);
  }
  assert.deepEqual(await repo.listObservations(alpha), []);
});

test('UTF-8 split across chunks decodes exactly without substituting invalid bytes', async (t) => {
  const { handler, repo } = await setup(t);
  const value = batch();
  value.observations[0]!.record.cohort.context.metric.valueType = 'text';
  value.observations[0]!.record.value = { state: 'observed', value: { type: 'text', value: 'Synthetic café 🧪' } };
  const bytes = encoder.encode(JSON.stringify(content(value)));
  const body = chunks(Array.from(bytes, (byte) => new Uint8Array([byte])));
  assert.equal((await handler(streamRequest(body.stream))).status, 201);
  assert.deepEqual((await repo.getObservation(alpha, value.observations[0]!.record.id))?.value, value.observations[0]!.record.value);
});

test('Content-Length is bounded early and checked for malformed or mismatching declarations', async (t) => {
  const { handler, repo } = await setup(t);
  const body = chunks([encoder.encode(JSON.stringify(content()))]);
  assert.equal((await handler(streamRequest(body.stream, { 'Content-Length': String(MAX_INGESTION_BODY_BYTES + 1) }))).status, 413);
  assert.equal(body.pulls(), 0);
  assert.equal(body.cancelled(), 1);
  for (const length of ['-1', '1.5', 'abc', '1,2', '0', '1']) {
    const input = request();
    input.headers.set('Content-Length', length);
    assert.equal((await handler(input)).status, 400, length);
  }
  assert.deepEqual(await repo.listObservations(alpha), []);
});

test('absent and dishonest Content-Length cannot bypass streaming byte limits; no later chunks are pulled', async (t) => {
  const { handler, repo } = await setup(t);
  for (const headers of [{}, { 'Content-Length': '1' }]) {
    const body = chunks([new Uint8Array(MAX_INGESTION_BODY_BYTES), new Uint8Array([32]), new Uint8Array(1024)]);
    const response = await handler(streamRequest(body.stream, headers));
    assert.equal(response.status, 413);
    assert.deepEqual(await response.json(), { error: { code: 'body_too_large' } });
    assert.equal(body.pulls(), 2);
    assert.equal(body.cancelled(), 1);
    assert.equal(body.stream.locked, false);
  }
  assert.deepEqual(await repo.listObservations(alpha), []);
  assert.equal((await handler(request())).status, 201);
});

test('a single oversized chunk is rejected; the exact byte limit can carry valid padded JSON', async (t) => {
  const { handler } = await setup(t);
  const big = chunks([new Uint8Array(MAX_INGESTION_BODY_BYTES + 1), new Uint8Array(1)]);
  assert.equal((await handler(streamRequest(big.stream))).status, 413);
  assert.equal(big.pulls(), 1);
  assert.equal(big.cancelled(), 1);
  const json = encoder.encode(JSON.stringify(content()));
  const exact = new Uint8Array(MAX_INGESTION_BODY_BYTES).fill(32);
  exact.set(json);
  const body = chunks([exact]);
  assert.equal((await handler(streamRequest(body.stream, { 'Content-Length': String(exact.length) }))).status, 201);
});

test('body errors and aborts fail closed, release the reader, and leave storage empty', async (t) => {
  const { handler, repo } = await setup(t);
  const failing = new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error(synthetic.alphaCredential)); } }, { highWaterMark: 0 });
  const failed = await handler(streamRequest(failing));
  assert.equal(failed.status, 400);
  assert.deepEqual(await failed.json(), { error: { code: 'invalid_request' } });
  assert.equal(failing.locked, false);
  const controller = new AbortController();
  let cancelCount = 0;
  const pending = new ReadableStream<Uint8Array>({ pull() { controller.abort(); }, cancel() { cancelCount++; } }, { highWaterMark: 0 });
  const aborted = await handler(streamRequest(pending, {}, controller.signal));
  assert.equal(aborted.status, 400);
  assert.equal(cancelCount, 1);
  assert.equal(pending.locked, false);
  assert.deepEqual(await repo.listObservations(alpha), []);
});

test('deep JSON and smuggled prototype/envelope fields reject before persistence', async (t) => {
  const { handler, repo } = await setup(t);
  for (const [text, status] of [['['.repeat(100) + '0' + ']'.repeat(100), 400], ['{"__proto__":{"tenantId":"tenant-alpha"}}', 400], ['null', 400], ['[]', 400]] as const) {
    const response = await handler(new Request(request(), { body: text }));
    assert.equal(response.status, status);
    assert.ok((await response.text()).length < 80);
  }
  assert.deepEqual(await repo.listObservations(alpha), []);
});

test('forged request objects cannot bypass authentication or escape bounded error responses', async (t) => {
  const { handler, repo } = await setup(t);
  for (const forged of [{ tenantId: 'tenant-alpha', principal: principal('alpha'), body: content() }, Object.create(Request.prototype), null]) {
    const response = await handler(forged as Request);
    assert.ok(response.status === 400 || response.status === 500);
    assert.ok((await response.text()).length < 80);
  }
  assert.deepEqual(await repo.listObservations(alpha), []);
});

test('the response projects only the three success fields, even if a trusted application returns extra properties', async (t) => {
  const { auth } = await setup(t);
  const application: IngestionApplication = { async ingest() {
    return { collectionId: 'synthetic-run', replayed: false, complete: false, credential: synthetic.alphaCredential, evidence: content() };
  } };
  const response = await createIngestionHandler(auth, application)(request());
  assert.deepEqual(await response.json(), { collectionId: 'synthetic-run', replayed: false, complete: false });
});
