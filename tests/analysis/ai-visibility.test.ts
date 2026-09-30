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
} from '../../src/analysis/ai-visibility.js';
import type { Scope } from '../../src/persistence/repository.js';
import { batch } from '../persistence/helpers.js';

type MutableJson=Record<string,any>;
const bingText=readFileSync('tests/fixtures/bing-ai-performance-evidence-v1.0.json','utf8');
const zrText=readFileSync('tests/fixtures/zerorank-evidence-v1.0.json','utf8');
const searchText=readFileSync('tests/fixtures/search-analytics-evidence-v1.0.json','utf8');
const alphaScope:Scope=structuredClone(batch('alpha').collection.scope);
const betaScope:Scope=structuredClone(batch('beta').collection.scope);

function bytes(value:unknown):Uint8Array{return Buffer.from(JSON.stringify(value),'utf8');}
function bingFixture():MutableJson{return JSON.parse(bingText) as MutableJson;}
function zrFixture():MutableJson{return JSON.parse(zrText) as MutableJson;}
function searchFixture():MutableJson{return JSON.parse(searchText) as MutableJson;}
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
function zrConfig(scope:Scope=alphaScope):ZeroRankAdapterConfig{
  return {
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
}
function projectZr(scope:Scope=alphaScope):ZeroRankVisibilityProjection{
  const projection=projectValidatedZeroRankVisibility(bytes(zrFixture()),zrConfig(scope));
  // Analysis tests use an example.test target projection so the public synthetic providers align.
  return {...projection,trustedTargetOrigin:'https://example.test'};
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
    zeroRankCurrent:projectZr(),
    evaluatedAt:'2026-09-30T13:00:00.000Z',
    policy:policy(),
    ...overrides
  });
}

test('provider readiness preserves Bing sampling disclosure while allowing bounded provider-specific findings',()=>{
  const report=analyze();
  const bing=report.readiness.find((entry)=>entry.providerId==='bing-webmaster-ai-performance');
  assert.equal(bing?.state,'ready');
  assert.deepEqual(bing?.reasons,['sampled_aggregated']);
  assert.equal(report.bing.sampledAggregated,true);
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

test('incompatible trusted targets are limited and block cross-source divergence',()=>{
  const incompatible=projectValidatedZeroRankVisibility(bytes(zrFixture()),zrConfig());
  const report=analyzeAiVisibility({
    bingCurrent:adaptBing(),
    zeroRankCurrent:incompatible,
    evaluatedAt:'2026-09-30T13:00:00.000Z',
    policy:policy()
  });
  assert.equal(report.readiness.every((entry)=>entry.reasons.includes('incompatible_scope')),true);
  assert.equal(report.crossSourceFindings.length,0);
});

test('Bing within-provider baseline/current emits increase, decrease, unchanged and not-comparable semantics without evaluative labels',()=>{
  const baselineValue=bingFixture();
  baselineValue.exportedAt='2026-09-23T12:10:00.000Z';
  baselineValue.period={start:'2026-09-16T00:00:00.000Z',end:'2026-09-23T00:00:00.000Z'};
  baselineValue.summary.totalCitations=15;
  baselineValue.pages=[
    {url:'https://example.test/alpha',citationCount:10},
    {url:'https://example.test/beta',citationCount:6},
    {url:'https://example.test/gamma',citationCount:2}
  ];
  baselineValue.groundingQueries=[
    {phrase:'synthetic grouped phrase alpha',citationCount:10,intent:'Synthetic provider intent',topic:'Synthetic provider topic',citationSharePct:55.5},
    {phrase:'synthetic grouped phrase beta',citationCount:5,citationSharePct:20}
  ];
  baselineValue.queryPageMappings=[
    {phrase:'synthetic grouped phrase alpha',url:'https://example.test/alpha',citationCount:7},
    {phrase:'synthetic grouped phrase beta',url:'https://example.test/beta',citationCount:2}
  ];
  const report=analyze({bingBaseline:adaptBing(baselineValue)});
  const byIdentity=(identity:string,metric:string)=>report.changes.find((row)=>row.providerId==='bing-webmaster-ai-performance'&&row.identity===identity&&row.metric===metric);
  assert.equal(byIdentity('https://example.test/alpha','page_citations')?.state,'increase_observed');
  assert.equal(byIdentity('https://example.test/beta','page_citations')?.state,'decrease_observed');
  assert.equal(byIdentity('https://example.test/gamma','page_citations')?.state,'unchanged_observed');
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

test('ZeroRank changes remain provider-specific and never become Bing citation movement',()=>{
  const baseline=projectZr();
  const older:ZeroRankVisibilityProjection={
    ...baseline,
    observedAt:'2026-09-29T12:00:00.000Z',
    rankings:baseline.rankings.map((row)=>row.id==='1'?{...row,mentions:1,visibilityPercentage:2}:row),
    sourceUrls:baseline.sourceUrls.map((row)=>row.id==='url-a'?{...row,totalCitations:1,totalUsage:1}:row)
  };
  const report=analyze({zeroRankBaseline:older});
  const zr=report.changes.filter((row)=>row.providerId==='zerorank');
  assert.equal(zr.some((row)=>row.family==='ranking'&&row.metric==='mentions'&&row.state==='increase_observed'),true);
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

test('incomplete ZeroRank source URL evidence blocks denominator-dependent concentration',()=>{
  const report=analyze();
  assert.equal(report.zeroRank.endpointCompleteness.sourceUrls,'unknown');
  assert.equal(report.concentrationFindings.some((row)=>row.kind==='zerorank_source_url_citation_concentration_candidate'),false);
});

test('explicit provider presence versus explicit complete absence emits bounded divergence; unknown never becomes absent',()=>{
  const current=projectZr();
  const explicitAbsent:ZeroRankVisibilityProjection={
    ...current,
    endpointCompleteness:{...current.endpointCompleteness,rankings:'complete',sourceUrls:'complete'},
    rankings:current.rankings.map((row)=>({...row,mentions:0,visibilityPercentage:0})),
    sourceUrls:current.sourceUrls.map((row)=>({...row,totalCitations:0}))
  };
  const divergent=analyze({zeroRankCurrent:explicitAbsent});
  assert.equal(divergent.crossSourceFindings.some((row)=>row.kind==='cross_source_visibility_presence_divergence_candidate'&&row.bingState==='present'&&row.zeroRankState==='absent'),true);

  const unknown:ZeroRankVisibilityProjection={...explicitAbsent,endpointCompleteness:{...explicitAbsent.endpointCompleteness,sourceUrls:'unknown'}};
  const blocked=analyze({zeroRankCurrent:unknown});
  assert.equal(blocked.crossSourceFindings.some((row)=>row.kind==='cross_source_visibility_presence_divergence_candidate'),false);
});

test('cross-source cohort divergence requires explicit exact mapping; no fuzzy or automatic matching occurs',()=>{
  const current=projectZr();
  const explicit:ZeroRankVisibilityProjection={
    ...current,
    endpointCompleteness:{...current.endpointCompleteness,chats:'complete'},
    chats:current.chats.map((row)=>row.promptId==='10'?{...row,citationCount:0}:row)
  };
  const noMapping=analyze({zeroRankCurrent:explicit});
  assert.equal(noMapping.crossSourceFindings.some((row)=>row.kind==='cross_source_cohort_coverage_divergence_candidate'),false);

  const query=adaptBing().rows.find((row)=>row.kind==='grounding_query'&&row.phrase==='synthetic grouped phrase alpha');
  assert.ok(query?.kind==='grounding_query');
  const mapped=analyze({
    zeroRankCurrent:explicit,
    cohortMappings:[{bingGroundingQueryIdentity:query.rowIdentity,zeroRankPromptId:'10'}]
  });
  assert.equal(mapped.crossSourceFindings.some((row)=>row.kind==='cross_source_cohort_coverage_divergence_candidate'),true);

  const invented=analyze({
    zeroRankCurrent:explicit,
    cohortMappings:[{bingGroundingQueryIdentity:query.rowIdentity,zeroRankPromptId:'999-not-present'}]
  });
  assert.equal(invented.crossSourceFindings.some((row)=>row.kind==='cross_source_cohort_coverage_divergence_candidate'),false);
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
  const alpha=report.traditionalSearchContext.find((row)=>row.page==='https://example.test/alpha');
  const gamma=report.traditionalSearchContext.find((row)=>row.page==='https://example.test/gamma');
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
    target:{rowIdentity:'search-row',query:'synthetic',page:'https://example.test/alpha',metric:'clicks',baselineObservationId:'obs-a'},
    baseline:{measurement:{cohort:{context:{scope:structuredClone(alphaScope)}}}},
    followUp:{measurement:{cohort:{context:{scope:structuredClone(alphaScope)}}}},
    readiness:{state:'not_ready',reasons:['follow_up_not_measured']}
  };
  const fakePageFocus={
    id:'page-focus:synthetic',
    source:{scope:structuredClone(alphaScope)},
    page:'https://example.test/alpha',
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

test('scope mismatch fails closed rather than cross-tenant composition',()=>{
  const betaZr=projectZr(betaScope);
  assert.throws(
    ()=>analyzeAiVisibility({bingCurrent:adaptBing(),zeroRankCurrent:betaZr,evaluatedAt:'2026-09-30T13:00:00.000Z',policy:policy()}),
    (error:unknown)=>error instanceof AiVisibilityAnalysisError&&error.code==='configuration_mismatch'
  );
});

test('validated Release 0.6 adaptation still produces identical output around projection use',()=>{
  const value=zrFixture();
  const config=zrConfig();
  const before=adaptZeroRankSanitizedEvidence(bytes(value),config);
  projectValidatedZeroRankVisibility(bytes(value),config);
  const after=adaptZeroRankSanitizedEvidence(bytes(value),config);
  assert.deepEqual(after,before);
});

test('stale or unavailable provider evidence cannot create a cross-source divergence candidate',()=>{
  const current=projectZr();
  const explicitAbsent:ZeroRankVisibilityProjection={
    ...current,
    observedAt:'2026-09-01T00:00:00.000Z',
    endpointCompleteness:{...current.endpointCompleteness,rankings:'complete',sourceUrls:'complete'},
    rankings:current.rankings.map((row)=>({...row,mentions:0,visibilityPercentage:0})),
    sourceUrls:current.sourceUrls.map((row)=>({...row,totalCitations:0}))
  };
  const stale=analyze({zeroRankCurrent:explicitAbsent});
  assert.equal(stale.readiness.find((entry)=>entry.providerId==='zerorank')?.reasons.includes('stale'),true);
  assert.equal(stale.crossSourceFindings.length,0);

  const unavailable:ZeroRankVisibilityProjection={
    ...explicitAbsent,
    observedAt:'2026-09-30T12:00:00.000Z',
    availability:{state:'unavailable',reason:'Synthetic provider unavailable'}
  };
  const blocked=analyze({zeroRankCurrent:unavailable});
  assert.equal(blocked.crossSourceFindings.length,0);
});

test('filtered Bing zero evidence remains unknown for mapped cohort absence',()=>{
  const value=bingFixture();
  value.state.coverage={state:'filtered',filters:['page=https://example.test/alpha'],reason:'Synthetic page filter'};
  value.groundingQueries[0].citationCount=0;
  const bingCurrent=adaptBing(value);
  const query=bingCurrent.rows.find((row)=>row.kind==='grounding_query'&&row.phrase==='synthetic grouped phrase alpha');
  assert.ok(query?.kind==='grounding_query');
  const zr=projectZr();
  const positive:ZeroRankVisibilityProjection={
    ...zr,
    endpointCompleteness:{...zr.endpointCompleteness,chats:'complete'},
    chats:zr.chats.map((row)=>row.promptId==='10'?{...row,citationCount:2}:row)
  };
  const report=analyze({
    bingCurrent,
    zeroRankCurrent:positive,
    cohortMappings:[{bingGroundingQueryIdentity:query.rowIdentity,zeroRankPromptId:'10'}]
  });
  assert.equal(report.crossSourceFindings.some((row)=>row.kind==='cross_source_cohort_coverage_divergence_candidate'),false);
});

test('Search Analytics optional context requires exact property as well as exact scope',()=>{
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

test('complete ZeroRank source URL evidence still cannot produce concentration when stale',()=>{
  const zr=projectZr();
  const complete:ZeroRankVisibilityProjection={
    ...zr,
    observedAt:'2026-09-01T00:00:00.000Z',
    endpointCompleteness:{...zr.endpointCompleteness,sourceUrls:'complete'}
  };
  const report=analyze({zeroRankCurrent:complete});
  assert.equal(report.concentrationFindings.some((row)=>row.kind==='zerorank_source_url_citation_concentration_candidate'),false);
});

