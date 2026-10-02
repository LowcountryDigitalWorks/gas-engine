import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import {
  commitDecisionMeasurement,
  commitDecisionOutcome,
  commitDecisionRecommendation,
  DECISION_CYCLE_HARD_LIMITS,
  DecisionCycleError,
  MAX_DECISION_DOSSIER_JSON_BYTES,
  prepareDecisionCycle,
  serializeDecisionCycleDossierJson,
  transitionDecisionRecommendation,
  type DecisionCycleDossier,
} from '../../src/operator/decision-cycle.js';
import {
  MAX_DECISION_DOSSIER_HTML_BYTES,
  renderDecisionCycleDossierHtml,
} from '../../src/operator/decision-cycle-html.js';
import {
  assembleServiceBrief,
  ServiceBriefError,
} from '../../src/operator/service-brief.js';
import { SEARCH_CHANGE_METHODOLOGY } from '../../src/analysis/search-change.js';
import { createHumanRecommendation } from '../../src/review/service.js';
import { alpha, batch, beta } from '../persistence/helpers.js';
import { serviceBriefScope } from './service-brief-fixtures.js';
import { decisionCycleFixture } from './decision-cycle-support.js';

test('Release 0.16 request is strict and exact attention selection is unique and bounded', async (t) => {
  const fixture = await decisionCycleFixture(t);

  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      ...fixture.input,
      hiddenPriority: 'high',
    }),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_request',
  );

  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      ...fixture.input,
      selectedAttentionIds: [fixture.selectedAttentionId, fixture.selectedAttentionId],
    }),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_selection',
  );

  const brief = await assembleServiceBrief(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.serviceBriefRequest,
  );
  assert.ok(brief.attentionRegister.length >= 2);
  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      ...fixture.input,
      selectedAttentionIds: brief.attentionRegister.slice(0, 2).map((item) => item.id),
      policy: {
        id: 'decision-cycle-policy',
        version: '1.0.0',
        maxSelectedAttentionItems: 1,
      },
    }),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'bound_exceeded',
  );
  assert.equal(DECISION_CYCLE_HARD_LIMITS.selectedAttentionItems, 32);
});

test('caller-mutated prebuilt ServiceBrief cannot replace internal Release 0.15 recomputation', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const recomputed = await assembleServiceBrief(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.serviceBriefRequest,
  );
  const forged = structuredClone(recomputed) as any;
  forged.id = 'forged-service-brief';
  forged.attentionRegister = [];

  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      ...fixture.input,
      serviceBrief: forged,
    }),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_request',
  );

  const fresh = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
  );
  assert.equal(fresh.sourceServiceBrief.id, recomputed.id);
  assert.notEqual(fresh.sourceServiceBrief.id, forged.id);
  assert.equal(fresh.selectedAttention.length, 1);
});

test('selected attention and decision references fail closed across missing IDs, tenant, scope and target', async (t) => {
  const fixture = await decisionCycleFixture(t);

  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, {
      ...fixture.input,
      selectedAttentionIds: ['missing-attention-id'],
    }),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_selection',
  );

  const badReference = structuredClone(fixture.input) as any;
  badReference.decision.references = [{ kind: 'url', value: 'https://example.test/not-selected' }];
  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, badReference),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_selection',
  );

  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, beta, fixture.input),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'scope_mismatch',
  );

  const wrongScope = structuredClone(fixture.input) as any;
  wrongScope.serviceBriefRequest.scope = structuredClone(batch('beta').collection.scope);
  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, wrongScope),
    (error: unknown) =>
      error instanceof ServiceBriefError && error.code === 'scope_mismatch',
  );

  const wrongTarget = structuredClone(fixture.input) as any;
  wrongTarget.serviceBriefRequest.trustedTarget = 'https://other.example.test';
  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, wrongTarget),
    (error: unknown) =>
      error instanceof ServiceBriefError && error.code === 'target_mismatch',
  );
});

test('human recommend decision is read-only until explicit recommendation commit', async (t) => {
  const fixture = await decisionCycleFixture(t);
  assert.equal(fixture.dossier.decision.disposition, 'recommend');
  assert.equal(fixture.dossier.recommendation?.candidate?.id, fixture.recommendation.id);
  assert.equal(fixture.dossier.recommendation?.current, undefined);
  assert.equal(fixture.dossier.readiness.state, 'measurements_not_recorded');

  const before = await fixture.prepared.review.getCurrentRecommendation(
    alpha,
    serviceBriefScope,
    fixture.recommendation.id,
  );
  assert.equal(before, null);

  const created = await commitDecisionRecommendation(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
  );
  assert.equal(created.id, fixture.recommendation.id);
  assert.equal(created.lifecycle, 'proposed');
  assert.equal(created.priority.level, 'unassessed');
  assert.equal(created.authorityClass, 'internal_review');
});

test('explicit recommendation commit uses accepted Release 0.8 canonical observation validation', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const forged = structuredClone(fixture.input) as any;
  forged.recommendation.evidence = [{
    scope: structuredClone(serviceBriefScope),
    kind: 'observation',
    id: fixture.selectedAttentionId,
  }];

  await assert.rejects(
    prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, forged),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_selection',
  );

  const committed = await commitDecisionRecommendation(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
  );
  assert.equal(committed.evidence[0]?.id, fixture.recommendation.evidence[0]?.id);
});

test('recommendation lifecycle delegates to accepted Release 0.8 expected-revision protection', async (t) => {
  const fixture = await decisionCycleFixture(t);
  await commitDecisionRecommendation(fixture.prepared.evidence, fixture.prepared.review, alpha, fixture.input);

  const inReview = await transitionDecisionRecommendation(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
    {
      scope: serviceBriefScope,
      id: fixture.recommendation.id,
      expectedCurrentRevision: 1,
      lifecycle: 'in_review',
      updatedAt: '2026-10-01T19:40:00.000Z',
    },
  );
  assert.equal(inReview.revision, 2);
  assert.equal(inReview.lifecycle, 'in_review');

  await assert.rejects(
    transitionDecisionRecommendation(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      fixture.input,
      {
        scope: serviceBriefScope,
        id: fixture.recommendation.id,
        expectedCurrentRevision: 1,
        lifecycle: 'accepted',
        updatedAt: '2026-10-01T19:41:00.000Z',
      },
    ),
  );
});

test('Release 0.11 remains the sole search-change measurement plan and commits one accepted measurement at a time', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const plan = fixture.dossier.measurementPlan;
  assert.ok(plan);
  assert.equal(plan.baseline.measurement.methodology.id, SEARCH_CHANGE_METHODOLOGY.id);
  assert.equal(plan.followUp.measurement.methodology.id, SEARCH_CHANGE_METHODOLOGY.id);
  assert.equal(plan.readiness.state, 'ready_for_human_assessment');

  await commitDecisionRecommendation(fixture.prepared.evidence, fixture.prepared.review, alpha, fixture.input);
  const baseline = await commitDecisionMeasurement(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
    'baseline',
  );
  assert.equal(baseline.relationship.role, 'baseline');

  const afterBaseline = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
  );
  assert.equal(afterBaseline.readiness.state, 'measurements_not_recorded');

  const followUp = await commitDecisionMeasurement(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
    'follow_up',
  );
  assert.equal(followUp.relationship.role, 'follow_up');

  const ready = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
  );
  assert.equal(ready.readiness.state, 'ready_for_human_assessment');
  assert.deepEqual(
    ready.recordedMeasurements.map((record) => record.id).sort(),
    [baseline.id, followUp.id].sort(),
  );

  const source = readFileSync('src/operator/decision-cycle.ts', 'utf8');
  assert.doesNotMatch(source, /(?:discovery|ai.visibility|page.focus).*measurement.*method/i);
  assert.doesNotMatch(source, /generic.*measurement.*method/i);
});

test('measurement commit cannot rewrite canonical observation values through a mutated plan input', async (t) => {
  const fixture = await decisionCycleFixture(t);
  await commitDecisionRecommendation(fixture.prepared.evidence, fixture.prepared.review, alpha, fixture.input);

  const forged = structuredClone(fixture.input) as any;
  const batches = forged.searchChangePlan.baseline.batches as any[];
  for (const part of batches) {
    for (const observation of part.observations as any[]) {
      if (observation.record.value?.state === 'observed' && observation.record.value.value?.type === 'number') {
        observation.record.value.value.value = 999;
      }
    }
  }

  await assert.rejects(
    commitDecisionMeasurement(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      forged,
      'baseline',
    ),
  );
});

test('human outcome direction remains human-declared and accepted Release 0.8 validation owns commit', async (t) => {
  const fixture = await decisionCycleFixture(t);
  await commitDecisionRecommendation(fixture.prepared.evidence, fixture.prepared.review, alpha, fixture.input);
  await commitDecisionMeasurement(fixture.prepared.evidence, fixture.prepared.review, alpha, fixture.input, 'baseline');
  await commitDecisionMeasurement(fixture.prepared.evidence, fixture.prepared.review, alpha, fixture.input, 'follow_up');

  const ready = await prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, fixture.input);
  const plan = ready.measurementPlan!;
  const outcome: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'synthetic-decision-cycle-outcome',
    scope: structuredClone(serviceBriefScope),
    recommendationId: fixture.recommendation.id,
    assessment: {
      direction: 'unchanged',
      measurements: [
        { scope: structuredClone(serviceBriefScope), id: plan.baseline.measurement.id },
        { scope: structuredClone(serviceBriefScope), id: plan.followUp.measurement.id },
      ],
      comparability: 'comparable',
      rationale: 'Human deliberately declares unchanged; Release 0.16 does not infer direction from numeric movement.',
    },
    attribution: {
      strength: 'technical_verification',
      basis: 'Synthetic technical verification only; no causal claim.',
    },
    createdAt: '2026-10-01T19:50:00.000Z',
  };
  const recorded = await commitDecisionOutcome(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
    outcome,
  );
  assert.equal(recorded.assessment.direction, 'unchanged');

  const final = await prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, fixture.input);
  assert.equal(final.readiness.state, 'outcome_recorded');
  assert.equal(final.humanOutcomes[0]?.assessment.direction, 'unchanged');

  const prohibited = structuredClone(outcome) as any;
  prohibited.id = 'synthetic-decision-cycle-prohibited-attribution';
  prohibited.attribution = {
    strength: 'association',
    basis: 'Synthetic association remains prohibited by accepted Release 0.8.',
  };
  await assert.rejects(
    commitDecisionOutcome(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      fixture.input,
      prohibited,
    ),
  );
});

test('Decision Dossier identity binds emitted semantics and ignores harmless caller key ordering', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const input = fixture.input as any;
  const reordered = {
    evaluatedAt: input.evaluatedAt,
    generatedAt: input.generatedAt,
    policy: input.policy,
    searchChangePlan: input.searchChangePlan,
    recommendation: input.recommendation,
    decision: input.decision,
    selectedAttentionIds: input.selectedAttentionIds,
    serviceBriefRequest: input.serviceBriefRequest,
  };
  const same = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    reordered,
  );
  assert.equal(same.id, fixture.dossier.id);
  assert.equal(serializeDecisionCycleDossierJson(same), serializeDecisionCycleDossierJson(fixture.dossier));

  const changed = structuredClone(fixture.input) as any;
  changed.decision.summary = 'Materially different human-authored decision summary.';
  const changedDossier = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    changed,
  );
  assert.notEqual(changedDossier.id, fixture.dossier.id);

  const identitySource = readFileSync('src/operator/decision-cycle.ts', 'utf8');
  assert.match(
    identitySource,
    /authorityNotes:\s*_authorityNotes,\s*limitations:\s*_limitations/,
    'generated authority/limitation prose must remain outside dossier semantic identity material',
  );
});

test('static Decision Dossier HTML is escaped, printable, CSP-restricted and bounded', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const attackedInput = structuredClone(fixture.input) as any;
  attackedInput.decision.summary = '"><img src=x onerror="alert(1)"><script>alert(\'&\')</script>';
  attackedInput.recommendation.rationale = 'Human rationale & <script>alert("recommend")</script>';
  const attacked = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    attackedInput,
  );
  const html = renderDecisionCycleDossierHtml(attacked);

  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  for (const heading of [
    '1. Decision context / trusted scope',
    '2. Source service brief',
    '3. Human-selected attention',
    '4. Human decision',
    '5. Recommendation status / history',
    '6. Search-change / measurement plan',
    '7. Follow-up readiness',
    '8. Recorded measurements',
    '9. Human outcome',
    '10. Provenance',
    '11. Authority / limitations',
  ]) assert.equal(html.includes(heading), true, heading);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /script-src 'none'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /@media print/);
  assert.match(html, /focus-visible/);
  assert.match(html, /<caption>/);
  assert.match(html, /<th scope="col">/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.doesNotMatch(html, /<img\b/i);
  assert.doesNotMatch(html, /<form\b/i);
  assert.doesNotMatch(html, /<button\b/i);
  assert.doesNotMatch(html, /<[^>]+\sonerror\s*=/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);

  const oversizedHtml = structuredClone(attacked) as any;
  oversizedHtml.authorityNotes = ['x'.repeat(MAX_DECISION_DOSSIER_HTML_BYTES + 100)];
  assert.throws(
    () => renderDecisionCycleDossierHtml(oversizedHtml as DecisionCycleDossier),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'bound_exceeded',
  );

  const oversizedJson = structuredClone(attacked) as any;
  oversizedJson.limitations = ['x'.repeat(MAX_DECISION_DOSSIER_JSON_BYTES + 100)];
  assert.throws(
    () => serializeDecisionCycleDossierJson(oversizedJson as DecisionCycleDossier),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'bound_exceeded',
  );
});

test('Release 0.16 production surface adds no network, server, runtime AI, persistence, Issue #49 or Release 1.0 path', () => {
  const source = [
    readFileSync('src/operator/decision-cycle.ts', 'utf8'),
    readFileSync('src/operator/decision-cycle-html.ts', 'utf8'),
  ].join('\n');
  assert.doesNotMatch(source, /from ['"](?:node:http|node:https|node:net|undici|axios|activepieces)/i);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /createServer|listen\s*\(|WebSocket|XMLHttpRequest/);
  assert.doesNotMatch(source, /from ['"].*(?:sqlite|migrations)/i);
  assert.doesNotMatch(source, /\b(?:OpenAI|Anthropic|embedding|BYOK)\b/i);
  assert.doesNotMatch(source, /CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO/i);
  assert.doesNotMatch(source, /internal[-_ ]link/i);
  assert.doesNotMatch(source, /Release\s+1\.0/i);
});


test('plan-only cycle rediscovers its exact outcome through tenant-safe scope-only reads', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const input = structuredClone(fixture.input) as any;
  delete input.recommendation;
  delete input.searchChangePlan.annotation.recommendationId;
  input.decision.disposition = 'investigate';
  input.decision.summary = 'Human investigates a plan-only Search Change cycle without a recommendation association.';

  await commitDecisionMeasurement(fixture.prepared.evidence, fixture.prepared.review, alpha, input, 'baseline');
  await commitDecisionMeasurement(fixture.prepared.evidence, fixture.prepared.review, alpha, input, 'follow_up');

  const ready = await prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, input);
  assert.equal(ready.recommendation, undefined);
  assert.equal(ready.readiness.state, 'ready_for_human_assessment');
  const plan = ready.measurementPlan!;

  const betaScope = {
    tenantId: 'tenant-beta',
    siteId: 'site-beta',
    siteScopeRevisionId: 'synthetic-scope-beta-r1',
  };
  await fixture.prepared.review.persistOutcome(beta, {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'synthetic-plan-only-outcome',
    scope: betaScope,
    assessment: {
      direction: 'inconclusive',
      measurements: [
        { scope: betaScope, id: plan.baseline.measurement.id },
        { scope: betaScope, id: plan.followUp.measurement.id },
      ],
      reason: 'Synthetic cross-tenant outcome must not enter the alpha decision cycle.',
    },
    attribution: {
      strength: 'none',
      reason: 'No attribution.',
    },
    createdAt: '2026-10-01T19:49:00.000Z',
  });

  const outcome: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'synthetic-plan-only-outcome',
    scope: structuredClone(serviceBriefScope),
    assessment: {
      direction: 'unchanged',
      measurements: [
        { scope: structuredClone(serviceBriefScope), id: plan.baseline.measurement.id },
        { scope: structuredClone(serviceBriefScope), id: plan.followUp.measurement.id },
      ],
      comparability: 'comparable',
      rationale: 'Human-declared plan-only outcome bound to the exact current measurements.',
    },
    attribution: {
      strength: 'none',
      reason: 'No causal attribution is asserted.',
    },
    createdAt: '2026-10-01T19:50:00.000Z',
  };
  await commitDecisionOutcome(fixture.prepared.evidence, fixture.prepared.review, alpha, input, outcome);

  const final = await prepareDecisionCycle(fixture.prepared.evidence, fixture.prepared.review, alpha, input);
  assert.equal(final.readiness.state, 'outcome_recorded');
  assert.deepEqual(final.humanOutcomes.map((record) => record.id), [outcome.id]);
  assert.deepEqual(final.provenance.outcomeIds, [outcome.id]);
  assert.notEqual(final.id, ready.id);
});

test('current cycle isolates reused-recommendation measurements and outcomes to the exact plan', async (t) => {
  const fixture = await decisionCycleFixture(t);
  await commitDecisionRecommendation(fixture.prepared.evidence, fixture.prepared.review, alpha, fixture.input);
  const baselineA = await commitDecisionMeasurement(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
    'baseline',
  );
  const followUpA = await commitDecisionMeasurement(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
    'follow_up',
  );

  const cycleA = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
  );
  const planA = cycleA.measurementPlan!;
  assert.deepEqual(
    cycleA.recordedMeasurements.map((record) => record.id),
    [baselineA.id, followUpA.id].sort(),
  );

  const inputB = structuredClone(fixture.input) as any;
  inputB.searchChangePlan.annotation.id = 'synthetic-decision-cycle-change-b';
  inputB.decision.id = 'synthetic-decision-cycle-decision-b';
  inputB.decision.summary = 'Human starts a second measurement cycle for the same canonical recommendation.';

  const beforeOldOutcome = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputB,
  );
  const planBPrepared = beforeOldOutcome.measurementPlan!;
  assert.notEqual(planBPrepared.baseline.measurement.id, planA.baseline.measurement.id);
  assert.notEqual(planBPrepared.followUp.measurement.id, planA.followUp.measurement.id);
  assert.deepEqual(beforeOldOutcome.recordedMeasurements, []);
  assert.deepEqual(beforeOldOutcome.provenance.measurementIds, []);
  assert.equal(beforeOldOutcome.humanOutcomes.length, 0);
  assert.equal(beforeOldOutcome.readiness.state, 'measurements_not_recorded');

  const outcomeA: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'synthetic-decision-cycle-outcome-a',
    scope: structuredClone(serviceBriefScope),
    recommendationId: fixture.recommendation.id,
    assessment: {
      direction: 'unchanged',
      measurements: [
        { scope: structuredClone(serviceBriefScope), id: planA.baseline.measurement.id },
        { scope: structuredClone(serviceBriefScope), id: planA.followUp.measurement.id },
      ],
      comparability: 'comparable',
      rationale: 'Human closes cycle A only.',
    },
    attribution: {
      strength: 'technical_verification',
      basis: 'Synthetic technical verification only; no causal claim.',
    },
    createdAt: '2026-10-01T19:50:00.000Z',
  };
  await commitDecisionOutcome(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    fixture.input,
    outcomeA,
  );

  const afterOldOutcome = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputB,
  );
  assert.equal(afterOldOutcome.id, beforeOldOutcome.id);
  assert.deepEqual(afterOldOutcome.recordedMeasurements, []);
  assert.deepEqual(afterOldOutcome.provenance.measurementIds, []);
  assert.equal(afterOldOutcome.humanOutcomes.length, 0);
  assert.deepEqual(afterOldOutcome.provenance.outcomeIds, []);
  assert.equal(afterOldOutcome.readiness.state, 'measurements_not_recorded');

  const crossCycle = structuredClone(outcomeA) as Contract<'outcome'>;
  crossCycle.id = 'synthetic-decision-cycle-cross-cycle-outcome';
  crossCycle.createdAt = '2026-10-01T20:00:00.000Z';
  await assert.rejects(
    commitDecisionOutcome(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      inputB,
      crossCycle,
    ),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_selection',
  );

  const baselineB = await commitDecisionMeasurement(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputB,
    'baseline',
  );
  const afterBaselineB = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputB,
  );
  assert.equal(baselineB.id, planBPrepared.baseline.measurement.id);
  assert.deepEqual(afterBaselineB.recordedMeasurements.map((record) => record.id), [baselineB.id]);
  assert.deepEqual(afterBaselineB.provenance.measurementIds, [baselineB.id]);
  assert.equal(afterBaselineB.readiness.state, 'measurements_not_recorded');
  assert.equal(afterBaselineB.recordedMeasurements.some((record) => record.id === baselineA.id), false);
  assert.equal(afterBaselineB.recordedMeasurements.some((record) => record.id === followUpA.id), false);

  const followUpB = await commitDecisionMeasurement(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputB,
    'follow_up',
  );
  const readyB = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputB,
  );
  const planB = readyB.measurementPlan!;
  const expectedBIds = [baselineB.id, followUpB.id].sort();
  assert.equal(followUpB.id, planBPrepared.followUp.measurement.id);
  assert.deepEqual(readyB.recordedMeasurements.map((record) => record.id), expectedBIds);
  assert.deepEqual(readyB.provenance.measurementIds, expectedBIds);
  assert.equal(readyB.readiness.state, 'ready_for_human_assessment');
  assert.equal(readyB.humanOutcomes.length, 0);
  assert.equal(readyB.recordedMeasurements.some((record) => record.id === baselineA.id), false);
  assert.equal(readyB.recordedMeasurements.some((record) => record.id === followUpA.id), false);

  const inputC = structuredClone(fixture.input) as any;
  inputC.searchChangePlan.annotation.id = 'synthetic-decision-cycle-change-c';
  inputC.decision.id = 'synthetic-decision-cycle-decision-c';
  inputC.decision.summary = 'Human starts an unrelated third measurement cycle on the same recommendation.';
  const unrelatedMeasurement = await commitDecisionMeasurement(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputC,
    'baseline',
  );
  assert.equal(expectedBIds.includes(unrelatedMeasurement.id), false);

  const afterUnrelatedMeasurement = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputB,
  );
  assert.equal(afterUnrelatedMeasurement.id, readyB.id);
  assert.deepEqual(afterUnrelatedMeasurement.recordedMeasurements.map((record) => record.id), expectedBIds);
  assert.deepEqual(afterUnrelatedMeasurement.provenance.measurementIds, expectedBIds);
  assert.equal(afterUnrelatedMeasurement.readiness.state, readyB.readiness.state);

  const outcomeB: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'synthetic-decision-cycle-outcome-b',
    scope: structuredClone(serviceBriefScope),
    recommendationId: fixture.recommendation.id,
    assessment: {
      direction: 'unchanged',
      measurements: [
        { scope: structuredClone(serviceBriefScope), id: planB.baseline.measurement.id },
        { scope: structuredClone(serviceBriefScope), id: planB.followUp.measurement.id },
      ],
      comparability: 'comparable',
      rationale: 'Human closes only cycle B with cycle-B measurements.',
    },
    attribution: {
      strength: 'technical_verification',
      basis: 'Synthetic technical verification only; no causal claim.',
    },
    createdAt: '2026-10-01T20:05:00.000Z',
  };
  await commitDecisionOutcome(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputB,
    outcomeB,
  );

  const finalB = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    inputB,
  );
  assert.equal(finalB.readiness.state, 'outcome_recorded');
  assert.deepEqual(finalB.recordedMeasurements.map((record) => record.id), expectedBIds);
  assert.deepEqual(finalB.provenance.measurementIds, expectedBIds);
  assert.deepEqual(finalB.humanOutcomes.map((record) => record.id), [outcomeB.id]);
  assert.deepEqual(finalB.provenance.outcomeIds, [outcomeB.id]);
  assert.notEqual(finalB.id, readyB.id);
  assert.equal(finalB.humanOutcomes.some((record) => record.id === outcomeA.id), false);
});

test('no-plan outcome commit requires the exact cycle recommendation association', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const input = structuredClone(fixture.input) as any;
  delete input.searchChangePlan;

  const created = await commitDecisionRecommendation(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    input,
  );
  assert.equal(created.id, fixture.recommendation.id);

  const missingAssociation: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'synthetic-no-plan-missing-recommendation',
    scope: structuredClone(serviceBriefScope),
    assessment: {
      direction: 'not_due',
      reason: 'Synthetic no-plan outcome intentionally omits the cycle recommendation.',
    },
    attribution: {
      strength: 'none',
      reason: 'No attribution.',
    },
    createdAt: '2026-10-01T20:10:00.000Z',
  };
  await assert.rejects(
    commitDecisionOutcome(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      input,
      missingAssociation,
    ),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_selection',
  );
  assert.equal(
    await fixture.prepared.review.getOutcome(alpha, serviceBriefScope, missingAssociation.id),
    null,
  );

  const recommendationS = structuredClone(fixture.recommendation);
  recommendationS.id = 'synthetic-decision-cycle-recommendation-s';
  recommendationS.rationale = 'Synthetic same-scope recommendation S for no-plan association rejection.';
  await createHumanRecommendation(
    fixture.prepared.review,
    fixture.prepared.evidence,
    alpha,
    { recommendation: recommendationS },
  );

  const wrongAssociation: Contract<'outcome'> = {
    ...structuredClone(missingAssociation),
    id: 'synthetic-no-plan-wrong-recommendation',
    recommendationId: recommendationS.id,
    createdAt: '2026-10-01T20:11:00.000Z',
  };
  await assert.rejects(
    commitDecisionOutcome(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      input,
      wrongAssociation,
    ),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_selection',
  );
  assert.equal(
    await fixture.prepared.review.getOutcome(alpha, serviceBriefScope, wrongAssociation.id),
    null,
  );

  const exactAssociation: Contract<'outcome'> = {
    ...structuredClone(missingAssociation),
    id: 'synthetic-no-plan-exact-recommendation',
    recommendationId: fixture.recommendation.id,
    createdAt: '2026-10-01T20:12:00.000Z',
  };
  const recorded = await commitDecisionOutcome(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    input,
    exactAssociation,
  );
  assert.equal(recorded.recommendationId, fixture.recommendation.id);

  const final = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    input,
  );
  assert.equal(final.readiness.state, 'outcome_recorded');
  assert.deepEqual(final.humanOutcomes.map((outcome) => outcome.id), [exactAssociation.id]);
});

test('no-plan cycle without a recommendation rejects explicit outcome commit as unbound', async (t) => {
  const fixture = await decisionCycleFixture(t);
  const input = structuredClone(fixture.input) as any;
  delete input.searchChangePlan;
  delete input.recommendation;
  input.decision.disposition = 'investigate';
  input.decision.summary = 'Human investigation has no plan and no canonical recommendation association.';

  const prepared = await prepareDecisionCycle(
    fixture.prepared.evidence,
    fixture.prepared.review,
    alpha,
    input,
  );
  assert.equal(prepared.measurementPlan, undefined);
  assert.equal(prepared.recommendation, undefined);

  const unbound: Contract<'outcome'> = {
    schemaVersion: '1.0',
    kind: 'outcome',
    id: 'synthetic-no-plan-unbound-outcome',
    scope: structuredClone(serviceBriefScope),
    assessment: {
      direction: 'not_due',
      reason: 'Synthetic outcome has no durable Release 0.16 cycle association.',
    },
    attribution: {
      strength: 'none',
      reason: 'No attribution.',
    },
    createdAt: '2026-10-01T20:15:00.000Z',
  };

  await assert.rejects(
    commitDecisionOutcome(
      fixture.prepared.evidence,
      fixture.prepared.review,
      alpha,
      input,
      unbound,
    ),
    (error: unknown) => error instanceof DecisionCycleError && error.code === 'invalid_state',
  );
  assert.equal(
    await fixture.prepared.review.getOutcome(alpha, serviceBriefScope, unbound.id),
    null,
  );
});
