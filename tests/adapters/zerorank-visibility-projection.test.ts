import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  adaptZeroRankSanitizedEvidence,
  projectValidatedZeroRankVisibility,
  ZeroRankAdapterError,
  type ZeroRankAdapterConfig,
} from '../../src/adapters/zerorank.js';

type MutableJson = Record<string, any>;
const fixtureText=readFileSync('tests/fixtures/zerorank-evidence-v1.0.json','utf8');
function fixture():MutableJson{return JSON.parse(fixtureText) as MutableJson;}
function bytes(value:unknown,pretty=false):Uint8Array{return Buffer.from(JSON.stringify(value,null,pretty?2:undefined),'utf8');}
const config:ZeroRankAdapterConfig={
  scope:{tenantId:'tenant-alpha',siteId:'site-alpha',siteScopeRevisionId:'synthetic-scope-alpha-r1'},
  expectedWorkspaceId:'example-workspace',
  expectedTargetOrigin:'https://lowcountrydigitalworks.com',
  providerConnectionId:'synthetic-zerorank-connection',
  timing:{
    observedAt:'2026-09-14T12:10:00.000Z',
    startedAt:'2026-09-14T12:00:00.000Z',
    endedAt:'2026-09-14T12:08:00.000Z',
    collectedAt:'2026-09-14T12:11:00.000Z',
    receivedAt:'2026-09-14T12:12:00.000Z'
  },
  availability:{state:'available',reference:'synthetic-zerorank-artifact'}
};

test('Release 0.14 ZeroRank projection runs only through accepted Release 0.6 validation and preserves canonical output',()=>{
  const value=fixture();
  const before=adaptZeroRankSanitizedEvidence(bytes(value),config);
  const projection=projectValidatedZeroRankVisibility(bytes(value),config);
  const after=adaptZeroRankSanitizedEvidence(bytes(value),config);
  assert.deepEqual(after,before);
  assert.equal(projection.inputSha256,before.inputSha256);
  assert.equal(projection.providerId,'zerorank');
  assert.equal(projection.endpointCompleteness.prompts,'complete');
  assert.equal(projection.endpointCompleteness.rankings,'unknown');
  assert.equal(projection.endpointCompleteness.sourceUrls,'unknown');
  assert.deepEqual(projection.collections,Object.fromEntries(before.collections.map((entry)=>[entry.endpoint,entry.collectionId])));
});

test('projection preserves bounded provider-specific ranking, prompt, chat and source URL fields without Bing normalization',()=>{
  const projection=projectValidatedZeroRankVisibility(bytes(fixture()),config);
  assert.equal(projection.rankings[0]?.id,'1');
  assert.equal(projection.rankings[0]?.domain,'example.test');
  assert.equal(projection.rankings[0]?.mentions,4);
  assert.equal(projection.rankings[0]?.visibilityPercentage,0);
  assert.equal(projection.prompts[0]?.id,'10');
  assert.equal(projection.prompts[0]?.text,'Synthetic prompt alpha');
  assert.equal(projection.prompts[0]?.aiSearchVolume,0);
  assert.equal(projection.chats[0]?.promptId,'10');
  assert.equal(projection.chats[0]?.citationCount,2);
  assert.equal(projection.sourceUrls[0]?.sourceUrl,'https://reference.example.test/a');
  assert.equal(projection.sourceUrls[0]?.totalCitations,3);
  assert.equal(Object.hasOwn(projection.rankings[0]??{},'bingCitationCount'),false);
});

test('Release 0.6 fail-closed validation still blocks projection',()=>{
  const value=fixture();
  value.endpoints.rankings.returnedCount=999;
  assert.throws(
    ()=>projectValidatedZeroRankVisibility(bytes(value),config),
    (error:unknown)=>error instanceof ZeroRankAdapterError && error.code==='invalid_source',
  );
});

test('projection semantic identity is independent of harmless JSON formatting',()=>{
  const value=fixture();
  const compact=projectValidatedZeroRankVisibility(bytes(value,false),config);
  const pretty=projectValidatedZeroRankVisibility(bytes(value,true),config);
  assert.notEqual(compact.inputSha256,pretty.inputSha256);
  assert.deepEqual({...compact,inputSha256:'redacted'},{...pretty,inputSha256:'redacted'});
});

test('invalid projected nested fields are omitted rather than coerced or expanded',()=>{
  const value=fixture();
  value.endpoints.rankings.rows[0].domain=null;
  value.endpoints.rankings.rows[0].sentiment={synthetic:'not scalar'};
  value.endpoints.prompts.rows[0].tags={deep:'but bounded'};
  const projection=projectValidatedZeroRankVisibility(bytes(value),config);
  assert.equal(projection.rankings[0]?.domain,undefined);
  assert.equal(projection.rankings[0]?.sentiment,undefined);
  assert.deepEqual(projection.prompts[0]?.tags,{deep:'but bounded'});
});
