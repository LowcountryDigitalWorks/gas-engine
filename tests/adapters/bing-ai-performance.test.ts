import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptBingAiPerformanceEvidence,
  validateBingAiWindow,
  BING_AI_INPUT_SCHEMA_VERSION,
  BING_AI_INPUT_SCHEMA_MINOR_VERSION,
  BING_AI_MAX_TOTAL_ROWS,
  MAX_BING_AI_INPUT_BYTES,
  BingAiAdapterError,
  type BingAiAdapterConfig,
} from '../../src/adapters/bing-ai-performance.js';
import type { Scope } from '../../src/persistence/repository.js';
import { parseCollectionBatch } from '../../src/persistence/validation.js';
import { batch } from '../persistence/helpers.js';

type MutableJson = Record<string, any>;
const original = JSON.parse(readFileSync('tests/fixtures/bing-ai-performance-evidence-v1.0.json','utf8')) as MutableJson;
const alphaScope: Scope = structuredClone(batch('alpha').collection.scope);
const betaScope: Scope = structuredClone(batch('beta').collection.scope);

function fixture(): MutableJson {
  return structuredClone(original);
}
function bytes(value: unknown, pretty = false): Uint8Array {
  return Buffer.from(JSON.stringify(value, null, pretty ? 2 : undefined),'utf8');
}
function config(value: MutableJson, scope: Scope = alphaScope): BingAiAdapterConfig {
  return {
    scope: structuredClone(scope),
    expectedProperty: value.property,
    providerConnectionId: 'synthetic-bing-ai-connection',
    collectedAt: '2026-09-30T12:11:00.000Z',
    receivedAt: '2026-09-30T12:12:00.000Z',
    availability: { state: 'available', reference: 'synthetic-bing-ai-export' },
  };
}
function adapt(value: MutableJson = fixture(), scope: Scope = alphaScope, pretty = false) {
  return adaptBingAiPerformanceEvidence(bytes(value,pretty),config(value,scope));
}
function expectCode(code: BingAiAdapterError['code']):(error:unknown)=>boolean {
  return (error) => error instanceof BingAiAdapterError && error.code === code;
}

test('Bing AI v1/minor0 strict artifact adapts into provider-specific canonical evidence',()=>{
  const value=fixture();
  const result=adapt(value);
  assert.equal(BING_AI_INPUT_SCHEMA_VERSION,'ldw.bing-ai-performance-evidence.v1');
  assert.equal(BING_AI_INPUT_SCHEMA_MINOR_VERSION,0);
  assert.equal(result.providerId,'bing-webmaster-ai-performance');
  assert.equal(result.semantics.sampledSummary,true);
  assert.equal(result.semantics.preview.intents,true);
  assert.equal(result.semantics.preview.topics,true);
  assert.equal(result.semantics.preview.citationShare,true);
  assert.equal(result.summary?.totalCitations,18);
  assert.equal(result.rows.filter((row)=>row.kind==='page').length,3);
  assert.equal(result.rows.filter((row)=>row.kind==='grounding_query').length,2);
  assert.equal(result.rows.filter((row)=>row.kind==='query_page_mapping').length,2);
  for(const part of result.batches) {
    assert.doesNotThrow(()=>parseCollectionBatch(part));
    assert.equal(part.collection.providerId,'bing-webmaster-ai-performance');
    assert.equal(part.collection.adapter.id,'ldw-bing-ai-performance-adapter');
    assert.equal(part.collection.sourceSchema.id,'ldw.bing-ai-performance-evidence.v1');
    for(const observation of part.observations) {
      assert.match(observation.record.cohort.context.metric.id,/^bing-ai-/);
      assert.equal(observation.record.cohort.context.dimensions.providerId,'bing-webmaster-ai-performance');
    }
  }
  assert.doesNotThrow(()=>validateBingAiWindow(result));
});

test('formatting and accepted row ordering do not change semantic collection identity',()=>{
  const left=fixture();
  const right=fixture();
  right.timeSeries.reverse();
  right.pages.reverse();
  right.groundingQueries.reverse();
  right.queryPageMappings.reverse();
  const a=adapt(left,alphaScope,false);
  const b=adapt(right,alphaScope,true);
  assert.notEqual(a.inputSha256,b.inputSha256);
  assert.equal(a.collectionId,b.collectionId);
  assert.deepEqual(a.rows,b.rows);
  assert.deepEqual(a.batches,b.batches);
});

test('strict source contract rejects unknown fields and future schema drift',()=>{
  const extra=fixture();
  extra.unexpected=true;
  assert.throws(()=>adapt(extra),expectCode('invalid_source'));
  const future=fixture();
  future.schemaMinorVersion=1;
  assert.throws(()=>adapt(future),expectCode('unsupported_schema'));
});

test('exact trusted property mismatch fails closed',()=>{
  const value=fixture();
  const trusted={...config(value),expectedProperty:'sc-domain:other.example.test'};
  assert.throws(()=>adaptBingAiPerformanceEvidence(bytes(value),trusted),expectCode('configuration_mismatch'));
});

test('duplicate semantic identities fail closed per section',()=>{
  for(const mutate of [
    (value:MutableJson)=>value.timeSeries.push(structuredClone(value.timeSeries[0])),
    (value:MutableJson)=>value.pages.push(structuredClone(value.pages[0])),
    (value:MutableJson)=>value.groundingQueries.push(structuredClone(value.groundingQueries[0])),
    (value:MutableJson)=>value.queryPageMappings.push(structuredClone(value.queryPageMappings[0])),
  ]) {
    const value=fixture();
    mutate(value);
    assert.throws(()=>adapt(value),expectCode('duplicate_source_id'));
  }
});

test('aggregate row bound fails closed rather than truncating',()=>{
  const value=fixture();
  value.timeSeries=Array.from({length:366},(_,index)=>({
    date:new Date(Date.UTC(2025,0,index+1)).toISOString().slice(0,10),
    citationCount:index,
  }));
  value.pages=Array.from({length:256},(_,index)=>({url:`https://example.test/p${index}`,citationCount:index}));
  value.groundingQueries=Array.from({length:147},(_,index)=>({phrase:`synthetic phrase ${index}`,citationCount:index}));
  value.queryPageMappings=[];
  assert.equal(value.timeSeries.length+value.pages.length+value.groundingQueries.length,BING_AI_MAX_TOTAL_ROWS+1);
  assert.throws(()=>adapt(value),expectCode('too_many_rows'));
});

test('source byte bound fails before parsing oversized content',()=>{
  const oversized=Buffer.alloc(MAX_BING_AI_INPUT_BYTES+1,0x20);
  assert.throws(()=>adaptBingAiPerformanceEvidence(oversized,config(fixture())),expectCode('input_too_large'));
});

test('sampling, filtered exports, unknown coverage, preliminary and processing states are preserved',()=>{
  const filtered=fixture();
  filtered.state.coverage={state:'filtered',filters:['page=https://example.test/alpha'],reason:'Synthetic filter'};
  filtered.state.dataState='preliminary';
  const a=adapt(filtered);
  assert.equal(a.semantics.coverage.state,'filtered');
  assert.equal(a.semantics.dataState,'preliminary');
  assert.equal(a.batches[0]?.collection.completeness.state,'partial');

  const unknown=fixture();
  unknown.state.coverage={state:'unknown',reason:'Synthetic unknown coverage'};
  unknown.state.dataState='processing';
  const b=adapt(unknown);
  assert.equal(b.semantics.coverage.state,'unknown');
  assert.equal(b.semantics.dataState,'processing');
  assert.equal(b.semantics.sampledSummary,true);
});

test('provider preview labels remain evidence and exact strings are preserved',()=>{
  const value=fixture();
  value.groundingQueries[0].intent='Provider <intent>';
  value.groundingQueries[0].topic='Provider "topic"';
  const result=adapt(value);
  const row=result.rows.find((entry)=>entry.kind==='grounding_query'&&entry.phrase==='synthetic grouped phrase alpha');
  assert.ok(row?.kind==='grounding_query');
  assert.equal(row.intent,'Provider <intent>');
  assert.equal(row.topic,'Provider "topic"');
});

test('query/page mappings are used only when explicitly supplied',()=>{
  const value=fixture();
  delete value.queryPageMappings;
  const result=adapt(value);
  assert.equal(result.rows.some((row)=>row.kind==='query_page_mapping'),false);
});

test('Alpha/Beta trusted scopes remain isolated',()=>{
  const value=fixture();
  const alpha=adapt(value,alphaScope);
  const beta=adapt(value,betaScope);
  assert.notEqual(alpha.collectionId,beta.collectionId);
  assert.equal(alpha.batches.every((part)=>part.collection.scope.tenantId===alphaScope.tenantId),true);
  assert.equal(beta.batches.every((part)=>part.collection.scope.tenantId===betaScope.tenantId),true);
});

test('canonical adapted window revalidation rejects sidecar identity tampering',()=>{
  const result=adapt();
  const tampered=structuredClone(result) as any;
  tampered.rows[0].rowIdentity='bing-ai.row:forged';
  assert.throws(()=>validateBingAiWindow(tampered),expectCode('invalid_output'));
});

test('sampled provider totals are preserved without false reconciliation across summary and page views',()=>{
  const value=fixture();
  value.summary.totalCitations=999;
  const result=adapt(value);
  assert.equal(result.summary?.totalCitations,999);
  assert.equal(result.rows.filter((row)=>row.kind==='page').reduce((sum,row)=>sum+row.citationCount,0),18);
});

test('exact URL and grounding-query identities preserve distinctions rather than normalizing them',()=>{
  const value=fixture();
  value.pages=[
    {url:'https://example.test/path',citationCount:1},
    {url:'https://example.test/path/',citationCount:2},
    {url:'https://example.test/path?x=1',citationCount:3}
  ];
  value.groundingQueries=[
    {phrase:'Synthetic Phrase',citationCount:1},
    {phrase:'synthetic phrase',citationCount:2},
    {phrase:'synthetic phrase ',citationCount:3}
  ];
  value.queryPageMappings=[];
  const result=adapt(value);
  const pages=result.rows.filter((row)=>row.kind==='page');
  const queries=result.rows.filter((row)=>row.kind==='grounding_query');
  assert.equal(pages.length,3);
  assert.equal(new Set(pages.map((row)=>row.url)).size,3);
  assert.equal(queries.length,3);
  assert.equal(new Set(queries.map((row)=>row.phrase)).size,3);
});

test('bounded integer and percentage math rejects out-of-contract values',()=>{
  const tooLarge=fixture();
  tooLarge.pages[0].citationCount=1_000_000_001;
  assert.throws(()=>adapt(tooLarge),expectCode('invalid_source'));

  const badShare=fixture();
  badShare.groundingQueries[0].citationSharePct=100.000001;
  assert.throws(()=>adapt(badShare),expectCode('invalid_source'));

  const maxShare=fixture();
  maxShare.groundingQueries[0].citationSharePct=100;
  assert.equal(adapt(maxShare).rows.some((row)=>row.kind==='grounding_query'&&row.citationSharePct===100),true);
});

test('Release 0.14 production sources contain no provider client, network, runtime AI, tenant issuer, persistence write, or action path',()=>{
  for(const sourcePath of [
    'src/adapters/bing-ai-performance.ts',
    'src/analysis/ai-visibility.ts',
    'src/operator/ai-visibility.ts'
  ]){
    const source=readFileSync(sourcePath,'utf8');
    assert.doesNotMatch(source,/\bfetch\s*\(|createServer|\.listen\s*\(|WebSocket|node:https|node:http|node:net/);
    assert.doesNotMatch(source,/OAuth|OPENAI_API_KEY|anthropic|embedding|runtime LLM/i);
    assert.doesNotMatch(source,/issueTenantContext|createTenantContext|mint.*context/i);
    assert.doesNotMatch(source,/\.persist\s*\(|\.insert\s*\(|\.update\s*\(|\.delete\s*\(/i);
  }
});

