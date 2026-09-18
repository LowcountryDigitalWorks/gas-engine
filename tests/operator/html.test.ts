import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  MAX_OPERATOR_HTML_BYTES,
  renderOperatorCaseHtml,
  type OperatorCasePresentation,
} from '../../src/operator/html.js';

function presentation(): OperatorCasePresentation {
  return {
    title: 'G.A.S. operator case — synthetic-selected',
    scope: {
      tenantId: 'tenant-alpha',
      siteId: 'site-alpha',
      siteScopeRevisionId: 'synthetic-scope-alpha-r1',
    },
    collectionPair: {
      baseline: 'synthetic-baseline',
      current: 'synthetic-current',
    },
    summary: {
      total: 2,
      unchanged: 0,
      changed: 1,
      appeared: 0,
      missingFromCurrent: 0,
      coverageUnknown: 1,
      attentionCount: 2,
    },
    attention: [
      {
        state: 'changed',
        cohort: 'synthetic-cohort',
        baseline: 'number: 0',
        current: 'number: 1',
        delta: '1',
        note: 'Mechanical value change; no quality direction inferred.',
      },
      {
        state: 'coverage_unknown',
        cohort: 'synthetic-coverage',
        baseline: 'number: 2',
        current: '—',
        delta: '—',
        note: 'Current collection completeness is partial; unmatched cohort absence is not proven.',
      },
    ],
    recommendations: [{
      id: 'synthetic-selected',
      lifecycle: 'accepted',
      revision: '3',
      authority: 'internal_review',
      priority: 'unassessed',
      rationale: 'Human review rationale.',
    }],
    selected: {
      id: 'synthetic-selected',
      currentLifecycle: 'accepted',
      history: [
        { revision: '1', lifecycle: 'proposed', updatedAt: '2026-01-01T00:00:00.000Z', rationale: 'Human review rationale.' },
        { revision: '2', lifecycle: 'in_review', updatedAt: '2026-01-01T00:10:00.000Z', rationale: 'Human review rationale.' },
        { revision: '3', lifecycle: 'accepted', updatedAt: '2026-01-01T00:20:00.000Z', rationale: 'Human review rationale.' },
      ],
      evidence: [{
        id: 'synthetic-observation',
        metric: 'synthetic-metric',
        value: 'number: 0',
        availability: 'available',
      }],
      measurements: [
        {
          id: 'synthetic-baseline-measurement',
          relationship: 'baseline',
          result: 'measured (1 canonical observation(s))',
          comparability: 'comparable',
          createdAt: '2026-01-01T01:00:00.000Z',
        },
        {
          id: 'synthetic-follow-up-measurement',
          relationship: 'follow_up → synthetic-baseline-measurement',
          result: 'measured (1 canonical observation(s))',
          comparability: 'comparable',
          createdAt: '2026-01-02T01:00:00.000Z',
        },
      ],
      outcomes: [{
        id: 'synthetic-outcome',
        direction: 'regressed',
        rationale: 'Human-declared rationale.',
        attribution: 'technical_verification: Synthetic technical verification.',
        createdAt: '2026-01-03T00:00:00.000Z',
      }],
    },
  };
}

test('standalone HTML preserves evidence/decision/measurement/outcome semantics with print and accessibility structure', () => {
  const html = renderOperatorCaseHtml(presentation());
  assert.match(html, /<title>G\.A\.S\. operator case — synthetic-selected<\/title>/);
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  assert.match(html, /<caption>Mechanical entries requiring review attention<\/caption>/);
  assert.match(html, /<th scope="col">State<\/th>/);
  assert.match(html, /coverage_unknown/);
  assert.match(html, /HUMAN-AUTHORED/);
  assert.match(html, /internal_review/);
  assert.match(html, /unassessed/);
  assert.match(html, /HUMAN-DECLARED OUTCOME/);
  assert.match(html, /Human-declared rationale/);
  assert.match(html, /technical_verification/);
  assert.match(html, /Numeric delta is descriptive only/);
  assert.match(html, /@media print/);
  assert.match(html, /focus-visible/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'none'/);
  assert.ok(new TextEncoder().encode(html).byteLength < MAX_OPERATOR_HTML_BYTES);
});

test('dynamic HTML, script and attribute payloads are escaped and never become executable markup', () => {
  const model = presentation();
  const attack = `"><img src=x onerror="alert(1)"><script>alert('&')</script>`;
  const attacked: OperatorCasePresentation = {
    ...model,
    title: attack,
    scope: { ...model.scope, siteId: attack },
    recommendations: [{ ...model.recommendations[0]!, rationale: attack }],
    selected: {
      ...model.selected,
      outcomes: [{ ...model.selected.outcomes[0]!, rationale: attack, attribution: attack }],
    },
  };
  const html = renderOperatorCaseHtml(attacked);

  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /<[^>]+\sonerror\s*=/i);
  assert.doesNotMatch(html, /<[^>]+\sonmouseover\s*=/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;alert\(&#39;&amp;&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /https?:\/\//i);
});

test('operator production surface contains no network, server, persistence mutation, AI or action path', () => {
  const caseSource = readFileSync('src/operator/case-view.ts', 'utf8');
  const htmlSource = readFileSync('src/operator/html.ts', 'utf8');
  const combined = `${caseSource}\n${htmlSource}`;

  assert.doesNotMatch(combined, /from ['"](?:node:http|node:https|node:net|undici|axios|activepieces)/i);
  assert.doesNotMatch(combined, /\bfetch\s*\(/);
  assert.doesNotMatch(combined, /createServer|listen\s*\(/);
  assert.doesNotMatch(combined, /issueTenantContext|tenant-authority/i);
  assert.doesNotMatch(combined, /from ['"].*(?:sqlite|migrations|adapters\/wqt|adapters\/zerorank)/i);
  assert.doesNotMatch(combined, /\b(?:OpenAI|Anthropic|BYOK)\b/i);
  assert.doesNotMatch(combined, /create(?:Inference|Recommendation|Action)|persist(?:Collection|Measurement|Outcome|Recommendation)|record(?:Measurement|HumanOutcome)|transitionHumanRecommendation/);
  assert.doesNotMatch(htmlSource, /<script/i);
  assert.doesNotMatch(htmlSource, /localStorage|sessionStorage|XMLHttpRequest|WebSocket/);
});
