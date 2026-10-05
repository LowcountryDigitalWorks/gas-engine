import { createHash } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Contract } from '../src/contracts/wire.js';
import {
  computeManagedServiceRunId,
  serializeManagedServiceRunJson,
  type ManagedServiceRun,
} from '../src/operator/service-run.js';
import { parseManagedServiceRun } from '../src/operator/service-run-import.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  copyPortableRuntimeBundle,
  createPortableRuntimeBundle,
  planPortableRuntimeRetention,
} from '../src/runtime/portable-runtime.js';
import { alpha, batch, beta } from '../tests/persistence/helpers.js';
import { createTestTenantContext } from '../tests/support/tenant-authority.js';

const artifactDirectory = resolve('local-artifacts/release-0.20-portability');
const sourceDatabasePath = resolve(artifactDirectory, 'source.sqlite');
const rootA = resolve(artifactDirectory, 'root-a');
const rootB = resolve(artifactDirectory, 'root-b');

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
    workspaceId: 'workspace:' + 'b'.repeat(64),
    serviceBriefId: 'service-brief:release-020-portability-preview',
    receipts: [{
      id: 'manual-context',
      sourceFamily: 'manual_context',
      state: 'not_supplied',
      limitations: ['Synthetic preview carries no external manual context.'],
    }],
    readiness: [],
    sourceManifest: [],
    attentionIds: [],
    followUp: {
      decisionCyclePresent: false,
      reasons: ['Synthetic preview carries no decision cycle.'],
    },
    customerReport: { state: 'not_requested' },
    provenance: {
      workspaceId: 'workspace:' + 'b'.repeat(64),
      serviceBriefId: 'service-brief:release-020-portability-preview',
      receiptIds: ['manual-context'],
    },
    limitations: ['Synthetic public-safe accepted Release 0.18 run for the Release 0.20 portability proof.'],
  };
  return parseManagedServiceRun({ ...body, id: computeManagedServiceRunId(body) });
}

function syntheticRecommendation(): Contract<'recommendation'> {
  const owner = batch('alpha').collection.scope;
  return {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id: 'release-020-preview-review',
    scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: 'synthetic-observation-zero' }],
    rationale: 'Synthetic review-ledger state for portability preview verification.',
    priority: { level: 'unassessed', basis: 'Synthetic preview does not rank work.' },
    authorityClass: 'internal_review',
    lifecycle: 'proposed',
    revision: 1,
    createdAt: '2026-10-01T02:00:00.000Z',
    updatedAt: '2026-10-01T02:00:00.000Z',
  };
}

async function seedSourceDatabase(): Promise<void> {
  const evidence = new LocalEvidenceRepository(sourceDatabasePath);
  const review = new LocalReviewLedgerRepository(sourceDatabasePath);
  try {
    for (const [context, tenant] of [[alpha, 'alpha'], [beta, 'beta']] as const) {
      const value = batch(tenant);
      await evidence.createTenant(context);
      await evidence.createSite(context, { id: value.collection.scope.siteId, label: `Synthetic ${tenant} portability tenant` });
      await evidence.createScope(context, value.collection.scope);
      await evidence.createConnection(context, {
        id: value.collection.providerConnectionId!,
        scope: value.collection.scope,
        providerId: value.collection.providerId,
      });
      await evidence.persistCollection(context, value);
    }
    await review.createRecommendation(alpha, syntheticRecommendation());
  } finally {
    review.close();
    evidence.close();
  }
}

async function generate(): Promise<void> {
  rmSync(artifactDirectory, { recursive: true, force: true });
  mkdirSync(artifactDirectory, { recursive: true });
  await seedSourceDatabase();

  const run = syntheticRun();
  const runJson = serializeManagedServiceRunJson(run);
  const runBytes = Buffer.from(runJson, 'utf8');
  const created = await createPortableRuntimeBundle({
    root: rootA,
    sourceDatabasePath,
    profile: {
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
      buildIdentity: 'release-020-public-synthetic-preview',
    },
    artifacts: [{
      role: 'service_run',
      path: 'artifacts/release-0.18/service-run.json',
      classification: 'ldw_internal',
      content: runJson,
      expectedSha256: createHash('sha256').update(runBytes).digest('hex'),
      expectedByteCount: runBytes.byteLength,
      retentionClass: 'internal-90d',
      retentionTimestamp: '2026-10-02T12:35:00.000Z',
      semanticIdentity: run.id,
    }],
  });
  const relocated = copyPortableRuntimeBundle(rootA, rootB);
  if (relocated.manifest.id !== created.manifest.id) throw new Error('Root relocation changed Release 0.20 semantic bundle identity.');

  const restoredEvidence = new LocalEvidenceRepository(resolve(rootB, 'state/gas.sqlite'));
  const restoredReview = new LocalReviewLedgerRepository(resolve(rootB, 'state/gas.sqlite'));
  try {
    const restoredAlpha = createTestTenantContext('tenant-alpha');
    const restoredBeta = createTestTenantContext('tenant-beta');
    if ((await restoredEvidence.getTenant(restoredAlpha))?.id !== 'tenant-alpha') throw new Error('Relocated Alpha tenant state did not reopen.');
    if ((await restoredEvidence.getTenant(restoredBeta))?.id !== 'tenant-beta') throw new Error('Relocated Beta tenant state did not reopen.');
    if ((await restoredEvidence.getCollection(restoredAlpha, batch('alpha').collection.id))?.id !== batch('alpha').collection.id) {
      throw new Error('Relocated Alpha canonical evidence did not survive backup.');
    }
    if ((await restoredEvidence.getCollection(restoredBeta, batch('beta').collection.id))?.id !== batch('beta').collection.id) {
      throw new Error('Relocated Beta canonical evidence did not survive backup.');
    }
    if ((await restoredReview.getCurrentRecommendation(restoredAlpha, batch('alpha').collection.scope, syntheticRecommendation().id))?.id !== syntheticRecommendation().id) {
      throw new Error('Relocated review-ledger state did not survive backup.');
    }
  } finally {
    restoredReview.close();
    restoredEvidence.close();
  }

  const retention = planPortableRuntimeRetention(created.profile, created.manifest, '2026-10-05T00:00:00.000Z');
  console.log(`Release 0.20 profile identity: ${created.profileIdentity}`);
  console.log(`Release 0.20 bundle identity root A: ${created.manifest.id}`);
  console.log(`Release 0.20 bundle identity root B: ${relocated.manifest.id}`);
  console.log(`Release 0.20 accepted Release 0.18 run identity: ${run.id}`);
  console.log(`Release 0.20 manifest-owned files: ${created.fileCount}; total bundle bytes: ${created.totalBytes}`);
  console.log(`Release 0.20 SQLite backup bytes: ${created.databaseBytes}; profile bytes: ${created.profileBytes}; manifest bytes: ${created.manifestBytes}`);
  console.log(`Release 0.20 retention plan: ${retention.entries.map((entry) => `${entry.path}=${entry.state}`).join('; ')}`);
  console.log('Release 0.20 preview proved two synthetic tenants, accepted evidence/review state, online SQLite backup, exact relocation, newly issued authority, deterministic retention planning, and no deployment.');
}

await generate();
