import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  assembleServiceBrief,
  serializeServiceBriefJson,
  ServiceBriefError,
  SERVICE_BRIEF_HARD_LIMITS,
  type ServiceBrief,
} from '../../src/operator/service-brief.js';
import {
  MAX_SERVICE_BRIEF_HTML_BYTES,
  renderServiceBriefHtml,
} from '../../src/operator/service-brief-html.js';
import { alpha, batch, beta } from '../persistence/helpers.js';
import {
  serviceBriefAiInput,
  serviceBriefDiscoveryInput,
  serviceBriefScope,
  serviceBriefSearchModules,
} from './service-brief-fixtures.js';
import {
  baseServiceBrief,
  prepareServiceBriefRepositories,
  serviceBriefPolicy,
} from './service-brief-repo-support.js';

test('strict Release 0.15 request rejects unknown fields and policy ceilings', async (t) => {
  const prepared = await prepareServiceBriefRepositories(t);
  await assert.rejects(
    assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: serviceBriefPolicy(),
      extraAuthority: 'forged',
    }),
    (error: unknown) => error instanceof ServiceBriefError && error.code === 'invalid_request',
  );
  await assert.rejects(
    assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: serviceBriefPolicy({ maxAttentionItems: SERVICE_BRIEF_HARD_LIMITS.attentionItems + 1 }),
    }),
    (error: unknown) => error instanceof ServiceBriefError && error.code === 'invalid_request',
  );
});

test('accepted producer input is recomputed and a caller-created derived Search Analytics report cannot substitute', async (t) => {
  const prepared = await prepareServiceBriefRepositories(t);
  const modules = serviceBriefSearchModules();
  const fakeDerived = {
    collectionPair: { baselineCollectionId: 'forged-a', currentCollectionId: 'forged-b' },
    unmatched: { baselineOnly: 0, currentOnly: 0, absenceSignalsEmitted: false },
    signals: [],
  };
  await assert.rejects(
    assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: serviceBriefPolicy(),
      searchAnalytics: { baseline: modules.baseline, current: fakeDerived, policy: modules.searchAnalytics.policy },
    }),
  );

  const valid = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
    scope: serviceBriefScope,
    trustedTarget: 'https://example.test',
    generatedAt: '2026-10-01T17:00:00.000Z',
    policy: serviceBriefPolicy(),
    searchAnalytics: modules.searchAnalytics,
  });
  assert.ok(valid.modules.searchAnalytics);
});

test('scope, target and trusted TenantContext boundaries fail closed', async (t) => {
  const prepared = await prepareServiceBriefRepositories(t);
  const betaModules = serviceBriefSearchModules('https://example.test', structuredClone(batch('beta').collection.scope));
  await assert.rejects(
    assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: serviceBriefPolicy(),
      searchAnalytics: betaModules.searchAnalytics,
    }),
    (error: unknown) => error instanceof ServiceBriefError && error.code === 'scope_mismatch',
  );

  const otherTarget = serviceBriefSearchModules('https://other.example.test');
  await assert.rejects(
    assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: serviceBriefPolicy(),
      searchAnalytics: otherTarget.searchAnalytics,
    }),
    (error: unknown) => error instanceof ServiceBriefError && error.code === 'target_mismatch',
  );

  await assert.rejects(
    assembleServiceBrief(prepared.evidence, prepared.review, beta, {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: serviceBriefPolicy(),
      evidenceDiff: {
        baselineCollectionId: prepared.pair.baseline.collection.id,
        currentCollectionId: prepared.pair.current.collection.id,
      },
    }),
  );
});

test('service history preserves immutable human semantics and rejects invalid selection', async (t) => {
  const { brief, prepared } = await baseServiceBrief(t);
  const current = brief.serviceHistory?.currentRecommendations.find((entry) => entry.id === prepared.accepted.id);
  assert.equal(current?.priority.level, 'unassessed');
  assert.equal(current?.authorityClass, 'internal_review');
  assert.deepEqual(
    brief.serviceHistory?.selectedHistories[0]?.history.map((entry) => entry.lifecycle),
    ['proposed', 'in_review', 'accepted'],
  );
  assert.equal(brief.serviceHistory?.selectedHistories[0]?.outcomes[0]?.assessment.direction, 'regressed');
  assert.equal(Object.hasOwn(brief, 'actions'), false);

  await assert.rejects(
    assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: serviceBriefPolicy(),
      serviceHistory: { selectedRecommendationIds: ['synthetic-missing-recommendation'] },
    }),
    (error: unknown) => error instanceof ServiceBriefError && error.code === 'invalid_selection',
  );
});

test('fixed readiness matrix preserves not-supplied, ready, limited, not-ready and unavailable without an overall score', async (t) => {
  const prepared = await prepareServiceBriefRepositories(t);
  const empty = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
    scope: serviceBriefScope,
    trustedTarget: 'https://example.test',
    generatedAt: '2026-10-01T17:00:00.000Z',
    policy: serviceBriefPolicy(),
  });
  assert.equal(empty.readiness.length, 7);
  assert.equal(empty.readiness.every((entry) => entry.state === 'not_supplied'), true);
  assert.equal(Object.hasOwn(empty, 'health'), false);
  assert.equal(Object.hasOwn(empty, 'score'), false);

  const search = serviceBriefSearchModules();
  const mixed = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
    scope: serviceBriefScope,
    trustedTarget: 'https://example.test',
    generatedAt: '2026-10-01T17:00:00.000Z',
    policy: serviceBriefPolicy(),
    searchAnalytics: search.searchAnalytics,
    searchChanges: [{
      ...search.searchChanges[0],
      followUp: undefined,
      evaluatedAt: '2026-09-20T00:00:00.000Z',
    }],
    discoveryDiagnostics: serviceBriefDiscoveryInput(),
  });
  assert.equal(mixed.readiness.find((entry) => entry.moduleId === 'search_analytics')?.state, 'ready');
  assert.equal(mixed.readiness.find((entry) => entry.moduleId === 'search_change')?.state, 'not_ready');
  assert.equal(mixed.readiness.find((entry) => entry.moduleId === 'discovery_diagnostics')?.state, 'ready');

  const unavailable = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
    scope: serviceBriefScope,
    trustedTarget: 'https://lowcountrydigitalworks.com',
    generatedAt: '2026-10-01T17:00:00.000Z',
    policy: serviceBriefPolicy(),
    aiVisibility: serviceBriefAiInput('unavailable'),
  });
  assert.equal(unavailable.readiness.find((entry) => entry.moduleId === 'ai_visibility')?.state, 'unavailable');

  const limited = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
    scope: serviceBriefScope,
    trustedTarget: 'https://lowcountrydigitalworks.com',
    generatedAt: '2026-10-01T17:00:00.000Z',
    policy: serviceBriefPolicy(),
    aiVisibility: serviceBriefAiInput(),
  });
  assert.equal(limited.readiness.find((entry) => entry.moduleId === 'ai_visibility')?.state, 'limited');
});

test('attention register is deterministic, unranked, evidence-linked and bound overflow fails', async (t) => {
  const { brief } = await baseServiceBrief(t, { discoveryDiagnostics: serviceBriefDiscoveryInput() });
  assert.ok(brief.attentionRegister.length > 0);
  assert.deepEqual(
    brief.attentionRegister.map((entry) => entry.navigationOrder),
    Array.from({ length: brief.attentionRegister.length }, (_, index) => index + 1),
  );
  assert.equal(
    brief.attentionRegister.every((entry) => !Object.hasOwn(entry, 'priority') && !Object.hasOwn(entry, 'severity')),
    true,
  );
  assert.equal(new Set(brief.attentionRegister.map((entry) => entry.id)).size, brief.attentionRegister.length);
  assert.equal(brief.attentionRegister.some((entry) => entry.moduleId === 'search_analytics' && entry.evidenceIdentity.startsWith('gsc.signal:')), true);

  const prepared = await prepareServiceBriefRepositories(t);
  const modules = serviceBriefSearchModules();
  await assert.rejects(
    assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-01T17:00:00.000Z',
      policy: serviceBriefPolicy({ maxAttentionItems: 1 }),
      searchAnalytics: modules.searchAnalytics,
      pageFocus: modules.pageFocus,
    }),
    (error: unknown) => error instanceof ServiceBriefError && error.code === 'bound_exceeded',
  );
});

test('exact URL index keeps slash and query variants distinct and does not equate canonical targets', async (t) => {
  const { brief } = await baseServiceBrief(t, { discoveryDiagnostics: serviceBriefDiscoveryInput() });
  const urls = brief.exactUrlEvidenceIndex.map((entry) => entry.url);
  for (const expected of [
    'https://example.test/page',
    'https://example.test/page/',
    'https://example.test/page?a=1',
    'https://example.test/page?a=2',
  ]) assert.equal(urls.includes(expected), true, expected);

  assert.equal(new Set(urls).size, urls.length);
  assert.equal(urls.includes('https://example.test/canonical-target'), false);
  const focus = brief.exactUrlEvidenceIndex.find((entry) => entry.url === 'https://example.test/focus');
  assert.ok(focus);
  assert.equal(focus.references.some((entry) => entry.moduleId === 'search_analytics'), true);
  assert.equal(focus.references.some((entry) => entry.moduleId === 'page_focus'), true);
});

test('Discovery and AI Visibility are recomputed through accepted producers with exact provider target reconciliation', async (t) => {
  const prepared = await prepareServiceBriefRepositories(t);
  const discovery = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
    scope: serviceBriefScope,
    trustedTarget: 'https://example.test',
    generatedAt: '2026-10-01T17:00:00.000Z',
    policy: serviceBriefPolicy(),
    discoveryDiagnostics: serviceBriefDiscoveryInput(),
  });
  assert.equal(discovery.modules.discoveryDiagnostics?.trustedTarget, 'sc-domain:example.test');

  const ai = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
    scope: serviceBriefScope,
    trustedTarget: 'https://lowcountrydigitalworks.com',
    generatedAt: '2026-10-01T17:00:00.000Z',
    policy: serviceBriefPolicy(),
    aiVisibility: serviceBriefAiInput(),
  });
  assert.equal(ai.modules.aiVisibility?.trustedTarget, 'https://lowcountrydigitalworks.com');
  assert.notEqual(ai.readiness.find((entry) => entry.moduleId === 'ai_visibility')?.state, 'not_supplied');
});

test('semantic identity and JSON are deterministic while semantic change changes identity', async (t) => {
  const { brief, prepared, request } = await baseServiceBrief(t);
  const reordered = {
    pageFocus: request.pageFocus,
    searchChanges: request.searchChanges,
    searchAnalytics: request.searchAnalytics,
    serviceHistory: request.serviceHistory,
    evidenceDiff: request.evidenceDiff,
    policy: request.policy,
    generatedAt: request.generatedAt,
    trustedTarget: request.trustedTarget,
    scope: request.scope,
  };
  const second = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, reordered);
  assert.equal(second.id, brief.id);
  assert.equal(serializeServiceBriefJson(second), serializeServiceBriefJson(brief));

  const changed = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, {
    ...request,
    generatedAt: '2026-10-01T17:00:01.000Z',
  });
  assert.notEqual(changed.id, brief.id);
  const before = brief.id;
  renderServiceBriefHtml(brief);
  assert.equal(brief.id, before);
});

test('JSON is bounded plain data and provenance manifest references rather than embeds source artifacts', async (t) => {
  const { brief } = await baseServiceBrief(t, { discoveryDiagnostics: serviceBriefDiscoveryInput() });
  const json = serializeServiceBriefJson(brief);
  assert.doesNotThrow(() => structuredClone(brief));
  assert.equal(json.includes('schemaMinorVersion'), false);
  assert.equal(json.includes('sourceApiBase'), false);
  assert.equal(json.includes('/api/v1'), false);
  assert.ok(Buffer.byteLength(json, 'utf8') < 1_500_000);
  assert.ok(brief.provenanceManifest.length >= 6);
});

test('static HTML provides all sections, accessible tables, print/CSP controls and escapes adversarial strings', async (t) => {
  const { brief } = await baseServiceBrief(t, { discoveryDiagnostics: serviceBriefDiscoveryInput() });
  const attacked = structuredClone(brief) as any;
  attacked.serviceHistory.currentRecommendations[0].rationale =
    "\"><img src=x onerror=\"alert(1)\"><script>alert('&')</script>";
  const html = renderServiceBriefHtml(attacked as ServiceBrief);

  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  for (const heading of [
    '1. Report context / scope',
    '2. Module readiness',
    '3. Unranked attention register',
    '4. Exact-page evidence index',
    '5. Service-history summary',
    '6. Search Analytics',
    '7. Search Change',
    '8. Page Focus',
    '9. Discovery Diagnostics',
    '10. AI Visibility',
    '11. Evidence / provenance manifest',
    '12. Limitations / authority notes',
  ]) assert.equal(html.includes(heading), true, heading);

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /@media print/);
  assert.match(html, /focus-visible/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /<caption>/);
  assert.match(html, /<th scope="col">/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<button\b/i);
  assert.doesNotMatch(html, /<[^>]+\sonerror\s*=/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.ok(Buffer.byteLength(html, 'utf8') < MAX_SERVICE_BRIEF_HTML_BYTES);
});

test('HTML bound and production no-network/no-write boundaries fail closed', async (t) => {
  const { brief } = await baseServiceBrief(t);
  const oversized = structuredClone(brief) as any;
  oversized.limitations = ['x'.repeat(MAX_SERVICE_BRIEF_HTML_BYTES + 100)];
  assert.throws(
    () => renderServiceBriefHtml(oversized as ServiceBrief),
    (error: unknown) => error instanceof ServiceBriefError && error.code === 'bound_exceeded',
  );

  const source = [
    readFileSync('src/operator/service-brief.ts', 'utf8'),
    readFileSync('src/operator/service-brief-html.ts', 'utf8'),
  ].join('\n');
  assert.doesNotMatch(source, /from ['"](?:node:http|node:https|node:net|undici|axios|activepieces)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /createServer|listen\s*\(|WebSocket|XMLHttpRequest/);
  assert.doesNotMatch(source, /issueTenantContext|tenant-authority/i);
  assert.doesNotMatch(source, /from ['"].*(?:sqlite|migrations)/i);
  assert.doesNotMatch(source, /\b(?:OpenAI|Anthropic|embedding|BYOK)\b/i);
  assert.doesNotMatch(source, /create(?:Inference|Recommendation|Action)|persist(?:Collection|Measurement|Outcome|Recommendation)/);
});

test('hard ceilings do not exceed Product-authorized Release 0.15 bounds', () => {
  assert.equal(SERVICE_BRIEF_HARD_LIMITS.attentionItems <= 512, true);
  assert.equal(SERVICE_BRIEF_HARD_LIMITS.pageIndexEntries <= 256, true);
  assert.equal(SERVICE_BRIEF_HARD_LIMITS.referencesPerPage <= 64, true);
  assert.equal(SERVICE_BRIEF_HARD_LIMITS.detailedRecommendationHistories <= 10, true);
  assert.equal(SERVICE_BRIEF_HARD_LIMITS.searchChanges <= 32, true);
  assert.equal(SERVICE_BRIEF_HARD_LIMITS.pageFocusReports <= 64, true);
});
