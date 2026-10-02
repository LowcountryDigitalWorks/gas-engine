import { z } from 'zod';
import type { EvidenceRepository } from '../persistence/repository.js';
import type { TenantContext } from '../persistence/tenant-context.js';
import { ReviewRevisionConflictError } from '../review/errors.js';
import type { ReviewLedgerRepository } from '../review/repository.js';
import { DecisionCycleError } from './decision-cycle.js';
import { ServiceBriefError } from './service-brief.js';
import {
  OperatorWorkspaceError,
  parseOperatorWorkspaceRequest,
  prepareOperatorWorkspace,
  type OperatorWorkspace,
  type OperatorWorkspaceRequest,
} from './workspace.js';
import {
  applyOperatorWorkspaceAction,
  parseOperatorActionArtifact,
  prepareOperatorWorkspaceDecision,
} from './workspace-action.js';
import {
  composeCustomerServiceReport,
  type CustomerServiceReport,
} from './customer-report.js';

const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('generate_workspace'),
    workspaceRequest: z.unknown(),
  }),
  z.strictObject({
    type: z.literal('apply_action'),
    workspaceRequest: z.unknown(),
    actionArtifact: z.unknown(),
  }),
  z.strictObject({
    type: z.literal('generate_report'),
    workspaceRequest: z.unknown(),
    reportRequest: z.unknown(),
  }),
]);

export type OperatorWorkspaceCommand = z.infer<typeof commandSchema>;

export type OperatorWorkspaceCommandResult =
  | Readonly<{
      type: 'workspace';
      workspace: OperatorWorkspace;
      nextWorkspaceRequest: OperatorWorkspaceRequest;
    }>
  | Readonly<{ type: 'report'; report: CustomerServiceReport }>;

export type OperatorRuntimeErrorCode =
  | 'invalid_input'
  | 'stale_workspace'
  | 'stale_source'
  | 'scope_mismatch'
  | 'target_mismatch'
  | 'unsupported_action'
  | 'expected_revision_conflict'
  | 'bound_exceeded'
  | 'output_failure'
  | 'operation_failed';

export function classifyOperatorRuntimeError(error: unknown): OperatorRuntimeErrorCode {
  if (error instanceof OperatorWorkspaceError) {
    switch (error.code) {
      case 'invalid_request': return 'invalid_input';
      case 'stale_workspace': return 'stale_workspace';
      case 'stale_source': return 'stale_source';
      case 'scope_mismatch': return 'scope_mismatch';
      case 'target_mismatch': return 'target_mismatch';
      case 'unsupported_action': return 'unsupported_action';
      case 'bound_exceeded': return 'bound_exceeded';
      case 'invalid_output': return 'output_failure';
    }
  }
  if (error instanceof ReviewRevisionConflictError) return 'expected_revision_conflict';
  if (error instanceof DecisionCycleError) {
    if (error.code === 'scope_mismatch') return 'scope_mismatch';
    if (error.code === 'target_mismatch') return 'target_mismatch';
    if (error.code === 'bound_exceeded') return 'bound_exceeded';
    if (error.code === 'invalid_output') return 'output_failure';
    return 'invalid_input';
  }
  if (error instanceof ServiceBriefError) {
    if (error.code === 'scope_mismatch') return 'scope_mismatch';
    if (error.code === 'target_mismatch') return 'target_mismatch';
    if (error.code === 'bound_exceeded') return 'bound_exceeded';
    if (error.code === 'invalid_output') return 'output_failure';
    return 'invalid_input';
  }
  return 'operation_failed';
}

/**
 * Local injected operator entrypoint. A trusted host supplies TenantContext and
 * repositories; this surface deliberately does not authenticate, mint context,
 * prompt for credentials, open a listener, or contact a provider.
 */
export async function executeOperatorWorkspaceCommand(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  input: unknown,
): Promise<OperatorWorkspaceCommandResult> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) {
    throw new OperatorWorkspaceError('invalid_request', 'Release 0.17 operator command is invalid.');
  }
  switch (parsed.data.type) {
    case 'generate_workspace': {
      const nextWorkspaceRequest = parseOperatorWorkspaceRequest(parsed.data.workspaceRequest);
      return {
        type: 'workspace',
        workspace: await prepareOperatorWorkspace(
          evidenceRepository,
          reviewRepository,
          context,
          nextWorkspaceRequest,
        ),
        nextWorkspaceRequest,
      };
    }
    case 'apply_action': {
      const artifact = parseOperatorActionArtifact(parsed.data.actionArtifact);
      if (artifact.action.type === 'prepare_decision') {
        const continuation = await prepareOperatorWorkspaceDecision(
          evidenceRepository,
          reviewRepository,
          context,
          parsed.data.workspaceRequest,
          artifact,
        );
        return {
          type: 'workspace',
          workspace: continuation.workspace,
          nextWorkspaceRequest: continuation.nextWorkspaceRequest,
        };
      }
      const nextWorkspaceRequest = parseOperatorWorkspaceRequest(parsed.data.workspaceRequest);
      return {
        type: 'workspace',
        workspace: await applyOperatorWorkspaceAction(
          evidenceRepository,
          reviewRepository,
          context,
          nextWorkspaceRequest,
          artifact,
        ),
        nextWorkspaceRequest,
      };
    }
    case 'generate_report':
      return {
        type: 'report',
        report: await composeCustomerServiceReport(
          evidenceRepository,
          reviewRepository,
          context,
          parsed.data.workspaceRequest,
          parsed.data.reportRequest,
        ),
      };
  }
}
