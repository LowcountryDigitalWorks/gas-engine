import { z } from 'zod';
import {
  identifier,
  scope as scopeSchema,
  timestamp,
  version as versionSchema,
} from '../contracts/primitives.js';
import { hashCanonicalJson } from '../lib/canonical-json.js';
import type { Scope } from '../persistence/repository.js';
import {
  DECISION_CYCLE_READINESS_STATES,
  type DecisionCycleReadinessState,
} from './decision-cycle.js';
import type {
  ServiceBriefReadinessEntry,
  ServiceBriefReadinessState,
} from './service-brief.js';
import {
  MANAGED_SERVICE_RUN_LIMITS,
  ManagedServiceRunError,
  type ManagedServiceRun,
  type ServiceRunSourceState,
} from './service-run.js';
import { parseManagedServiceRun } from './service-run-import.js';

export const PORTFOLIO_OPERATIONS_VERSION = '0.19.0' as const;
export const MAX_PORTFOLIO_ENGAGEMENTS = 64;
export const MAX_PORTFOLIO_JSON_BYTES = 4_000_000;
export const MAX_FRESHNESS_AGE_SECONDS = 31_622_400;

export const PORTFOLIO_EXCEPTION_KINDS = [
  'no_current_run',
  'source_not_supplied',
  'source_unavailable',
  'source_unsupported',
  'source_freshness_unknown',
  'source_stale',
  'attention_present',
  'report_not_requested',
] as const;

export type PortfolioExceptionKind = typeof PORTFOLIO_EXCEPTION_KINDS[number];
export type SourceFreshnessState = 'fresh' | 'stale' | 'not_evaluable';
export type FreshnessAnchorKind = 'source_window_end' | 'collected_at' | 'received_at';

const displayLabel = z.string().min(1).max(240).regex(/\S/);
const target = z.string().min(1).max(2_048).regex(/\S/);
const sourceFreshnessRuleSchema = z.strictObject({
  sourceFamily: identifier,
  maxAgeSeconds: z.number().int().min(0).max(MAX_FRESHNESS_AGE_SECONDS),
});
const freshnessPolicySchema = z.strictObject({
  id: identifier,
  version: versionSchema,
  sources: z.array(sourceFreshnessRuleSchema).max(MANAGED_SERVICE_RUN_LIMITS.receipts),
});
const engagementSchema = z.strictObject({
  engagementId: identifier,
  label: displayLabel,
  scope: scopeSchema,
  trustedTarget: target,
  currentRun: z.unknown().optional(),
  freshnessPolicy: freshnessPolicySchema,
});
const requestSchema = z.strictObject({
  version: z.literal(PORTFOLIO_OPERATIONS_VERSION),
  evaluatedAt: timestamp,
  engagements: z.array(engagementSchema).min(1).max(MAX_PORTFOLIO_ENGAGEMENTS),
});

export type SourceFreshnessRule = z.infer<typeof sourceFreshnessRuleSchema>;
export type PortfolioFreshnessPolicy = z.infer<typeof freshnessPolicySchema>;
export type PortfolioEngagementInput = z.infer<typeof engagementSchema>;
export type PortfolioOperationsRequest = z.infer<typeof requestSchema>;

export interface SourceFreshnessProjection {
  readonly state: SourceFreshnessState;
  readonly reason?: 'source_state_not_evaluable' | 'freshness_policy_not_configured' | 'freshness_timestamp_unavailable';
  readonly anchorKind?: FreshnessAnchorKind;
  readonly anchorAt?: string;
  readonly ageSeconds?: number;
  readonly maxAgeSeconds?: number;
}

export interface PortfolioSourceProjection {
  readonly receiptId: string;
  readonly sourceFamily: string;
  readonly sourceState: ServiceRunSourceState;
  readonly freshness: SourceFreshnessProjection;
}

export interface PortfolioOperationalException {
  readonly kind: PortfolioExceptionKind;
  readonly receiptId?: string;
  readonly sourceFamily?: string;
}

export interface PortfolioEngagementProjection {
  readonly engagementId: string;
  readonly label: string;
  readonly scope: Scope;
  readonly trustedTarget: string;
  readonly freshnessPolicy: PortfolioFreshnessPolicy;
  readonly currentRunState: 'present' | 'no_current_run';
  readonly currentRunId?: string;
  readonly workspaceId?: string;
  readonly runPeriod?: Readonly<{ start: string; end: string }>;
  readonly runEvaluatedAt?: string;
  readonly sources: readonly PortfolioSourceProjection[];
  readonly readiness: readonly ServiceBriefReadinessEntry[];
  readonly attentionCount: number;
  readonly followUp?: ManagedServiceRun['followUp'];
  readonly report?: ManagedServiceRun['customerReport'];
  readonly exceptions: readonly PortfolioOperationalException[];
  readonly limitations: readonly string[];
}

export interface CountByState<T extends string> {
  readonly state: T;
  readonly count: number;
}

export interface PortfolioOperationsSummary {
  readonly engagementCount: number;
  readonly currentRun: Readonly<{ present: number; noCurrentRun: number }>;
  readonly attentionPresentEngagements: number;
  readonly sourceStates: readonly CountByState<ServiceRunSourceState>[];
  readonly freshnessStates: readonly CountByState<SourceFreshnessState>[];
  readonly moduleReadinessStates: readonly CountByState<ServiceBriefReadinessState>[];
  readonly decisionReadinessStates: readonly CountByState<DecisionCycleReadinessState>[];
  readonly reportStates: readonly CountByState<'not_requested' | 'present'>[];
  readonly exceptionKinds: readonly CountByState<PortfolioExceptionKind>[];
}

export interface PortfolioOperationsConsole {
  readonly version: typeof PORTFOLIO_OPERATIONS_VERSION;
  readonly id: string;
  readonly classification: 'ldw_internal';
  readonly evaluatedAt: string;
  readonly summary: PortfolioOperationsSummary;
  readonly engagements: readonly PortfolioEngagementProjection[];
  readonly limitations: readonly string[];
}

export type PortfolioOperationsErrorCode =
  | 'invalid_request'
  | 'scope_mismatch'
  | 'target_mismatch'
  | 'bound_exceeded'
  | 'invalid_output';

export class PortfolioOperationsError extends Error {
  override name = 'PortfolioOperationsError';
  constructor(readonly code: PortfolioOperationsErrorCode, message: string) {
    super(message);
  }
}

function fail(code: PortfolioOperationsErrorCode, message: string): never {
  throw new PortfolioOperationsError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function scopeKey(scope: Scope): string {
  return `${scope.tenantId}\u0000${scope.siteId}\u0000${scope.siteScopeRevisionId}`;
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId
    && left.siteId === right.siteId
    && left.siteScopeRevisionId === right.siteScopeRevisionId;
}

function sortedPolicy(policy: PortfolioFreshnessPolicy): PortfolioFreshnessPolicy {
  const sources = policy.sources
    .map((entry) => structuredClone(entry))
    .sort((left, right) => asciiCompare(left.sourceFamily, right.sourceFamily));
  if (new Set(sources.map((entry) => entry.sourceFamily)).size !== sources.length) {
    fail('invalid_request', 'Freshness-policy source families must be unique within one engagement.');
  }
  return { ...structuredClone(policy), sources };
}

function parseRequest(input: unknown): PortfolioOperationsRequest {
  let json: string;
  try {
    json = JSON.stringify(input);
  } catch {
    fail('invalid_request', 'Release 0.19 portfolio request must be JSON-compatible.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_PORTFOLIO_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.19 portfolio request exceeds the JSON byte bound.');
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) {
    fail('invalid_request', 'Release 0.19 portfolio request is invalid or contains unsupported fields/version.');
  }
  const engagementIds = parsed.data.engagements.map((entry) => entry.engagementId);
  if (new Set(engagementIds).size !== engagementIds.length) {
    fail('invalid_request', 'Portfolio engagement IDs must be unique.');
  }
  const scopes = parsed.data.engagements.map((entry) => scopeKey(entry.scope));
  if (new Set(scopes).size !== scopes.length) {
    fail('invalid_request', 'Portfolio exact trusted scopes must be unique.');
  }
  return {
    ...parsed.data,
    engagements: parsed.data.engagements.map((entry) => ({
      ...entry,
      freshnessPolicy: sortedPolicy(entry.freshnessPolicy),
    })),
  };
}

function freshnessAnchor(receipt: ManagedServiceRun['receipts'][number]):
  | Readonly<{ kind: FreshnessAnchorKind; at: string }>
  | undefined {
  if (receipt.sourceWindow !== undefined) return { kind: 'source_window_end', at: receipt.sourceWindow.end };
  if (receipt.collectedAt !== undefined) return { kind: 'collected_at', at: receipt.collectedAt };
  if (receipt.receivedAt !== undefined) return { kind: 'received_at', at: receipt.receivedAt };
  return undefined;
}

function projectFreshness(
  receipt: ManagedServiceRun['receipts'][number],
  policy: PortfolioFreshnessPolicy,
  evaluatedAt: string,
): SourceFreshnessProjection {
  if (receipt.state !== 'supplied') {
    return { state: 'not_evaluable', reason: 'source_state_not_evaluable' };
  }
  const rule = policy.sources.find((entry) => entry.sourceFamily === receipt.sourceFamily);
  if (rule === undefined) {
    return { state: 'not_evaluable', reason: 'freshness_policy_not_configured' };
  }
  const anchor = freshnessAnchor(receipt);
  if (anchor === undefined) {
    return { state: 'not_evaluable', reason: 'freshness_timestamp_unavailable' };
  }
  const evaluatedMs = Date.parse(evaluatedAt);
  const anchorMs = Date.parse(anchor.at);
  if (anchorMs > evaluatedMs) {
    fail('invalid_request', `Source receipt ${receipt.id} has a future freshness anchor.`);
  }
  const ageSeconds = (evaluatedMs - anchorMs) / 1_000;
  return {
    state: ageSeconds <= rule.maxAgeSeconds ? 'fresh' : 'stale',
    anchorKind: anchor.kind,
    anchorAt: anchor.at,
    ageSeconds,
    maxAgeSeconds: rule.maxAgeSeconds,
  };
}

function projectExceptions(
  run: ManagedServiceRun | undefined,
  sources: readonly PortfolioSourceProjection[],
): PortfolioOperationalException[] {
  if (run === undefined) return [{ kind: 'no_current_run' }];
  const exceptions: PortfolioOperationalException[] = [];
  for (const source of sources) {
    if (source.sourceState === 'not_supplied') {
      exceptions.push({ kind: 'source_not_supplied', receiptId: source.receiptId, sourceFamily: source.sourceFamily });
    } else if (source.sourceState === 'unavailable') {
      exceptions.push({ kind: 'source_unavailable', receiptId: source.receiptId, sourceFamily: source.sourceFamily });
    } else if (source.sourceState === 'unsupported') {
      exceptions.push({ kind: 'source_unsupported', receiptId: source.receiptId, sourceFamily: source.sourceFamily });
    }
    if (source.sourceState === 'supplied' && source.freshness.state === 'not_evaluable') {
      exceptions.push({ kind: 'source_freshness_unknown', receiptId: source.receiptId, sourceFamily: source.sourceFamily });
    }
    if (source.freshness.state === 'stale') {
      exceptions.push({ kind: 'source_stale', receiptId: source.receiptId, sourceFamily: source.sourceFamily });
    }
  }
  if (run.attentionIds.length > 0) exceptions.push({ kind: 'attention_present' });
  if (run.customerReport.state === 'not_requested') exceptions.push({ kind: 'report_not_requested' });
  return exceptions.sort((left, right) => {
    const kind = asciiCompare(left.kind, right.kind);
    if (kind !== 0) return kind;
    const family = asciiCompare(left.sourceFamily ?? '', right.sourceFamily ?? '');
    return family !== 0 ? family : asciiCompare(left.receiptId ?? '', right.receiptId ?? '');
  });
}

function parseCurrentRun(entry: PortfolioEngagementInput): ManagedServiceRun | undefined {
  if (entry.currentRun === undefined) return undefined;
  let run: ManagedServiceRun;
  try {
    run = parseManagedServiceRun(entry.currentRun);
  } catch (error) {
    if (error instanceof ManagedServiceRunError) {
      fail('invalid_request', `Engagement ${entry.engagementId} current run failed strict Release 0.18 verification: ${error.message}`);
    }
    throw error;
  }
  if (!sameScope(entry.scope, run.scope)) {
    fail('scope_mismatch', `Engagement ${entry.engagementId} current run does not match trusted inventory scope.`);
  }
  if (entry.trustedTarget !== run.trustedTarget) {
    fail('target_mismatch', `Engagement ${entry.engagementId} current run does not match trusted inventory target.`);
  }
  return run;
}

function projectEngagement(
  entry: PortfolioEngagementInput,
  evaluatedAt: string,
): PortfolioEngagementProjection {
  const run = parseCurrentRun(entry);
  const freshnessPolicy = sortedPolicy(entry.freshnessPolicy);
  if (run === undefined) {
    return {
      engagementId: entry.engagementId,
      label: entry.label,
      scope: structuredClone(entry.scope),
      trustedTarget: entry.trustedTarget,
      freshnessPolicy,
      currentRunState: 'no_current_run',
      sources: [],
      readiness: [],
      attentionCount: 0,
      exceptions: [{ kind: 'no_current_run' }],
      limitations: [
        'No accepted current Release 0.18 ManagedServiceRun was supplied for this trusted inventory entry; this is not healthy or zero evidence.',
      ],
    };
  }
  const sources = run.receipts
    .map((receipt) => ({
      receiptId: receipt.id,
      sourceFamily: receipt.sourceFamily,
      sourceState: receipt.state,
      freshness: projectFreshness(receipt, freshnessPolicy, evaluatedAt),
    }))
    .sort((left, right) => asciiCompare(left.receiptId, right.receiptId));
  return {
    engagementId: entry.engagementId,
    label: entry.label,
    scope: structuredClone(entry.scope),
    trustedTarget: entry.trustedTarget,
    freshnessPolicy,
    currentRunState: 'present',
    currentRunId: run.id,
    workspaceId: run.workspaceId,
    runPeriod: structuredClone(run.runPeriod),
    runEvaluatedAt: run.evaluatedAt,
    sources,
    readiness: run.readiness.map((item) => structuredClone(item)),
    attentionCount: run.attentionIds.length,
    followUp: structuredClone(run.followUp),
    report: structuredClone(run.customerReport),
    exceptions: projectExceptions(run, sources),
    limitations: [
      'Source freshness is caller-policy operational metadata only and never overrides accepted module readiness.',
      'Attention count is an exact navigation count only; it is not unread state, priority, severity, or business impact.',
    ],
  };
}

function countStates<T extends string>(states: readonly T[], ordered: readonly T[]): CountByState<T>[] {
  const counts = new Map<T, number>(ordered.map((state) => [state, 0]));
  for (const state of states) counts.set(state, (counts.get(state) ?? 0) + 1);
  return ordered.map((state) => ({ state, count: counts.get(state) ?? 0 }));
}

function summarize(engagements: readonly PortfolioEngagementProjection[]): PortfolioOperationsSummary {
  const sourceStates = engagements.flatMap((entry) => entry.sources.map((source) => source.sourceState));
  const freshnessStates = engagements.flatMap((entry) => entry.sources.map((source) => source.freshness.state));
  const moduleReadinessStates = engagements.flatMap((entry) => entry.readiness.map((item) => item.state));
  const decisionReadinessStates = engagements.flatMap((entry) =>
    entry.followUp?.readiness === undefined ? [] : [entry.followUp.readiness]);
  const reportStates = engagements.flatMap((entry) => entry.report === undefined ? [] : [entry.report.state]);
  const exceptionKinds = engagements.flatMap((entry) => entry.exceptions.map((exception) => exception.kind));
  return {
    engagementCount: engagements.length,
    currentRun: {
      present: engagements.filter((entry) => entry.currentRunState === 'present').length,
      noCurrentRun: engagements.filter((entry) => entry.currentRunState === 'no_current_run').length,
    },
    attentionPresentEngagements: engagements.filter((entry) => entry.attentionCount > 0).length,
    sourceStates: countStates(sourceStates, ['supplied', 'not_supplied', 'unavailable', 'unsupported'] as const),
    freshnessStates: countStates(freshnessStates, ['fresh', 'stale', 'not_evaluable'] as const),
    moduleReadinessStates: countStates(
      moduleReadinessStates,
      ['not_supplied', 'ready', 'limited', 'not_ready', 'unavailable'] as const,
    ),
    decisionReadinessStates: countStates(decisionReadinessStates, DECISION_CYCLE_READINESS_STATES),
    reportStates: countStates(reportStates, ['not_requested', 'present'] as const),
    exceptionKinds: countStates(exceptionKinds, PORTFOLIO_EXCEPTION_KINDS),
  };
}

function identityMaterial(consoleModel: Omit<PortfolioOperationsConsole, 'id'>): unknown {
  return {
    version: consoleModel.version,
    classification: consoleModel.classification,
    evaluatedAt: consoleModel.evaluatedAt,
    summary: consoleModel.summary,
    engagements: consoleModel.engagements,
    limitations: consoleModel.limitations,
  };
}

function validateOutput(consoleModel: PortfolioOperationsConsole): void {
  let json: string;
  try {
    structuredClone(consoleModel);
    json = JSON.stringify(consoleModel);
  } catch {
    fail('invalid_output', 'Release 0.19 portfolio output must be cloneable plain JSON data.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_PORTFOLIO_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.19 portfolio output exceeds the JSON byte bound.');
  }
}

export function composePortfolioOperationsConsole(input: unknown): PortfolioOperationsConsole {
  const request = parseRequest(input);
  const engagements = request.engagements
    .map((entry) => projectEngagement(entry, request.evaluatedAt))
    .sort((left, right) => asciiCompare(left.engagementId, right.engagementId));
  const body: Omit<PortfolioOperationsConsole, 'id'> = {
    version: PORTFOLIO_OPERATIONS_VERSION,
    classification: 'ldw_internal',
    evaluatedAt: request.evaluatedAt,
    summary: summarize(engagements),
    engagements,
    limitations: [
      'This LDW-internal portfolio projection aggregates operational metadata only; it does not benchmark customer performance or flatten cross-tenant evidence.',
      'Trusted inventory scope and target remain authoritative. Service-run IDs and artifacts are provenance/selectors and cannot mint portfolio authority.',
      'The browser console is presentation only and creates no write, scheduling, delivery, provider-network, or persistence authority.',
    ],
  };
  const result: PortfolioOperationsConsole = {
    ...body,
    id: 'portfolio-operations:' + hashCanonicalJson(identityMaterial(body)),
  };
  validateOutput(result);
  return result;
}

export function serializePortfolioOperationsJson(consoleModel: PortfolioOperationsConsole): string {
  const json = JSON.stringify(consoleModel, null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf8') > MAX_PORTFOLIO_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.19 portfolio JSON exceeds the output byte bound.');
  }
  return json;
}
