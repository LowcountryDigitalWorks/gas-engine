import { z } from 'zod';
import { identifier, timestamp, version as versionSchema } from '../contracts/primitives.js';
import { hashCanonicalJson } from '../lib/canonical-json.js';
import type { EvidenceRepository, Scope } from '../persistence/repository.js';
import { requireTenantContext, type TenantContext } from '../persistence/tenant-context.js';
import type { ReviewLedgerRepository } from '../review/repository.js';
import {
  assembleServiceBrief,
  type ServiceBrief,
  type ServiceBriefAttentionItem,
  type ServiceBriefManifestEntry,
  type ServiceBriefReadinessEntry,
} from './service-brief.js';
import {
  prepareDecisionCycle,
  type DecisionCycleDossier,
} from './decision-cycle.js';

export const OPERATOR_WORKSPACE_VERSION = '0.17.0' as const;
export const MAX_OPERATOR_WORKSPACE_JSON_BYTES = 2_000_000;

export const OPERATOR_WORKSPACE_LIMITS = Object.freeze({
  timelineEntries: 512,
  attentionRows: 512,
  evidenceRows: 1_024,
} as const);

const workspacePolicySchema = z.strictObject({
  id: identifier,
  version: versionSchema,
  maxTimelineEntries: z.number().int().min(1).max(OPERATOR_WORKSPACE_LIMITS.timelineEntries),
  maxAttentionRows: z.number().int().min(1).max(OPERATOR_WORKSPACE_LIMITS.attentionRows),
  maxEvidenceRows: z.number().int().min(1).max(OPERATOR_WORKSPACE_LIMITS.evidenceRows),
});

const requestSchema = z.strictObject({
  serviceBriefRequest: z.unknown(),
  decisionCycleInput: z.unknown().optional(),
  generatedAt: timestamp,
  evaluatedAt: timestamp,
  policy: workspacePolicySchema,
});

export type OperatorWorkspacePolicy = z.infer<typeof workspacePolicySchema>;
export type OperatorWorkspaceRequest = z.infer<typeof requestSchema>;

export interface OperatorWorkspaceEvidenceRow {
  readonly id: string;
  readonly moduleId: string;
  readonly kind: string;
  readonly state: string;
  readonly evidenceIdentity: string;
  readonly url?: string;
  readonly query?: string;
  readonly promptId?: string;
  readonly cohortHash?: string;
  readonly readinessContext: readonly string[];
}

export interface OperatorWorkspaceTimelineEntry {
  readonly kind: 'service_brief' | 'recommendation' | 'measurement' | 'outcome';
  readonly at: string;
  readonly label: string;
  readonly state: string;
  readonly referenceId?: string;
}

export interface OperatorWorkspaceNavigation {
  readonly overview: Readonly<{
    attentionCount: number;
    exactUrlCount: number;
    readinessCount: number;
    limitationCount: number;
  }>;
  readonly evidence: Readonly<{
    rowCount: number;
    sourceCount: number;
  }>;
  readonly attention: Readonly<{
    rowCount: number;
    semantics: 'human_review_selection_not_priority';
  }>;
  readonly decisionCycle: Readonly<{
    supplied: boolean;
    readiness?: string;
    recordedMeasurementCount: number;
    humanOutcomeCount: number;
  }>;
  readonly history: Readonly<{ timelineCount: number }>;
  readonly reports: Readonly<{ maximumPrimaryItems: 3 }>;
}

export interface OperatorWorkspace {
  readonly version: typeof OPERATOR_WORKSPACE_VERSION;
  readonly id: string;
  readonly scope: Scope;
  readonly trustedTarget: string;
  readonly generatedAt: string;
  readonly evaluatedAt: string;
  readonly policy: OperatorWorkspacePolicy;
  readonly source: Readonly<{
    serviceBriefId: string;
    decisionCycleDossierId?: string;
  }>;
  readonly serviceBrief: ServiceBrief;
  readonly decisionCycle?: DecisionCycleDossier;
  readonly readiness: readonly ServiceBriefReadinessEntry[];
  readonly sourceManifest: readonly ServiceBriefManifestEntry[];
  readonly evidenceRows: readonly OperatorWorkspaceEvidenceRow[];
  readonly attention: readonly ServiceBriefAttentionItem[];
  readonly timeline: readonly OperatorWorkspaceTimelineEntry[];
  readonly navigation: OperatorWorkspaceNavigation;
  readonly authorityNotes: readonly string[];
  readonly limitations: readonly string[];
}

export type OperatorWorkspaceErrorCode =
  | 'invalid_request'
  | 'scope_mismatch'
  | 'target_mismatch'
  | 'stale_workspace'
  | 'stale_source'
  | 'unsupported_action'
  | 'bound_exceeded'
  | 'invalid_output';

export class OperatorWorkspaceError extends Error {
  override name = 'OperatorWorkspaceError';
  constructor(readonly code: OperatorWorkspaceErrorCode, message: string) {
    super(message);
  }
}

function fail(code: OperatorWorkspaceErrorCode, message: string): never {
  throw new OperatorWorkspaceError(code, message);
}

function sameScope(left: Scope, right: Scope): boolean {
  return left.tenantId === right.tenantId
    && left.siteId === right.siteId
    && left.siteScopeRevisionId === right.siteScopeRevisionId;
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function evidenceRows(brief: ServiceBrief, limit: number): OperatorWorkspaceEvidenceRow[] {
  if (brief.attentionRegister.length > limit) {
    fail('bound_exceeded', 'Release 0.17 evidence rows exceed the configured workspace bound.');
  }
  return brief.attentionRegister
    .map((item) => ({
      id: item.id,
      moduleId: item.moduleId,
      kind: item.originalKind,
      state: item.originalState,
      evidenceIdentity: item.evidenceIdentity,
      ...(item.identity.url === undefined ? {} : { url: item.identity.url }),
      ...(item.identity.query === undefined ? {} : { query: item.identity.query }),
      ...(item.identity.promptId === undefined ? {} : { promptId: item.identity.promptId }),
      ...(item.identity.cohortHash === undefined ? {} : { cohortHash: item.identity.cohortHash }),
      readinessContext: [...item.readinessContext],
    }))
    .sort((left, right) =>
      asciiCompare(left.moduleId, right.moduleId)
      || asciiCompare(left.kind, right.kind)
      || asciiCompare(left.evidenceIdentity, right.evidenceIdentity));
}

function timelineEntries(
  brief: ServiceBrief,
  dossier: DecisionCycleDossier | undefined,
  limit: number,
): OperatorWorkspaceTimelineEntry[] {
  const entries: OperatorWorkspaceTimelineEntry[] = [{
    kind: 'service_brief',
    at: brief.generatedAt,
    label: 'Release 0.15 service brief generated',
    state: 'generated',
    referenceId: brief.id,
  }];

  const seen = new Set<string>();
  const add = (entry: OperatorWorkspaceTimelineEntry): void => {
    const key = [entry.kind, entry.at, entry.referenceId ?? '', entry.state].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    entries.push(entry);
  };

  for (const selected of brief.serviceHistory?.selectedHistories ?? []) {
    for (const record of selected.history) {
      add({
        kind: 'recommendation',
        at: record.updatedAt,
        label: 'Human-authored recommendation revision',
        state: record.lifecycle,
        referenceId: record.id,
      });
    }
    for (const record of selected.measurements) {
      add({
        kind: 'measurement',
        at: record.createdAt,
        label: 'Recorded canonical measurement',
        state: record.result.state,
        referenceId: record.id,
      });
    }
    for (const record of selected.outcomes) {
      add({
        kind: 'outcome',
        at: record.createdAt,
        label: 'Human-declared outcome',
        state: record.assessment.direction,
        referenceId: record.id,
      });
    }
  }

  for (const record of dossier?.recommendation?.history ?? []) {
    add({
      kind: 'recommendation',
      at: record.updatedAt,
      label: 'Decision-cycle recommendation revision',
      state: record.lifecycle,
      referenceId: record.id,
    });
  }
  for (const record of dossier?.recordedMeasurements ?? []) {
    add({
      kind: 'measurement',
      at: record.createdAt,
      label: 'Decision-cycle current measurement',
      state: record.result.state,
      referenceId: record.id,
    });
  }
  for (const record of dossier?.humanOutcomes ?? []) {
    add({
      kind: 'outcome',
      at: record.createdAt,
      label: 'Decision-cycle human outcome',
      state: record.assessment.direction,
      referenceId: record.id,
    });
  }

  const sorted = entries.sort((left, right) =>
    asciiCompare(right.at, left.at)
    || asciiCompare(left.kind, right.kind)
    || asciiCompare(left.referenceId ?? '', right.referenceId ?? ''));
  if (sorted.length > limit) {
    fail('bound_exceeded', 'Release 0.17 timeline exceeds the configured workspace bound.');
  }
  return sorted;
}

function buildWorkspaceId(
  brief: ServiceBrief,
  dossier: DecisionCycleDossier | undefined,
  generatedAt: string,
  evaluatedAt: string,
  policy: OperatorWorkspacePolicy,
  timeline: readonly OperatorWorkspaceTimelineEntry[],
): string {
  const material = {
    version: OPERATOR_WORKSPACE_VERSION,
    scope: brief.scope,
    trustedTarget: brief.trustedTarget,
    generatedAt,
    evaluatedAt,
    policy,
    sourceServiceBriefId: brief.id,
    sourceDecisionCycleDossierId: dossier?.id ?? null,
    readiness: brief.readiness,
    attentionIds: brief.attentionRegister.map((item) => item.id),
    timeline: timeline.map((entry) => ({
      kind: entry.kind,
      at: entry.at,
      state: entry.state,
      referenceId: entry.referenceId ?? null,
    })),
  };
  return 'workspace:' + hashCanonicalJson(material);
}

function validatePlainOutput(workspace: OperatorWorkspace): void {
  let json: string;
  try {
    structuredClone(workspace);
    json = JSON.stringify(workspace);
  } catch {
    fail('invalid_output', 'Release 0.17 workspace must be cloneable plain JSON data.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_OPERATOR_WORKSPACE_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.17 workspace exceeds the JSON output byte bound.');
  }
}

export function serializeOperatorWorkspaceJson(workspace: OperatorWorkspace): string {
  const json = JSON.stringify(workspace, null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf8') > MAX_OPERATOR_WORKSPACE_JSON_BYTES) {
    fail('bound_exceeded', 'Release 0.17 workspace JSON exceeds the output byte bound.');
  }
  return json;
}

/**
 * Recompute the authoritative Release 0.15/0.16 state and project one deterministic
 * application-local operator workspace. Browser data never enters this function as authority.
 */
export async function prepareOperatorWorkspace(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  input: unknown,
): Promise<OperatorWorkspace> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) fail('invalid_request', 'Release 0.17 workspace request is invalid.');
  const request = parsed.data;

  const brief = await assembleServiceBrief(
    evidenceRepository,
    reviewRepository,
    context,
    request.serviceBriefRequest,
  );
  const tenantId = requireTenantContext(context);
  if (brief.scope.tenantId !== tenantId) {
    fail('scope_mismatch', 'Release 0.17 workspace scope is outside the trusted tenant context.');
  }

  let dossier: DecisionCycleDossier | undefined;
  if (request.decisionCycleInput !== undefined) {
    dossier = await prepareDecisionCycle(
      evidenceRepository,
      reviewRepository,
      context,
      request.decisionCycleInput,
    );
    if (!sameScope(dossier.scope, brief.scope)) {
      fail('scope_mismatch', 'Release 0.17 decision cycle is outside the authoritative service-brief scope.');
    }
    if (dossier.trustedTarget !== brief.trustedTarget) {
      fail('target_mismatch', 'Release 0.17 decision cycle target differs from the authoritative service brief.');
    }
    if (dossier.sourceServiceBrief.id !== brief.id) {
      fail('stale_source', 'Release 0.17 decision cycle does not bind the current authoritative service brief.');
    }
  }

  const rows = evidenceRows(brief, request.policy.maxEvidenceRows);
  if (brief.attentionRegister.length > request.policy.maxAttentionRows) {
    fail('bound_exceeded', 'Release 0.17 attention register exceeds the configured workspace bound.');
  }
  const timeline = timelineEntries(brief, dossier, request.policy.maxTimelineEntries);
  const id = buildWorkspaceId(
    brief,
    dossier,
    request.generatedAt,
    request.evaluatedAt,
    request.policy,
    timeline,
  );

  const limitations = [
    ...brief.limitations,
    ...(dossier?.limitations ?? []),
    'Workspace filters and selection controls are presentation convenience only and do not change evidence semantics.',
    'Human attention selection is not G.A.S. priority, severity, materiality, or business-impact ranking.',
    'Browser-generated action/report artifacts are untrusted and require authoritative Node-side recomputation.',
  ];

  const workspace: OperatorWorkspace = {
    version: OPERATOR_WORKSPACE_VERSION,
    id,
    scope: structuredClone(brief.scope),
    trustedTarget: brief.trustedTarget,
    generatedAt: request.generatedAt,
    evaluatedAt: request.evaluatedAt,
    policy: structuredClone(request.policy),
    source: {
      serviceBriefId: brief.id,
      ...(dossier === undefined ? {} : { decisionCycleDossierId: dossier.id }),
    },
    serviceBrief: structuredClone(brief),
    ...(dossier === undefined ? {} : { decisionCycle: structuredClone(dossier) }),
    readiness: structuredClone(brief.readiness),
    sourceManifest: structuredClone(brief.provenanceManifest),
    evidenceRows: rows,
    attention: structuredClone(brief.attentionRegister),
    timeline,
    navigation: {
      overview: {
        attentionCount: brief.attentionRegister.length,
        exactUrlCount: brief.exactUrlEvidenceIndex.length,
        readinessCount: brief.readiness.length,
        limitationCount: limitations.length,
      },
      evidence: {
        rowCount: rows.length,
        sourceCount: brief.provenanceManifest.length,
      },
      attention: {
        rowCount: brief.attentionRegister.length,
        semantics: 'human_review_selection_not_priority',
      },
      decisionCycle: {
        supplied: dossier !== undefined,
        ...(dossier === undefined ? {} : { readiness: dossier.readiness.state }),
        recordedMeasurementCount: dossier?.recordedMeasurements.length ?? 0,
        humanOutcomeCount: dossier?.humanOutcomes.length ?? 0,
      },
      history: { timelineCount: timeline.length },
      reports: { maximumPrimaryItems: 3 },
    },
    authorityNotes: [
      'Trusted TenantContext is supplied outside the workspace/browser artifact.',
      'Release 0.15 and Release 0.16 are recomputed from authoritative repositories.',
      'No browser field, downloaded JSON, ID, hash, or presentation state creates tenant/site/scope authority.',
      'Release 0.17 adds no production action authority beyond accepted Release 0.16 / Release 0.8 services.',
    ],
    limitations,
  };
  validatePlainOutput(workspace);
  return workspace;
}
