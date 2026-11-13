import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync('src/operator/workspace-html.ts', 'utf8');
const css = source.split('<style>')[1]?.split('</style>')[0];
assert.ok(css, 'Operator workspace must retain its self-contained CSS');

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((offset) => {
    const v = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

test('G.A.S. has a distinctive dark-first spectral theme and optional light appearance', () => {
  assert.match(source, /<html lang="en" data-theme="dark">/);
  assert.match(css!, /:root\{\s*color-scheme:dark;/);
  assert.match(css!, /html\[data-theme="light"\]\{\s*color-scheme:light;/);
  assert.match(css!, /--gas-accent:#a59bff/);
  assert.match(css!, /--gas-bg:#0b101b/);
  assert.match(css!, /--gas-surface:#162235/);
  assert.match(css!, /--gas-ink:#f1f5fb/);
  assert.match(css!, /--gas-link:#4838ad/);
  assert.match(css!, /font-family:"Manrope",system-ui/);
  assert.doesNotMatch(css!, /--tidal-(?:navy|teal|oyster|paper)/);
  assert.match(source, /G\.A\.S\. <span class="gas-product-subtitle">Signal Intelligence<\/span>/);
});

test('the light-mode switch is a real accessible presentation-only interaction', () => {
  assert.match(source, /role="switch" id="theme-toggle" aria-label="Light mode" aria-checked="false"/);
  assert.match(source, /const mode=qs\('#theme-toggle'\)/);
  assert.match(source, /mode\.addEventListener\('click'/);
  assert.match(source, /document\.documentElement\.dataset\.theme=light\?'light':'dark'/);
  assert.match(source, /mode\.setAttribute\('aria-checked',String\(light\)\)/);
  assert.match(source, /mode\.textContent=light\?'Light mode: on':'Light mode: off'/);
  assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|indexedDB)\b/i);
  assert.match(source, /script-src 'sha256-\$\{scriptHash\}'/);
});

test('both product palettes keep readable solid text surfaces above WCAG AA contrast', () => {
  const pairs = [
    ['#f1f5fb', '#0b101b'], ['#b4c3d9', '#162235'],
    ['#f1f5fb', '#162235'], ['#0a1020', '#a59bff'],
    ['#17213b', '#ffffff'], ['#3d4c69', '#ffffff'],
    ['#ffffff', '#5146be'], ['#17213b', '#e4e8f7'],
  ];
  for (const [ink, background] of pairs) {
    assert.ok(contrast(ink!, background!) >= 4.5, ink + ' on ' + background + ' must meet AA');
  }
  assert.match(css!, /--gas-surface:#162235/);
  assert.match(css!, /--gas-surface:#ffffff/);
  assert.match(css!, /background:var\(--gas-surface\)/);
  assert.match(css!, /background:var\(--gas-raised\)/);
});

test('glass and mobile navigation degrade safely without changing evidence tables', () => {
  assert.match(css!, /@supports \(\(-webkit-backdrop-filter:blur\(1px\)\) or \(backdrop-filter:blur\(1px\)\)\)/);
  assert.match(css!, /@media \(prefers-reduced-transparency:reduce\)/);
  assert.match(css!, /@media \(prefers-contrast:more\)/);
  assert.match(css!, /@media \(prefers-reduced-motion:reduce\)/);
  assert.match(css!, /-webkit-backdrop-filter:none;backdrop-filter:none/);
  assert.match(css!, /\.shell\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css!, /aside\{position:static;height:auto;min-width:0;width:100%;max-width:100%/);
  assert.match(css!, /nav\{display:flex;min-width:0;width:100%;max-width:100%;overflow-x:auto/);
  assert.match(css!, /\.cards\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/);
  assert.match(css!, /\.card\{min-width:0;overflow-wrap:anywhere\}/);
  assert.doesNotMatch(css!, /(?:html|body)\s*\{[^}]*overflow-x:\s*hidden/);
  assert.match(css!, /\.table-wrap\{overflow-x:auto/);
  assert.match(css!, /\[data-panel\]\[hidden\]\{display:none\}/);
  assert.match(css!, /min-height:44px/);
  assert.match(css!, /@media print/);
});

test('visible control outlines meet WCAG non-text 3:1 in both dark and light modes', () => {
  const boundaries = [
    ['#738aaa', '#162235'], // dark card
    ['#738aaa', '#1d2b41'], // dark field fill
    ['#63718a', '#ffffff'], // light card
    ['#63718a', '#f5f7fd'], // light field fill
  ];
  for (const [border, adjacent] of boundaries) {
    assert.ok(contrast(border!, adjacent!) >= 3,
      border + ' against ' + adjacent + ' must meet non-text 3:1');
  }
  assert.match(css!, /--gas-control-border:#738aaa/);
  assert.match(css!, /--gas-control-border:#63718a/);
  assert.match(css!, /border:1px solid var\(--gas-control-border\)/);
});

test('theme candidate remains offline with no external assets or new data authority', () => {
  assert.doesNotMatch(css!, /@import\b|url\s*\(|https?:\/\/|javascript:|expression\s*\(/i);
  assert.match(source, /connect-src 'none'/);
  assert.match(source, /form-action 'none'/);
  assert.match(source, /default-src 'none'/);
  assert.match(source, /font-src 'none'/);
  assert.doesNotMatch(source, /<iframe\b|<img\b/i);
});
