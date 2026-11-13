import { createHash } from 'node:crypto';
import type { Contract } from '../contracts/wire.js';
import { analyzeTopicPageCoverage } from '../analysis/topic-page-coverage.js';
import { DECISION_CYCLE_HARD_LIMITS } from './decision-cycle.js';
import {
  OPERATOR_WORKSPACE_VERSION,
  OperatorWorkspaceError,
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
    return '<tr><td colspan="7">No evidence/attention rows are available.</td></tr>';
  }
  return workspace.evidenceRows.map((row) => {
    const search = [
      row.moduleId,
      row.kind,
      row.state,
      row.evidenceIdentity,
      row.providerIds.join(' '),
      row.url ?? '',
      row.query ?? '',
      row.promptId ?? '',
      row.cohortHash ?? '',
    ].join(' ').toLowerCase();
    return `<tr class="evidence-row" data-module="${attr(row.moduleId)}" data-state="${attr(row.state)}" data-providers="${attr('|' + row.providerIds.join('|') + '|')}" data-search="${attr(search)}">
      <td>${escapeHtml(row.moduleId.replaceAll('_', ' '))}</td>
      <td>${escapeHtml(row.providerIds.length === 0 ? '—' : row.providerIds.join(', '))}</td>
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
  const decisionPolicy = workspace.decisionCycle?.policy ?? {
    id: 'release-017-browser-decision-policy',
    version: '1.0.0',
    maxSelectedAttentionItems: Math.min(
      DECISION_CYCLE_HARD_LIMITS.selectedAttentionItems,
      workspace.policy.maxAttentionRows,
    ),
  };
  const dossierId = workspace.source.decisionCycleDossierId === undefined
    ? 'null'
    : JSON.stringify(workspace.source.decisionCycleDossierId);
  return `'use strict';
const VERSION=${JSON.stringify(OPERATOR_WORKSPACE_VERSION)};
const WORKSPACE_ID=${workspaceId};
const BRIEF_ID=${briefId};
const DOSSIER_ID=${dossierId};
const DECISION_POLICY=${JSON.stringify(decisionPolicy)};
const WORKSPACE_EVALUATED_AT=${JSON.stringify(workspace.evaluatedAt)};
const qs=(selector)=>document.querySelector(selector);
const qsa=(selector)=>Array.from(document.querySelectorAll(selector));
const mode=qs('#theme-toggle');
mode.addEventListener('click',()=>{const light=document.documentElement.dataset.theme!=='light';document.documentElement.dataset.theme=light?'light':'dark';mode.setAttribute('aria-checked',String(light));mode.textContent=light?'Light mode: on':'Light mode: off';});
function setMessage(id,message,isError=false){const node=qs(id);if(!node)return;node.textContent=message;node.classList.toggle('error',isError);}
function downloadJson(value,name){const text=JSON.stringify(value,null,2)+'\\n';if(new TextEncoder().encode(text).byteLength>256000){throw new Error('Downloaded request exceeds the browser convenience bound.');}const blob=new Blob([text],{type:'application/json'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);}
qsa('[data-nav]').forEach((button)=>button.addEventListener('click',()=>{const target=button.dataset.nav;qsa('[data-panel]').forEach((panel)=>{panel.hidden=panel.dataset.panel!==target;});qsa('[data-nav]').forEach((item)=>item.setAttribute('aria-pressed',String(item===button)));const heading=qs('#'+target+' h2');if(heading)heading.focus();}));
function applyEvidenceFilter(){const providerValue=qs('#evidence-provider').value;const moduleValue=qs('#evidence-module').value;const stateValue=qs('#evidence-state').value;const query=qs('#evidence-text').value.trim().toLowerCase();qsa('.evidence-row').forEach((row)=>{const providers=row.dataset.providers||'|';const show=(!providerValue||providers.includes('|'+providerValue+'|'))&&(!moduleValue||row.dataset.module===moduleValue)&&(!stateValue||row.dataset.state===stateValue)&&(!query||(row.dataset.search||'').includes(query));row.hidden=!show;});}
['#evidence-provider','#evidence-module','#evidence-state','#evidence-text'].forEach((selector)=>{const node=qs(selector);node.addEventListener(selector==='#evidence-text'?'input':'change',applyEvidenceFilter);});
qs('#reset-evidence').addEventListener('click',()=>{qs('#evidence-provider').value='';qs('#evidence-module').value='';qs('#evidence-state').value='';qs('#evidence-text').value='';applyEvidenceFilter();});
function collectObservedChanges(raw){const values=raw.split('\\n').map((value)=>value.trim()).filter(Boolean);if(values.length>12)throw new Error('Observed changes may contain at most 12 non-empty lines. Nothing was downloaded.');return values;}
qs('#download-decision-request').addEventListener('click',()=>{try{const selected=qsa('.attention-select:checked').map((node)=>node.value);const decisionId=qs('#decision-id').value.trim();const disposition=qs('#decision-disposition').value;const summary=qs('#decision-summary').value.trim();const recordedAt=qs('#decision-recorded-at').value.trim();if(selected.length<1)throw new Error('Select at least one Attention item for human review.');if(selected.length>DECISION_POLICY.maxSelectedAttentionItems)throw new Error('Selected Attention exceeds the current Release 0.16 policy bound.');if(!decisionId||!disposition||!summary||!recordedAt)throw new Error('Decision ID, disposition, human summary, and recordedAt are required.');const action={type:'prepare_decision',selectedAttentionIds:selected,decision:{id:decisionId,disposition,summary,recordedAt},policy:DECISION_POLICY,generatedAt:recordedAt,evaluatedAt:WORKSPACE_EVALUATED_AT};const artifact={version:VERSION,actionId:decisionId,createdAt:recordedAt,workspaceId:WORKSPACE_ID,sourceBriefId:BRIEF_ID,action};if(DOSSIER_ID!==null)artifact.sourceDossierId=DOSSIER_ID;downloadJson(artifact,'gas-prepare-human-decision.json');setMessage('#decision-message','Human decision request downloaded. It remains untrusted until Node-side authoritative recomputation succeeds; preparation itself persists no recommendation, measurement, outcome, or action.');}catch(error){setMessage('#decision-message',error instanceof Error?error.message:'Unable to build human decision request.',true);}});
qs('#download-action').addEventListener('click',()=>{try{const type=qs('#action-type').value;const actionId=qs('#action-id').value.trim();const createdAt=qs('#action-created-at').value.trim();if(!type||!actionId||!createdAt)throw new Error('Action type, stable action ID, and createdAt are required.');let action;if(type==='commit_recommendation'){action={type};}else if(type==='commit_measurement'){const select=qs('#measurement-role');const option=select.options[select.selectedIndex];if(!option||!option.dataset.id)throw new Error('Choose an exact current prepared measurement.');action={type,role:select.value,expectedMeasurementId:option.dataset.id};}else{const raw=qs('#action-payload').value.trim();if(!raw)throw new Error('This action requires a JSON payload.');const parsed=JSON.parse(raw);action=type==='commit_outcome'?{type,outcome:parsed}:{type,input:parsed};}const artifact={version:VERSION,actionId,createdAt,workspaceId:WORKSPACE_ID,sourceBriefId:BRIEF_ID,action};if(DOSSIER_ID!==null)artifact.sourceDossierId=DOSSIER_ID;downloadJson(artifact,'gas-operator-action.json');setMessage('#action-message','Action request downloaded. It is untrusted until Node-side recomputation succeeds.');}catch(error){setMessage('#action-message',error instanceof Error?error.message:'Unable to build action request.',true);}});
qs('#download-report-request').addEventListener('click',()=>{try{const selected=qsa('.report-select:checked').map((node)=>node.value);if(selected.length<1||selected.length>3)throw new Error('Select between one and three customer focus items.');const requestId=qs('#report-request-id').value.trim();const createdAt=qs('#report-created-at').value.trim();const title=qs('#report-title').value.trim();const executiveSummary=qs('#report-summary').value.trim();const nextReview=qs('#report-next-review').value.trim();if(!requestId||!createdAt||!title||!executiveSummary||!nextReview)throw new Error('Report ID, createdAt, title, executive summary, and next review are required.');const observedChanges=collectObservedChanges(qs('#report-changes').value);const request={version:VERSION,requestId,createdAt,workspaceId:WORKSPACE_ID,sourceBriefId:BRIEF_ID,title,executiveSummary,selectedAttentionIds:selected,observedChanges,nextReview,includeInternalAppendix:qs('#report-internal').checked};if(DOSSIER_ID!==null)request.sourceDossierId=DOSSIER_ID;downloadJson(request,'gas-customer-report-request.json');setMessage('#report-message','Report request downloaded. Node-side recomputation will revalidate every selection.');}catch(error){setMessage('#report-message',error instanceof Error?error.message:'Unable to build report request.',true);}});
qs('#print-workspace').addEventListener('click',()=>window.print());`;
}


/**
 * Pure, optional presentation over the already-accepted Release 0.26 analyzer.
 * A single cloned trusted-host invocation supplies both the validated report and
 * authored topic/page labels. The untrusted HTML never accepts a result as authority.
 */
function renderTopicPageEvidenceMatrix(workspace: OperatorWorkspace, invocation: unknown): string {
  const heading = '<h3>Topic–page evidence matrix (local / human-authored mapping)</h3>';
  if (invocation === undefined) {
    return heading + '<p class="empty">Not assessed — no trusted topic/page invocation was supplied. This is not evidence of a content gap or a zero.</p>';
  }

  let snapshot: unknown;
  try {
    snapshot = structuredClone(invocation);
  } catch {
    throw new OperatorWorkspaceError('invalid_request', 'Topic-page presentation input must be cloneable local evidence.');
  }
  // This call must succeed before any original authored labels, pages or rows
  // are used. Its source/window/scope/assignment checks are never duplicated or weakened.
  const report = analyzeTopicPageCoverage(snapshot);
  if (report.scope.tenantId !== workspace.scope.tenantId
      || report.scope.siteId !== workspace.scope.siteId
      || report.scope.siteScopeRevisionId !== workspace.scope.siteScopeRevisionId) {
    throw new OperatorWorkspaceError('scope_mismatch', 'Topic-page report is outside the trusted workspace scope.');
  }

  const sourceInput = snapshot as {
    readonly topics: readonly { readonly topicId: string; readonly label: string }[];
    readonly pages: readonly { readonly pageId: string; readonly url: string }[];
  };
  let targetOrigin: string;
  try {
    const trustedTarget = new URL(workspace.trustedTarget);
    if (trustedTarget.protocol !== 'https:' || trustedTarget.username || trustedTarget.password
        || trustedTarget.hash || trustedTarget.search) {
      throw new Error('Noncanonical trusted target');
    }
    targetOrigin = trustedTarget.origin;
  } catch {
    throw new OperatorWorkspaceError('target_mismatch', 'Topic-page presentation requires an HTTPS trusted workspace target.');
  }

  const topicLabels = new Map(sourceInput.topics.map((topic) => [topic.topicId, topic.label]));
  const pageUrls = new Map(sourceInput.pages.map((page) => [page.pageId, page.url]));
  for (const page of sourceInput.pages) {
    // The analyzer validates HTTPS and the GSC property boundary. Preserve
    // identity with its normalized URL rather than display an unnormalized
    // caller string as if it were the canonical page.
    const canonical = new URL(page.url);
    if (canonical.href !== page.url) {
      throw new OperatorWorkspaceError('invalid_request', 'Topic-page presentation requires canonical authored URLs.');
    }
    if (canonical.origin !== targetOrigin) {
      throw new OperatorWorkspaceError('target_mismatch', 'Authored page is outside the trusted workspace origin.');
    }
  }

  const matrixRows = report.topicPageCoverageRows.map((row) => {
    const label = topicLabels.get(row.topicId);
    // 'unassigned' is a valid human page ID as well as the analyzer's
    // no-page sentinel. Disambiguate by the authoritative mapping state,
    // never by the opaque page ID's spelling.
    const isUnmapped = row.mapping === 'unmapped';
    const url = isUnmapped ? undefined : pageUrls.get(row.pageId);
    if (label === undefined || (!isUnmapped && url === undefined)) {
      throw new OperatorWorkspaceError('invalid_output', 'Validated topic/page identity cannot be resolved for presentation.');
    }
    return [
      label,
      row.topicId,
      url ?? 'No page assigned by a human',
      row.mapping,
      row.evidenceState,
      row.reason,
    ];
  });
  // One original query×page observation per row. Never sum impressions/clicks
  // across queries or interpret omitted/unavailable source rows as numeric zero.
  const observationRows = report.topicPageCoverageRows.flatMap((row) =>
    (row.evidenceRows ?? []).map((item) => [
      row.topicId, row.pageId, item.queryId, item.sourceRecordId,
      item.rowIdentity, item.clicks, item.impressions,
    ]));
  const sourceRowsForMatrix = report.source.state === 'present'
    ? [[
        report.source.providerId, report.source.property, report.source.collectionId,
        JSON.stringify(report.source.method), JSON.stringify(report.source.period),
        JSON.stringify(report.source.freshness), JSON.stringify(report.source.coverage),
      ]]
    : [];
  return heading
    + '<div class="notice"><strong>Interpretation limit:</strong> Authored assignments are human mapping, not rankings or automatically discovered content gaps. '
    + 'GSC query/page rows may be non-exhaustive. A not_returned or unavailable state is not zero or proof of no demand. '
    + 'No content action is generated.</div>'
    + '<p><strong>Coverage outcome:</strong> ' + text(report.summary.outcome)
    + ' · <strong>Human editorial review required:</strong> yes'
    + ' · <strong>Source limitations:</strong> ' + text(report.summary.sourceLimitations.join('; '))
    + ' · <strong>Exact report identity:</strong> <code>' + text(report.id) + '</code></p>'
    + table(
        'Accepted topic-to-existing-page pairs (no inferred missing pages)',
        ['Human topic label', 'Topic ID', 'Authored canonical page URL', 'Mapping', 'Evidence state', 'Exact reason'],
        matrixRows,
        'No authored topic/page assignments were returned.',
      )
    + table(
        'Original GSC source/method/freshness/coverage, when supplied',
        ['Provider', 'Property', 'Collection ID', 'Method', 'Window', 'Freshness', 'Coverage'],
        sourceRowsForMatrix,
        'No GSC source window was supplied; all mapped-pair evidence remains unavailable.',
      )
    + table(
        'Exact independently observed query×page rows — no metric aggregation',
        ['Topic ID', 'Page ID', 'Query ID', 'Original source record', 'Row identity', 'Observed clicks', 'Observed impressions'],
        observationRows,
        'No individual observed GSC query×page rows. This does not establish measured zero.',
      );
}

export function renderOperatorWorkspaceHtml(workspace: OperatorWorkspace, topicPageInvocation?: unknown): string {
  const providers = [...new Set(workspace.evidenceRows.flatMap((row) => row.providerIds))].sort();
  const modules = [...new Set(workspace.evidenceRows.map((row) => row.moduleId))].sort();
  const states = [...new Set(workspace.evidenceRows.map((row) => row.state))].sort();
  const script = buildScript(workspace);
  const scriptHash = createHash('sha256').update(script, 'utf8').digest('base64');
  const stateCounts = table(
    'Evidence / attention state counts',
    ['State', 'Count'],
    workspace.navigation.overview.evidenceStateCounts.map((entry) => [entry.state, entry.count]),
    'No evidence/attention states are present.',
  );
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
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
<title>G.A.S. Operator Workspace — ${escapeHtml(workspace.scope.siteId)}</title>
<style>
/* G.A.S. Signal Glass: product-specific spectral violet + cool cyan identity.
   Dark is intentional default; light mode is user-selected and session-only. */
:root{
  color-scheme:dark;
  --gas-bg:#0b101b;--gas-rail:#0e1726;--gas-surface:#162235;
  --gas-raised:#1d2b41;--gas-head:#1b2840;--gas-ink:#f1f5fb;
  --gas-muted:#b4c3d9;--gas-border:#36455e;--gas-control-border:#738aaa;
  --gas-accent:#a59bff;--gas-on-accent:#0a1020;--gas-link:#b8b0ff;
  --gas-focus:#fbcb75;--gas-success:#92e5cf;--gas-warning:#ffd58c;
  --gas-error:#ffb4b7;--gas-selected:#302c55;
  --gas-glass:rgba(21,32,53,.94);--gas-shadow:0 16px 36px rgba(0,0,0,.23);
  font-family:"Manrope",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  color:var(--gas-ink);background:var(--gas-bg);line-height:1.5;
}
html[data-theme="light"]{
  color-scheme:light;
  --gas-bg:#eff3fa;--gas-rail:#e4e8f7;--gas-surface:#ffffff;
  --gas-raised:#f5f7fd;--gas-head:#f8f9ff;--gas-ink:#17213b;
  --gas-muted:#3d4c69;--gas-border:#c5cedf;--gas-control-border:#63718a;
  --gas-accent:#5146be;--gas-on-accent:#ffffff;--gas-link:#4838ad;
  --gas-focus:#4531ab;--gas-success:#14654e;--gas-warning:#8b4d09;
  --gas-error:#9c2030;--gas-selected:#dcd8fd;
  --gas-glass:rgba(248,249,255,.95);--gas-shadow:0 12px 32px rgba(34,43,83,.1);
}
*{box-sizing:border-box}
body{margin:0;color:var(--gas-ink);background:var(--gas-bg);
  background-image:radial-gradient(circle at 98% 0%,rgba(133,122,242,.12),transparent 33rem)}
.shell{display:grid;grid-template-columns:250px minmax(0,1fr);min-height:100vh}
aside{background:var(--gas-rail);color:var(--gas-ink);border-right:1px solid var(--gas-border);
  padding:1.25rem;position:sticky;top:0;height:100vh;overflow:auto}
aside h1{font-size:1.16rem;line-height:1.25;margin:.55rem 0 1.1rem;letter-spacing:-.02em}
.gas-product-subtitle{display:block;font-size:.77rem;font-weight:550;letter-spacing:.08em;text-transform:uppercase;color:var(--gas-muted);margin-top:.23rem}
nav{display:grid;gap:.45rem}
nav button{font:inherit;text-align:left;min-height:44px;border:1px solid var(--gas-control-border);
  background:transparent;color:var(--gas-ink);border-radius:999px;padding:.62rem .85rem;cursor:pointer;
  transition:background-color .16s ease,border-color .16s ease}
nav button:hover{background:var(--gas-raised);border-color:var(--gas-accent)}
nav button[aria-pressed="true"]{background:var(--gas-selected);border-color:var(--gas-accent);color:var(--gas-ink)}
main{padding:clamp(1rem,2.5vw,2rem);max-width:1400px;width:100%;min-width:0}
header.workspace-head{background:var(--gas-head);border:1px solid var(--gas-border);
  border-radius:24px;padding:clamp(1rem,2vw,1.5rem);margin-bottom:1rem;box-shadow:var(--gas-shadow)}
header.workspace-head h1{margin:.25rem 0;overflow-wrap:anywhere}
.badge{display:inline-block;border:1px solid var(--gas-border);color:var(--gas-ink);
  border-radius:999px;padding:.2rem .6rem;font-weight:700;letter-spacing:.035em}
.warning{color:var(--gas-warning)}.good{color:var(--gas-success)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:.75rem}
.card,.notice,.form-card,.filters,.check-row,.facts div{background:var(--gas-surface);
  color:var(--gas-ink);border:1px solid var(--gas-border);border-radius:16px;padding:.85rem;
  box-shadow:0 3px 12px rgba(0,0,0,.06)}
.card strong{display:block;font-size:1.45rem;letter-spacing:-.025em}
[data-panel]{max-width:1180px}[data-panel][hidden]{display:none}
h2{line-height:1.2;outline:none}h3{margin-top:1.5rem}
.table-wrap{overflow-x:auto;max-width:100%;border-radius:12px}
table{width:100%;border-collapse:collapse;background:var(--gas-surface);
  color:var(--gas-ink);table-layout:fixed}
caption{text-align:left;font-weight:700;padding:.5rem 0}
th,td{border:1px solid var(--gas-border);padding:.55rem;text-align:left;
  vertical-align:top;overflow-wrap:anywhere}
th{background:var(--gas-raised)}
.filters{display:flex;flex-wrap:wrap;gap:.7rem;align-items:end;margin-bottom:.8rem}
label.field{display:grid;gap:.25rem;min-width:180px;flex:1}
.field input,.field select,.field textarea,textarea{
  font:inherit;width:100%;padding:.65rem;border:1px solid var(--gas-control-border);
  border-radius:10px;background:var(--gas-raised);color:var(--gas-ink)}
.check-list{display:grid;gap:.5rem}
.check-row{display:flex;gap:.6rem;align-items:flex-start}
.check-row input{margin-top:.25rem;accent-color:var(--gas-accent)}
.check-row small{overflow-wrap:anywhere}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.7rem}
dt{font-weight:700}dd{margin:.2rem 0 0;overflow-wrap:anywhere}
.actions{display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.7rem}
button.primary,button.secondary,.mode-toggle{font:inherit;min-height:44px;border-radius:999px;
  padding:.65rem 1rem;cursor:pointer}
button.primary{background:var(--gas-accent);color:var(--gas-on-accent);
  border:1px solid var(--gas-accent);font-weight:700}
button.primary:hover{filter:brightness(1.08)}
button.secondary,.mode-toggle{background:var(--gas-raised);color:var(--gas-ink);
  border:1px solid var(--gas-control-border)}
button.secondary:hover,.mode-toggle:hover{border-color:var(--gas-accent)}
.mode-toggle[aria-checked="true"]{border-color:var(--gas-accent);
  box-shadow:inset 0 0 0 1px var(--gas-accent)}
button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,
a:focus-visible{outline:3px solid var(--gas-focus);outline-offset:3px}
.notice{border-left:4px solid var(--gas-accent)}
.empty{font-style:italic;color:var(--gas-muted)}
.message{min-height:1.4em;font-weight:700;color:var(--gas-success)}
.message.error{color:var(--gas-error)}
.mono,code{overflow-wrap:anywhere}
a{color:var(--gas-link)}a:hover{text-decoration-thickness:2px}
textarea{min-height:110px}
.report-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.full{grid-column:1/-1}
/* Glass only on app chrome, not reports, evidence, controls or dense tables. */
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){
  aside{background:var(--gas-glass);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
  header.workspace-head{background:var(--gas-glass);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
}
@media (prefers-reduced-transparency:reduce){
  aside{background:var(--gas-rail);-webkit-backdrop-filter:none;backdrop-filter:none}
  header.workspace-head{background:var(--gas-head);-webkit-backdrop-filter:none;backdrop-filter:none}
}
@media (prefers-contrast:more){
  aside{background:var(--gas-rail);-webkit-backdrop-filter:none;backdrop-filter:none}
  header.workspace-head{background:var(--gas-head);-webkit-backdrop-filter:none;backdrop-filter:none}
  .card,.notice,.form-card,.filters,.check-row,.facts div{border-width:2px}
  nav button,button.secondary,.mode-toggle{border-width:2px}
}
@media (prefers-reduced-motion:reduce){nav button{transition:none}button.primary:hover{filter:none}}
@media(max-width:800px){
  /* Stop auto minimum grid track sizing from propagating wide nav/metrics into the document. */
  .shell{grid-template-columns:minmax(0,1fr)}
  aside{position:static;height:auto;min-width:0;width:100%;max-width:100%;overflow:visible;padding:.75rem 1rem}
  aside h1{margin:.3rem 0 .6rem}
  nav{display:flex;min-width:0;width:100%;max-width:100%;overflow-x:auto;gap:.45rem;padding:.2rem;scroll-padding-inline:.25rem}
  nav button{flex:0 0 auto;max-width:82vw}
  .report-grid{grid-template-columns:1fr}.full{grid-column:auto}
  .actions{margin-top:.45rem}
}
@media(max-width:400px){main{padding:.85rem}.cards{grid-template-columns:repeat(2,minmax(0,1fr))}.card{min-width:0;overflow-wrap:anywhere}}
@media print{
  :root,html[data-theme="light"]{color-scheme:light}
  aside,.interactive-only{display:none!important}
  body{background:#fff!important;color:#111!important;background-image:none!important}
  .shell{display:block}main{padding:.3in;max-width:none}
  [data-panel]{display:block!important;break-before:page}
  header.workspace-head{break-after:avoid;background:#fff!important;color:#111!important;box-shadow:none}
  .card,.notice,.form-card,.filters,.check-row,.facts div,table,th,td{
    background:#fff!important;color:#111!important;border-color:#777!important;box-shadow:none}
  .badge,.warning,.good,.empty,.message{color:#111!important}
  .table-wrap{overflow:visible}table{font-size:8.5pt}
}
</style>
</head>
<body>
<div class="shell">
<aside>
<p class="badge">INTERNAL WORKBENCH</p>
<h1>G.A.S. <span class="gas-product-subtitle">Signal Intelligence</span></h1>
<nav aria-label="Workspace sections">
<button type="button" data-nav="overview" aria-pressed="true">1. Overview</button>
<button type="button" data-nav="evidence" aria-pressed="false">2. Evidence / readiness</button>
<button type="button" data-nav="attention" aria-pressed="false">3. Attention</button>
<button type="button" data-nav="decision" aria-pressed="false">4. Decision cycle</button>
<button type="button" data-nav="history" aria-pressed="false">5. History / timeline</button>
<button type="button" data-nav="reports" aria-pressed="false">6. Reports</button>
</nav>
<div class="actions"><button type="button" class="mode-toggle" role="switch" id="theme-toggle" aria-label="Light mode" aria-checked="false">Light mode: off</button><button type="button" class="secondary" id="print-workspace">Print workspace</button></div>
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
${sources}
<h3>Evidence state counts</h3>
${stateCounts}
<h3>Authority / limitations</h3>
<div class="notice"><strong>No universal health score.</strong> Readiness states remain source-specific and missing/zero/unavailable are not collapsed.</div>
<ul>${workspace.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
</section>

<section id="evidence" data-panel="evidence" hidden>
<h2 tabindex="-1">2. Evidence / readiness</h2>
<div class="filters interactive-only">
<label class="field">Provider<select id="evidence-provider"><option value="">All providers</option>${providers.map((value) => `<option value="${attr(value)}">${escapeHtml(value)}</option>`).join('')}</select></label>
<label class="field">Module<select id="evidence-module"><option value="">All modules</option>${modules.map((value) => `<option value="${attr(value)}">${escapeHtml(value.replaceAll('_',' '))}</option>`).join('')}</select></label>
<label class="field">State<select id="evidence-state"><option value="">All states</option>${states.map((value) => `<option value="${attr(value)}">${escapeHtml(value)}</option>`).join('')}</select></label>
<label class="field">Text filter<input id="evidence-text" type="search" autocomplete="off" placeholder="URL, query, kind, identity"></label>
<button type="button" class="secondary" id="reset-evidence">Reset filters</button>
</div>
${sources}
${renderTopicPageEvidenceMatrix(workspace, topicPageInvocation)}
<div class="table-wrap"><table><caption>Accepted evidence/attention drill-down</caption><thead><tr><th scope="col">Module</th><th scope="col">Provider(s)</th><th scope="col">Kind</th><th scope="col">State</th><th scope="col">Exact reference</th><th scope="col">Evidence identity</th><th scope="col">Readiness context</th></tr></thead><tbody>${evidenceRows(workspace)}</tbody></table></div>
</section>

<section id="attention" data-panel="attention" hidden>
<h2 tabindex="-1">3. Attention</h2>
<div class="notice warning"><strong>Human review choice — not G.A.S. priority.</strong> Checkbox selection is presentation state only and never changes the accepted Release 0.15 attention register.</div>
<div class="check-list">${attentionRows(workspace,'attention-select')}</div>
<div class="form-card interactive-only">
<h3>Prepare / update human decision request</h3>
<p>The checked Attention IDs are copied exactly into an untrusted application-local request. The trusted Node host must recompute the current Release 0.15/0.16 state before accepting them. Preparation is non-durable and does not itself create a recommendation, measurement, outcome, or production action.</p>
<div class="report-grid">
<label class="field">Stable decision ID<input id="decision-id" type="text" maxlength="128" value="${attr(workspace.decisionCycle?.decision.id ?? 'human-decision-001')}"></label>
<label class="field">Disposition<select id="decision-disposition">
<option value="investigate"${workspace.decisionCycle?.decision.disposition === 'investigate' || workspace.decisionCycle === undefined ? ' selected' : ''}>Investigate</option>
<option value="recommend"${workspace.decisionCycle?.decision.disposition === 'recommend' ? ' selected' : ''}>Recommend</option>
<option value="defer"${workspace.decisionCycle?.decision.disposition === 'defer' ? ' selected' : ''}>Defer</option>
<option value="dismiss"${workspace.decisionCycle?.decision.disposition === 'dismiss' ? ' selected' : ''}>Dismiss</option>
</select></label>
<label class="field full">Human summary<textarea id="decision-summary" maxlength="2048" placeholder="Human-authored decision summary.">${escapeHtml(workspace.decisionCycle?.decision.summary ?? '')}</textarea></label>
<label class="field">Recorded at<input id="decision-recorded-at" type="text" value="${attr(workspace.decisionCycle?.decision.recordedAt ?? workspace.generatedAt)}"></label>
</div>
<div class="actions"><button type="button" class="primary" id="download-decision-request">Prepare / update human decision request</button></div>
<p class="message" id="decision-message" role="status" aria-live="polite"></p>
</div>
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
