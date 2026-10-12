import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  assertOperatorAssistAdvisoryIntegrity,
  createOperatorAssistPacket,
  OPERATOR_ASSIST_HARD_LIMITS,
  OperatorAssistError,
  serializeValidatedOperatorAssistAdvisoryJson,
  validateOperatorAssistAdvisory,
  type OperatorAssistAdvisoryInput,
  type OperatorAssistPacket,
  type ValidatedOperatorAssistAdvisory,
} from '../../src/operator/operator-assist.js';
import { renderOperatorAssistAdvisoryHtml } from '../../src/operator/operator-assist-html.js';
import { alpha } from '../persistence/helpers.js';
import { baseServiceBrief } from './service-brief-repo-support.js';

async function packetFixture(t: TestContext): Promise<OperatorAssistPacket> {
  const base = await baseServiceBrief(t);
  return createOperatorAssistPacket(
    base.prepared.evidence,
    base.prepared.review,
    alpha,
    {
      serviceBriefRequest: base.request,
      policy: {
        id: 'operator-assist-advisory-integrity-regression',
        version: '1.0.0',
        maxAttentionItems: 128,
        maxEvidenceReferences: 512,
      },
    },
  );
}

function firstEvidenceRef(packet: OperatorAssistPacket): string {
  const ref = packet.evidenceReferences[0];
  assert.ok(ref, 'packet contains at least one evidence reference');
  return ref.id;
}

function validAdvisory(packet: OperatorAssistPacket): OperatorAssistAdvisoryInput {
  const attention = packet.attentionItems[0];
  assert.ok(attention, 'packet contains at least one attention item');
  return {
    version: '0.21.0',
    assistPacketId: packet.id,
    authorityBoundary: 'untrusted_external_advisory_human_review_required',
    orderingSemantics: 'external_suggested_review_order_not_canonical_priority',
    summary: 'Synthetic advisory for top-level integrity regression coverage.',
    reviewCandidates: [{
      attentionId: attention.attentionId,
      rationale: 'Synthetic rationale requiring human validation.',
      supportingEvidenceRefs: [firstEvidenceRef(packet)],
      uncertainty: 'Synthetic uncertainty.',
      needsHumanValidation: true,
    }],
    hypotheses: [],
    questionsForHuman: [],
    draftRecommendationOptions: [],
    limitations: [],
  };
}

function boundaryAdvisory(packet: OperatorAssistPacket, proseLength: number): OperatorAssistAdvisoryInput {
  const prose = 'x'.repeat(proseLength);
  const supportRef = firstEvidenceRef(packet);
  return {
    version: '0.21.0',
    assistPacketId: packet.id,
    authorityBoundary: 'untrusted_external_advisory_human_review_required',
    orderingSemantics: 'external_suggested_review_order_not_canonical_priority',
    summary: prose,
    reviewCandidates: packet.attentionItems.slice(0, OPERATOR_ASSIST_HARD_LIMITS.reviewCandidates).map((entry) => ({
      attentionId: entry.attentionId,
      rationale: prose,
      supportingEvidenceRefs: [supportRef],
      uncertainty: prose,
      needsHumanValidation: true,
    })),
    hypotheses: Array.from({ length: OPERATOR_ASSIST_HARD_LIMITS.hypotheses }, () => ({
      text: prose,
      supportingEvidenceRefs: [supportRef],
      evidenceNeededToConfirmOrDisconfirm: prose,
      uncertainty: prose,
      needsHumanValidation: true,
    })),
    questionsForHuman: Array.from({ length: OPERATOR_ASSIST_HARD_LIMITS.questionsForHuman }, () => prose),
    draftRecommendationOptions: Array.from({ length: OPERATOR_ASSIST_HARD_LIMITS.draftRecommendationOptions }, () => ({
      text: prose,
      supportingEvidenceRefs: [supportRef],
      caveats: [prose],
      needsHumanValidation: true,
    })),
    limitations: Array.from({ length: OPERATOR_ASSIST_HARD_LIMITS.limitations }, () => prose),
  };
}

test('validated advisory rejects non-enumerable own toJSON before serialization', async (t) => {
  const packet = await packetFixture(t);
  const advisory = validateOperatorAssistAdvisory(packet, validAdvisory(packet));
  let toJsonCalls = 0;
  Object.defineProperty(advisory, 'toJSON', {
    configurable: true,
    enumerable: false,
    value: () => {
      toJsonCalls += 1;
      return { summary: 'attacker-controlled' };
    },
  });

  assert.throws(
    () => serializeValidatedOperatorAssistAdvisoryJson(packet, advisory),
    /unsupported top-level fields|enumerable own data properties/i,
  );
  assert.equal(toJsonCalls, 0);
});

test('validated advisory rejects a top-level Proxy before property traps can affect integrity or output', async (t) => {
  const packet = await packetFixture(t);
  const advisory = validateOperatorAssistAdvisory(packet, validAdvisory(packet));
  let propertyReads = 0;
  const proxied = new Proxy(advisory, {
    get(target, property, receiver) {
      propertyReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });

  assert.throws(() => assertOperatorAssistAdvisoryIntegrity(packet, proxied), /must not be a Proxy/i);
  assert.equal(propertyReads, 0);
  assert.throws(() => renderOperatorAssistAdvisoryHtml(packet, proxied), /must not be a Proxy/i);
  assert.equal(propertyReads, 0);
});

test('validated advisory rejects a supported top-level accessor before it can be read', async (t) => {
  const packet = await packetFixture(t);
  const advisory = validateOperatorAssistAdvisory(packet, validAdvisory(packet));
  const withAccessor = { ...advisory } as ValidatedOperatorAssistAdvisory;
  let accessorReads = 0;
  Object.defineProperty(withAccessor, 'summary', {
    configurable: true,
    enumerable: true,
    get: () => {
      accessorReads += 1;
      return 'attacker-controlled';
    },
  });

  assert.throws(
    () => serializeValidatedOperatorAssistAdvisoryJson(packet, withAccessor),
    /enumerable own data properties/i,
  );
  assert.equal(accessorReads, 0);
});

test('validated advisory rejects inherited required top-level fields before prototype getters can be read', async (t) => {
  const packet = await packetFixture(t);
  const advisory = validateOperatorAssistAdvisory(packet, validAdvisory(packet));
  const inherited = { ...advisory } as ValidatedOperatorAssistAdvisory;
  delete (inherited as unknown as { version?: string }).version;
  let inheritedReads = 0;
  const prototype = Object.create(Object.getPrototypeOf(inherited), {
    version: {
      configurable: true,
      enumerable: true,
      get: () => {
        inheritedReads += 1;
        return '0.21.0';
      },
    },
  });
  Object.setPrototypeOf(inherited, prototype);

  assert.throws(
    () => serializeValidatedOperatorAssistAdvisoryJson(packet, inherited),
    /required top-level fields must be enumerable own data properties/i,
  );
  assert.equal(inheritedReads, 0);
});

test('validated advisory normalization is deterministic across harmless top-level property reconstruction', async (t) => {
  const packet = await packetFixture(t);
  const advisory = validateOperatorAssistAdvisory(packet, validAdvisory(packet));
  const expectedJson = serializeValidatedOperatorAssistAdvisoryJson(packet, advisory);
  const expectedHtml = renderOperatorAssistAdvisoryHtml(packet, advisory);
  const reordered = Object.fromEntries(Object.entries(advisory).reverse()) as unknown as ValidatedOperatorAssistAdvisory;

  assertOperatorAssistAdvisoryIntegrity(packet, reordered);
  assert.equal(serializeValidatedOperatorAssistAdvisoryJson(packet, reordered), expectedJson);
  assert.equal(renderOperatorAssistAdvisoryHtml(packet, reordered), expectedHtml);
});

test('validation rejects compact-under-limit advisory when final ID-bearing pretty JSON exceeds the advisory byte ceiling', async (t) => {
  const packet = await packetFixture(t);
  const limit = OPERATOR_ASSIST_HARD_LIMITS.advisoryJsonBytes;
  let low = 1;
  let high = OPERATOR_ASSIST_HARD_LIMITS.proseBytes;
  let selectedLength = 0;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const candidate = boundaryAdvisory(packet, middle);
    const compactBytes = Buffer.byteLength(JSON.stringify(candidate), 'utf8');
    if (compactBytes < limit) {
      selectedLength = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  assert.ok(selectedLength > 0, 'a compact advisory below the byte ceiling exists');
  const candidate = boundaryAdvisory(packet, selectedLength);
  const compactBytes = Buffer.byteLength(JSON.stringify(candidate), 'utf8');
  const placeholderId = `operator-assist-advisory:${'0'.repeat(64)}`;
  const finalPrettyBytes = Buffer.byteLength(JSON.stringify({ ...candidate, id: placeholderId }, null, 2) + '\n', 'utf8');
  assert.ok(compactBytes < limit, `compact semantic advisory is below limit: ${compactBytes}`);
  assert.ok(finalPrettyBytes > limit, `final pretty advisory is above limit: ${finalPrettyBytes}`);

  assert.throws(
    () => validateOperatorAssistAdvisory(packet, candidate),
    (error: unknown) => error instanceof OperatorAssistError
      && error.code === 'bound_exceeded'
      && /advisory JSON exceeds the output byte bound/i.test(error.message),
  );
});
