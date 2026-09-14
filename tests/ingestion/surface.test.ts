import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { synthetic } from './helpers.js';

function sources(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sources(join(path, entry.name)) : [join(path, entry.name)]);
}
test('issuance and ingestion imports respect the authentication/application/transport boundary', () => {
  for (const path of sources('src')) {
    const text = readFileSync(path, 'utf8');
    const normalized = path.replaceAll('\\', '/');
    if (text.includes('internal/tenant-authority')) assert.ok(['src/authentication/principal.ts', 'src/persistence/tenant-context.ts'].includes(normalized), path);
    if (normalized.startsWith('src/ingestion/')) {
      assert.doesNotMatch(text, /issueAuthenticatedPrincipal|issueTenantContext|createTrustedTestTenantContext|createTestTenantContext|LocalEvidenceRepository|node:sqlite|\.listen\s*\(|console\./);
    }
    if (normalized === 'src/ingestion/http.ts') assert.doesNotMatch(text, /from ['"].*persistence/);
    if (normalized === 'src/ingestion/service.ts') assert.doesNotMatch(text, /\b(?:Request|Response|Headers)\b/);
    for (const value of [synthetic.alphaCredential, synthetic.betaCredential, synthetic.unknownCredential, synthetic.opaqueCredential]) assert.ok(!text.includes(value), path);
  }
  assert.equal(synthetic.synthetic, true);
  for (const value of [synthetic.alphaCredential, synthetic.betaCredential, synthetic.unknownCredential, synthetic.opaqueCredential]) assert.match(value, /^SYNTHETIC-NOT-A-SECRET/);
});
