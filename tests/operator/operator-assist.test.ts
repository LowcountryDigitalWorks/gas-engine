import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test, type TestContext } from 'node:test';
import type { TenantContext } from '../../src/persistence/tenant-context.js';
import {
  assertOperatorAssistPacketIntegrity,
  createOperatorAssistPacket,
  OPERATOR_ASSIST_HARD_LIMITS,
  OPERATOR_ASSIST_REVIEWER_INSTRUCTIONS,
  OperatorAssistError,
  serializeOperatorAssistPacketJson,
  serializeValidatedOperatorAssistAdvisoryJson,
  validateOperatorAssistAdvisory,
  type OperatorAssistPacket,
} from '../../src/operator/operator-assist.js';
import {
  MAX_OPERATOR_ASSIST_HTML_BYTES,
  renderOperatorAssistAdvisoryHtml,
} from '../../src/operator/operator-assist-html.js';
import { alpha, beta } from '../persistence/helpers.js';
import { baseServiceBrief } from './service-brief-repo-support.js';
import { serviceBriefScope } from './service-brief-fixtures.js';

function assistPolicy(overrides: Record<string, unknown> = {}) {
  return {
    id: 'operator-assist-policy',
    version: '1.0.0',
    maxAttentionItems: 128,
    maxEvidenceReferences: 512,
    ...overrides,
  };
}

async function assistFixture(t: TestContext) {
  const base = await baseServiceBrief(t);
  const input = {
    serviceBriefRequest: base.request,
    policy: assistPolicy(),
  };
  const packet = await createOperatorAssistPacket(
    base.prepared.evidence,
    base.prepared.review,
    alpha,
    input,
  );
  return { ...base, input, packet };
}

function primaryRef(packet: OperatorAssistPacket, attentionIndex: number): string {
  const item = packet.attentionItems[attentionIndex];
  assert.ok(item, `attention ${attentionIndex} exists`);
  const ref = packet.evidenceReferences.find((entry) => entry.kind === 'attention' && entry.attentionId === item.attentionId);
  assert.ok(ref, `primary attention reference ${attentionIndex} exists`);
  return ref.id;
}

function validAdvisory(packet: OperatorAssistPacket, malicious = false) {
  assert.ok(packet.attentionItems.length >= 2, 'synthetic packet has multiple attention items');
  const first = packet.attentionItems[0]!;
  const second = packet.attentionItems[1]!;
  const firstRef = primaryRef(packet, 0);
  const secondRef = primaryRef(packet, 1);
  const firstContextRef = first.evidenceRefs.find((id) => id !== firstRef);
  const hostile = `<script>alert("x&y")</script><svg onload='boom'> https://evil.example/?a=1&b=2`;
  return {
    version: '0.21.0',
    assistPacketId: packet.id,
    authorityBoundary: 'untrusted_external_advisory_human_review_required',
    orderingSemantics: 'external_suggested_review_order_not_canonical_priority',
    provenance: {
      reviewerKind: 'ai',
      providerLabel: malicious ? `provider<&"'> ${hostile}` : 'synthetic-review-provider',
      modelLabel: malicious ? `model<&"'> ${hostile}` : 'synthetic-model-label',
      reviewedAt: '2026-10-07T20:00:00.000Z',
      method: { label: 'synthetic-external-review', version: '1.0.0' },
    },
    summary: malicious ? hostile : 'Synthetic external summary; structurally grounded but not trusted as truth.',
    reviewCandidates: [
      {
        attentionId: first.attentionId,
        rationale: malicious ? `External rationale ${hostile}` : 'Review this exact supplied attention item first as an external suggestion only.',
        supportingEvidenceRefs: [firstRef],
        ...(firstContextRef === undefined ? {} : { contradictingEvidenceRefs: [firstContextRef] }),
        uncertainty: 'External reviewer has incomplete business and causal context.',
        needsHumanValidation: true,
      },
      {
        attentionId: second.attentionId,
        rationale: 'Review this second supplied attention item; ordering is advisory and noncanonical.',
        supportingEvidenceRefs: [secondRef],
        uncertainty: 'Evidence is structurally grounded; interpretation remains uncertain.',
        needsHumanValidation: true,
      },
    ],
    hypotheses: [{
      text: malicious ? `Synthetic hypothesis ${hostile}` : 'A synthetic change may warrant further investigation; this is not a causal finding.',
      supportingEvidenceRefs: [firstRef],
      contradictingEvidenceRefs: [secondRef],
      evidenceNeededToConfirmOrDisconfirm: 'Human should inspect source context and obtain independent evidence that could disconfirm the hypothesis.',
      uncertainty: 'High uncertainty because supplied evidence does not establish causality or business impact.',
      needsHumanValidation: true,
    }],
    questionsForHuman: [malicious ? `Human question ${hostile}` : 'Does domain context support investigating this item before any recommendation is authored?'],
    draftRecommendationOptions: [{
      text: malicious ? `Draft option ${hostile}` : 'Consider a human-authored investigation plan only after independently validating the cited evidence.',
      supportingEvidenceRefs: [firstRef],
      caveats: ['External draft option only; not a canonical recommendation and not approved for execution.'],
      needsHumanValidation: true,
    }],
    limitations: [malicious ? `External limitation ${hostile}` : 'Synthetic reviewer lacks customer context and cannot establish priority, causality, or impact.'],
  } as const;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

test('authoritative Release 0.15 brief is recomputed and caller-created/mutated brief cannot substitute', async (t) => {
  const fixture = await assistFixture(t);
  const originalBriefId = fixture.brief.id;
  (fixture.brief as unknown as { id: string }).id = 'forged-service-brief';
  const packet = await createOperatorAssistPacket(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
  );
  assert.equal(packet.sourceServiceBriefId, originalBriefId);
  assert.notEqual(packet.sourceServiceBriefId, fixture.brief.id);

  await assert.rejects(
    createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      ...fixture.input,
      serviceBrief: fixture.brief,
    }),
    (error: unknown) => error instanceof OperatorAssistError && error.code === 'invalid_request',
  );
});

test('empty assist source still requires a genuinely issued TenantContext before packet construction', async (t) => {
  const fixture = await assistFixture(t);
  const emptyRequest = {
    serviceBriefRequest: {
      scope: serviceBriefScope,
      trustedTarget: 'https://example.test',
      generatedAt: '2026-10-07T20:00:00.000Z',
      policy: {
        id: 'empty-service-brief-policy',
        version: '1.0.0',
        maxAttentionItems: 1,
        maxPageIndexEntries: 1,
        maxReferencesPerPage: 1,
        maxDetailedRecommendationHistories: 0,
        maxSearchChanges: 0,
        maxPageFocusReports: 0,
      },
    },
    policy: assistPolicy(),
  };
  await assert.rejects(
    createOperatorAssistPacket(
      fixture.prepared.evidence,
      fixture.prepared.review,
      { tenantId: 'tenant-alpha' } as unknown as TenantContext,
      emptyRequest,
    ),
    /trusted TenantContext/i,
  );
});
test('trusted TenantContext plus exact source scope/target remain authoritative', async (t) => {
  const fixture = await assistFixture(t);
  await assert.rejects(
    createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, beta, fixture.input),
    /trusted TenantContext|scope|tenant/i,
  );
  await assert.rejects(
    createOperatorAssistPacket(
      fixture.prepared.evidence,
      fixture.prepared.review,
      { tenantId: 'tenant-alpha' } as unknown as TenantContext,
      fixture.input,
    ),
    /trusted TenantContext/i,
  );
  const wrongTarget = clone(fixture.input);
  (wrongTarget.serviceBriefRequest as Record<string, unknown>).trustedTarget = 'https://other.example.test';
  await assert.rejects(
    createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, wrongTarget),
    /target/i,
  );
});

test('attention inclusion filters are strict, unique, bounded and never manufacture accepted attention', async (t) => {
  const fixture = await assistFixture(t);
  const ids = fixture.packet.attentionItems.slice(0, 2).map((entry) => entry.attentionId);
  assert.equal(ids.length, 2);
  const filtered = await createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, {
    serviceBriefRequest: fixture.request,
    policy: assistPolicy(),
    filter: { attentionIds: [...ids].reverse() },
  });
  const sameFilterDifferentOrder = await createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, {
    serviceBriefRequest: fixture.request,
    policy: assistPolicy(),
    filter: { attentionIds: [...ids] },
  });
  assert.deepEqual(filtered.attentionItems.map((entry) => entry.attentionId), ids);
  assert.equal(filtered.id, sameFilterDifferentOrder.id);
  assert.equal(serializeOperatorAssistPacketJson(filtered), serializeOperatorAssistPacketJson(sameFilterDifferentOrder));
  await assert.rejects(
    createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      serviceBriefRequest: fixture.request,
      policy: assistPolicy(),
      filter: { attentionIds: ['service-brief.attention:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'] },
    }),
    (error: unknown) => error instanceof OperatorAssistError && error.code === 'invalid_selection',
  );
  await assert.rejects(
    createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      serviceBriefRequest: fixture.request,
      policy: assistPolicy(),
      filter: { attentionIds: [ids[0]!, ids[0]!] },
    }),
    (error: unknown) => error instanceof OperatorAssistError && error.code === 'invalid_request',
  );
  await assert.rejects(
    createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      serviceBriefRequest: fixture.request,
      policy: assistPolicy({ maxAttentionItems: 1 }),
    }),
    (error: unknown) => error instanceof OperatorAssistError && error.code === 'bound_exceeded',
  );
});

test('included attention semantics exactly preserve accepted 0.15 identities without priority or impact', async (t) => {
  const fixture = await assistFixture(t);
  const source = new Map(fixture.brief.attentionRegister.map((entry) => [entry.id, entry] as const));
  for (const item of fixture.packet.attentionItems) {
    const accepted = source.get(item.attentionId);
    assert.ok(accepted);
    assert.equal(item.moduleId, accepted.moduleId);
    assert.equal(item.originalKind, accepted.originalKind);
    assert.equal(item.originalState, accepted.originalState);
    assert.equal(item.evidenceIdentity, accepted.evidenceIdentity);
    assert.deepEqual(item.identity, accepted.identity);
    assert.deepEqual(item.readinessContext, accepted.readinessContext);
    assert.equal(Object.hasOwn(item, 'priority'), false);
    assert.equal(Object.hasOwn(item, 'severity'), false);
    assert.equal(Object.hasOwn(item, 'businessImpact'), false);
  }
});

test('packet-local evidence references are deterministic, semantic and cannot point outside the exact packet', async (t) => {
  const fixture = await assistFixture(t);
  const ids = fixture.packet.evidenceReferences.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  const second = await createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, {
    policy: assistPolicy(),
    serviceBriefRequest: {
      pageFocus: fixture.request.pageFocus,
      searchChanges: fixture.request.searchChanges,
      searchAnalytics: fixture.request.searchAnalytics,
      serviceHistory: fixture.request.serviceHistory,
      evidenceDiff: fixture.request.evidenceDiff,
      policy: fixture.request.policy,
      generatedAt: fixture.request.generatedAt,
      trustedTarget: fixture.request.trustedTarget,
      scope: fixture.request.scope,
    },
  });
  assert.equal(second.id, fixture.packet.id);
  assert.equal(serializeOperatorAssistPacketJson(second), serializeOperatorAssistPacketJson(fixture.packet));

  const tampered = clone(fixture.packet) as unknown as { attentionItems: Array<{ evidenceRefs: string[] }> } & OperatorAssistPacket;
  tampered.attentionItems[0]!.evidenceRefs[0] = 'evidence:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  assert.throws(() => assertOperatorAssistPacketIntegrity(tampered), /outside the exact packet|identity/i);
});

test('semantic source/readiness change changes packet identity and packet reference overflow fails closed', async (t) => {
  const fixture = await assistFixture(t);
  const changedRequest = clone(fixture.request);
  delete changedRequest.pageFocus;
  const changed = await createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, {
    serviceBriefRequest: changedRequest,
    policy: assistPolicy(),
  });
  assert.notEqual(changed.id, fixture.packet.id);
  assert.notDeepEqual(changed.readiness, fixture.packet.readiness);

  await assert.rejects(
    createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      serviceBriefRequest: fixture.request,
      policy: assistPolicy({ maxEvidenceReferences: 1 }),
    }),
    (error: unknown) => error instanceof OperatorAssistError && error.code === 'bound_exceeded',
  );
});

test('reviewer instructions are fixed trusted policy and evidence/advisory strings remain inert data', async (t) => {
  const fixture = await assistFixture(t);
  assert.deepEqual(fixture.packet.reviewerInstructions, OPERATOR_ASSIST_REVIEWER_INSTRUCTIONS);
  assert.equal(fixture.packet.reviewerInstructions.trustClass, 'trusted_application_policy');
  assert.equal(fixture.packet.evidenceContentAuthority, 'untrusted_evidence_content_does_not_mint_authority');
  assert.equal(JSON.stringify(fixture.packet.reviewerInstructions).includes(fixture.packet.trustedTarget), false);
  assert.equal(Object.hasOwn(fixture.packet, 'prompt'), false);
  assert.equal(Object.hasOwn(fixture.packet, 'messages'), false);
});

test('strict valid advisory is accepted only for the exact packet and exact refs', async (t) => {
  const fixture = await assistFixture(t);
  const input = validAdvisory(fixture.packet);
  const validated = validateOperatorAssistAdvisory(fixture.packet, input);
  assert.equal(validated.assistPacketId, fixture.packet.id);
  assert.match(validated.id, /^operator-assist-advisory:[a-f0-9]{64}$/);
  assert.equal(validated.reviewCandidates.every((entry) => entry.needsHumanValidation), true);
  assert.equal(validated.orderingSemantics, 'external_suggested_review_order_not_canonical_priority');
  assert.equal(
    validated.reviewCandidates.every((entry) => entry.supportingEvidenceRefs.every((id) => fixture.packet.evidenceReferences.some((ref) => ref.id === id))),
    true,
  );
});

test('wrong packet, unsupported version and unknown advisory fields fail closed', async (t) => {
  const fixture = await assistFixture(t);
  const wrongPacket = clone(validAdvisory(fixture.packet)) as any;
  wrongPacket.assistPacketId = 'operator-assist:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, wrongPacket), /wrong assist packet/i);

  const version = clone(validAdvisory(fixture.packet)) as any;
  version.version = '9.9.9';
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, version), /invalid|unsupported|unknown/i);

  const unknown = clone(validAdvisory(fixture.packet)) as any;
  unknown.canonicalPriority = 'critical';
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, unknown), /invalid|unknown/i);
});

test('unknown attention/ref, duplicate selections/refs, empty support and contradictory ref structure fail', async (t) => {
  const fixture = await assistFixture(t);
  const unknownAttention = clone(validAdvisory(fixture.packet)) as any;
  unknownAttention.reviewCandidates[0].attentionId = 'service-brief.attention:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, unknownAttention), /attention ID outside/i);

  const unknownRef = clone(validAdvisory(fixture.packet)) as any;
  unknownRef.reviewCandidates[0].supportingEvidenceRefs = ['evidence:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'];
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, unknownRef), /outside the exact assist packet/i);

  const duplicateCandidate = clone(validAdvisory(fixture.packet)) as any;
  duplicateCandidate.reviewCandidates[1].attentionId = duplicateCandidate.reviewCandidates[0].attentionId;
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, duplicateCandidate), /unique/i);

  const duplicateRef = clone(validAdvisory(fixture.packet)) as any;
  const ref = duplicateRef.reviewCandidates[0].supportingEvidenceRefs[0];
  duplicateRef.reviewCandidates[0].supportingEvidenceRefs = [ref, ref];
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, duplicateRef), /unique/i);

  const emptySupport = clone(validAdvisory(fixture.packet)) as any;
  emptySupport.reviewCandidates[0].supportingEvidenceRefs = [];
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, emptySupport), /invalid|over-bound|unknown/i);

  const contradictory = clone(validAdvisory(fixture.packet)) as any;
  contradictory.reviewCandidates[0].contradictingEvidenceRefs = [...contradictory.reviewCandidates[0].supportingEvidenceRefs];
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, contradictory), /both supporting and contradicting/i);
});

test('advisory array and UTF-8 prose byte bounds fail closed without truncation or repair', async (t) => {
  const fixture = await assistFixture(t);
  const tooMany = clone(validAdvisory(fixture.packet)) as any;
  tooMany.questionsForHuman = Array.from({ length: OPERATOR_ASSIST_HARD_LIMITS.questionsForHuman + 1 }, (_, i) => `question ${i}`);
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, tooMany), /invalid|over-bound|unknown/i);

  const utf8Overflow = clone(validAdvisory(fixture.packet)) as any;
  utf8Overflow.summary = '😀'.repeat(2_100);
  assert.ok(utf8Overflow.summary.length < OPERATOR_ASSIST_HARD_LIMITS.proseBytes);
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, utf8Overflow), /UTF-8 prose byte bound/i);
});

test('aggregate advisory JSON and escaped HTML byte ceilings fail closed without truncation', async (t) => {
  const fixture = await assistFixture(t);
  const ref = primaryRef(fixture.packet, 0);

  const jsonOverflow = clone(validAdvisory(fixture.packet)) as any;
  jsonOverflow.hypotheses = Array.from({ length: OPERATOR_ASSIST_HARD_LIMITS.hypotheses }, () => ({
    text: 'x'.repeat(OPERATOR_ASSIST_HARD_LIMITS.proseBytes),
    supportingEvidenceRefs: [ref],
    evidenceNeededToConfirmOrDisconfirm: 'y'.repeat(OPERATOR_ASSIST_HARD_LIMITS.proseBytes),
    uncertainty: 'z'.repeat(OPERATOR_ASSIST_HARD_LIMITS.proseBytes),
    needsHumanValidation: true,
  }));
  assert.throws(() => validateOperatorAssistAdvisory(fixture.packet, jsonOverflow), /JSON byte bound/i);

  const htmlOverflow = clone(validAdvisory(fixture.packet)) as any;
  htmlOverflow.hypotheses = Array.from({ length: 20 }, () => ({
    text: '&'.repeat(OPERATOR_ASSIST_HARD_LIMITS.proseBytes),
    supportingEvidenceRefs: [ref],
    evidenceNeededToConfirmOrDisconfirm: '&'.repeat(OPERATOR_ASSIST_HARD_LIMITS.proseBytes),
    uncertainty: '&'.repeat(OPERATOR_ASSIST_HARD_LIMITS.proseBytes),
    needsHumanValidation: true,
  }));
  const validated = validateOperatorAssistAdvisory(fixture.packet, htmlOverflow);
  assert.ok(Buffer.byteLength(serializeValidatedOperatorAssistAdvisoryJson(fixture.packet, validated), 'utf8') < OPERATOR_ASSIST_HARD_LIMITS.advisoryJsonBytes);
  assert.throws(() => renderOperatorAssistAdvisoryHtml(fixture.packet, validated), /HTML exceeds the output byte bound/i);
});

test('validated advisory exposes no canonical priority/severity/impact and cannot write through 0.16/0.8', async (t) => {
  const fixture = await assistFixture(t);
  const validated = validateOperatorAssistAdvisory(fixture.packet, validAdvisory(fixture.packet));
  const serialized = serializeValidatedOperatorAssistAdvisoryJson(fixture.packet, validated);
  assert.equal(Object.hasOwn(validated, 'priority'), false);
  assert.equal(Object.hasOwn(validated, 'severity'), false);
  assert.equal(Object.hasOwn(validated, 'businessImpact'), false);
  assert.equal(Object.hasOwn(validated, 'decision'), false);
  assert.equal(Object.hasOwn(validated, 'recommendation'), false);
  assert.equal(Object.hasOwn(validated, 'outcome'), false);
  assert.ok(Buffer.byteLength(serialized, 'utf8') <= OPERATOR_ASSIST_HARD_LIMITS.advisoryJsonBytes);

  const source = readFileSync('src/operator/operator-assist.ts', 'utf8');
  for (const forbidden of [
    '../review/service.js', 'prepareDecisionCycle', 'createHumanRecommendation(', 'recordHumanOutcome(', 'recordMeasurement(',
  ]) assert.equal(source.includes(forbidden), false, forbidden);

  const current = fixture.brief.serviceHistory?.currentRecommendations[0];
  assert.equal(current?.authorityClass, 'internal_review');
  assert.equal(current?.priority.level, 'unassessed');
});

test('HTML renders adversarial external prose as escaped inert text with restrictive CSP and no action surface', async (t) => {
  const fixture = await assistFixture(t);
  const validated = validateOperatorAssistAdvisory(fixture.packet, validAdvisory(fixture.packet, true));
  const html = renderOperatorAssistAdvisoryHtml(fixture.packet, validated);
  assert.ok(Buffer.byteLength(html, 'utf8') <= MAX_OPERATOR_ASSIST_HTML_BYTES);
  assert.match(html, /EXTERNAL \/ AI ADVISORY — UNTRUSTED — HUMAN REVIEW REQUIRED/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.equal(html.includes('<script>'), false);
  assert.equal(html.includes('<svg '), false);
  assert.equal(html.includes('<form'), false);
  assert.equal(html.includes('href='), false);
  assert.equal(html.includes('src='), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&quot;x&amp;y&quot;/);
  assert.match(html, /provider&lt;&amp;&quot;&#39;&gt;/);
  assert.match(html, /caller supplied, not authenticated identity/);
  assert.match(html, /accepted Release 0\.16 HUMAN decision path/);
});

test('reviewer provenance is descriptive only and validated advisory identity is deterministic', async (t) => {
  const fixture = await assistFixture(t);
  const input = validAdvisory(fixture.packet);
  const first = validateOperatorAssistAdvisory(fixture.packet, input);
  const second = validateOperatorAssistAdvisory(fixture.packet, clone(input));
  assert.equal(first.id, second.id);
  assert.equal(serializeValidatedOperatorAssistAdvisoryJson(fixture.packet, first), serializeValidatedOperatorAssistAdvisoryJson(fixture.packet, second));
  assert.equal(first.provenance?.providerLabel, 'synthetic-review-provider');
  assert.equal(Object.hasOwn(first.provenance ?? {}, 'authenticated'), false);
  assert.equal(Object.hasOwn(first.provenance ?? {}, 'authority'), false);
});

test('Alpha/Beta evidence substitution fails before packet construction', async (t) => {
  const fixture = await assistFixture(t);
  await assert.rejects(
    createOperatorAssistPacket(fixture.prepared.evidence, fixture.prepared.review, beta, {
      serviceBriefRequest: fixture.request,
      policy: assistPolicy(),
    }),
  );
  assert.deepEqual(fixture.packet.scope, serviceBriefScope);
});

test('Release 0.21 adds no persistence/schema/runtime dependency or network/model/credential execution path', () => {
  const source = readFileSync('src/operator/operator-assist.ts', 'utf8');
  const renderer = readFileSync('src/operator/operator-assist-html.ts', 'utf8');
  const preview = readFileSync('scripts/operator-assist-preview.ts', 'utf8');
  const production = source + '\n' + renderer + '\n' + preview;
  for (const forbidden of [
    'node:http', 'node:https', 'fetch(', 'WebSocket', 'EventSource', 'openai', 'anthropic', 'gemini',
    'apiKey', 'api_key', 'credentialStore', 'node:sqlite', 'migration', 'CREATE TABLE', 'ALTER TABLE',
    'internal-link', 'buyer-intent', 'answer-stability', 'Release 1.0 implementation',
  ]) assert.equal(production.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);

  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies: Record<string, string>; version: string };
  assert.equal(pkg.version, '0.21.0');
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), ['zod']);
  const schemas = readdirSync('schemas', { recursive: true }).filter((entry) => String(entry).endsWith('.json'));
  assert.equal(schemas.length, 11);
});

test('synthetic interoperability path is deterministic from packet through validated JSON and HTML', async (t) => {
  const fixture = await assistFixture(t);
  const advisory = validateOperatorAssistAdvisory(fixture.packet, validAdvisory(fixture.packet, true));
  const packetJsonA = serializeOperatorAssistPacketJson(fixture.packet);
  const packetJsonB = serializeOperatorAssistPacketJson(fixture.packet);
  const advisoryJsonA = serializeValidatedOperatorAssistAdvisoryJson(fixture.packet, advisory);
  const advisoryJsonB = serializeValidatedOperatorAssistAdvisoryJson(fixture.packet, advisory);
  const htmlA = renderOperatorAssistAdvisoryHtml(fixture.packet, advisory);
  const htmlB = renderOperatorAssistAdvisoryHtml(fixture.packet, advisory);
  assert.equal(packetJsonA, packetJsonB);
  assert.equal(advisoryJsonA, advisoryJsonB);
  assert.equal(htmlA, htmlB);
  assert.match(fixture.packet.id, /^operator-assist:[a-f0-9]{64}$/);
  assert.match(advisory.id, /^operator-assist-advisory:[a-f0-9]{64}$/);
});
