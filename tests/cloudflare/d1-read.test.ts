import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { Contract } from '../../src/contracts/wire.js';
import { parseContract } from '../../src/domain/validate.js';
import { canonicalJson, hashCanonicalJson } from '../../src/lib/canonical-json.js';
import {
  createD1OperatorReadRepositories,
  type GateD1Database,
  type GateD1PreparedStatement,
  type GateD1Result,
  type GateD1Value,
} from '../../src/cloudflare/d1-read.js';
import type { RecommendationEvidenceReviewRepository } from '../../src/operator/read-repositories.js';
import { getRecommendationEvidence } from '../../src/review/service.js';
import { createTestTenantContext } from '../support/tenant-authority.js';

type Row = Record<string, unknown>;

const corpus = JSON.parse(readFileSync('fixtures/synthetic/contracts.json', 'utf8')) as {
  records: Record<string, { data: unknown }>;
};

const observation = parseContract('observation', corpus.records['observationZero']!.data);
const alpha = createTestTenantContext('tenant-alpha');

function validObservationRow(): Row {
  const raw = canonicalJson(observation);
  return {
    tenant_id: observation.cohort.context.scope.tenantId,
    id: observation.id,
    source_id: 'synthetic-source-row',
    collection_id: observation.provenance.runId,
    site_id: observation.cohort.context.scope.siteId,
    scope_revision_id: observation.cohort.context.scope.siteScopeRevisionId,
    connection_id: observation.provenance.source.providerConnectionId,
    provider_id: observation.provenance.source.providerId,
    contract_version: observation.schemaVersion,
    payload: raw,
    payload_hash: hashCanonicalJson(observation),
  };
}

class FakeStatement implements GateD1PreparedStatement {
  constructor(private readonly row: Row) {}

  bind(..._values: GateD1Value[]): GateD1PreparedStatement {
    return this;
  }

  async all<RowType extends Row>(): Promise<GateD1Result<RowType>> {
    return {
      success: true,
      results: [structuredClone(this.row) as RowType],
      meta: { rows_read: 1, rows_written: 0, size_after: 1024 },
    };
  }
}

class FakeD1Database implements GateD1Database {
  constructor(private readonly row: Row) {}

  prepare(sql: string): GateD1PreparedStatement {
    assert.match(sql, /SELECT \* FROM observations WHERE tenant_id = \? AND id = \? LIMIT 1/);
    return new FakeStatement(this.row);
  }
}

function evidenceFor(row: Row) {
  return createD1OperatorReadRepositories(new FakeD1Database(row)).evidence;
}

test('standalone D1 getObservation accepts a valid canonical persisted observation row', async () => {
  const resolved = await evidenceFor(validObservationRow()).getObservation(alpha, observation.id);
  assert.deepEqual(resolved, observation);
});

for (const [field, value] of [
  ['collection_id', 'synthetic-other-run'],
  ['provider_id', 'synthetic-other-provider'],
  ['connection_id', 'synthetic-other-connection'],
] as const) {
  test(`standalone D1 getObservation rejects persisted ${field} mismatch independently of canonical payload/hash`, async () => {
    const row = validObservationRow();
    row[field] = value;
    await assert.rejects(
      evidenceFor(row).getObservation(alpha, observation.id),
      /Persisted D1 observation provenance index mismatch/,
    );
  });
}

test('recommendation evidence resolution still succeeds through corrected standalone D1 observation read', async () => {
  const owner = observation.cohort.context.scope;
  const recommendation: Contract<'recommendation'> = {
    schemaVersion: '1.0',
    kind: 'recommendation',
    id: 'synthetic-gate-r1-recommendation',
    scope: structuredClone(owner),
    evidence: [{ scope: structuredClone(owner), kind: 'observation', id: observation.id }],
    rationale: 'Synthetic R1 parity proof recommendation.',
    priority: { level: 'unassessed', basis: 'Synthetic test assigns no priority.' },
    authorityClass: 'internal_review',
    lifecycle: 'accepted',
    revision: 1,
    createdAt: '2026-01-01T03:00:00.000Z',
    updatedAt: '2026-01-01T03:00:00.000Z',
  };
  const review: RecommendationEvidenceReviewRepository = {
    async getCurrentRecommendation() {
      return recommendation;
    },
    async getRecommendationRevision() {
      return recommendation;
    },
  };

  const resolved = await getRecommendationEvidence(
    review,
    evidenceFor(validObservationRow()),
    alpha,
    owner,
    recommendation.id,
  );

  assert.deepEqual(resolved, [observation]);
});
