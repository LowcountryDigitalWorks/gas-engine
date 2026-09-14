import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { z } from 'zod';
import { wireSchemas } from '../../src/contracts/wire.js';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

test('production surface uses only local modules, Zod, crypto and util; no provider/network/server/persistence imports', () => {
  for (const path of sourceFiles('src')) {
    const content = readFileSync(path, 'utf8');
    assert.match(path, /\.ts$/);
    for (const match of content.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      const specifier = match[1]!;
      assert.ok(specifier.startsWith('.') || ['zod', 'node:crypto', 'node:util'].includes(specifier), `${path}: unexpected import ${specifier}`);
    }
    assert.doesNotMatch(content, /\b(?:fetch|WebSocket|XMLHttpRequest|require)\s*\(|\bimport\s*\(/, `${path}: dynamic/network capability`);
  }
});

test('all public wire schemas export with strict unknown-field and version constraints', () => {
  const entries = Object.entries(wireSchemas);
  assert.equal(entries.length, 11);
  for (const [name, schema] of entries) {
    const exported = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
    // Native export must not fall back to permissive {} for unsupported schemas.
    assert.ok(Object.keys(exported).length > 1);
    if (name !== 'observationValue') {
      assert.equal(exported.additionalProperties, false, name);
      const properties = exported.properties as Record<string, { const?: unknown }>;
      assert.equal(properties['schemaVersion']?.const, '1.0', name);
    }
    const artifact = JSON.parse(readFileSync(join('schemas', `${name}.schema.json`), 'utf8')) as Record<string, unknown>;
    assert.equal(artifact['$id'], `urn:ldw:gas:wire:${name}:1.0`);
    assert.match(artifact['$comment'] as string, /cross-field checks/);
  }
});

test('fixtures are explicitly synthetic with only the approved fictitious tenant/site/provider identities', () => {
  const text = readFileSync('fixtures/synthetic/contracts.json', 'utf8');
  const fixture = JSON.parse(text) as { synthetic: boolean; records: Record<string, unknown> };
  assert.equal(fixture.synthetic, true);
  assert.equal(Object.keys(fixture.records).length, 28);
  assert.doesNotMatch(text, /https?:\/\/|mailto:|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|github_pat_|gh[pousr]_[A-Za-z0-9]+|-----BEGIN.*PRIVATE KEY/);
  let scopes = 0;
  function inspect(value: unknown): void {
    if (Array.isArray(value)) return value.forEach(inspect);
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'tenantId') {
        assert.ok(child === 'tenant-alpha' || child === 'tenant-beta');
        scopes += 1;
      }
      if (key === 'siteId') assert.ok(child === 'site-alpha' || child === 'site-beta');
      if (key === 'providerId' || key === 'providerConnectionId' || key === 'sourceRecordId') assert.match(child as string, /^synthetic-/);
      inspect(child);
    }
  }
  inspect(fixture.records);
  assert.ok(scopes > 0);
});
