import { createHash } from 'node:crypto';
import type { Contract } from '../contracts/wire.js';
import {
  OPERATOR_WORKSPACE_VERSION,
  type OperatorWorkspace,
  type OperatorWorkspaceEvidenceRow,
} from './workspace.js';

export const MAX_OPERATOR_WORKSPACE_HTML_BYTES = 3_000_000;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function attr(value: string): string {
  return escapeHtml(value);
}

function text(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return escapeHtml(String(value));
  }
  return escapeHtml(JSON.stringify(value));
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

function evidenceReference(row: OperatorWorkspaceEvidenceRow): string {
  if (row.url !== undefined) return row.url;
  if (row.query !== undefined) return row.query;
  if (row.promptId !== undefined) return 'prompt:' + row.promptId;
  if (row.cohortHash !== undefined) return 'cohort:' + row.cohortHash;
  return row.evidenceIdentity;
}

function outcomeRationale(outcome: Contract<'outcome'>): string {
  switch (outcome.assessment.direction) {
    case 'improved':
    case 'regressed':
    case 'unchanged':
      return outcome.assessment.rationale;
    case 'inconclusive':
    case 'not_due':
    case 'not_measured':
      return outcome.assessment.reason;
  }
}

function recommendationSection(workspace: OperatorWorkspace): string {
  const dossier = workspace.decisionCycle;
  if (dossier === undefined) return '<p class="empty">No Release 0.16 decision cycle supplied for this workspace.</p>';
  const current = dossier.recommendation?.current ?? dossier.recommendation?.candidate;
  const history = table(
    'Recommendation lifecycle / revision history',
    ['Revision', 'Lifecycle', 'Updated', 'Human rationale'],
    (dossier.recommendation?.history ?? []).map((record) => [
      record.revision,
      record.lifecycle,
      record.updatedAt,
      record.rationale,
    ]),
    'No persisted recommendation revisions are present.',
  );
  const measurements = table(
    'Exact current-cycle recorded measurements',
    ['Role', 'Result', 'Comparability', 'Created'],
    dossier.recordedMeasurements.map((record) => [
      record.relationship.role,
      record.result.state,
      record.comparability.state,
      record.createdAt,
    ]),
    'No exact current-cycle measurements are recorded.',
  );
  const outcomes = table(
    'Current-cycle human outcomes',
    ['Direction', 'Human rationale / reason', 'Attribution', 'Created'],
    dossier.humanOutcomes.map((record) => [
      record.assessment.direction,
      outcomeRationale(record),
      record.attribution.strength,
      record.createdAt,
    ]),
    'No human outcome is recorded for the current cycle.',
  );
  const plan = dossier.measurementPlan;
  const planHtml = plan === undefined
    ? '<p class="empty">No Release 0.11 Search Change measurement plan supplied.</p>'
    : `<dl class="facts">
      <div><dt>Plan readiness</dt><dd>${escapeHtml(plan.readiness.state)}</dd></div>
      <div><dt>Baseline state</dt><dd>${escapeHtml(plan.baseline.measurement.result.state)}</dd></div>
      <div><dt>Follow-up state</dt><dd>${escapeHtml(plan.followUp.measurement.result.state)}</dd></div>
      <div><dt>Current recorded pair</dt><dd>${String(dossier.recordedMeasurements.length)} record(s)</dd></div>
    </dl>`;

  return `
  <div class="notice"><strong>Human decision:</strong> ${escapeHtml(dossier.decision.disposition)} — ${escapeHtml(dossier.decision.summary)}</div>
  <dl class="facts">
    <div><dt>Current readiness</dt><dd>${escapeHtml(dossier.readiness.state)}</dd></div>
    <div><dt>Recommendation</dt><dd>${escapeHtml(current?.lifecycle ?? 'not created')}</dd></div>
    <div><dt>Selected attention</dt><dd>${String(dossier.selectedAttention.length)}</dd></div>
    <div><dt>Human outcomes</dt><dd>${String(dossier.humanOutcomes.length)}</dd></div>
  </dl>
  ${current === undefined ? '' : `<p><strong>Human recommendation rationale:</strong> ${escapeHtml(current.rationale)}</p>`}
  ${history}
  <h3>Search Change measurement plan</h3>
  ${planHtml}
  ${measurements}
  ${outcomes}`;
}

function sourceRows(workspace: OperatorWorkspace): readonly (readonly unknown[])[] {
  return workspace.sourceManifest.map((entry) => [
    entry.moduleId,
    entry.release,
    entry.providerIds.length === 0 ? '—' : entry.providerIds.join(', '),
    entry.sourcePeriods.length === 0
      ? '—'
      : entry.sourcePeriods.map((period) => `${period.start} → ${period.end}`).join('; '),
    entry.readiness,
    entry.reasons.length === 0 ? '—' : entry.reasons.join('; '),
  ]);
}

function evidenceRows(workspace: OperatorWorkspace): string {
  if (workspace.evidenceRows.length === 0) {
    return '<tr><td colspan="6">No evidence/attention rows are available.</td></tr>';
  }
  return workspace.evidenceRows.map((row) => {
    const search = [
      row.moduleId,
      row.kind,
      row.state,
      row.evidenceIdentity,
      row.url ?? '',
      row.query ?? '',
      row.promptId ?? '',
      row.cohortHash ?? '',
    ].join(' ').toLowerCase();
    return `<tr class="evidence-row" data-module="${attr(row.moduleId)}" data-state="${attr(row.state)}" data-search="${attr(search)}">
      <td>${escapeHtml(row.moduleId.replaceAll('_', ' '))}</td>
      <td>${escapeHtml(row.kind)}</td>
      <td>${escapeHtml(row.state)}</td>
      <td>${escapeHtml(evidenceReference(row))}</td>
      <td><code>${escapeHtml(row.evidenceIdentity)}</code></td>
      <td>${escapeHtml(row.readinessContext.length === 0 ? '—' : row.readinessContext.join('; '))}</td>
    </tr>`;
  }).join('');
}

function attentionRows(workspace: OperatorWorkspace, className: string): string {
  if (workspace.attention.length === 0) return '<p class="empty">No attention items are present.</p>';
  return workspace.attention.map((item) => {
    const ref = item.identity.url
      ?? item.identity.query
      ?? (item.identity.promptId === undefined ? undefined : 'prompt:' + item.identity.promptId)
      ?? (item.identity.cohortHash === undefined ? undefined : 'cohort:' + item.identity.cohortHash)
      ?? item.evidenceIdentity;
    return `<label class="check-row">
      <input type="checkbox" class="${className}" value="${attr(item.id)}">
      <span><strong>${escapeHtml(item.moduleId.replaceAll('_', ' '))}</strong> · ${escapeHtml(item.originalKind)} · ${escapeHtml(item.originalState)}<br><small>${escapeHtml(ref)}</small></span>
    </label>`;
  }).join('');
}

function actionOptions(workspace: OperatorWorkspace): string {
  const dossier = workspace.decisionCycle;
  if (dossier === undefined) return '<option value="">No decision cycle available</option>';
  const options = ['<option value="commit_recommendation">Commit prepared recommendation</option>'];
  if (dossier.recommendation?.current !== undefined) {
    options.push('<option value="transition_recommendation">Transition recommendation</option>');
    options.push('<option value="revise_recommendation">Revise recommendation</option>');
  }
  if (dossier.measurementPlan !== undefined) {
    options.push('<option value="commit_measurement">Commit exact prepared measurement</option>');
  }
  options.push('<option value="commit_outcome">Commit human outcome</option>');
  return options.join('');
}

function measurementOptions(workspace: OperatorWorkspace): string {
  const plan = workspace.decisionCycle?.measurementPlan;
  if (plan === undefined) return '<option value="">No prepared measurement plan</option>';
  return `
    <option value="baseline" data-id="${attr(plan.baseline.measurement.id)}">Baseline — exact current prepared ID</option>
    <option value="follow_up" data-id="${attr(plan.followUp.measurement.id)}">Follow-up — exact current prepared ID</option>`;
}

function buildScript(workspace: OperatorWorkspace): string {
  const workspaceId = JSON.stringify(workspace.id);
  const briefId = JSON.stringify(workspace.source.serviceBriefId);
  const dossierId = workspace.source.decisionCycleDossierId === undefined
    ? 'null'
    : JSON.stringify(workspace.source.decisionCycleDossierId);
  return `'use strict';
const VERSION=${JSON.stringify(OPERATOR_WORKSPACE_VERSION)};
const WORKSPACE_ID=${workspaceId};
const BRIEF_ID=${briefId};
const DOSSIER_ID=${dossierId};
const qs=(selector)=>document.querySelector(selector);
const qsa=(selector)=>Array.from(document.querySelectorAll(selector));
function setMessage(id,message,isError=false){const node=qs(id);if(!node)return;node.textContent=message;node.classList.toggle('error',isError);}
function downloadJson(value,name){const text=JSON.stringify(value,null,2)+'\\n';if(new TextEncoder().encode(text).byteLength>256000){throw new Error('Downloaded request exceeds the browser convenience bound.');}const blob=new Blob([text],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}
qsa('[data-nav]').forEach((button)=>button.addEventListener('click',()=>{const target=button.dataset.nav;qsa('[data-panel]').forEach((panel)=>{panel.hidden=panel.dataset.panel!==target;});qsa('[data-nav]').forEach((item)=>item.setAttribute('aria-pressed',String(item===button)));const heading=qs('#'+target+' h2');if(heading)heading.focus();}));
function applyEvidenceFilter(){const moduleValue=qs('#evidence-module').value;const stateValue=qs('#evidence-state').value;const query=qs('#evidence-text').value.trim().toLowerCase();qsa('.evidence-row').forEach((row)=>{const show=(!moduleValue||row.dataset.module===moduleValue)&&(!stateValue||row.dataset.state===stateValue)&&(!query||(row.dataset.search||'').includes(query));row.hidden=!show;});}
['#evidence-module','#evidence-state','#evidence-text'].forEach((selector)=>{const node=qs(selector);node.addEventListener(selector==='#evidence-text'?'input':'change',applyEvidenceFilter);});
qs('#reset-evidence').addEventListener('click',()=>{qs('#evidence-module').value='';qs('#evidence-state').value='';qs('#evidence-text').value='';applyEvidenceFilter();});
qs('#download-action').addEventListener('click',()=>{try{const type=qs('#action-type').value;const actionId=qs('#action-id').value.trim();const createdAt=qs('#action-created-at').value.trim();if(!type||!actionId||!createdAt)throw new Error('Action type, stable action ID, and createdAt are required.');let action;if(type==='commit_recommendation'){action={type};}else if(type==='commit_measurement'){const select=qs('#measurement-role');const option=select.options[select.selectedIndex];if(!option||!option.dataset.id)throw new Error('Choose an exact current prepared measurement.');action={type,role:select.value,expectedMeasurementId:option.dataset.id};}else{const raw=qs('#action-payload').value.trim();if(!raw)throw new Error('This action requires a JSON payload.');const parsed=JSON.parse(raw);action=type==='commit_outcome'?{type,outcome:parsed}:{type,input:parsed};}const artifact={version:VERSION,actionId,createdAt,workspaceId:WORKSPACE_ID,sourceBriefId:BRIEF_ID,action};if(DOSSIER_ID!==null)artifact.sourceDossierId=DOSSIER_ID;downloadJson(artifact,'gas-operator-action.json');setMessage('#action-message','Action request downloaded. It is untrusted until Node-side recomputation succeeds.');}catch(error){setMessage('#action-message',error instanceof Error?error.message:'Unable to build action request.',true);}});
qs('#download-report-request').addEventListener('click',()=>{try{const selected=qsa('.report-select:checked').map((node)=>node.value);if(selected.length<1||selected.length>3)throw new Error('Select between one and three customer focus items.');const requestId=qs('#report-request-id').value.trim();const createdAt=qs('#report-created-at').value.trim();const title=qs('#report-title').value.trim();const executiveSummary=qs('#report-summary').value.trim();const nextReview=qs('#report-next-review').value.trim();if(!requestId||!createdAt||!title||!executiveSummary||!nextReview)throw new Error('Report ID, createdAt, title, executive summary, and next review are required.');const observedChanges=qs('#report-changes').value.split('\\n').map((value)=>value.trim()).filter(Boolean).slice(0,12);const request={version:VERSION,requestId,createdAt,workspaceId:WORKSPACE_ID,sourceBriefId:BRIEF_ID,title,executiveSummary,selectedAttentionIds:selected,observedChanges,nextReview,includeInternalAppendix:qs('#report-internal').checked};if(DOSSIER_ID!==null)request.sourceDossierId=DOSSIER_ID;downloadJson(request,'gas-customer-report-request.json');setMessage('#report-message','Report request downloaded. Node-side recomputation will revalidate every selection.');}catch(error){setMessage('#report-message',error instanceof Error?error.message:'Unable to build report request.',true);}});
qs('#print-workspace').addEventListener('click',()=>window.print());`;
}

export function renderOperatorWorkspaceHtml(workspace: OperatorWorkspace): string {
  const modules = [...new Set(workspace.evidenceRows.map((row) => row.moduleId))].sort();
  const states = [...new Set(workspace.evidenceRows.map((row) => row.state))].sort();
  const script = buildScript(workspace);
  const scriptHash = createHash('sha256').update(script, 'utf8').digest('base64');
  const readiness = table(
    'Module/source readiness',
    ['Module', 'State', 'Reasons'],
    workspace.readiness.map((entry) => [
      entry.moduleId,
      entry.state,
      entry.reasons.length === 0 ? '—' : entry.reasons.join('; '),
    ]),
    'No readiness entries supplied.',
  );
  const sources = table(
    'Source / method manifest',
    ['Module', 'Release', 'Provider(s)', 'Source period(s)', 'Readiness', 'Reasons'],
    sourceRows(workspace),
    'No source manifest entries supplied.',
  );
  const timeline = table(
    'Reverse-chronological accepted history',
    ['At', 'Kind', 'State', 'Description', 'Internal reference'],
    workspace.timeline.map((entry) => [
      entry.at,
      entry.kind,
      entry.state,
      entry.label,
      entry.referenceId ?? '—',
    ]),
    'No immutable history entries are available.',
  );

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
<title>G.A.S. Operator Workspace — ${escapeHtml(workspace.scope.siteId)}</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102a3a;background:#eef2f0;line-height:1.45}
*{box-sizing:border-box}body{margin:0}.shell{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100vh}
aside{background:#102a3a;color:#fff;padding:1.25rem;position:sticky;top:0;height:100vh;overflow:auto}aside h1{font-size:1.2rem;margin:.2rem 0 1rem}
nav{display:grid;gap:.45rem}nav button{font:inherit;text-align:left;border:1px solid #8db8b2;background:transparent;color:#fff;border-radius:.45rem;padding:.6rem .7rem;cursor:pointer}
nav button[aria-pressed="true"]{background:#f3efe6;color:#102a3a}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:3px solid #d7b655;outline-offset:2px}
main{padding:1.5rem;max-width:1400px;width:100%}header.workspace-head{background:#fff;border:1px solid #d1dada;border-radius:.65rem;padding:1rem;margin-bottom:1rem}
.badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.15rem .5rem;font-weight:700;letter-spacing:.03em}.warning{color:#7a4e00}.good{color:#2f766f}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:.75rem}.card,.notice,.form-card{background:#fff;border:1px solid #d1dada;border-radius:.6rem;padding:.85rem}.card strong{display:block;font-size:1.45rem}
[data-panel]{max-width:1180px}[data-panel][hidden]{display:none}h2{line-height:1.2;outline:none}h3{margin-top:1.5rem}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff;table-layout:fixed}
caption{text-align:left;font-weight:700;padding:.5rem 0}th,td{border:1px solid #d1dada;padding:.55rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f3efe6}
.filters{display:flex;flex-wrap:wrap;gap:.7rem;align-items:end;background:#fff;border:1px solid #d1dada;border-radius:.6rem;padding:.8rem;margin-bottom:.8rem}
label.field{display:grid;gap:.25rem;min-width:180px;flex:1}.field input,.field select,.field textarea,textarea{font:inherit;width:100%;padding:.5rem;border:1px solid #8ca0a5;border-radius:.35rem;background:#fff;color:#102a3a}
.check-list{display:grid;gap:.5rem}.check-row{display:flex;gap:.6rem;align-items:flex-start;background:#fff;border:1px solid #d1dada;border-radius:.5rem;padding:.65rem}.check-row input{margin-top:.25rem}.check-row small{overflow-wrap:anywhere}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}.facts div{background:#fff;border:1px solid #d1dada;border-radius:.5rem;padding:.7rem}dt{font-weight:700}dd{margin:.2rem 0 0;overflow-wrap:anywhere}
.actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.7rem}button.primary{background:#2f766f;color:#fff;border:0;border-radius:.4rem;padding:.6rem .85rem;font-weight:700;cursor:pointer}button.secondary{background:#fff;color:#102a3a;border:1px solid #7d9298;border-radius:.4rem;padding:.6rem .85rem;cursor:pointer}
.notice{border-left:4px solid #2f766f}.empty{font-style:italic;color:#53666d}.message{min-height:1.4em;font-weight:700;color:#2f766f}.message.error{color:#9a2d20}.mono,code{overflow-wrap:anywhere}
textarea{min-height:110px}.report-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.full{grid-column:1/-1}
@media(max-width:800px){.shell{grid-template-columns:1fr}aside{position:static;height:auto}.report-grid{grid-template-columns:1fr}.full{grid-column:auto}}
@media print{aside,.interactive-only{display:none!important}.shell{display:block}main{padding:.3in;max-width:none}[data-panel]{display:block!important;break-before:page}header.workspace-head{break-after:avoid}.table-wrap{overflow:visible}table{font-size:8.5pt}}
</style>
</head>
<body>
<div class="shell">
<aside>
<p class="badge">INTERNAL WORKBENCH</p>
<h1>G.A.S. Operator Workspace</h1>
<nav aria-label="Workspace sections">
<button type="button" data-nav="overview" aria-pressed="true">1. Overview</button>
<button type="button" data-nav="evidence" aria-pressed="false">2. Evidence / readiness</button>
<button type="button" data-nav="attention" aria-pressed="false">3. Attention</button>
<button type="button" data-nav="decision" aria-pressed="false">4. Decision cycle</button>
<button type="button" data-nav="history" aria-pressed="false">5. History / timeline</button>
<button type="button" data-nav="reports" aria-pressed="false">6. Reports</button>
</nav>
<div class="actions"><button type="button" class="secondary" id="print-workspace">Print workspace</button></div>
</aside>
<main>
<header class="workspace-head">
<p><span class="badge">UNTRUSTED BROWSER LAYER</span></p>
<h1>${escapeHtml(workspace.trustedTarget)}</h1>
<p><strong>Site:</strong> ${escapeHtml(workspace.scope.siteId)} · <strong>Scope revision:</strong> ${escapeHtml(workspace.scope.siteScopeRevisionId)}</p>
<p>The browser can filter, select, and download request artifacts. It cannot create authority or write accepted G.A.S. state.</p>
</header>

<section id="overview" data-panel="overview">
<h2 tabindex="-1">1. Overview</h2>
<div class="cards">
<div class="card"><strong>${String(workspace.navigation.overview.attentionCount)}</strong>Unranked attention items</div>
<div class="card"><strong>${String(workspace.navigation.overview.exactUrlCount)}</strong>Exact URLs indexed</div>
<div class="card"><strong>${String(workspace.navigation.evidence.sourceCount)}</strong>Source/module entries</div>
<div class="card"><strong>${String(workspace.navigation.decisionCycle.recordedMeasurementCount)}</strong>Current-cycle measurements</div>
<div class="card"><strong>${String(workspace.navigation.decisionCycle.humanOutcomeCount)}</strong>Human outcomes</div>
</div>
<h3>Readiness / freshness / coverage</h3>
${readiness}
<h3>Authority / limitations</h3>
<div class="notice"><strong>No universal health score.</strong> Readiness states remain source-specific and missing/zero/unavailable are not collapsed.</div>
<ul>${workspace.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
</section>

<section id="evidence" data-panel="evidence" hidden>
<h2 tabindex="-1">2. Evidence / readiness</h2>
<div class="filters interactive-only">
<label class="field">Module<select id="evidence-module"><option value="">All modules</option>${modules.map((value) => `<option value="${attr(value)}">${escapeHtml(value.replaceAll('_',' '))}</option>`).join('')}</select></label>
<label class="field">State<select id="evidence-state"><option value="">All states</option>${states.map((value) => `<option value="${attr(value)}">${escapeHtml(value)}</option>`).join('')}</select></label>
<label class="field">Text filter<input id="evidence-text" type="search" autocomplete="off" placeholder="URL, query, kind, identity"></label>
<button type="button" class="secondary" id="reset-evidence">Reset filters</button>
</div>
${sources}
<div class="table-wrap"><table><caption>Accepted evidence/attention drill-down</caption><thead><tr><th scope="col">Module</th><th scope="col">Kind</th><th scope="col">State</th><th scope="col">Exact reference</th><th scope="col">Evidence identity</th><th scope="col">Readiness context</th></tr></thead><tbody>${evidenceRows(workspace)}</tbody></table></div>
</section>

<section id="attention" data-panel="attention" hidden>
<h2 tabindex="-1">3. Attention</h2>
<div class="notice warning"><strong>Human review choice — not G.A.S. priority.</strong> Checkbox selection is presentation state only and never changes the accepted Release 0.15 attention register.</div>
<div class="check-list">${attentionRows(workspace,'attention-select')}</div>
</section>

<section id="decision" data-panel="decision" hidden>
<h2 tabindex="-1">4. Decision cycle</h2>
${recommendationSection(workspace)}
<div class="form-card interactive-only">
<h3>Prepare an untrusted action request</h3>
<p>Downloaded JSON is only a request. Node-side Release 0.17 recomputes the workspace, checks the exact source IDs, and then delegates to accepted Release 0.16/0.8.</p>
<div class="report-grid">
<label class="field">Action type<select id="action-type">${actionOptions(workspace)}</select></label>
<label class="field">Measurement role<select id="measurement-role">${measurementOptions(workspace)}</select></label>
<label class="field">Stable action ID<input id="action-id" type="text" maxlength="128" value="operator-action-001"></label>
<label class="field">Created at<input id="action-created-at" type="text" value="${attr(workspace.generatedAt)}"></label>
<label class="field full">Action-specific JSON payload<textarea id="action-payload" maxlength="120000" placeholder="Transition/revision input or canonical human outcome JSON. Commit recommendation and measurement actions do not use this field."></textarea></label>
</div>
<div class="actions"><button type="button" class="primary" id="download-action">Download action request JSON</button></div>
<p class="message" id="action-message" role="status" aria-live="polite"></p>
</div>
</section>

<section id="history" data-panel="history" hidden>
<h2 tabindex="-1">5. History / timeline</h2>
<p>Reverse-chronological projection of accepted immutable Release 0.15/0.16/0.8 history. No second changelog database is created.</p>
${timeline}
</section>

<section id="reports" data-panel="reports" hidden>
<h2 tabindex="-1">6. Reports</h2>
<div class="notice"><strong>Customer report selection is human supplied and limited to three primary focus items.</strong> Selection order is not an automatic ranking.</div>
<div class="form-card interactive-only">
<div class="report-grid">
<label class="field">Stable report request ID<input id="report-request-id" maxlength="128" value="customer-report-request-001"></label>
<label class="field">Created at<input id="report-created-at" value="${attr(workspace.generatedAt)}"></label>
<label class="field full">Report title<input id="report-title" maxlength="240" value="Search & visibility service review"></label>
<label class="field full">Human-authored executive summary<textarea id="report-summary" maxlength="5000" placeholder="Write the customer-facing executive summary."></textarea></label>
<label class="field full">Observed changes — one human-authored item per line<textarea id="report-changes" maxlength="12000" placeholder="Observed change 1&#10;Observed change 2"></textarea></label>
<label class="field full">Next review / not-yet-measurable note<textarea id="report-next-review" maxlength="2000" placeholder="State what will be reviewed next or why follow-up is not yet measurable."></textarea></label>
</div>
<h3>Select 1–3 customer focus items</h3>
<div class="check-list">${attentionRows(workspace,'report-select')}</div>
<label class="check-row"><input type="checkbox" id="report-internal"><span>Include clearly separated LDW internal provenance appendix</span></label>
<div class="actions"><button type="button" class="primary" id="download-report-request">Download report request JSON</button></div>
<p class="message" id="report-message" role="status" aria-live="polite"></p>
</div>
</section>

</main>
</div>
<script>${script}</script>
</body>
</html>
`;

  if (Buffer.byteLength(html, 'utf8') > MAX_OPERATOR_WORKSPACE_HTML_BYTES) {
    throw new Error('Release 0.17 operator workspace HTML exceeds the output byte bound.');
  }
  return html;
}
