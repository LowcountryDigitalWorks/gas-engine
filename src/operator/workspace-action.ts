import { z } from 'zod';
import { identifier, timestamp } from '../contracts/primitives.js';
import type { EvidenceRepository } from '../persistence/repository.js';
import type { TenantContext } from '../persistence/tenant-context.js';
import type { ReviewLedgerRepository } from '../review/repository.js';
import {
  commitDecisionMeasurement,
  commitDecisionOutcome,
  commitDecisionRecommendation,
  reviseDecisionRecommendation,
  transitionDecisionRecommendation,
} from './decision-cycle.js';
import {
  OPERATOR_WORKSPACE_VERSION,
  OperatorWorkspaceError,
  parseOperatorWorkspaceRequest,
  prepareOperatorWorkspace,
  type OperatorWorkspace,
} from './workspace.js';

export const MAX_OPERATOR_ACTION_BYTES = 256_000;

const commitRecommendationSchema = z.strictObject({
  type: z.literal('commit_recommendation'),
});

const transitionRecommendationSchema = z.strictObject({
  type: z.literal('transition_recommendation'),
  input: z.unknown(),
});

const reviseRecommendationSchema = z.strictObject({
  type: z.literal('revise_recommendation'),
  input: z.unknown(),
});

const commitMeasurementSchema = z.strictObject({
  type: z.literal('commit_measurement'),
  role: z.enum(['baseline', 'follow_up']),
  expectedMeasurementId: z.string().min(1).max(256),
});

const commitOutcomeSchema = z.strictObject({
  type: z.literal('commit_outcome'),
  outcome: z.unknown(),
});

const actionSchema = z.discriminatedUnion('type', [
  commitRecommendationSchema,
  transitionRecommendationSchema,
  reviseRecommendationSchema,
  commitMeasurementSchema,
  commitOutcomeSchema,
]);

const artifactSchema = z.strictObject({
  version: z.literal(OPERATOR_WORKSPACE_VERSION),
  actionId: identifier,
  createdAt: timestamp,
  workspaceId: z.string().regex(/^workspace:[0-9a-f]{64}$/),
  sourceBriefId: z.string().min(1).max(256),
  sourceDossierId: z.string().min(1).max(256).optional(),
  action: actionSchema,
});

export type OperatorWorkspaceAction = z.infer<typeof actionSchema>;
export type OperatorActionArtifact = z.infer<typeof artifactSchema>;

function boundedJson(input: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(input);
  } catch {
    throw new OperatorWorkspaceError('invalid_request', 'Release 0.17 action artifact must be plain JSON-compatible data.');
  }
  if (Buffer.byteLength(json, 'utf8') > MAX_OPERATOR_ACTION_BYTES) {
    throw new OperatorWorkspaceError('bound_exceeded', 'Release 0.17 action artifact exceeds the byte bound.');
  }
  return json;
}

export function parseOperatorActionArtifact(input: unknown): OperatorActionArtifact {
  boundedJson(input);
  const parsed = artifactSchema.safeParse(input);
  if (!parsed.success) {
    throw new OperatorWorkspaceError('invalid_request', 'Release 0.17 operator action artifact is invalid.');
  }
  return parsed.data;
}

export function serializeOperatorActionArtifact(artifact: OperatorActionArtifact): string {
  const parsed = parseOperatorActionArtifact(artifact);
  const json = JSON.stringify(parsed, null, 2) + '\n';
  if (Buffer.byteLength(json, 'utf8') > MAX_OPERATOR_ACTION_BYTES) {
    throw new OperatorWorkspaceError('bound_exceeded', 'Release 0.17 action artifact exceeds the byte bound.');
  }
  return json;
}

export function createOperatorActionArtifact(
  workspace: OperatorWorkspace,
  actionId: string,
  createdAt: string,
  action: OperatorWorkspaceAction,
): OperatorActionArtifact {
  return parseOperatorActionArtifact({
    version: OPERATOR_WORKSPACE_VERSION,
    actionId,
    createdAt,
    workspaceId: workspace.id,
    sourceBriefId: workspace.source.serviceBriefId,
    ...(workspace.source.decisionCycleDossierId === undefined
      ? {}
      : { sourceDossierId: workspace.source.decisionCycleDossierId }),
    action,
  });
}

function requireDossier(workspace: OperatorWorkspace): NonNullable<OperatorWorkspace['decisionCycle']> {
  if (workspace.decisionCycle === undefined) {
    throw new OperatorWorkspaceError('unsupported_action', 'Release 0.17 durable actions require an authoritative Release 0.16 decision cycle.');
  }
  return workspace.decisionCycle;
}

function verifyBinding(workspace: OperatorWorkspace, artifact: OperatorActionArtifact): void {
  if (artifact.workspaceId !== workspace.id) {
    throw new OperatorWorkspaceError('stale_workspace', 'Operator action workspace identity is stale.');
  }
  if (artifact.sourceBriefId !== workspace.source.serviceBriefId) {
    throw new OperatorWorkspaceError('stale_source', 'Operator action Release 0.15 source brief identity is stale.');
  }
  const currentDossierId = workspace.source.decisionCycleDossierId;
  if (artifact.sourceDossierId !== currentDossierId) {
    throw new OperatorWorkspaceError('stale_source', 'Operator action Release 0.16 decision dossier identity is stale.');
  }
}

/**
 * Treat the browser artifact only as untrusted request data. The caller supplies
 * trusted repositories/context plus the original authoritative workspace request;
 * current state is recomputed before any accepted Release 0.16 / Release 0.8 write.
 */
export async function applyOperatorWorkspaceAction(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  workspaceRequestInput: unknown,
  artifactInput: unknown,
): Promise<OperatorWorkspace> {
  const artifact = parseOperatorActionArtifact(artifactInput);
  const workspaceRequest = parseOperatorWorkspaceRequest(workspaceRequestInput);
  const current = await prepareOperatorWorkspace(
    evidenceRepository,
    reviewRepository,
    context,
    workspaceRequest,
  );
  verifyBinding(current, artifact);
  const dossier = requireDossier(current);
  if (workspaceRequest.decisionCycleInput === undefined) {
    throw new OperatorWorkspaceError('unsupported_action', 'Authoritative workspace request has no Release 0.16 decision-cycle input.');
  }
  const cycleInput = workspaceRequest.decisionCycleInput;

  switch (artifact.action.type) {
    case 'commit_recommendation':
      await commitDecisionRecommendation(evidenceRepository, reviewRepository, context, cycleInput);
      break;
    case 'transition_recommendation':
      await transitionDecisionRecommendation(
        evidenceRepository,
        reviewRepository,
        context,
        cycleInput,
        artifact.action.input,
      );
      break;
    case 'revise_recommendation':
      await reviseDecisionRecommendation(
        evidenceRepository,
        reviewRepository,
        context,
        cycleInput,
        artifact.action.input,
      );
      break;
    case 'commit_measurement': {
      const plan = dossier.measurementPlan;
      if (plan === undefined) {
        throw new OperatorWorkspaceError('unsupported_action', 'Current Release 0.16 cycle has no accepted Release 0.11 measurement plan.');
      }
      const exactId = artifact.action.role === 'baseline'
        ? plan.baseline.measurement.id
        : plan.followUp.measurement.id;
      if (artifact.action.expectedMeasurementId !== exactId) {
        throw new OperatorWorkspaceError('stale_source', 'Measurement action does not name the exact current Release 0.11 prepared measurement.');
      }
      await commitDecisionMeasurement(
        evidenceRepository,
        reviewRepository,
        context,
        cycleInput,
        artifact.action.role,
      );
      break;
    }
    case 'commit_outcome':
      await commitDecisionOutcome(
        evidenceRepository,
        reviewRepository,
        context,
        cycleInput,
        artifact.action.outcome,
      );
      break;
  }

  return prepareOperatorWorkspace(
    evidenceRepository,
    reviewRepository,
    context,
    workspaceRequest,
  );
}
