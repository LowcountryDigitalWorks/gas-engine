import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptBingAiPerformanceEvidence,
  type BingAiAdapterConfig,
} from '../../src/adapters/bing-ai-performance.js';
import {
  adaptZeroRankSanitizedEvidence,
  projectValidatedZeroRankVisibility,
  ZeroRankAdapterError,
  type ZeroRankAdapterConfig,
  type ZeroRankVisibilityProjection,
} from '../../src/adapters/zerorank.js';
import {
  adaptSearchAnalyticsEvidence,
  type SearchAnalyticsAdapterConfig,
} from '../../src/adapters/search-analytics.js';
import {
  analyzeAiVisibility,
  AiVisibilityAnalysisError,
  type AiVisibilityPolicy,
  type ZeroRankAnalysisInput,
} from '../../src/analysis/ai-visibility.js';
import type { Scope } from '../../src/persistence/repository.js';
import { batch } from '../persistence/helpers.js';

type MutableJson=Record<string,any>;
const bingText=readFileSync('tests/fixtures/bing-ai-performance-evidence-v1.0.json','utf8');
const zrText=readFileSync('tests/fixtures/zerorank-evidence-v1.0.json','utf8');
const searchText=readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json','utf8');
const alphaScope:Scope=structuredClone(batch('alpha').collection.scope);
const betaScope:Scope=structuredClone(batch('beta').collection.scope);
const currentTiming:ZeroRankAdapterConfig['timing']={
  observedAt:'2026-09-30T12:00:00.000Z',
  startedAt:'2026-09-30T11:50:00.000Z',
  endedAt:'2026-09-30T11:58:00.000Z',
  collectedAt:'2026-09-30T12:01:00.000Z',
  receivedAt:'2026-09-30T12:02:00.000Z'
};
const baselineTiming:ZeroRankAdapterConfig['timing']={
  observedAt:'2026-09-23T12:00:00.000Z',
  startedAt:'2026-09-23T11:50:00.000Z',
  endedAt:'2026-09-23T11:58:00.000Z',
  collectedAt:'2026-09-23T12:01:00.000Z',
  receivedAt:'2026-09-23T12:02:00.000Z'
};

function bytes(value:unknown):Uint8Array{return Buffer.from(JSON.stringify(value),'utf8');}
function bingFixture(targetOrigin='https://lowcountrydigitalworks.com'):MutableJson{
  return JSON.parse(bingText.replaceAll('https://example.test',targetOrigin)) as MutableJson;
}
function zrFixture():MutableJson{return JSON.parse(zrText) as MutableJson;}
function searchFixture(targetOrigin='https://lowcountrydigitalworks.com'):MutableJson{
  const hostname=new URL(targetOrigin).hostname;
  return JSON.parse(searchText.replaceAll('example.test',hostname)) as MutableJson;
}
function bingConfig(value:MutableJson,scope:Scope=alphaScope):BingAiAdapterConfig{
  return {
    scope:structuredClone(scope),
    expectedProperty:value.property,
    providerConnectionId:'synthetic-bing-ai-connection',
    collectedAt:new Date(Date.parse(value.exportedAt)+60_000).toISOString(),
    receivedAt:new Date(Date.parse(value.exportedAt)+120_000).toISOString(),
    availability:{state:'available',reference:'synthetic-bing-ai-export'}
  };
}
function adaptBing(value:MutableJson=bingFixture(),scope:Scope=alphaScope){
  return adaptBingAiPerformanceEvidence(bytes(value),bingConfig(value,scope));
}
function zrConfig(
  value:MutableJson,
  scope:Scope=alphaScope,
  timing:ZeroRankAdapterConfig['timing']=currentTiming,
  availability:ZeroRankAdapterConfig['availability']={state:'available',reference:'synthetic-zerorank-artifact'},
):ZeroRankAdapterConfig{
  return {
    scope:structuredClone(scope),
    expectedWorkspaceId:'example-workspace',
    expectedTargetOrigin:value.targetOrigin,
    providerConnectionId:'synthetic-zerorank-connection',
    timing:structuredClone(timing),
    availability:structuredClone(availability)
  };
}
function zrInput(
  value:MutableJson=zrFixture(),
  scope:Scope=alphaScope,
  timing:ZeroRankAdapterConfig['timing']=currentTiming,
  availability:ZeroRankAdapterConfig['availability']={state:'available',reference:'synthetic-zerorank-artifact'},
):ZeroRankAnalysisInput{
  return {bytes:bytes(value),trustedConfig:zrConfig(value,scope,timing,availability)};
}
function policy(overrides:Partial<AiVisibilityPolicy>={}):AiVisibilityPolicy{
  return {
    id:'ai-visibility-policy',
    version:'1.0.0',
    maxEvidenceAgeSeconds:86_400,
    topN:1,
    concentrationShareThresholdPct:60,
    ...overrides
  };
}
function analyze(overrides:Record<string,unknown>={}){
  return analyzeAiVisibility({
    bingCurrent:adaptBing(),
    zeroRankCurrent:zrInput(),
    evaluatedAt:'2026-09-30T13:00:00.000Z',
    policy:policy(),
    ...overrides
  });
}

test('analysis accepts only raw sanitized ZeroRank evidence plus trusted config and rejects caller projections',()=>{
  const value=zrFixture();
  const config=zrConfig(value);
  const projection=projectValidatedZeroRankVisibility(bytes(value),config);
  assert.throws(
    ()=>analyzeAiVisibility({
      bingCurrent:adaptBing(),
      zeroRankCurrent:projection,
      evaluatedAt:'2026-09-30T13:00:00.000Z',
      policy:policy()
    }),
    (error:unknown)=>error instanceof AiVisibilityAnalysisError&&error.code==='invalid_input'
  );

  const fabrications:Array<[string,(projection:any)=>void]>=[
    ['trusted target',(candidate)=>{candidate.trustedTargetOrigin='https://forged.example.test';}],
    ['trusted scope',(candidate)=>{candidate.scope=structuredClone(betaScope);}],
    ['availability',(candidate)=>{candidate.availability={state:'unavailable',reason:'forged'};}],
    ['endpoint completeness',(candidate)=>{candidate.endpointCompleteness.sourceUrls='complete';}],
    ['collection identity',(candidate)=>{candidate.collections.sourceUrls='zerorank.collection.sourceUrls:forged';}],
    ['ranking value',(candidate)=>{candidate.rankings[0].mentions=999;}],
    ['chat value',(candidate)=>{candidate.chats[0].citationCount=999;}],
    ['source URL value',(candidate)=>{candidate.sourceUrls[0].totalCitations=999;}],
  ];
  for(const [label,mutate] of fabrications){
    const candidate=structuredClone(projection) as any;
    mutate(candidate);
    assert.throws(
      ()=>analyzeAiVisibility({
        bingCurrent:adaptBing(),
        zeroRankCurrent:candidate,
        evaluatedAt:'2026-09-30T13:00:00.000Z',
        policy:policy()
      }),
      (error:unknown)=>error instanceof AiVisibilityAnalysisError&&error.code==='invalid_input',
      label
    );
  }
});

test('malformed ZeroRank bytes fail through accepted Release 0.6 validation before findings',()=>{
  const value=zrFixture();
  assert.throws(
    ()=>analyze({zeroRankCurrent:{bytes:Buffer.from('{','utf8'),trustedConfig:zrConfig(value)}}),
    (error:unknown)=>error instanceof ZeroRankAdapterError&&error.code==='invalid_json'
  );
});

test('trusted ZeroRank target and workspace mismatches fail through accepted validation',()=>{
  const value=zrFixture();
  const targetMismatch:ZeroRankAdapterConfig={
    ...zrConfig(value),
    expectedTargetOrigin:'https://other.example.test'
  };
  assert.throws(
    ()=>analyze({zeroRankCurrent:{bytes:bytes(value),trustedConfig:targetMismatch}}),
    (error:unknown)=>error instanceof ZeroRankAdapterError&&error.code==='configuration_mismatch'
  );

  const workspaceMismatch:ZeroRankAdapterConfig={
    ...zrConfig(value),
    expectedWorkspaceId:'other-workspace'
  };
  assert.throws(
    ()=>analyze({zeroRankCurrent:{bytes:bytes(value),trustedConfig:workspaceMismatch}}),
    (error:unknown)=>error instanceof ZeroRankAdapterError&&error.code==='configuration_mismatch'
  );
});

test('provider readiness preserves Bing sampling and accepted ZeroRank unknown-exhaustion semantics',()=>{
  const report=analyze();
  const bing=report.readiness.find((entry)=>entry.providerId==='bing-webmaster-ai-performance');
  const zr=report.readiness.find((entry)=>entry.providerId==='zerorank');
  assert.equal(bing?.state,'ready');
  assert.deepEqual(bing?.reasons,['sampled_aggregated']);
  assert.equal(zr?.state,'limited');
  assert.equal(zr?.reasons.includes('incomplete_endpoint'),true);
  assert.equal(report.bing.sampledAggregated,true);
  assert.equal(report.zeroRank.endpointCompleteness.rankings,'unknown');
  assert.equal(report.zeroRank.endpointCompleteness.chats,'unknown');
  assert.equal(report.zeroRank.endpointCompleteness.sources,'unknown');
  assert.equal(report.zeroRank.endpointCompleteness.sourceUrls,'unknown');
  assert.equal(report.zeroRank.endpointCompleteness.prompts,'complete');
  assert.match(report.semantics.bingSamplingWarning,/sampled\/aggregated/i);
  assert.match(report.semantics.metricBoundaryWarning,/not ranking/i);
  assert.deepEqual(
    report.comparability.map((entry)=>[entry.providerId,entry.state,entry.reasons]),
    [
      ['bing-webmaster-ai-performance','not_comparable',['insufficient_comparable_windows']],
      ['zerorank','not_comparable',['insufficient_comparable_windows']]
    ]
  );
});

test('incompatible validated trusted targets are limited and block cross-source divergence',()=>{
  const value=bingFixture('https://example.test');
  const report=analyze({bingCurrent:adaptBing(value)});
  assert.equal(report.readiness.every((entry)=>entry.reasons.includes('incompatible_scope')),true);
  assert.equal(report.crossSourceFindings.length,0);
});

test('scope mismatch fails closed after accepted ZeroRank validation and before findings',()=>{
  assert.throws(
    ()=>analyzeAiVisibility({
      bingCurrent:adaptBing(),
      zeroRankCurrent:zrInput(zrFixture(),betaScope),
      evaluatedAt:'2026-09-30T13:00:00.000Z',
      policy:policy()
    }),
    (error:unknown)=>error instanceof AiVisibilityAnalysisError&&error.code==='configuration_mismatch'
  );
});

test('Bing within-provider baseline/current emits increase, decrease, unchanged and not-comparable semantics without evaluative labels',()=>{
  const baselineValue=bingFixture();
  baselineValue.exportedAt='2026-09-23T12:10:00.000Z';
  baselineValue.period={start:'2026-09-16T00:00:00.000Z',end:'2026-09-23T00:00:00.000Z'};
  baselineValue.summary.totalCitations=15;
  baselineValue.pages=[
    {url:'https://lowcountrydigitalworks.com/alpha',citationCount:10},
    {url:'https://lowcountrydigitalworks.com/beta',citationCount:6},
    {url:'https://lowcountrydigitalworks.com/gamma',citationCount:2}
  ];
  baselineValue.groundingQueries=[
    {phrase:'synthetic grouped phrase alpha',citationCount:10,intent:'Synthetic provider intent',topic:'Synthetic provider topic',citationSharePct:55.5},
    {phrase:'synthetic grouped phrase beta',citationCount:5,citationSharePct:20}
  ];
  baselineValue.queryPageMappings=[
    {phrase:'synthetic grouped phrase alpha',url:'https://lowcountrydigitalworks.com/alpha',citationCount:7},
    {phrase:'synthetic grouped phrase beta',url:'https://lowcountrydigitalworks.com/beta',citationCount:2}
  ];
  const report=analyze({bingBaseline:adaptBing(baselineValue)});
  const byIdentity=(identity:string,metric:string)=>report.changes.find((row)=>row.providerId==='bing-webmaster-ai-performance'&&row.identity===identity&&row.metric===metric);
  assert.equal(byIdentity('https://lowcountrydigitalworks.com/alpha','page_citations')?.state,'increase_observed');
  assert.equal(byIdentity('https://lowcountrydigitalworks.com/beta','page_citations')?.state,'decrease_observed');
  assert.equal(byIdentity('https://lowcountrydigitalworks.com/gamma','page_citations')?.state,'unchanged_observed');
  assert.equal(report.changes.some((row)=>/improv|regress|success|failure/i.test(row.state)),false);

  const incompatibleBaseline=bingFixture();
  incompatibleBaseline.exportedAt='2026-09-24T12:10:00.000Z';
  incompatibleBaseline.period={start:'2026-09-16T00:00:00.000Z',end:'2026-09-24T00:00:00.000Z'};
  const notComparable=analyze({bingBaseline:adaptBing(incompatibleBaseline)});
  assert.equal(notComparable.changes.filter((row)=>row.providerId==='bing-webmaster-ai-performance').every((row)=>row.state==='not_comparable'),true);
  const bingComparability=notComparable.comparability.find((entry)=>entry.providerId==='bing-webmaster-ai-performance');
  assert.equal(bingComparability?.state,'not_comparable');
  assert.equal(bingComparability?.reasons.includes('incompatible_periods'),true);
});

test('ZeroRank baseline/current change states come only from independently valid artifacts and trusted configs',()=>{
  const baselineValue=zrFixture();
  baselineValue.endpoints.rankings.rows[0].mentions=1;
  baselineValue.endpoints.rankings.rows[0].visibilityPercentage=2;
  baselineValue.endpoints.sourceUrls.rows[0].totalCitations=1;
  baselineValue.endpoints.sourceUrls.rows[0].totalUsage=1;
  baselineValue.endpoints.sourceUrls.rows[0].usagePercentage=0;
  const report=analyze({
    zeroRankBaseline:zrInput(baselineValue,alphaScope,baselineTiming)
  });
  const zr=report.changes.filter((row)=>row.providerId==='zerorank');
  assert.equal(zr.some((row)=>row.family==='ranking'&&row.metric==='mentions'&&row.state==='increase_observed'),true);
  assert.equal(zr.some((row)=>row.family==='ranking'&&row.metric==='visibilityPercentage'&&row.state==='decrease_observed'),true);
  assert.equal(zr.some((row)=>row.family==='ranking'&&row.metric==='rank'&&row.state==='unchanged_observed'),true);
  assert.equal(zr.some((row)=>row.family==='source_url'&&row.metric==='totalCitations'&&row.state==='increase_observed'),true);
  assert.equal(zr.every((row)=>!row.metric.startsWith('bing-')),true);
});

test('Bing page concentration is emitted only with sufficient exported-view readiness and explicit caller policy',()=>{
  const report=analyze();
  const finding=report.concentrationFindings.find((row)=>row.kind==='bing_page_citation_concentration_candidate');
  assert.ok(finding);
  assert.equal(finding.numerator,12);
  assert.equal(finding.denominator,18);
  assert.equal(finding.calculatedSharePct,66.666667);
  assert.equal(finding.policy.topN,1);
  assert.equal(finding.policy.concentrationShareThresholdPct,60);

  const filtered=bingFixture();
  filtered.state.coverage={state:'filtered',filters:['page=alpha'],reason:'Synthetic filter'};
  const blocked=analyze({bingCurrent:adaptBing(filtered)});
  assert.equal(blocked.concentrationFindings.some((row)=>row.kind==='bing_page_citation_concentration_candidate'),false);
});

test('accepted ZeroRank v1 source URL unknown exhaustion blocks denominator-dependent concentration',()=>{
  const report=analyze();
  assert.equal(report.zeroRank.endpointCompleteness.sourceUrls,'unknown');
  assert.equal(report.concentrationFindings.some((row)=>row.kind==='zerorank_source_url_citation_concentration_candidate'),false);
});

test('explicit positive ZeroRank evidence remains usable and can diverge from provable Bing absence',()=>{
  const absent=bingFixture();
  absent.summary.totalCitations=0;
  absent.pages=absent.pages.map((row:any)=>({...row,citationCount:0}));
  const zr=zrFixture();
  zr.endpoints.rankings.rows[0].domain='lowcountrydigitalworks.com';
  const report=analyze({bingCurrent:adaptBing(absent),zeroRankCurrent:zrInput(zr)});
  assert.equal(report.zeroRank.rankings.some((row)=>row.domain==='lowcountrydigitalworks.com'&&(row.mentions??0)>0),true);
  assert.equal(report.crossSourceFindings.some((row)=>
    row.kind==='cross_source_visibility_presence_divergence_candidate'
    && row.bingState==='absent'
    && row.zeroRankState==='present'
  ),true);
});

test('missing or zero ZeroRank rows under unknown exhaustion never become absence',()=>{
  const value=zrFixture();
  value.endpoints.rankings.rows=[];
  value.endpoints.rankings.returnedCount=0;
  value.endpoints.sourceUrls.rows=[];
  value.endpoints.sourceUrls.returnedCount=0;
  const report=analyze({zeroRankCurrent:zrInput(value)});
  assert.equal(report.zeroRank.endpointCompleteness.rankings,'unknown');
  assert.equal(report.zeroRank.endpointCompleteness.sourceUrls,'unknown');
  assert.equal(report.crossSourceFindings.some((row)=>row.kind==='cross_source_visibility_presence_divergence_candidate'),false);
});

test('cross-source cohort divergence requires exact mapping and only contract-producible provider states',()=>{
  const bingValue=bingFixture();
  bingValue.groundingQueries[0].citationCount=0;
  const bingCurrent=adaptBing(bingValue);

  const noMapping=analyze({bingCurrent});
  assert.equal(noMapping.crossSourceFindings.some((row)=>row.kind==='cross_source_cohort_coverage_divergence_candidate'),false);

  const query=bingCurrent.rows.find((row)=>row.kind==='grounding_query'&&row.phrase==='synthetic grouped phrase alpha');
  assert.ok(query?.kind==='grounding_query');
  const mapped=analyze({
    bingCurrent,
    cohortMappings:[{bingGroundingQueryIdentity:query.rowIdentity,zeroRankPromptId:'10'}]
  });
  assert.equal(mapped.crossSourceFindings.some((row)=>
    row.kind==='cross_source_cohort_coverage_divergence_candidate'
    && row.bingState==='absent'
    && row.zeroRankState==='present'
  ),true);

  const invented=analyze({
    bingCurrent,
    cohortMappings:[{bingGroundingQueryIdentity:query.rowIdentity,zeroRankPromptId:'999-not-present'}]
  });
  assert.equal(invented.crossSourceFindings.some((row)=>row.kind==='cross_source_cohort_coverage_divergence_candidate'),false);
});

test('zero-citation ZeroRank chat under unknown exhaustion does not become mapped absence',()=>{
  const value=zrFixture();
  value.endpoints.chats.rows=value.endpoints.chats.rows.map((row:any)=>({...row,citationCount:0}));
  const input=zrInput(value);
  const query=adaptBing().rows.find((row)=>row.kind==='grounding_query'&&row.phrase==='synthetic grouped phrase alpha');
  assert.ok(query?.kind==='grounding_query');
  const report=analyze({
    zeroRankCurrent:input,
    cohortMappings:[{bingGroundingQueryIdentity:query.rowIdentity,zeroRankPromptId:'10'}]
  });
  assert.equal(report.zeroRank.endpointCompleteness.chats,'unknown');
  assert.equal(report.crossSourceFindings.some((row)=>row.kind==='cross_source_cohort_coverage_divergence_candidate'),false);
});

test('Search Analytics attaches exact-page descriptive context and missing page means not_observed, not zero traffic',()=>{
  const value=searchFixture();
  const exported=Date.parse(value.exportedAt);
  const config:SearchAnalyticsAdapterConfig={
    scope:structuredClone(alphaScope),
    expectedProperty:value.property,
    providerConnectionId:'synthetic-gsc-context',
    collectedAt:new Date(exported+60_000).toISOString(),
    receivedAt:new Date(exported+120_000).toISOString(),
    availability:{state:'available',reference:'synthetic-search-context'}
  };
  const search=adaptSearchAnalyticsEvidence(bytes(value),config);
  const report=analyze({searchAnalytics:search});
  const alpha=report.traditionalSearchContext.find((row)=>row.page==='https://lowcountrydigitalworks.com/alpha');
  const gamma=report.traditionalSearchContext.find((row)=>row.page==='https://lowcountrydigitalworks.com/gamma');
  assert.equal(alpha?.state,'observed');
  assert.equal(alpha?.impressions,42);
  assert.equal(gamma?.state,'not_observed');
  assert.equal(Object.hasOwn(gamma??{},'impressions'),false);
});

test('optional 0.11/0.12 contexts are isolated and cannot change Release 0.14 finding identities',()=>{
  const base=analyze();
  const fakeSearchChange={
    id:'search-change:synthetic',
    annotation:{id:'annotation-synthetic',occurredAt:'2026-09-24T00:00:00.000Z',recordedAt:'2026-09-24T01:00:00.000Z',summary:'Synthetic change'},
    target:{rowIdentity:'search-row',query:'synthetic',page:'https://lowcountrydigitalworks.com/alpha',metric:'clicks',baselineObservationId:'obs-a'},
    baseline:{measurement:{cohort:{context:{scope:structuredClone(alphaScope)}}}},
    followUp:{measurement:{cohort:{context:{scope:structuredClone(alphaScope)}}}},
    readiness:{state:'not_ready',reasons:['follow_up_not_measured']}
  };
  const fakePageFocus={
    id:'page-focus:synthetic',
    source:{scope:structuredClone(alphaScope)},
    page:'https://lowcountrydigitalworks.com/alpha',
    state:'candidate',
    serpValidationRequired:true
  };
  const withContext=analyze({searchChange:fakeSearchChange,pageFocus:fakePageFocus});
  assert.ok(withContext.changeOutcomeContext);
  assert.ok(withContext.pageFocusContext);
  assert.deepEqual(withContext.changes.map((row)=>row.id),base.changes.map((row)=>row.id));
  assert.deepEqual(withContext.concentrationFindings.map((row)=>row.id),base.concentrationFindings.map((row)=>row.id));
  assert.deepEqual(withContext.crossSourceFindings.map((row)=>row.id),base.crossSourceFindings.map((row)=>row.id));
});

test('validated Release 0.6 adaptation remains byte-semantic equivalent around Release 0.14 analysis projection',()=>{
  const value=zrFixture();
  const config=zrConfig(value);
  const before=adaptZeroRankSanitizedEvidence(bytes(value),config);
  analyze({zeroRankCurrent:{bytes:bytes(value),trustedConfig:config}});
  const after=adaptZeroRankSanitizedEvidence(bytes(value),config);
  assert.deepEqual(after,before);
});

test('stale or unavailable ZeroRank evidence cannot create a cross-source divergence candidate',()=>{
  const staleTiming:ZeroRankAdapterConfig['timing']={
    observedAt:'2026-09-01T12:00:00.000Z',
    startedAt:'2026-09-01T11:50:00.000Z',
    endedAt:'2026-09-01T11:58:00.000Z',
    collectedAt:'2026-09-01T12:01:00.000Z',
    receivedAt:'2026-09-01T12:02:00.000Z'
  };
  const stale=analyze({zeroRankCurrent:zrInput(zrFixture(),alphaScope,staleTiming)});
  assert.equal(stale.readiness.find((entry)=>entry.providerId==='zerorank')?.reasons.includes('stale'),true);
  assert.equal(stale.crossSourceFindings.length,0);

  const unavailable=analyze({
    zeroRankCurrent:zrInput(
      zrFixture(),
      alphaScope,
      currentTiming,
      {state:'unavailable',reason:'Synthetic provider unavailable'}
    )
  });
  assert.equal(unavailable.readiness.find((entry)=>entry.providerId==='zerorank')?.reasons.includes('source_unavailable'),true);
  assert.equal(unavailable.crossSourceFindings.length,0);
});

test('filtered Bing zero evidence remains unknown for mapped cohort absence',()=>{
  const value=bingFixture();
  value.state.coverage={state:'filtered',filters:['page=https://lowcountrydigitalworks.com/alpha'],reason:'Synthetic page filter'};
  value.groundingQueries[0].citationCount=0;
  const bingCurrent=adaptBing(value);
  const query=bingCurrent.rows.find((row)=>row.kind==='grounding_query'&&row.phrase==='synthetic grouped phrase alpha');
  assert.ok(query?.kind==='grounding_query');
  const report=analyze({
    bingCurrent,
    cohortMappings:[{bingGroundingQueryIdentity:query.rowIdentity,zeroRankPromptId:'10'}]
  });
  assert.equal(report.crossSourceFindings.some((row)=>row.kind==='cross_source_cohort_coverage_divergence_candidate'),false);
});

test('Search Analytics optional context requires the same trusted site despite provider-specific property syntax',()=>{
  const value=searchFixture();
  value.property='sc-domain:other.example.test';
  const exported=Date.parse(value.exportedAt);
  const config:SearchAnalyticsAdapterConfig={
    scope:structuredClone(alphaScope),
    expectedProperty:value.property,
    providerConnectionId:'synthetic-gsc-other-property',
    collectedAt:new Date(exported+60_000).toISOString(),
    receivedAt:new Date(exported+120_000).toISOString(),
    availability:{state:'available',reference:'synthetic-search-other-property'}
  };
  const search=adaptSearchAnalyticsEvidence(bytes(value),config);
  assert.throws(
    ()=>analyze({searchAnalytics:search}),
    (error:unknown)=>error instanceof AiVisibilityAnalysisError&&error.code==='invalid_context'
  );
});

test('URL-prefix Bing properties remain incompatible with whole-site ZeroRank presence comparison',()=>{
  const value=bingFixture();
  value.property='https://lowcountrydigitalworks.com/subpath';
  const report=analyze({bingCurrent:adaptBing(value)});
  assert.equal(report.readiness.every((entry)=>entry.reasons.includes('incompatible_scope')),true);
  assert.equal(report.crossSourceFindings.length,0);
});

test('analysis input object cannot smuggle a projection beside the raw evidence boundary',()=>{
  const value=zrFixture();
  const trustedConfig=zrConfig(value);
  const projection:ZeroRankVisibilityProjection=projectValidatedZeroRankVisibility(bytes(value),trustedConfig);
  assert.throws(
    ()=>analyze({
      zeroRankCurrent:{bytes:bytes(value),trustedConfig,projection}
    }),
    (error:unknown)=>error instanceof AiVisibilityAnalysisError&&error.code==='invalid_input'
  );
});
