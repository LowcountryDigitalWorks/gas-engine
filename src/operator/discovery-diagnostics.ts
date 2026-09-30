import type {
  DiscoverySiteReport,
  DiscoveryUrlReport,
} from '../analysis/discovery-diagnostics.js';

export const MAX_DISCOVERY_OPERATOR_HTML_BYTES = 1_000_000;

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
  emptyMessage: string,
): string {
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows.length === 0
    ? `<tr><td colspan="${headers.length}">${escapeHtml(emptyMessage)}</td></tr>`
    : rows.map((row) => `<tr>${row.map((value) => `<td>${cell(value)}</td>`).join('')}</tr>`).join('');
  return `<table><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function count(label: string, value: number): string {
  return `<div class="count"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

function searchContext(report: DiscoveryUrlReport): string {
  switch (report.searchContext.state) {
    case 'not_supplied':
      return '<p class="muted">Search Analytics context was not supplied.</p>';
    case 'not_observed':
      return '<p class="muted">No exact matching Release 0.10 page row was observed. This does not mean zero traffic.</p>';
    case 'observed':
      return table(
        'Current Search Analytics context — descriptive only',
        ['Queries','Clicks','Impressions','CTR','Average position range','Period','Freshness','Coverage'],
        [[
          report.searchContext.queryCount,
          report.searchContext.clicks,
          report.searchContext.impressions,
          report.searchContext.ctr,
          `${report.searchContext.averagePositionRange.minimum}–${report.searchContext.averagePositionRange.maximum}`,
          `${report.searchContext.sourcePeriod.start} → ${report.searchContext.sourcePeriod.end}`,
          `${report.searchContext.freshness.dataState} through ${report.searchContext.freshness.freshThrough}`,
          report.searchContext.coverage.state,
        ]],
        'No Search Analytics context.',
      );
  }
}

function urlSection(report: DiscoveryUrlReport, index: number): string {
  const matrix = report.providers.map((provider) => [
    provider.providerId,
    provider.observationState,
    provider.providerReadiness,
    provider.readinessReasons.join(', ') || '—',
    provider.searchPresence,
    provider.crawlState,
    provider.indexingPermission,
    provider.canonicalState,
    provider.canonicalTarget,
    provider.httpStatus,
    provider.lastCrawlAt,
  ]);
  const findings = report.findings.length === 0
    ? '<p class="muted">No cross-engine candidate was emitted because this URL is not ready under the supplied policy.</p>'
    : '<ul>' + report.findings.map((finding) =>
      `<li><code>${escapeHtml(finding.kind)}</code> — ${escapeHtml(finding.providers.join(', '))}</li>`).join('') + '</ul>';

  return `<section class="url-report" id="url-${index + 1}">
<h2>${index + 1}. ${escapeHtml(report.url)}</h2>
<p><span class="badge">${escapeHtml(report.state.toUpperCase())}</span><code>${escapeHtml(report.id)}</code></p>
${report.readinessReasons.length === 0
  ? ''
  : `<p class="note"><strong>Readiness reasons:</strong> ${escapeHtml(report.readinessReasons.join(', '))}</p>`}
${table(
  'Exact provider evidence matrix',
  ['Provider','Observation','Provider readiness','Readiness reasons','Search presence','Crawl state','Indexing permission','Canonical state','Canonical target','HTTP','Last crawl'],
  matrix,
  'No provider evidence rows.',
)}
<h3>Diagnostic findings</h3>
${findings}
<h3>IndexNow submission context</h3>
<p><strong>${escapeHtml(report.indexNow.state)}</strong>
${report.indexNow.submittedAt === undefined ? '' : ` · submitted ${escapeHtml(report.indexNow.submittedAt)}`}
${report.indexNow.submissionResult === undefined ? '' : ` · result ${escapeHtml(report.indexNow.submissionResult)}`}
${report.indexNow.resultCode === undefined ? '' : ` · HTTP/result ${escapeHtml(String(report.indexNow.resultCode))}`}
</p>
<p class="warning"><strong>Submission is not indexing proof.</strong> ${escapeHtml(report.indexNow.note)}</p>
<h3>Search-performance context</h3>
<div class="search-context">${searchContext(report)}</div>
</section>`;
}

/**
 * Render one deterministic, standalone, read-only discovery diagnostics document.
 * All data-bearing strings are escaped; no script, server, form, external resource,
 * provider call, mutation, or runtime model is used.
 */
export function renderDiscoveryDiagnosticsHtml(report: DiscoverySiteReport): string {
  const providerRows = report.providerReadiness.map((provider) => [
    provider.providerId,
    provider.state,
    provider.reasons.join(', ') || '—',
    provider.collectionId,
    provider.observedAt,
    provider.freshThrough,
    provider.coverageState,
    provider.availabilityState,
  ]);
  const findingRows = Object.entries(report.totals.findingCounts).map(([kind, value]) => [kind, value] as const);
  const indexNowRows = Object.entries(report.totals.indexNowCounts).map(([kind, value]) => [kind, value] as const);

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>G.A.S. Discovery Diagnostics — ${escapeHtml(report.trustedTarget)}</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102a3a;background:#f7f8f6;line-height:1.45}
*{box-sizing:border-box}body{margin:0}main{max-width:1240px;margin:auto;padding:2rem}h1,h2,h3{line-height:1.2}h1{margin-top:0}
nav{padding:.75rem 1rem;background:#f3efe6;border:1px solid #ccd6d5;border-radius:.5rem}nav a{margin-right:1rem}
a{color:#1f5f5b}a:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.context,.note,.warning{padding:1rem;border-left:4px solid #2f766f;background:#fff;margin:1rem 0}.warning{border-left-color:#9a6700}
.counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem}.count{background:#fff;border:1px solid #ccd6d5;border-radius:.5rem;padding:.8rem}.count strong{display:block;font-size:1.4rem}.count span{display:block}
.badge{display:inline-block;font-weight:700;letter-spacing:.04em;border:1px solid currentColor;border-radius:999px;padding:.15rem .45rem;margin-right:.35rem}
section{margin-top:2rem}table{width:100%;border-collapse:collapse;background:#fff;margin:.75rem 0 1.5rem;table-layout:fixed}caption{text-align:left;font-weight:700;padding:.5rem 0}
th,td{border:1px solid #ccd6d5;padding:.5rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f3efe6}code{overflow-wrap:anywhere}.muted{color:#4b5f69}.url-report{border-top:2px solid #ccd6d5;padding-top:1rem}
@media print{body{background:#fff}main{max-width:none;padding:.35in}nav{display:none}table{font-size:8.5pt}.count{break-inside:avoid}.url-report{break-before:auto}.no-print{display:none}}
</style>
</head>
<body>
<main>
<header>
<p class="muted">Lowcountry Digital Works · G.A.S. Engine · Release 0.13 read-only discovery diagnostics</p>
<h1>Discovery Diagnostics</h1>
<p><span class="badge">READ ONLY</span>Cross-engine findings are bounded evidence candidates, not universal index truth or execution instructions.</p>
</header>
<nav aria-label="Report sections">
<a href="#context">Context</a><a href="#providers">Providers</a><a href="#totals">Totals</a><a href="#urls">URL evidence</a>
</nav>
<section id="context">
<h2>Site / report context</h2>
<div class="context">
<strong>Trusted target:</strong> ${escapeHtml(report.trustedTarget)}<br>
<strong>Tenant:</strong> ${escapeHtml(report.scope.tenantId)}<br>
<strong>Site:</strong> ${escapeHtml(report.scope.siteId)}<br>
<strong>Scope revision:</strong> ${escapeHtml(report.scope.siteScopeRevisionId)}<br>
<strong>Evaluated at:</strong> ${escapeHtml(report.evaluatedAt)}<br>
<strong>Policy:</strong> ${escapeHtml(report.policy.id)} @ ${escapeHtml(report.policy.version)}
</div>
<p class="note"><strong>Navigation note:</strong> Candidate-bearing URLs are listed first only to make inspection easier. The order is not an overall ranking.</p>
</section>
<section id="providers">
<h2>Provider readiness</h2>
${table(
  'Provider snapshots',
  ['Provider','State','Reasons','Collection','Observed at','Fresh through','Coverage','Availability'],
  providerRows,
  'No providers.',
)}
</section>
<section id="totals">
<h2>Deterministic site totals</h2>
<div class="counts">
${count('Unique URLs', report.totals.uniqueUrls)}
${count('Ready URLs', report.totals.readyUrls)}
${count('Not-ready URLs', report.totals.notReadyUrls)}
${count('With search context', report.totals.withSearchContext)}
${count('Without observed search context', report.totals.withoutObservedSearchContext)}
</div>
${table('Finding counts',['Finding kind','Count'],findingRows,'No findings.')}
${table('IndexNow context counts',['Context','Count'],indexNowRows,'No IndexNow contexts.')}
</section>
<section id="urls">
<h2>Per-URL evidence</h2>
<p class="warning"><strong>IndexNow boundary:</strong> submission is not indexing proof. Later engine observations are descriptive correlation only.</p>
${report.urls.map(urlSection).join('')}
</section>
<footer class="no-print muted">
<p>Use the browser Print / Save as PDF feature for a local copy. This document contains no forms, scripts, external resources, provider connection, or write controls.</p>
</footer>
</main>
</body>
</html>
`;

  if (new TextEncoder().encode(html).byteLength > MAX_DISCOVERY_OPERATOR_HTML_BYTES) {
    throw new Error('Discovery diagnostics HTML exceeds the bounded Release 0.13 output limit.');
  }
  return html;
}
