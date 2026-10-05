import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { identifier, timestamp, version } from '../contracts/primitives.js';
import { canonicalJson, hashCanonicalJson } from '../lib/canonical-json.js';
import { LocalEvidenceRepository } from '../persistence/sqlite.js';
import { LocalReviewLedgerRepository } from '../review/sqlite.js';

export const PORTABLE_RUNTIME_VERSION = '0.20.0' as const;
export const PORTABLE_RUNTIME_PACKAGE = '@lowcountrydigitalworks/gas-engine' as const;
export const PORTABLE_RUNTIME_MANIFEST_PATH = 'portable-manifest.json' as const;
export const PORTABLE_RUNTIME_PROFILE_PATH = 'runtime/runtime-profile.json' as const;

export const PORTABLE_RUNTIME_LIMITS = Object.freeze({
  files: 128,
  nonDatabaseArtifactBytes: 8_000_000,
  totalBundleBytes: 64_000_000,
  logicalPathBytes: 240,
  retentionClasses: 16,
} as const);

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const packageCompatibilitySchema = z.strictObject({
  name: z.literal(PORTABLE_RUNTIME_PACKAGE),
  version: z.literal(PORTABLE_RUNTIME_VERSION),
});
const classificationSchema = z.enum(['ldw_internal', 'customer_safe', 'private_runtime']);
const artifactRoleSchema = z.enum([
  'service_run',
  'workspace_json',
  'workspace_html',
  'customer_report_json',
  'customer_report_html',
  'package_manifest',
  'portfolio_json',
  'portfolio_html',
]);
const manifestRoleSchema = z.union([
  artifactRoleSchema,
  z.enum(['runtime_profile', 'sqlite_backup']),
]);
const retentionClassSchema = z.strictObject({
  id: identifier,
  classification: classificationSchema,
  protected: z.boolean(),
  maxAgeDays: z.number().int().min(0).max(3650).optional(),
});
const runtimeProfileSchema = z.strictObject({
  version: z.literal(PORTABLE_RUNTIME_VERSION),
  packageCompatibility: packageCompatibilitySchema,
  database: z.strictObject({
    role: z.literal('gas_sqlite'),
    path: z.string().min(1),
    classification: z.literal('private_runtime'),
    retentionClass: identifier,
  }),
  generatedArtifactRoot: z.string().min(1),
  allowedArtifactRoles: z.array(artifactRoleSchema).min(1).max(8),
  allowedClassifications: z.array(classificationSchema).min(1).max(3),
  retention: z.strictObject({
    id: identifier,
    version,
    classes: z.array(retentionClassSchema).min(1).max(PORTABLE_RUNTIME_LIMITS.retentionClasses),
  }),
  buildIdentity: z.string().min(1).max(256).optional(),
});
const manifestEntrySchema = z.strictObject({
  role: manifestRoleSchema,
  path: z.string().min(1),
  sha256: sha256Schema,
  byteCount: z.number().int().min(0).max(PORTABLE_RUNTIME_LIMITS.totalBundleBytes),
  classification: classificationSchema,
  required: z.boolean(),
  retentionClass: identifier,
  retentionTimestamp: timestamp.optional(),
  semanticIdentity: z.string().min(1).max(256).optional(),
});
const recoverySchema = z.strictObject({
  rollbackSelection: z.literal('explicit_operator_bundle'),
  credentials: z.literal('external_not_in_bundle'),
  databaseEntryPath: z.string().min(1),
  verificationProcedure: z.array(z.string().min(1).max(512)).min(1).max(16),
  restoreProcedure: z.array(z.string().min(1).max(512)).min(1).max(16),
  decommissionChecklist: z.array(z.string().min(1).max(512)).min(1).max(16),
});
const manifestSchema = z.strictObject({
  version: z.literal(PORTABLE_RUNTIME_VERSION),
  id: z.string().regex(/^portable-runtime-bundle:[a-f0-9]{64}$/),
  packageCompatibility: packageCompatibilitySchema,
  buildIdentity: z.string().min(1).max(256).optional(),
  runtimeProfilePath: z.string().min(1),
  runtimeProfileIdentity: z.string().regex(/^portable-runtime-profile:[a-f0-9]{64}$/),
  entries: z.array(manifestEntrySchema).min(2).max(PORTABLE_RUNTIME_LIMITS.files),
  retention: z.strictObject({ policyId: identifier, policyVersion: version }),
  recovery: recoverySchema,
});

export type PortableRuntimeClassification = z.infer<typeof classificationSchema>;
export type PortableRuntimeArtifactRole = z.infer<typeof artifactRoleSchema>;
export type PortableRuntimeProfile = z.infer<typeof runtimeProfileSchema>;
export type PortableRuntimeManifestEntry = z.infer<typeof manifestEntrySchema>;
export type PortableRuntimeManifest = z.infer<typeof manifestSchema>;

export interface PortableRuntimeArtifactInput {
  readonly role: PortableRuntimeArtifactRole;
  readonly path: string;
  readonly classification: PortableRuntimeClassification;
  readonly required?: boolean;
  readonly content: string | Uint8Array;
  readonly expectedSha256?: string;
  readonly expectedByteCount?: number;
  readonly retentionClass: string;
  readonly retentionTimestamp?: string;
  readonly semanticIdentity?: string;
}

export interface PortableRuntimeBundleResult {
  readonly root: string;
  readonly profile: PortableRuntimeProfile;
  readonly profileIdentity: string;
  readonly manifest: PortableRuntimeManifest;
  readonly manifestJson: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly databaseBytes: number;
  readonly profileBytes: number;
  readonly manifestBytes: number;
}

export type RetentionPlanState = 'retain' | 'eligible_for_deletion' | 'protected' | 'not_evaluable';
export interface RetentionPlanEntry {
  readonly path: string;
  readonly retentionClass: string;
  readonly state: RetentionPlanState;
  readonly reason: string;
}
export interface RetentionPlan {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly evaluatedAt: string;
  readonly entries: readonly RetentionPlanEntry[];
}

function fail(message: string): never {
  throw new Error(`Release 0.20 portability: ${message}`);
}

function asBytes(content: string | Uint8Array): Uint8Array {
  return typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function validatePortableLogicalPath(input: string): string {
  if (typeof input !== 'string' || input.length === 0) fail('logical path must be non-empty');
  if (!input.isWellFormed()) fail('logical path must contain well-formed UTF-16');
  if (Buffer.byteLength(input, 'utf8') > PORTABLE_RUNTIME_LIMITS.logicalPathBytes) fail('logical path exceeds byte bound');
  if (input.includes('\\')) fail('logical path must use canonical forward slashes');
  if (isAbsolute(input) || input.startsWith('/') || /^[A-Za-z]:/.test(input)) fail('absolute or drive-qualified logical path is forbidden');
  const segments = input.split('/');
  if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) fail('logical path contains an empty, dot, or traversal segment');
  return input;
}

function startsWithin(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel));
}

function ensureControlledRoot(rootInput: string): string {
  const root = resolve(rootInput);
  mkdirSync(root, { recursive: true });
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail('bundle root must be a real directory, not a symlink');
  return realpathSync(root);
}

function resolveOwnedPath(root: string, logicalPathInput: string): string {
  const logicalPath = validatePortableLogicalPath(logicalPathInput);
  const target = resolve(root, ...logicalPath.split('/'));
  if (!startsWithin(root, target)) fail('logical path escapes the bundle root');
  return target;
}

function assertNoSymlinkComponents(root: string, target: string): void {
  if (!startsWithin(root, target)) fail('filesystem target escapes bundle root');
  const rel = relative(root, target);
  if (rel === '') return;
  let current = root;
  for (const segment of rel.split(sep)) {
    current = resolve(current, segment);
    if (!existsSync(current)) continue;
    if (lstatSync(current).isSymbolicLink()) fail(`manifest-owned path is symlinked: ${relative(root, current)}`);
  }
}

function ensureParent(root: string, target: string): void {
  const parent = dirname(target);
  assertNoSymlinkComponents(root, parent);
  mkdirSync(parent, { recursive: true });
  assertNoSymlinkComponents(root, parent);
}

function requireUnique<T>(values: readonly T[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique`);
}

function validateProfileSemantics(profile: PortableRuntimeProfile): void {
  validatePortableLogicalPath(profile.database.path);
  validatePortableLogicalPath(profile.generatedArtifactRoot);
  requireUnique(profile.allowedArtifactRoles, 'allowed artifact roles');
  requireUnique(profile.allowedClassifications, 'allowed classifications');
  requireUnique(profile.retention.classes.map((item) => item.id), 'retention class IDs');
  const classes = new Map(profile.retention.classes.map((item) => [item.id, item] as const));
  const databaseClass = classes.get(profile.database.retentionClass);
  if (databaseClass === undefined || databaseClass.classification !== profile.database.classification) {
    fail('database retention class must exist and preserve its classification');
  }
  if (!profile.retention.classes.some((item) => item.classification === 'ldw_internal')) {
    fail('runtime profile requires an LDW-internal retention class for its non-secret profile file');
  }
}

export function parsePortableRuntimeProfile(input: unknown): PortableRuntimeProfile {
  const parsed = runtimeProfileSchema.safeParse(input);
  if (!parsed.success) fail('runtime profile is invalid or contains unsupported/secret-shaped fields');
  validateProfileSemantics(parsed.data);
  return parsed.data;
}

export function computePortableRuntimeProfileIdentity(profileInput: unknown): string {
  const profile = parsePortableRuntimeProfile(profileInput);
  return 'portable-runtime-profile:' + hashCanonicalJson(profile);
}

export function computePortableRuntimeBundleId(manifestInput: Omit<PortableRuntimeManifest, 'id'>): string {
  return 'portable-runtime-bundle:' + hashCanonicalJson(structuredClone(manifestInput));
}

function validateManifestSemantics(manifest: PortableRuntimeManifest): void {
  validatePortableLogicalPath(manifest.runtimeProfilePath);
  if (manifest.runtimeProfilePath !== PORTABLE_RUNTIME_PROFILE_PATH) fail('runtime profile path is not the accepted V1 path');
  requireUnique(manifest.entries.map((entry) => entry.path), 'manifest logical paths');
  for (const entry of manifest.entries) validatePortableLogicalPath(entry.path);
  const material: Omit<PortableRuntimeManifest, 'id'> = {
    version: manifest.version,
    packageCompatibility: manifest.packageCompatibility,
    ...(manifest.buildIdentity === undefined ? {} : { buildIdentity: manifest.buildIdentity }),
    runtimeProfilePath: manifest.runtimeProfilePath,
    runtimeProfileIdentity: manifest.runtimeProfileIdentity,
    entries: manifest.entries,
    retention: manifest.retention,
    recovery: manifest.recovery,
  };
  if (computePortableRuntimeBundleId(material) !== manifest.id) fail('portable bundle identity does not match semantic manifest state');
}

export function parsePortableRuntimeManifest(input: unknown): PortableRuntimeManifest {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) fail('portable manifest is invalid or contains unsupported fields');
  validateManifestSemantics(parsed.data);
  return parsed.data;
}

export async function backupAcceptedSqliteDatabase(
  sourcePathInput: string,
  bundleRootInput: string,
  targetLogicalPathInput: string,
): Promise<number> {
  const root = ensureControlledRoot(bundleRootInput);
  const sourcePath = resolve(sourcePathInput);
  if (!existsSync(sourcePath) || !lstatSync(sourcePath).isFile() || lstatSync(sourcePath).isSymbolicLink()) {
    fail('SQLite backup source must be an existing real file');
  }
  const target = resolveOwnedPath(root, targetLogicalPathInput);
  ensureParent(root, target);
  if (existsSync(target)) fail('SQLite backup target already exists; silent overwrite is forbidden');
  const source = new DatabaseSync(sourcePath, {
    readOnly: true,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
    defensive: true,
    timeout: 1000,
  });
  try {
    await backup(source, target);
  } finally {
    source.close();
  }
  if (!existsSync(target) || !lstatSync(target).isFile() || lstatSync(target).isSymbolicLink()) fail('SQLite online backup did not create a regular file');
  const evidence = new LocalEvidenceRepository(target);
  evidence.close();
  const review = new LocalReviewLedgerRepository(target);
  review.close();
  return lstatSync(target).size;
}

function entryFromBytes(input: {
  role: PortableRuntimeManifestEntry['role'];
  path: string;
  bytes: Uint8Array;
  classification: PortableRuntimeClassification;
  required: boolean;
  retentionClass: string;
  retentionTimestamp?: string;
  semanticIdentity?: string;
}): PortableRuntimeManifestEntry {
  return {
    role: input.role,
    path: validatePortableLogicalPath(input.path),
    sha256: sha256(input.bytes),
    byteCount: input.bytes.byteLength,
    classification: input.classification,
    required: input.required,
    retentionClass: input.retentionClass,
    ...(input.retentionTimestamp === undefined ? {} : { retentionTimestamp: timestamp.parse(input.retentionTimestamp) }),
    ...(input.semanticIdentity === undefined ? {} : { semanticIdentity: input.semanticIdentity }),
  };
}

function validateEntryRetention(profile: PortableRuntimeProfile, entry: PortableRuntimeManifestEntry): void {
  const retention = profile.retention.classes.find((item) => item.id === entry.retentionClass);
  if (retention === undefined) fail(`entry retention class is not declared by profile: ${entry.retentionClass}`);
  if (retention.classification !== entry.classification) fail(`entry classification does not match retention class: ${entry.path}`);
}

function recovery(databasePath: string) {
  return {
    rollbackSelection: 'explicit_operator_bundle' as const,
    credentials: 'external_not_in_bundle' as const,
    databaseEntryPath: databasePath,
    verificationProcedure: [
      'Strict-parse the runtime profile and manifest.',
      'Validate canonical logical paths before filesystem resolution and reject symlinks.',
      'Recompute every manifest-owned file SHA-256 and byte count.',
      'Verify the deterministic bundle identity and package compatibility.',
      'Reopen the SQLite backup through accepted migration/schema guards under newly issued trusted authority.',
    ],
    restoreProcedure: [
      'Select one explicitly accepted bundle ID; never infer a latest bundle.',
      'Copy the exact bundle directory to a new controlled private root.',
      'Run strict bundle verification at the destination root.',
      'Issue trusted runtime authority externally; never restore TenantContext or sessions from bundle bytes.',
    ],
    decommissionChecklist: [
      'Identify this exact bundle ID and every manifest-owned path.',
      'Stop the separately authorized runtime before removal.',
      'Remove bundle-owned database/artifact/profile/manifest data only under owning-runtime retention authority.',
      'Remove deployment-owned credentials separately; credentials are never present in this bundle.',
      'Verify no customer/private bundle copies remain where decommission policy requires removal.',
    ],
  };
}

export async function createPortableRuntimeBundle(input: {
  readonly root: string;
  readonly sourceDatabasePath: string;
  readonly profile: unknown;
  readonly artifacts: readonly PortableRuntimeArtifactInput[];
}): Promise<PortableRuntimeBundleResult> {
  const root = ensureControlledRoot(input.root);
  const profile = parsePortableRuntimeProfile(input.profile);
  const profileIdentity = computePortableRuntimeProfileIdentity(profile);
  const allowedRoles = new Set(profile.allowedArtifactRoles);
  const allowedClassifications = new Set(profile.allowedClassifications);
  const artifacts = input.artifacts.map((artifact) => ({ ...artifact, path: validatePortableLogicalPath(artifact.path) }));
  requireUnique(artifacts.map((artifact) => artifact.path), 'explicit artifact logical paths');
  if (artifacts.some((artifact) => !artifact.path.startsWith(profile.generatedArtifactRoot + '/'))) {
    fail('every generated artifact must be explicitly placed under generatedArtifactRoot');
  }
  if (artifacts.some((artifact) => !allowedRoles.has(artifact.role))) fail('artifact role is not allowed by runtime profile');
  if (artifacts.some((artifact) => !allowedClassifications.has(artifact.classification))) fail('artifact classification is not allowed by runtime profile');

  const profileBytes = Buffer.from(canonicalJson(profile) + '\n', 'utf8');
  const profilePath = resolveOwnedPath(root, PORTABLE_RUNTIME_PROFILE_PATH);
  ensureParent(root, profilePath);
  if (existsSync(profilePath)) fail('runtime profile target already exists');
  writeFileSync(profilePath, profileBytes, { flag: 'wx' });

  const databaseBytes = await backupAcceptedSqliteDatabase(input.sourceDatabasePath, root, profile.database.path);
  const entries: PortableRuntimeManifestEntry[] = [];
  const internalRetention = profile.retention.classes.find((item) => item.classification === 'ldw_internal');
  if (internalRetention === undefined) fail('runtime profile lacks an LDW-internal retention class');
  const profileEntry = entryFromBytes({
    role: 'runtime_profile',
    path: PORTABLE_RUNTIME_PROFILE_PATH,
    bytes: profileBytes,
    classification: 'ldw_internal',
    required: true,
    retentionClass: internalRetention.id,
    semanticIdentity: profileIdentity,
  });
  validateEntryRetention(profile, profileEntry);
  entries.push(profileEntry);

  const dbTarget = resolveOwnedPath(root, profile.database.path);
  const dbBytes = readFileSync(dbTarget);
  const databaseEntry = entryFromBytes({
    role: 'sqlite_backup',
    path: profile.database.path,
    bytes: dbBytes,
    classification: profile.database.classification,
    required: true,
    retentionClass: profile.database.retentionClass,
  });
  validateEntryRetention(profile, databaseEntry);
  entries.push(databaseEntry);
  if (databaseEntry.byteCount !== databaseBytes) fail('SQLite backup byte measurement changed unexpectedly');

  for (const artifact of artifacts) {
    const bytes = asBytes(artifact.content);
    if (bytes.byteLength > PORTABLE_RUNTIME_LIMITS.nonDatabaseArtifactBytes) fail(`artifact exceeds single-file byte bound: ${artifact.path}`);
    const entry = entryFromBytes({
      role: artifact.role,
      path: artifact.path,
      bytes,
      classification: artifact.classification,
      required: artifact.required ?? true,
      retentionClass: artifact.retentionClass,
      ...(artifact.retentionTimestamp === undefined ? {} : { retentionTimestamp: artifact.retentionTimestamp }),
      ...(artifact.semanticIdentity === undefined ? {} : { semanticIdentity: artifact.semanticIdentity }),
    });
    validateEntryRetention(profile, entry);
    if (artifact.expectedSha256 !== undefined && sha256Schema.parse(artifact.expectedSha256) !== entry.sha256) fail(`artifact SHA-256 mismatch before bundle acceptance: ${artifact.path}`);
    if (artifact.expectedByteCount !== undefined && artifact.expectedByteCount !== entry.byteCount) fail(`artifact byte-count mismatch before bundle acceptance: ${artifact.path}`);
    const target = resolveOwnedPath(root, artifact.path);
    ensureParent(root, target);
    if (existsSync(target)) fail(`artifact target already exists: ${artifact.path}`);
    writeFileSync(target, bytes, { flag: 'wx' });
    entries.push(entry);
  }

  if (entries.length > PORTABLE_RUNTIME_LIMITS.files) fail('manifest-owned file count exceeds bound');
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  requireUnique(entries.map((entry) => entry.path), 'manifest logical paths');
  const manifestWithoutId: Omit<PortableRuntimeManifest, 'id'> = {
    version: PORTABLE_RUNTIME_VERSION,
    packageCompatibility: { name: PORTABLE_RUNTIME_PACKAGE, version: PORTABLE_RUNTIME_VERSION },
    ...(profile.buildIdentity === undefined ? {} : { buildIdentity: profile.buildIdentity }),
    runtimeProfilePath: PORTABLE_RUNTIME_PROFILE_PATH,
    runtimeProfileIdentity: profileIdentity,
    entries,
    retention: { policyId: profile.retention.id, policyVersion: profile.retention.version },
    recovery: recovery(profile.database.path),
  };
  const manifest: PortableRuntimeManifest = {
    ...manifestWithoutId,
    id: computePortableRuntimeBundleId(manifestWithoutId),
  };
  parsePortableRuntimeManifest(manifest);
  const manifestJson = canonicalJson(manifest) + '\n';
  const manifestBytes = Buffer.byteLength(manifestJson, 'utf8');
  const totalBytes = entries.reduce((sum, entry) => sum + entry.byteCount, manifestBytes);
  if (totalBytes > PORTABLE_RUNTIME_LIMITS.totalBundleBytes) fail('portable bundle exceeds total byte bound');
  const manifestPath = resolveOwnedPath(root, PORTABLE_RUNTIME_MANIFEST_PATH);
  if (existsSync(manifestPath)) fail('portable manifest target already exists');
  writeFileSync(manifestPath, manifestJson, { encoding: 'utf8', flag: 'wx' });
  return {
    root,
    profile,
    profileIdentity,
    manifest,
    manifestJson,
    fileCount: entries.length,
    totalBytes,
    databaseBytes,
    profileBytes: profileBytes.byteLength,
    manifestBytes,
  };
}

function collectBundleFiles(root: string, directory: string, output: string[]): void {
  for (const dirent of readdirSync(directory, { withFileTypes: true })) {
    const absolute = resolve(directory, dirent.name);
    const logical = relative(root, absolute).split(sep).join('/');
    validatePortableLogicalPath(logical);
    if (dirent.isSymbolicLink()) fail(`bundle contains a symlink: ${logical}`);
    if (dirent.isDirectory()) {
      collectBundleFiles(root, absolute, output);
    } else if (dirent.isFile()) {
      output.push(logical);
      if (output.length > PORTABLE_RUNTIME_LIMITS.files + 1) fail('bundle contains more files than allowed');
    } else {
      fail(`bundle contains unsupported filesystem entry: ${logical}`);
    }
  }
}

export function verifyPortableRuntimeBundle(rootInput: string): PortableRuntimeBundleResult {
  const root = ensureControlledRoot(rootInput);
  const manifestPath = resolveOwnedPath(root, PORTABLE_RUNTIME_MANIFEST_PATH);
  assertNoSymlinkComponents(root, manifestPath);
  if (!existsSync(manifestPath) || !lstatSync(manifestPath).isFile()) fail('portable manifest is missing');
  const manifestText = readFileSync(manifestPath, 'utf8');
  const manifest = parsePortableRuntimeManifest(JSON.parse(manifestText));
  const profilePath = resolveOwnedPath(root, manifest.runtimeProfilePath);
  assertNoSymlinkComponents(root, profilePath);
  if (!existsSync(profilePath) || !lstatSync(profilePath).isFile()) fail('runtime profile is missing');
  const profile = parsePortableRuntimeProfile(JSON.parse(readFileSync(profilePath, 'utf8')));
  const profileIdentity = computePortableRuntimeProfileIdentity(profile);
  if (profileIdentity !== manifest.runtimeProfileIdentity) fail('runtime profile identity mismatch');
  if (profile.retention.id !== manifest.retention.policyId || profile.retention.version !== manifest.retention.policyVersion) fail('manifest retention policy does not match runtime profile');

  const ownedPaths = new Set<string>([PORTABLE_RUNTIME_MANIFEST_PATH]);
  let totalBytes = Buffer.byteLength(manifestText, 'utf8');
  let databaseBytes = 0;
  let profileBytes = 0;
  let databasePath: string | undefined;
  for (const entry of manifest.entries) {
    validateEntryRetention(profile, entry);
    const target = resolveOwnedPath(root, entry.path);
    assertNoSymlinkComponents(root, target);
    if (!existsSync(target)) {
      if (entry.required) fail(`required manifest-owned file is missing: ${entry.path}`);
      continue;
    }
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) fail(`manifest-owned entry is not a regular file: ${entry.path}`);
    const bytes = readFileSync(target);
    if (bytes.byteLength !== entry.byteCount) fail(`file byte-count mismatch: ${entry.path}`);
    if (sha256(bytes) !== entry.sha256) fail(`file SHA-256 mismatch: ${entry.path}`);
    totalBytes += bytes.byteLength;
    ownedPaths.add(entry.path);
    if (entry.role === 'runtime_profile') profileBytes = bytes.byteLength;
    if (entry.role === 'sqlite_backup') {
      if (databasePath !== undefined) fail('manifest contains more than one SQLite backup');
      databasePath = target;
      databaseBytes = bytes.byteLength;
      if (entry.path !== profile.database.path || entry.classification !== profile.database.classification) fail('SQLite entry does not match runtime profile database configuration');
    } else if (bytes.byteLength > PORTABLE_RUNTIME_LIMITS.nonDatabaseArtifactBytes) {
      fail(`non-database artifact exceeds byte bound: ${entry.path}`);
    }
  }
  if (databasePath === undefined) fail('manifest does not contain the required SQLite backup');
  if (totalBytes > PORTABLE_RUNTIME_LIMITS.totalBundleBytes) fail('portable bundle exceeds total byte bound');

  const actualFiles: string[] = [];
  collectBundleFiles(root, root, actualFiles);
  requireUnique(actualFiles, 'bundle filesystem paths');
  const actualSet = new Set(actualFiles);
  for (const expected of ownedPaths) if (!actualSet.has(expected)) fail(`manifest-owned file is absent from bundle walk: ${expected}`);
  for (const actual of actualSet) if (!ownedPaths.has(actual)) fail(`bundle contains an unowned file: ${actual}`);

  const evidence = new LocalEvidenceRepository(databasePath);
  evidence.close();
  const review = new LocalReviewLedgerRepository(databasePath);
  review.close();

  return {
    root,
    profile,
    profileIdentity,
    manifest,
    manifestJson: manifestText,
    fileCount: manifest.entries.length,
    totalBytes,
    databaseBytes,
    profileBytes,
    manifestBytes: Buffer.byteLength(manifestText, 'utf8'),
  };
}

export function copyPortableRuntimeBundle(sourceRootInput: string, destinationRootInput: string): PortableRuntimeBundleResult {
  const source = verifyPortableRuntimeBundle(sourceRootInput);
  const destination = resolve(destinationRootInput);
  if (existsSync(destination)) fail('destination root already exists');
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source.root, destination, { recursive: true, errorOnExist: true, force: false, dereference: false });
  return verifyPortableRuntimeBundle(destination);
}

export function planPortableRuntimeRetention(
  profileInput: unknown,
  manifestInput: unknown,
  evaluatedAtInput: string,
): RetentionPlan {
  const profile = parsePortableRuntimeProfile(profileInput);
  const manifest = parsePortableRuntimeManifest(manifestInput);
  if (manifest.runtimeProfileIdentity !== computePortableRuntimeProfileIdentity(profile)) fail('retention plan profile does not match manifest');
  const evaluatedAt = timestamp.parse(evaluatedAtInput);
  const evaluatedMs = Date.parse(evaluatedAt);
  const classes = new Map(profile.retention.classes.map((item) => [item.id, item] as const));
  const entries = manifest.entries.map((entry): RetentionPlanEntry => {
    const policy = classes.get(entry.retentionClass);
    if (policy === undefined || policy.classification !== entry.classification) fail(`retention policy mismatch for ${entry.path}`);
    if (policy.protected) return { path: entry.path, retentionClass: entry.retentionClass, state: 'protected', reason: 'Retention class is explicitly protected.' };
    if (entry.retentionTimestamp === undefined || policy.maxAgeDays === undefined) return { path: entry.path, retentionClass: entry.retentionClass, state: 'not_evaluable', reason: 'Explicit retention timestamp or maximum age is unavailable.' };
    const observedMs = Date.parse(entry.retentionTimestamp);
    if (observedMs > evaluatedMs) fail(`retention timestamp is in the future for ${entry.path}`);
    const ageMs = evaluatedMs - observedMs;
    const maxAgeMs = policy.maxAgeDays * 86_400_000;
    return ageMs >= maxAgeMs
      ? { path: entry.path, retentionClass: entry.retentionClass, state: 'eligible_for_deletion', reason: 'Explicit semantic age meets or exceeds the configured retention maximum.' }
      : { path: entry.path, retentionClass: entry.retentionClass, state: 'retain', reason: 'Explicit semantic age remains inside the configured retention maximum.' };
  });
  return { policyId: profile.retention.id, policyVersion: profile.retention.version, evaluatedAt, entries };
}

export function requireExplicitRollbackBundle(
  acceptedBundleIds: readonly string[],
  selectedBundleId: string | undefined,
): string {
  if (selectedBundleId === undefined) fail('rollback requires an explicit operator-selected accepted bundle ID; no latest selection exists');
  if (!/^portable-runtime-bundle:[a-f0-9]{64}$/.test(selectedBundleId)) fail('selected rollback bundle ID is malformed');
  if (!acceptedBundleIds.includes(selectedBundleId)) fail('selected rollback bundle ID is not in the accepted set');
  return selectedBundleId;
}
