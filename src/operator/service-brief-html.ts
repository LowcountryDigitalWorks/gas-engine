import {
  ServiceBriefError,
  type ServiceBrief,
  type ServiceBriefPageIndexEntry,
  type ServiceBriefReadinessEntry,
} from './service-brief.js';

export const MAX_SERVICE_BRIEF_HTML_BYTES = 2_000_000;

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
  if (typeof value === 'string') return escapeHtml(value);
  if (typeof value === 'number' || typeof value === 'boolean') return escapeHtml(String(value));
  return escapeHtml(JSON.stringify(value));
}

function table(
  caption: string,
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows.length === 0
    ? `<tr><td colspan="${String(headers.length)}">No records supplied.</td></tr>`
    : rows.map((row) =>
      '<tr>' + row.map((cell) => `<td>${text(cell)}</td>`).join('') + '</tr>').join('');
  return `<div class="table-wrap"><table><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function readinessRows(entries: readonly ServiceBriefReadinessEntry[]): readonly (readonly unknown[])[] {
  return entries.map((entry) => [
    entry.moduleId,
    entry.state,
    entry.reasons.length === 0 ? '—' : entry.reasons.join('; '),
  ]);
}

function pageRows(entries: readonly ServiceBriefPageIndexEntry[]): readonly (readonly unknown[])[] {
  return entries.flatMap((entry) =>
    entry.references.map((reference) => [
      entry.url,
      reference.moduleId,
      reference.kind,
      reference.evidenceIdentity,
    ]));
}

function historySection(brief: ServiceBrief): string {
  const history = brief.serviceHistory;
  if (history === undefined) return '<p>Review/history module not supplied.</p>';
  const recommendations = table(
    'Current human-authored recommendations',
    ['ID', 'Lifecycle', 'Revision', 'Priority', 'Authority', 'Updated', 'Rationale'],
    history.currentRecommendations.map((record) => [
      record.id,
      record.lifecycle,
      record.revision,
      record.priority.level,
      record.authorityClass,
      record.updatedAt,
      record.rationale,
    ]),
  );
  const selected = history.selectedHistories.map((entry) => {
    const revisions = table(
      `Immutable recommendation history — ${entry.recommendationId}`,
      ['Revision', 'Lifecycle', 'Priority', 'Updated', 'Rationale'],
      entry.history.map((record) => [
        record.revision,
        record.lifecycle,
        record.priority.level,
        record.updatedAt,
        record.rationale,
      ]),
    );
    const measurements = table(
      `Measurements — ${entry.recommendationId}`,
      ['ID', 'Role', 'Result', 'Comparability', 'Created'],
      entry.measurements.map((record) => [
        record.id,
        record.relationship.role,
        record.result.state,
        record.comparability.state,
        record.createdAt,
      ]),
    );
    const outcomes = table(
      `Human-declared outcomes — ${entry.recommendationId}`,
      ['ID', 'Direction', 'Attribution', 'Created'],
      entry.outcomes.map((record) => [
        record.id,
        record.assessment.direction,
        record.attribution.strength,
        record.createdAt,
      ]),
    );
    return `<article><h3>${escapeHtml(entry.recommendationId)}</h3>${revisions}${measurements}${outcomes}<p>Canonical evidence references resolved: ${String(entry.evidence.length)}</p></article>`;
  }).join('');
  return `
    <div class="counts">
      <p><strong>Recommendation lifecycle counts:</strong> ${text(history.lifecycleCounts)}</p>
      <p><strong>Measurement states:</strong> ${text(history.measurementStateCounts)}</p>
      <p><strong>Human-declared outcome directions:</strong> ${text(history.outcomeDirectionCounts)}</p>
    </div>
    ${recommendations}
    ${selected || '<p>No detailed recommendation histories selected.</p>'}
  `;
}

function searchSection(brief: ServiceBrief): string {
  const report = brief.modules.searchAnalytics;
  if (report === undefined) return '<p>Search Analytics module not supplied.</p>';
  return table(
    'Accepted Search Analytics signals',
    ['Kind', 'Identity', 'Query', 'Page(s)', 'Policy'],
    report.signals.map((signal) => [
      signal.kind,
      signal.id,
      signal.cohort.query,
      signal.cohort.page ?? signal.cohort.pages?.map((page) => page.page).join(' | ') ?? '—',
      `${signal.policy.id}@${signal.policy.version}`,
    ]),
  );
}

function searchChangeSection(brief: ServiceBrief): string {
  return table(
    'Accepted Search Change cohorts',
    ['ID', 'Target page', 'Query', 'Metric', 'Readiness', 'Reasons'],
    brief.modules.searchChanges.map((report) => [
      report.id,
      report.target.page,
      report.target.query,
      report.target.metric,
      report.readiness.state,
      report.readiness.state === 'not_ready' ? report.readiness.reasons.join('; ') : '—',
    ]),
  );
}

function pageFocusSection(brief: ServiceBrief): string {
  return table(
    'Accepted Page Focus reports',
    ['ID', 'Page', 'State', 'Reasons / validation boundary'],
    brief.modules.pageFocus.map((report) => [
      report.id,
      report.page,
      report.state,
      report.state === 'not_ready'
        ? report.reasons.join('; ')
        : report.state === 'no_candidate'
          ? report.reasons.join('; ')
          : report.validationRequirement,
    ]),
  );
}

function discoverySection(brief: ServiceBrief): string {
  const report = brief.modules.discoveryDiagnostics;
  if (report === undefined) return '<p>Discovery Diagnostics module not supplied.</p>';
  const providers = table(
    'Discovery provider readiness',
    ['Provider', 'State', 'Reasons', 'Coverage', 'Availability'],
    report.providerReadiness.map((entry) => [
      entry.providerId,
      entry.state,
      entry.reasons.join('; ') || '—',
      entry.coverageState,
      entry.availabilityState,
    ]),
  );
  const urls = table(
    'Discovery exact-URL reports',
    ['URL', 'State', 'Findings', 'Readiness reasons', 'IndexNow context'],
    report.urls.map((entry) => [
      entry.url,
      entry.state,
      entry.findings.map((finding) => finding.kind).join('; '),
      entry.readinessReasons.join('; ') || '—',
      entry.indexNow.state,
    ]),
  );
  return providers + urls;
}

function aiSection(brief: ServiceBrief): string {
  const report = brief.modules.aiVisibility;
  if (report === undefined) return '<p>AI Visibility module not supplied.</p>';
  const readiness = table(
    'AI visibility provider readiness',
    ['Provider', 'State', 'Reasons'],
    report.readiness.map((entry) => [entry.providerId, entry.state, entry.reasons.join('; ') || '—']),
  );
  const pages = table(
    'Bing cited-page evidence',
    ['URL', 'Citation count', 'Row identity'],
    report.bing.pages.map((page) => [page.url, page.citationCount, page.rowIdentity]),
  );
  const findings = table(
    'AI visibility bounded findings',
    ['Kind', 'Identity / state', 'Provider context'],
    [
      ...report.concentrationFindings.map((finding) => [
        finding.kind,
        finding.id,
        finding.context.join('; '),
      ]),
      ...report.crossSourceFindings.map((finding) => [
        finding.kind,
        finding.id,
        `bing=${finding.bingState}; zerorank=${finding.zeroRankState}`,
      ]),
    ],
  );
  return readiness + pages + findings;
}

export function renderServiceBriefHtml(brief: ServiceBrief): string {
  let html: string;
  try {
    const attention = table(
      'Unranked attention register — deterministic navigation order only',
      ['Order', 'Module', 'Original kind', 'Original state', 'Evidence identity', 'Exact identity', 'Readiness / coverage'],
      brief.attentionRegister.map((item) => [
        item.navigationOrder,
        item.moduleId,
        item.originalKind,
        item.originalState,
        item.evidenceIdentity,
        item.identity,
        item.readinessContext.join('; ') || '—',
      ]),
    );
    const manifest = table(
      'Evidence and provenance manifest',
      ['Module', 'Release', 'Identity', 'Providers', 'Target', 'Source periods', 'Evaluated', 'Readiness', 'Reasons', 'Policy'],
      brief.provenanceManifest.map((entry) => [
        entry.moduleId,
        entry.release,
        entry.identity,
        entry.providerIds.join(', ') || '—',
        entry.target ?? '—',
        entry.sourcePeriods.map((period) => `${period.start} → ${period.end}`).join(' | ') || '—',
        entry.evaluatedAt ?? '—',
        entry.readiness,
        entry.reasons.join('; ') || '—',
        entry.policy === undefined ? '—' : `${entry.policy.id}@${entry.policy.version}`,
      ]),
    );
    const diff = brief.modules.evidenceDiff === undefined
      ? '<p>Evidence diff / operator-case module not supplied.</p>'
      : table(
        'Release 0.7 evidence diff entries',
        ['Cohort', 'State', 'Baseline observation', 'Current observation', 'Reason'],
        brief.modules.evidenceDiff.entries.map((entry) => [
          entry.cohortHash,
          entry.state,
          entry.baselineObservationId ?? '—',
          entry.currentObservationId ?? '—',
          entry.reason ?? '—',
        ]),
      );
    const limitationsHtml = brief.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

    html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; style-src 'unsafe-inline'">
<title>G.A.S. Release 0.15 service brief — ${escapeHtml(brief.scope.siteId)}</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.45;color:#111;background:#fff}
body{max-width:1200px;margin:0 auto;padding:2rem}
h1,h2,h3{line-height:1.2}h2{margin-top:2.5rem;border-bottom:2px solid #333;padding-bottom:.35rem}
code,.mono,td{overflow-wrap:anywhere;word-break:break-word}
.context{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.75rem}
.card{border:1px solid #999;border-radius:.35rem;padding:.8rem}
.table-wrap{overflow-x:auto;margin:1rem 0}table{border-collapse:collapse;width:100%;font-size:.92rem}
caption{text-align:left;font-weight:700;padding:.45rem 0}th,td{border:1px solid #aaa;padding:.45rem;vertical-align:top;text-align:left}
th{background:#f1f1f1}ul{padding-left:1.4rem}
a:focus-visible,[tabindex]:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.note{border-left:4px solid #444;padding:.6rem .9rem;background:#f7f7f7}
@media print{body{max-width:none;padding:0;font-size:10pt}h2{break-after:avoid}.table-wrap{overflow:visible}table{break-inside:auto}tr{break-inside:avoid}.card{break-inside:avoid}}
</style>
</head>
<body>
<header>
<h1>G.A.S. Unified Operator Intelligence &amp; Service Brief</h1>
<p class="note">Release 0.15 candidate / not accepted. Read-only deterministic service-delivery composition; no score, priority, severity, causal conclusion, recommendation generation, remediation, or execution authority.</p>
</header>

<section aria-labelledby="context"><h2 id="context">1. Report context / scope</h2>
<div class="context">
<div class="card"><strong>Brief ID</strong><div class="mono">${escapeHtml(brief.id)}</div></div>
<div class="card"><strong>Tenant</strong><div>${escapeHtml(brief.scope.tenantId)}</div></div>
<div class="card"><strong>Site</strong><div>${escapeHtml(brief.scope.siteId)}</div></div>
<div class="card"><strong>Scope revision</strong><div>${escapeHtml(brief.scope.siteScopeRevisionId)}</div></div>
<div class="card"><strong>Trusted target</strong><div>${escapeHtml(brief.trustedTarget)}</div></div>
<div class="card"><strong>Generated</strong><div>${escapeHtml(brief.generatedAt)}</div></div>
<div class="card"><strong>Policy</strong><div>${escapeHtml(brief.policy.id)}@${escapeHtml(brief.policy.version)}</div></div>
</div></section>

<section aria-labelledby="readiness"><h2 id="readiness">2. Module readiness</h2>
${table('Fixed module readiness matrix', ['Module', 'State', 'Underlying reasons'], readinessRows(brief.readiness))}
</section>

<section aria-labelledby="attention"><h2 id="attention">3. Unranked attention register</h2>
<p>Ordering is fixed deterministic navigation only. It is not a task queue, severity rank, priority rank, or business-impact judgment.</p>
${attention}</section>

<section aria-labelledby="page-index"><h2 id="page-index">4. Exact-page evidence index</h2>
<p>Entries group only exact URL strings. Co-occurrence does not establish correlation or causation.</p>
${table('Exact-string URL evidence references', ['Exact URL', 'Module', 'Kind', 'Evidence identity'], pageRows(brief.exactUrlEvidenceIndex))}
</section>

<section aria-labelledby="history"><h2 id="history">5. Service-history summary</h2>
${historySection(brief)}</section>

<section aria-labelledby="search"><h2 id="search">6. Search Analytics</h2>
${searchSection(brief)}</section>

<section aria-labelledby="change"><h2 id="change">7. Search Change</h2>
${searchChangeSection(brief)}</section>

<section aria-labelledby="focus"><h2 id="focus">8. Page Focus</h2>
${pageFocusSection(brief)}</section>

<section aria-labelledby="discovery"><h2 id="discovery">9. Discovery Diagnostics</h2>
${discoverySection(brief)}</section>

<section aria-labelledby="ai"><h2 id="ai">10. AI Visibility</h2>
${aiSection(brief)}</section>

<section aria-labelledby="manifest"><h2 id="manifest">11. Evidence / provenance manifest</h2>
${manifest}</section>

<section aria-labelledby="limits"><h2 id="limits">12. Limitations / authority notes</h2>
<ul>${limitationsHtml}</ul>
<h3>Evidence-diff detail</h3>
${diff}
</section>
</body>
</html>`;
  } catch (error) {
    if (error instanceof ServiceBriefError) throw error;
    throw new ServiceBriefError('invalid_output', 'Release 0.15 service-brief HTML rendering failed.');
  }

  if (Buffer.byteLength(html, 'utf8') > MAX_SERVICE_BRIEF_HTML_BYTES) {
    throw new ServiceBriefError('bound_exceeded', 'Release 0.15 service-brief HTML exceeds the output byte bound.');
  }
  return html;
}
