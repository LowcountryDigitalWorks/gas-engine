import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Cloudflare gate stays read-only, local-only and framework-free', () => {
  const worker = readFileSync('src/cloudflare/worker.ts', 'utf8');
  const d1 = readFileSync('src/cloudflare/d1-read.ts', 'utf8');
  const gate = readFileSync('scripts/cloudflare-gate.ts', 'utf8');
  const config = readFileSync('wrangler.gate.jsonc', 'utf8');
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    version: string;
    private: boolean;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  assert.equal(packageJson.version, '0.9.0');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.devDependencies['wrangler'], '4.134.0');
  for (const forbidden of ['hono', 'vite', 'vitest', 'react', 'vue', 'svelte', 'drizzle-orm', 'prisma']) {
    assert.equal(packageJson.dependencies[forbidden], undefined);
    assert.equal(packageJson.devDependencies[forbidden], undefined);
  }

  assert.doesNotMatch(d1, /\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER)\s+/i);
  assert.doesNotMatch(d1, /persist(?:Collection|Measurement|Outcome)|createRecommendation|appendRecommendationRevision/);
  assert.doesNotMatch(worker + d1, /node:https|node:http|undici|axios|activepieces|WebSocket|XMLHttpRequest/i);
  assert.doesNotMatch(worker + d1, /\b(?:OpenAI|Anthropic|BYOK|Workers AI)\b/i);
  assert.doesNotMatch(worker, /Cf-Access-Authenticated-User-Email|Cf-Access-Jwt-Assertion/i);
  assert.match(worker, /context\.access\.getIdentity\(\)/);
  assert.match(worker, /issueAuthenticatedPrincipal/);
  assert.match(worker, /authenticatedAuthority/);

  assert.doesNotMatch(gate, /wrangler\s+(?:deploy|publish)|['"]deploy['"]|--remote|d1\s+create|pages\s+deploy/i);
  assert.match(gate, /'--local'/);
  assert.match(gate, /WRANGLER_SEND_METRICS/);
  assert.match(config, /"database_id": "00000000-0000-0000-0000-000000000001"/);
  assert.doesNotMatch(config, /"(?:assets|pages|r2|kv_namespaces|queues|durable_objects|ai|analytics_engine)"\s*:/i);
});

test('operator read boundaries expose only the accepted Release 0.9 read capabilities', () => {
  const source = readFileSync('src/operator/read-repositories.ts', 'utf8');
  assert.match(source, /OperatorEvidenceReadRepository[\s\S]*?'getCollectionSnapshot' \| 'getObservation'/);
  assert.match(source, /OperatorReviewReadRepository[\s\S]*?'getCurrentRecommendation'[\s\S]*?'listOutcomes'/);
  assert.doesNotMatch(source, /persistCollection|deleteCollection|persistMeasurement|persistOutcome|createRecommendation|appendRecommendationRevision/);
});

test('accepted storage schema is reused rather than replaced by a cloud migration', () => {
  const migration = readFileSync('src/persistence/migrations.ts', 'utf8');
  assert.match(migration, /ACCEPTED_STORAGE_SCHEMA/);
  assert.match(migration, /version: 2 as const/);
  assert.doesNotMatch(migration, /migration3|version: 3 as const/i);
});
