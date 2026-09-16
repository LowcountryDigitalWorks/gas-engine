import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  diffEvidenceCollections,
  EvidenceDiffError,
  type DiffEvidenceCollectionsRequest,
} from '../../src/analysis/diff.js';
import type { Contract } from '../../src/contracts/wire.js';
import type { CollectionEvidenceSnapshot, EvidenceRepository } from '../../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import type { TenantContext } from '../../src/persistence/tenant-context.js';
import { alpha, beta, batch, partedBatches, repository, temporaryDatabase } from '../persistence/helpers.js';

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
  const legacyAssemblyReads = new Set(['getCollection', 'getCollectionProgress', 'listObservations']);
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
      if (legacyAssemblyReads.has(property)) {
        return (..._args: unknown[]) => {
          reads.push(property);
          throw new Error(`Release 0.7 service attempted legacy non-atomic snapshot assembly: ${property}`);
        };
      }
      const value = Reflect.get(actual, property, actual);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        if (property === 'getCollectionSnapshot') reads.push(property);
        return value.apply(actual, args);
      };
    },
  }) as EvidenceRepository;
  return { repository, reads, writes };
}

function expectCode(code: EvidenceDiffError['code']): (error: unknown) => boolean {
  return (error: unknown) => error instanceof EvidenceDiffError && error.code === code;
}

function syntheticSnapshot(suffix: string, count: number): CollectionEvidenceSnapshot {
  const value = batch('alpha', suffix);
  const observations: Contract<'observation'>[] = [];
  for (let index = 0; index < count; index++) {
    const observation = structuredClone(value.observations[0]!.record);
    observation.id = `synthetic-diff-bound-observation-${index}${suffix}`;
    observation.cohort.id = `synthetic-diff-bound-cohort-${index}`;
    observation.cohort.context.metric.id = `synthetic-diff-bound-metric-${index}`;
    observations.push(observation);
  }
  return {
    collection: value.collection,
    progress: { receivedCount: 1, persistedSources: 1, parts: 1, partsPersisted: 1, complete: true },
    observations,
  };
}

function snapshotOnlyRepository(
  baseline: CollectionEvidenceSnapshot,
  current: CollectionEvidenceSnapshot,
): EvidenceRepository {
  return {
    async getCollectionSnapshot(_context, id) {
      if (id === baseline.collection.id) return baseline;
      if (id === current.collection.id) return current;
      return null;
    },
  } as unknown as EvidenceRepository;
}

test('tenant-safe service uses only atomic collection snapshots while the general list remains capped at 100', async (t) => {
  const repo = await repository(t);
  const baseline = longitudinalParts('-diff-service-baseline');
  const current = longitudinalParts('-diff-service-current');
  await persistParts(repo, baseline);
  await persistParts(repo, current);

  await assert.rejects(repo.listObservations(alpha), /narrow the filters/);
  await assert.rejects(repo.listObservations(alpha, { collectionId: baseline[0]!.collection.id }), /narrow the filters/);

  const baselineSnapshot = await repo.getCollectionSnapshot(alpha, baseline[0]!.collection.id);
  assert.ok(baselineSnapshot);
  assert.deepEqual(baselineSnapshot.collection, baseline[0]!.collection);
  assert.equal(baselineSnapshot.progress.complete, true);
  assert.equal(baselineSnapshot.observations.length, 101);

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
  assert.deepEqual(probe.reads, ['getCollectionSnapshot', 'getCollectionSnapshot']);
  assert.deepEqual(probe.writes, []);
});

test('atomic snapshot retains coherent collection/progress/observations after a later file-backed delete', async (t) => {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const value = longitudinalParts('-diff-snapshot-coherent', 17);
  await persistParts(repo, value);

  const snapshot = await repo.getCollectionSnapshot(alpha, value[0]!.collection.id);
  assert.ok(snapshot);
  assert.equal(snapshot.progress.complete, true);
  assert.equal(snapshot.observations.length, 17);
  assert.deepEqual(snapshot.collection, value[0]!.collection);

  const writer = database.track(new LocalEvidenceRepository(database.path));
  assert.equal(await writer.deleteCollection(alpha, value[0]!.collection.id), true);
  assert.equal(await repo.getCollectionSnapshot(alpha, value[0]!.collection.id), null);

  // The already-returned application-local snapshot is one coherent pre-delete view;
  // no field is lazily re-read from the repository after the transaction closes.
  assert.equal(snapshot.progress.complete, true);
  assert.equal(snapshot.observations.length, 17);
  assert.deepEqual(snapshot.collection, value[0]!.collection);
});

test('deletion at the former progress-to-list seam cannot create false absence classifications', async (t) => {
  const database = temporaryDatabase(t);
  const repo = await repository(t, database);
  const baseline = longitudinalParts('-diff-race-baseline', 5);
  const current = longitudinalParts('-diff-race-current', 5);
  await persistParts(repo, baseline);
  await persistParts(repo, current);
  const writer = database.track(new LocalEvidenceRepository(database.path));

  let snapshots = 0;
  const adversarial = new Proxy(repo, {
    get(actual, property) {
      if (property === 'getCollection' || property === 'getCollectionProgress' || property === 'listObservations') {
        return () => { throw new Error('Legacy progress-to-list seam must not be used'); };
      }
      if (property === 'getCollectionSnapshot') {
        return async (context: TenantContext, id: string) => {
          const snapshot = await actual.getCollectionSnapshot(context, id);
          snapshots++;
          if (snapshots === 1 && snapshot !== null) await writer.deleteCollection(context, id);
          return snapshot;
        };
      }
      const value = Reflect.get(actual, property, actual);
      return typeof value === 'function' ? value.bind(actual) : value;
    },
  }) as EvidenceRepository;

  const report = await diffEvidenceCollections(adversarial, alpha, {
    baselineCollectionId: baseline[0]!.collection.id,
    currentCollectionId: current[0]!.collection.id,
  });
  assert.deepEqual(report.summary, {
    total: 5,
    unchanged: 5,
    changed: 0,
    appeared: 0,
    missingFromCurrent: 0,
    coverageUnknown: 0,
    attentionCount: 0,
  });
  assert.equal(snapshots, 2);
});

test('service rejects incompletely persisted multipart snapshots before absence can be interpreted', async (t) => {
  const repo = await repository(t);
  const baselineParts = partedBatches(2, 1, '-diff-service-incomplete-baseline');
  const current = batch('alpha', '-diff-service-incomplete-current');
  await repo.persistCollection(alpha, baselineParts[0]!);
  await repo.persistCollection(alpha, current);
  assert.equal((await repo.getCollectionSnapshot(alpha, baselineParts[0]!.collection.id))?.progress.complete, false);

  await assert.rejects(
    diffEvidenceCollections(repo, alpha, {
      baselineCollectionId: baselineParts[0]!.collection.id,
      currentCollectionId: current.collection.id,
    }),
    expectCode('invalid_snapshot'),
  );
});

test('missing atomic snapshots fail explicitly under trusted context', async (t) => {
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

test('exactly 2,048 resolved observations are accepted and 2,049 fail explicitly without truncation', async () => {
  const baseline = syntheticSnapshot('-diff-bound-baseline', 2_048);
  const current = syntheticSnapshot('-diff-bound-current', 2_048);
  const report = await diffEvidenceCollections(snapshotOnlyRepository(baseline, current), alpha, {
    baselineCollectionId: baseline.collection.id,
    currentCollectionId: current.collection.id,
  });
  assert.equal(report.summary.total, 2_048);
  assert.equal(report.summary.unchanged, 2_048);

  const oversized = syntheticSnapshot('-diff-bound-oversized', 2_049);
  await assert.rejects(
    diffEvidenceCollections(snapshotOnlyRepository(oversized, current), alpha, {
      baselineCollectionId: oversized.collection.id,
      currentCollectionId: current.collection.id,
    }),
    expectCode('observation_limit_exceeded'),
  );
  assert.equal(oversized.observations.length, 2_049);
});

test('Beta and forged contexts cannot atomically snapshot or compare Alpha collections', async (t) => {
  const repo = await repository(t);
  const baseline = batch('alpha', '-diff-service-alpha-baseline');
  const current = batch('alpha', '-diff-service-alpha-current');
  await repo.persistCollection(alpha, baseline);
  await repo.persistCollection(alpha, current);

  assert.equal(await repo.getCollectionSnapshot(beta, baseline.collection.id), null);
  await assert.rejects(
    repo.getCollectionSnapshot({ tenantId: 'tenant-alpha' } as unknown as TenantContext, baseline.collection.id),
  );
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

test('Release 0.7 snapshot implementation is one deferred read and production analysis has no forbidden runtime path', () => {
  const source = readFileSync('src/analysis/diff.ts', 'utf8');
  const sqlite = readFileSync('src/persistence/sqlite.ts', 'utf8');
  assert.match(sqlite, /async getCollectionSnapshot[\s\S]*?return this\.#read\(\(\) => \{[\s\S]*?collectionRow[\s\S]*?#progress[\s\S]*?observationRows/);
  assert.match(sqlite, /COLLECTION_SNAPSHOT_OBSERVATION_LIMIT \+ 1/);
  assert.match(sqlite, /GENERAL_OBSERVATION_LIST_LIMIT \+ 1/);
  assert.doesNotMatch(source, /from ['"](?:node:http|node:https|undici|axios|activepieces)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /issueTenantContext|tenant-authority/i);
  assert.doesNotMatch(source, /from ['"].*(?:adapters\/wqt|adapters\/zerorank)/i);
  assert.doesNotMatch(source, /\b(?:OpenAI|Anthropic|BYOK)\b/i);
  assert.doesNotMatch(source, /create(?:Inference|Recommendation|Action)|persist(?:Inference|Recommendation|Action)/i);
  assert.doesNotMatch(source, /priority|prioritization|severity|businessImpact|Release 0\.8/i);
});
