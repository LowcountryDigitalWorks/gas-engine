import { MAX_WQT_NORMALIZED_BYTES, type WqtAdapterConfig } from '../adapters/wqt.js';
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
import {
  MAX_SITE_AUDIT_SELECTIONS,
  composeSiteAuditAnnex,
  type SiteAuditSelection,
} from './site-audit-annex.js';

// An internal presentation wrapper, not a new report schema, delivery artifact,
// authorization capability or report-identity source. Keep the accepted renderer
// and its legacy one-argument HTML byte-for-byte unchanged.
const REPORT_END = '\n</main>\n</body>\n</html>\n';
const INTERNAL_START = '\n<div class="internal" id="measurement-readiness-annex" role="note">\n'
  + '<p><strong>LDW INTERNAL REVIEW ONLY — not approved for customer delivery.'
  + ' These are trusted operator declarations, not verified live provider probes.</strong></p>\n';
const INTERNAL_END = '\n</div>\n';

const STYLE_END = '</style>\n</head>';
const MAIN_START = '<main>\n<header>';
const CLASSIFICATION_ID = 'id="ldw-internal-classification"';
const CLASSIFICATION_BANNER = '<p id="ldw-internal-classification">LDW INTERNAL REVIEW — NOT APPROVED FOR CUSTOMER DELIVERY</p>' + '\n';
const CLASSIFICATION_STYLE = `#ldw-internal-classification{border:2px solid #102a3a;background:#102a3a;color:#fff;padding:.75rem;margin:0 0 1rem;font-weight:700;text-align:center;overflow-wrap:anywhere}
@media screen and (max-width:480px){main{padding:.75rem}}
@media print{
  @page{margin:.7in .55in;
    @top-center{content:"LDW INTERNAL REVIEW — NOT APPROVED FOR CUSTOMER DELIVERY";font:700 9pt system-ui,sans-serif;color:#102a3a}
    @bottom-center{content:"LDW INTERNAL REVIEW — Page " counter(page) " of " counter(pages);font:9pt system-ui,sans-serif;color:#102a3a}
  }
  main{padding:0}#ldw-internal-classification{background:#fff;color:#102a3a;break-inside:avoid}
  thead{display:table-header-group}tr{break-inside:avoid}
}
`;

function addInternalClassification(html: string): string {
  const styleAt = html.indexOf(STYLE_END);
  const mainAt = html.indexOf(MAIN_START);
  if (styleAt < 0 || mainAt <= styleAt
      || styleAt !== html.lastIndexOf(STYLE_END)
      || mainAt !== html.lastIndexOf(MAIN_START)
      || html.includes(CLASSIFICATION_ID)
      || html.includes(CLASSIFICATION_STYLE)) {
    throw new Error('Accepted report HTML template is not suitable for internal classification.');
  }
  return html.replace(STYLE_END, CLASSIFICATION_STYLE + STYLE_END)
    .replace(MAIN_START, '<main>\n' + CLASSIFICATION_BANNER + '<header>');
}

/**
 * Optional separately trusted WQT source for the SAME authoritative
 * tenant-scoped internal report. This is not a customer-delivery capability.
 */
export interface InternalWqtSiteAuditInput {
  readonly normalizedWqtBytes: Uint8Array;
  readonly trustedConfig: WqtAdapterConfig;
  readonly selections: readonly SiteAuditSelection[];
}

/** Snapshot source bytes/config before the first repository await. */
function snapshotSiteAuditInput(input: InternalWqtSiteAuditInput | undefined):
  InternalWqtSiteAuditInput | undefined {
  if (input === undefined) return undefined;
  if (input === null || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).sort().join(',') !== 'normalizedWqtBytes,selections,trustedConfig'
      || !(input.normalizedWqtBytes instanceof Uint8Array)
      || input.normalizedWqtBytes.byteLength > MAX_WQT_NORMALIZED_BYTES
      || !Array.isArray(input.selections)
      || input.selections.length > MAX_SITE_AUDIT_SELECTIONS) {
    throw new Error('Invalid bounded internal WQT source input.');
  }
  try {
    return {
      normalizedWqtBytes: Uint8Array.from(input.normalizedWqtBytes),
      trustedConfig: structuredClone(input.trustedConfig),
      selections: structuredClone(input.selections),
    };
  } catch {
    throw new Error('Internal WQT source input must be cloneable local data.');
  }
}


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
  wqtEvidenceInput?: InternalWqtSiteAuditInput,
): Promise<string> {
  const tenantId = requireTenantContext(context);
  const wqtSnapshot = snapshotSiteAuditInput(wqtEvidenceInput);
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

  // Bind the separately issued WQT config to the CURRENT authoritative
  // workspace on all three scope axes. Matching a URL is not sufficient.
  let siteAudit;
  if (wqtSnapshot !== undefined) {
    const config = wqtSnapshot.trustedConfig;
    if (config === null || typeof config !== 'object' || config.scope === null
        || typeof config.scope !== 'object'
        || config.scope.tenantId !== workspace.scope.tenantId
        || config.scope.siteId !== workspace.scope.siteId
        || config.scope.siteScopeRevisionId !== workspace.scope.siteScopeRevisionId
        || config.expectedTargetOrigin !== workspace.trustedTarget) {
      throw new Error('Internal WQT site audit source does not match trusted workspace scope and target.');
    }
    siteAudit = composeSiteAuditAnnex(
      report, wqtSnapshot.normalizedWqtBytes, config, wqtSnapshot.selections,
    );
  }
  const originalHtml = renderCustomerServiceReportHtml(report, siteAudit);
  if (!originalHtml.endsWith(REPORT_END)
      || originalHtml.indexOf('id="measurement-readiness-annex"') !== -1) {
    throw new Error('Accepted report HTML template is not suitable for internal composition.');
  }
  const classifiedHtml = addInternalClassification(originalHtml);
  const internalHtml = classifiedHtml.slice(0, -REPORT_END.length)
    + INTERNAL_START + fragment + INTERNAL_END + REPORT_END;
  if (Buffer.byteLength(internalHtml, 'utf8') > MAX_CUSTOMER_REPORT_HTML_BYTES) {
    throw new Error('Internal measurement report exceeds the accepted HTML byte bound.');
  }
  return internalHtml;
}
