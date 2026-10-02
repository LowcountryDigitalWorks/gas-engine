import { z } from 'zod';
import { identifier, timestamp } from '../contracts/primitives.js';
import { hashCanonicalJson } from '../lib/canonical-json.js';
import type { EvidenceRepository } from '../persistence/repository.js';
import type { TenantContext } from '../persistence/tenant-context.js';
import type { ReviewLedgerRepository } from '../review/repository.js';
import {
  OperatorWorkspaceError,
  parseOperatorWorkspaceRequest,
  prepareOperatorWorkspace,
  type OperatorWorkspace,
} from './workspace.js';
import type { ServiceBriefAttentionItem, ServiceBriefManifestEntry } from './service-brief.js';

export const CUSTOMER_REPORT_VERSION = '0.17.0' as const;
export const MAX_CUSTOMER_REPORT_JSON_BYTES = 750_000;
export const MAX_CUSTOMER_REPORT_PRIMARY_ITEMS = 3;

const selectedIdsSchema = z.array(z.string().min(1).max(256))
  .min(1)
  .max(MAX_CUSTOMER_REPORT_PRIMARY_ITEMS)
  .refine((ids) => new Set(ids).size === ids.length, 'Customer report focus selection must be unique.');

const requestSchema = z.strictObject({
  version: z.literal(CUSTOMER_REPORT_VERSION),
  requestId: identifier,
  createdAt: timestamp,
  workspaceId: z.string().regex(/^workspace:[0-9a-f]{64}$/),
  sourceBriefId: z.string().min(1).max(256),
  sourceDossierId: z.string().min(1).max(256).optional(),
  title: z.string().min(1).max(240),
  executiveSummary: z.string().min(1).max(5_000),
  selectedAttentionIds: selectedIdsSchema,
  observedChanges: z.array(z.string().min(1).max(1_000)).max(12),
  nextReview: z.string().min(1).max(2_000),
  includeInternalAppendix: z.boolean(),
});

export type CustomerReportRequest = z.infer<typeof requestSchema>;

export interface CustomerReportFocusItem {
  readonly moduleId: string;
  readonly kind: string;
  readonly state: string;
  readonly label: string;
  readonly readinessContext: readonly string[];
}

export interface CustomerReportSourceNote {
  readonly moduleId: string;
  readonly release: string;
  readonly providers: readonly string[];
  readonly periods: readonly Readonly<{ start: string; end: string }>[];
  readonly readiness: string;
  readonly reasons: readonly string[];
}

export interface CustomerServiceReport {
  readonly version: typeof CUSTOMER_REPORT_VERSION;
  readonly id: string;
  readonly title: string;
  readonly createdAt: string;
  readonly context: Readonly<{
    siteId: string;
    target: string;
    periods: readonly Readonly<{ start: string; end: string }>[];
  }>;
  readonly executiveSummary: string;
  readonly readiness: readonly Readonly<{
    moduleId: string;
    state: string;
    reasons: readonly string[];
  }>[];
  readonly limitations: readonly string[];
  readonly observedChanges: readonly string[];
  readonly focusItems: readonly CustomerReportFocusItem[];
  readonly decision?: Readonly<{
    disposition: string;
    summary: string;
    readiness: string;
    recommendationLifecycle?: string;
    recommendationRationale?: string;
    measurementPlanned: boolean;
    recordedMeasurementCount: number;
    humanOutcomes: readonly Readonly<{
      direction: string;
      rationale: string;
      attribution: string;
      createdAt: string;
    }>[];
  }>;
  readonly nextReview: string;
  readonly sourceNotes: readonly CustomerReportSourceNote[];
  readonly internalAppendix?: Readonly<{
    workspaceId: string;
    serviceBriefId: string;
    decisionCycleDossierId?: string;
    selectedAttentionIds: readonly string[];
  }>;
}

function fail(code: 'invalid_request' | 'stale_workspace' | 'stale_source' | 'bound_exceeded' | 'invalid_output', message: string): never {
  throw new OperatorWorkspaceError(code, message);
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function outcomeRationale(outcome: NonNullable<OperatorWorkspace['decisionCycle']>['humanOutcomes'][number]): string {
  switch (outcome.assessment.direction) {
    case 'improved':
    case 'regressed':
    case 'unchanged':
      return outcome.assessment.rationale;
    case 'inconclusive':
    case 'not_due':
    case 'not_measured':
      return outcome.assessment.reason;
  }
}

function customerLabel(item: ServiceBriefAttentionItem): string {
  if (item.identity.url !== undefined) return item.identity.url;
  if (item.identity.query !== undefined) return item.identity.query;
  if (item.identity.promptId !== undefined) return 'AI visibility prompt evidence';
  if (item.identity.cohortHash !== undefined) return 'AI visibility cohort evidence';
  return item.moduleId.replaceAll('_', ' ') + ' evidence';
}

function sourceNote(entry: ServiceBriefManifestEntry): CustomerReportSourceNote {
  return {
    moduleId: entry.moduleId,
    release: entry.release,
    providers: [...entry.providerIds].sort(asciiCompare),
    periods: entry.sourcePeriods
      .map((period) => ({ start: period.start, end: period.end }))
      .sort((left, right) => asciiCompare(left.start, right.start) || asciiCompare(left.end, right.end)),
    readiness: entry.readiness,
    reasons: [...entry.reasons],
  };
}

function allPeriods(manifest: readonly ServiceBriefManifestEntry[]): readonly Readonly<{ start: string; end: string }>[] {
  const values = new Map<string, { start: string; end: string }>();
  for (const entry of manifest) {
    for (const period of entry.sourcePeriods) {
      values.set(period.start + '|' + period.end, { start: period.start, end: period.end });
    }
  }
  return [...values.values()].sort((left, right) =>
    asciiCompare(left.start, right.start) || asciiCompare(left.end, right.end));
}

function decisionProjection(workspace: OperatorWorkspace): CustomerServiceReport['decision'] {
  const dossier = workspace.decisionCycle;
  if (dossier === undefined) return undefined;
  const recommendation = dossier.recommendation?.current ?? dossier.recommendation?.candidate;
  return {
    disposition: dossier.decision.disposition,
    summary: dossier.decision.summary,
    readiness: dossier.readiness.state,
    ...(recommendation === undefined ? {} : {
      recommendationLifecycle: recommendation.lifecycle,
      recommendationRationale: recommendation.rationale,
    }),
    measurementPlanned: dossier.measurementPlan !== undefined,
    recordedMeasurementCount: dossier.recordedMeasurements.length,
    humanOutcomes: dossier.humanOutcomes.map((outcome) => ({
      direction: outcome.assessment.direction,
      rationale: outcomeRationale(outcome),
      attribution: outcome.attribution.strength,
      createdAt: outcome.createdAt,
    })),
  };
}

function reportIdentityMaterial(report: Omit<CustomerServiceReport, 'id'>): unknown {
  return {
    version: report.version,
    title: report.title,
    createdAt: report.createdAt,
    context: report.context,
    executiveSummary: report.executiveSummary,
    readiness: report.readiness,
    limitations: report.limitations,
    observedChanges: report.observedChanges,
    focusItems: report.focusItems,
    decision: report.decision ?? null,
    nextReview: report.nextReview,
    sourceNotes: report.sourceNotes,
    internalAppendix: report.internalAppendix ?? null,
  };
}

function validatePlainOutput(report: CustomerServiceReport): void {
  let json: string;
  try {
    structuredClone(report);
    json = JSON.stringify(report);
  } catch {
    fail('invalid_output', 'Release 0.17 customer report must be cloneable plain JSON data.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_CUSTOMER_REPORT_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.17 customer report exceeds the JSON output byte bound.');
  }
}

export function parseCustomerReportRequest(input: unknown): CustomerReportRequest {
  let json: string;
  try {
    json = JSON.stringify(input);
  } catch {
    fail('invalid_request', 'Release 0.17 customer report request must be JSON-compatible.');
  }
  if (Buffer.byteLength(json, 'utf8') > 256_000) {
    fail('bound_exceeded', 'Release 0.17 customer report request exceeds the request byte bound.');
  }
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) fail('invalid_request', 'Release 0.17 customer report request is invalid.');
  return parsed.data;
}

function verifySourceBinding(workspace: OperatorWorkspace, request: CustomerReportRequest): void {
  if (request.workspaceId !== workspace.id) fail('stale_workspace', 'Customer report request workspace identity is stale.');
  if (request.sourceBriefId !== workspace.source.serviceBriefId) fail('stale_source', 'Customer report request service brief identity is stale.');
  if (request.sourceDossierId !== workspace.source.decisionCycleDossierId) {
    fail('stale_source', 'Customer report request decision-cycle identity is stale.');
  }
}

export async function composeCustomerServiceReport(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  workspaceRequestInput: unknown,
  requestInput: unknown,
): Promise<CustomerServiceReport> {
  const request = parseCustomerReportRequest(requestInput);
  const workspaceRequest = parseOperatorWorkspaceRequest(workspaceRequestInput);
  const workspace = await prepareOperatorWorkspace(
    evidenceRepository,
    reviewRepository,
    context,
    workspaceRequest,
  );
  verifySourceBinding(workspace, request);

  const byId = new Map(workspace.attention.map((item) => [item.id, item] as const));
  const selected = request.selectedAttentionIds.map((id) => {
    const item = byId.get(id);
    if (item === undefined) {
      fail('stale_source', 'Customer report selection references attention outside the current Release 0.15 brief.');
    }
    return item;
  });
  const decision = decisionProjection(workspace);

  const body: Omit<CustomerServiceReport, 'id'> = {
    version: CUSTOMER_REPORT_VERSION,
    title: request.title,
    createdAt: request.createdAt,
    context: {
      siteId: workspace.scope.siteId,
      target: workspace.trustedTarget,
      periods: allPeriods(workspace.sourceManifest),
    },
    executiveSummary: request.executiveSummary,
    readiness: workspace.readiness.map((entry) => ({
      moduleId: entry.moduleId,
      state: entry.state,
      reasons: [...entry.reasons],
    })),
    limitations: [
      'This report describes accepted evidence and human review state; it does not assign a universal health, severity, priority, or business-impact score.',
      'Human-selected focus items are review choices, not an automatic G.A.S. ranking.',
      'Observed change and outcome language remains descriptive unless the recorded human attribution explicitly states otherwise.',
    ],
    observedChanges: [...request.observedChanges],
    focusItems: selected.map((item) => ({
      moduleId: item.moduleId,
      kind: item.originalKind,
      state: item.originalState,
      label: customerLabel(item),
      readinessContext: [...item.readinessContext],
    })),
    ...(decision === undefined ? {} : { decision }),
    nextReview: request.nextReview,
    sourceNotes: workspace.sourceManifest.map(sourceNote),
    ...(request.includeInternalAppendix ? {
      internalAppendix: {
        workspaceId: workspace.id,
        serviceBriefId: workspace.source.serviceBriefId,
        ...(workspace.source.decisionCycleDossierId === undefined
          ? {}
          : { decisionCycleDossierId: workspace.source.decisionCycleDossierId }),
        selectedAttentionIds: [...request.selectedAttentionIds],
      },
    } : {}),
  };
  const report: CustomerServiceReport = {
    ...body,
    id: 'customer-report:' + hashCanonicalJson(reportIdentityMaterial(body)),
  };
  validatePlainOutput(report);
  return report;
}

export function serializeCustomerServiceReportJson(report: CustomerServiceReport): string {
  const json = JSON.stringify(report, null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf8') > MAX_CUSTOMER_REPORT_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.17 customer report JSON exceeds the output byte bound.');
  }
  return json;
}
