import type { EvidenceRepository } from '../persistence/repository.js';
import { requireTenantContext, type TenantContext } from '../persistence/tenant-context.js';
import type { ReviewLedgerRepository } from '../review/repository.js';
import {
  composeCustomerServiceReport,
  parseCustomerReportRequest,
} from './customer-report.js';
import {
  MAX_CUSTOMER_REPORT_HTML_BYTES,
  renderCustomerServiceReportHtml,
} from './customer-report-html.js';
import {
  composeMeasurementReadiness,
  renderMeasurementReadinessHtml,
} from './measurement-readiness.js';
import { prepareOperatorWorkspace } from './workspace.js';

// An internal presentation wrapper, not a new report schema, delivery artifact,
// authorization capability or report-identity source. Keep the accepted renderer
// and its legacy one-argument HTML byte-for-byte unchanged.
const REPORT_END = '\n</main>\n</body>\n</html>\n';
const INTERNAL_START = '\n<div class="internal" id="measurement-readiness-annex" role="note">\n'
  + '<p><strong>LDW INTERNAL REVIEW ONLY — not approved for customer delivery.'
  + ' These are trusted operator declarations, not verified live provider probes.</strong></p>\n';
const INTERNAL_END = '\n</div>\n';

/**
 * Assemble a report and a measurement-readiness fragment only after
 * recomputing tenant-scoped workspace authority in the current process.
 * Browser/workspace JSON, report IDs, domains and the readiness request are
 * selectors/data only and MUST NEVER supply or mint a TenantContext.
 *
 * No external provider calls, browser instrumentation, customer messaging,
 * schema changes or persistence writes occur in this presentation function.
 */
export async function composeInternalMeasurementReadinessHtml(
  evidenceRepository: EvidenceRepository,
  reviewRepository: ReviewLedgerRepository,
  context: TenantContext,
  workspaceRequestInput: unknown,
  customerReportRequestInput: unknown,
  readinessRequestInput: unknown,
): Promise<string> {
  const tenantId = requireTenantContext(context);
  const workspace = await prepareOperatorWorkspace(
    evidenceRepository,
    reviewRepository,
    context,
    workspaceRequestInput,
  );
  if (workspace.scope.tenantId !== tenantId) {
    throw new Error('Internal measurement report requires exact trusted tenant authority.');
  }

  // Preserve the accepted report's workspace, service brief and decision
  // bindings. Do not derive tenant or revision authority from report.context.
  const reportRequest = parseCustomerReportRequest(customerReportRequestInput);
  if (reportRequest.workspaceId !== workspace.id
      || reportRequest.sourceBriefId !== workspace.source.serviceBriefId
      || reportRequest.sourceDossierId !== workspace.source.decisionCycleDossierId) {
    throw new Error('Internal measurement report has a stale workspace or source identity.');
  }
  const report = await composeCustomerServiceReport(
    evidenceRepository,
    reviewRepository,
    context,
    workspaceRequestInput,
    customerReportRequestInput,
  );
  if (report.context.siteId !== workspace.scope.siteId
      || report.context.target !== workspace.trustedTarget) {
    throw new Error('Internal measurement report has an invalid site or target binding.');
  }

  // Accepted v1 verifies all three exact scope IDs, canonical HTTPS origin,
  // source states, evidence times and text bounds. The rendered fragment is
  // accepted ONLY from the private same-process WeakMap verified snapshot.
  const readiness = composeMeasurementReadiness(
    { scope: structuredClone(workspace.scope), target: workspace.trustedTarget },
    readinessRequestInput,
  );
  if (readiness.evaluatedAt !== workspace.evaluatedAt) {
    throw new Error('Internal measurement report has a mismatched evaluation time.');
  }
  const fragment = renderMeasurementReadinessHtml(readiness);
  const originalHtml = renderCustomerServiceReportHtml(report);
  if (!originalHtml.endsWith(REPORT_END)
      || originalHtml.indexOf('id="measurement-readiness-annex"') !== -1) {
    throw new Error('Accepted report HTML template is not suitable for internal composition.');
  }
  const internalHtml = originalHtml.slice(0, -REPORT_END.length)
    + INTERNAL_START + fragment + INTERNAL_END + REPORT_END;
  if (Buffer.byteLength(internalHtml, 'utf8') > MAX_CUSTOMER_REPORT_HTML_BYTES) {
    throw new Error('Internal measurement report exceeds the accepted HTML byte bound.');
  }
  return internalHtml;
}
