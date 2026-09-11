import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { wireSchemas, type Contract, type ContractName } from '../../src/contracts/wire.js';
import {
  assertComparableMeasurements, compareCohorts, ContractInvariantError,
  parseContract, sourceRecordIdentityHash,
} from '../../src/domain/validate.js';

interface SyntheticCorpus {
  synthetic: boolean;
  description: string;
  records: Record<string, { contract: ContractName; data: unknown }>;
}

const fixtureText = readFileSync('fixtures/synthetic/contracts.json', 'utf8');
const corpus = JSON.parse(fixtureText) as SyntheticCorpus;

// Each call parses and clones a fixture so one negative case cannot affect another.
function fixture<N extends ContractName>(contract: N, name: string): Contract<N> {
  const record = corpus.records[name];
  assert.ok(record, `Missing synthetic fixture ${name}`);
  assert.equal(record.contract, contract);
  return parseContract(contract, record.data);
}

const missingStates = ['unknown', 'unavailable', 'not_collected', 'not_applicable'] as const;

test('all synthetic fixtures validate without changing their data and cover every wire contract', () => {
  assert.equal(corpus.synthetic, true);
  assert.equal(Object.keys(corpus.records).length, 28);
  assert.deepEqual(
    [...new Set(Object.values(corpus.records).map((record) => record.contract))].sort(),
    Object.keys(wireSchemas).sort(),
  );
  for (const [name, record] of Object.entries(corpus.records)) {
    assert.deepEqual(wireSchemas[record.contract].parse(record.data), record.data, name);
    assert.deepEqual(parseContract(record.contract, record.data), record.data, name);
  }
});

test('the corpus has only explicitly synthetic identities and no live contact or resource URLs', () => {
  assert.match(corpus.description, /fictitious/i);
  assert.doesNotMatch(fixtureText, /https?:\/\/|@|api[_-]?key|access[_-]?token|password/i);
  function audit(value: unknown): void {
    if (Array.isArray(value)) return value.forEach(audit);
    if (value === null || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if ('tenantId' in record) {
      assert.ok(record['tenantId'] === 'tenant-alpha' || record['tenantId'] === 'tenant-beta');
      assert.equal(record['siteId'], record['tenantId'] === 'tenant-alpha' ? 'site-alpha' : 'site-beta');
    }
    for (const [key, child] of Object.entries(record)) {
      if (typeof child === 'string' && (key === 'id' || key === 'reference' || key.endsWith('Id'))) {
        assert.match(child, /^(synthetic-[A-Za-z0-9._:-]+|tenant-(alpha|beta)|site-(alpha|beta))$/);
      }
      audit(child);
    }
  }
  audit(corpus.records);
});

test('observed zero remains a numeric observation through parse and JSON round trip', () => {
  const observation = fixture('observation', 'observationZero');
  assert.deepEqual(observation.value, { state: 'observed', value: { type: 'number', value: 0 } });
  const serialized = JSON.stringify(observation);
  const restored = parseContract('observation', JSON.parse(serialized));
  assert.deepEqual(restored, observation);
  assert.equal(restored.value.state, 'observed');
  if (restored.value.state === 'observed') {
    assert.equal(restored.value.value.type, 'number');
    assert.equal(restored.value.value.value, 0);
  }
});

test('every missing state remains distinct and demands a meaningful bounded reason', () => {
  const states = new Set<string>();
  for (const state of missingStates) {
    const parsed = fixture('observationValue', `value_${state}`);
    assert.equal(parsed.state, state);
    assert.equal('value' in parsed, false);
    states.add(parsed.state);
    for (const invalid of [
      { state }, { state, reason: '' }, { state, reason: ' \n\t ' },
      { state, reason: null }, { state, reason: 'x'.repeat(513) },
      { state, reason: 'Synthetic missing evidence.', value: { type: 'number', value: 0 } },
    ]) assert.throws(() => parseContract('observationValue', invalid));
    assert.doesNotThrow(() => parseContract('observationValue', { state, reason: 'x'.repeat(512) }));
  }
  assert.equal(states.size, 4);
});

test('invalid value unions cannot be repaired by coercion or silent defaults', () => {
  for (const invalid of [
    null, undefined, {}, { state: 'missing', reason: 'Synthetic example.' },
    { state: 'observed' }, { state: 'observed', value: null },
    { state: 'observed', value: { type: 'number', value: '0' } },
    { state: 'observed', value: { type: 'number', value: 0 }, reason: 'Contradictory field.' },
    { state: 'observed', value: { type: 'boolean', value: 0 } },
    { state: 'observed', value: { type: 'text', value: '' } },
    { state: 'observed', value: { type: 'number', value: Infinity } },
    { state: 'observed', value: { type: 'number', value: 1e15 + 1 } },
  ]) assert.throws(() => parseContract('observationValue', invalid));
  assert.deepEqual(parseContract('observationValue', { state: 'observed', value: { type: 'boolean', value: false } }),
    { state: 'observed', value: { type: 'boolean', value: false } });
});

test('unsupported canonical versions fail at outer and nested contract boundaries', () => {
  for (const record of Object.values(corpus.records)) {
    if (record.contract === 'observationValue') continue;
    const data = record.data as Record<string, unknown>;
    for (const schemaVersion of ['2.0', '999.0', '1.1', '', 1]) {
      assert.throws(() => parseContract(record.contract, { ...data, schemaVersion }));
    }
  }
  const observation = fixture('observation', 'observationZero');
  assert.throws(() => parseContract('observation', {
    ...observation, cohort: { ...observation.cohort, schemaVersion: '2.0' },
  }));
  assert.throws(() => parseContract('observation', {
    ...observation, provenance: { ...observation.provenance, schemaVersion: '2.0' },
  }));
  assert.equal(observation.schemaVersion, '1.0');
  assert.equal(observation.provenance.sourceSchema.version, '7.3');
});

test('contract kinds cannot substitute for evidence, inference, recommendation, action, measurement, or outcome', () => {
  const examples = [
    ['observation', 'observationZero'], ['inference', 'inferenceContradictory'],
    ['recommendation', 'recommendationAccepted'], ['action', 'actionPlanned'],
    ['measurement', 'measurementBaseline'], ['outcome', 'outcomeInconclusive'],
  ] as const;
  for (const [kind, name] of examples) {
    const value = fixture(kind, name);
    for (const [otherKind] of examples) {
      if (kind !== otherKind) assert.throws(() => parseContract(otherKind, value), `${kind} must not parse as ${otherKind}`);
    }
    assert.throws(() => parseContract(kind, { ...value, extension: 'Unknown fields require intentional schema evolution.' }));
  }
});

test('source time, collection time, receipt time, and source version survive independently', () => {
  const observation = fixture('observation', 'observationZero');
  const provenance = observation.provenance;
  assert.equal(provenance.sourceTime.end, '2026-01-01T01:00:00.000Z');
  assert.equal(provenance.collectedAt, '2026-01-01T01:02:00.000Z');
  assert.equal(provenance.receivedAt, '2026-01-01T01:03:00.000Z');
  assert.equal(new Set([provenance.sourceTime.end, provenance.collectedAt, provenance.receivedAt]).size, 3);
  assert.notEqual(provenance.sourceSchema.version, provenance.schemaVersion);
  assert.deepEqual(parseContract('provenance', JSON.parse(JSON.stringify(provenance))), provenance);
});

test('malformed or impossible timestamps fail instead of rolling into another calendar date', () => {
  const provenance = fixture('provenance', 'provenanceAlpha');
  for (const receivedAt of [
    'not-a-time', '2026-02-30T01:03:00.000Z', '2026-02-29T01:03:00.000Z',
    '2026-13-01T01:03:00.000Z', '2026-01-01T24:03:00.000Z',
    '2026-01-01T01:03:60.000Z', '2026-01-01T01:03:00Z',
    '2026-01-01T01:03:00.000+00:00',
  ]) assert.throws(() => parseContract('provenance', { ...provenance, receivedAt }));
  assert.doesNotThrow(() => parseContract('provenance', { ...provenance, receivedAt: '2028-02-29T01:03:00.000Z' }));
});

test('reversed source, collection, receipt, and review chronology is rejected by domain validation', () => {
  const collection = fixture('collection', 'collectionComplete');
  const invalidCollections = [
    { ...collection, sourceTime: { start: collection.sourceTime.end, end: collection.sourceTime.start } },
    { ...collection, sourceTime: { ...collection.sourceTime, end: '2026-01-01T01:04:00.000Z' } },
    { ...collection, startedAt: '2026-01-01T01:01:30.000Z' },
    { ...collection, endedAt: '2026-01-01T01:02:30.000Z' },
    { ...collection, receivedAt: '2026-01-01T01:01:30.000Z' },
  ];
  for (const invalid of invalidCollections) {
    assert.doesNotThrow(() => wireSchemas.collection.parse(invalid));
    assert.throws(() => parseContract('collection', invalid), ContractInvariantError);
  }
  const recommendation = fixture('recommendation', 'recommendationAccepted');
  assert.throws(() => parseContract('recommendation', { ...recommendation, updatedAt: '2026-01-01T01:00:00.000Z' }), ContractInvariantError);
  const measurement = fixture('measurement', 'measurementBaseline');
  assert.throws(() => parseContract('measurement', { ...measurement, dueWindow: { start: measurement.dueWindow.end, end: measurement.dueWindow.start } }), ContractInvariantError);
});

test('identifiers, rationale, dimensions, and reference arrays have useful hard bounds', () => {
  const observation = fixture('observation', 'observationZero');
  assert.doesNotThrow(() => parseContract('observation', { ...observation, id: 'x'.repeat(128) }));
  for (const id of ['', 'x'.repeat(129), 'identifier with spaces', 'https://synthetic.invalid/path']) {
    assert.throws(() => parseContract('observation', { ...observation, id }));
  }
  const cohort = fixture('cohort', 'cohortAlpha');
  for (const dimensions of [
    { ...cohort.context.dimensions, surface: 'x'.repeat(129) },
    { ...cohort.context.dimensions, geography: '   ' },
    { ...cohort.context.dimensions, arbitrary: { nested: 'Not a supported dimension.' } },
    Object.fromEntries(Array.from({ length: 20 }, (_, index) => [`arbitrary-${index}`, 'x'])),
  ]) assert.throws(() => parseContract('cohort', { ...cohort, context: { ...cohort.context, dimensions } }));
  const recommendation = fixture('recommendation', 'recommendationAccepted');
  assert.throws(() => parseContract('recommendation', { ...recommendation, rationale: 'x'.repeat(2049) }));
  const reference = recommendation.evidence[0]!;
  const evidence = Array.from({ length: 32 }, (_, index) => ({ ...reference, id: `synthetic-inference-${index}` }));
  assert.doesNotThrow(() => parseContract('recommendation', { ...recommendation, evidence }));
  assert.throws(() => parseContract('recommendation', { ...recommendation, evidence: [...evidence, { ...reference, id: 'synthetic-inference-32' }] }));
  assert.throws(() => parseContract('recommendation', { ...recommendation, evidence: [] }));
});

test('complete empty collection proves 0 of 0 while partial collection preserves its shortfall', () => {
  const empty = fixture('collection', 'collectionCompleteEmpty');
  const partial = fixture('collection', 'collectionPartial');
  assert.deepEqual(empty.completeness, { state: 'complete', expectedCount: 0, receivedCount: 0 });
  assert.equal(partial.completeness.state, 'partial');
  assert.notDeepEqual(partial.completeness, empty.completeness);
  for (const completeness of [
    { state: 'complete', expectedCount: 2, receivedCount: 1 },
    { state: 'complete', expectedCount: 0, receivedCount: 1 },
    { state: 'partial', expectedCount: 0, receivedCount: 0, reason: 'Synthetic shortfall.' },
    { state: 'partial', expectedCount: 1, receivedCount: 1, reason: 'Synthetic shortfall.' },
  ]) {
    assert.doesNotThrow(() => wireSchemas.collection.parse({ ...empty, completeness }));
    assert.throws(() => parseContract('collection', { ...empty, completeness }), ContractInvariantError);
  }
  assert.doesNotThrow(() => parseContract('collection', {
    ...partial, completeness: { state: 'partial', receivedCount: 0, reason: 'The synthetic expected population is unknown.' },
  }));
  const observed = fixture('observation', 'observationZero');
  assert.throws(() => parseContract('observation', {
    ...observed, provenance: { ...observed.provenance, completeness: empty.completeness },
  }), ContractInvariantError);
});

test('a normalized observed value must agree with its metric type and provider context', () => {
  const observation = fixture('observation', 'observationZero');
  assert.throws(() => parseContract('observation', {
    ...observation, value: { state: 'observed', value: { type: 'text', value: 'zero' } },
  }), ContractInvariantError);
  observation.cohort.context.dimensions.providerId = 'synthetic-other-provider';
  assert.throws(() => parseContract('observation', observation), ContractInvariantError);
});

test('same external record identity stays different under synthetic tenant contexts', () => {
  const alpha = fixture('sourceRecord', 'sourceRecordAlpha').identity;
  const beta = fixture('sourceRecord', 'sourceRecordBeta').identity;
  assert.equal(alpha.sourceRecordId, beta.sourceRecordId);
  assert.equal(alpha.providerId, beta.providerId);
  assert.equal(alpha.providerConnectionId, beta.providerConnectionId);
  assert.notEqual(alpha.scope.tenantId, beta.scope.tenantId);
  assert.notEqual(sourceRecordIdentityHash(alpha), sourceRecordIdentityHash(beta));
  assert.equal(sourceRecordIdentityHash(alpha), sourceRecordIdentityHash(JSON.parse(JSON.stringify(alpha))));
  assert.equal(sourceRecordIdentityHash(alpha), sourceRecordIdentityHash(Object.fromEntries(Object.entries(alpha).reverse())));
  for (const changed of [
    { ...alpha, scope: { ...alpha.scope, tenantId: 'tenant-beta' } },
    { ...alpha, scope: { ...alpha.scope, siteId: 'site-beta' } },
    { ...alpha, scope: { ...alpha.scope, siteScopeRevisionId: 'synthetic-scope-alpha-r2' } },
    { ...alpha, providerId: 'synthetic-provider-two' },
    { ...alpha, providerConnectionId: 'synthetic-connection-two' },
  ]) assert.notEqual(sourceRecordIdentityHash(alpha), sourceRecordIdentityHash(changed));
});

test('embedded evidence cannot cross tenant, site, or scope revision boundaries', () => {
  const alpha = fixture('sourceRecord', 'sourceRecordAlpha').identity.scope;
  const scopeChanges = [
    { ...alpha, tenantId: 'tenant-beta' },
    { ...alpha, siteId: 'site-beta' },
    { ...alpha, siteScopeRevisionId: 'synthetic-scope-alpha-r2' },
  ];
  for (const changedScope of scopeChanges) {
    const observation = fixture('observation', 'observationZero');
    observation.provenance.source.scope = changedScope;
    assert.throws(() => parseContract('observation', observation), ContractInvariantError);
    const inference = fixture('inference', 'inferenceContradictory');
    inference.supportingObservations[0]!.scope = changedScope;
    assert.throws(() => parseContract('inference', inference), ContractInvariantError);
    const recommendation = fixture('recommendation', 'recommendationAccepted');
    recommendation.evidence[0]!.scope = changedScope;
    assert.throws(() => parseContract('recommendation', recommendation), ContractInvariantError);
    const measurement = fixture('measurement', 'measurementBaseline');
    assert.equal(measurement.result.state, 'measured');
    if (measurement.result.state === 'measured') measurement.result.observations[0]!.reference.scope = changedScope;
    assert.throws(() => parseContract('measurement', measurement), ContractInvariantError);
    const outcome = fixture('outcome', 'outcomeAssociation');
    assert.equal(outcome.assessment.direction, 'improved');
    if ('measurements' in outcome.assessment) outcome.assessment.measurements[0]!.scope = changedScope;
    assert.throws(() => parseContract('outcome', outcome), ContractInvariantError);
  }
});

test('supporting and contradictory observations remain distinct without duplicate evidence inflation', () => {
  const inference = fixture('inference', 'inferenceContradictory');
  assert.notEqual(inference.supportingObservations[0]!.id, inference.contradictingObservations[0]!.id);
  assert.equal(inference.uncertainty.state, 'qualitative');
  assert.equal('probability' in inference.uncertainty, false);
  assert.throws(() => parseContract('inference', { ...inference, contradictingObservations: inference.supportingObservations }), ContractInvariantError);
  assert.throws(() => parseContract('inference', { ...inference, supportingObservations: [...inference.supportingObservations, ...inference.supportingObservations] }), ContractInvariantError);
  const recommendation = fixture('recommendation', 'recommendationAccepted');
  assert.throws(() => parseContract('recommendation', { ...recommendation, evidence: [...recommendation.evidence, ...recommendation.evidence] }), ContractInvariantError);
});

test('every declared comparison dimension can produce a discontinuity and omission is not a wildcard', () => {
  const original = fixture('cohort', 'cohortAlpha');
  assert.deepEqual(compareCohorts(original, structuredClone(original)), { state: 'comparable' });
  const mutations: Array<(cohort: Contract<'cohort'>) => void> = [
    (cohort) => { cohort.revision += 1; },
    (cohort) => { cohort.context.scope.siteScopeRevisionId = 'synthetic-scope-alpha-r2'; },
    (cohort) => { cohort.context.subject.reference = 'synthetic-another-subject'; },
    (cohort) => { cohort.context.metric.meaningVersion = '2.0'; },
    (cohort) => { cohort.context.metric.unit = 'synthetic-other-unit'; },
    (cohort) => { cohort.context.dimensions.promptCohort!.revision += 1; },
    (cohort) => { cohort.context.dimensions.providerId = 'synthetic-other-provider'; },
    (cohort) => { cohort.context.dimensions.surface = 'synthetic-other-surface'; },
    (cohort) => { cohort.context.dimensions.model = 'synthetic-other-model'; },
    (cohort) => { cohort.context.dimensions.geography = 'synthetic-other-region'; },
    (cohort) => { cohort.context.dimensions.language = 'fr'; },
    (cohort) => { cohort.context.dimensions.device = 'synthetic-other-device'; },
    (cohort) => { cohort.context.dimensions.configuration!.version = '2.0'; },
    (cohort) => { cohort.context.method.version = '2.0'; },
    (cohort) => { cohort.context.method.configurationRevision += 1; },
    (cohort) => { cohort.context.timeWindowRules.durationSeconds = 7200; },
    (cohort) => { delete cohort.context.dimensions.model; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(original);
    mutate(changed);
    assert.equal(compareCohorts(original, changed).state, 'discontinuous');
  }
  const minimal = structuredClone(original);
  minimal.context.dimensions = {};
  assert.doesNotThrow(() => parseContract('cohort', minimal));
  assert.equal(compareCohorts(original, minimal).state, 'discontinuous');
});

test('accepting a recommendation does not execute or verify its separate action record', () => {
  const recommendation = fixture('recommendation', 'recommendationAccepted');
  const action = fixture('action', 'actionPlanned');
  assert.equal(recommendation.lifecycle, 'accepted');
  assert.equal(action.recommendation.id, recommendation.id);
  assert.deepEqual(action.execution, { state: 'planned' });
  assert.deepEqual(action.verification, { state: 'not_verified' });
  assert.equal('authority' in action.execution, false);
  assert.equal('executedAt' in action.execution, false);
  assert.throws(() => parseContract('action', {
    ...action, execution: { state: 'succeeded', requestedAt: '2026-01-01T02:00:00.000Z', executedAt: '2026-01-01T02:01:00.000Z' },
  }));
  assert.throws(() => parseContract('action', {
    ...action, verification: { state: 'failed', checkedAt: '2026-01-01T02:02:00.000Z', reason: 'Synthetic verification attempt.' },
  }), ContractInvariantError);
});

test('verification requires an execution record, chronological evidence, and the owning scope', () => {
  const action = fixture('action', 'actionPlanned');
  const observation = fixture('observation', 'observationZero');
  action.execution = {
    state: 'succeeded', requestedAt: '2026-01-01T02:00:00.000Z', executedAt: '2026-01-01T02:01:00.000Z',
    authority: { reference: 'synthetic-separate-authority', revision: 1 }, externalReceipt: 'synthetic-external-receipt',
  };
  action.verification = {
    state: 'verified', verifiedAt: '2026-01-01T02:02:00.000Z', method: { id: 'synthetic-verification', version: '1.0' },
    evidence: [{ scope: action.scope, kind: 'observation', id: observation.id }],
  };
  assert.doesNotThrow(() => parseContract('action', action));
  assert.throws(() => parseContract('action', { ...action, execution: { state: 'planned' } }), ContractInvariantError);
  assert.throws(() => parseContract('action', { ...action, verification: { ...action.verification, verifiedAt: '2026-01-01T02:00:30.000Z' } }), ContractInvariantError);
  assert.throws(() => parseContract('action', { ...action, execution: { ...action.execution, executedAt: '2026-01-01T01:59:00.000Z' } }), ContractInvariantError);
  action.verification.evidence[0]!.scope = { ...action.scope, tenantId: 'tenant-beta' };
  assert.throws(() => parseContract('action', action), ContractInvariantError);
});

test('measurement and outcome are separate and inconclusive requires no invented change value', () => {
  const measurement = fixture('measurement', 'measurementBaseline');
  const outcome = fixture('outcome', 'outcomeInconclusive');
  assert.equal(measurement.relationship.role, 'baseline');
  assert.equal(outcome.assessment.direction, 'inconclusive');
  assert.equal(outcome.attribution.strength, 'none');
  assert.equal('value' in outcome.assessment, false);
  assert.throws(() => parseContract('outcome', measurement));
  assert.throws(() => parseContract('measurement', outcome));
  assert.doesNotThrow(() => parseContract('outcome', {
    ...outcome, assessment: { direction: 'inconclusive', measurements: [], reason: 'Synthetic assessment has no usable measurements.' },
  }));
  for (const direction of ['not_due', 'not_measured'] as const) {
    assert.doesNotThrow(() => parseContract('outcome', { ...outcome, assessment: { direction, reason: 'Synthetic assessment is pending.' } }));
  }
});

test('outcome direction and attribution strength remain independent assertions', () => {
  const outcome = fixture('outcome', 'outcomeAssociation');
  assert.equal(outcome.assessment.direction, 'improved');
  assert.equal(outcome.attribution.strength, 'association');
  assert.equal('causedBy' in outcome, false);
  assert.equal('causal' in outcome.attribution, false);
  const attributions: Contract<'outcome'>['attribution'][] = [
    { strength: 'none', reason: 'No synthetic attribution evidence.' },
    { strength: 'technical_verification', basis: 'Synthetic technical check only.' },
    { strength: 'association', basis: 'Synthetic temporal association only.' },
    { strength: 'controlled_evidence', basis: 'Synthetic controlled comparison example.', method: { id: 'synthetic-control-method', version: '1.0' } },
  ];
  for (const attribution of attributions) {
    const parsed = parseContract('outcome', { ...outcome, attribution });
    assert.equal(parsed.assessment.direction, 'improved');
    assert.deepEqual(parsed.attribution, attribution);
  }
  assert.ok('measurements' in outcome.assessment);
  const assessment = outcome.assessment;
  for (const direction of ['improved', 'regressed', 'unchanged'] as const) {
    assert.doesNotThrow(() => parseContract('outcome', { ...outcome, assessment: { ...assessment, direction } }));
  }
  assert.throws(() => parseContract('outcome', { ...outcome, assessment: { ...assessment, measurements: assessment.measurements.slice(0, 1) } }));
  assert.throws(() => parseContract('outcome', { ...outcome, assessment: { ...assessment, measurements: [assessment.measurements[0], assessment.measurements[0]] } }), ContractInvariantError);
  assert.throws(() => parseContract('outcome', { ...outcome, assessment: { ...assessment, comparability: 'unknown' } }));
});

test('resolved baseline and follow-up require stable cohorts, methodology, chronology, and observed evidence', () => {
  const baseline = fixture('measurement', 'measurementBaseline');
  const followUp = fixture('measurement', 'measurementFollowUp');
  assert.doesNotThrow(() => assertComparableMeasurements(baseline, followUp));
  const mutations: Array<(value: Contract<'measurement'>) => void> = [
    (value) => { value.cohort.context.dimensions.model = 'synthetic-new-model'; },
    (value) => { value.methodology.version = '2.0'; },
    (value) => { value.relationship = { role: 'follow_up', baselineMeasurementId: 'synthetic-other-baseline' }; },
    (value) => { value.relationship = { role: 'baseline' }; },
    (value) => { value.comparability = { state: 'unknown', reason: 'Synthetic comparability has not been established.' }; },
    (value) => { value.result = { state: 'not_measured', reason: 'Synthetic measurement was not performed.' }; },
    (value) => { value.result = { state: 'not_due', reason: 'Synthetic measurement is not due.' }; },
    (value) => {
      if (value.result.state === 'measured') value.result.observedWindow = { start: '2026-01-01T00:30:00.000Z', end: '2026-01-01T01:30:00.000Z' };
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(followUp);
    mutate(changed);
    assert.doesNotThrow(() => parseContract('measurement', changed));
    assert.throws(() => assertComparableMeasurements(baseline, changed), ContractInvariantError);
  }
  for (const state of missingStates) {
    const changed = structuredClone(followUp);
    assert.equal(changed.result.state, 'measured');
    if (changed.result.state === 'measured') changed.result.observations[0]!.value = { state, reason: 'Synthetic missing observation.' };
    assert.doesNotThrow(() => parseContract('measurement', changed));
    assert.throws(() => assertComparableMeasurements(baseline, changed), ContractInvariantError);
  }
  assert.throws(() => assertComparableMeasurements(followUp, baseline), ContractInvariantError);
});

test('measurement references cannot be duplicated or self-referential and values retain metric meaning', () => {
  const measurement = fixture('measurement', 'measurementFollowUp');
  assert.throws(() => parseContract('measurement', {
    ...measurement, relationship: { role: 'follow_up', baselineMeasurementId: measurement.id },
  }), ContractInvariantError);
  assert.equal(measurement.result.state, 'measured');
  if (measurement.result.state !== 'measured') assert.fail('Expected measured fixture.');
  const result = measurement.result;
  assert.throws(() => parseContract('measurement', {
    ...measurement, result: { ...result, observations: [...result.observations, ...result.observations] },
  }), ContractInvariantError);
  measurement.result.observations[0]!.value = { state: 'observed', value: { type: 'boolean', value: true } };
  assert.throws(() => parseContract('measurement', measurement), ContractInvariantError);
});

test('verified action evidence rejects repeated composite references without conflating record kinds', () => {
  const action = fixture('action', 'actionPlanned');
  action.execution = {
    state: 'succeeded', requestedAt: '2026-01-01T02:00:00.000Z', executedAt: '2026-01-01T02:01:00.000Z',
    authority: { reference: 'synthetic-separate-authority', revision: 1 },
  };
  const reference = { scope: action.scope, kind: 'observation' as const, id: 'synthetic-evidence-001' };
  action.verification = {
    state: 'verified', verifiedAt: '2026-01-01T02:02:00.000Z',
    method: { id: 'synthetic-verification', version: '1.0' }, evidence: [reference, { ...reference }],
  };
  assert.throws(() => parseContract('action', action), /Duplicate action verification evidence/);
  action.verification.evidence[1] = { ...reference, kind: 'inference' };
  assert.doesNotThrow(() => parseContract('action', action));
});
