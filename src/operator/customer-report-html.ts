import {
  MAX_CUSTOMER_REPORT_JSON_BYTES,
  type CustomerServiceReport,
} from './customer-report.js';

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

export function renderCustomerServiceReportHtml(report: CustomerServiceReport): string {
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

${internalAppendix(report)}
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
