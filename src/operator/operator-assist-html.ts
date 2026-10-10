import {
  assertOperatorAssistAdvisoryIntegrity,
  assertOperatorAssistPacketIntegrity,
  type OperatorAssistPacket,
  type ValidatedOperatorAssistAdvisory,
} from './operator-assist.js';

export const MAX_OPERATOR_ASSIST_HTML_BYTES = 1_500_000;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function list(values: readonly string[], empty: string): string {
  if (values.length === 0) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `<ul>${values.map((value) => `<li>${escapeHtml(value)}</li>`).join('')}</ul>`;
}

function refs(values: readonly string[]): string {
  return values.map((value) => `<code>${escapeHtml(value)}</code>`).join('<br>');
}

function table(headers: readonly string[], rows: readonly (readonly string[])[], empty: string): string {
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows.length === 0
    ? `<tr><td colspan="${headers.length}">${escapeHtml(empty)}</td></tr>`
    : rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/** Render validated external prose only as escaped, inert, read-only content. */
export function renderOperatorAssistAdvisoryHtml(
  packet: OperatorAssistPacket,
  advisory: ValidatedOperatorAssistAdvisory,
): string {
  assertOperatorAssistPacketIntegrity(packet);
  assertOperatorAssistAdvisoryIntegrity(packet, advisory);

  const provenance = advisory.provenance;
  const provenanceRows = provenance === undefined ? [] : [
    ['Reviewer kind', escapeHtml(provenance.reviewerKind)],
    ['Provider/product label', escapeHtml(provenance.providerLabel ?? 'not supplied')],
    ['Model label', escapeHtml(provenance.modelLabel ?? 'not supplied')],
    ['Reviewed at', escapeHtml(provenance.reviewedAt ?? 'not supplied')],
    ['Method', escapeHtml(provenance.method === undefined ? 'not supplied' : `${provenance.method.label} ${provenance.method.version}`)],
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'">
<title>G.A.S. Release 0.21 operator assist advisory</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102a3a;background:#f7f8f6;line-height:1.45}
*{box-sizing:border-box}body{margin:0}main{max-width:1160px;margin:auto;padding:2rem}h1,h2,h3{line-height:1.2}h1{margin-top:0}
.banner{padding:1rem;border:3px solid #8a3b12;background:#fff4e8;font-weight:800;letter-spacing:.03em;margin:1rem 0}.boundary{padding:1rem;border-left:4px solid #2f766f;background:#fff;margin:1rem 0}.warning{border-left-color:#8a3b12}
section{margin-top:2rem}table{width:100%;border-collapse:collapse;background:#fff;margin:.75rem 0 1.5rem;table-layout:fixed}th,td{border:1px solid #ccd6d5;padding:.55rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f3efe6}code{overflow-wrap:anywhere}.muted{color:#4b5f69}.tag{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.1rem .45rem;font-weight:700;margin-right:.35rem}
pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#fff;border:1px solid #ccd6d5;padding:.65rem}.advisory{white-space:pre-wrap}
@media print{body{background:#fff}main{max-width:none;padding:.35in}.banner,.boundary{break-inside:avoid}table{font-size:9pt}section{break-inside:auto}}
</style>
</head>
<body>
<main>
<header>
<p class="muted">Lowcountry Digital Works · G.A.S. Engine · Release 0.21 read-only operator-assist proof</p>
<h1>Evidence-Grounded Operator Assist Advisory</h1>
<div class="banner">EXTERNAL / AI ADVISORY — UNTRUSTED — HUMAN REVIEW REQUIRED</div>
<div class="boundary warning"><strong>Authority boundary:</strong> This view proves only structural binding to the exact assist packet. External prose, suggested order, provider/model labels, hypotheses, and draft options are not G.A.S. evidence truth, canonical priority, approved recommendations, outcomes, or production actions.</div>
</header>

<section>
<h2>1. Advisory identity / exact source packet</h2>
${table(['Field','Value'], [
  ['Validated advisory ID', `<code>${escapeHtml(advisory.id)}</code>`],
  ['Assist packet ID', `<code>${escapeHtml(packet.id)}</code>`],
  ['Source service brief ID', `<code>${escapeHtml(packet.sourceServiceBriefId)}</code>`],
  ['Advisory version', escapeHtml(advisory.version)],
  ['Review ordering', escapeHtml(advisory.orderingSemantics)],
], 'No identity data.')}
</section>

<section>
<h2>2. Trusted scope context</h2>
${table(['Field','Value'], [
  ['Tenant', `<code>${escapeHtml(packet.scope.tenantId)}</code>`],
  ['Site', `<code>${escapeHtml(packet.scope.siteId)}</code>`],
  ['Scope revision', `<code>${escapeHtml(packet.scope.siteScopeRevisionId)}</code>`],
  ['Trusted target', `<code>${escapeHtml(packet.trustedTarget)}</code>`],
  ['Source brief generated at', escapeHtml(packet.generatedAt)],
], 'No scope data.')}
<p><span class="tag">SELECTORS ONLY</span>Packet IDs, evidence refs, URLs, provider/model labels, and advisory text cannot mint or expand tenant/site/scope authority.</p>
</section>

<section>
<h2>3. Source readiness / limitations</h2>
${table(['Module','State','Reasons'], packet.readiness.map((entry) => [
  escapeHtml(entry.moduleId),
  escapeHtml(entry.state),
  entry.reasons.length === 0 ? '<span class="muted">none</span>' : list(entry.reasons, 'none'),
]), 'No readiness entries.')}
<h3>Source / packet limitations</h3>
${list(packet.limitations, 'No source limitations supplied.')}
</section>

<section>
<h2>4. External summary</h2>
<p class="advisory">${escapeHtml(advisory.summary ?? 'No external summary supplied.')}</p>
<h3>External review provenance — caller supplied, not authenticated identity</h3>
${table(['Field','Value'], provenanceRows, 'No reviewer provenance supplied.')}
</section>

<section>
<h2>5. Suggested review candidates</h2>
<p><span class="tag">ADVISORY ORDER ONLY</span>The row order is external suggested review order and is not canonical G.A.S. priority, severity, business impact, or probability of success.</p>
${table(['Attention ID','External rationale','Supporting refs','Contradicting refs','Uncertainty','Human validation'], advisory.reviewCandidates.map((entry) => [
  `<code>${escapeHtml(entry.attentionId)}</code>`,
  `<span class="advisory">${escapeHtml(entry.rationale)}</span>`,
  refs(entry.supportingEvidenceRefs),
  refs(entry.contradictingEvidenceRefs ?? []),
  `<span class="advisory">${escapeHtml(entry.uncertainty)}</span>`,
  entry.needsHumanValidation ? 'REQUIRED' : 'INVALID',
]), 'No review candidates supplied.')}
</section>

<section>
<h2>6. Exact packet-local evidence references</h2>
${table(['Reference','Kind','Module / attention','Exact inert fact'], packet.evidenceReferences.map((entry) => [
  `<code>${escapeHtml(entry.id)}</code>`,
  escapeHtml(entry.kind),
  escapeHtml([entry.moduleId, entry.attentionId].filter((value) => value !== undefined).join(' · ') || 'packet context'),
  `<pre>${escapeHtml(JSON.stringify(entry.fact, null, 2))}</pre>`,
]), 'No packet-local evidence references.')}
</section>

<section>
<h2>7. Hypotheses</h2>
${table(['Hypothesis','Supporting refs','Contradicting refs','Evidence needed','Uncertainty','Human validation'], advisory.hypotheses.map((entry) => [
  `<span class="advisory">${escapeHtml(entry.text)}</span>`,
  refs(entry.supportingEvidenceRefs),
  refs(entry.contradictingEvidenceRefs ?? []),
  `<span class="advisory">${escapeHtml(entry.evidenceNeededToConfirmOrDisconfirm)}</span>`,
  `<span class="advisory">${escapeHtml(entry.uncertainty)}</span>`,
  entry.needsHumanValidation ? 'REQUIRED' : 'INVALID',
]), 'No hypotheses supplied.')}
</section>

<section>
<h2>8. Questions for human review</h2>
${list(advisory.questionsForHuman, 'No human-review questions supplied.')}
</section>

<section>
<h2>9. Draft recommendation options</h2>
<p>These are external draft options only. They are not Release 0.8 recommendations and carry no canonical priority or execution authority.</p>
${table(['External draft option','Supporting refs','Caveats','Human validation'], advisory.draftRecommendationOptions.map((entry) => [
  `<span class="advisory">${escapeHtml(entry.text)}</span>`,
  refs(entry.supportingEvidenceRefs),
  list(entry.caveats, 'No caveats supplied.'),
  entry.needsHumanValidation ? 'REQUIRED' : 'INVALID',
]), 'No draft recommendation options supplied.')}
</section>

<section>
<h2>10. External limitations / authority boundary</h2>
${list(advisory.limitations, 'No additional external limitations supplied.')}
<div class="boundary warning"><strong>Validation meaning:</strong> accepted structure and exact references resolve to this packet. Validation does not establish that advisory prose is factually correct, complete, causal, authoritative, prioritized, approved, or safe to execute.</div>
</section>

<section>
<h2>11. Human next step</h2>
<div class="boundary"><strong>Required next step:</strong> A human independently chooses what to review and, if warranted, uses the already accepted Release 0.16 HUMAN decision path. Release 0.21 creates no recommendation, outcome, provider/CMS/site mutation, publishing action, customer commitment, or production action.</div>
</section>
</main>
</body>
</html>`;

  if (Buffer.byteLength(html, 'utf8') > MAX_OPERATOR_ASSIST_HTML_BYTES) {
    throw new RangeError('Release 0.21 operator-assist advisory HTML exceeds the output byte bound.');
  }
  return html;
}
