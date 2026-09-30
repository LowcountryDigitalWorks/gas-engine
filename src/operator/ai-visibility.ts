import type { AiVisibilitySiteReport } from '../analysis/ai-visibility.js';

export const MAX_AI_VISIBILITY_OPERATOR_HTML_BYTES = 1_000_000;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
function cell(value: string | number | undefined): string {
  return escapeHtml(value === undefined ? '—' : String(value));
}
function table(
  caption: string,
  headers: readonly string[],
  rows: readonly (readonly (string | number | undefined)[])[],
  empty: string,
): string {
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows.length === 0
    ? `<tr><td colspan="${headers.length}">${escapeHtml(empty)}</td></tr>`
    : rows.map((row) => `<tr>${row.map((value) => `<td>${cell(value)}</td>`).join('')}</tr>`).join('');
  return `<table><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
function count(label: string, value: number): string {
  return `<div class="count"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}
function contextSection(report: AiVisibilitySiteReport): string {
  const traditional = report.traditionalSearchContext.map((entry) => [
    entry.page,
    entry.state,
    entry.queryCount,
    entry.clicks,
    entry.impressions,
    entry.ctr,
    entry.averagePositionRange === undefined ? undefined : `${entry.averagePositionRange.minimum}–${entry.averagePositionRange.maximum}`,
    entry.period === undefined ? undefined : `${entry.period.start} → ${entry.period.end}`,
    entry.freshness,
    entry.coverage,
  ]);
  return `<section id="traditional">
<h2>TRADITIONAL SEARCH CONTEXT</h2>
<p class="warning">Descriptive exact-page context only. A missing Search Analytics row means <strong>not observed</strong>, not zero traffic.</p>
${table('Release 0.10 exact-page context',['Page','State','Queries','Clicks','Impressions','CTR','Position range','Period','Freshness','Coverage'],traditional,'No Search Analytics context supplied.')}
</section>
<section id="change">
<h2>CHANGE/OUTCOME CONTEXT</h2>
${report.changeOutcomeContext === undefined
  ? '<p class="muted">No accepted exact trusted Release 0.11 context attached.</p>'
  : table('Release 0.11 accepted context',['Cohort','Annotation','Page','Metric','Readiness'],[[
      report.changeOutcomeContext.id,
      report.changeOutcomeContext.annotationId,
      report.changeOutcomeContext.targetPage,
      report.changeOutcomeContext.metric,
      report.changeOutcomeContext.readinessState,
    ]],'No change/outcome context.')}
<p class="warning">Observed correlation does not establish causation.</p>
</section>
<section id="focus">
<h2>PAGE-FOCUS CONTEXT</h2>
${report.pageFocusContext === undefined
  ? '<p class="muted">No accepted exact-page Release 0.12 context attached.</p>'
  : table('Release 0.12 exact-page context',['Report','Page','State','SERP validation required'],[[
      report.pageFocusContext.id,
      report.pageFocusContext.page,
      report.pageFocusContext.state,
      String(report.pageFocusContext.serpValidationRequired),
    ]],'No page-focus context.')}
<p class="warning">Page-focus evidence remains descriptive and does not become an automatic content action.</p>
</section>`;
}

/**
 * Deterministic standalone Release 0.14 operator report.
 * No script, form, external asset, server/listener, provider call, mutation, or runtime model.
 */
export function renderAiVisibilityHtml(report: AiVisibilitySiteReport): string {
  const readinessRows = report.readiness.map((entry) => [
    entry.providerId,
    entry.state,
    entry.reasons.join(', ') || '—',
  ]);
  const bingPages = report.bing.pages.map((row) => [row.url, row.citationCount, row.rowIdentity]);
  const bingQueries = report.bing.groundingQueries.map((row) => [
    row.phrase,
    row.citationCount,
    row.intent,
    row.topic,
    row.citationSharePct,
    row.rowIdentity,
  ]);
  const zrRankings = report.zeroRank.rankings.map((row) => [
    row.id,row.domain,row.rank,row.mentions,row.visibilityPercentage,
    typeof row.sentiment === 'string' || typeof row.sentiment === 'number' ? row.sentiment : undefined,
    row.growth,
  ]);
  const zrSources = report.zeroRank.sourceUrls.map((row) => [
    row.id,row.sourceUrl,row.sourceDomain,row.totalCitations,row.totalUsage,row.uniqueChats,row.usagePercentage,
  ]);
  const changes = report.changes.map((row) => [
    row.providerId,row.family,row.identity,row.metric,row.state,row.baseline,row.current,row.delta,
  ]);
  const concentrations = report.concentrationFindings.map((row) => [
    row.kind,row.providerId,row.numerator,row.denominator,row.calculatedSharePct,
    `${row.policy.topN} @ ${row.policy.concentrationShareThresholdPct}%`,
    row.topRows.map((value) => `${value.identity}=${value.value}`).join('; '),
  ]);
  const cross = report.crossSourceFindings.map((row) => [
    row.kind,row.bingState,row.zeroRankState,row.bingIdentity,row.zeroRankIdentity,row.note,
  ]);

  const html=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>G.A.S. AI Visibility Intelligence — ${escapeHtml(report.trustedTarget)}</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102a3a;background:#f7f8f6;line-height:1.45}
*{box-sizing:border-box}body{margin:0}main{max-width:1280px;margin:auto;padding:2rem}h1,h2,h3{line-height:1.2}h1{margin-top:0}
nav{padding:.75rem 1rem;background:#f3efe6;border:1px solid #ccd6d5;border-radius:.5rem;position:sticky;top:0}nav a{margin-right:1rem}
a{color:#1f5f5b}a:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.context,.note,.warning{padding:1rem;border-left:4px solid #2f766f;background:#fff;margin:1rem 0}.warning{border-left-color:#9a6700}
.counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem}.count{background:#fff;border:1px solid #ccd6d5;border-radius:.5rem;padding:.8rem}.count strong{display:block;font-size:1.4rem}.count span{display:block}
.badge{display:inline-block;font-weight:700;letter-spacing:.04em;border:1px solid currentColor;border-radius:999px;padding:.15rem .45rem;margin-right:.35rem}
section{margin-top:2rem}table{width:100%;border-collapse:collapse;background:#fff;margin:.75rem 0 1.5rem;table-layout:fixed}caption{text-align:left;font-weight:700;padding:.5rem 0}
th,td{border:1px solid #ccd6d5;padding:.5rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f3efe6}code{overflow-wrap:anywhere}.muted{color:#4b5f69}
@media print{body{background:#fff}main{max-width:none;padding:.35in}nav{display:none}table{font-size:8.5pt}.count{break-inside:avoid}.no-print{display:none}}
</style>
</head>
<body>
<main>
<header>
<p class="muted">Lowcountry Digital Works · G.A.S. Engine · Release 0.14 read-only AI visibility intelligence</p>
<h1>AI Visibility Intelligence</h1>
<p><span class="badge">READ ONLY</span>Provider-preserving evidence and bounded investigation candidates only.</p>
</header>
<nav aria-label="Report sections">
<a href="#context">Context</a><a href="#bing">BING</a><a href="#zerorank">ZERORANK</a><a href="#cross">CROSS-SOURCE</a><a href="#traditional">TRADITIONAL SEARCH</a><a href="#change">CHANGE/OUTCOME</a><a href="#focus">PAGE-FOCUS</a>
</nav>
<section id="context">
<h2>Context and provider readiness</h2>
<div class="context">
<strong>Trusted target:</strong> ${escapeHtml(report.trustedTarget)}<br>
<strong>Tenant:</strong> ${escapeHtml(report.scope.tenantId)}<br>
<strong>Site:</strong> ${escapeHtml(report.scope.siteId)}<br>
<strong>Scope revision:</strong> ${escapeHtml(report.scope.siteScopeRevisionId)}<br>
<strong>Evaluated at:</strong> ${escapeHtml(report.evaluatedAt)}<br>
<strong>Policy:</strong> ${escapeHtml(report.policy.id)} @ ${escapeHtml(report.policy.version)}
</div>
${table('Provider readiness',['Provider','State','Reasons'],readinessRows,'No provider readiness.')}
<div class="warning"><strong>Bing sampling:</strong> ${escapeHtml(report.semantics.bingSamplingWarning)}</div>
<div class="warning"><strong>Grounding query:</strong> ${escapeHtml(report.semantics.groundingQueryWarning)}</div>
<div class="warning"><strong>Metric boundary:</strong> ${escapeHtml(report.semantics.metricBoundaryWarning)}</div>
</section>
<section id="bing">
<h2>BING</h2>
<div class="counts">
${count('Observed page rows',report.bing.pages.length)}
${count('Observed grounding-query rows',report.bing.groundingQueries.length)}
${count('Change records',report.changes.filter((row)=>row.providerId==='bing-webmaster-ai-performance').length)}
</div>
<p><strong>Property:</strong> ${escapeHtml(report.bing.property)} · <strong>Period:</strong> ${escapeHtml(report.bing.period.start)} → ${escapeHtml(report.bing.period.end)} · <strong>State:</strong> ${escapeHtml(report.bing.dataState)} · <strong>Coverage:</strong> ${escapeHtml(report.bing.coverageState)}</p>
${table('Exact cited pages',['URL','Citation count','Identity'],bingPages,'No page rows.')}
${table('Grouped grounding-query evidence',['Grouped phrase','Citation count','Provider intent','Provider topic','Citation share %','Identity'],bingQueries,'No grounding-query rows.')}
</section>
<section id="zerorank">
<h2>ZERORANK</h2>
<p class="warning">ZeroRank visibility, rank, sentiment, mention, growth, usage, and share-style metrics remain vendor-specific and are not normalized into Bing citation semantics.</p>
${table('Provider-specific rankings',['ID','Domain','Rank','Mentions','Visibility %','Sentiment','Growth'],zrRankings,'No ranking rows.')}
${table('Provider-specific source URLs',['ID','Source URL','Domain','Citations','Usage','Unique chats','Usage %'],zrSources,'No source URL rows.')}
</section>
<section id="changes">
<h2>WITHIN-PROVIDER CHANGE</h2>
<p class="note">Increase/decrease/unchanged are descriptive observations only. They are not improvement, regression, success, or failure labels.</p>
${table('Provider-specific change records',['Provider','Family','Identity','Metric','State','Baseline','Current','Delta'],changes,'No change records.')}
</section>
<section id="concentration">
<h2>PROVIDER-SPECIFIC CONCENTRATION</h2>
<p class="note">Concentration findings are navigation/investigation candidates only, not severity, quality, authority, ranking, or business priority.</p>
${table('Concentration candidates',['Kind','Provider','Numerator','Denominator','Share %','Policy','Top rows'],concentrations,'No concentration candidate met readiness and policy.')}
</section>
<section id="cross">
<h2>CROSS-SOURCE</h2>
<p class="warning">${escapeHtml(report.semantics.crossSourceWarning)}</p>
${table('Bounded cross-source divergence candidates',['Kind','Bing state','ZeroRank state','Bing identity','ZeroRank identity','Note'],cross,'No safe explicit divergence candidate.')}
</section>
${contextSection(report)}
<footer class="no-print muted">
<p>${escapeHtml(report.semantics.causationWarning)}</p>
<p>${escapeHtml(report.semantics.navigationOrderNote)}</p>
<p>Use the browser Print / Save as PDF feature for a local copy. This document contains no forms, scripts, external assets, provider connections, or write controls.</p>
</footer>
</main>
</body>
</html>`;
  if (new TextEncoder().encode(html).byteLength > MAX_AI_VISIBILITY_OPERATOR_HTML_BYTES) {
    throw new Error('AI visibility operator HTML exceeds the bounded Release 0.14 output limit.');
  }
  return html;
}
