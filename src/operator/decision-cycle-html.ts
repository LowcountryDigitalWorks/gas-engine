import {
  DecisionCycleError,
  type DecisionCycleDossier,
} from './decision-cycle.js';

export const MAX_DECISION_DOSSIER_HTML_BYTES = 2_000_000;

function escapeHtml(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function table(
  caption: string,
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  if (rows.length === 0) return '<p>None recorded.</p>';
  const head = headers.map((header) => '<th scope="col">' + escapeHtml(header) + '</th>').join('');
  const body = rows.map((row) =>
    '<tr>' + row.map((cell) => '<td>' + escapeHtml(cell) + '</td>').join('') + '</tr>',
  ).join('');
  return '<div class="table-wrap" tabindex="0"><table><caption>' + escapeHtml(caption)
    + '</caption><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>';
}

function recommendationRows(dossier: DecisionCycleDossier): readonly (readonly unknown[])[] {
  const state = dossier.recommendation;
  if (state === undefined) return [];
  const rows: unknown[][] = [];
  if (state.candidate !== undefined) {
    rows.push([
      'candidate',
      state.candidate.id,
      state.candidate.revision,
      state.candidate.lifecycle,
      state.candidate.priority.level,
      state.candidate.authorityClass,
      state.candidate.rationale,
      state.candidate.updatedAt,
    ]);
  }
  if (state.current !== undefined) {
    rows.push([
      'current',
      state.current.id,
      state.current.revision,
      state.current.lifecycle,
      state.current.priority.level,
      state.current.authorityClass,
      state.current.rationale,
      state.current.updatedAt,
    ]);
  }
  return rows;
}

function historyRows(dossier: DecisionCycleDossier): readonly (readonly unknown[])[] {
  return (dossier.recommendation?.history ?? []).map((record) => [
    record.revision,
    record.lifecycle,
    record.priority.level,
    record.authorityClass,
    record.rationale,
    record.createdAt,
    record.updatedAt,
  ]);
}

function attentionRows(dossier: DecisionCycleDossier): readonly (readonly unknown[])[] {
  return dossier.selectedAttention.map((item) => [
    item.navigationOrder,
    item.id,
    item.moduleId,
    item.originalKind,
    item.originalState,
    item.evidenceIdentity,
    item.identity,
    item.readinessContext.join('; ') || '—',
  ]);
}

function measurementRows(dossier: DecisionCycleDossier): readonly (readonly unknown[])[] {
  return dossier.recordedMeasurements.map((record) => [
    record.id,
    record.relationship.role,
    record.result.state,
    record.comparability.state,
    record.dueWindow.start + ' → ' + record.dueWindow.end,
    record.methodology.id + '@' + record.methodology.version,
    record.createdAt,
  ]);
}

function outcomeRows(dossier: DecisionCycleDossier): readonly (readonly unknown[])[] {
  return dossier.humanOutcomes.map((record) => [
    record.id,
    record.assessment.direction,
    record.attribution.strength,
    record.recommendationId ?? '—',
    record.createdAt,
    record.assessment,
  ]);
}

function measurementPlanSection(dossier: DecisionCycleDossier): string {
  const plan = dossier.measurementPlan;
  if (plan === undefined) return '<p>No Release 0.11 Search Change measurement plan supplied.</p>';
  return [
    table(
      'Accepted Release 0.11 search-change plan',
      ['Plan ID', 'Annotation', 'Query', 'Exact page', 'Metric', 'Readiness', 'Reasons'],
      [[
        plan.id,
        plan.annotation.id + ': ' + plan.annotation.summary,
        plan.target.query,
        plan.target.page,
        plan.target.metric,
        plan.readiness.state,
        plan.readiness.state === 'not_ready' ? plan.readiness.reasons.join('; ') : '—',
      ]],
    ),
    table(
      'Prepared measurements',
      ['Role', 'Measurement ID', 'Result state', 'Comparability', 'Canonical observation anchor'],
      [
        [
          'baseline',
          plan.baseline.measurement.id,
          plan.baseline.measurement.result.state,
          plan.baseline.measurement.comparability.state,
          plan.baseline.cohortObservationId,
        ],
        [
          'follow_up',
          plan.followUp.measurement.id,
          plan.followUp.measurement.result.state,
          plan.followUp.measurement.comparability.state,
          plan.followUp.cohortObservationId,
        ],
      ],
    ),
  ].join('');
}

export function renderDecisionCycleDossierHtml(dossier: DecisionCycleDossier): string {
  let html: string;
  try {
    const refs = dossier.decision.references.map((reference) => reference.kind + ': ' + reference.value);
    const provenance = table(
      'Decision-cycle provenance',
      ['Source brief', 'Selected evidence identities', 'Recommendation', 'Measurement plan', 'Measurements', 'Outcomes'],
      [[
        dossier.provenance.sourceServiceBriefId,
        dossier.provenance.selectedAttentionEvidenceIdentities.join(' | ') || '—',
        dossier.provenance.recommendationId ?? '—',
        dossier.provenance.measurementPlanId ?? '—',
        dossier.provenance.measurementIds.join(', ') || '—',
        dossier.provenance.outcomeIds.join(', ') || '—',
      ]],
    );
    const authority = dossier.authorityNotes.map((item) => '<li>' + escapeHtml(item) + '</li>').join('');
    const limits = dossier.limitations.map((item) => '<li>' + escapeHtml(item) + '</li>').join('');

    html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; style-src 'unsafe-inline'">
<title>G.A.S. Release 0.16 decision dossier — ${escapeHtml(dossier.scope.siteId)}</title>
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
.table-wrap:focus-visible,a:focus-visible,[tabindex]:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.note{border-left:4px solid #444;padding:.6rem .9rem;background:#f7f7f7}
@media print{body{max-width:none;padding:0;font-size:10pt}h2{break-after:avoid}.table-wrap{overflow:visible}table{break-inside:auto}tr{break-inside:avoid}.card{break-inside:avoid}}
</style>
</head>
<body>
<header>
<h1>G.A.S. Human Decision &amp; Measurement Cycle Dossier</h1>
<p class="note">Release 0.16 candidate / not accepted. Internal human work-cycle record only; no priority, severity, business-impact score, automatic outcome direction, recommendation generation, remediation, publishing, or production action authority.</p>
</header>

<section aria-labelledby="context"><h2 id="context">1. Decision context / trusted scope</h2>
<div class="context">
<div class="card"><strong>Dossier ID</strong><div class="mono">${escapeHtml(dossier.id)}</div></div>
<div class="card"><strong>Tenant</strong><div>${escapeHtml(dossier.scope.tenantId)}</div></div>
<div class="card"><strong>Site</strong><div>${escapeHtml(dossier.scope.siteId)}</div></div>
<div class="card"><strong>Scope revision</strong><div>${escapeHtml(dossier.scope.siteScopeRevisionId)}</div></div>
<div class="card"><strong>Trusted target</strong><div>${escapeHtml(dossier.trustedTarget)}</div></div>
<div class="card"><strong>Generated</strong><div>${escapeHtml(dossier.generatedAt)}</div></div>
<div class="card"><strong>Evaluated</strong><div>${escapeHtml(dossier.evaluatedAt)}</div></div>
<div class="card"><strong>Policy</strong><div>${escapeHtml(dossier.policy.id)}@${escapeHtml(dossier.policy.version)}</div></div>
</div></section>

<section aria-labelledby="source"><h2 id="source">2. Source service brief</h2>
${table('Recomputed accepted Release 0.15 source brief', ['Brief ID', 'Version', 'Generated'], [[
  dossier.sourceServiceBrief.id,
  dossier.sourceServiceBrief.version,
  dossier.sourceServiceBrief.generatedAt,
]])}</section>

<section aria-labelledby="attention"><h2 id="attention">3. Human-selected attention</h2>
<p>Selection means only that the human chose to review these exact Release 0.15 items. The order is not a G.A.S. ranking.</p>
${table(
  'Exact selected Release 0.15 attention',
  ['Order', 'Attention ID', 'Module', 'Kind', 'State', 'Evidence identity', 'Exact identity', 'Readiness / coverage'],
  attentionRows(dossier),
)}</section>

<section aria-labelledby="decision"><h2 id="decision">4. Human decision</h2>
${table('Human-authored decision statement', ['Decision ID', 'Disposition', 'Recorded', 'Summary', 'Exact selected IDs', 'Explicit selected-evidence references'], [[
  dossier.decision.id,
  dossier.decision.disposition,
  dossier.decision.recordedAt,
  dossier.decision.summary,
  dossier.decision.selectedAttentionIds.join(', '),
  refs.join(' | ') || '—',
]])}</section>

<section aria-labelledby="recommendation"><h2 id="recommendation">5. Recommendation status / history</h2>
${table('Candidate/current canonical recommendation', ['State', 'ID', 'Revision', 'Lifecycle', 'Priority', 'Authority', 'Human rationale', 'Updated'], recommendationRows(dossier))}
${table('Immutable Release 0.8 recommendation history', ['Revision', 'Lifecycle', 'Priority', 'Authority', 'Human rationale', 'Created', 'Updated'], historyRows(dossier))}
</section>

<section aria-labelledby="plan"><h2 id="plan">6. Search-change / measurement plan</h2>
${measurementPlanSection(dossier)}</section>

<section aria-labelledby="readiness"><h2 id="readiness">7. Follow-up readiness</h2>
${table('Deterministic accepted-state projection', ['State', 'Underlying reasons'], [[
  dossier.readiness.state,
  dossier.readiness.reasons.join('; ') || '—',
]])}
<p>Readiness is a direct projection of accepted recommendation/measurement/outcome records and Release 0.11 readiness. It is not a quality, health, success, or impact score.</p>
</section>

<section aria-labelledby="measurements"><h2 id="measurements">8. Recorded measurements</h2>
${table('Persisted accepted Release 0.8 measurements', ['ID', 'Role', 'Result', 'Comparability', 'Due window', 'Methodology', 'Created'], measurementRows(dossier))}
</section>

<section aria-labelledby="outcome"><h2 id="outcome">9. Human outcome</h2>
${table('Persisted human-declared Release 0.8 outcomes', ['ID', 'Direction', 'Attribution', 'Recommendation', 'Created', 'Assessment'], outcomeRows(dossier))}
</section>

<section aria-labelledby="provenance"><h2 id="provenance">10. Provenance</h2>
${provenance}</section>

<section aria-labelledby="authority"><h2 id="authority">11. Authority / limitations</h2>
<h3>Authority notes</h3><ul>${authority}</ul>
<h3>Limitations</h3><ul>${limits}</ul>
</section>
</body>
</html>`;
  } catch (error) {
    if (error instanceof DecisionCycleError) throw error;
    throw new DecisionCycleError('invalid_output', 'Release 0.16 decision dossier HTML rendering failed.');
  }

  if (Buffer.byteLength(html, 'utf8') > MAX_DECISION_DOSSIER_HTML_BYTES) {
    throw new DecisionCycleError('bound_exceeded', 'Release 0.16 decision dossier HTML exceeds the output byte bound.');
  }
  return html;
}
