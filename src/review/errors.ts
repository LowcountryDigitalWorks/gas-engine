export class ReviewRevisionConflictError extends Error {
  override name = 'ReviewRevisionConflictError';
  constructor(message = 'Recommendation revision conflict') { super(message); }
}
