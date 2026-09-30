import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptBingAiPerformanceEvidence,
  type BingAiAdapterConfig,
} from '../../src/adapters/bing-ai-performance.js';
import {
  projectValidatedZeroRankVisibility,
  type ZeroRankAdapterConfig,
} from '../../src/adapters/zerorank.js';
import { analyzeAiVisibility } from '../../src/analysis/ai-visibility.js';
import {
  MAX_AI_VISIBILITY_OPERATOR_HTML_BYTES,
  renderAiVisibilityHtml,
} from '../../src/operator/ai-visibility.js';
import type { Scope } from '../../src/persistence/repository.js';
import { batch } from '../persistence/helpers.js';

type MutableJson=Record<string,any>;
const bingText=readFileSync('tests/fixtures/bing-ai-performance-evidence-v1.0.json','utf8');
const zrText=readFileSync('tests/fixtures/zerorank-evidence-v1.0.json','utf8');
const scope:Scope=structuredClone(batch('alpha').collection.scope);
function bytes(value:unknown):Uint8Array{return Buffer.from(JSON.stringify(value),'utf8');}
function report(mutate?: (value:MutableJson)=>void){
  const bing=JSON.parse(bingText) as MutableJson;
  mutate?.(bing);
  const bconfig:BingAiAdapterConfig={
    scope:structuredClone(scope),
    expectedProperty:bing.property,
    providerConnectionId:'synthetic-bing-ai-connection',
    collectedAt:'2026-09-30T12:11:00.000Z',
    receivedAt:'2026-09-30T12:12:00.000Z',
    availability:{state:'available',reference:'synthetic-bing-ai-export'}
  };
  const zr=JSON.parse(zrText) as MutableJson;
  const zconfig:ZeroRankAdapterConfig={
    scope:structuredClone(scope),
    expectedWorkspaceId:'example-workspace',
    expectedTargetOrigin:'https://lowcountrydigitalworks.com',
    providerConnectionId:'synthetic-zerorank-connection',
    timing:{
      observedAt:'2026-09-30T12:00:00.000Z',
      startedAt:'2026-09-30T11:50:00.000Z',
      endedAt:'2026-09-30T11:58:00.000Z',
      collectedAt:'2026-09-30T12:01:00.000Z',
      receivedAt:'2026-09-30T12:02:00.000Z'
    },
    availability:{state:'available',reference:'synthetic-zerorank-artifact'}
  };
  const projection=projectValidatedZeroRankVisibility(bytes(zr),zconfig);
  return analyzeAiVisibility({
    bingCurrent:adaptBingAiPerformanceEvidence(bytes(bing),bconfig),
    zeroRankCurrent:{...projection,trustedTargetOrigin:'https://example.test'},
    evaluatedAt:'2026-09-30T13:00:00.000Z',
    policy:{id:'ai-visibility-policy',version:'1.0.0',maxEvidenceAgeSeconds:86_400,topN:1,concentrationShareThresholdPct:60}
  });
}

test('operator report is deterministic, standalone, CSP-restricted and visibly separates all provider/context sections',()=>{
  const value=report();
  const first=renderAiVisibilityHtml(value);
  const second=renderAiVisibilityHtml(structuredClone(value));
  assert.equal(second,first);
  assert.ok(Buffer.byteLength(first,'utf8')<=MAX_AI_VISIBILITY_OPERATOR_HTML_BYTES);
  assert.match(first,/Content-Security-Policy/);
  assert.match(first,/default-src &#39;none&#39;|default-src 'none'/);
  assert.match(first,/<h2>BING<\/h2>/);
  assert.match(first,/<h2>ZERORANK<\/h2>/);
  assert.match(first,/<h2>CROSS-SOURCE<\/h2>/);
  assert.match(first,/<h2>TRADITIONAL SEARCH CONTEXT<\/h2>/);
  assert.match(first,/<h2>CHANGE\/OUTCOME CONTEXT<\/h2>/);
  assert.match(first,/<h2>PAGE-FOCUS CONTEXT<\/h2>/);
  assert.match(first,/sampled\/aggregated/i);
  assert.match(first,/grouped provider phrase, not an exact user prompt/i);
  assert.match(first,/not ranking, authority, traffic, engagement, or page quality/i);
  assert.match(first,/does not identify which provider is correct/i);
  assert.match(first,/does not establish causation/i);
  assert.equal(/<script[\s>]/i.test(first),false);
  assert.equal(/<form[\s>]/i.test(first),false);
  assert.equal(/<button[\s>]/i.test(first),false);
  assert.equal(/https?:\/\/[^<"]+\.(?:js|css)(?:["?])/i.test(first),false);
});

test('all provider-supplied strings are HTML-escaped and never become markup',()=>{
  const value=report((bing)=>{
    bing.groundingQueries[0].phrase='<img src=x onerror=alert(1)>';
    bing.groundingQueries[0].intent='<script>alert(1)</script>';
    bing.groundingQueries[0].topic='"quoted" & <b>topic</b>';
  });
  const html=renderAiVisibilityHtml(value);
  assert.doesNotMatch(html,/<img src=x/i);
  assert.doesNotMatch(html,/<script>alert/i);
  assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html,/&quot;quoted&quot; &amp; &lt;b&gt;topic&lt;\/b&gt;/);
});

test('operator output contains no health, severity, priority, remediation, publishing, or action controls',()=>{
  const html=renderAiVisibilityHtml(report()).toLowerCase();
  for(const forbidden of ['health score','severity score','priority score','fix now','publish now','remediate now','apply fix']){
    assert.equal(html.includes(forbidden),false,forbidden);
  }
});

test('Release 0.14 operator source does not add fetch, server, listener, runtime AI, or write-control paths',()=>{
  const source=readFileSync('src/operator/ai-visibility.ts','utf8');
  assert.doesNotMatch(source,/\bfetch\s*\(/);
  assert.doesNotMatch(source,/createServer|listen\s*\(|WebSocket/);
  assert.doesNotMatch(source,/openai|anthropic|embedding/i);
  assert.doesNotMatch(source,/<form|<button|contenteditable/i);
});
