import type { Contract } from '../contracts/wire.js';
import type {
  EvidenceDeltaEntry,
  EvidenceDeltaSummary,
} from '../analysis/diff.js';
import type { OperatorCaseView } from './case-view.js';

export const MAX_OPERATOR_HTML_BYTES = 1_000_000;

export interface OperatorCasePresentation {
  readonly title: string;
  readonly scope: {
    readonly tenantId: string;
    readonly siteId: string;
    readonly siteScopeRevisionId: string;
  };
  readonly collectionPair: {
    readonly baseline: string;
    readonly current: string;
  };
  readonly summary: EvidenceDeltaSummary;
  readonly attention: readonly {
    readonly state: string;
    readonly cohort: string;
    readonly baseline: string;
    readonly current: string;
    readonly delta: string;
    readonly note: string;
  }[];
  readonly recommendations: readonly {
    readonly id: string;
    readonly lifecycle: string;
    readonly revision: string;
    readonly authority: string;
    readonly priority: string;
    readonly rationale: string;
  }[];
  readonly selected: {
    readonly id: string;
    readonly currentLifecycle: string;
    readonly history: readonly {
      readonly revision: string;
      readonly lifecycle: string;
      readonly updatedAt: string;
      readonly rationale: string;
    }[];
    readonly evidence: readonly {
      readonly id: string;
      readonly metric: string;
      readonly value: string;
      readonly availability: string;
    }[];
    readonly measurements: readonly {
      readonly id: string;
      readonly relationship: string;
      readonly result: string;
      readonly comparability: string;
      readonly createdAt: string;
    }[];
    readonly outcomes: readonly {
      readonly id: string;
      readonly direction: string;
      readonly rationale: string;
      readonly attribution: string;
      readonly createdAt: string;
    }[];
  };
}

function observationValue(value: Contract<'observationValue'>): string {
  if (value.state !== 'observed') return `${value.state}: ${value.reason}`;
  switch (value.value.type) {
    case 'number': return `number: ${value.value.value}`;
    case 'text': return `text: ${value.value.value}`;
    case 'boolean': return `boolean: ${value.value.value}`;
  }
}

function deltaObservationValue(entry: EvidenceDeltaEntry, side: 'baseline' | 'current'): string {
  const value = side === 'baseline' ? entry.baselineValue : entry.currentValue;
  return value === undefined ? '—' : observationValue(value);
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

function attribution(outcome: Contract<'outcome'>): string {
  switch (outcome.attribution.strength) {
    case 'none': return `none: ${outcome.attribution.reason}`;
    case 'technical_verification': return `technical_verification: ${outcome.attribution.basis}`;
    case 'association': return `association: ${outcome.attribution.basis}`;
    case 'controlled_evidence': return `controlled_evidence: ${outcome.attribution.basis}`;
  }
}

function measurementResult(measurement: Contract<'measurement'>): string {
  switch (measurement.result.state) {
    case 'measured': return `measured (${measurement.result.observations.length} canonical observation(s))`;
    case 'not_due': return `not_due: ${measurement.result.reason}`;
    case 'not_measured': return `not_measured: ${measurement.result.reason}`;
  }
}

function measurementRelationship(measurement: Contract<'measurement'>): string {
  return measurement.relationship.role === 'baseline'
    ? 'baseline'
    : `follow_up → ${measurement.relationship.baselineMeasurementId}`;
}

function measurementComparability(measurement: Contract<'measurement'>): string {
  return measurement.comparability.state === 'comparable'
    ? 'comparable'
    : `${measurement.comparability.state}: ${measurement.comparability.reason}`;
}

/** Pure transformation from the read model into display-only strings. */
export function buildOperatorCasePresentation(view: OperatorCaseView): OperatorCasePresentation {
  return {
    title: `G.A.S. operator case — ${view.selectedRecommendation.current.id}`,
    scope: {
      tenantId: view.scope.tenantId,
      siteId: view.scope.siteId,
      siteScopeRevisionId: view.scope.siteScopeRevisionId,
    },
    collectionPair: {
      baseline: view.evidenceDiff.collectionPair.baselineCollectionId,
      current: view.evidenceDiff.collectionPair.currentCollectionId,
    },
    summary: view.evidenceDiff.summary,
    attention: view.reviewAttention.map((entry) => ({
      state: entry.state,
      cohort: entry.cohortHash,
      baseline: deltaObservationValue(entry, 'baseline'),
      current: deltaObservationValue(entry, 'current'),
      delta: entry.numericDelta === undefined ? '—' : String(entry.numericDelta),
      note: entry.reason ?? 'Mechanical value change; no quality direction inferred.',
    })),
    recommendations: view.recommendations.map((record) => ({
      id: record.id,
      lifecycle: record.lifecycle,
      revision: String(record.revision),
      authority: record.authorityClass,
      priority: record.priority.level,
      rationale: record.rationale,
    })),
    selected: {
      id: view.selectedRecommendation.current.id,
      currentLifecycle: view.selectedRecommendation.current.lifecycle,
      history: view.selectedRecommendation.history.map((record) => ({
        revision: String(record.revision),
        lifecycle: record.lifecycle,
        updatedAt: record.updatedAt,
        rationale: record.rationale,
      })),
      evidence: view.selectedRecommendation.evidence.map((record) => ({
        id: record.id,
        metric: record.cohort.context.metric.id,
        value: observationValue(record.value),
        availability: record.provenance.availability.state,
      })),
      measurements: view.selectedRecommendation.measurements.map((record) => ({
        id: record.id,
        relationship: measurementRelationship(record),
        result: measurementResult(record),
        comparability: measurementComparability(record),
        createdAt: record.createdAt,
      })),
      outcomes: view.selectedRecommendation.outcomes.map((record) => ({
        id: record.id,
        direction: record.assessment.direction,
        rationale: outcomeRationale(record),
        attribution: attribution(record),
        createdAt: record.createdAt,
      })),
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function table(
  caption: string,
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  emptyMessage: string,
): string {
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows.length === 0
    ? `<tr><td colspan="${headers.length}">${escapeHtml(emptyMessage)}</td></tr>`
    : rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return `<table><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function countCard(label: string, value: number): string {
  return `<div class="count"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>`;
}

/**
 * Render one standalone deterministic static HTML document.
 * Dynamic values are emitted only through escapeHtml/table/countCard.
 */
export function renderOperatorCaseHtml(model: OperatorCasePresentation): string {
  const summary = [
    countCard('Total', model.summary.total),
    countCard('Unchanged', model.summary.unchanged),
    countCard('Changed', model.summary.changed),
    countCard('Appeared', model.summary.appeared),
    countCard('Missing from current', model.summary.missingFromCurrent),
    countCard('Coverage unknown', model.summary.coverageUnknown),
    countCard('Review attention', model.summary.attentionCount),
  ].join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'">
<title>${escapeHtml(model.title)}</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#102a3a;background:#f7f8f6;line-height:1.45}
*{box-sizing:border-box} body{margin:0} main{max-width:1120px;margin:auto;padding:2rem} h1,h2{line-height:1.2} h1{margin-top:0}
nav{padding:.75rem 1rem;background:#f3efe6;border:1px solid #ccd6d5;border-radius:.5rem} nav a{margin-right:1rem}
a{color:#1f5f5b} a:focus-visible,summary:focus-visible{outline:3px solid currentColor;outline-offset:3px}
.context,.note{padding:1rem;border-left:4px solid #2f766f;background:#fff;margin:1rem 0}
.warning{border-left-color:#9a6700}.counts{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:.75rem}
.count{background:#fff;border:1px solid #ccd6d5;border-radius:.5rem;padding:.8rem}.count strong{display:block;font-size:1.4rem}.count span{display:block}
.badge{display:inline-block;font-weight:700;letter-spacing:.04em;border:1px solid currentColor;border-radius:999px;padding:.15rem .45rem;margin-right:.35rem}
section{margin-top:2rem} table{width:100%;border-collapse:collapse;background:#fff;margin:.75rem 0 1.5rem;table-layout:fixed}
caption{text-align:left;font-weight:700;padding:.5rem 0} th,td{border:1px solid #ccd6d5;padding:.55rem;text-align:left;vertical-align:top;overflow-wrap:anywhere}
th{background:#f3efe6} code{overflow-wrap:anywhere} .muted{color:#4b5f69}
@media print{body{background:#fff}main{max-width:none;padding:.4in}nav{display:none}section{break-inside:auto}table{font-size:9pt}.count{break-inside:avoid}.no-print{display:none}}
</style>
</head>
<body>
<main>
<header>
<p class="muted">Lowcountry Digital Works · G.A.S. Engine · Release 0.9 read-only proof</p>
<h1>${escapeHtml(model.title)}</h1>
<p><span class="badge">READ ONLY</span>Evidence is mechanical; recommendation decisions and outcome direction are explicitly human-authored/declarative.</p>
</header>
<nav aria-label="Report sections">
<a href="#context">Context</a><a href="#changes">Evidence changes</a><a href="#recommendations">Recommendations</a><a href="#selected">Selected case</a><a href="#notes">Authority notes</a>
</nav>

<section id="context">
<h2>1. Scope / report context</h2>
<div class="context">
<strong>Tenant:</strong> ${escapeHtml(model.scope.tenantId)}<br>
<strong>Site:</strong> ${escapeHtml(model.scope.siteId)}<br>
<strong>Scope revision:</strong> ${escapeHtml(model.scope.siteScopeRevisionId)}<br>
<strong>Baseline collection:</strong> ${escapeHtml(model.collectionPair.baseline)}<br>
<strong>Current collection:</strong> ${escapeHtml(model.collectionPair.current)}
</div>
</section>

<section id="changes">
<h2>2. Evidence-change summary</h2>
<div class="counts">${summary}</div>
<div class="note warning"><strong>Interpretation boundary:</strong> Numeric delta is descriptive only. G.A.S. does not infer a quality direction, severity, priority, materiality, or business impact from the numeric sign.</div>
<h2>3. Review-attention table</h2>
${table('Mechanical entries requiring review attention',
  ['State','Cohort','Baseline','Current','Numeric delta','Coverage / mechanical note'],
  model.attention.map((row) => [row.state,row.cohort,row.baseline,row.current,row.delta,row.note]),
  'No non-unchanged evidence entries require attention.')}
</section>

<section id="recommendations">
<h2>4. Current recommendation overview</h2>
<p><span class="badge">HUMAN-AUTHORED</span>Recommendations remain unranked and carry no execution authority.</p>
${table('Current human-authored recommendations',
  ['ID','Lifecycle','Revision','Authority class','Priority','Human rationale'],
  model.recommendations.map((row) => [row.id,row.lifecycle,row.revision,row.authority,row.priority,row.rationale]),
  'No recommendations exist in this scope.')}
</section>

<section id="selected">
<h2>5. Selected recommendation immutable history</h2>
<p><strong>Selected:</strong> ${escapeHtml(model.selected.id)} · <strong>Current lifecycle:</strong> ${escapeHtml(model.selected.currentLifecycle)}</p>
${table('Immutable recommendation revisions',
  ['Revision','Lifecycle','Updated at','Human rationale'],
  model.selected.history.map((row) => [row.revision,row.lifecycle,row.updatedAt,row.rationale]),
  'No history records resolved.')}

<h2>6. Canonical supporting evidence</h2>
${table('Canonical observation evidence',
  ['Observation ID','Metric','Canonical value','Availability'],
  model.selected.evidence.map((row) => [row.id,row.metric,row.value,row.availability]),
  'No canonical supporting observations resolved.')}

<h2>7. Measurement history</h2>
${table('Measurements associated with the selected recommendation',
  ['Measurement ID','Relationship','Result','Comparability','Created at'],
  model.selected.measurements.map((row) => [row.id,row.relationship,row.result,row.comparability,row.createdAt]),
  'No associated measurements resolved.')}

<h2>8. Human-declared outcomes</h2>
<p><span class="badge">HUMAN-DECLARED OUTCOME</span>Direction shown below is stored human/trusted-caller judgment, not a direction calculated by G.A.S.</p>
${table('Outcomes associated with the selected recommendation',
  ['Outcome ID','Human-declared direction','Human rationale / reason','Attribution','Created at'],
  model.selected.outcomes.map((row) => [row.id,row.direction,row.rationale,row.attribution,row.createdAt]),
  'No associated outcomes resolved.')}
</section>

<section id="notes">
<h2>9. Coverage / attribution / authority notes</h2>
<ul>
<li><strong>Evidence:</strong> Release 0.7 states are mechanical evidence states only; coverage_unknown remains explicit.</li>
<li><strong>Human decision:</strong> Release 0.8 recommendations are HUMAN-AUTHORED, authorityClass=internal_review, and priority=unassessed.</li>
<li><strong>Measurement:</strong> Measurement records reuse canonical observation values and do not schedule provider reads.</li>
<li><strong>Outcome:</strong> Direction is HUMAN-DECLARED and preserves recorded rationale and attribution.</li>
<li><strong>Authority:</strong> This static document has no write controls, no provider access, no runtime AI, and no action/remediation authority.</li>
</ul>
<p class="no-print muted">Use the browser's Print / Save as PDF feature for a local printable report preview. No PDF-generation service or package is used.</p>
</section>
</main>
</body>
</html>
`;

  if (new TextEncoder().encode(html).byteLength > MAX_OPERATOR_HTML_BYTES) {
    throw new Error('Operator case HTML exceeds the bounded Release 0.9 output limit.');
  }
  return html;
}
