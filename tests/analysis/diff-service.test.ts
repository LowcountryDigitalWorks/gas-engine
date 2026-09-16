import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  diffEvidenceCollections,
  EvidenceDiffError,
  type DiffEvidenceCollectionsRequest,
} from '../../src/analysis/diff.js';
import type { EvidenceRepository } from '../../src/persistence/repository.js';
import type { TenantContext } from '../../src/persistence/tenant-context.js';
import { alpha, beta, batch, partedBatches, repository } from '../persistence/helpers.js';

async function persistParts(repo: EvidenceRepository, parts: ReturnType<typeof partedBatches>): Promise<void> {
  for (const part of parts) await repo.persistCollection(alpha, part);
}

function longitudinalParts(suffix: string, count = 101): ReturnType<typeof partedBatches> {
  const parts = partedBatches(count, 16, suffix);
  let index = 0;
  for (const part of parts) {
    for (const observation of part.observations) {
      observation.record.cohort.id = `synthetic-diff-service-cohort-${index}`;
      observation.record.cohort.context.metric.id = `synthetic-diff-service-metric-${index}`;
      index++;
    }
  }
  return parts;
}

function readOnlyProbe(target: EvidenceRepository): { repository: EvidenceRepository; reads: string[]; writes: string[] } {
  const reads: string[] = [];
  const writes: string[] = [];
  const writeMethods = new Set([
    'createTenant', 'createSite', 'setSiteLabel', 'createScope', 'createConnection',
    'persistCollection', 'deleteCollection', 'close',
  ]);
  const repository = new Proxy(target, {
    get(actual, property) {
      if (typeof property !== 'string') return Reflect.get(actual, property, actual);
      if (writeMethods.has(property)) {
        return (..._args: unknown[]) => {
          writes.push(property);
          throw new Error(`Release 0.7 service attempted repository write: ${property}`);
        };
      }
      const value = Reflect.get(actual, property, actual);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (property === 'getCollection' || property === 'getCollectionProgress' || property === 'listObservations') reads.push(property);
        return value.apply(actual, args);
      };
    },
  }) as EvidenceRepository;
  return { repository, reads, writes };
}

function expectCode(code: EvidenceDiffError['code']): (error: unknown) => boolean {
  return (error: unknown) => error instanceof EvidenceDiffError && error.code === code;
}

test('tenant-safe service resolves collection-filtered snapshots above the generic 100-observation list bound using reads only', async (t) => {
  const repo = await repository(t);
  const baseline = longitudinalParts('-diff-service-baseline');
  const current = longitudinalParts('-diff-service-current');
  await persistParts(repo, baseline);
  await persistParts(repo, current);

  await assert.rejects(repo.listObservations(alpha), /narrow the filters/);
  assert.equal((await repo.listObservations(alpha, { collectionId: baseline[0]!.collection.id })).length, 101);

  const probe = readOnlyProbe(repo);
  const report = await diffEvidenceCollections(probe.repository, alpha, {
    baselineCollectionId: baseline[0]!.collection.id,
    currentCollectionId: current[0]!.collection.id,
  });

  assert.deepEqual(report.summary, {
    total: 101,
    unchanged: 101,
    changed: 0,
    appeared: 0,
    missingFromCurrent: 0,
    coverageUnknown: 0,
    attentionCount: 0,
  });
  assert.deepEqual(probe.reads, [
    'getCollection', 'getCollection',
    'getCollectionProgress', 'getCollectionProgress',
    'listObservations', 'listObservations',
  ]);
  assert.deepEqual(probe.writes, []);
});

test('service rejects incompletely persisted multipart snapshots before absence can be interpreted', async (t) => {
  const repo = await repository(t);
  const baselineParts = partedBatches(2, 1, '-diff-service-incomplete-baseline');
  const current = batch('alpha', '-diff-service-incomplete-current');
  await repo.persistCollection(alpha, baselineParts[0]!);
  await repo.persistCollection(alpha, current);
  assert.equal((await repo.getCollectionProgress(alpha, baselineParts[0]!.collection.id))?.complete, false);

  await assert.rejects(
    diffEvidenceCollections(repo, alpha, {
      baselineCollectionId: baselineParts[0]!.collection.id,
      currentCollectionId: current.collection.id,
    }),
    expectCode('invalid_snapshot'),
  );
});

test('missing baseline and current collections fail explicitly under trusted context', async (t) => {
  const repo = await repository(t);
  const existing = batch('alpha', '-diff-service-existing');
  await repo.persistCollection(alpha, existing);

  await assert.rejects(
    diffEvidenceCollections(repo, alpha, {
      baselineCollectionId: 'synthetic-missing-baseline',
      currentCollectionId: existing.collection.id,
    }),
    expectCode('collection_not_found'),
  );
  await assert.rejects(
    diffEvidenceCollections(repo, alpha, {
      baselineCollectionId: existing.collection.id,
      currentCollectionId: 'synthetic-missing-current',
    }),
    expectCode('collection_not_found'),
  );
});

test('Beta trusted context cannot resolve or compare Alpha collections', async (t) => {
  const repo = await repository(t);
  const baseline = batch('alpha', '-diff-service-alpha-baseline');
  const current = batch('alpha', '-diff-service-alpha-current');
  await repo.persistCollection(alpha, baseline);
  await repo.persistCollection(alpha, current);

  await assert.rejects(
    diffEvidenceCollections(repo, beta, {
      baselineCollectionId: baseline.collection.id,
      currentCollectionId: current.collection.id,
    }),
    expectCode('collection_not_found'),
  );
});

test('caller collection IDs and request fields cannot create tenant authority', async (t) => {
  const repo = await repository(t);
  const baseline = batch('alpha', '-diff-service-authority-baseline');
  const current = batch('alpha', '-diff-service-authority-current');
  await repo.persistCollection(alpha, baseline);
  await repo.persistCollection(alpha, current);

  const forgedRequest = {
    baselineCollectionId: baseline.collection.id,
    currentCollectionId: current.collection.id,
    tenantId: 'tenant-alpha',
    siteId: 'site-alpha',
    providerConnectionId: baseline.collection.providerConnectionId,
  } as unknown as DiffEvidenceCollectionsRequest;
  await assert.rejects(diffEvidenceCollections(repo, beta, forgedRequest), expectCode('invalid_request'));

  await assert.rejects(
    diffEvidenceCollections(repo, { tenantId: 'tenant-alpha' } as unknown as TenantContext, {
      baselineCollectionId: baseline.collection.id,
      currentCollectionId: current.collection.id,
    }),
  );
});

test('service rejects same collection selector before repository access', async (t) => {
  const repo = await repository(t);
  const probe = readOnlyProbe(repo);
  await assert.rejects(
    diffEvidenceCollections(probe.repository, alpha, {
      baselineCollectionId: 'synthetic-same-collection',
      currentCollectionId: 'synthetic-same-collection',
    }),
    expectCode('invalid_request'),
  );
  assert.deepEqual(probe.reads, []);
  assert.deepEqual(probe.writes, []);
});

test('Release 0.7 production source has no issuer, network/provider runtime, AI, inference/recommendation/action, or Release 0.8 path', () => {
  const source = readFileSync('src/analysis/diff.ts', 'utf8');
  assert.doesNotMatch(source, /from ['"](?:node:http|node:https|undici|axios|activepieces)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /issueTenantContext|tenant-authority/i);
  assert.doesNotMatch(source, /from ['"].*(?:adapters\/wqt|adapters\/zerorank)/i);
  assert.doesNotMatch(source, /\b(?:OpenAI|Anthropic|BYOK)\b/i);
  assert.doesNotMatch(source, /create(?:Inference|Recommendation|Action)|persist(?:Inference|Recommendation|Action)/i);
  assert.doesNotMatch(source, /priority|prioritization|severity|businessImpact|Release 0\.8/i);
});
