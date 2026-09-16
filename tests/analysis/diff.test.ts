import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import {
  compareEvidenceSnapshots,
  EvidenceDiffError,
  MAX_DIFF_OBSERVATIONS_PER_SNAPSHOT,
  type EvidenceSnapshot,
} from '../../src/analysis/diff.js';
import { canonicalJson } from '../../src/lib/canonical-json.js';
import { batch, setCompleteness } from '../persistence/helpers.js';

type ObservationValue = Contract<'observationValue'>;
type ValueType = Contract<'cohort'>['context']['metric']['valueType'];

function snapshot(
  suffix: string,
  completeness: Contract<'collection'>['completeness'] = { state: 'complete', expectedCount: 0, receivedCount: 0 },
): { value: ReturnType<typeof batch>; snapshot: EvidenceSnapshot } {
  const value = batch('alpha', suffix);
  value.sources = [];
  value.observations = [];
  setCompleteness([value], completeness);
  return { value, snapshot: { collection: value.collection, observations: [] } };
}

function observation(
  value: ReturnType<typeof batch>,
  key: string,
  observedValue: ObservationValue,
  valueType: ValueType = 'number',
): Contract<'observation'> {
  const template = batch('alpha', '-template').observations[0]!.record;
  const record = structuredClone(template);
  record.id = `synthetic-diff-observation-${key}-${value.collection.id.slice(-12).replace(/[^A-Za-z0-9]/g, '')}`;
  record.cohort.id = `synthetic-diff-cohort-${key}`;
  record.cohort.context.scope = structuredClone(value.collection.scope);
  record.cohort.context.subject = { kind: 'site', reference: value.collection.scope.siteId };
  record.cohort.context.metric = {
    id: `synthetic-diff-metric-${key}`,
    meaningVersion: '1.0',
    valueType,
    ...(valueType === 'number' ? { unit: 'synthetic-units' } : {}),
  };
  record.cohort.context.dimensions = {
    providerId: value.collection.providerId,
    surface: `synthetic-${key}`,
    configuration: { id: 'synthetic-diff-configuration', version: '1.0' },
  };
  record.cohort.context.method = structuredClone(value.collection.method);
  record.value = structuredClone(observedValue);
  record.provenance.source.scope = structuredClone(value.collection.scope);
  record.provenance.source.providerId = value.collection.providerId;
  if (Object.hasOwn(value.collection, 'providerConnectionId')) {
    record.provenance.source.providerConnectionId = value.collection.providerConnectionId;
  } else {
    delete record.provenance.source.providerConnectionId;
  }
  record.provenance.adapter = structuredClone(value.collection.adapter);
  record.provenance.sourceSchema = structuredClone(value.collection.sourceSchema);
  record.provenance.runId = value.collection.id;
  record.provenance.sourceTime = structuredClone(value.collection.sourceTime);
  record.provenance.collectedAt = value.collection.collectedAt;
  record.provenance.receivedAt = value.collection.receivedAt;
  record.provenance.completeness = structuredClone(value.collection.completeness);
  return record;
}

function add(
  holder: { value: ReturnType<typeof batch>; snapshot: EvidenceSnapshot },
  key: string,
  value: ObservationValue,
  valueType: ValueType = 'number',
): Contract<'observation'> {
  const record = observation(holder.value, key, value, valueType);
  (holder.snapshot.observations as Contract<'observation'>[]).push(record);
  return record;
}

function paired(
  baselineCompleteness: Contract<'collection'>['completeness'] = { state: 'complete', expectedCount: 1, receivedCount: 1 },
  currentCompleteness: Contract<'collection'>['completeness'] = { state: 'complete', expectedCount: 1, receivedCount: 1 },
) {
  return {
    baseline: snapshot('-diff-baseline', baselineCompleteness),
    current: snapshot('-diff-current', currentCompleteness),
  };
}

function expectDiffError(action: () => unknown, code: EvidenceDiffError['code']): void {
  assert.throws(action, (error: unknown) => error instanceof EvidenceDiffError && error.code === code);
}

test('equal observed zero is unchanged; numeric changes carry arithmetic delta without quality interpretation', () => {
  const { baseline, current } = paired(
    { state: 'complete', expectedCount: 2, receivedCount: 2 },
    { state: 'complete', expectedCount: 2, receivedCount: 2 },
  );
  add(baseline, 'zero', { state: 'observed', value: { type: 'number', value: 0 } });
  add(current, 'zero', { state: 'observed', value: { type: 'number', value: 0 } });
  add(baseline, 'numeric', { state: 'observed', value: { type: 'number', value: 2 } });
  add(current, 'numeric', { state: 'observed', value: { type: 'number', value: 5 } });

  const report = compareEvidenceSnapshots(baseline.snapshot, current.snapshot);
  assert.deepEqual(report.summary, {
    total: 2, unchanged: 1, changed: 1, appeared: 0,
    missingFromCurrent: 0, coverageUnknown: 0, attentionCount: 1,
  });
  const zero = report.entries.find((entry) => entry.baselineValue?.state === 'observed'
    && entry.baselineValue.value.type === 'number' && entry.baselineValue.value.value === 0);
  assert.equal(zero?.state, 'unchanged');
  const changed = report.entries.find((entry) => entry.numericDelta === 3);
  assert.equal(changed?.state, 'changed');
  assert.doesNotMatch(JSON.stringify(report), /better|worse|improv|regress|priority|severity/i);
});

test('missing-state and reason transitions remain exact changed evidence', () => {
  const { baseline, current } = paired(
    { state: 'complete', expectedCount: 3, receivedCount: 3 },
    { state: 'complete', expectedCount: 3, receivedCount: 3 },
  );
  add(baseline, 'observed-to-unknown', { state: 'observed', value: { type: 'number', value: 4 } });
  add(current, 'observed-to-unknown', { state: 'unknown', reason: 'Synthetic current uncertainty.' });
  add(baseline, 'unknown-to-observed', { state: 'unknown', reason: 'Synthetic baseline uncertainty.' });
  add(current, 'unknown-to-observed', { state: 'observed', value: { type: 'number', value: 4 } });
  add(baseline, 'reason-change', { state: 'unknown', reason: 'Synthetic reason A.' });
  add(current, 'reason-change', { state: 'unknown', reason: 'Synthetic reason B.' });

  const report = compareEvidenceSnapshots(baseline.snapshot, current.snapshot);
  assert.equal(report.summary.changed, 3);
  assert.equal(report.summary.attentionCount, 3);
  assert.ok(report.entries.every((entry) => entry.state === 'changed'));
  assert.deepEqual(report.entries.map((entry) => [entry.baselineValue?.state, entry.currentValue?.state]).sort(), [
    ['observed', 'unknown'], ['unknown', 'observed'], ['unknown', 'unknown'],
  ].sort());
});

test('text and boolean observations use exact semantic equality', () => {
  const { baseline, current } = paired(
    { state: 'complete', expectedCount: 4, receivedCount: 4 },
    { state: 'complete', expectedCount: 4, receivedCount: 4 },
  );
  add(baseline, 'text-same', { state: 'observed', value: { type: 'text', value: 'synthetic-ok' } }, 'text');
  add(current, 'text-same', { state: 'observed', value: { type: 'text', value: 'synthetic-ok' } }, 'text');
  add(baseline, 'text-change', { state: 'observed', value: { type: 'text', value: 'synthetic-a' } }, 'text');
  add(current, 'text-change', { state: 'observed', value: { type: 'text', value: 'synthetic-b' } }, 'text');
  add(baseline, 'bool-same', { state: 'observed', value: { type: 'boolean', value: false } }, 'boolean');
  add(current, 'bool-same', { state: 'observed', value: { type: 'boolean', value: false } }, 'boolean');
  add(baseline, 'bool-change', { state: 'observed', value: { type: 'boolean', value: false } }, 'boolean');
  add(current, 'bool-change', { state: 'observed', value: { type: 'boolean', value: true } }, 'boolean');

  const report = compareEvidenceSnapshots(baseline.snapshot, current.snapshot);
  assert.equal(report.summary.unchanged, 2);
  assert.equal(report.summary.changed, 2);
  assert.ok(report.entries.every((entry) => entry.numericDelta === undefined));
});

test('complete absence can establish appeared and missing-from-current without inventing zero', () => {
  const appearedPair = paired(
    { state: 'complete', expectedCount: 0, receivedCount: 0 },
    { state: 'complete', expectedCount: 1, receivedCount: 1 },
  );
  add(appearedPair.current, 'appeared', { state: 'observed', value: { type: 'number', value: 7 } });
  const appeared = compareEvidenceSnapshots(appearedPair.baseline.snapshot, appearedPair.current.snapshot);
  assert.equal(appeared.entries[0]?.state, 'appeared');
  assert.equal(appeared.entries[0]?.baselineValue, undefined);
  assert.doesNotMatch(JSON.stringify(appeared), /universal|zero claim/i);

  const missingPair = paired(
    { state: 'complete', expectedCount: 1, receivedCount: 1 },
    { state: 'complete', expectedCount: 0, receivedCount: 0 },
  );
  add(missingPair.baseline, 'missing', { state: 'observed', value: { type: 'number', value: 0 } });
  const missing = compareEvidenceSnapshots(missingPair.baseline.snapshot, missingPair.current.snapshot);
  assert.equal(missing.entries[0]?.state, 'missing_from_current');
  assert.equal(missing.entries[0]?.baselineValue?.state, 'observed');
});

test('partial, unavailable, and failed opposite coverage produce coverage_unknown', () => {
  for (const completeness of [
    { state: 'partial', receivedCount: 0, reason: 'Synthetic partial coverage.' },
    { state: 'unavailable', receivedCount: 0, reason: 'Synthetic unavailable coverage.' },
    { state: 'failed', receivedCount: 0, reason: 'Synthetic failed coverage.' },
  ] as const) {
    const currentOnly = paired(completeness, { state: 'complete', expectedCount: 1, receivedCount: 1 });
    add(currentOnly.current, `current-${completeness.state}`, { state: 'observed', value: { type: 'number', value: 1 } });
    assert.equal(compareEvidenceSnapshots(currentOnly.baseline.snapshot, currentOnly.current.snapshot).entries[0]?.state, 'coverage_unknown');

    const baselineOnly = paired({ state: 'complete', expectedCount: 1, receivedCount: 1 }, completeness);
    add(baselineOnly.baseline, `baseline-${completeness.state}`, { state: 'observed', value: { type: 'number', value: 1 } });
    assert.equal(compareEvidenceSnapshots(baselineOnly.baseline.snapshot, baselineOnly.current.snapshot).entries[0]?.state, 'coverage_unknown');
  }
});

test('duplicate semantic cohort identity in either snapshot fails closed as ambiguous', () => {
  const baselineDuplicate = paired(
    { state: 'complete', expectedCount: 2, receivedCount: 2 },
    { state: 'complete', expectedCount: 0, receivedCount: 0 },
  );
  const first = add(baselineDuplicate.baseline, 'duplicate', { state: 'observed', value: { type: 'number', value: 1 } });
  const second = structuredClone(first);
  second.id = 'synthetic-diff-duplicate-second';
  (baselineDuplicate.baseline.snapshot.observations as Contract<'observation'>[]).push(second);
  expectDiffError(
    () => compareEvidenceSnapshots(baselineDuplicate.baseline.snapshot, baselineDuplicate.current.snapshot),
    'ambiguous_cohort',
  );

  const currentDuplicate = paired(
    { state: 'complete', expectedCount: 0, receivedCount: 0 },
    { state: 'complete', expectedCount: 2, receivedCount: 2 },
  );
  const currentFirst = add(currentDuplicate.current, 'duplicate-current', { state: 'observed', value: { type: 'number', value: 1 } });
  const currentSecond = structuredClone(currentFirst);
  currentSecond.id = 'synthetic-diff-current-duplicate-second';
  (currentDuplicate.current.snapshot.observations as Contract<'observation'>[]).push(currentSecond);
  expectDiffError(
    () => compareEvidenceSnapshots(currentDuplicate.baseline.snapshot, currentDuplicate.current.snapshot),
    'ambiguous_cohort',
  );
});

test('cohort revision and dimensions/configuration changes are unmatched, never weakly correlated', () => {
  const { baseline, current } = paired(
    { state: 'complete', expectedCount: 3, receivedCount: 3 },
    { state: 'complete', expectedCount: 3, receivedCount: 3 },
  );
  const revisionBefore = add(baseline, 'revision', { state: 'observed', value: { type: 'number', value: 1 } });
  const revisionAfter = add(current, 'revision', { state: 'observed', value: { type: 'number', value: 1 } });
  revisionAfter.cohort.revision = revisionBefore.cohort.revision + 1;

  add(baseline, 'dimension', { state: 'observed', value: { type: 'number', value: 1 } });
  const dimensionAfter = add(current, 'dimension', { state: 'observed', value: { type: 'number', value: 1 } });
  dimensionAfter.cohort.context.dimensions.model = 'synthetic-other-model';

  add(baseline, 'configuration', { state: 'observed', value: { type: 'number', value: 1 } });
  const configurationAfter = add(current, 'configuration', { state: 'observed', value: { type: 'number', value: 1 } });
  configurationAfter.cohort.context.dimensions.configuration = { id: 'synthetic-other-configuration', version: '1.0' };

  const report = compareEvidenceSnapshots(baseline.snapshot, current.snapshot);
  assert.equal(report.summary.unchanged, 0);
  assert.equal(report.summary.changed, 0);
  assert.equal(report.summary.appeared, 3);
  assert.equal(report.summary.missingFromCurrent, 3);
});

test('incompatible collection semantics fail as discontinuities before absence classification', () => {
  const mutations: Array<(current: Contract<'collection'>) => void> = [
    (current) => { current.providerId = 'synthetic-other-provider'; },
    (current) => { current.providerConnectionId = 'synthetic-other-connection'; },
    (current) => { delete current.providerConnectionId; },
    (current) => { current.adapter = { id: 'synthetic-other-adapter', version: '2.0' }; },
    (current) => { current.sourceSchema = { id: 'synthetic-other-schema', version: '7.3' }; },
    (current) => { current.method = { ...current.method, configurationRevision: current.method.configurationRevision + 1 }; },
    (current) => { current.scope = { ...current.scope, siteScopeRevisionId: 'synthetic-other-scope-r1' }; },
  ];
  for (const mutate of mutations) {
    const { baseline, current } = paired();
    mutate(current.value.collection);
    expectDiffError(() => compareEvidenceSnapshots(baseline.snapshot, current.snapshot), 'collection_discontinuity');
  }
});

test('same collection ID is rejected and reversed source periods are discontinuous', () => {
  const sameId = paired();
  sameId.current.value.collection.id = sameId.baseline.value.collection.id;
  expectDiffError(() => compareEvidenceSnapshots(sameId.baseline.snapshot, sameId.current.snapshot), 'invalid_request');

  const reversed = paired();
  reversed.baseline.value.collection.sourceTime = { start: '2026-01-01T00:01:00.000Z', end: '2026-01-01T01:01:00.000Z' };
  reversed.current.value.collection.sourceTime = { start: '2026-01-01T00:00:00.000Z', end: '2026-01-01T01:00:00.000Z' };
  expectDiffError(() => compareEvidenceSnapshots(reversed.baseline.snapshot, reversed.current.snapshot), 'collection_discontinuity');
});

test('repository/snapshot observation order cannot affect deterministic report bytes', () => {
  const { baseline, current } = paired(
    { state: 'complete', expectedCount: 3, receivedCount: 3 },
    { state: 'complete', expectedCount: 3, receivedCount: 3 },
  );
  for (const key of ['c', 'a', 'b']) {
    add(baseline, key, { state: 'observed', value: { type: 'number', value: key === 'b' ? 2 : 1 } });
    add(current, key, { state: 'observed', value: { type: 'number', value: key === 'b' ? 3 : 1 } });
  }
  const left = compareEvidenceSnapshots(baseline.snapshot, current.snapshot);
  const right = compareEvidenceSnapshots(
    { ...baseline.snapshot, observations: [...baseline.snapshot.observations].reverse() },
    { ...current.snapshot, observations: [...current.snapshot.observations].reverse() },
  );
  assert.equal(canonicalJson(left), canonicalJson(right));
  assert.deepEqual(left.entries.map((entry) => entry.cohortHash), [...left.entries.map((entry) => entry.cohortHash)].sort());
});

test('per-snapshot bound fails explicitly before truncation', () => {
  const { baseline, current } = paired();
  const template = observation(baseline.value, 'bound', { state: 'observed', value: { type: 'number', value: 1 } });
  const tooMany = Array.from({ length: MAX_DIFF_OBSERVATIONS_PER_SNAPSHOT + 1 }, () => template);
  expectDiffError(
    () => compareEvidenceSnapshots({ collection: baseline.snapshot.collection, observations: tooMany }, current.snapshot),
    'observation_limit_exceeded',
  );
});

test('synthetic WQT-style and ZeroRank-style two-cycle proofs reduce review to non-unchanged evidence without cross-correlation', () => {
  const wqt = paired(
    { state: 'complete', expectedCount: 4, receivedCount: 4 },
    { state: 'complete', expectedCount: 4, receivedCount: 4 },
  );
  wqt.baseline.value.collection.providerId = 'siteone';
  wqt.current.value.collection.providerId = 'siteone';
  wqt.baseline.value.collection.providerConnectionId = 'synthetic-wqt-connection';
  wqt.current.value.collection.providerConnectionId = 'synthetic-wqt-connection';
  for (const holder of [wqt.baseline, wqt.current]) {
    holder.value.collection.adapter = { id: 'ldw-wqt-normalized', version: '1.0.0' };
    holder.value.collection.sourceSchema = { id: 'ldw.website-quality', version: 'v1.1' };
    holder.value.collection.method = { id: 'ldw-wqt-siteone', version: '1.0.0', configurationId: 'wqt-siteone-normalized-v1', configurationRevision: 1 };
  }
  add(wqt.baseline, 'wqt-zero', { state: 'observed', value: { type: 'number', value: 0 } });
  add(wqt.current, 'wqt-zero', { state: 'observed', value: { type: 'number', value: 0 } });
  add(wqt.baseline, 'wqt-changed', { state: 'observed', value: { type: 'number', value: 2 } });
  add(wqt.current, 'wqt-changed', { state: 'observed', value: { type: 'number', value: 3 } });
  add(wqt.baseline, 'wqt-state', { state: 'observed', value: { type: 'text', value: 'synthetic-ok' } }, 'text');
  add(wqt.current, 'wqt-state', { state: 'unknown', reason: 'Synthetic WQT source state missing.' }, 'text');
  add(wqt.baseline, 'wqt-missing', { state: 'observed', value: { type: 'number', value: 1 } });
  add(wqt.current, 'wqt-appeared', { state: 'observed', value: { type: 'number', value: 1 } });
  const wqtReport = compareEvidenceSnapshots(wqt.baseline.snapshot, wqt.current.snapshot);
  assert.deepEqual(wqtReport.summary, {
    total: 5, unchanged: 1, changed: 2, appeared: 1,
    missingFromCurrent: 1, coverageUnknown: 0, attentionCount: 4,
  });

  const zeroRank = paired(
    { state: 'partial', receivedCount: 2, reason: 'Synthetic ZeroRank baseline partial.' },
    { state: 'partial', receivedCount: 2, reason: 'Synthetic ZeroRank current partial.' },
  );
  zeroRank.baseline.value.collection.providerId = 'zerorank';
  zeroRank.current.value.collection.providerId = 'zerorank';
  zeroRank.baseline.value.collection.providerConnectionId = 'synthetic-zerorank-connection';
  zeroRank.current.value.collection.providerConnectionId = 'synthetic-zerorank-connection';
  for (const holder of [zeroRank.baseline, zeroRank.current]) {
    holder.value.collection.adapter = { id: 'ldw-zerorank-sanitized', version: '1.0.0' };
    holder.value.collection.sourceSchema = { id: 'ldw.zerorank-evidence', version: 'v1.0' };
    holder.value.collection.method = { id: 'ldw-zerorank-prompts', version: '1.0.0', configurationId: 'zerorank-prompts-artifact-v1', configurationRevision: 1 };
  }
  add(zeroRank.baseline, 'zr-text', { state: 'observed', value: { type: 'text', value: 'synthetic-active' } }, 'text');
  add(zeroRank.current, 'zr-text', { state: 'observed', value: { type: 'text', value: 'synthetic-active' } }, 'text');
  add(zeroRank.baseline, 'zr-state', { state: 'unknown', reason: 'Synthetic ZeroRank unknown.' });
  add(zeroRank.current, 'zr-state', { state: 'observed', value: { type: 'number', value: 4 } });
  add(zeroRank.baseline, 'zr-baseline-only', { state: 'observed', value: { type: 'number', value: 1 } });
  add(zeroRank.current, 'zr-current-only', { state: 'observed', value: { type: 'number', value: 1 } });
  const zrReport = compareEvidenceSnapshots(zeroRank.baseline.snapshot, zeroRank.current.snapshot);
  assert.deepEqual(zrReport.summary, {
    total: 4, unchanged: 1, changed: 1, appeared: 0,
    missingFromCurrent: 0, coverageUnknown: 2, attentionCount: 3,
  });

  assert.deepEqual({
    total: wqtReport.summary.total + zrReport.summary.total,
    unchanged: wqtReport.summary.unchanged + zrReport.summary.unchanged,
    attention: wqtReport.summary.attentionCount + zrReport.summary.attentionCount,
  }, { total: 9, unchanged: 2, attention: 7 });
});
