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
  const trusted=config(value);
  trusted.expectedProperty='sc-domain:other.example.test';
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
    date:`2025-${String(Math.floor(index/28)+1).padStart(2,'0')}-${String(index%28+1).padStart(2,'0')}`,
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
