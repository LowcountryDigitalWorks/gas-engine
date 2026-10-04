import { z } from 'zod';
import {
  identifier,
  scope as scopeSchema,
  timeWindow,
  timestamp,
  version as versionSchema,
} from '../contracts/primitives.js';
import { hashCanonicalJson } from '../lib/canonical-json.js';
import {
  DECISION_CYCLE_READINESS_STATES,
  decisionCycleReadinessStateSchema,
} from './decision-cycle.js';
import {
  MANAGED_SERVICE_RUN_LIMITS,
  MANAGED_SERVICE_RUN_VERSION,
  MAX_MANAGED_SERVICE_RUN_JSON_BYTES,
  ManagedServiceRunError,
  parseServiceRunSourceReceipt,
  type ManagedServiceRun,
} from './service-run.js';

const serviceBriefModuleSchema = z.enum([
  'evidence_diff',
  'review_history',
  'search_analytics',
  'search_change',
  'page_focus',
  'discovery_diagnostics',
  'ai_visibility',
]);
const readinessStateSchema = z.enum(['not_supplied', 'ready', 'limited', 'not_ready', 'unavailable']);
const sourceStateSchema = z.enum(['supplied', 'not_supplied', 'unavailable', 'unsupported']);
const reportStateSchema = z.enum(['not_requested', 'present']);
const boundedText = z.string().min(1).max(2_048).regex(/\S/);
const runIdSchema = z.string().regex(/^managed-service-run:[a-f0-9]{64}$/);
const workspaceIdSchema = z.string().regex(/^workspace:[a-f0-9]{64}$/);
const summaryIdSchema = z.string().regex(/^managed-service-run-summary:[a-f0-9]{64}$/);

const policySchema = z.strictObject({
  id: identifier,
  version: versionSchema,
  maxReceipts: z.number().int().min(0).max(MANAGED_SERVICE_RUN_LIMITS.receipts),
  maxPriorAttentionIds: z.number().int().min(0).max(MANAGED_SERVICE_RUN_LIMITS.priorAttentionIds),
});

const receiptSchema = z.unknown().transform((value, context) => {
  try {
    return parseServiceRunSourceReceipt(value);
  } catch {
    context.addIssue({ code: 'custom', message: 'Invalid Release 0.18 source receipt.' });
    return z.NEVER;
  }
});

const readinessSchema = z.strictObject({
  moduleId: serviceBriefModuleSchema,
  state: readinessStateSchema,
  reasons: z.array(boundedText).max(64),
});
const manifestSchema = z.strictObject({
  moduleId: serviceBriefModuleSchema,
  identity: z.string().min(1).max(256),
});
const followUpSchema = z.strictObject({
  decisionCyclePresent: z.boolean(),
  readiness: decisionCycleReadinessStateSchema.optional(),
  reasons: z.array(boundedText).max(64),
});
const readinessComparisonSchema = z.strictObject({
  moduleId: serviceBriefModuleSchema,
  priorState: readinessStateSchema.nullable(),
  currentState: readinessStateSchema.nullable(),
  changed: z.boolean(),
});
const manifestComparisonSchema = z.strictObject({
  moduleId: serviceBriefModuleSchema,
  priorIdentity: z.string().min(1).max(256).nullable(),
  currentIdentity: z.string().min(1).max(256).nullable(),
  changed: z.boolean(),
});
const attentionComparisonSchema = z.strictObject({
  attentionId: z.string().min(1).max(256),
  state: z.enum(['carried_forward', 'new_in_current', 'not_present_in_current']),
});
const receiptComparisonSchema = z.strictObject({
  receiptId: identifier,
  priorState: sourceStateSchema.nullable(),
  currentState: sourceStateSchema.nullable(),
  changed: z.boolean(),
});
const priorComparisonSchema = z.strictObject({
  priorRunId: runIdSchema,
  priorSummaryId: summaryIdSchema,
  readiness: z.array(readinessComparisonSchema).max(128),
  sourceManifest: z.array(manifestComparisonSchema).max(128),
  attention: z.array(attentionComparisonSchema).max(1_024),
  decisionReadiness: z.strictObject({
    prior: decisionCycleReadinessStateSchema.nullable(),
    current: decisionCycleReadinessStateSchema.nullable(),
    changed: z.boolean(),
  }),
  report: z.strictObject({
    prior: reportStateSchema,
    current: reportStateSchema,
    changed: z.boolean(),
  }),
  receipts: z.array(receiptComparisonSchema).max(128),
});
const customerReportSchema = z.strictObject({
  state: reportStateSchema,
  reportId: z.string().min(1).max(256).optional(),
});
const provenanceSchema = z.strictObject({
  workspaceId: workspaceIdSchema,
  serviceBriefId: z.string().min(1).max(256),
  decisionCycleDossierId: z.string().min(1).max(256).optional(),
  priorRunId: runIdSchema.optional(),
  priorSummaryId: summaryIdSchema.optional(),
  receiptIds: z.array(identifier).max(MANAGED_SERVICE_RUN_LIMITS.receipts),
  reportId: z.string().min(1).max(256).optional(),
});

const runSchema = z.strictObject({
  version: z.literal(MANAGED_SERVICE_RUN_VERSION),
  id: runIdSchema,
  generatedAt: timestamp,
  policy: policySchema,
  scope: scopeSchema,
  trustedTarget: z.string().min(1).max(2_048).regex(/\S/),
  runPeriod: timeWindow,
  evaluatedAt: timestamp,
  workspaceId: workspaceIdSchema,
  serviceBriefId: z.string().min(1).max(256),
  decisionCycleDossierId: z.string().min(1).max(256).optional(),
  receipts: z.array(receiptSchema).max(MANAGED_SERVICE_RUN_LIMITS.receipts),
  readiness: z.array(readinessSchema).max(64),
  sourceManifest: z.array(manifestSchema).max(64),
  attentionIds: z.array(z.string().min(1).max(256)).max(512),
  followUp: followUpSchema,
  priorComparison: priorComparisonSchema.optional(),
  customerReport: customerReportSchema,
  provenance: provenanceSchema,
  limitations: z.array(boundedText).max(64),
});

function fail(message: string): never {
  throw new ManagedServiceRunError('invalid_request', message);
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) fail(`${label} must be unique.`);
}

function sameArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function receiptDigest(receipt: ManagedServiceRun['receipts'][number]): string {
  return hashCanonicalJson(receipt);
}

function digestEntryList(values: readonly unknown[]): string {
  return hashCanonicalJson(values.map((value) => hashCanonicalJson(value)));
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
          priorSummaryId: run.priorComparison.priorSummaryId,
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

function expectedRunId(run: ManagedServiceRun): string {
  const { id: _id, ...body } = structuredClone(run);
  return 'managed-service-run:' + hashCanonicalJson(
    runIdentityMaterial(body),
  );
}

function validateComparison(run: ManagedServiceRun): void {
  const comparison = run.priorComparison;
  if (comparison === undefined) {
    if (run.provenance.priorRunId !== undefined || run.provenance.priorSummaryId !== undefined) {
      fail('Prior provenance cannot exist without a prior operational comparison.');
    }
    return;
  }
  if (run.provenance.priorRunId !== comparison.priorRunId
      || run.provenance.priorSummaryId !== comparison.priorSummaryId) {
    fail('Prior comparison identities must exactly match run provenance.');
  }

  unique(comparison.readiness.map((entry) => entry.moduleId), 'Prior-comparison readiness modules');
  unique(comparison.sourceManifest.map((entry) => entry.moduleId), 'Prior-comparison source-manifest modules');
  unique(comparison.attention.map((entry) => entry.attentionId), 'Prior-comparison Attention IDs');
  unique(comparison.receipts.map((entry) => entry.receiptId), 'Prior-comparison receipt IDs');

  for (const entry of comparison.readiness) {
    if (entry.changed !== (entry.priorState !== entry.currentState)) fail('Readiness comparison changed flag is inconsistent.');
  }
  for (const entry of comparison.sourceManifest) {
    if (entry.changed !== (entry.priorIdentity !== entry.currentIdentity)) fail('Source-manifest comparison changed flag is inconsistent.');
  }
  for (const entry of comparison.receipts) {
    if (entry.changed !== (entry.priorState !== entry.currentState)) fail('Receipt comparison changed flag is inconsistent.');
  }
  if (comparison.decisionReadiness.changed
      !== (comparison.decisionReadiness.prior !== comparison.decisionReadiness.current)) {
    fail('Decision-readiness comparison changed flag is inconsistent.');
  }
  if (comparison.report.changed !== (comparison.report.prior !== comparison.report.current)) {
    fail('Report comparison changed flag is inconsistent.');
  }

  const currentReadiness = new Map<string, string>(
    run.readiness.map((entry) => [entry.moduleId, entry.state]),
  );
  const comparedReadiness = new Map<string, string | null>(
    comparison.readiness.map((entry) => [entry.moduleId, entry.currentState]),
  );
  for (const [moduleId, state] of currentReadiness) {
    if (comparedReadiness.get(moduleId) !== state) fail('Prior comparison must carry exact current readiness.');
  }
  for (const [moduleId, state] of comparedReadiness) {
    if (state !== null && currentReadiness.get(moduleId) !== state) fail('Prior comparison contains unsupported current readiness.');
  }

  const currentManifest = new Map<string, string>(
    run.sourceManifest.map((entry) => [entry.moduleId, entry.identity]),
  );
  const comparedManifest = new Map<string, string | null>(
    comparison.sourceManifest.map((entry) => [entry.moduleId, entry.currentIdentity]),
  );
  for (const [moduleId, identity] of currentManifest) {
    if (comparedManifest.get(moduleId) !== identity) fail('Prior comparison must carry exact current source-manifest identity.');
  }
  for (const [moduleId, identity] of comparedManifest) {
    if (identity !== null && currentManifest.get(moduleId) !== identity) fail('Prior comparison contains unsupported current source-manifest identity.');
  }

  const comparisonCurrentAttention = comparison.attention
    .filter((entry) => entry.state !== 'not_present_in_current')
    .map((entry) => entry.attentionId)
    .sort();
  const runAttention = [...run.attentionIds].sort();
  if (!sameArray(comparisonCurrentAttention, runAttention)) fail('Prior comparison must carry the exact current Attention set.');

  const expectedDecisionReadiness = run.followUp.readiness ?? null;
  if (comparison.decisionReadiness.current !== expectedDecisionReadiness) {
    fail('Prior comparison decision readiness must match the current run.');
  }
  if (comparison.report.current !== run.customerReport.state) {
    fail('Prior comparison report state must match the current run.');
  }

  const currentReceipts = new Map(run.receipts.map((receipt) => [receipt.id, receipt.state] as const));
  const comparedReceipts = new Map(comparison.receipts.map((entry) => [entry.receiptId, entry.currentState] as const));
  for (const [receiptId, state] of currentReceipts) {
    if (comparedReceipts.get(receiptId) !== state) fail('Prior comparison must carry exact current receipt state.');
  }
  for (const [receiptId, state] of comparedReceipts) {
    if (state !== null && currentReceipts.get(receiptId) !== state) fail('Prior comparison contains unsupported current receipt state.');
  }
}

function validateInvariants(run: ManagedServiceRun): void {
  if (run.runPeriod.start > run.runPeriod.end) fail('Managed-service run period start must not be after end.');
  if (run.receipts.length > run.policy.maxReceipts) fail('Managed-service run exceeds its configured receipt bound.');
  unique(run.receipts.map((receipt) => receipt.id), 'Managed-service run receipt IDs');
  unique(run.readiness.map((entry) => entry.moduleId), 'Managed-service run readiness modules');
  unique(run.sourceManifest.map((entry) => entry.moduleId), 'Managed-service run source-manifest modules');
  unique(run.attentionIds, 'Managed-service run Attention IDs');

  if (run.followUp.decisionCyclePresent && run.followUp.readiness === undefined) {
    fail('A present decision cycle must carry an accepted readiness state.');
  }
  if (!run.followUp.decisionCyclePresent && run.followUp.readiness !== undefined) {
    fail('An absent decision cycle cannot carry a readiness state.');
  }
  if (run.followUp.readiness !== undefined
      && !DECISION_CYCLE_READINESS_STATES.includes(run.followUp.readiness)) {
    fail('Managed-service run follow-up readiness is unsupported.');
  }

  if (run.customerReport.state === 'present' && run.customerReport.reportId === undefined) {
    fail('A present customer report must carry its exact report ID.');
  }
  if (run.customerReport.state === 'not_requested' && run.customerReport.reportId !== undefined) {
    fail('A not-requested customer report cannot carry a report ID.');
  }

  if (run.provenance.workspaceId !== run.workspaceId
      || run.provenance.serviceBriefId !== run.serviceBriefId
      || run.provenance.decisionCycleDossierId !== run.decisionCycleDossierId) {
    fail('Managed-service run provenance must match exact workspace/brief/dossier identities.');
  }
  if (!sameArray(run.provenance.receiptIds, run.receipts.map((receipt) => receipt.id))) {
    fail('Managed-service run provenance receipt IDs must exactly match the run receipts.');
  }
  if (run.provenance.reportId !== run.customerReport.reportId) {
    fail('Managed-service run provenance report ID must exactly match customer-report state.');
  }
  validateComparison(run);
}

/**
 * Strictly imports one already-generated accepted Release 0.18 application-local run.
 * This verifier creates no tenant authority and performs no provider/network/persistence work.
 */
export function parseManagedServiceRun(input: unknown): ManagedServiceRun {
  let json: string;
  try {
    json = JSON.stringify(input);
  } catch {
    fail('Release 0.18 managed-service run import must be JSON-compatible.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_MANAGED_SERVICE_RUN_JSON_BYTES) {
    throw new ManagedServiceRunError('bound_exceeded', 'Release 0.18 managed-service run import exceeds the JSON byte bound.');
  }
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) fail('Release 0.18 managed-service run import is invalid or contains unsupported fields/version.');
  const run = parsed.data as ManagedServiceRun;
  validateInvariants(run);
  if (run.id !== expectedRunId(run)) {
    fail('Release 0.18 managed-service run identity does not match its exact semantic state.');
  }
  return structuredClone(run);
}
