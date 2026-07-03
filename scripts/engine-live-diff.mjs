// Live-diff the Phase 4a TS engine against the C++ prototype oracle
// (prototypes/grandsire_solver.cpp) — ADR-0013 / ADR-0017 validation.
//
// Compiles the prototype (needs g++), runs its count/list/find/mitm modes, and
// checks the engine (dist/) agrees exactly: per-length counts, the full set of
// callings, find verdicts, and MITM totals. Prints a PASS/FAIL summary.
//
// Run:  npm run build && node scripts/engine-live-diff.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { GrandsireTriplesEngine } from '../dist/engine/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cpp = join(root, 'prototypes', 'grandsire_solver.cpp');

// ---- build the oracle ----
let solver;
try {
  const dir = mkdtempSync(join(tmpdir(), 'gsolver-'));
  solver = join(dir, 'solver');
  execFileSync('g++', ['-O2', '-std=c++17', cpp, '-o', solver], { stdio: 'pipe' });
} catch (e) {
  console.error('Could not build the C++ oracle (needs g++). Skipping live-diff.');
  console.error(String(e.message || e).split('\n')[0]);
  process.exit(2);
}
const run = (...args) => execFileSync(solver, args, { encoding: 'utf8' });

const eng = new GrandsireTriplesEngine();
let fails = 0;
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); if (!ok) fails++; };

// ---- count: per-length lead-end/snap ----
for (const N of [12, 14, 16]) {
  const txt = run('count', String(N));
  const oracle = new Map(); // leads -> [leadEnd, snap]
  for (const line of txt.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
    if (m) oracle.set(+m[1], [+m[2], +m[3]]);
  }
  const rep = eng.count(N);
  let ok = true, why = '';
  for (const row of rep.byLength) {
    const o = oracle.get(row.leads);
    if (!o || o[0] !== row.leadEnd || o[1] !== row.snap) { ok = false; why = `L=${row.leads} engine=[${row.leadEnd},${row.snap}] oracle=${o}`; break; }
  }
  // also lengths present must match
  if (ok && oracle.size !== rep.byLength.length) { ok = false; why = `row-count ${rep.byLength.length} vs ${oracle.size}`; }
  check(`count(${N}) per-length`, ok, why || `total=${rep.total}`);
}

// ---- list: exact set of callings ----
for (const N of [8, 10]) {
  const txt = run('list', String(N));
  const oracle = new Set();
  for (const line of txt.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(lead-end|snap)\s+([.\-s]+)$/);
    if (m) oracle.add(`${m[4]}:${m[1]}:${m[3]}`); // calling:changes:finish
  }
  const list = eng.list(N);
  const got = new Set(list.map((t) => `${t.calling}:${t.changes}:${t.snap ? 'snap' : 'lead-end'}`));
  const missing = [...oracle].filter((x) => !got.has(x));
  const extra = [...got].filter((x) => !oracle.has(x));
  check(`list(${N}) callings`, missing.length === 0 && extra.length === 0 && oracle.size === got.size,
    `n=${got.size}` + (missing.length ? ` missing ${missing.slice(0, 3)}` : '') + (extra.length ? ` extra ${extra.slice(0, 3)}` : ''));
}

// ---- find: exact-length callings + all verified ----
// NB: the oracle here is C++ `list` filtered to exactly L leads, NOT C++ `find`.
// C++ `find` drops snap-terminated touches (its parity-aware DP mishandles the
// 13-change snap lead's parity), so it under-reports — e.g. find(10)=10 while
// count(10)=24. The engine's reachability-only DFS (ADR-0018) returns all of
// them, which is why it matches `list`/`count`, not the buggy `find`.
for (const L of [10, 12]) {
  const txt = run('list', String(L));
  const oracle = new Set();
  for (const line of txt.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(lead-end|snap)\s+([.\-s]+)$/);
    if (m && +m[2] === L) oracle.add(m[4]); // leads column == L
  }
  const found = eng.find(L, 100000);
  const got = new Set(found.map((t) => t.calling));
  const allVerified = found.every((t) => t.verifiedTrue);
  const allExact = found.every((t) => t.leads === L);
  const same = oracle.size === got.size && [...oracle].every((x) => got.has(x));
  check(`find(${L}) == exactly-${L}-lead subset of list`, same && allVerified && allExact,
    `n=${got.size} (oracle ${oracle.size}) allVerified=${allVerified} allExactL=${allExact}`);
}

// ---- mitm totals ----
for (const L of [10, 12, 14]) {
  const txt = run('mitm', String(L));
  const m = txt.match(/total=(\d+)\s+\(lead-end=(\d+),\s*snap=(\d+)\)/);
  const oracle = m ? { total: +m[1], leadEnd: +m[2], snap: +m[3] } : null;
  const r = eng.mitmCount(L);
  const ok = oracle && oracle.total === r.total && oracle.leadEnd === r.leadEnd && oracle.snap === r.snap;
  check(`mitm(${L})`, !!ok, `engine total=${r.total}(le=${r.leadEnd},sn=${r.snap}) oracle=${oracle ? oracle.total : '?'}`);
  // cross-check: mitm total must equal count's row for L
  const crow = eng.count(L).byLength.find((x) => x.leads === L);
  check(`mitm(${L}) == count row`, !!crow && crow.total === r.total && crow.leadEnd === r.leadEnd && crow.snap === r.snap);
}

console.log(`\n${fails === 0 ? 'ALL LIVE-DIFF CHECKS PASSED' : fails + ' CHECK(S) FAILED'} vs grandsire_solver.cpp`);
process.exit(fails === 0 ? 0 : 1);
