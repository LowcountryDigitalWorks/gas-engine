import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync('src/operator/workspace-html.ts', 'utf8');
const css = source.split('<style>')[1]?.split('</style>')[0];
assert.ok(css, 'Accepted operator workspace must keep its self-contained CSS');

test('Tidal glass candidate retains canonical brand and opaque evidence surfaces', () => {
  assert.match(css!, /--tidal-navy:#102a3a/);
  assert.match(css!, /--tidal-teal:#2f766f/);
  assert.match(css!, /--tidal-oyster:#f3efe6/);
  assert.match(css!, /--tidal-paper:#f7f8f6/);
  assert.match(css!, /font-family:"Manrope",system-ui/);
  assert.match(css!, /nav button\[aria-pressed="true"\]/);
  assert.match(css!, /min-height:44px/);
  assert.match(css!, /\.card,\.notice,\.form-card,\.filters,\.check-row,\.facts div\{\s*background:#fff/);
  assert.match(css!, /\.table-wrap\{overflow-x:auto\}/);
});

test('glass is progressive enhancement with solid, motion and contrast fallbacks', () => {
  assert.match(css!, /@supports \(\(-webkit-backdrop-filter:blur\(1px\)\) or \(backdrop-filter:blur\(1px\)\)\)/);
  assert.match(css!, /@media \(prefers-reduced-transparency:reduce\)/);
  assert.match(css!, /@media \(prefers-contrast:more\)/);
  assert.match(css!, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css!, /-webkit-backdrop-filter:none;backdrop-filter:none/);
  assert.match(css!, /nav button\{transition:none\}/);
  assert.match(css!, /@media print/);
});

test('presentation-only candidate cannot introduce new network or active code paths', () => {
  assert.doesNotMatch(css!, /@import\b|url\s*\(|https?:\/\/|javascript:|expression\s*\(/i);
  assert.match(source, /connect-src 'none'/);
  assert.match(source, /form-action 'none'/);
  assert.match(source, /default-src 'none'/);
  assert.doesNotMatch(source, /<iframe\b|<img\b/i);
});
