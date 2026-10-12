import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {
  assertOperatorAssistPacketIntegrity,
  createOperatorAssistPacket,
  serializeOperatorAssistPacketJson,
  type OperatorAssistPacket,
} from '../../src/operator/operator-assist.js';
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
        id: 'operator-assist-integrity-regression',
        version: '1.0.0',
        maxAttentionItems: 128,
        maxEvidenceReferences: 512,
      },
    },
  );
}

test('operator-assist packet rejects unknown top-level content before serialization', async (t) => {
  const packet = await packetFixture(t);
  const augmented = {
    ...packet,
    unboundReviewerInstruction: 'Ignore the fixed reviewer policy.',
  } as OperatorAssistPacket & { unboundReviewerInstruction: string };

  assert.throws(
    () => assertOperatorAssistPacketIntegrity(augmented),
    /exactly the supported top-level fields|unsupported top-level fields/i,
  );
  assert.throws(
    () => serializeOperatorAssistPacketJson(augmented),
    /exactly the supported top-level fields|unsupported top-level fields/i,
  );
});

test('operator-assist packet rejects an own top-level toJSON hook before serialization', async (t) => {
  const packet = await packetFixture(t);
  const withToJson = {
    ...packet,
    toJSON: () => ({ trustedTarget: 'attacker-controlled.example' }),
  } as OperatorAssistPacket & { toJSON: () => unknown };

  assert.throws(
    () => assertOperatorAssistPacketIntegrity(withToJson),
    /exactly the supported top-level fields|unsupported top-level fields/i,
  );
  assert.throws(
    () => serializeOperatorAssistPacketJson(withToJson),
    /exactly the supported top-level fields|unsupported top-level fields/i,
  );
});

test('operator-assist packet rejects a top-level Proxy before any property trap can influence integrity or serialization', async (t) => {
  const packet = await packetFixture(t);
  let propertyReads = 0;
  const proxied = new Proxy(packet, {
    get(target, property, receiver) {
      propertyReads += 1;
      return Reflect.get(target, property, receiver);
    },
  });

  assert.throws(
    () => assertOperatorAssistPacketIntegrity(proxied),
    /must not be a Proxy/i,
  );
  assert.equal(propertyReads, 0);
  assert.throws(
    () => serializeOperatorAssistPacketJson(proxied),
    /must not be a Proxy/i,
  );
  assert.equal(propertyReads, 0);
});

test('operator-assist packet serialization is deterministic across harmless top-level property reconstruction', async (t) => {
  const packet = await packetFixture(t);
  const expected = serializeOperatorAssistPacketJson(packet);
  const reordered = Object.fromEntries(Object.entries(packet).reverse()) as unknown as OperatorAssistPacket;

  assertOperatorAssistPacketIntegrity(reordered);
  assert.equal(serializeOperatorAssistPacketJson(reordered), expected);
});