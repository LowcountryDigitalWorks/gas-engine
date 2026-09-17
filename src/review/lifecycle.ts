import type { Contract } from '../contracts/wire.js';
import { parseContract } from '../domain/validate.js';
import { canonicalJson } from '../lib/canonical-json.js';
import { ReviewRevisionConflictError } from './errors.js';
import type { RecommendationLifecycle } from './repository.js';

export const RELEASE08_RECOMMENDATION_REVISION_LIMIT = 100;

function invariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const transitions: Readonly<Record<RecommendationLifecycle, readonly RecommendationLifecycle[]>> = {
  proposed: ['in_review', 'rejected', 'superseded'],
  in_review: ['accepted', 'rejected', 'superseded'],
  accepted: ['superseded'],
  rejected: [],
  superseded: [],
};

/** Apply the Release 0.8 restrictions without changing canonical contract 1.0. */
export function assertRelease08Recommendation(input: unknown): Contract<'recommendation'> {
  const record = parseContract('recommendation', input);
  invariant(record.authorityClass === 'internal_review', 'Release 0.8 recommendations require internal_review authorityClass');
  invariant(record.priority.level === 'unassessed', 'Release 0.8 recommendations must keep priority unassessed');
  invariant(record.evidence.every((reference) => reference.kind === 'observation'),
    'Release 0.8 recommendation evidence is limited to canonical observations');
  invariant(record.revision <= RELEASE08_RECOMMENDATION_REVISION_LIMIT,
    `Release 0.8 recommendation history is bounded to ${RELEASE08_RECOMMENDATION_REVISION_LIMIT} revisions`);
  return record;
}

export function prepareNewRecommendation(input: unknown): Contract<'recommendation'> {
  const record = assertRelease08Recommendation(input);
  invariant(record.revision === 1, 'A new recommendation must begin at revision 1');
  invariant(record.lifecycle === 'proposed', 'A new recommendation must begin proposed');
  return record;
}

function requireExpectedRevision(current: Contract<'recommendation'>, expected: number): void {
  if (current.revision !== expected) throw new ReviewRevisionConflictError();
}

export function transitionRecommendationRevision(
  currentInput: unknown,
  expectedCurrentRevision: number,
  nextLifecycle: RecommendationLifecycle,
  updatedAt: string,
): Contract<'recommendation'> {
  const current = assertRelease08Recommendation(currentInput);
  requireExpectedRevision(current, expectedCurrentRevision);
  invariant(transitions[current.lifecycle].includes(nextLifecycle),
    `Release 0.8 does not allow ${current.lifecycle} -> ${nextLifecycle}`);
  invariant(current.revision < RELEASE08_RECOMMENDATION_REVISION_LIMIT, 'Recommendation revision limit reached');
  return assertRelease08Recommendation({
    ...structuredClone(current),
    lifecycle: nextLifecycle,
    revision: current.revision + 1,
    updatedAt,
  });
}

/**
 * Material human-authored content changes append a revision while preserving lifecycle.
 * Evidence resolution remains an application-service responsibility.
 */
export function reviseRecommendationContent(
  currentInput: unknown,
  expectedCurrentRevision: number,
  candidateInput: unknown,
): Contract<'recommendation'> {
  const current = assertRelease08Recommendation(currentInput);
  requireExpectedRevision(current, expectedCurrentRevision);
  invariant(current.revision < RELEASE08_RECOMMENDATION_REVISION_LIMIT, 'Recommendation revision limit reached');
  const candidate = assertRelease08Recommendation(candidateInput);
  invariant(candidate.id === current.id, 'A content revision cannot change recommendation id');
  invariant(canonicalJson(candidate.scope) === canonicalJson(current.scope), 'A content revision cannot change recommendation scope');
  invariant(candidate.lifecycle === current.lifecycle, 'A content revision cannot silently change lifecycle');
  invariant(candidate.createdAt === current.createdAt, 'A content revision must preserve createdAt');
  invariant(candidate.revision === current.revision + 1, 'A content revision must increment revision by one');
  invariant(candidate.updatedAt >= current.updatedAt, 'A content revision cannot move updatedAt backwards');
  const currentContent = canonicalJson({ evidence: current.evidence, rationale: current.rationale, priority: current.priority });
  const candidateContent = canonicalJson({ evidence: candidate.evidence, rationale: candidate.rationale, priority: candidate.priority });
  invariant(candidateContent !== currentContent, 'A content revision must change human-authored recommendation content');
  return candidate;
}
