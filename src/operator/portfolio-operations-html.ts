import { createHash } from 'node:crypto';
import { DECISION_CYCLE_READINESS_STATES } from './decision-cycle.js';
import {
  PORTFOLIO_EXCEPTION_KINDS,
  PORTFOLIO_OPERATIONS_VERSION,
  type PortfolioEngagementProjection,
  type PortfolioOperationsConsole,
} from './portfolio-operations.js';

export const MAX_PORTFOLIO_HTML_BYTES = 6_000_000;

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

function display(value: string | number | undefined): string {
  return value === undefined ? '—' : escapeHtml(String(value));
}

function option(value: string, label = value): string {
  return `<option value="${attr(value)}">${escapeHtml(label)}</option>`;
}

function joinData(values: readonly string[]): string {
  return '|' + values.join('|') + '|';
}

function sourceTable(entry: PortfolioEngagementProjection): string {
  if (entry.sources.length === 0) return '<p class="empty">No current run/source receipts supplied.</p>';
  const rows = entry.sources.map((source) => `<tr>
<td><code>${escapeHtml(source.receiptId)}</code></td>
<td>${escapeHtml(source.sourceFamily)}</td>
<td>${escapeHtml(source.sourceState)}</td>
<td>${escapeHtml(source.freshness.state)}</td>
<td>${display(source.freshness.anchorKind)}</td>
<td>${display(source.freshness.anchorAt)}</td>
<td>${display(source.freshness.ageSeconds)}</td>
<td>${display(source.freshness.maxAgeSeconds)}</td>
</tr>`).join('');
  return `<div class="table-wrap"><table>
<caption>Source receipt operational state</caption>
<thead><tr><th scope="col">Receipt</th><th scope="col">Source family</th><th scope="col">Source state</th><th scope="col">Freshness</th><th scope="col">Anchor</th><th scope="col">Anchor at</th><th scope="col">Age seconds</th><th scope="col">Max age seconds</th></tr></thead>
<tbody>${rows}</tbody></table></div>`;
}

function readinessTable(entry: PortfolioEngagementProjection): string {
  if (entry.readiness.length === 0) return '<p class="empty">No current accepted readiness projection supplied.</p>';
  const rows = entry.readiness.map((item) => `<tr><td>${escapeHtml(item.moduleId)}</td><td>${escapeHtml(item.state)}</td><td>${escapeHtml(item.reasons.length === 0 ? '—' : item.reasons.join('; '))}</td></tr>`).join('');
  return `<div class="table-wrap"><table><caption>Accepted module readiness</caption><thead><tr><th scope="col">Module</th><th scope="col">State</th><th scope="col">Reasons</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function exceptionList(entry: PortfolioEngagementProjection): string {
  if (entry.exceptions.length === 0) return '<p class="empty">No bounded operational exceptions are present.</p>';
  return `<ul>${entry.exceptions.map((item) => `<li><code>${escapeHtml(item.kind)}</code>${item.sourceFamily === undefined ? '' : ` · ${escapeHtml(item.sourceFamily)}`}${item.receiptId === undefined ? '' : ` · ${escapeHtml(item.receiptId)}`}</li>`).join('')}</ul>`;
}

function engagementRow(entry: PortfolioEngagementProjection): string {
  const sourceStates = entry.sources.map((source) => source.sourceState);
  const freshnessStates = entry.sources.map((source) => source.freshness.state);
  const readinessStates = entry.readiness.map((item) => item.state);
  const exceptionKinds = entry.exceptions.map((item) => item.kind);
  const decisionReadiness = entry.followUp?.readiness ?? '';
  const reportState = entry.report?.state ?? '';
  const search = [
    entry.engagementId,
    entry.label,
    entry.scope.tenantId,
    entry.scope.siteId,
    entry.scope.siteScopeRevisionId,
    entry.trustedTarget,
    entry.currentRunId ?? '',
    ...sourceStates,
    ...freshnessStates,
    ...readinessStates,
    ...exceptionKinds,
  ].join(' ').toLowerCase();
  return `<article class="engagement" data-engagement-row
 data-search="${attr(search)}"
 data-run="${attr(entry.currentRunState)}"
 data-source-states="${attr(joinData(sourceStates))}"
 data-freshness="${attr(joinData(freshnessStates))}"
 data-readiness="${attr(joinData(readinessStates))}"
 data-attention="${entry.attentionCount > 0 ? 'present' : 'none'}"
 data-decision="${attr(decisionReadiness)}"
 data-report="${attr(reportState)}"
 data-exceptions="${attr(joinData(exceptionKinds))}">
<header>
<div><p class="eyebrow">${escapeHtml(entry.scope.tenantId)} / ${escapeHtml(entry.scope.siteId)}</p><h2>${escapeHtml(entry.label)}</h2><p>${escapeHtml(entry.trustedTarget)}</p></div>
<span class="badge">${escapeHtml(entry.currentRunState)}</span>
</header>
<dl class="facts">
<div><dt>Engagement ID</dt><dd><code>${escapeHtml(entry.engagementId)}</code></dd></div>
<div><dt>Scope revision</dt><dd><code>${escapeHtml(entry.scope.siteScopeRevisionId)}</code></dd></div>
<div><dt>Current run</dt><dd><code>${display(entry.currentRunId)}</code></dd></div>
<div><dt>Workspace</dt><dd><code>${display(entry.workspaceId)}</code></dd></div>
<div><dt>Attention count</dt><dd>${String(entry.attentionCount)}</dd></div>
<div><dt>Decision/follow-up</dt><dd>${display(entry.followUp?.readiness)}</dd></div>
<div><dt>Report state</dt><dd>${display(entry.report?.state)}</dd></div>
<div><dt>Report ID</dt><dd><code>${display(entry.report?.reportId)}</code></dd></div>
</dl>
<details><summary>Source state / freshness</summary>${sourceTable(entry)}</details>
<details><summary>Accepted readiness</summary>${readinessTable(entry)}</details>
<details><summary>Operational exceptions</summary>${exceptionList(entry)}</details>
<details><summary>Limitations</summary><ul>${entry.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul></details>
</article>`;
}

function scriptText(): string {
  return `'use strict';
const rows=Array.from(document.querySelectorAll('[data-engagement-row]'));
const byId=(id)=>document.getElementById(id);
function hasToken(value,token){return !token||(value||'').includes('|'+token+'|');}
function applyFilters(){
 const text=(byId('filter-text').value||'').trim().toLowerCase();
 const run=byId('filter-run').value;
 const source=byId('filter-source').value;
 const freshness=byId('filter-freshness').value;
 const readiness=byId('filter-readiness').value;
 const attention=byId('filter-attention').value;
 const decision=byId('filter-decision').value;
 const report=byId('filter-report').value;
 const exception=byId('filter-exception').value;
 let shown=0;
 for(const row of rows){
  const show=(!text||(row.dataset.search||'').includes(text))&&(!run||row.dataset.run===run)&&hasToken(row.dataset.sourceStates,source)&&hasToken(row.dataset.freshness,freshness)&&hasToken(row.dataset.readiness,readiness)&&(!attention||row.dataset.attention===attention)&&(!decision||row.dataset.decision===decision)&&(!report||row.dataset.report===report)&&hasToken(row.dataset.exceptions,exception);
  row.hidden=!show;if(show)shown++;
 }
 byId('visible-count').textContent=String(shown);
}
for(const id of ['filter-run','filter-source','filter-freshness','filter-readiness','filter-attention','filter-decision','filter-report','filter-exception'])byId(id).addEventListener('change',applyFilters);
byId('filter-text').addEventListener('input',applyFilters);
byId('reset-filters').addEventListener('click',()=>{for(const id of ['filter-text','filter-run','filter-source','filter-freshness','filter-readiness','filter-attention','filter-decision','filter-report','filter-exception'])byId(id).value='';applyFilters();});
byId('print-console').addEventListener('click',()=>window.print());
applyFilters();`;
}

export function renderPortfolioOperationsHtml(model: PortfolioOperationsConsole): string {
  if (model.version !== PORTFOLIO_OPERATIONS_VERSION) {
    throw new Error('Unsupported Release 0.19 portfolio model version.');
  }
  const script = scriptText();
  const scriptHash = createHash('sha256').update(script, 'utf8').digest('base64');
  const summary = model.summary;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'">
<title>G.A.S. Portfolio Operations Console</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102a3a;background:#eef2f0;line-height:1.45}*{box-sizing:border-box}body{margin:0}main{max-width:1500px;margin:auto;padding:1.4rem}.hero,.filters,.engagement,.card{background:#fff;border:1px solid #cbd7d7;border-radius:.65rem}.hero{padding:1.1rem;margin-bottom:1rem}.badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.18rem .55rem;font-weight:700}.internal{color:#7a4e00}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.7rem;margin:1rem 0}.card{padding:.75rem}.card strong{display:block;font-size:1.45rem}.filters{padding:.8rem;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:.65rem;margin-bottom:1rem;position:sticky;top:0;z-index:2}.field{display:grid;gap:.25rem}.field input,.field select,button{font:inherit;padding:.5rem;border:1px solid #81989d;border-radius:.4rem;background:#fff;color:#102a3a}button{cursor:pointer;font-weight:700}.engagement{padding:1rem;margin:.8rem 0}.engagement>header{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start}.engagement h2{margin:.15rem 0}.eyebrow{margin:0;font-size:.82rem;text-transform:uppercase;letter-spacing:.05em}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:.65rem}.facts div{border:1px solid #d7dfdf;border-radius:.45rem;padding:.55rem}dt{font-weight:700}dd{margin:.2rem 0 0;overflow-wrap:anywhere}details{border-top:1px solid #e0e6e6;padding:.65rem 0}summary{font-weight:700;cursor:pointer}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;table-layout:fixed}caption{text-align:left;font-weight:700;padding:.4rem 0}th,td{border:1px solid #d1dada;padding:.5rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f3efe6}.empty{font-style:italic;color:#53666d}code{overflow-wrap:anywhere}.notice{border-left:4px solid #2f766f;padding:.65rem .8rem;background:#f7f8f6}.actions{display:flex;gap:.5rem;align-items:end}.visible{font-weight:700;align-self:center}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #d7b655;outline-offset:2px}@media print{.filters,.interactive{display:none!important}main{padding:.2in;max-width:none}.engagement{break-inside:avoid}details{display:block}details>*{display:block}summary{display:none}}
</style></head><body><main>
<section class="hero"><p><span class="badge internal">LDW INTERNAL</span></p><h1>G.A.S. Portfolio Operations Console</h1><p><strong>Evaluated:</strong> ${escapeHtml(model.evaluatedAt)} · <strong>Identity:</strong> <code>${escapeHtml(model.id)}</code></p><div class="notice"><strong>Operational navigation only.</strong> No universal health score, customer ranking, SEO performance benchmark, task state, or production action is created here.</div></section>
<section class="cards" aria-label="Portfolio operational summary">
<div class="card"><strong>${summary.engagementCount}</strong>Engagements</div><div class="card"><strong>${summary.currentRun.present}</strong>Current runs</div><div class="card"><strong>${summary.currentRun.noCurrentRun}</strong>No current run</div><div class="card"><strong>${summary.attentionPresentEngagements}</strong>Attention present</div><div class="card"><strong>${summary.freshnessStates.find((entry)=>entry.state==='stale')?.count ?? 0}</strong>Stale source receipts</div>
</section>
<section class="filters interactive" aria-label="Portfolio filters">
<label class="field">Text<input id="filter-text" type="search" autocomplete="off" placeholder="engagement, tenant, site, target"></label>
<label class="field">Current run<select id="filter-run"><option value="">All</option>${option('present')}${option('no_current_run')}</select></label>
<label class="field">Source state<select id="filter-source"><option value="">All</option>${['supplied','not_supplied','unavailable','unsupported'].map((value)=>option(value)).join('')}</select></label>
<label class="field">Freshness<select id="filter-freshness"><option value="">All</option>${['fresh','stale','not_evaluable'].map((value)=>option(value)).join('')}</select></label>
<label class="field">Module readiness<select id="filter-readiness"><option value="">All</option>${['not_supplied','ready','limited','not_ready','unavailable'].map((value)=>option(value)).join('')}</select></label>
<label class="field">Attention<select id="filter-attention"><option value="">All</option>${option('present')}${option('none')}</select></label>
<label class="field">Decision/follow-up<select id="filter-decision"><option value="">All</option>${DECISION_CYCLE_READINESS_STATES.map((value)=>option(value)).join('')}</select></label>
<label class="field">Report<select id="filter-report"><option value="">All</option>${option('not_requested')}${option('present')}</select></label>
<label class="field">Exception<select id="filter-exception"><option value="">All</option>${PORTFOLIO_EXCEPTION_KINDS.map((value)=>option(value)).join('')}</select></label>
<div class="actions"><button type="button" id="reset-filters">Reset</button><button type="button" id="print-console">Print</button><span class="visible"><span id="visible-count">${model.engagements.length}</span> visible</span></div>
</section>
<section aria-label="Engagement operations">${model.engagements.map(engagementRow).join('')}</section>
<section class="hero"><h2>Portfolio limitations</h2><ul>${model.limitations.map((item)=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></section>
<script>${script}</script></main></body></html>\n`;
  if (Buffer.byteLength(html, 'utf8') > MAX_PORTFOLIO_HTML_BYTES) {
    throw new Error('Release 0.19 portfolio HTML exceeds the output byte bound.');
  }
  return html;
}
