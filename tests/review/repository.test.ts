import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import type { TenantContext } from '../../src/persistence/tenant-context.js';
import { LocalReviewLedgerRepository } from '../../src/review/sqlite.js';
import { alpha, batch, beta, repository, temporaryDatabase } from '../persistence/helpers.js';

function recommendation(id: string, lifecycle: Contract<'recommendation'>['lifecycle'] = 'proposed'): Contract<'recommendation'> {
  const owner = batch('alpha').collection.scope;
  return {
    schemaVersion: '1.0', kind: 'recommendation', id, scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: 'synthetic-observation-zero' }],
    rationale: 'Synthetic repository history record.',
    priority: { level: 'unassessed', basis: 'Synthetic repository test does not rank work.' },
    authorityClass: 'internal_review', lifecycle, revision: 1,
    createdAt: '2026-01-01T02:00:00.000Z', updatedAt: '2026-01-01T02:00:00.000Z',
  };
}

test('review ledger is tenant/scope isolated, append-only and deterministically ordered without ranking', async (t) => {
  const database = temporaryDatabase(t);
  await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const owner = batch('alpha').collection.scope;
  const betaOwner = batch('beta').collection.scope;
  for (const id of ['synthetic-review-z', 'synthetic-review-a', 'synthetic-review-m']) {
    await review.createRecommendation(alpha, recommendation(id));
  }
  assert.deepEqual((await review.listCurrentRecommendations(alpha, { scope: owner })).map((item) => item.id),
    ['synthetic-review-a', 'synthetic-review-m', 'synthetic-review-z']);
  assert.deepEqual(await review.listCurrentRecommendations(beta, { scope: betaOwner }), []);
  assert.equal(await review.getCurrentRecommendation(beta, betaOwner, 'synthetic-review-a'), null);
  await assert.rejects(review.getCurrentRecommendation(beta, owner, 'synthetic-review-a'));

  const current = (await review.getCurrentRecommendation(alpha, owner, 'synthetic-review-a'))!;
  const next = { ...structuredClone(current), lifecycle: 'in_review' as const, revision: 2, updatedAt: '2026-01-01T02:10:00.000Z' };
  await review.appendRecommendationRevision(alpha, next, 1);
  assert.deepEqual((await review.listRecommendationHistory(alpha, owner, current.id)).map((item) => item.revision), [1, 2]);
  await assert.rejects(review.appendRecommendationRevision(alpha, { ...next, revision: 3 }, 1), /revision conflict/i);
  assert.equal((await review.getRecommendationRevision(alpha, owner, current.id, 1))?.lifecycle, 'proposed');
});

test('plain, cloned and proxied TenantContext-shaped values cannot authorize review reads or writes', async (t) => {
  const database = temporaryDatabase(t);
  await repository(t, database);
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  const owner = batch('alpha').collection.scope;
  const valid = recommendation('synthetic-review-authority');
  await review.createRecommendation(alpha, valid);
  const shapes: TenantContext[] = [
    { tenantId: 'tenant-alpha' } as unknown as TenantContext,
    structuredClone({ tenantId: 'tenant-alpha' }) as unknown as TenantContext,
    new Proxy({ tenantId: 'tenant-alpha' }, {}) as unknown as TenantContext,
  ];
  for (const forged of shapes) {
    await assert.rejects(review.getCurrentRecommendation(forged, owner, valid.id));
    await assert.rejects(review.listCurrentRecommendations(forged, { scope: owner }));
    await assert.rejects(review.createRecommendation(forged, { ...valid, id: `${valid.id}-forged` }));
  }
  assert.equal((await review.getCurrentRecommendation(alpha, owner, valid.id))?.id, valid.id);
});
