export type IngestionErrorCode = 'invalid_request' | 'unauthenticated' | 'forbidden'
  | 'not_found' | 'method_not_allowed' | 'conflict' | 'body_too_large' | 'unsupported_media_type' | 'invalid_evidence';

/** Codes only: no credentials, evidence, validation dumps, or underlying causes. */
export class IngestionError extends Error {
  override name = 'IngestionError';
  constructor(readonly code: IngestionErrorCode) { super(code); }
}
