import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Contract } from '../src/contracts/wire.js';
import { ACCEPTED_STORAGE_SCHEMA } from '../src/persistence/migrations.js';
import type { CollectionBatch, Scope } from '../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  createHumanRecommendation,
  recordHumanOutcome,
  recordMeasurement,
  transitionHumanRecommendation,
} from '../src/review/service.js';
import { createTestTenantContext } from '../tests/support/tenant-authority.js';
import { batch } from '../tests/persistence/helpers.js';

const artifactDirectory = resolve('local-artifacts', 'cloudflare-gate');
const databasePath = resolve(artifactDirectory, 'seed-source.sqlite');
const schemaPath = resolve(artifactDirectory, 'schema.sql');
const seedPath = resolve(artifactDirectory, 'seed.sql');
const manifestPath = resolve(artifactDirectory, 'manifest.json');

const alpha = createTestTenantContext('tenant-alpha');
const beta = createTestTenantContext('tenant-beta');

export const gateSelectors = Object.freeze({
  tenantId: 'tenant-alpha',
  siteId: 'site-alpha',
  siteScopeRevisionId: 'synthetic-scope-alpha-r1',
  providerId: 'synthetic-provider',
  providerConnectionId: 'synthetic-connection',
  baselineCollectionId: 'synthetic-collection-gate-baseline',
  currentCollectionId: 'synthetic-collection-gate-current',
  selectedRecommendationId: 'synthetic-gate-selected',
});

function setWindow(
  value: CollectionBatch,
  start: string,
  end: string,
  collectedAt: string,
  receivedAt: string,
): void {
  value.collection.sourceTime = { start, end };
  value.collection.startedAt = start;
  value.collection.endedAt = end;
  value.collection.collectedAt = collectedAt;
  value.collection.receivedAt = receivedAt;
  for (const item of value.observations) {
    item.record.provenance.sourceTime = structuredClone(value.collection.sourceTime);
    item.record.provenance.collectedAt = collectedAt;
    item.record.provenance.receivedAt = receivedAt;
  }
}

function gateBatches(tenant: 'alpha' | 'beta'): { baseline: CollectionBatch; current: CollectionBatch } {
  const baseline = batch(tenant, '-gate-baseline');
  baseline.collection.id = gateSelectors.baselineCollectionId;
  baseline.collection.completeness = { state: 'complete', expectedCount: 2, receivedCount: 2 };
  baseline.observations[0]!.record.provenance.runId = baseline.collection.id;

  const extraSource = structuredClone(baseline.sources[0]!);
  extraSource.id = 'synthetic-source-row-gate-baseline-extra';
  extraSource.record.identity.sourceRecordId = 'synthetic-external-gate-baseline-extra';
  const extraObservation = structuredClone(baseline.observations[0]!);
  extraObservation.sourceId = extraSource.id;
  extraObservation.record.id = 'synthetic-observation-gate-baseline-extra';
  extraObservation.record.cohort.id = 'synthetic-cohort-gate-coverage';
  extraObservation.record.cohort.context.metric.id = 'synthetic-metric-gate-coverage';
  extraObservation.record.provenance.source = structuredClone(extraSource.record.identity);
  extraObservation.record.provenance.runId = baseline.collection.id;
  baseline.sources.push(extraSource);
  baseline.observations.push(extraObservation);
  for (const item of baseline.observations) {
    item.record.provenance.completeness = structuredClone(baseline.collection.completeness);
  }
  setWindow(
    baseline,
    '2026-01-01T00:00:00.000Z',
    '2026-01-01T01:00:00.000Z',
    '2026-01-01T01:01:00.000Z',
    '2026-01-01T01:02:00.000Z',
  );

  const current = batch(tenant, '-gate-current');
  current.collection.id = gateSelectors.currentCollectionId;
  current.collection.completeness = {
    state: 'partial', expectedCount: 2, receivedCount: 1,
    reason: 'Synthetic gate proof intentionally preserves incomplete coverage.',
  };
  current.observations[0]!.record.provenance.runId = current.collection.id;
  current.observations[0]!.record.cohort = structuredClone(baseline.observations[0]!.record.cohort);
  current.observations[0]!.record.value = { state: 'observed', value: { type: 'number', value: 1 } };
  current.observations[0]!.record.provenance.completeness = structuredClone(current.collection.completeness);
  setWindow(
    current,
    '2026-01-02T00:00:00.000Z',
    '2026-01-02T01:00:00.000Z',
    '2026-01-02T01:01:00.000Z',
    '2026-01-02T01:02:00.000Z',
  );
  return { baseline, current };
}

function recommendation(
  observation: Contract<'observation'>,
  id: string,
  rationale: string,
): Contract<'recommendation'> {
  const owner = observation.cohort.context.scope;
  return {
    schemaVersion: '1.0', kind: 'recommendation', id, scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: observation.id }],
    rationale,
    priority: { level: 'unassessed', basis: 'Synthetic gate proof intentionally assigns no priority.' },
    authorityClass: 'internal_review', lifecycle: 'proposed', revision: 1,
    createdAt: '2026-01-01T03:00:00.000Z', updatedAt: '2026-01-01T03:00:00.000Z',
  };
}

function measurement(
  observation: Contract<'observation'>,
  id: string,
  relationship: Contract<'measurement'>['relationship'],
): Contract<'measurement'> {
  return {
    schemaVersion: '1.0', kind: 'measurement', id,
    cohort: structuredClone(observation.cohort),
    relationship: structuredClone(relationship),
    dueWindow: structuredClone(observation.provenance.sourceTime),
    result: {
      state: 'measured',
      observedWindow: structuredClone(observation.provenance.sourceTime),
      observations: [{
        reference: { scope: structuredClone(observation.cohort.context.scope), id: observation.id },
        value: structuredClone(observation.value),
      }],
    },
    comparability: { state: 'comparable' },
    methodology: { id: 'synthetic-cloudflare-gate-method', version: '1.0' },
    createdAt: observation.provenance.receivedAt,
  };
}

async function bootstrapTenant(
  evidence: LocalEvidenceRepository,
  tenant: 'alpha' | 'beta',
  owner: Scope,
): Promise<void> {
  const context = tenant === 'alpha' ? alpha : beta;
  await evidence.createTenant(context);
  await evidence.createSite(context, { id: owner.siteId, label: `Synthetic ${tenant} cloud gate` });
  await evidence.createScope(context, owner);
  await evidence.createConnection(context, {
    id: gateSelectors.providerConnectionId,
    scope: owner,
    providerId: gateSelectors.providerId,
  });
}

function sqlLiteral(value: SQLOutputValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  throw new Error('Gate seed supports only scalar accepted storage values');
}

function dumpTable(db: DatabaseSync, table: string, orderBy: string): { sql: string; rows: number } {
  const columns = db.prepare(`PRAGMA table_xinfo(${table})`).all()
    .filter((row) => Number(row['hidden']) === 0)
    .map((row) => String(row['name']));
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all();
  const sql = rows.map((row) => {
    const values = columns.map((column) => sqlLiteral(row[column] ?? null));
    return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.join(', ')});`;
  }).join('\n');
  return { sql, rows: rows.length };
}

async function buildSeed(): Promise<void> {
  mkdirSync(artifactDirectory, { recursive: true });
  for (const path of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`, schemaPath, seedPath, manifestPath]) {
    rmSync(path, { force: true });
  }

  const evidence = new LocalEvidenceRepository(databasePath);
  const review = new LocalReviewLedgerRepository(databasePath);
  try {
    const alphaCase = gateBatches('alpha');
    const betaCase = gateBatches('beta');
    await bootstrapTenant(evidence, 'alpha', alphaCase.baseline.collection.scope);
    await bootstrapTenant(evidence, 'beta', betaCase.baseline.collection.scope);
    for (const value of [alphaCase.baseline, alphaCase.current]) await evidence.persistCollection(alpha, value);
    for (const value of [betaCase.baseline, betaCase.current]) await evidence.persistCollection(beta, value);

    const baselineObservation = alphaCase.baseline.observations[0]!.record;
    const currentObservation = alphaCase.current.observations[0]!.record;
    const proposed = await createHumanRecommendation(review, evidence, alpha, {
      recommendation: recommendation(
        baselineObservation,
        gateSelectors.selectedRecommendationId,
        'Synthetic human reviewer selected canonical changed evidence for the Cloudflare gate.',
      ),
    });
    const inReview = await transitionHumanRecommendation(review, evidence, alpha, {
      scope: proposed.scope, id: proposed.id, expectedCurrentRevision: 1,
      lifecycle: 'in_review', updatedAt: '2026-01-01T03:10:00.000Z',
    });
    const accepted = await transitionHumanRecommendation(review, evidence, alpha, {
      scope: inReview.scope, id: inReview.id, expectedCurrentRevision: 2,
      lifecycle: 'accepted', updatedAt: '2026-01-01T03:20:00.000Z',
    });
    const rejected = await createHumanRecommendation(review, evidence, alpha, {
      recommendation: recommendation(
        alphaCase.baseline.observations[1]!.record,
        'synthetic-gate-rejected',
        'Synthetic human reviewer rejected this separate gate recommendation.',
      ),
    });
    await transitionHumanRecommendation(review, evidence, alpha, {
      scope: rejected.scope, id: rejected.id, expectedCurrentRevision: 1,
      lifecycle: 'rejected', updatedAt: '2026-01-01T03:30:00.000Z',
    });

    const baselineMeasurement = measurement(
      baselineObservation,
      'synthetic-gate-measurement-baseline',
      { role: 'baseline' },
    );
    const followUpMeasurement = measurement(
      currentObservation,
      'synthetic-gate-measurement-follow-up',
      { role: 'follow_up', baselineMeasurementId: baselineMeasurement.id },
    );
    await recordMeasurement(review, evidence, alpha, {
      measurement: baselineMeasurement,
      cohortObservationId: baselineObservation.id,
      recommendationId: accepted.id,
    });
    await recordMeasurement(review, evidence, alpha, {
      measurement: followUpMeasurement,
      cohortObservationId: currentObservation.id,
      recommendationId: accepted.id,
    });
    const outcome: Contract<'outcome'> = {
      schemaVersion: '1.0', kind: 'outcome', id: 'synthetic-gate-outcome',
      scope: structuredClone(accepted.scope), recommendationId: accepted.id,
      assessment: {
        direction: 'regressed',
        measurements: [
          { scope: structuredClone(accepted.scope), id: baselineMeasurement.id },
          { scope: structuredClone(accepted.scope), id: followUpMeasurement.id },
        ],
        comparability: 'comparable',
        rationale: 'Synthetic human declaration; the numeric increase is not interpreted by G.A.S.',
      },
      attribution: {
        strength: 'technical_verification',
        basis: 'Synthetic technical verification only; no causal marketing claim.',
      },
      createdAt: '2026-01-03T00:00:00.000Z',
    };
    await recordHumanOutcome(review, alpha, { outcome });

    const betaProposed = recommendation(
      betaCase.baseline.observations[0]!.record,
      gateSelectors.selectedRecommendationId,
      'Synthetic Beta recommendation intentionally reuses the Alpha selector ID.',
    );
    await createHumanRecommendation(review, evidence, beta, { recommendation: betaProposed });
  } finally {
    review.close();
    evidence.close();
  }

  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const schema = [
      ACCEPTED_STORAGE_SCHEMA.historyTable + ';',
      ACCEPTED_STORAGE_SCHEMA.migration1,
      ACCEPTED_STORAGE_SCHEMA.migration2,
      ...ACCEPTED_STORAGE_SCHEMA.migrationHistory.map(
        (item) => `INSERT INTO schema_migrations (version, checksum) VALUES (${item.version}, '${item.checksum}');`,
      ),
    ].join('\n');
    writeFileSync(schemaPath, schema, 'utf8');

    const tables = [
      ['tenants', 'tenant_id'],
      ['sites', 'tenant_id, site_id'],
      ['site_scopes', 'tenant_id, site_id, scope_revision_id'],
      ['provider_connections', 'tenant_id, id'],
      ['collections', 'tenant_id, id'],
      ['collection_parts', 'tenant_id, collection_id, part_index'],
      ['source_records', 'tenant_id, id'],
      ['observations', 'tenant_id, id'],
      ['recommendation_revisions', 'tenant_id, id, revision'],
      ['measurements', 'tenant_id, id'],
      ['outcomes', 'tenant_id, id'],
    ] as const;
    const dumps = tables.map(([table, order]) => ({ table, ...dumpTable(db, table, order) }));
    writeFileSync(seedPath, dumps.map((item) => item.sql).filter(Boolean).join('\n') + '\n', 'utf8');
    const seedRows = dumps.reduce((sum, item) => sum + item.rows, 0);
    const manifest = {
      synthetic: true,
      schemaVersion: ACCEPTED_STORAGE_SCHEMA.version,
      migrationHistory: ACCEPTED_STORAGE_SCHEMA.migrationHistory,
      selectors: gateSelectors,
      tableRows: Object.fromEntries(dumps.map((item) => [item.table, item.rows])),
      seedRowsWritten: seedRows,
      administrativeRefreshRowsWritten: seedRows + ACCEPTED_STORAGE_SCHEMA.migrationHistory.length,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    console.log(`Generated synthetic Cloudflare gate seed: ${seedRows} data rows`);
  } finally {
    db.close();
    for (const path of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) rmSync(path, { force: true });
  }
}

await buildSeed();
