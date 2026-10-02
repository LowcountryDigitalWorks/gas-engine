import type { TestContext } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import { alpha } from '../persistence/helpers.js';
import {
  assembleServiceBrief,
} from '../../src/operator/service-brief.js';
import {
  type DecisionCycleDossier,
  prepareDecisionCycle,
} from '../../src/operator/decision-cycle.js';
import {
  prepareServiceBriefRepositories,
  serviceBriefPolicy,
} from './service-brief-repo-support.js';
import {
  serviceBriefScope,
  serviceBriefSearchModules,
} from './service-brief-fixtures.js';

export function cycleRecommendation(
  observation: Contract<'observation'>,
  id = 'synthetic-decision-cycle-recommendation',
): Contract<'recommendation'> {
  const owner = observation.cohort.context.scope;
  return {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id,
    scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: observation.id }],
    rationale: 'Synthetic human-authored Release 0.16 recommendation rationale.',
    priority: { level: 'unassessed', basis: 'Synthetic Release 0.16 test intentionally assigns no priority.' },
    authorityClass: 'internal_review',
    lifecycle: 'proposed',
    revision: 1,
    createdAt: '2026-10-01T19:30:00.000Z',
    updatedAt: '2026-10-01T19:30:00.000Z',
  };
}

export async function decisionCycleFixture(t: TestContext): Promise<{
  dossier: DecisionCycleDossier;
  prepared: Awaited<ReturnType<typeof prepareServiceBriefRepositories>>;
  input: Record<string, unknown>;
  serviceBriefRequest: Record<string, unknown>;
  recommendation: Contract<'recommendation'>;
  selectedAttentionId: string;
}> {
  const prepared = await prepareServiceBriefRepositories(t);
  const modules = serviceBriefSearchModules();
  const searchCollection = modules.baseline.batches[0]!.collection;
  await prepared.evidence.createConnection(alpha, {
    id: searchCollection.providerConnectionId!,
    scope: structuredClone(searchCollection.scope),
    providerId: searchCollection.providerId,
  });
  for (const part of [...modules.baseline.batches, ...modules.current.batches]) {
    await prepared.evidence.persistCollection(alpha, part);
  }
  const serviceBriefRequest: Record<string, unknown> = {
    scope: serviceBriefScope,
    trustedTarget: 'https://example.test',
    generatedAt: '2026-10-01T17:00:00.000Z',
    policy: serviceBriefPolicy(),
    searchAnalytics: modules.searchAnalytics,
  };
  const brief = await assembleServiceBrief(prepared.evidence, prepared.review, alpha, serviceBriefRequest);
  const selected = brief.attentionRegister.find((item) =>
    item.moduleId === 'search_analytics' && (item.identity.url !== undefined || item.identity.query !== undefined),
  ) ?? brief.attentionRegister[0];
  if (selected === undefined) throw new Error('Synthetic Release 0.16 fixture requires at least one Release 0.15 attention item.');

  const recommendation = cycleRecommendation(prepared.pair.baseline.observations[0]!.record);
  const sourcePlan = modules.searchChanges[0]!;
  const basePlan = {
    ...structuredClone(sourcePlan),
    annotation: {
      ...structuredClone(sourcePlan.annotation),
      id: 'synthetic-decision-cycle-change',
      recommendationId: recommendation.id,
    },
  };
  const reference = selected.identity.url !== undefined
    ? [{ kind: 'url' as const, value: selected.identity.url }]
    : selected.identity.query !== undefined
      ? [{ kind: 'query' as const, value: selected.identity.query }]
      : [];

  const input: Record<string, unknown> = {
    serviceBriefRequest,
    selectedAttentionIds: [selected.id],
    decision: {
      id: 'synthetic-decision-cycle-decision',
      disposition: 'recommend',
      summary: 'Human selected exact accepted evidence and chose to prepare a recommendation for review.',
      recordedAt: '2026-10-01T19:35:00.000Z',
      references: reference,
    },
    recommendation,
    searchChangePlan: basePlan,
    policy: {
      id: 'decision-cycle-policy',
      version: '1.0.0',
      maxSelectedAttentionItems: 8,
    },
    generatedAt: '2026-10-01T20:00:00.000Z',
    evaluatedAt: '2026-09-16T09:00:00.000Z',
  };
  const dossier = await prepareDecisionCycle(prepared.evidence, prepared.review, alpha, input);
  return {
    dossier,
    prepared,
    input,
    serviceBriefRequest,
    recommendation,
    selectedAttentionId: selected.id,
  };
}
