export class PersistenceConflictError extends Error {
  override name = 'PersistenceConflictError';
}

export class IdempotencyConflictError extends PersistenceConflictError {
  override name = 'IdempotencyConflictError';
  constructor() { super('Idempotency conflict: request differs'); }
}

export class PartSequenceConflictError extends PersistenceConflictError {
  override name = 'PartSequenceConflictError';
  constructor(message = 'Collection parts must be persisted in order without gaps') { super(message); }
}
