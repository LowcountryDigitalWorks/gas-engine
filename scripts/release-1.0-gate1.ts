import {
  appendFileSync,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import {
  adaptWqtNormalizedEvidence,
  type WqtAdapterConfig,
  type WqtProviderId,
} from '../src/adapters/wqt.js';
import { availability, identifier, scope, timestamp } from '../src/contracts/primitives.js';
import type { Contract } from '../src/contracts/wire.js';
import { canonicalJson } from '../src/lib/canonical-json.js';
import {
  authenticatedAuthority,
  issueAuthenticatedPrincipal,
} from '../src/authentication/principal.js';
import type { Scope } from '../src/persistence/repository.js';
import { LocalEvidenceRepository } from '../src/persistence/sqlite.js';
import type { TenantContext } from '../src/persistence/tenant-context.js';
import {
  assembleOperatorCaseView,
} from '../src/operator/case-view.js';
import {
  buildOperatorCasePresentation,
  renderOperatorCaseHtml,
} from '../src/operator/html.js';
import { LocalReviewLedgerRepository } from '../src/review/sqlite.js';
import {
  createHumanRecommendation,
  recordHumanOutcome,
  recordMeasurement,
  reviseHumanRecommendation,
  transitionHumanRecommendation,
} from '../src/review/service.js';

const MAX_CONTROL_FILE_BYTES = 1_048_576;
const MAX_LEDGER_BYTES = 262_144;
const MAX_LEDGER_IMPORTS = 16;
const LEDGER_SCHEMA_VERSION = 'ldw.gas.release1-gate1-proof-ledger.v1' as const;
const WORKSPACE_SCHEMA_VERSION = 'ldw.gas.release1-gate1-workspace.v1' as const;
const IMPORT_SCHEMA_VERSION = 'ldw.gas.release1-gate1-import.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const gitSha = z.string().regex(/^[a-f0-9]{40}$/);
const positiveDecimal = z.string().regex(/^[1-9][0-9]*$/);
const boundedText = z.string().min(1).max(16_384).regex(/\S/);

const workspaceSchema = z.strictObject({
  schemaVersion: z.literal(WORKSPACE_SCHEMA_VERSION),
  principalId: identifier,
  siteLabel: z.string().min(1).max(256).regex(/\S/),
  scope,
  expectedWqtSiteId: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  expectedTargetOrigin: boundedText,
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
  schemaVersion: z.literal(IMPORT_SCHEMA_VERSION),
  wqtCommitSha: gitSha,
  actionsRunId: positiveDecimal,
  artifactName: z.string().min(1).max(256).regex(/\S/),
  artifactId: positiveDecimal.optional(),
  artifactArchiveDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  artifactExpiresAt: timestamp.optional(),
  expectedNormalizedSha256: sha256,
  expectedNormalizedBytes: z.number().int().positive().max(1_048_576).optional(),
  timing: timingSchema,
  availability: z.strictObject({
    siteone: availability,
    lighthouse: availability,
  }),
});

const artifactMetadataSchema = z.object({
  schemaVersion: z.string().min(1),
  schemaMinorVersion: z.number().int().nonnegative(),
  siteId: z.string().min(1),
  target: z.string().min(1),
  sources: z.object({
    siteone: z.object({
      tool: z.string().min(1),
      version: z.string().min(1).nullable(),
      executedAt: z.string().nullable(),
    }),
    lighthouse: z.object({
      tool: z.string().min(1),
      version: z.string().min(1),
      fetchTime: z.string().nullable(),
      userAgent: z.string().nullable(),
    }),
  }),
});

const ledgerCollectionSchema = z.strictObject({
  providerId: z.enum(['siteone', 'lighthouse']),
  collectionId: identifier,
  parts: z.number().int().min(1).max(64),
  receivedCount: z.number().int().min(0).max(1_024),
  sourceTime: z.strictObject({ start: timestamp, end: timestamp }),
  collectedAt: timestamp,
});

const ledgerImportSchema = z.strictObject({
  kind: z.literal('import'),
  wqtCommitSha: gitSha,
  actionsRunId: positiveDecimal,
  artifactName: z.string().min(1).max(256).regex(/\S/),
  artifactId: positiveDecimal.optional(),
  artifactArchiveDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
  artifactExpiresAt: timestamp.optional(),
  normalizedSha256: sha256,
  normalizedBytes: z.number().int().positive().max(1_048_576),
  normalizedSchemaVersion: z.string().min(1).max(128),
  normalizedSchemaMinorVersion: z.number().int().nonnegative(),
  siteId: z.string().min(1).max(64),
  target: boundedText,
  sourceVersions: z.strictObject({
    siteone: z.string().min(1).nullable(),
    lighthouse: z.string().min(1),
    lighthouseUserAgent: z.string().nullable(),
  }),
  timing: timingSchema,
  availability: z.strictObject({
    siteone: availability,
    lighthouse: availability,
  }),
  collections: z.array(ledgerCollectionSchema).length(2),
});

const ledgerHeaderSchema = z.strictObject({
  kind: z.literal('workspace'),
  schemaVersion: z.literal(LEDGER_SCHEMA_VERSION),
  workspace: workspaceSchema,
});

const reviewOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('create_recommendation'), input: z.unknown() }),
  z.strictObject({ operation: z.literal('revise_recommendation'), input: z.unknown() }),
  z.strictObject({ operation: z.literal('transition_recommendation'), input: z.unknown() }),
  z.strictObject({ operation: z.literal('record_measurement'), input: z.unknown() }),
  z.strictObject({ operation: z.literal('record_outcome'), input: z.unknown() }),
]);

export type Gate1Workspace = z.infer<typeof workspaceSchema>;
export type Gate1ImportMetadata = z.infer<typeof importMetadataSchema>;
export type Gate1LedgerImport = z.infer<typeof ledgerImportSchema>;
export type Gate1ReviewOperation = z.infer<typeof reviewOperationSchema>;

interface ProofLedger {
  readonly header: z.infer<typeof ledgerHeaderSchema>;
  readonly imports: readonly Gate1LedgerImport[];
}

interface ImportSummary {
  readonly replayed: boolean;
  readonly inputSha256: string;
  readonly collections: readonly {
    readonly providerId: WqtProviderId;
    readonly collectionId: string;
    readonly parts: number;
    readonly receivedCount: number;
    readonly complete: boolean;
    readonly replayedParts: number;
  }[];
}

function fail(message: string): never {
  throw new Error(message);
}

function canonicalHttpsOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail('Trusted expected WQT target must be a canonical HTTPS origin.');
  }
  if (parsed.protocol !== 'https:' || parsed.origin !== value) {
    fail('Trusted expected WQT target must be an exact canonical HTTPS origin.');
  }
  return value;
}

function readBoundedFile(pathInput: string, maxBytes: number, label: string): Buffer {
  const path = resolve(pathInput);
  if (!existsSync(path)) fail(`${label} does not exist: ${path}`);
  const stat = statSync(path);
  if (!stat.isFile()) fail(`${label} is not a regular file: ${path}`);
  if (stat.size > maxBytes) fail(`${label} exceeds ${maxBytes} bytes.`);
  return readFileSync(path);
}

function readJsonFile<T>(pathInput: string, schema: z.ZodType<T>, label: string): T {
  const bytes = readBoundedFile(pathInput, MAX_CONTROL_FILE_BYTES, label);
  let decoded: unknown;
  try {
    decoded = JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    fail(`${label} is not valid JSON.`);
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) fail(`${label} does not match the required Gate 1 shape.`);
  return parsed.data;
}

export function readGate1Workspace(pathInput: string): Gate1Workspace {
  const workspace = readJsonFile(pathInput, workspaceSchema, 'Gate 1 workspace configuration');
  canonicalHttpsOrigin(workspace.expectedTargetOrigin);
  if (workspace.scope.tenantId.length === 0) fail('Gate 1 workspace tenant is required.');
  return workspace;
}

function authorityFor(workspace: Gate1Workspace): TenantContext {
  const principal = issueAuthenticatedPrincipal({
    principalId: workspace.principalId,
    tenantId: workspace.scope.tenantId,
    grants: [
      {
        scope: workspace.scope,
        providerId: 'siteone',
        providerConnectionId: workspace.providerConnectionIds.siteone,
      },
      {
        scope: workspace.scope,
        providerId: 'lighthouse',
        providerConnectionId: workspace.providerConnectionIds.lighthouse,
      },
    ],
  });
  const authority = authenticatedAuthority(principal);
  if (authority === null) fail('Trusted Gate 1 principal authority was not issued.');
  return authority.context;
}

function requireParent(pathInput: string, label: string): string {
  const path = resolve(pathInput);
  const parent = dirname(path);
  if (!existsSync(parent) || !statSync(parent).isDirectory()) {
    fail(`${label} parent directory does not exist: ${parent}`);
  }
  return path;
}

function requireExistingDatabase(pathInput: string): string {
  const path = resolve(pathInput);
  if (!existsSync(path) || !statSync(path).isFile()) {
    fail(`Gate 1 SQLite database does not exist: ${path}`);
  }
  return path;
}

function readProofLedger(pathInput: string): ProofLedger {
  const bytes = readBoundedFile(pathInput, MAX_LEDGER_BYTES, 'Gate 1 proof ledger');
  const lines = bytes.toString('utf8').split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) fail('Gate 1 proof ledger is empty.');
  let headerValue: unknown;
  try {
    headerValue = JSON.parse(lines[0]!) as unknown;
  } catch {
    fail('Gate 1 proof ledger header is invalid JSON.');
  }
  const header = ledgerHeaderSchema.safeParse(headerValue);
  if (!header.success) fail('Gate 1 proof ledger header is invalid.');
  const imports: Gate1LedgerImport[] = [];
  for (const line of lines.slice(1)) {
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      fail('Gate 1 proof ledger contains invalid JSON.');
    }
    const parsed = ledgerImportSchema.safeParse(value);
    if (!parsed.success) fail('Gate 1 proof ledger contains an invalid import record.');
    imports.push(parsed.data);
  }
  if (imports.length > MAX_LEDGER_IMPORTS) fail(`Gate 1 proof ledger exceeds ${MAX_LEDGER_IMPORTS} imports.`);
  return { header: header.data, imports };
}

function requireLedgerWorkspace(ledger: ProofLedger, workspace: Gate1Workspace): void {
  if (canonicalJson(ledger.header.workspace) !== canonicalJson(workspace)) {
    fail('Gate 1 proof ledger workspace differs from the explicit trusted workspace configuration.');
  }
}

function appendLedgerImport(pathInput: string, ledger: ProofLedger, record: Gate1LedgerImport): boolean {
  const exact = ledger.imports.find((entry) =>
    entry.actionsRunId === record.actionsRunId && entry.artifactName === record.artifactName);
  if (exact !== undefined) {
    if (canonicalJson(exact) !== canonicalJson(record)) {
      fail('Gate 1 proof ledger already contains this WQT run/artifact identity with different metadata.');
    }
    return false;
  }
  if (ledger.imports.length >= MAX_LEDGER_IMPORTS) fail(`Gate 1 proof ledger is bounded to ${MAX_LEDGER_IMPORTS} imports.`);
  appendFileSync(resolve(pathInput), `${JSON.stringify(record)}\n`, { encoding: 'utf8' });
  return true;
}

export async function setupGate1Workspace(input: {
  readonly dbPath: string;
  readonly ledgerPath: string;
  readonly workspacePath: string;
}): Promise<{ readonly database: string; readonly ledger: string; readonly scope: Scope }> {
  const dbPath = requireParent(input.dbPath, 'Gate 1 database');
  const ledgerPath = requireParent(input.ledgerPath, 'Gate 1 proof ledger');
  if (dbPath === ledgerPath) fail('Gate 1 database and proof ledger paths must be distinct.');
  for (const candidate of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, ledgerPath]) {
    if (existsSync(candidate)) fail(`Gate 1 setup refuses to overwrite existing local state: ${candidate}`);
  }
  const workspace = readGate1Workspace(input.workspacePath);
  const context = authorityFor(workspace);
  const evidence = new LocalEvidenceRepository(dbPath);
  try {
    await evidence.createTenant(context);
    await evidence.createSite(context, { id: workspace.scope.siteId, label: workspace.siteLabel });
    await evidence.createScope(context, workspace.scope);
    await evidence.createConnection(context, {
      id: workspace.providerConnectionIds.siteone,
      scope: workspace.scope,
      providerId: 'siteone',
    });
    await evidence.createConnection(context, {
      id: workspace.providerConnectionIds.lighthouse,
      scope: workspace.scope,
      providerId: 'lighthouse',
    });
  } finally {
    evidence.close();
  }
  const header = ledgerHeaderSchema.parse({
    kind: 'workspace',
    schemaVersion: LEDGER_SCHEMA_VERSION,
    workspace,
  });
  writeFileSync(ledgerPath, `${JSON.stringify(header)}\n`, { encoding: 'utf8', flag: 'wx' });
  return { database: dbPath, ledger: ledgerPath, scope: workspace.scope };
}

export async function importGate1WqtArtifact(input: {
  readonly dbPath: string;
  readonly ledgerPath: string;
  readonly workspacePath: string;
  readonly artifactPath: string;
  readonly metadataPath: string;
}): Promise<ImportSummary> {
  const dbPath = requireExistingDatabase(input.dbPath);
  const workspace = readGate1Workspace(input.workspacePath);
  const context = authorityFor(workspace);
  const ledger = readProofLedger(input.ledgerPath);
  requireLedgerWorkspace(ledger, workspace);
  const metadata = readJsonFile(input.metadataPath, importMetadataSchema, 'Gate 1 WQT import metadata');
  const artifactBytes = readBoundedFile(input.artifactPath, 1_048_576, 'Normalized WQT artifact');

  const adapterConfig: WqtAdapterConfig = {
    scope: workspace.scope,
    expectedSiteId: workspace.expectedWqtSiteId,
    expectedTargetOrigin: workspace.expectedTargetOrigin,
    providerConnectionIds: workspace.providerConnectionIds,
    timing: metadata.timing,
    availability: metadata.availability,
  };
  const adapted = adaptWqtNormalizedEvidence(artifactBytes, adapterConfig);
  if (adapted.inputSha256 !== metadata.expectedNormalizedSha256) {
    fail('Normalized WQT SHA-256 differs from the explicit expected digest.');
  }
  if (metadata.expectedNormalizedBytes !== undefined && artifactBytes.byteLength !== metadata.expectedNormalizedBytes) {
    fail('Normalized WQT byte length differs from the explicit expected byte length.');
  }

  let sourceMetadataValue: unknown;
  try {
    sourceMetadataValue = JSON.parse(artifactBytes.toString('utf8')) as unknown;
  } catch {
    fail('Normalized WQT artifact could not be decoded for Gate 1 metadata recording.');
  }
  const sourceMetadata = artifactMetadataSchema.parse(sourceMetadataValue);

  const evidence = new LocalEvidenceRepository(dbPath);
  const summaries: Array<ImportSummary['collections'][number]> = [];
  try {
    for (const collection of adapted.collections) {
      let replayedParts = 0;
      for (const batch of collection.batches) {
        const result = await evidence.persistCollection(context, batch);
        if (result.replayed) replayedParts += 1;
      }
      const progress = await evidence.getCollectionProgress(context, collection.collectionId);
      if (progress === null || !progress.complete) {
        fail(`Persisted WQT collection is incomplete: ${collection.collectionId}`);
      }
      const record = await evidence.getCollection(context, collection.collectionId);
      if (record === null) fail(`Persisted WQT collection cannot be re-read: ${collection.collectionId}`);
      summaries.push({
        providerId: collection.providerId,
        collectionId: collection.collectionId,
        parts: collection.batches.length,
        receivedCount: record.completeness.receivedCount,
        complete: progress.complete,
        replayedParts,
      });
    }
  } finally {
    evidence.close();
  }

  const ledgerRecord = ledgerImportSchema.parse({
    kind: 'import',
    wqtCommitSha: metadata.wqtCommitSha,
    actionsRunId: metadata.actionsRunId,
    artifactName: metadata.artifactName,
    ...(metadata.artifactId === undefined ? {} : { artifactId: metadata.artifactId }),
    ...(metadata.artifactArchiveDigest === undefined ? {} : { artifactArchiveDigest: metadata.artifactArchiveDigest }),
    ...(metadata.artifactExpiresAt === undefined ? {} : { artifactExpiresAt: metadata.artifactExpiresAt }),
    normalizedSha256: adapted.inputSha256,
    normalizedBytes: artifactBytes.byteLength,
    normalizedSchemaVersion: sourceMetadata.schemaVersion,
    normalizedSchemaMinorVersion: sourceMetadata.schemaMinorVersion,
    siteId: sourceMetadata.siteId,
    target: sourceMetadata.target,
    sourceVersions: {
      siteone: sourceMetadata.sources.siteone.version,
      lighthouse: sourceMetadata.sources.lighthouse.version,
      lighthouseUserAgent: sourceMetadata.sources.lighthouse.userAgent,
    },
    timing: metadata.timing,
    availability: metadata.availability,
    collections: adapted.collections.map((collection) => ({
      providerId: collection.providerId,
      collectionId: collection.collectionId,
      parts: collection.batches.length,
      receivedCount: collection.batches[0]!.collection.completeness.receivedCount,
      sourceTime: collection.batches[0]!.collection.sourceTime,
      collectedAt: collection.batches[0]!.collection.collectedAt,
    })),
  });
  const appended = appendLedgerImport(input.ledgerPath, ledger, ledgerRecord);
  return {
    replayed: !appended,
    inputSha256: adapted.inputSha256,
    collections: summaries,
  };
}

export async function listGate1Imports(input: {
  readonly dbPath: string;
  readonly ledgerPath: string;
  readonly workspacePath: string;
}): Promise<readonly unknown[]> {
  const dbPath = requireExistingDatabase(input.dbPath);
  const workspace = readGate1Workspace(input.workspacePath);
  const context = authorityFor(workspace);
  const ledger = readProofLedger(input.ledgerPath);
  requireLedgerWorkspace(ledger, workspace);
  const evidence = new LocalEvidenceRepository(dbPath);
  try {
    const output: unknown[] = [];
    for (const entry of ledger.imports) {
      const collections = [];
      for (const recorded of entry.collections) {
        const collection = await evidence.getCollection(context, recorded.collectionId);
        const progress = await evidence.getCollectionProgress(context, recorded.collectionId);
        if (collection === null || progress === null) {
          fail(`Gate 1 proof ledger references a missing collection: ${recorded.collectionId}`);
        }
        if (collection.providerId !== recorded.providerId
          || canonicalJson(collection.scope) !== canonicalJson(workspace.scope)
          || canonicalJson(collection.sourceTime) !== canonicalJson(recorded.sourceTime)
          || collection.collectedAt !== recorded.collectedAt) {
          fail(`Gate 1 proof ledger collection metadata differs from persisted state: ${recorded.collectionId}`);
        }
        collections.push({
          providerId: recorded.providerId,
          collectionId: recorded.collectionId,
          complete: progress.complete,
          receivedCount: progress.receivedCount,
          persistedSources: progress.persistedSources,
          parts: progress.parts,
          partsPersisted: progress.partsPersisted,
          sourceTime: recorded.sourceTime,
          collectedAt: recorded.collectedAt,
        });
      }
      output.push({
        wqtCommitSha: entry.wqtCommitSha,
        actionsRunId: entry.actionsRunId,
        artifactName: entry.artifactName,
        ...(entry.artifactId === undefined ? {} : { artifactId: entry.artifactId }),
        normalizedSha256: entry.normalizedSha256,
        normalizedBytes: entry.normalizedBytes,
        schema: `${entry.normalizedSchemaVersion} minor ${entry.normalizedSchemaMinorVersion}`,
        sourceVersions: entry.sourceVersions,
        timing: entry.timing,
        collections,
      });
    }
    return output;
  } finally {
    evidence.close();
  }
}

export async function runGate1ReviewOperation(input: {
  readonly dbPath: string;
  readonly workspacePath: string;
  readonly requestPath: string;
}): Promise<unknown> {
  const dbPath = requireExistingDatabase(input.dbPath);
  const workspace = readGate1Workspace(input.workspacePath);
  const context = authorityFor(workspace);
  const operation = readJsonFile(input.requestPath, reviewOperationSchema, 'Gate 1 review operation');
  const evidence = new LocalEvidenceRepository(dbPath);
  const review = new LocalReviewLedgerRepository(dbPath);
  try {
    switch (operation.operation) {
      case 'create_recommendation': {
        const record = await createHumanRecommendation(review, evidence, context, operation.input);
        return { kind: record.kind, id: record.id, revision: record.revision, lifecycle: record.lifecycle };
      }
      case 'revise_recommendation': {
        const record = await reviseHumanRecommendation(review, evidence, context, operation.input);
        return { kind: record.kind, id: record.id, revision: record.revision, lifecycle: record.lifecycle };
      }
      case 'transition_recommendation': {
        const record = await transitionHumanRecommendation(review, evidence, context, operation.input);
        return { kind: record.kind, id: record.id, revision: record.revision, lifecycle: record.lifecycle };
      }
      case 'record_measurement': {
        const record = await recordMeasurement(review, evidence, context, operation.input);
        return {
          kind: record.kind,
          id: record.id,
          relationship: record.relationship.role,
          result: record.result.state,
        };
      }
      case 'record_outcome': {
        const record = await recordHumanOutcome(review, context, operation.input);
        return { kind: record.kind, id: record.id, direction: record.assessment.direction };
      }
    }
  } finally {
    review.close();
    evidence.close();
  }
}

function provenanceForCollection(ledger: ProofLedger, collectionId: string): unknown {
  for (const entry of ledger.imports) {
    const collection = entry.collections.find((candidate) => candidate.collectionId === collectionId);
    if (collection !== undefined) {
      return {
        collectionId,
        providerId: collection.providerId,
        wqtCommitSha: entry.wqtCommitSha,
        actionsRunId: entry.actionsRunId,
        artifactName: entry.artifactName,
        ...(entry.artifactId === undefined ? {} : { artifactId: entry.artifactId }),
        normalizedSha256: entry.normalizedSha256,
        schema: `${entry.normalizedSchemaVersion} minor ${entry.normalizedSchemaMinorVersion}`,
        sourceVersions: entry.sourceVersions,
        timing: entry.timing,
      };
    }
  }
  fail(`Selected collection is not recorded in the Gate 1 proof ledger: ${collectionId}`);
}

export async function renderGate1Report(input: {
  readonly dbPath: string;
  readonly ledgerPath: string;
  readonly workspacePath: string;
  readonly baselineCollectionId: string;
  readonly currentCollectionId: string;
  readonly recommendationId: string;
  readonly outputPath: string;
}): Promise<unknown> {
  const dbPath = requireExistingDatabase(input.dbPath);
  const outputPath = requireParent(input.outputPath, 'Gate 1 report');
  if (existsSync(outputPath)) fail(`Gate 1 report refuses to overwrite an existing file: ${outputPath}`);
  const workspace = readGate1Workspace(input.workspacePath);
  const context = authorityFor(workspace);
  const ledger = readProofLedger(input.ledgerPath);
  requireLedgerWorkspace(ledger, workspace);
  const baselineProvenance = provenanceForCollection(ledger, identifier.parse(input.baselineCollectionId));
  const currentProvenance = provenanceForCollection(ledger, identifier.parse(input.currentCollectionId));

  const evidence = new LocalEvidenceRepository(dbPath);
  const review = new LocalReviewLedgerRepository(dbPath);
  try {
    const view = await assembleOperatorCaseView(evidence, review, context, {
      scope: workspace.scope,
      baselineCollectionId: identifier.parse(input.baselineCollectionId),
      currentCollectionId: identifier.parse(input.currentCollectionId),
      selectedRecommendationId: identifier.parse(input.recommendationId),
    });
    const html = renderOperatorCaseHtml(buildOperatorCasePresentation(view));
    writeFileSync(outputPath, html, { encoding: 'utf8', flag: 'wx' });
    return {
      outputPath,
      htmlBytes: Buffer.byteLength(html, 'utf8'),
      summary: view.evidenceDiff.summary,
      baselineProvenance,
      currentProvenance,
      selectedRecommendationId: view.selectedRecommendation.current.id,
      selectedRecommendationRevision: view.selectedRecommendation.current.revision,
      selectedRecommendationLifecycle: view.selectedRecommendation.current.lifecycle,
    };
  } finally {
    review.close();
    evidence.close();
  }
}

interface ParsedCli {
  readonly command: string;
  readonly options: Readonly<Record<string, string>>;
}

function parseCli(argv: readonly string[]): ParsedCli {
  if (argv.length === 0) fail('Gate 1 runner requires a command.');
  const command = argv[0]!;
  const options: Record<string, string> = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === undefined || !key.startsWith('--') || value === undefined || value.startsWith('--')) {
      fail('Gate 1 runner options must use explicit --name value pairs.');
    }
    const name = key.slice(2);
    if (name in options) fail(`Duplicate Gate 1 runner option: --${name}`);
    options[name] = value;
  }
  return { command, options };
}

function exactOptions(
  parsed: ParsedCli,
  required: readonly string[],
): Readonly<Record<string, string>> {
  const requiredSet = new Set(required);
  for (const key of Object.keys(parsed.options)) {
    if (!requiredSet.has(key)) fail(`Unsupported option for ${parsed.command}: --${key}`);
  }
  for (const key of required) {
    if (parsed.options[key] === undefined) fail(`Missing required option for ${parsed.command}: --${key}`);
  }
  return parsed.options;
}

export async function runGate1Cli(argv: readonly string[]): Promise<unknown> {
  const parsed = parseCli(argv);
  switch (parsed.command) {
    case 'setup': {
      const options = exactOptions(parsed, ['db', 'ledger', 'workspace']);
      return setupGate1Workspace({
        dbPath: options['db']!,
        ledgerPath: options['ledger']!,
        workspacePath: options['workspace']!,
      });
    }
    case 'import': {
      const options = exactOptions(parsed, ['db', 'ledger', 'workspace', 'artifact', 'metadata']);
      return importGate1WqtArtifact({
        dbPath: options['db']!,
        ledgerPath: options['ledger']!,
        workspacePath: options['workspace']!,
        artifactPath: options['artifact']!,
        metadataPath: options['metadata']!,
      });
    }
    case 'list': {
      const options = exactOptions(parsed, ['db', 'ledger', 'workspace']);
      return listGate1Imports({
        dbPath: options['db']!,
        ledgerPath: options['ledger']!,
        workspacePath: options['workspace']!,
      });
    }
    case 'review': {
      const options = exactOptions(parsed, ['db', 'workspace', 'request']);
      return runGate1ReviewOperation({
        dbPath: options['db']!,
        workspacePath: options['workspace']!,
        requestPath: options['request']!,
      });
    }
    case 'report': {
      const options = exactOptions(parsed, [
        'db', 'ledger', 'workspace', 'baseline', 'current', 'recommendation', 'output',
      ]);
      return renderGate1Report({
        dbPath: options['db']!,
        ledgerPath: options['ledger']!,
        workspacePath: options['workspace']!,
        baselineCollectionId: options['baseline']!,
        currentCollectionId: options['current']!,
        recommendationId: options['recommendation']!,
        outputPath: options['output']!,
      });
    }
    default:
      fail(`Unsupported Gate 1 runner command: ${parsed.command}`);
  }
}

async function main(): Promise<void> {
  const result = await runGate1Cli(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] === undefined ? null : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Gate 1 runner failure.';
    process.stderr.write(`Gate 1 runner failed: ${message}\n`);
    process.exitCode = 1;
  }
}
