import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import * as sqliteModule from '../../src/persistence/sqlite.js';
import * as migrationsModule from '../../src/persistence/migrations.js';
import * as tenantContextModule from '../../src/persistence/tenant-context.js';
import { requireTenantContext, type TenantContext } from '../../src/persistence/tenant-context.js';
import { createTestTenantContext } from '../support/tenant-authority.js';

const issuerModule = 'src/internal/tenant-authority.ts';
const issuerSeam = 'src/persistence/tenant-context.ts';

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? productionFiles(path) : [path];
  });
}

test('only the internal authority module can issue tenant authority; no production module re-exports it', () => {
  const files = productionFiles('src').map((path) => [path.replaceAll('\\', '/'), readFileSync(path, 'utf8')] as const);
  assert.ok(files.some(([path]) => path === issuerModule), 'The internal authority module must exist');
  for (const [path, content] of files) {
    if (path !== issuerModule) {
      assert.doesNotMatch(content, /issueTenantContext/, `${path}: production code cannot mint tenant authority`);
      assert.doesNotMatch(content, /createTrustedTestTenantContext|createTestTenantContext/, `${path}: test authority must not live in production code`);
    }
    if (path !== issuerModule && path !== issuerSeam) {
      assert.doesNotMatch(content, /internal[\\/]tenant-authority/, `${path}: only the storage authority seam may import the issuer`);
    }
  }
});

test('the production persistence surface exposes validation only and cannot mint an accepted context', () => {
  assert.deepEqual(Object.keys(tenantContextModule).sort(), ['requireTenantContext']);
  const surface = { ...tenantContextModule, ...sqliteModule, ...migrationsModule } as Record<string, unknown>;
  for (const [name, exported] of Object.entries(surface)) {
    if (typeof exported !== 'function') continue;
    for (const argument of ['tenant-alpha', undefined]) {
      let minted: unknown;
      try { minted = (exported as (value?: unknown) => unknown)(argument); } catch { continue; }
      assert.throws(() => requireTenantContext(minted as TenantContext), /trusted TenantContext/,
        `${name} must not return usable tenant authority`);
    }
  }
});

test('the TEST authority path mints a usable context that casts, clones and proxies still cannot forge', () => {
  const context = createTestTenantContext('tenant-alpha');
  assert.equal(requireTenantContext(context), 'tenant-alpha');
  for (const forged of [
    {} as TenantContext, { ...context }, new Proxy(context, {}), Object.create(context) as TenantContext,
    structuredClone({}) as TenantContext, JSON.parse(JSON.stringify({})) as TenantContext,
  ]) assert.throws(() => requireTenantContext(forged), /trusted TenantContext/);
  assert.throws(() => createTestTenantContext('../tenant-alpha'));
  assert.notEqual(requireTenantContext(createTestTenantContext('tenant-beta')), 'tenant-alpha');
});
