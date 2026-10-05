import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { test, type TestContext } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import {
  computeManagedServiceRunId,
  serializeManagedServiceRunJson,
  type ManagedServiceRun,
} from '../../src/operator/service-run.js';
import { parseManagedServiceRun } from '../../src/operator/service-run-import.js';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../../src/review/sqlite.js';
import {
  PORTABLE_RUNTIME_LIMITS,
  PORTABLE_RUNTIME_MANIFEST_PATH,
  computePortableRuntimeBundleId,
  copyPortableRuntimeBundle,
  createPortableRuntimeBundle,
  parsePortableRuntimeManifest,
  parsePortableRuntimeProfile,
  planPortableRuntimeRetention,
  requireExplicitRollbackBundle,
  validatePortableLogicalPath,
  verifyPortableRuntimeBundle,
  type PortableRuntimeBundleResult,
  type PortableRuntimeProfile,
} from '../../src/runtime/portable-runtime.js';
import { alpha, batch, beta, repository, temporaryDatabase } from '../persistence/helpers.js';
import { createTestTenantContext } from '../support/tenant-authority.js';

const acceptedRunIdPattern = /^managed-service-run:[a-f0-9]{64}$/;

function profile(): PortableRuntimeProfile {
  return {
    version: '0.20.0',
    packageCompatibility: {
      name: '@lowcountrydigitalworks/gas-engine',
      version: '0.20.0',
    },
    database: {
      role: 'gas_sqlite',
      path: 'state/gas.sqlite',
      classification: 'private_runtime',
      retentionClass: 'state-protected',
    },
    generatedArtifactRoot: 'artifacts',
    allowedArtifactRoles: ['service_run'],
    allowedClassifications: ['ldw_internal'],
    retention: {
      id: 'release-020-retention',
      version: '1.0.0',
      classes: [
        { id: 'state-protected', classification: 'private_runtime', protected: true },
        { id: 'internal-90d', classification: 'ldw_internal', protected: false, maxAgeDays: 90 },
      ],
    },
    buildIdentity: 'release-020-synthetic-build',
  };
}

function syntheticRun(): ManagedServiceRun {
  const body: Omit<ManagedServiceRun, 'id'> = {
    version: '0.18.0',
    generatedAt: '2026-10-02T12:35:00.000Z',
    policy: {
      id: 'release-020-portability-run-policy',
      version: '1.0.0',
      maxReceipts: 16,
      maxPriorAttentionIds: 128,
    },
    scope: structuredClone(batch('alpha').collection.scope),
    trustedTarget: 'https://example.test',
    runPeriod: {
      start: '2026-10-02T00:00:00.000Z',
      end: '2026-10-02T12:05:00.000Z',
    },
    evaluatedAt: '2026-10-02T12:05:00.000Z',
    workspaceId: 'workspace:' + 'a'.repeat(64),
    serviceBriefId: 'service-brief:release-020-synthetic',
    receipts: [
      {
        id: 'manual-context',
        sourceFamily: 'manual_context',
        state: 'not_supplied',
        limitations: ['Synthetic portability proof intentionally supplies no external manual context.'],
      },
    ],
    readiness: [],
    sourceManifest: [],
    attentionIds: [],
    followUp: {
      decisionCyclePresent: false,
      reasons: ['No decision cycle is supplied in this synthetic portability artifact.'],
    },
    customerReport: { state: 'not_requested' },
    provenance: {
      workspaceId: 'workspace:' + 'a'.repeat(64),
      serviceBriefId: 'service-brief:release-020-synthetic',
      receiptIds: ['manual-context'],
    },
    limitations: ['Synthetic public-safe Release 0.18 run used only to prove Release 0.20 portability.'],
  };
  const run: ManagedServiceRun = { ...body, id: computeManagedServiceRunId(body) };
  return parseManagedServiceRun(run);
}

function recommendation(): Contract<'recommendation'> {
  const owner = batch('alpha').collection.scope;
  return {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id: 'release-020-synthetic-review',
    scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: 'synthetic-observation-zero' }],
    rationale: 'Synthetic review-ledger state for the portability backup proof.',
    priority: { level: 'unassessed', basis: 'Synthetic portability proof does not rank work.' },
    authorityClass: 'internal_review',
    lifecycle: 'proposed',
    revision: 1,
    createdAt: '2026-10-01T02:00:00.000Z',
    updatedAt: '2026-10-01T02:00:00.000Z',
  };
}

interface Fixture {
  rootA: string;
  rootB: string;
  run: ManagedServiceRun;
  runJson: string;
  bundle: PortableRuntimeBundleResult;
}

async function fixture(t: TestContext): Promise<Fixture> {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  await evidence.persistCollection(alpha, batch('alpha'));
  await evidence.persistCollection(beta, batch('beta'));
  const review = database.track(new LocalReviewLedgerRepository(database.path));
  await review.createRecommendation(alpha, recommendation());
  review.close();
  evidence.close();

  mkdirSync(resolve('local-artifacts'), { recursive: true });
  const parent = mkdtempSync(resolve('local-artifacts/release-020-runtime-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));
  const rootA = join(parent, 'root-a');
  const rootB = join(parent, 'root-b');
  const run = syntheticRun();
  const runJson = serializeManagedServiceRunJson(run);
  const runBytes = Buffer.from(runJson, 'utf8');
  const bundle = await createPortableRuntimeBundle({
    root: rootA,
    sourceDatabasePath: database.path,
    profile: profile(),
    artifacts: [
      {
        role: 'service_run',
        path: 'artifacts/release-0.18/service-run.json',
        classification: 'ldw_internal',
        content: runJson,
        expectedSha256: createHash('sha256').update(runBytes).digest('hex'),
        expectedByteCount: runBytes.byteLength,
        retentionClass: 'internal-90d',
        retentionTimestamp: '2026-10-02T12:35:00.000Z',
        semanticIdentity: run.id,
      },
    ],
  });
  return { rootA, rootB, run, runJson, bundle };
}

function serviceRunPath(value: Fixture): string {
  return join(value.rootA, 'artifacts/release-0.18/service-run.json');
}

function restoreServiceRun(value: Fixture): void {
  writeFileSync(serviceRunPath(value), value.runJson, { encoding: 'utf8', flag: 'w' });
}

test('strict non-secret profile accepts only canonical portable configuration', () => {
  const valid = profile();
  assert.deepEqual(parsePortableRuntimeProfile(valid), valid);
  assert.throws(() => parsePortableRuntimeProfile({ ...valid, apiToken: 'secret' }), /invalid|unsupported/i);
  assert.throws(() => parsePortableRuntimeProfile({ ...valid, password: 'secret' }), /invalid|unsupported/i);
  assert.throws(() => parsePortableRuntimeProfile({ ...valid, tenantContext: { tenantId: 'tenant-alpha' } }), /invalid|unsupported/i);
  assert.throws(() => parsePortableRuntimeProfile({ ...valid, packageCompatibility: { ...valid.packageCompatibility, version: '0.19.0' } }), /invalid|unsupported/i);
});

test('logical paths reject absolute, traversal, drive, backslash, empty and oversized forms', () => {
  assert.equal(validatePortableLogicalPath('artifacts/release-0.18/service-run.json'), 'artifacts/release-0.18/service-run.json');
  for (const invalid of ['/etc/passwd', '../escape', 'a/../b', 'C:/escape', 'C:\\escape', 'a\\b', 'a//b', './a']) {
    assert.throws(() => validatePortableLogicalPath(invalid), /path/i);
  }
  assert.throws(() => validatePortableLogicalPath('a'.repeat(PORTABLE_RUNTIME_LIMITS.logicalPathBytes + 1)), /bound/i);
});

test('online SQLite backup survives strict reopen, relocation, and newly issued authority', async (t) => {
  const value = await fixture(t);
  const rootAVerified = verifyPortableRuntimeBundle(value.rootA);
  assert.equal(rootAVerified.manifest.id, value.bundle.manifest.id);
  assert.ok(rootAVerified.databaseBytes > 0);
  const rootBVerified = copyPortableRuntimeBundle(value.rootA, value.rootB);
  assert.equal(rootBVerified.manifest.id, value.bundle.manifest.id);
  assert.notEqual(rootBVerified.root, rootAVerified.root);

  const restoredEvidence = new LocalEvidenceRepository(join(value.rootB, 'state/gas.sqlite'));
  const restoredReview = new LocalReviewLedgerRepository(join(value.rootB, 'state/gas.sqlite'));
  try {
    const restoredAlpha = createTestTenantContext('tenant-alpha');
    const restoredBeta = createTestTenantContext('tenant-beta');
    assert.equal((await restoredEvidence.getTenant(restoredAlpha))?.id, 'tenant-alpha');
    assert.equal((await restoredEvidence.getTenant(restoredBeta))?.id, 'tenant-beta');
    assert.equal((await restoredEvidence.getCollection(restoredAlpha, batch('alpha').collection.id))?.id, batch('alpha').collection.id);
    assert.equal((await restoredEvidence.getCollection(restoredBeta, batch('beta').collection.id))?.id, batch('beta').collection.id);
    assert.equal((await restoredReview.getCurrentRecommendation(restoredAlpha, batch('alpha').collection.scope, recommendation().id))?.id, recommendation().id);
    assert.equal(JSON.stringify(rootBVerified.profile).includes('tenant-alpha'), false);
    assert.equal(rootBVerified.manifestJson.includes('tenant-beta'), false);
  } finally {
    restoredReview.close();
    restoredEvidence.close();
  }
});

test('accepted Release 0.18 run artifact remains strict and keeps exact semantic identity', async (t) => {
  const value = await fixture(t);
  assert.match(value.run.id, acceptedRunIdPattern);
  const parsed = parseManagedServiceRun(JSON.parse(readFileSync(serviceRunPath(value), 'utf8')));
  assert.equal(parsed.id, value.run.id);
  const entry = value.bundle.manifest.entries.find((item) => item.role === 'service_run');
  assert.equal(entry?.semanticIdentity, value.run.id);
});

test('manifest rejects duplicate paths, unsupported version, incompatible package and stale identity', async (t) => {
  const value = await fixture(t);
  const manifest = value.bundle.manifest;
  assert.throws(() => parsePortableRuntimeManifest({ ...manifest, version: '9.0.0' }), /invalid|unsupported/i);
  assert.throws(() => parsePortableRuntimeManifest({ ...manifest, packageCompatibility: { ...manifest.packageCompatibility, version: '0.19.0' } }), /invalid|unsupported/i);
  assert.throws(() => parsePortableRuntimeManifest({ ...manifest, entries: [...manifest.entries, structuredClone(manifest.entries[0]!)] }), /unique|identity/i);
  assert.throws(() => parsePortableRuntimeManifest({ ...manifest, id: 'portable-runtime-bundle:' + '0'.repeat(64) }), /identity/i);
});

test('hash mismatch, byte mismatch and missing required files fail closed', async (t) => {
  const value = await fixture(t);
  const path = serviceRunPath(value);
  const original = readFileSync(path, 'utf8');
  const sameLength = (original.startsWith('{') ? '[' : '{') + original.slice(1);
  writeFileSync(path, sameLength, 'utf8');
  assert.throws(() => verifyPortableRuntimeBundle(value.rootA), /SHA-256 mismatch/i);
  restoreServiceRun(value);
  writeFileSync(path, original + ' ', 'utf8');
  assert.throws(() => verifyPortableRuntimeBundle(value.rootA), /byte-count mismatch/i);
  restoreServiceRun(value);
  unlinkSync(path);
  assert.throws(() => verifyPortableRuntimeBundle(value.rootA), /required.*missing/i);
  restoreServiceRun(value);
});

test('manifest-owned symlinks and unowned files fail closed rather than auto-including content', async (t) => {
  const value = await fixture(t);
  const linkDirectory = join(value.rootA, 'artifacts/release-0.18');
  const outside = value.rootA + '-outside';
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, 'service-run.json'), value.runJson, 'utf8');
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  rmSync(linkDirectory, { recursive: true, force: true });
  symlinkSync(outside, linkDirectory, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => verifyPortableRuntimeBundle(value.rootA), /symlink/i);
  rmSync(linkDirectory, { recursive: true, force: true });
  mkdirSync(linkDirectory, { recursive: true });
  restoreServiceRun(value);
  writeFileSync(join(value.rootA, 'raw-provider-payload.json'), '{"raw":true}\n', 'utf8');
  assert.throws(() => verifyPortableRuntimeBundle(value.rootA), /unowned file/i);
});

test('root-only relocation preserves bundle identity while changed artifact bytes change identity', async (t) => {
  const value = await fixture(t);
  const relocated = copyPortableRuntimeBundle(value.rootA, value.rootB);
  assert.equal(relocated.manifest.id, value.bundle.manifest.id);

  const changedRoot = join(resolve(value.rootA, '..'), 'root-changed');
  const changed = await createPortableRuntimeBundle({
    root: changedRoot,
    sourceDatabasePath: join(value.rootA, 'state/gas.sqlite'),
    profile: profile(),
    artifacts: [
      {
        role: 'service_run',
        path: 'artifacts/release-0.18/service-run.json',
        classification: 'ldw_internal',
        content: value.runJson + ' ',
        retentionClass: 'internal-90d',
        retentionTimestamp: '2026-10-02T12:35:00.000Z',
        semanticIdentity: value.run.id,
      },
    ],
  });
  assert.notEqual(changed.manifest.id, value.bundle.manifest.id);
});

test('bundle identity is semantic and independent of manifest pretty-print formatting', async (t) => {
  const value = await fixture(t);
  const manifest = value.bundle.manifest;
  const { id: _id, ...material } = manifest;
  assert.equal(computePortableRuntimeBundleId(material), manifest.id);
  const pretty = JSON.stringify(manifest, null, 2);
  const reparsed = parsePortableRuntimeManifest(JSON.parse(pretty));
  assert.equal(reparsed.id, manifest.id);
});

test('retention planning is deterministic, uses explicit semantic time, and performs no deletion', async (t) => {
  const value = await fixture(t);
  const first = planPortableRuntimeRetention(value.bundle.profile, value.bundle.manifest, '2026-10-05T00:00:00.000Z');
  const second = planPortableRuntimeRetention(value.bundle.profile, value.bundle.manifest, '2026-10-05T00:00:00.000Z');
  assert.deepEqual(first, second);
  assert.equal(first.entries.find((entry) => entry.path === 'state/gas.sqlite')?.state, 'protected');
  assert.equal(first.entries.find((entry) => entry.path.endsWith('service-run.json'))?.state, 'retain');
  assert.ok(existsSync(serviceRunPath(value)));
  assert.throws(() => planPortableRuntimeRetention(value.bundle.profile, value.bundle.manifest, '2026-01-01T00:00:00.000Z'), /future/i);
  assert.ok(existsSync(serviceRunPath(value)));
});

test('rollback requires an explicit accepted bundle and never infers latest', async (t) => {
  const value = await fixture(t);
  assert.throws(() => requireExplicitRollbackBundle([value.bundle.manifest.id], undefined), /explicit|latest/i);
  assert.throws(() => requireExplicitRollbackBundle([value.bundle.manifest.id], 'portable-runtime-bundle:' + '0'.repeat(64)), /accepted set/i);
  assert.equal(requireExplicitRollbackBundle([value.bundle.manifest.id], value.bundle.manifest.id), value.bundle.manifest.id);
  assert.equal(value.bundle.manifest.recovery.rollbackSelection, 'explicit_operator_bundle');
  assert.equal(value.bundle.manifest.recovery.credentials, 'external_not_in_bundle');
});

test('explicit artifact admission rejects duplicate paths, unknown roles and oversize payloads before acceptance', async (t) => {
  const database = temporaryDatabase(t);
  const evidence = await repository(t, database);
  evidence.close();
  mkdirSync(resolve('local-artifacts'), { recursive: true });
  const parent = mkdtempSync(resolve('local-artifacts/release-020-bounds-test-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const duplicate = {
    role: 'service_run' as const,
    path: 'artifacts/duplicate.json',
    classification: 'ldw_internal' as const,
    content: '{}\n',
    retentionClass: 'internal-90d',
  };
  await assert.rejects(createPortableRuntimeBundle({ root: join(parent, 'dup'), sourceDatabasePath: database.path, profile: profile(), artifacts: [duplicate, duplicate] }), /unique/i);
  await assert.rejects(createPortableRuntimeBundle({
    root: join(parent, 'large'),
    sourceDatabasePath: database.path,
    profile: profile(),
    artifacts: [{ ...duplicate, path: 'artifacts/large.bin', content: Buffer.alloc(PORTABLE_RUNTIME_LIMITS.nonDatabaseArtifactBytes + 1) }],
  }), /byte bound/i);
  await assert.rejects(createPortableRuntimeBundle({
    root: join(parent, 'unknown-role'),
    sourceDatabasePath: database.path,
    profile: profile(),
    artifacts: [{ ...duplicate, role: 'raw_provider_payload' as never }],
  }), /role|invalid/i);
});

test('portable manifest recovery metadata is deterministic and contains no deployment or secret authority', async (t) => {
  const value = await fixture(t);
  const recovery = value.bundle.manifest.recovery;
  assert.ok(recovery.verificationProcedure.some((item) => /schema guards/i.test(item)));
  assert.ok(recovery.restoreProcedure.some((item) => /new controlled private root/i.test(item)));
  assert.ok(recovery.restoreProcedure.some((item) => /never restore TenantContext/i.test(item)));
  assert.ok(recovery.decommissionChecklist.some((item) => /credentials/i.test(item)));
  const semantic = JSON.stringify({ profile: value.bundle.profile, manifest: value.bundle.manifest });
  for (const forbidden of ['password', 'apiToken', 'oauthToken', 'privateKey', 'sessionCookie']) {
    assert.equal(semantic.includes(forbidden), false);
  }
});

test('production portability seam uses node:sqlite backup and contains no deployment, network, scheduler, or destructive delete path', () => {
  const source = readFileSync('src/runtime/portable-runtime.ts', 'utf8');
  assert.match(source, /import \{ backup, DatabaseSync \} from 'node:sqlite'/);
  assert.match(source, /await backup\(source, target\)/);
  for (const forbidden of ['node:child_process', 'node:http', 'node:https', 'fetch(', 'Docker', 'Kubernetes', 'Workers', 'D1Database', 'deleteCollection(']) {
    assert.equal(source.includes(forbidden), false, `unexpected Release 0.20 production surface: ${forbidden}`);
  }
  assert.equal(source.includes('rmSync('), false);
});

test('manifest file remains bounded and is not itself part of recursive semantic identity', async (t) => {
  const value = await fixture(t);
  assert.ok(value.bundle.fileCount <= PORTABLE_RUNTIME_LIMITS.files);
  assert.ok(value.bundle.totalBytes <= PORTABLE_RUNTIME_LIMITS.totalBundleBytes);
  assert.ok(value.bundle.manifestBytes > 0);
  assert.ok(existsSync(join(value.rootA, PORTABLE_RUNTIME_MANIFEST_PATH)));
  assert.equal(value.bundle.manifest.entries.some((entry) => entry.path === PORTABLE_RUNTIME_MANIFEST_PATH), false);
});
