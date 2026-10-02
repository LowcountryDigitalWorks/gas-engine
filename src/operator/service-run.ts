import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  identifier,
  scope as scopeSchema,
  timeWindow,
  timestamp,
  version as versionSchema,
} from '../contracts/primitives.js';
import { hashCanonicalJson } from '../lib/canonical-json.js';
import type { EvidenceRepository, Scope } from '../persistence/repository.js';
import type { TenantContext } from '../persistence/tenant-context.js';
import type { ReviewLedgerRepository } from '../review/repository.js';
import {
  composeCustomerServiceReport,
  serializeCustomerServiceReportJson,
  type CustomerServiceReport,
} from './customer-report.js';
import { renderCustomerServiceReportHtml } from './customer-report-html.js';
import type {
  DecisionCycleReadinessState,
} from './decision-cycle.js';
import type {
  ServiceBriefReadinessEntry,
  ServiceBriefReadinessState,
} from './service-brief.js';
import {
  parseOperatorWorkspaceRequest,
  prepareOperatorWorkspace,
  serializeOperatorWorkspaceJson,
  type OperatorWorkspace,
} from './workspace.js';
import { renderOperatorWorkspaceHtml } from './workspace-html.js';

export const MANAGED_SERVICE_RUN_VERSION = '0.18.0' as const;
export const MAX_MANAGED_SERVICE_RUN_JSON_BYTES = 750_000;
export const MAX_SERVICE_RUN_PACKAGE_MANIFEST_BYTES = 256_000;
export const MAX_SERVICE_RUN_PACKAGE_TOTAL_BYTES = 9_000_000;

export const MANAGED_SERVICE_RUN_LIMITS = Object.freeze({
  receipts: 64,
  receiptLimitations: 16,
  priorAttentionIds: 512,
  priorReadinessEntries: 64,
  priorManifestEntries: 64,
} as const);

const boundedText = z.string().min(1).max(2_048).regex(/\S/);
const artifactLabel = z.string().min(1).max(240).regex(/\S/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const sourceStateSchema = z.enum(['supplied', 'not_supplied', 'unavailable', 'unsupported']);
const reportStateSchema = z.enum(['not_requested', 'present']);

const receiptSchema = z.strictObject({
  id: identifier,
  sourceFamily: identifier,
  state: sourceStateSchema,
  artifactLabel: artifactLabel.optional(),
  sha256: sha256.optional(),
  byteCount: z.number().int().min(0).max(1_000_000_000).optional(),
  sourceWindow: timeWindow.optional(),
  collectedAt: timestamp.optional(),
  receivedAt: timestamp.optional(),
  adapter: z.strictObject({ id: identifier, version: versionSchema }).optional(),
  sourceSchema: z.strictObject({ id: identifier, version: versionSchema }).optional(),
  limitations: z.array(boundedText).max(MANAGED_SERVICE_RUN_LIMITS.receiptLimitations),
});

const policySchema = z.strictObject({
  id: identifier,
  version: versionSchema,
  maxReceipts: z.number().int().min(0).max(MANAGED_SERVICE_RUN_LIMITS.receipts),
  maxPriorAttentionIds: z.number().int().min(0).max(MANAGED_SERVICE_RUN_LIMITS.priorAttentionIds),
});

const readinessSummarySchema = z.strictObject({
  moduleId: identifier,
  state: z.enum(['not_supplied', 'ready', 'limited', 'not_ready', 'unavailable']),
});

const manifestSummarySchema = z.strictObject({
  moduleId: identifier,
  identity: z.string().min(1).max(256),
});

const receiptStateSummarySchema = z.strictObject({
  id: identifier,
  state: sourceStateSchema,
});

const priorSummarySchema = z.strictObject({
  version: z.literal(MANAGED_SERVICE_RUN_VERSION),
  id: z.string().regex(/^managed-service-run:[a-f0-9]{64}$/),
  scope: scopeSchema,
  trustedTarget: z.string().min(1).max(2_048).regex(/\S/),
  workspaceId: z.string().regex(/^workspace:[a-f0-9]{64}$/),
  serviceBriefId: z.string().min(1).max(256),
  decisionCycleDossierId: z.string().min(1).max(256).optional(),
  readiness: z.array(readinessSummarySchema).max(MANAGED_SERVICE_RUN_LIMITS.priorReadinessEntries),
  sourceManifest: z.array(manifestSummarySchema).max(MANAGED_SERVICE_RUN_LIMITS.priorManifestEntries),
  attentionIds: z.array(z.string().min(1).max(256)).max(MANAGED_SERVICE_RUN_LIMITS.priorAttentionIds),
  decisionReadiness: z.string().min(1).max(128).optional(),
  reportState: reportStateSchema,
  reportId: z.string().min(1).max(256).optional(),
  receiptStates: z.array(receiptStateSummarySchema).max(MANAGED_SERVICE_RUN_LIMITS.receipts),
});

const requestSchema = z.strictObject({
  workspaceRequest: z.unknown(),
  generatedAt: timestamp,
  runPeriod: timeWindow,
  policy: policySchema,
  receipts: z.array(receiptSchema).max(MANAGED_SERVICE_RUN_LIMITS.receipts),
  priorRun: priorSummarySchema.optional(),
  customerReportRequest: z.unknown().optional(),
});

export type ServiceRunSourceState = z.infer<typeof sourceStateSchema>;
export type ServiceRunSourceReceipt = z.infer<typeof receiptSchema>;
export type ManagedServiceRunPolicy = z.infer<typeof policySchema>;
export type ManagedServiceRunSummary = z.infer<typeof priorSummarySchema>;
export type ManagedServiceRunRequest = z.infer<typeof requestSchema>;

export type AttentionContinuityState =
  | 'carried_forward'
  | 'new_in_current'
  | 'not_present_in_current';

export interface ManagedServiceRunOperationalComparison {
  readonly priorRunId: string;
  readonly readiness: readonly Readonly<{
    moduleId: string;
    priorState: ServiceBriefReadinessState | null;
    currentState: ServiceBriefReadinessState | null;
    changed: boolean;
  }>[];
  readonly sourceManifest: readonly Readonly<{
    moduleId: string;
    priorIdentity: string | null;
    currentIdentity: string | null;
    changed: boolean;
  }>[];
  readonly attention: readonly Readonly<{
    attentionId: string;
    state: AttentionContinuityState;
  }>[];
  readonly decisionReadiness: Readonly<{
    prior: string | null;
    current: string | null;
    changed: boolean;
  }>;
  readonly report: Readonly<{
    prior: 'not_requested' | 'present';
    current: 'not_requested' | 'present';
    changed: boolean;
  }>;
  readonly receipts: readonly Readonly<{
    receiptId: string;
    priorState: ServiceRunSourceState | null;
    currentState: ServiceRunSourceState | null;
    changed: boolean;
  }>[];
}

export interface ManagedServiceRun {
  readonly version: typeof MANAGED_SERVICE_RUN_VERSION;
  readonly id: string;
  readonly generatedAt: string;
  readonly policy: ManagedServiceRunPolicy;
  readonly scope: Scope;
  readonly trustedTarget: string;
  readonly runPeriod: Readonly<{ start: string; end: string }>;
  readonly evaluatedAt: string;
  readonly workspaceId: string;
  readonly serviceBriefId: string;
  readonly decisionCycleDossierId?: string;
  readonly receipts: readonly ServiceRunSourceReceipt[];
  readonly readiness: readonly ServiceBriefReadinessEntry[];
  readonly sourceManifest: readonly Readonly<{ moduleId: string; identity: string }>[];
  readonly attentionIds: readonly string[];
  readonly followUp: Readonly<{
    decisionCyclePresent: boolean;
    readiness?: DecisionCycleReadinessState;
    reasons: readonly string[];
  }>;
  readonly priorComparison?: ManagedServiceRunOperationalComparison;
  readonly customerReport: Readonly<{
    state: 'not_requested' | 'present';
    reportId?: string;
  }>;
  readonly provenance: Readonly<{
    workspaceId: string;
    serviceBriefId: string;
    decisionCycleDossierId?: string;
    priorRunId?: string;
    receiptIds: readonly string[];
    reportId?: string;
  }>;
  readonly limitations: readonly string[];
}

export type ManagedServiceRunErrorCode =
  | 'invalid_request'
  | 'scope_mismatch'
  | 'target_mismatch'
  | 'bound_exceeded'
  | 'invalid_output';

export class ManagedServiceRunError extends Error {
  override name = 'ManagedServiceRunError';
  constructor(readonly code: ManagedServiceRunErrorCode, message: string) {
    super(message);
  }
}

export interface ManagedServiceRunComposition {
  readonly run: ManagedServiceRun;
  readonly workspace: OperatorWorkspace;
  readonly report?: CustomerServiceReport;
}

export type ServiceRunFileClassification = 'customer_safe' | 'ldw_internal';
export type ServiceRunFileRole =
  | 'service_run'
  | 'workspace_json'
  | 'workspace_html'
  | 'customer_report_json'
  | 'customer_report_html';

export interface ServiceRunPackageFile {
  readonly role: ServiceRunFileRole;
  readonly filename: string;
  readonly classification: ServiceRunFileClassification;
  readonly content: string;
}

export interface ServiceRunPackageManifestEntry {
  readonly role: ServiceRunFileRole;
  readonly filename: string;
  readonly sha256: string;
  readonly byteCount: number;
  readonly classification: ServiceRunFileClassification;
  readonly source: Readonly<{
    runId: string;
    workspaceId: string;
    reportId?: string;
  }>;
}

export interface ServiceRunPackageManifest {
  readonly version: typeof MANAGED_SERVICE_RUN_VERSION;
  readonly id: string;
  readonly runId: string;
  readonly workspaceId: string;
  readonly reportId?: string;
  readonly entries: readonly ServiceRunPackageManifestEntry[];
}

export interface ManagedServiceRunPackage extends ManagedServiceRunComposition {
  readonly files: readonly ServiceRunPackageFile[];
  readonly manifest: ServiceRunPackageManifest;
  readonly manifestJson: string;
}

function fail(code: ManagedServiceRunErrorCode, message: string): never {
  throw new ManagedServiceRunError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId
    && left.siteId === right.siteId
    && left.siteScopeRevisionId === right.siteScopeRevisionId;
}

function validateTimeWindow(value: { start: string; end: string }, label: string): void {
  if (value.start > value.end) fail('invalid_request', `${label} start must not be after end.`);
}

function parseReceipt(input: unknown): ServiceRunSourceReceipt {
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) fail('invalid_request', 'Release 0.18 source receipt is invalid or contains unsupported fields.');
  if (parsed.data.sourceWindow !== undefined) validateTimeWindow(parsed.data.sourceWindow, 'Source receipt window');
  if (parsed.data.collectedAt !== undefined
      && parsed.data.receivedAt !== undefined
      && parsed.data.collectedAt > parsed.data.receivedAt) {
    fail('invalid_request', 'Source receipt collectedAt must not be after receivedAt.');
  }
  return parsed.data;
}

export function parseServiceRunSourceReceipt(input: unknown): ServiceRunSourceReceipt {
  return parseReceipt(input);
}

export function parseManagedServiceRunSummary(input: unknown): ManagedServiceRunSummary {
  const parsed = priorSummarySchema.safeParse(input);
  if (!parsed.success) fail('invalid_request', 'Release 0.18 prior-run summary is invalid or contains unsupported fields.');
  if (new Set(parsed.data.attentionIds).size !== parsed.data.attentionIds.length) {
    fail('invalid_request', 'Prior-run Attention IDs must be unique.');
  }
  if (new Set(parsed.data.readiness.map((entry) => entry.moduleId)).size !== parsed.data.readiness.length) {
    fail('invalid_request', 'Prior-run readiness modules must be unique.');
  }
  if (new Set(parsed.data.sourceManifest.map((entry) => entry.moduleId)).size !== parsed.data.sourceManifest.length) {
    fail('invalid_request', 'Prior-run source-manifest modules must be unique.');
  }
  if (new Set(parsed.data.receiptStates.map((entry) => entry.id)).size !== parsed.data.receiptStates.length) {
    fail('invalid_request', 'Prior-run receipt IDs must be unique.');
  }
  if (parsed.data.reportState === 'not_requested' && parsed.data.reportId !== undefined) {
    fail('invalid_request', 'A not-requested prior report cannot carry a report ID.');
  }
  if (parsed.data.reportState === 'present' && parsed.data.reportId === undefined) {
    fail('invalid_request', 'A present prior report must carry its exact report ID.');
  }
  return parsed.data;
}

export function parseManagedServiceRunRequest(input: unknown): ManagedServiceRunRequest {
  let json: string;
  try {
    json = JSON.stringify(input);
  } catch {
    fail('invalid_request', 'Release 0.18 service-run request must be JSON-compatible.');
  }
  if (Buffer.byteLength(json, 'utf8') > 750_000) {
    fail('bound_exceeded', 'Release 0.18 service-run request exceeds the request byte bound.');
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) fail('invalid_request', 'Release 0.18 service-run request is invalid or contains unsupported fields.');
  validateTimeWindow(parsed.data.runPeriod, 'Managed-service run period');
  if (parsed.data.receipts.length > parsed.data.policy.maxReceipts) {
    fail('bound_exceeded', 'Release 0.18 source receipts exceed the configured run-policy bound.');
  }
  const receipts = parsed.data.receipts.map(parseReceipt);
  if (new Set(receipts.map((receipt) => receipt.id)).size !== receipts.length) {
    fail('invalid_request', 'Release 0.18 source receipt IDs must be unique.');
  }
  if (parsed.data.priorRun !== undefined) {
    const prior = parseManagedServiceRunSummary(parsed.data.priorRun);
    if (prior.attentionIds.length > parsed.data.policy.maxPriorAttentionIds) {
      fail('bound_exceeded', 'Prior-run Attention IDs exceed the configured Release 0.18 policy bound.');
    }
  }
  return {
    ...parsed.data,
    receipts,
  };
}

function receiptDigest(receipt: ServiceRunSourceReceipt): string {
  return hashCanonicalJson(receipt);
}

function digestEntryList(values: readonly unknown[]): string {
  const entryDigests = values.map((value) => hashCanonicalJson(value));
  return hashCanonicalJson(entryDigests);
}

function sourceManifestSummary(workspace: OperatorWorkspace): ManagedServiceRunSummary['sourceManifest'] {
  return workspace.sourceManifest
    .map((entry) => ({ moduleId: entry.moduleId, identity: entry.identity }))
    .sort((left, right) => asciiCompare(left.moduleId, right.moduleId));
}

function readinessSummary(workspace: OperatorWorkspace): ManagedServiceRunSummary['readiness'] {
  return workspace.readiness
    .map((entry) => ({ moduleId: entry.moduleId, state: entry.state }))
    .sort((left, right) => asciiCompare(left.moduleId, right.moduleId));
}

function receiptStateSummary(receipts: readonly ServiceRunSourceReceipt[]): ManagedServiceRunSummary['receiptStates'] {
  return receipts
    .map((receipt) => ({ id: receipt.id, state: receipt.state }))
    .sort((left, right) => asciiCompare(left.id, right.id));
}

function compareOperationalState(
  prior: ManagedServiceRunSummary,
  workspace: OperatorWorkspace,
  receipts: readonly ServiceRunSourceReceipt[],
  reportState: 'not_requested' | 'present',
): ManagedServiceRunOperationalComparison {
  if (!sameScope(prior.scope, workspace.scope)) {
    fail('scope_mismatch', 'Prior Release 0.18 run scope differs from the current authoritative workspace.');
  }
  if (prior.trustedTarget !== workspace.trustedTarget) {
    fail('target_mismatch', 'Prior Release 0.18 run target differs from the current authoritative workspace.');
  }

  const currentReadiness = readinessSummary(workspace);
  const priorReadiness = new Map(prior.readiness.map((entry) => [entry.moduleId, entry.state] as const));
  const currentReadinessMap = new Map(currentReadiness.map((entry) => [entry.moduleId, entry.state] as const));
  const readinessIds = [...new Set([...priorReadiness.keys(), ...currentReadinessMap.keys()])].sort(asciiCompare);
  const readiness = readinessIds.map((moduleId) => {
    const before = priorReadiness.get(moduleId) ?? null;
    const after = currentReadinessMap.get(moduleId) ?? null;
    return { moduleId, priorState: before, currentState: after, changed: before !== after };
  });

  const currentManifest = sourceManifestSummary(workspace);
  const priorManifest = new Map(prior.sourceManifest.map((entry) => [entry.moduleId, entry.identity] as const));
  const currentManifestMap = new Map(currentManifest.map((entry) => [entry.moduleId, entry.identity] as const));
  const manifestIds = [...new Set([...priorManifest.keys(), ...currentManifestMap.keys()])].sort(asciiCompare);
  const sourceManifest = manifestIds.map((moduleId) => {
    const before = priorManifest.get(moduleId) ?? null;
    const after = currentManifestMap.get(moduleId) ?? null;
    return { moduleId, priorIdentity: before, currentIdentity: after, changed: before !== after };
  });

  const priorAttention = new Set(prior.attentionIds);
  const currentAttention = new Set(workspace.attention.map((item) => item.id));
  const attentionIds = [...new Set([...priorAttention, ...currentAttention])].sort(asciiCompare);
  const attention = attentionIds.map((attentionId) => ({
    attentionId,
    state: priorAttention.has(attentionId)
      ? currentAttention.has(attentionId) ? 'carried_forward' as const : 'not_present_in_current' as const
      : 'new_in_current' as const,
  }));

  const currentDecision = workspace.decisionCycle?.readiness.state ?? null;
  const priorDecision = prior.decisionReadiness ?? null;

  const priorReceipts = new Map(prior.receiptStates.map((entry) => [entry.id, entry.state] as const));
  const currentReceipts = new Map(receiptStateSummary(receipts).map((entry) => [entry.id, entry.state] as const));
  const receiptIds = [...new Set([...priorReceipts.keys(), ...currentReceipts.keys()])].sort(asciiCompare);
  const receiptComparison = receiptIds.map((receiptId) => {
    const before = priorReceipts.get(receiptId) ?? null;
    const after = currentReceipts.get(receiptId) ?? null;
    return { receiptId, priorState: before, currentState: after, changed: before !== after };
  });

  return {
    priorRunId: prior.id,
    readiness,
    sourceManifest,
    attention,
    decisionReadiness: {
      prior: priorDecision,
      current: currentDecision,
      changed: priorDecision !== currentDecision,
    },
    report: {
      prior: prior.reportState,
      current: reportState,
      changed: prior.reportState !== reportState,
    },
    receipts: receiptComparison,
  };
}

function runIdentityMaterial(run: Omit<ManagedServiceRun, 'id'>): unknown {
  return {
    version: run.version,
    generatedAt: run.generatedAt,
    policy: run.policy,
    scope: run.scope,
    trustedTarget: run.trustedTarget,
    runPeriod: run.runPeriod,
    evaluatedAt: run.evaluatedAt,
    workspaceId: run.workspaceId,
    serviceBriefId: run.serviceBriefId,
    decisionCycleDossierId: run.decisionCycleDossierId ?? null,
    receiptDigests: run.receipts.map(receiptDigest),
    readinessDigest: digestEntryList(run.readiness),
    sourceManifestDigest: digestEntryList(run.sourceManifest),
    attentionDigest: digestEntryList(run.attentionIds),
    followUp: run.followUp,
    priorComparisonDigest: run.priorComparison === undefined
      ? null
      : hashCanonicalJson({
          priorRunId: run.priorComparison.priorRunId,
          readiness: digestEntryList(run.priorComparison.readiness),
          sourceManifest: digestEntryList(run.priorComparison.sourceManifest),
          attention: digestEntryList(run.priorComparison.attention),
          decisionReadiness: run.priorComparison.decisionReadiness,
          report: run.priorComparison.report,
          receipts: digestEntryList(run.priorComparison.receipts),
        }),
    customerReport: run.customerReport,
    provenance: run.provenance,
    limitations: run.limitations,
  };
}

function validateRunOutput(run: ManagedServiceRun): void {
  let json: string;
  try {
    structuredClone(run);
    json = JSON.stringify(run);
  } catch {
    fail('invalid_output', 'Release 0.18 managed-service run must be cloneable plain JSON data.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_MANAGED_SERVICE_RUN_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.18 managed-service run exceeds the JSON output byte bound.');
  }
}

async function composeRun(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  request: ManagedServiceRunRequest,
): Promise<ManagedServiceRunComposition> {
  const workspaceRequest = parseOperatorWorkspaceRequest(request.workspaceRequest);
  const workspace = await prepareOperatorWorkspace(
    evidenceRepository,
    reviewRepository,
    context,
    workspaceRequest,
  );
  const receipts = [...request.receipts].sort((left, right) => asciiCompare(left.id, right.id));
  const report = request.customerReportRequest === undefined
    ? undefined
    : await composeCustomerServiceReport(
        evidenceRepository,
        reviewRepository,
        context,
        workspaceRequest,
        request.customerReportRequest,
      );
  const reportState = report === undefined ? 'not_requested' as const : 'present' as const;
  const prior = request.priorRun === undefined ? undefined : parseManagedServiceRunSummary(request.priorRun);
  const priorComparison = prior === undefined
    ? undefined
    : compareOperationalState(prior, workspace, receipts, reportState);

  const limitations = [
    'Source receipts are operational provenance only and cannot mint tenant/site/scope authority or override accepted Release 0.15/0.17 readiness.',
    'Prior-run comparison is exact operational continuity only; not_present_in_current does not mean resolved, fixed, improved, or lower business impact.',
    'Release 0.18 creates no scheduler, task state, provider polling, report delivery, production action, or private WQT history.',
  ] as const;

  const body: Omit<ManagedServiceRun, 'id'> = {
    version: MANAGED_SERVICE_RUN_VERSION,
    generatedAt: request.generatedAt,
    policy: structuredClone(request.policy),
    scope: structuredClone(workspace.scope),
    trustedTarget: workspace.trustedTarget,
    runPeriod: structuredClone(request.runPeriod),
    evaluatedAt: workspace.evaluatedAt,
    workspaceId: workspace.id,
    serviceBriefId: workspace.source.serviceBriefId,
    ...(workspace.source.decisionCycleDossierId === undefined
      ? {}
      : { decisionCycleDossierId: workspace.source.decisionCycleDossierId }),
    receipts: receipts.map((receipt) => structuredClone(receipt)),
    readiness: structuredClone(workspace.readiness),
    sourceManifest: sourceManifestSummary(workspace),
    attentionIds: workspace.attention.map((item) => item.id),
    followUp: workspace.decisionCycle === undefined
      ? { decisionCyclePresent: false, reasons: [] }
      : {
          decisionCyclePresent: true,
          readiness: workspace.decisionCycle.readiness.state,
          reasons: [...workspace.decisionCycle.readiness.reasons],
        },
    ...(priorComparison === undefined ? {} : { priorComparison }),
    customerReport: report === undefined
      ? { state: 'not_requested' }
      : { state: 'present', reportId: report.id },
    provenance: {
      workspaceId: workspace.id,
      serviceBriefId: workspace.source.serviceBriefId,
      ...(workspace.source.decisionCycleDossierId === undefined
        ? {}
        : { decisionCycleDossierId: workspace.source.decisionCycleDossierId }),
      ...(prior === undefined ? {} : { priorRunId: prior.id }),
      receiptIds: receipts.map((receipt) => receipt.id),
      ...(report === undefined ? {} : { reportId: report.id }),
    },
    limitations: [...limitations],
  };
  const run: ManagedServiceRun = {
    ...body,
    id: 'managed-service-run:' + hashCanonicalJson(runIdentityMaterial(body)),
  };
  validateRunOutput(run);
  return {
    run,
    workspace,
    ...(report === undefined ? {} : { report }),
  };
}

export async function prepareManagedServiceRun(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  input: unknown,
): Promise<ManagedServiceRunComposition> {
  const request = parseManagedServiceRunRequest(input);
  return composeRun(evidenceRepository, reviewRepository, context, request);
}

export function summarizeManagedServiceRun(run: ManagedServiceRun): ManagedServiceRunSummary {
  const summary = {
    version: MANAGED_SERVICE_RUN_VERSION,
    id: run.id,
    scope: structuredClone(run.scope),
    trustedTarget: run.trustedTarget,
    workspaceId: run.workspaceId,
    serviceBriefId: run.serviceBriefId,
    ...(run.decisionCycleDossierId === undefined ? {} : { decisionCycleDossierId: run.decisionCycleDossierId }),
    readiness: run.readiness
      .map((entry) => ({ moduleId: entry.moduleId, state: entry.state }))
      .sort((left, right) => asciiCompare(left.moduleId, right.moduleId)),
    sourceManifest: run.sourceManifest.map((entry) => structuredClone(entry)),
    attentionIds: [...run.attentionIds],
    ...(run.followUp.readiness === undefined ? {} : { decisionReadiness: run.followUp.readiness }),
    reportState: run.customerReport.state,
    ...(run.customerReport.reportId === undefined ? {} : { reportId: run.customerReport.reportId }),
    receiptStates: receiptStateSummary(run.receipts),
  };
  return parseManagedServiceRunSummary(summary);
}

export function summarizeManagedServiceRunComposition(
  composition: ManagedServiceRunComposition,
): ManagedServiceRunSummary {
  return summarizeManagedServiceRun(composition.run);
}

export function serializeManagedServiceRunJson(run: ManagedServiceRun): string {
  const json = JSON.stringify(run, null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf8') > MAX_MANAGED_SERVICE_RUN_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.18 managed-service run JSON exceeds the output byte bound.');
  }
  return json;
}

function fileHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function manifestEntry(
  file: ServiceRunPackageFile,
  run: ManagedServiceRun,
  workspace: OperatorWorkspace,
  report: CustomerServiceReport | undefined,
): ServiceRunPackageManifestEntry {
  return {
    role: file.role,
    filename: file.filename,
    sha256: fileHash(file.content),
    byteCount: Buffer.byteLength(file.content, 'utf8'),
    classification: file.classification,
    source: {
      runId: run.id,
      workspaceId: workspace.id,
      ...(report === undefined || !file.role.startsWith('customer_report')
        ? {}
        : { reportId: report.id }),
    },
  };
}

function serializeManifest(manifest: ServiceRunPackageManifest): string {
  const json = JSON.stringify(manifest, null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf8') > MAX_SERVICE_RUN_PACKAGE_MANIFEST_BYTES) {
    fail('bound_exceeded', 'Release 0.18 package manifest exceeds the output byte bound.');
  }
  return json;
}

export async function composeManagedServiceRunPackage(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  input: unknown,
): Promise<ManagedServiceRunPackage> {
  const composition = await prepareManagedServiceRun(
    evidenceRepository,
    reviewRepository,
    context,
    input,
  );
  const runJson = serializeManagedServiceRunJson(composition.run);
  const workspaceJson = serializeOperatorWorkspaceJson(composition.workspace);
  const workspaceHtml = renderOperatorWorkspaceHtml(composition.workspace);

  const files: ServiceRunPackageFile[] = [
    {
      role: 'service_run',
      filename: 'service-run.json',
      classification: 'ldw_internal',
      content: runJson,
    },
    {
      role: 'workspace_json',
      filename: 'operator-workspace.json',
      classification: 'ldw_internal',
      content: workspaceJson,
    },
    {
      role: 'workspace_html',
      filename: 'operator-workspace.html',
      classification: 'ldw_internal',
      content: workspaceHtml,
    },
  ];

  if (composition.report !== undefined) {
    const reportClassification: ServiceRunFileClassification =
      composition.report.internalAppendix === undefined ? 'customer_safe' : 'ldw_internal';
    files.push(
      {
        role: 'customer_report_json',
        filename: 'customer-report.json',
        classification: reportClassification,
        content: serializeCustomerServiceReportJson(composition.report),
      },
      {
        role: 'customer_report_html',
        filename: 'customer-report.html',
        classification: reportClassification,
        content: renderCustomerServiceReportHtml(composition.report),
      },
    );
  }

  const totalBytes = files.reduce((total, file) => total + Buffer.byteLength(file.content, 'utf8'), 0);
  if (totalBytes > MAX_SERVICE_RUN_PACKAGE_TOTAL_BYTES) {
    fail('bound_exceeded', 'Release 0.18 generated package payload exceeds the total byte bound.');
  }

  const entries = files.map((file) =>
    manifestEntry(file, composition.run, composition.workspace, composition.report));
  const manifestBase = {
    version: MANAGED_SERVICE_RUN_VERSION,
    runId: composition.run.id,
    workspaceId: composition.workspace.id,
    ...(composition.report === undefined ? {} : { reportId: composition.report.id }),
    entries,
  };
  const manifest: ServiceRunPackageManifest = {
    ...manifestBase,
    id: 'service-run-package:' + hashCanonicalJson(manifestBase),
  };
  const manifestJson = serializeManifest(manifest);
  if (totalBytes + Buffer.byteLength(manifestJson, 'utf8') > MAX_SERVICE_RUN_PACKAGE_TOTAL_BYTES) {
    fail('bound_exceeded', 'Release 0.18 generated package plus manifest exceeds the total byte bound.');
  }
  return {
    ...composition,
    files,
    manifest,
    manifestJson,
  };
}
