import assert from 'node:assert/strict';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { authenticatedAuthority, issueAuthenticatedPrincipal } from '../../src/authentication/principal.js';
import type { Contract } from '../../src/contracts/wire.js';
import { sha256Bytes } from '../../src/lib/canonical-json.js';
import { LocalEvidenceRepository } from '../../src/persistence/sqlite.js';
import { runGate1Runner, type Gate1RunnerIo } from '../../scripts/gate1-wqt-runner.js';

type Json = Record<string, any>;

const fixtureText = readFileSync('tests/fixtures/wqt-normalized-v1.1.json', 'utf8');

function artifact(): Json {
  return JSON.parse(fixtureText) as Json;
}

function refreshFlattened(value: Json): void {
  value.observations = [
    ...value.sources.siteone.observations,
    ...value.sources.lighthouse.observations,
  ].sort((left: Json, right: Json) => `${left.source}:${left.code}`.localeCompare(`${right.source}:${right.code}`));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function run(args: string[]): Promise<any> {
  const output: string[] = [];
  const errors: string[] = [];
  const io: Gate1RunnerIo = {
    stdout: (line) => output.push(line),
    stderr: (line) => errors.push(line),
  };
  await runGate1Runner(args, io);
  assert.deepEqual(errors, []);
  assert.equal(output.length, 1);
  return JSON.parse(output[0]!) as any;
}

function metadata(value: Json, bytes: Buffer, runId: string, observedAt: string) {
  const minute = Number(observedAt.slice(14, 16));
  const prefix = observedAt.slice(0, 14);
  const at = (offset: number) => `${prefix}${String(minute + offset).padStart(2, '0')}:00.000Z`;
  return {
    wqtCommitSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    actionsRunId: runId,
    artifactName: `synthetic-wqt-${runId}`,
    normalizedFileIdentity: 'normalized/website-quality.json',
    normalizedSha256: sha256Bytes(bytes),
    schemaVersion: 'ldw.website-quality.v1',
    schemaMinorVersion: 1,
    siteOneVersion: value.sources.siteone.version,
    lighthouseVersion: value.sources.lighthouse.version,
    timing: {
      observedAt: at(0),
      startedAt: at(0),
      endedAt: at(1),
      collectedAt: at(2),
      receivedAt: at(3),
    },
    availability: {
      siteone: { state: 'available', reference: `synthetic-siteone-${runId}` },
      lighthouse: { state: 'available', reference: `synthetic-lighthouse-${runId}` },
    },
  };
}

test('Gate 1 runner imports comparable WQT evidence and exercises accepted human/report flow', async (t) => {
  const root = resolve('local-artifacts');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'synthetic-gate1-runner-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const db = join(directory, 'gate1.sqlite');
  const ledger = join(directory, 'gate1-ledger.json');
  const configPath = join(directory, 'config.json');
  const baselinePath = join(directory, 'baseline.json');
  const currentPath = join(directory, 'current.json');
  const baselineMetaPath = join(directory, 'baseline-meta.json');
  const currentMetaPath = join(directory, 'current-meta.json');
  const recommendationPath = join(directory, 'recommendation.json');
  const revisionPath = join(directory, 'revision.json');
  const measurementPath = join(directory, 'measurement.json');
  const outcomePath = join(directory, 'outcome.json');
  const reportPath = join(directory, 'operator.html');

  const config = {
    principalId: 'synthetic-gate1-local-operator',
    scope: {
      tenantId: 'tenant-alpha',
      siteId: 'site-alpha',
      siteScopeRevisionId: 'synthetic-scope-alpha-r1',
    },
    siteLabel: 'Synthetic Gate 1 site',
    expectedWqtSiteId: 'example-site',
    expectedTargetOrigin: 'https://example.test',
    providerConnectionIds: {
      siteone: 'synthetic-siteone-connection',
      lighthouse: 'synthetic-lighthouse-connection',
    },
  };
  writeJson(configPath, config);

  const baseline = artifact();
  const current = artifact();
  current.sources.siteone.observations[0].sourceStatus = 'SYNTHETIC_CHANGED';
  refreshFlattened(current);
  const baselineBytes = Buffer.from(JSON.stringify(baseline), 'utf8');
  const currentBytes = Buffer.from(JSON.stringify(current), 'utf8');
  writeFileSync(baselinePath, baselineBytes);
  writeFileSync(currentPath, currentBytes);
  const baselineMeta = metadata(baseline, baselineBytes, '1001', '2026-09-01T00:00:00.000Z');
  const currentMeta = metadata(current, currentBytes, '1002', '2026-09-02T00:00:00.000Z');
  writeJson(baselineMetaPath, baselineMeta);
  writeJson(currentMetaPath, currentMeta);

  await assert.rejects(
    runGate1Runner(['init', '--db', db, '--ledger', ledger], { stdout: () => {}, stderr: () => {} }),
    /Missing required option: --config/,
  );

  const initialized = await run(['init', '--db', db, '--ledger', ledger, '--config', configPath]);
  assert.equal(initialized.initialized, true);

  const badMeta = { ...baselineMeta, normalizedSha256: '0'.repeat(64) };
  writeJson(baselineMetaPath, badMeta);
  await assert.rejects(
    runGate1Runner([
      'import-wqt', '--db', db, '--ledger', ledger, '--config', configPath,
      '--artifact', baselinePath, '--metadata', baselineMetaPath,
    ], { stdout: () => {}, stderr: () => {} }),
    /SHA-256 does not match/,
  );
  writeJson(baselineMetaPath, baselineMeta);

  const importedBaseline = await run([
    'import-wqt', '--db', db, '--ledger', ledger, '--config', configPath,
    '--artifact', baselinePath, '--metadata', baselineMetaPath,
  ]);
  const replay = await run([
    'import-wqt', '--db', db, '--ledger', ledger, '--config', configPath,
    '--artifact', baselinePath, '--metadata', baselineMetaPath,
  ]);
  assert.equal(replay.replayed, true);

  const importedCurrent = await run([
    'import-wqt', '--db', db, '--ledger', ledger, '--config', configPath,
    '--artifact', currentPath, '--metadata', currentMetaPath,
  ]);

  const listed = await run(['list', '--db', db, '--ledger', ledger, '--config', configPath]);
  assert.equal(listed.imports.length, 2);
  assert.equal(listed.imports[0].normalizedSha256, baselineMeta.normalizedSha256);
  assert.equal(listed.imports[1].normalizedSha256, currentMeta.normalizedSha256);
  assert.equal(JSON.stringify(listed).includes('observations'), false);

  const baselineSiteOne = importedBaseline.collections.find((item: any) => item.providerId === 'siteone')!.collectionId;
  const currentSiteOne = importedCurrent.collections.find((item: any) => item.providerId === 'siteone')!.collectionId;
  const compared = await run([
    'compare', '--db', db, '--ledger', ledger, '--config', configPath,
    '--baseline', baselineSiteOne, '--current', currentSiteOne,
  ]);
  assert.equal(compared.summary.changed, 1);
  assert.equal(compared.summary.attentionCount, 1);
  assert.equal(compared.attention.length, 1);
  const currentObservationId = compared.attention[0].currentObservationId as string;
  assert.ok(currentObservationId);

  const principal = issueAuthenticatedPrincipal({
    principalId: config.principalId,
    tenantId: config.scope.tenantId,
    grants: [
      { scope: config.scope, providerId: 'siteone', providerConnectionId: config.providerConnectionIds.siteone },
      { scope: config.scope, providerId: 'lighthouse', providerConnectionId: config.providerConnectionIds.lighthouse },
    ],
  });
  const context = authenticatedAuthority(principal)!.context;
  const evidence = new LocalEvidenceRepository(db);
  t.after(() => evidence.close());
  const observation = await evidence.getObservation(context, currentObservationId);
  assert.ok(observation);

  const recommendation: Contract<'recommendation'> = {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id: 'synthetic-gate1-recommendation',
    scope: structuredClone(config.scope),
    evidence: [{ scope: structuredClone(config.scope), kind: 'observation', id: observation.id }],
    rationale: 'Synthetic Gate 1 human-authored recommendation.',
    priority: { level: 'unassessed', basis: 'Synthetic Gate 1 proof intentionally assigns no priority.' },
    authorityClass: 'internal_review',
    lifecycle: 'proposed',
    revision: 1,
    createdAt: '2026-09-02T00:10:00.000Z',
    updatedAt: '2026-09-02T00:10:00.000Z',
  };
  writeJson(recommendationPath, recommendation);
  const created = await run([
    'recommend-create', '--db', db, '--ledger', ledger, '--config', configPath, '--input', recommendationPath,
  ]);
  assert.equal(created.recommendation.revision, 1);

  const revision: Contract<'recommendation'> = {
    ...structuredClone(recommendation),
    rationale: 'Synthetic Gate 1 human-authored revised recommendation.',
    revision: 2,
    updatedAt: '2026-09-02T00:11:00.000Z',
  };
  writeJson(revisionPath, revision);
  const revised = await run([
    'recommend-revise', '--db', db, '--ledger', ledger, '--config', configPath,
    '--input', revisionPath, '--expected-revision', '1',
  ]);
  assert.equal(revised.recommendation.revision, 2);

  const inReview = await run([
    'recommend-transition', '--db', db, '--ledger', ledger, '--config', configPath,
    '--recommendation', recommendation.id, '--expected-revision', '2',
    '--lifecycle', 'in_review', '--updated-at', '2026-09-02T00:12:00.000Z',
  ]);
  assert.equal(inReview.recommendation.lifecycle, 'in_review');
  const accepted = await run([
    'recommend-transition', '--db', db, '--ledger', ledger, '--config', configPath,
    '--recommendation', recommendation.id, '--expected-revision', '3',
    '--lifecycle', 'accepted', '--updated-at', '2026-09-02T00:13:00.000Z',
  ]);
  assert.equal(accepted.recommendation.lifecycle, 'accepted');

  const measurement: Contract<'measurement'> = {
    schemaVersion: '1.0',
    kind: 'measurement',
    id: 'synthetic-gate1-measurement',
    cohort: structuredClone(observation.cohort),
    relationship: { role: 'baseline' },
    dueWindow: structuredClone(observation.provenance.sourceTime),
    result: {
      state: 'measured',
      observedWindow: structuredClone(observation.provenance.sourceTime),
      observations: [{
        reference: { scope: structuredClone(config.scope), id: observation.id },
        value: structuredClone(observation.value),
      }],
    },
    comparability: { state: 'comparable' },
    methodology: { id: 'synthetic-gate1-human-measurement', version: '1.0' },
    createdAt: observation.provenance.receivedAt,
  };
  writeJson(measurementPath, measurement);
  const measured = await run([
    'measure', '--db', db, '--ledger', ledger, '--config', configPath,
    '--input', measurementPath, '--cohort-observation', observation.id,
    '--recommendation', recommendation.id,
  ]);
  assert.equal(measured.measurement.id, measurement.id);

  const outcome: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'synthetic-gate1-outcome',
    scope: structuredClone(config.scope),
    recommendationId: recommendation.id,
    assessment: {
      direction: 'inconclusive',
      measurements: [{ scope: structuredClone(config.scope), id: measurement.id }],
      reason: 'Synthetic Gate 1 human declaration remains inconclusive.',
    },
    attribution: { strength: 'none', reason: 'Synthetic Gate 1 proof makes no causal attribution.' },
    createdAt: '2026-09-02T00:20:00.000Z',
  };
  writeJson(outcomePath, outcome);
  const declared = await run([
    'outcome', '--db', db, '--ledger', ledger, '--config', configPath, '--input', outcomePath,
  ]);
  assert.equal(declared.outcome.recommendationId, recommendation.id);

  const history = await run([
    'review-show', '--db', db, '--ledger', ledger, '--config', configPath,
    '--recommendation', recommendation.id,
  ]);
  assert.deepEqual(history.history.map((item: any) => item.revision), [1, 2, 3, 4]);
  assert.deepEqual(history.measurements.map((item: any) => item.id), [measurement.id]);
  assert.deepEqual(history.outcomes.map((item: any) => item.id), [outcome.id]);

  const rendered = await run([
    'render-case', '--db', db, '--ledger', ledger, '--config', configPath,
    '--baseline', baselineSiteOne, '--current', currentSiteOne,
    '--recommendation', recommendation.id, '--output', reportPath,
  ]);
  assert.ok(rendered.bytes > 0);
  const html = readFileSync(reportPath, 'utf8');
  assert.match(html, /HUMAN-AUTHORED/);
  assert.match(html, /HUMAN-DECLARED OUTCOME/);
  assert.match(html, /synthetic-gate1-recommendation/);

  await assert.rejects(
    runGate1Runner([
      'render-case', '--db', db, '--ledger', ledger, '--config', configPath,
      '--baseline', baselineSiteOne, '--current', currentSiteOne,
      '--recommendation', recommendation.id, '--output', reportPath,
    ], { stdout: () => {}, stderr: () => {} }),
    /Refusing to overwrite an existing report/,
  );
});

test('Gate 1 non-init commands fail closed on a missing SQLite path without creating database residue', async (t) => {
  const root = resolve('local-artifacts');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'synthetic-gate1-missing-db-'));
  t.after(() => rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

  const db = join(directory, 'mistyped.sqlite');
  const ledger = join(directory, 'gate1-ledger.json');
  const configPath = join(directory, 'config.json');
  writeJson(configPath, {
    principalId: 'synthetic-gate1-local-operator',
    scope: {
      tenantId: 'tenant-alpha',
      siteId: 'site-alpha',
      siteScopeRevisionId: 'synthetic-scope-alpha-r1',
    },
    siteLabel: 'Synthetic Gate 1 site',
    expectedWqtSiteId: 'example-site',
    expectedTargetOrigin: 'https://example.test',
    providerConnectionIds: {
      siteone: 'synthetic-siteone-connection',
      lighthouse: 'synthetic-lighthouse-connection',
    },
  });

  await assert.rejects(
    runGate1Runner([
      'list', '--db', db, '--ledger', ledger, '--config', configPath,
    ], { stdout: () => {}, stderr: () => {} }),
    /Gate 1 database must already exist as a regular file/,
  );

  assert.equal(existsSync(db), false);
  assert.equal(existsSync(`${db}-wal`), false);
  assert.equal(existsSync(`${db}-shm`), false);
  assert.equal(existsSync(ledger), false);
});

test('Gate 1 runner source has no downloader, workflow dispatch, provider execution, network listener or cloud runtime', () => {
  const source = readFileSync('scripts/gate1-wqt-runner.ts', 'utf8');
  assert.doesNotMatch(source, /from ['"]node:(?:http|https|net|tls|dns|dgram|child_process|worker_threads)['"]/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /workflow_dispatch|actions\/download-artifact|api\.github\.com|octokit|wrangler|cloudflare|D1Database|Activepieces|ZeroRank/i);
  assert.doesNotMatch(source, /\b(?:spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\s*\(/);
});
