import {
  MAX_CUSTOMER_REPORT_JSON_BYTES,
  type CustomerServiceReport,
} from './customer-report.js';
import type { SiteAuditAnnex } from './site-audit-annex.js';

export const MAX_CUSTOMER_REPORT_HTML_BYTES = 1_500_000;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function text(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return escapeHtml(String(value));
  }
  return escapeHtml(JSON.stringify(value));
}

function list(items: readonly string[], empty: string): string {
  if (items.length === 0) return `<p class="empty">${escapeHtml(empty)}</p>`;
  return '<ul>' + items.map((item) => `<li>${escapeHtml(item)}</li>`).join('') + '</ul>';
}

function table(
  caption: string,
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
  empty: string,
): string {
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows.length === 0
    ? `<tr><td colspan="${String(headers.length)}">${escapeHtml(empty)}</td></tr>`
    : rows.map((row) =>
      '<tr>' + row.map((cell) => `<td>${text(cell)}</td>`).join('') + '</tr>').join('');
  return `<div class="table-wrap"><table><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function decisionSection(report: CustomerServiceReport): string {
  const decision = report.decision;
  if (decision === undefined) {
    return '<p class="empty">No Release 0.16 decision cycle is included in this reporting workspace.</p>';
  }
  const outcomes = table(
    'Recorded human outcomes',
    ['Direction', 'Human rationale / reason', 'Attribution', 'Recorded at'],
    decision.humanOutcomes.map((outcome) => [
      outcome.direction,
      outcome.rationale,
      outcome.attribution,
      outcome.createdAt,
    ]),
    'No human outcome is recorded for the current decision cycle.',
  );
  return `
  <dl class="facts">
    <div><dt>Human disposition</dt><dd>${escapeHtml(decision.disposition)}</dd></div>
    <div><dt>Decision readiness</dt><dd>${escapeHtml(decision.readiness)}</dd></div>
    <div><dt>Recommendation status</dt><dd>${escapeHtml(decision.recommendationLifecycle ?? 'not created')}</dd></div>
    <div><dt>Measurement plan</dt><dd>${decision.measurementPlanned ? 'present' : 'not planned'}</dd></div>
    <div><dt>Recorded measurements</dt><dd>${String(decision.recordedMeasurementCount)}</dd></div>
  </dl>
  <p><strong>Human decision summary:</strong> ${escapeHtml(decision.summary)}</p>
  ${decision.recommendationRationale === undefined
    ? ''
    : `<p><strong>Human recommendation rationale:</strong> ${escapeHtml(decision.recommendationRationale)}</p>`}
  ${outcomes}`;
}

function siteAuditSection(report: CustomerServiceReport, annex: SiteAuditAnnex | undefined): string {
  if (annex === undefined) return '';
  if (annex.reportId !== report.id || annex.siteId !== report.context.siteId
      || annex.target !== report.context.target
      || !/^site-audit-annex:[0-9a-f]{64}$/.test(annex.id)
      || !/^[0-9a-f]{64}$/.test(annex.inputSha256)
      || annex.selected.length > 3) {
    throw new Error('Internal site audit annex is not bound to this exact report and accepted source.');
  }
  const sourceTable = table(
    'Original WQT source availability and timing',
    ['Source', 'Trusted availability', 'Native version', 'Source-reported time', 'Source observations'],
    annex.sources.map((source) => [
      source.provider, source.availability, source.version ?? 'not supplied',
      source.reportedAt ?? 'not supplied', source.observationCount ?? 'not verified',
    ]),
    'No WQT sources are present.',
  );
  const selectionTable = table(
    'Explicitly human-selected WQT technical observations — not ranked',
    ['Source', 'Exact audit ID', 'Source status / display mode', 'Source score 0–1', 'Source text / typed facts'],
    annex.selected.map((item) => [
      item.provider,
      item.code,
      item.provider === 'siteone' ? item.sourceStatus ?? 'unknown' : item.sourceMode ?? 'unknown',
      item.sourceScore === null ? 'n/a — unscored / unavailable' : item.sourceScore,
      [
        item.sourceText ?? 'no source text',
        item.sourceDisplay === null ? '' : 'Source display: ' + item.sourceDisplay,
        item.sourceFacts.length === 0 ? '' : 'Facts: ' + item.sourceFacts.map((fact) =>
          fact.id + '=' + (fact.value === null ? 'unknown' : String(fact.value))
          + (fact.unit === null ? '' : ' ' + fact.unit)).join('; '),
      ].filter(Boolean).join(' | '),
    ]),
    'No technical observations were selected by the human reviewer; this is not a passed audit.',
  );
  return `<section id="site-audit" class="internal">
  <h2>Internal technical site audit evidence annex — not approved for customer delivery</h2>
  <p>Source-only. WQT observations are not LDW scores, priorities, rankings, health conclusions or remediation decisions. This annex is separate from the report identity and delivery authorization.</p>
  <dl class="facts">
    <div><dt>WQT site ID</dt><dd>${escapeHtml(annex.wqtSiteId)}</dd></div>
    <div><dt>Original normalized WQT SHA-256</dt><dd><code>${escapeHtml(annex.inputSha256)}</code></dd></div>
    <div><dt>Trusted collection observed at</dt><dd>${escapeHtml(annex.observedAt)}</dd></div>
  </dl>
  ${sourceTable}
  ${selectionTable}
  ${list(annex.limitations, 'No recorded source limitations.')}
  <p>Consult the separately authorized WQT raw/source-native HTML evidence for full detail; the original report remains unchanged when this optional annex is omitted.</p>
  </section>
`;
}

function internalAppendix(report: CustomerServiceReport): string {
  const appendix = report.internalAppendix;
  if (appendix === undefined) return '';
  return `
  <section id="internal" class="internal">
    <h2>LDW internal appendix — remove before customer delivery when not required</h2>
    <p>This appendix contains deterministic internal provenance identifiers. It is visually separated from the customer-safe body.</p>
    <dl class="facts">
      <div><dt>Workspace ID</dt><dd><code>${escapeHtml(appendix.workspaceId)}</code></dd></div>
      <div><dt>Service brief ID</dt><dd><code>${escapeHtml(appendix.serviceBriefId)}</code></dd></div>
      <div><dt>Decision dossier ID</dt><dd><code>${escapeHtml(appendix.decisionCycleDossierId ?? '—')}</code></dd></div>
      <div><dt>Selected internal attention IDs</dt><dd>${escapeHtml(appendix.selectedAttentionIds.join(', '))}</dd></div>
    </dl>
  </section>`;
}

export function renderCustomerServiceReportHtml(report: CustomerServiceReport, siteAudit?: SiteAuditAnnex): string {
  const readiness = table(
    'Evidence readiness and limitations',
    ['Module', 'State', 'Reasons / limitations'],
    report.readiness.map((entry) => [
      entry.moduleId.replaceAll('_', ' '),
      entry.state,
      entry.reasons.length === 0 ? 'No additional reason recorded.' : entry.reasons.join('; '),
    ]),
    'No readiness entries are available.',
  );
  const focus = table(
    'Human-selected focus items',
    ['Evidence area', 'Kind', 'Observed state', 'Customer-safe reference', 'Readiness context'],
    report.focusItems.map((item) => [
      item.moduleId.replaceAll('_', ' '),
      item.kind,
      item.state,
      item.label,
      item.readinessContext.length === 0 ? '—' : item.readinessContext.join('; '),
    ]),
    'No focus items were selected.',
  );
  const sources = table(
    'Method and source notes',
    ['Module', 'Release', 'Provider(s)', 'Source period(s)', 'Readiness', 'Notes'],
    report.sourceNotes.map((entry) => [
      entry.moduleId.replaceAll('_', ' '),
      entry.release,
      entry.providers.length === 0 ? '—' : entry.providers.join(', '),
      entry.periods.length === 0 ? '—' : entry.periods.map((period) => `${period.start} → ${period.end}`).join('; '),
      entry.readiness,
      entry.reasons.length === 0 ? '—' : entry.reasons.join('; '),
    ]),
    'No source notes were supplied.',
  );

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
<title>${escapeHtml(report.title)}</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102a3a;background:#f7f8f6;line-height:1.5}
*{box-sizing:border-box}body{margin:0}main{max-width:1100px;margin:auto;padding:2rem}h1,h2{line-height:1.2}h1{margin-top:0}
header{border-bottom:3px solid #2f766f;padding-bottom:1rem}.eyebrow{font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#2f766f}
.context,.summary,.note{background:#fff;border:1px solid #d5dcda;border-radius:.55rem;padding:1rem;margin:1rem 0}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:.75rem}.facts div{background:#fff;border:1px solid #d5dcda;border-radius:.5rem;padding:.75rem}
dt{font-weight:700}dd{margin:.3rem 0 0;overflow-wrap:anywhere}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff;table-layout:fixed}
caption{text-align:left;font-weight:700;padding:.5rem 0}th,td{border:1px solid #d5dcda;padding:.55rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f3efe6}
section{margin-top:2rem}.empty{font-style:italic;color:#4b5f69}.internal{border:3px dashed #7a4e00;padding:1rem;background:#fff9e8}code{overflow-wrap:anywhere}
@media print{body{background:#fff}main{max-width:none;padding:.35in}.internal{break-before:page}.table-wrap{overflow:visible}table{font-size:9pt}section{break-inside:auto}}
</style>
</head>
<body>
<main>
<header>
<p class="eyebrow">Lowcountry Digital Works · G.A.S. service report</p>
<h1>${escapeHtml(report.title)}</h1>
<p>Generated ${escapeHtml(report.createdAt)} for site ${escapeHtml(report.context.siteId)}.</p>
</header>

<section id="context">
<h2>1. Report context / period</h2>
<div class="context">
<p><strong>Target:</strong> ${escapeHtml(report.context.target)}</p>
${report.context.periods.length === 0
  ? '<p>No explicit source period is available for the supplied evidence.</p>'
  : list(report.context.periods.map((period) => `${period.start} → ${period.end}`), 'No source periods supplied.')}
</div>
</section>

<section id="summary">
<h2>2. Executive summary</h2>
<div class="summary"><p>${escapeHtml(report.executiveSummary)}</p></div>
</section>

<section id="readiness">
<h2>3. Evidence readiness / limitations</h2>
${readiness}
${list(report.limitations, 'No additional limitations were recorded.')}
</section>

<section id="changes">
<h2>4. What changed / what was observed</h2>
${list(report.observedChanges, 'No human-authored change notes were supplied.')}
</section>

<section id="focus">
<h2>5. Human-selected focus items</h2>
<p>These items were explicitly selected for customer discussion. Their presence here is not an automatic G.A.S. ranking or priority score.</p>
${focus}
</section>

<section id="decision">
<h2>6. Recommendation / decision / measurement status</h2>
${decisionSection(report)}
</section>

<section id="next-review">
<h2>7. Next review / not-yet-measurable state</h2>
<div class="note"><p>${escapeHtml(report.nextReview)}</p></div>
</section>

<section id="methods">
<h2>8. Method / source notes</h2>
${sources}
<p>This report preserves provider/source-specific readiness and does not blend unlike evidence into a universal score.</p>
</section>

${siteAuditSection(report, siteAudit)}${internalAppendix(report)}
</main>
</body>
</html>
`;

  if (Buffer.byteLength(html, 'utf8') > MAX_CUSTOMER_REPORT_HTML_BYTES) {
    throw new Error('Release 0.17 customer report HTML exceeds the output byte bound.');
  }
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > MAX_CUSTOMER_REPORT_JSON_BYTES) {
    throw new Error('Release 0.17 customer report model exceeds the JSON byte bound.');
  }
  return html;
}
