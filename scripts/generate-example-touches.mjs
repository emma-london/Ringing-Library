#!/usr/bin/env node
// Regenerates docs/example-touches.md from the truth-fixture corpus
// (src/tests/fixtures/known-touches.json), per ADR-0008. Run with:
//   npm run docs:example-touches
//
// Plain Node script — reads JSON, writes Markdown. No TS compile needed, and
// no dependency on the library itself (the corpus is self-describing: method
// name, stage, calling, expected verdict).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, '..', 'src', 'tests', 'fixtures', 'known-touches.json');
const OUTPUT_PATH = join(__dirname, '..', 'docs', 'example-touches.md');

const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));

/** "Grandsire Triples" -> ["Grandsire", "Triples"] (split on the last space). */
function splitMethodName(method) {
  const idx = method.lastIndexOf(' ');
  if (idx === -1) return [method, ''];
  return [method.slice(0, idx), method.slice(idx + 1)];
}

function comment(fixture) {
  const { expected, notes } = fixture;
  if (!expected.isTrue) return notes ?? 'False';
  const parts = [];
  if (notes) parts.push(notes);
  if (expected.changeCount !== undefined) parts.push(`${expected.changeCount} changes`);
  if (expected.isSnapFinish) parts.push('snap finish');
  return parts.length > 0 ? parts.join(', ') : 'True';
}

const header = [
  'Example touches - used as test fixtures (GENERATED - do not edit by hand)',
  '',
  'Generated from src/tests/fixtures/known-touches.json by',
  'scripts/generate-example-touches.mjs (`npm run docs:example-touches`), per ADR-0008.',
  'Edit the JSON corpus and regenerate instead of editing this file directly.',
  '',
  'Method, Stage, True/False, Composition, Comment',
].join('\n');

const rows = fixtures.map((f) => {
  const [name, stage] = splitMethodName(f.method);
  const verdict = f.expected.isTrue ? 'True' : 'False';
  return `${name},${stage},${verdict},${f.calling},${comment(f)}`;
});

writeFileSync(OUTPUT_PATH, `${header}\n${rows.join('\n')}\n`);
console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATH}`);
