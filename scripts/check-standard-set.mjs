#!/usr/bin/env node
// Seed-hash guard (ADR-0023) — network-free.
//
// standard-set-seed.json is the source of truth; src/data/method-library/
// standard-set.json is a GENERATED, committed artifact resolved from it by
// `npm run data:refresh`. `npm run build` (tsc) copies that artifact as-is — it
// does NOT re-resolve the seed — so a seed edited without a re-refresh silently
// ships stale (exactly the bug that prompted this guard). This check fails when
// the recorded seed hash no longer matches the seed, without any network call
// (it does not re-fetch the CCCBR library). Wired into CI and `prepublishOnly`.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { seedHash } from './seed-hash.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SEED_PATH = join(ROOT, 'src', 'data', 'standard-set-seed.json');
const HASH_PATH = join(ROOT, 'src', 'data', 'method-library', 'standard-set.seedhash');

const rel = (p) => relative(ROOT, p);
const fix = 'Run `npm run data:refresh`, then commit the updated ' +
  'src/data/method-library/standard-set.json and standard-set.seedhash.';

let recorded;
try {
  recorded = readFileSync(HASH_PATH, 'utf-8').trim();
} catch {
  console.error(`✗ Missing ${rel(HASH_PATH)}.\n  ${fix}`);
  process.exit(1);
}

const actual = seedHash(readFileSync(SEED_PATH, 'utf-8'));

if (actual !== recorded) {
  console.error(
    `✗ ${rel(SEED_PATH)} has changed but the bundled standard set was not regenerated.\n` +
    `    seed now:  ${actual}\n` +
    `    recorded:  ${recorded}\n` +
    `  ${fix}`,
  );
  process.exit(1);
}

console.log('✓ standard set is in sync with the seed');
