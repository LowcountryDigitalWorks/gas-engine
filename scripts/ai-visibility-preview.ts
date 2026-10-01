import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  adaptBingAiPerformanceEvidence,
  type BingAiAdapterConfig,
} from '../src/adapters/bing-ai-performance.js';
import type { ZeroRankAdapterConfig } from '../src/adapters/zerorank.js';
import { analyzeAiVisibility } from '../src/analysis/ai-visibility.js';
import { renderAiVisibilityHtml } from '../src/operator/ai-visibility.js';
import type { Scope } from '../src/persistence/repository.js';

type MutableJson=Record<string,any>;
const artifactDirectory=resolve('local-artifacts');
const outputPath=resolve(artifactDirectory,'release-0.14-ai-visibility-preview.html');
const scope:Scope={
  tenantId:'tenant-alpha',
  siteId:'site-alpha',
  siteScopeRevisionId:'synthetic-scope-alpha-r1'
};
function bytes(value:unknown):Uint8Array{return Buffer.from(JSON.stringify(value),'utf8');}

const bing=JSON.parse(readFileSync('tests/fixtures/bing-ai-performance-evidence-v1.0.json','utf8')) as MutableJson;
const bingConfig:BingAiAdapterConfig={
  scope:structuredClone(scope),
  expectedProperty:bing.property,
  providerConnectionId:'synthetic-preview-bing-ai',
  collectedAt:'2026-09-30T12:11:00.000Z',
  receivedAt:'2026-09-30T12:12:00.000Z',
  availability:{state:'available',reference:'synthetic-release-014-preview-bing'}
};
const zeroRank=JSON.parse(readFileSync('tests/fixtures/zerorank-evidence-v1.0.json','utf8')) as MutableJson;
const zeroRankConfig:ZeroRankAdapterConfig={
  scope:structuredClone(scope),
  expectedWorkspaceId:'example-workspace',
  expectedTargetOrigin:'https://lowcountrydigitalworks.com',
  providerConnectionId:'synthetic-preview-zerorank',
  timing:{
    observedAt:'2026-09-30T12:00:00.000Z',
    startedAt:'2026-09-30T11:50:00.000Z',
    endedAt:'2026-09-30T11:58:00.000Z',
    collectedAt:'2026-09-30T12:01:00.000Z',
    receivedAt:'2026-09-30T12:02:00.000Z'
  },
  availability:{state:'available',reference:'synthetic-release-014-preview-zerorank'}
};

const report=analyzeAiVisibility({
  bingCurrent:adaptBingAiPerformanceEvidence(bytes(bing),bingConfig),
  zeroRankCurrent:{bytes:bytes(zeroRank),trustedConfig:zeroRankConfig},
  evaluatedAt:'2026-09-30T13:00:00.000Z',
  policy:{
    id:'release-014-preview-policy',
    version:'1.0.0',
    maxEvidenceAgeSeconds:86_400,
    topN:1,
    concentrationShareThresholdPct:60
  }
});
const html=renderAiVisibilityHtml(report);
mkdirSync(artifactDirectory,{recursive:true});
rmSync(outputPath,{force:true});
writeFileSync(outputPath,html,{encoding:'utf8',flag:'wx'});
console.log(
  'Generated synthetic AI visibility preview: local-artifacts/release-0.14-ai-visibility-preview.html ('+
  String(new TextEncoder().encode(html).byteLength)+
  ' bytes; '+String(report.changes.length)+' change records; '+
  String(report.concentrationFindings.length)+' concentration candidates; '+
  String(report.crossSourceFindings.length)+' cross-source candidates)',
);
