import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';
import type { Contract, ContractName } from '../../src/contracts/wire.js';
import {
  cohortIdentityHash, ContractInvariantError, DOMAIN_INVARIANT_COVERAGE, parseContract,
} from '../../src/domain/validate.js';
import { hashCanonicalJson } from '../../src/lib/canonical-json.js';

interface SyntheticCorpus {
  records: Record<string, { contract: ContractName; data: unknown }>;
}

const corpus = JSON.parse(readFileSync('fixtures/synthetic/contracts.json', 'utf8')) as SyntheticCorpus;

function fixture<N extends ContractName>(contract: N, name: string): Contract<N> {
  const record = corpus.records[name];
  assert.ok(record, `Missing synthetic fixture ${name}`);
  assert.equal(record.contract, contract);
  return parseContract(contract, structuredClone(record.data));
}

test('cohort identity hashes semantic cohort material, not wire-envelope metadata', () => {
  const cohort = fixture('cohort', 'cohortAlpha');
  const semanticMaterial = {
    algorithm: 'gas-cohort-identity-v1',
    cohort: { id: cohort.id, revision: cohort.revision, context: cohort.context },
  };
  assert.equal(cohortIdentityHash(cohort), hashCanonicalJson(semanticMaterial));
  assert.notEqual(cohortIdentityHash(cohort), hashCanonicalJson({ algorithm: 'gas-cohort-identity-v1', cohort }));

  for (const changed of [
    { ...cohort, id: 'synthetic-cohort-other' },
    { ...cohort, revision: cohort.revision + 1 },
    { ...cohort, context: { ...cohort.context, scope: { ...cohort.context.scope, siteScopeRevisionId: 'synthetic-scope-alpha-r2' } } },
    { ...cohort, context: { ...cohort.context, method: { ...cohort.context.method, version: '2.0' } } },
  ]) assert.notEqual(cohortIdentityHash(cohort), cohortIdentityHash(changed));

  assert.throws(() => cohortIdentityHash({ ...cohort, schemaVersion: '2.0' }));
  assert.throws(() => cohortIdentityHash({ ...cohort, kind: 'future_cohort' }));
});

test('measurement due, observed, and creation timestamps obey the declared temporal policy', () => {
  const measured = fixture('measurement', 'measurementBaseline');
  assert.equal(measured.result.state, 'measured');
  if (measured.result.state !== 'measured') assert.fail('Expected measured fixture.');
  const measuredResult = measured.result;

  assert.doesNotThrow(() => parseContract('measurement', {
    ...measured,
    createdAt: measuredResult.observedWindow.end,
  }));

  assert.throws(() => parseContract('measurement', {
    ...measured,
    result: {
      ...measuredResult,
      observedWindow: { start: '2025-12-31T23:00:00.000Z', end: '2026-01-01T00:00:00.000Z' },
    },
  }), ContractInvariantError);
  assert.throws(() => parseContract('measurement', {
    ...measured,
    result: {
      ...measuredResult,
      observedWindow: { start: '2026-01-01T01:00:00.000Z', end: '2026-01-01T02:00:00.000Z' },
    },
    createdAt: '2026-01-01T02:07:00.000Z',
  }), ContractInvariantError);
  assert.throws(() => parseContract('measurement', {
    ...measured,
    createdAt: '2026-01-01T00:59:59.999Z',
  }), ContractInvariantError);

  const pendingReason = 'Synthetic temporal-policy boundary case.';
  const notDue = { ...measured, result: { state: 'not_due', reason: pendingReason } };
  assert.doesNotThrow(() => parseContract('measurement', {
    ...notDue,
    createdAt: '2025-12-31T23:59:59.999Z',
  }));
  assert.throws(() => parseContract('measurement', {
    ...notDue,
    createdAt: measured.dueWindow.start,
  }), ContractInvariantError);
  assert.throws(() => parseContract('measurement', {
    ...notDue,
    createdAt: '2026-01-01T00:30:00.000Z',
  }), ContractInvariantError);

  const notMeasured = { ...measured, result: { state: 'not_measured', reason: pendingReason } };
  assert.throws(() => parseContract('measurement', {
    ...notMeasured,
    createdAt: '2025-12-31T23:59:59.999Z',
  }), ContractInvariantError);
  assert.doesNotThrow(() => parseContract('measurement', {
    ...notMeasured,
    createdAt: measured.dueWindow.start,
  }));
  assert.doesNotThrow(() => parseContract('measurement', {
    ...notMeasured,
    createdAt: '2026-01-01T00:30:00.000Z',
  }));
  assert.doesNotThrow(() => parseContract('measurement', {
    ...notMeasured,
    createdAt: '2026-01-01T01:07:00.000Z',
  }));
});

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isScopeSchema(value: unknown): boolean {
  if (!isObject(value) || !isObject(value['properties']) || !Array.isArray(value['required'])) return false;
  const properties = value['properties'];
  const required = new Set(value['required'].filter((item): item is string => typeof item === 'string'));
  return ['tenantId', 'siteId', 'siteScopeRevisionId'].every((name) => name in properties && required.has(name));
}

function isTimeWindowSchema(value: unknown): boolean {
  if (!isObject(value) || !isObject(value['properties']) || !Array.isArray(value['required'])) return false;
  const properties = value['properties'];
  const required = new Set(value['required'].filter((item): item is string => typeof item === 'string'));
  return ['start', 'end'].every((name) => {
    const field = properties[name];
    return required.has(name) && isObject(field) && field['format'] === 'date-time';
  });
}

function hasConnectedChronology(fields: readonly string[]): boolean {
  if (fields.length < 2) return true;
  const fieldSet = new Set(fields);
  const visited = new Set<string>([fields[0]!]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [left, right] of DOMAIN_INVARIANT_COVERAGE.orderedTimestampPairs) {
      if (!fieldSet.has(left) || !fieldSet.has(right)) continue;
      if (visited.has(left) && !visited.has(right)) {
        visited.add(right);
        changed = true;
      }
      if (visited.has(right) && !visited.has(left)) {
        visited.add(left);
        changed = true;
      }
    }
  }
  return visited.size === fieldSet.size;
}

test('generated schemas prove timestamp, time-window, and embedded-scope invariant coverage', () => {
  const schemaFiles = readdirSync('schemas').filter((name) => name.endsWith('.schema.json')).sort();
  assert.equal(schemaFiles.length, 11);

  const timestampNames = new Set<string>();
  const timeWindowPropertyNames = new Set<string>();
  const scopePropertyNames = new Set<string>();
  const multiTimestampObjects: string[][] = [];

  function visit(node: unknown): void {
    if (!isObject(node)) return;

    if (isObject(node['properties'])) {
      const directTimestamps: string[] = [];
      for (const [name, child] of Object.entries(node['properties'])) {
        if (isObject(child) && child['format'] === 'date-time') {
          timestampNames.add(name);
          directTimestamps.push(name);
        }
        if (isTimeWindowSchema(child)) timeWindowPropertyNames.add(name);
        if (isScopeSchema(child)) scopePropertyNames.add(name);
        visit(child);
      }
      if (directTimestamps.length > 1) multiTimestampObjects.push(directTimestamps.sort());
    }

    for (const keyword of ['oneOf', 'anyOf', 'allOf', 'prefixItems']) {
      const children = node[keyword];
      if (Array.isArray(children)) children.forEach(visit);
    }
    visit(node['items']);
    if (isObject(node['$defs'])) Object.values(node['$defs']).forEach(visit);
  }

  for (const filename of schemaFiles) {
    visit(JSON.parse(readFileSync(`schemas/${filename}`, 'utf8')) as unknown);
  }

  assert.deepEqual(
    [...timestampNames].sort(),
    [...DOMAIN_INVARIANT_COVERAGE.timestampProperties].sort(),
    'A new or renamed date-time field must be deliberately added to domain invariant coverage.',
  );
  assert.deepEqual(
    [...timeWindowPropertyNames].sort(),
    [...DOMAIN_INVARIANT_COVERAGE.timeWindowProperties].sort(),
    'A new or renamed start/end time-window property must be deliberately reconciled with domain invariants.',
  );
  assert.deepEqual(
    [...scopePropertyNames].sort(),
    [...DOMAIN_INVARIANT_COVERAGE.embeddedScopeProperties].sort(),
    'A structurally scope-bearing field must use a property covered by recursive scope validation.',
  );
  for (const fields of multiTimestampObjects) {
    assert.ok(
      hasConnectedChronology(fields),
      `Object with date-time fields ${fields.join(', ')} lacks a complete declared chronology chain.`,
    );
  }
});
