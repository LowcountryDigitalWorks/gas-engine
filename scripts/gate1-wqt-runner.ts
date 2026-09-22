import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  adaptWqtNormalizedEvidence,
  MAX_WQT_NORMALIZED_BYTES,
  WQT_INPUT_SCHEMA_MINOR_VERSION,
  WQT_INPUT_SCHEMA_VERSION,
  type WqtAdapterConfig,
} from '../src/adapters/wqt.js';
import { authenticatedAuthority, issueAuthenticatedPrincipal } from '../src/authentication/principal.js';
import { availability, identifier, scope, shortText, timestamp, version } from '../src/contracts/primitives.js';
import { canonicalJson } from '../src/lib/canonical-json.js';
import { diffEvidenceCollections } from '../src/analysis/diff.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import type { Scope } from '../src/persistence/repository.js';
import { assembleOperatorCaseView } from '../src/operator/case-view.js';
import { buildOperatorCasePresentation, renderOperatorCaseHtml } from '../src/operator/html.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  createHumanRecommendation,
  recordHumanOutcome,
  recordMeasurement,
  reviseHumanRecommendation,
  transitionHumanRecommendation,
} from '../src/review/service.js';

const SMALL_JSON_BYTES = 65_536;
const LEDGER_BYTES = 262_144;
const LEDGER_FORMAT = 'ldw.gas.release-1.0-gate1-ledger.v1' as const;

const wqtSiteId = z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const gitSha = z.string().regex(/^[a-f0-9]{40}$/);
const runId = z.string().regex(/^[1-9][0-9]*$/);
const normalizedFileIdentity = z.string().min(1).max(256).regex(/\S/);

const authorityConfigSchema = z.strictObject({
  principalId: identifier,
  scope,
  siteLabel: shortText,
  expectedWqtSiteId: wqtSiteId,
  expectedTargetOrigin: z.string().min(1).max(2_048),
  providerConnectionIds: z.strictObject({
    siteone: identifier,
    lighthouse: identifier,
  }),
});

const timingSchema = z.strictObject({
  observedAt: timestamp,
  startedAt: timestamp,
  endedAt: timestamp,
  collectedAt: timestamp,
  receivedAt: timestamp,
});

const importMetadataSchema = z.strictObject({
  wqtCommitSha: gitSha,
  actionsRunId: runId,
  artifactName: shortText,
  artifactArchiveSha256: sha256.optional(),
  normalizedFileIdentity,
  normalizedSha256: sha256,
  schemaVersion: z.literal(WQT_INPUT_SCHEMA_VERSION),
  schemaMinorVersion: z.literal(WQT_INPUT_SCHEMA_MINOR_VERSION),
  siteOneVersion: version,
  lighthouseVersion: version,
  timing: timingSchema,
  availability: z.strictObject({
    siteone: availability,
    lighthouse: availability,
  }),
});

const collectionLedgerSchema = z.strictObject({
  providerId: z.enum(['siteone', 'lighthouse']),
  collectionId: identifier,
  sourceStart: timestamp,
  sourceEnd: timestamp,
  persistedSources: z.number().int().min(0),
  observationCount: z.number().int().min(0),
});

const importLedgerSchema = z.strictObject({
  wqtCommitSha: gitSha,
  actionsRunId: runId,
  artifactName: shortText,
  artifactArchiveSha256: sha256.optional(),
  normalizedFileIdentity,
  normalizedSha256: sha256,
  schemaVersion: z.literal(WQT_INPUT_SCHEMA_VERSION),
  schemaMinorVersion: z.literal(WQT_INPUT_SCHEMA_MINOR_VERSION),
  siteOneVersion: version,
  siteOneExecutedAt: z.string().max(2_048).nullable(),
  lighthouseVersion: version,
  lighthouseFetchTime: z.string().max(2_048).nullable(),
  lighthouseUserAgent: z.string().max(16_384).nullable(),
  trustedTiming: timingSchema,
  availability: z.strictObject({
    siteone: availability,
    lighthouse: availability,
  }),
  collections: z.array(collectionLedgerSchema).length(2),
});

const gateLedgerSchema = z.strictObject({
  format: z.literal(LEDGER_FORMAT),
  authority: authorityConfigSchema,
  imports: z.array(importLedgerSchema).max(32),
});

type AuthorityConfig = z.infer<typeof authorityConfigSchema>;
type ImportMetadata = z.infer<typeof importMetadataSchema>;
type GateLedger = z.infer<typeof gateLedgerSchema>;
type ImportLedger = z.infer<typeof importLedgerSchema>;

export interface Gate1RunnerIo {
  stdout(line: string): void;
  stderr(line: string): void;
}

const defaultIo: Gate1RunnerIo = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

function fail(message: string): never {
  throw new Error(message);
}

function readBounded(path: string, maxBytes: number): Buffer {
  const stats = statSync(path);
  if (!stats.isFile()) fail(`Expected a regular file: ${path}`);
  if (stats.size > maxBytes) fail(`File exceeds the allowed local runner bound: ${path}`);
  return readFileSync(path);
}

function readJson(path: string, maxBytes = SMALL_JSON_BYTES): unknown {
  const bytes = readBounded(path, maxBytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    fail(`JSON file is not strict UTF-8: ${path}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    fail(`JSON file is invalid: ${path}`);
  }
}

function readAuthority(path: string): AuthorityConfig {
  return authorityConfigSchema.parse(readJson(path));
}

function readImportMetadata(path: string): ImportMetadata {
  return importMetadataSchema.parse(readJson(path));
}

function readLedger(path: string): GateLedger {
  return gateLedgerSchema.parse(readJson(path, LEDGER_BYTES));
}

function writeLedger(path: string, value: GateLedger, createOnly = false): void {
  const parsed = gateLedgerSchema.parse(value);
  const serialized = JSON.stringify(parsed, null, 2) + '\n';
  if (Buffer.byteLength(serialized, 'utf8') > LEDGER_BYTES) fail('Gate 1 metadata ledger exceeds its bounded local size.');
  if (createOnly) {
    writeFileSync(path, serialized, { encoding: 'utf8', flag: 'wx' });
    return;
  }
  const temporary = `${path}.tmp`;
  if (existsSync(temporary)) fail(`Refusing to replace an existing temporary ledger: ${temporary}`);
  try {
    writeFileSync(temporary, serialized, { encoding: 'utf8', flag: 'wx' });
    renameSync(temporary, path);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function requireLedgerAuthority(ledger: GateLedger, config: AuthorityConfig): void {
  if (!same(ledger.authority, config)) {
    fail('Trusted Gate 1 configuration differs from the configuration that initialized this proof ledger.');
  }
}

function authority(config: AuthorityConfig) {
  const grants = (['siteone', 'lighthouse'] as const).map((providerId) => ({
    scope: config.scope,
    providerId,
    providerConnectionId: config.providerConnectionIds[providerId],
  }));
  const principal = issueAuthenticatedPrincipal({
    principalId: config.principalId,
    tenantId: config.scope.tenantId,
    grants,
  });
  const resolved = authenticatedAuthority(principal);
  if (resolved === null) fail('Trusted local operator principal did not resolve authority.');
  return resolved.context;
}

function ensureParentExists(path: string): void {
  const parent = dirname(resolve(path));
  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    fail(`Parent directory must already exist: ${parent}`);
  }
}

function commonOptions(options: ReadonlyMap<string, string>): {
  db: string;
  ledger: string;
  configPath: string;
  config: AuthorityConfig;
} {
  const db = requireOption(options, 'db');
  const ledger = requireOption(options, 'ledger');
  const configPath = requireOption(options, 'config');
  if (resolve(db) === resolve(ledger)) fail('Database and metadata ledger paths must be distinct.');
  return { db, ledger, configPath, config: readAuthority(configPath) };
}

function parseOptions(args: readonly string[]): { command: string; options: Map<string, string> } {
  const command = args[0];
  if (!command || command.startsWith('--')) fail('A Gate 1 runner command is required.');
  const options = new Map<string, string>();
  for (let index = 1; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith('--') || key.length < 3 || value === undefined || value.startsWith('--')) {
      fail('Options must be explicit --name value pairs.');
    }
    const name = key.slice(2);
    if (options.has(name)) fail(`Duplicate option: --${name}`);
    options.set(name, value);
  }
  return { command, options };
}

function requireOption(options: ReadonlyMap<string, string>, name: string): string {
  const value = options.get(name);
  if (!value) fail(`Missing required option: --${name}`);
  return value;
}

function optionalOption(options: ReadonlyMap<string, string>, name: string): string | undefined {
  return options.get(name);
}

function exactOptions(options: ReadonlyMap<string, string>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  for (const key of options.keys()) {
    if (!allowedSet.has(key)) fail(`Unsupported option for this command: --${key}`);
  }
}

function positiveRevision(value: string): number {
  return z.coerce.number().int().min(1).max(1_000_000).parse(value);
}

function artifactMetadata(bytes: Uint8Array): {
  schemaVersion: string;
  schemaMinorVersion: number;
  siteOneVersion: string | null;
  siteOneExecutedAt: string | null;
  lighthouseVersion: string;
  lighthouseFetchTime: string | null;
  lighthouseUserAgent: string | null;
} {
  const decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)) as Record<string, unknown>;
  const sources = decoded['sources'] as Record<string, unknown>;
  const siteone = sources['siteone'] as Record<string, unknown>;
  const lighthouse = sources['lighthouse'] as Record<string, unknown>;
  return {
    schemaVersion: String(decoded['schemaVersion']),
    schemaMinorVersion: Number(decoded['schemaMinorVersion']),
    siteOneVersion: siteone['version'] === null ? null : String(siteone['version']),
    siteOneExecutedAt: siteone['executedAt'] === null ? null : String(siteone['executedAt']),
    lighthouseVersion: String(lighthouse['version']),
    lighthouseFetchTime: lighthouse['fetchTime'] === null ? null : String(lighthouse['fetchTime']),
    lighthouseUserAgent: lighthouse['userAgent'] === null ? null : String(lighthouse['userAgent']),
  };
}

function requireArtifactMetadata(actual: ReturnType<typeof artifactMetadata>, expected: ImportMetadata): void {
  if (actual.schemaVersion !== expected.schemaVersion || actual.schemaMinorVersion !== expected.schemaMinorVersion) {
    fail('Operator-supplied WQT schema metadata differs from the normalized artifact.');
  }
  if (actual.siteOneVersion !== expected.siteOneVersion) {
    fail('Operator-supplied SiteOne version differs from the normalized artifact.');
  }
  if (actual.lighthouseVersion !== expected.lighthouseVersion) {
    fail('Operator-supplied Lighthouse version differs from the normalized artifact.');
  }
}

function output(io: Gate1RunnerIo, value: unknown): void {
  io.stdout(JSON.stringify(value, null, 2));
}

function recommendationSummary(record: Awaited<ReturnType<typeof createHumanRecommendation>>) {
  return {
    id: record.id,
    revision: record.revision,
    lifecycle: record.lifecycle,
    evidence: record.evidence.map((item) => ({ kind: item.kind, id: item.id })),
    updatedAt: record.updatedAt,
  };
}

async function initCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config']);
  const { db, ledger, config } = commonOptions(options);
  ensureParentExists(db);
  ensureParentExists(ledger);
  if (existsSync(db)) fail(`Refusing to overwrite an existing Gate 1 database: ${db}`);
  if (existsSync(ledger)) fail(`Refusing to overwrite an existing Gate 1 metadata ledger: ${ledger}`);

  const context = authority(config);
  const evidence = new LocalEvidenceRepository(db);
  let initialized = false;
  try {
    await evidence.createTenant(context);
    await evidence.createSite(context, { id: config.scope.siteId, label: config.siteLabel });
    await evidence.createScope(context, config.scope);
    await evidence.createConnection(context, {
      id: config.providerConnectionIds.siteone,
      scope: config.scope,
      providerId: 'siteone',
    });
    await evidence.createConnection(context, {
      id: config.providerConnectionIds.lighthouse,
      scope: config.scope,
      providerId: 'lighthouse',
    });
    writeLedger(ledger, { format: LEDGER_FORMAT, authority: config, imports: [] }, true);
    initialized = true;
  } finally {
    evidence.close();
    if (!initialized) {
      for (const path of [db, `${db}-shm`, `${db}-wal`, ledger]) rmSync(path, { force: true });
    }
  }
  output(io, { command: 'init', initialized: true, db, ledger, scope: config.scope });
}

async function importCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config', 'artifact', 'metadata']);
  const { db, ledger, config } = commonOptions(options);
  const artifactPath = requireOption(options, 'artifact');
  const metadataPath = requireOption(options, 'metadata');
  if (!existsSync(db) || !existsSync(ledger)) fail('Gate 1 database and metadata ledger must be initialized before import.');
  const ledgerValue = readLedger(ledger);
  requireLedgerAuthority(ledgerValue, config);
  const metadata = readImportMetadata(metadataPath);
  const bytes = readBounded(artifactPath, MAX_WQT_NORMALIZED_BYTES);
  const adapted = adaptWqtNormalizedEvidence(bytes, {
    scope: config.scope,
    expectedSiteId: config.expectedWqtSiteId,
    expectedTargetOrigin: config.expectedTargetOrigin,
    providerConnectionIds: config.providerConnectionIds,
    timing: metadata.timing,
    availability: metadata.availability,
  } satisfies WqtAdapterConfig);
  if (adapted.inputSha256 !== metadata.normalizedSha256) {
    fail('Operator-supplied normalized WQT SHA-256 does not match the exact artifact bytes.');
  }
  const actual = artifactMetadata(bytes);
  requireArtifactMetadata(actual, metadata);

  const existing = ledgerValue.imports.find((item) => item.normalizedSha256 === metadata.normalizedSha256);
  const context = authority(config);
  const evidence = new LocalEvidenceRepository(db);
  try {
    const tenant = await evidence.getTenant(context);
    const site = await evidence.getSite(context, config.scope.siteId);
    if (tenant === null || site === null) fail('Gate 1 database bootstrap records are missing.');

    const collections: ImportLedger['collections'] = [];
    for (const stream of adapted.collections) {
      for (const batch of stream.batches) await evidence.persistCollection(context, batch);
      const snapshot = await evidence.getCollectionSnapshot(context, stream.collectionId);
      if (snapshot === null || !snapshot.progress.complete) fail('Adapted WQT collection did not persist completely.');
      collections.push({
        providerId: stream.providerId,
        collectionId: stream.collectionId,
        sourceStart: snapshot.collection.sourceTime.start,
        sourceEnd: snapshot.collection.sourceTime.end,
        persistedSources: snapshot.progress.persistedSources,
        observationCount: snapshot.observations.length,
      });
    }

    const record: ImportLedger = {
      wqtCommitSha: metadata.wqtCommitSha,
      actionsRunId: metadata.actionsRunId,
      artifactName: metadata.artifactName,
      ...(metadata.artifactArchiveSha256 === undefined ? {} : { artifactArchiveSha256: metadata.artifactArchiveSha256 }),
      normalizedFileIdentity: metadata.normalizedFileIdentity,
      normalizedSha256: metadata.normalizedSha256,
      schemaVersion: metadata.schemaVersion,
      schemaMinorVersion: metadata.schemaMinorVersion,
      siteOneVersion: metadata.siteOneVersion,
      siteOneExecutedAt: actual.siteOneExecutedAt,
      lighthouseVersion: metadata.lighthouseVersion,
      lighthouseFetchTime: actual.lighthouseFetchTime,
      lighthouseUserAgent: actual.lighthouseUserAgent,
      trustedTiming: metadata.timing,
      availability: metadata.availability,
      collections,
    };
    importLedgerSchema.parse(record);

    if (existing !== undefined) {
      if (!same(existing, record)) fail('An existing normalized artifact digest has different Gate 1 metadata or collection identity.');
      output(io, { command: 'import-wqt', replayed: true, normalizedSha256: record.normalizedSha256, collections });
      return;
    }
    const collectionIds = new Set(ledgerValue.imports.flatMap((item) => item.collections.map((entry) => entry.collectionId)));
    if (record.collections.some((item) => collectionIds.has(item.collectionId))) {
      fail('A new artifact import unexpectedly resolves to an already-recorded collection identity.');
    }
    writeLedger(ledger, { ...ledgerValue, imports: [...ledgerValue.imports, record] });
    output(io, { command: 'import-wqt', replayed: false, normalizedSha256: record.normalizedSha256, collections });
  } finally {
    evidence.close();
  }
}

async function listCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config']);
  const { db, ledger, config } = commonOptions(options);
  const ledgerValue = readLedger(ledger);
  requireLedgerAuthority(ledgerValue, config);
  const context = authority(config);
  const evidence = new LocalEvidenceRepository(db);
  try {
    const imports = [];
    for (const item of ledgerValue.imports) {
      const collections = [];
      for (const entry of item.collections) {
        const record = await evidence.getCollection(context, entry.collectionId);
        const progress = await evidence.getCollectionProgress(context, entry.collectionId);
        if (record === null || progress === null) fail('Metadata ledger references a missing persisted collection.');
        collections.push({
          providerId: entry.providerId,
          collectionId: entry.collectionId,
          sourceTime: record.sourceTime,
          complete: progress.complete,
          persistedSources: progress.persistedSources,
          parts: progress.parts,
          partsPersisted: progress.partsPersisted,
          observationCount: entry.observationCount,
        });
      }
      imports.push({
        wqtCommitSha: item.wqtCommitSha,
        actionsRunId: item.actionsRunId,
        artifactName: item.artifactName,
        normalizedFileIdentity: item.normalizedFileIdentity,
        normalizedSha256: item.normalizedSha256,
        schemaVersion: item.schemaVersion,
        schemaMinorVersion: item.schemaMinorVersion,
        siteOneVersion: item.siteOneVersion,
        lighthouseVersion: item.lighthouseVersion,
        siteOneExecutedAt: item.siteOneExecutedAt,
        lighthouseFetchTime: item.lighthouseFetchTime,
        trustedTiming: item.trustedTiming,
        collections,
      });
    }
    output(io, { command: 'list', scope: config.scope, imports });
  } finally {
    evidence.close();
  }
}

async function compareCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config', 'baseline', 'current']);
  const { db, ledger, config } = commonOptions(options);
  requireLedgerAuthority(readLedger(ledger), config);
  const baselineCollectionId = requireOption(options, 'baseline');
  const currentCollectionId = requireOption(options, 'current');
  const context = authority(config);
  const evidence = new LocalEvidenceRepository(db);
  try {
    const report = await diffEvidenceCollections(evidence, context, { baselineCollectionId, currentCollectionId });
    output(io, {
      command: 'compare',
      collectionPair: report.collectionPair,
      summary: report.summary,
      attention: report.entries.filter((entry) => entry.state !== 'unchanged'),
    });
  } finally {
    evidence.close();
  }
}

async function createRecommendationCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config', 'input']);
  const { db, ledger, config } = commonOptions(options);
  requireLedgerAuthority(readLedger(ledger), config);
  const input = readJson(requireOption(options, 'input'));
  const context = authority(config);
  const evidence = new LocalEvidenceRepository(db);
  const review = new LocalReviewLedgerRepository(db);
  try {
    const record = await createHumanRecommendation(review, evidence, context, { recommendation: input });
    output(io, { command: 'recommend-create', recommendation: recommendationSummary(record) });
  } finally {
    review.close();
    evidence.close();
  }
}

async function reviseRecommendationCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config', 'input', 'expected-revision']);
  const { db, ledger, config } = commonOptions(options);
  requireLedgerAuthority(readLedger(ledger), config);
  const input = readJson(requireOption(options, 'input'));
  const expectedCurrentRevision = positiveRevision(requireOption(options, 'expected-revision'));
  const context = authority(config);
  const evidence = new LocalEvidenceRepository(db);
  const review = new LocalReviewLedgerRepository(db);
  try {
    const record = await reviseHumanRecommendation(review, evidence, context, {
      scope: config.scope,
      expectedCurrentRevision,
      recommendation: input,
    });
    output(io, { command: 'recommend-revise', recommendation: recommendationSummary(record) });
  } finally {
    review.close();
    evidence.close();
  }
}

async function transitionRecommendationCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config', 'recommendation', 'expected-revision', 'lifecycle', 'updated-at']);
  const { db, ledger, config } = commonOptions(options);
  requireLedgerAuthority(readLedger(ledger), config);
  const expectedCurrentRevision = positiveRevision(requireOption(options, 'expected-revision'));
  const lifecycle = z.enum(['in_review', 'accepted', 'rejected', 'superseded']).parse(requireOption(options, 'lifecycle'));
  const updatedAt = timestamp.parse(requireOption(options, 'updated-at'));
  const context = authority(config);
  const evidence = new LocalEvidenceRepository(db);
  const review = new LocalReviewLedgerRepository(db);
  try {
    const record = await transitionHumanRecommendation(review, evidence, context, {
      scope: config.scope,
      id: requireOption(options, 'recommendation'),
      expectedCurrentRevision,
      lifecycle,
      updatedAt,
    });
    output(io, { command: 'recommend-transition', recommendation: recommendationSummary(record) });
  } finally {
    review.close();
    evidence.close();
  }
}

async function measureCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config', 'input', 'cohort-observation', 'recommendation']);
  const { db, ledger, config } = commonOptions(options);
  requireLedgerAuthority(readLedger(ledger), config);
  const context = authority(config);
  const evidence = new LocalEvidenceRepository(db);
  const review = new LocalReviewLedgerRepository(db);
  try {
    const record = await recordMeasurement(review, evidence, context, {
      measurement: readJson(requireOption(options, 'input')),
      cohortObservationId: requireOption(options, 'cohort-observation'),
      recommendationId: requireOption(options, 'recommendation'),
    });
    output(io, {
      command: 'measure',
      measurement: {
        id: record.id,
        relationship: record.relationship,
        resultState: record.result.state,
        createdAt: record.createdAt,
      },
    });
  } finally {
    review.close();
    evidence.close();
  }
}

async function outcomeCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config', 'input']);
  const { db, ledger, config } = commonOptions(options);
  requireLedgerAuthority(readLedger(ledger), config);
  const context = authority(config);
  const review = new LocalReviewLedgerRepository(db);
  try {
    const record = await recordHumanOutcome(review, context, { outcome: readJson(requireOption(options, 'input')) });
    output(io, {
      command: 'outcome',
      outcome: {
        id: record.id,
        recommendationId: record.recommendationId,
        direction: record.assessment.direction,
        createdAt: record.createdAt,
      },
    });
  } finally {
    review.close();
  }
}

async function reviewShowCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config', 'recommendation']);
  const { db, ledger, config } = commonOptions(options);
  requireLedgerAuthority(readLedger(ledger), config);
  const recommendationId = requireOption(options, 'recommendation');
  const context = authority(config);
  const review = new LocalReviewLedgerRepository(db);
  try {
    const history = await review.listRecommendationHistory(context, config.scope, recommendationId);
    const measurements = await review.listMeasurements(context, { scope: config.scope, recommendationId });
    const outcomes = await review.listOutcomes(context, { scope: config.scope, recommendationId });
    output(io, {
      command: 'review-show',
      recommendationId,
      history: history.map(recommendationSummary),
      measurements: measurements.map((item) => ({
        id: item.record.id,
        relationship: item.record.relationship,
        resultState: item.record.result.state,
        createdAt: item.record.createdAt,
      })),
      outcomes: outcomes.map((item) => ({
        id: item.id,
        direction: item.assessment.direction,
        createdAt: item.createdAt,
      })),
    });
  } finally {
    review.close();
  }
}

async function renderCaseCommand(options: ReadonlyMap<string, string>, io: Gate1RunnerIo): Promise<void> {
  exactOptions(options, ['db', 'ledger', 'config', 'baseline', 'current', 'recommendation', 'output']);
  const { db, ledger, config } = commonOptions(options);
  requireLedgerAuthority(readLedger(ledger), config);
  const outputPath = requireOption(options, 'output');
  ensureParentExists(outputPath);
  if (existsSync(outputPath)) fail(`Refusing to overwrite an existing report: ${outputPath}`);
  const context = authority(config);
  const evidence = new LocalEvidenceRepository(db);
  const review = new LocalReviewLedgerRepository(db);
  try {
    const view = await assembleOperatorCaseView(evidence, review, context, {
      scope: config.scope,
      baselineCollectionId: requireOption(options, 'baseline'),
      currentCollectionId: requireOption(options, 'current'),
      selectedRecommendationId: requireOption(options, 'recommendation'),
    });
    const html = renderOperatorCaseHtml(buildOperatorCasePresentation(view));
    writeFileSync(outputPath, html, { encoding: 'utf8', flag: 'wx' });
    output(io, {
      command: 'render-case',
      output: outputPath,
      bytes: Buffer.byteLength(html, 'utf8'),
      summary: view.evidenceDiff.summary,
      selectedRecommendationId: view.selectedRecommendation.current.id,
    });
  } finally {
    review.close();
    evidence.close();
  }
}

export async function runGate1Runner(args: readonly string[], io: Gate1RunnerIo = defaultIo): Promise<void> {
  const { command, options } = parseOptions(args);
  switch (command) {
    case 'init': return initCommand(options, io);
    case 'import-wqt': return importCommand(options, io);
    case 'list': return listCommand(options, io);
    case 'compare': return compareCommand(options, io);
    case 'recommend-create': return createRecommendationCommand(options, io);
    case 'recommend-revise': return reviseRecommendationCommand(options, io);
    case 'recommend-transition': return transitionRecommendationCommand(options, io);
    case 'measure': return measureCommand(options, io);
    case 'outcome': return outcomeCommand(options, io);
    case 'review-show': return reviewShowCommand(options, io);
    case 'render-case': return renderCaseCommand(options, io);
    default: fail(`Unsupported Gate 1 runner command: ${command}`);
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  runGate1Runner(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown Gate 1 runner failure.';
    defaultIo.stderr(`Gate 1 runner failed: ${message}`);
    process.exitCode = 1;
  });
}
