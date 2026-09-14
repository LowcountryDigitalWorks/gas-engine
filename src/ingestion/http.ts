import { authenticatedAuthority, type IngestionAuthenticator } from '../authentication/principal.js';
import { identifier } from '../contracts/primitives.js';
import { IngestionError, type IngestionErrorCode } from './errors.js';
import type { IngestionApplication } from './service.js';

export const MAX_INGESTION_BODY_BYTES = 48 * 1024;
export const MAX_AUTHORIZATION_HEADER_LENGTH = 1024;
const statuses: Record<IngestionErrorCode, number> = {
  invalid_request: 400, unauthenticated: 401, forbidden: 403, not_found: 404,
  method_not_allowed: 405, conflict: 409, body_too_large: 413, unsupported_media_type: 415, invalid_evidence: 422,
};
function response(status: number, body: unknown): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (status === 401) headers['WWW-Authenticate'] = 'Bearer';
  if (status === 405) headers['Allow'] = 'POST';
  return new Response(JSON.stringify(body), { status, headers });
}

async function readJson(request: Request): Promise<unknown> {
  const length = request.headers.get('Content-Length');
  if (length !== null) {
    if (!/^[0-9]{1,10}$/.test(length)) throw new IngestionError('invalid_request');
    if (Number(length) > MAX_INGESTION_BODY_BYTES) throw new IngestionError('body_too_large');
  }
  if (!request.body || request.bodyUsed || request.signal.aborted) throw new IngestionError('invalid_request');
  const reader = request.body.getReader();
  const bytes = new Uint8Array(MAX_INGESTION_BODY_BYTES);
  let size = 0;
  let complete = false;
  const cancel = (): void => { void reader.cancel().catch(() => {}); };
  request.signal.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (request.signal.aborted) throw new IngestionError('invalid_request');
      if (done) { complete = true; break; }
      if (!(value instanceof Uint8Array)) throw new IngestionError('invalid_request');
      if (value.byteLength > MAX_INGESTION_BODY_BYTES - size) throw new IngestionError('body_too_large');
      bytes.set(value, size);
      size += value.byteLength;
    }
    if (length !== null && Number(length) !== size) throw new IngestionError('invalid_request');
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, size))) as unknown;
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    throw new IngestionError('invalid_request');
  } finally {
    request.signal.removeEventListener('abort', cancel);
    if (!complete) cancel();
    reader.releaseLock();
  }
}

/** In-process fetch-style adapter only: no listener, networking, or credential store. */
export function createIngestionHandler(authenticator: IngestionAuthenticator, application: IngestionApplication): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      if (!(request instanceof Request)) throw new IngestionError('invalid_request');
      if (new URL(request.url).pathname !== '/v1/evidence/collections') throw new IngestionError('not_found');
      if (request.method !== 'POST') throw new IngestionError('method_not_allowed');
      const header = request.headers.get('Authorization');
      if (!header || header.length > MAX_AUTHORIZATION_HEADER_LENGTH) throw new IngestionError('unauthenticated');
      const match = /^Bearer +([A-Za-z0-9._~+\/-]+=*)$/i.exec(header);
      if (!match) throw new IngestionError('unauthenticated');
      let principal;
      try { principal = await authenticator.authenticate(match[1]!); }
      catch { throw new Error('Authentication boundary failed'); }
      if (principal === null) throw new IngestionError('unauthenticated');
      if (!authenticatedAuthority(principal)) throw new Error('Invalid authenticator result');
      const mediaType = request.headers.get('Content-Type');
      if (!mediaType || mediaType.length > 128 || !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/i.test(mediaType)) throw new IngestionError('unsupported_media_type');
      const encoding = request.headers.get('Content-Encoding');
      if (encoding !== null && encoding.toLowerCase() !== 'identity') throw new IngestionError('unsupported_media_type');
      const key = identifier.safeParse(request.headers.get('Idempotency-Key'));
      if (!key.success) throw new IngestionError('invalid_request');
      const content = await readJson(request);
      const result = await application.ingest(principal, key.data, content);
      if (typeof result.replayed !== 'boolean' || typeof result.complete !== 'boolean') throw new Error('Invalid application result');
      return response(result.replayed ? 200 : 201, {
        collectionId: identifier.parse(result.collectionId), replayed: result.replayed === true, complete: result.complete === true,
      });
    } catch (error) {
      if (error instanceof IngestionError) return response(statuses[error.code], { error: { code: error.code } });
      return response(500, { error: { code: 'internal_error' } });
    } finally {
      try {
        if (request instanceof Request && request.body && !request.body.locked && !request.bodyUsed) {
          void request.body.cancel().catch(() => {});
        }
      } catch { /* Invalid transport objects cannot override the bounded response. */ }
    }
  };
}
