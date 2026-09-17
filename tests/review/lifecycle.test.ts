import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import { ReviewRevisionConflictError } from '../../src/review/errors.js';
import {
  assertRelease08Recommendation, prepareNewRecommendation, reviseRecommendationContent,
  transitionRecommendationRevision,
} from '../../src/review/lifecycle.js';

const owner = {
  tenantId: 'tenant-alpha', siteId: 'site-alpha', siteScopeRevisionId: 'synthetic-scope-alpha-r1',
};

function recommendation(): Contract<'recommendation'> {
  return {
    schemaVersion: '1.0', kind: 'recommendation', id: 'synthetic-review-recommendation',
    scope: { ...owner },
    evidence: [{ scope: { ...owner }, kind: 'observation', id: 'synthetic-observation-zero' }],
    rationale: 'Synthetic human-authored recommendation rationale.',
    priority: { level: 'unassessed', basis: 'Synthetic operator deliberately left priority unassessed.' },
    authorityClass: 'internal_review', lifecycle: 'proposed', revision: 1,
    createdAt: '2026-01-01T02:00:00.000Z', updatedAt: '2026-01-01T02:00:00.000Z',
  };
}

test('Release 0.8 recommendation creation is revision 1, proposed, internal_review and unassessed', () => {
  const value = prepareNewRecommendation(recommendation());
  assert.equal(value.revision, 1);
  assert.equal(value.lifecycle, 'proposed');
  assert.equal(value.authorityClass, 'internal_review');
  assert.equal(value.priority.level, 'unassessed');
  assert.deepEqual(value.evidence.map((item) => item.kind), ['observation']);

  for (const invalid of [
    { ...value, revision: 2 },
    { ...value, lifecycle: 'accepted' as const },
    { ...value, authorityClass: 'separately_authorized_external_action' as const },
    { ...value, priority: { level: 'high' as const, basis: 'Synthetic human label.' } },
    { ...value, evidence: [{ ...value.evidence[0]!, kind: 'inference' as const }] },
  ]) assert.throws(() => prepareNewRecommendation(invalid));
});

test('caller-driven proposed -> in_review -> accepted transitions append immutable revisions', () => {
  const proposed = prepareNewRecommendation(recommendation());
  const inReview = transitionRecommendationRevision(proposed, 1, 'in_review', '2026-01-01T02:10:00.000Z');
  const accepted = transitionRecommendationRevision(inReview, 2, 'accepted', '2026-01-01T02:20:00.000Z');
  assert.deepEqual([proposed.revision, inReview.revision, accepted.revision], [1, 2, 3]);
  assert.deepEqual([proposed.lifecycle, inReview.lifecycle, accepted.lifecycle], ['proposed', 'in_review', 'accepted']);
  assert.deepEqual(inReview.evidence, proposed.evidence);
  assert.equal(inReview.rationale, proposed.rationale);
  assert.deepEqual(accepted.priority, proposed.priority);
  assert.equal(proposed.lifecycle, 'proposed');

  assert.throws(
    () => transitionRecommendationRevision(inReview, 1, 'accepted', '2026-01-01T02:20:00.000Z'),
    ReviewRevisionConflictError,
  );
  assert.throws(() => transitionRecommendationRevision(accepted, 3, 'rejected', '2026-01-01T02:30:00.000Z'));
  assert.equal(transitionRecommendationRevision(accepted, 3, 'superseded', '2026-01-01T02:30:00.000Z').lifecycle, 'superseded');
});

test('rejected and superseded are terminal and lifecycle transitions never manufacture action state', () => {
  const proposed = recommendation();
  const rejected = transitionRecommendationRevision(proposed, 1, 'rejected', '2026-01-01T02:10:00.000Z');
  const superseded = transitionRecommendationRevision(proposed, 1, 'superseded', '2026-01-01T02:10:00.000Z');
  for (const terminal of [rejected, superseded]) {
    for (const next of ['proposed', 'in_review', 'accepted', 'rejected', 'superseded'] as const) {
      assert.throws(() => transitionRecommendationRevision(terminal, 2, next, '2026-01-01T02:20:00.000Z'));
    }
    assert.equal('action' in terminal, false);
    assert.equal(terminal.priority.level, 'unassessed');
  }
});

test('material recommendation edits require an explicit content revision while preserving scope and lifecycle', () => {
  const current = transitionRecommendationRevision(recommendation(), 1, 'in_review', '2026-01-01T02:10:00.000Z');
  const candidate: Contract<'recommendation'> = {
    ...structuredClone(current),
    revision: 3,
    updatedAt: '2026-01-01T02:15:00.000Z',
    rationale: 'Synthetic human revised the recommendation rationale after review.',
  };
  const revised = reviseRecommendationContent(current, 2, candidate);
  assert.equal(revised.revision, 3);
  assert.equal(revised.lifecycle, 'in_review');
  assert.notEqual(revised.rationale, current.rationale);
  assert.deepEqual(revised.scope, current.scope);
  assert.throws(() => reviseRecommendationContent(current, 1, candidate), ReviewRevisionConflictError);
  assert.throws(() => reviseRecommendationContent(current, 2, { ...candidate, rationale: current.rationale }));
  assert.throws(() => reviseRecommendationContent(current, 2, { ...candidate, lifecycle: 'accepted' }));
  assert.throws(() => assertRelease08Recommendation({ ...candidate, revision: 101 }));
});
