import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseContract } from '../../src/domain/validate.js';

const corpus = JSON.parse(readFileSync('fixtures/synthetic/contracts.json', 'utf8')) as {
  records: Record<string, { data: unknown }>;
};

test('actual observation and measurement windows must match the declared cohort duration', () => {
  const observation = parseContract('observation', corpus.records['observationZero']!.data);
  observation.provenance.sourceTime.start = '2025-12-31T01:00:00.000Z';
  assert.throws(() => parseContract('observation', observation), /window duration/);
  const measurement = parseContract('measurement', corpus.records['measurementFollowUp']!.data);
  assert.equal(measurement.result.state, 'measured');
  if (measurement.result.state !== 'measured') assert.fail('Expected measured fixture');
  measurement.result.observedWindow.end = '2026-01-02T00:30:00.000Z';
  assert.throws(() => parseContract('measurement', measurement), /window duration/);
});

test('point observations explicitly declare zero-duration windows; interval rules require positive duration', () => {
  const observation = parseContract('observation', corpus.records['observationZero']!.data);
  observation.cohort.context.timeWindowRules.alignment = 'point';
  observation.cohort.context.timeWindowRules.durationSeconds = 0;
  observation.provenance.sourceTime.start = observation.provenance.sourceTime.end;
  assert.doesNotThrow(() => parseContract('observation', observation));
  observation.cohort.context.timeWindowRules.alignment = 'rolling';
  assert.throws(() => parseContract('observation', observation), /alignment and duration/);
});
