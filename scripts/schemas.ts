import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { wireSchemas } from '../src/contracts/wire.js';

// Stable registry order and Zod's deterministic exporter; no time/build metadata.
// These artifacts describe portable wire validation, not cross-field/domain checks.
const check = process.argv.slice(2);
if (check.length > 1 || (check.length === 1 && check[0] !== '--check')) {
  throw new Error('Usage: schemas.js [--check]');
}
const directory = resolve('schemas');
const expected = Object.keys(wireSchemas).map((name) => `${name}.schema.json`).sort();
if (check.length === 0) await mkdir(directory, { recursive: true });
const existing = (await readdir(directory)).filter((name) => name.endsWith('.schema.json')).sort();
if (existing.some((name) => !expected.includes(name))) throw new Error('Unexpected schema artifact: remove obsolete generated schemas intentionally');
for (const [name, schema] of Object.entries(wireSchemas)) {
  const output = z.toJSONSchema(schema, { target: 'draft-2020-12', io: 'input' });
  const artifact = {
    ...output,
    $id: `urn:ldw:gas:wire:${name}:1.0`,
    title: `G.A.S. ${name} wire contract 1.0`,
    $comment: 'Generated from src/contracts/wire.ts. Also apply parseContract cross-field checks, UTF-16 code-unit text limits, well-formed Unicode and the 64 KiB canonical-input limit; JSON Schema alone does not prove domain validity or authorization. See docs/contracts.md.',
  };
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  const path = resolve(directory, `${name}.schema.json`);
  if (check.length === 1) {
    if (await readFile(path, 'utf8') !== text) throw new Error(`Schema drift: ${name}; run npm run schemas:generate`);
  } else await writeFile(path, text, 'utf8');
}
console.log(`${check.length ? 'Checked' : 'Generated'} ${expected.length} wire schemas.`);
