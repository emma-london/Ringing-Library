// Spike runner (ADR-0017): builds the AS wasm kernel, loads it, and compares
// AS→wasm vs the pure-JS baseline on the identical count(N) hot loop, plus a
// boundary round-trip micro-benchmark. Correctness is cross-checked against the
// C++ solver's known counts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as base from './baseline.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const wasmBuf = readFileSync(join(here, 'kernel.wasm'));
const { instance } = await WebAssembly.instantiate(wasmBuf, {
  env: { abort() { throw new Error('wasm abort'); } },
});
const w = instance.exports;

const KNOWN = { 12: 859n, 14: 7674n, 16: 44907n }; // from grandsire_solver.cpp

function time(fn, reps = 1) { const t0 = process.hrtime.bigint(); let r; for (let i = 0; i < reps; i++) r = fn(); const t1 = process.hrtime.bigint(); return { ms: Number(t1 - t0) / 1e6 / reps, r }; }

// ---- init both ----
{ const a = time(() => w.init()); const b = time(() => base.init()); console.log(`init:   wasm ${a.ms.toFixed(2)} ms   js ${b.ms.toFixed(2)} ms`); }

// ---- correctness ----
let allOk = true;
for (const n of [12, 14, 16]) {
  const wr = w.count(n), jr = BigInt(base.count(n));
  const ok = wr === KNOWN[n] && jr === KNOWN[n];
  if (!ok) allOk = false;
  console.log(`count(${n}): wasm=${wr} js=${jr} expected=${KNOWN[n]} ${ok ? 'OK' : 'MISMATCH!'}`);
}
console.log(`correctness: ${allOk ? 'ALL MATCH C++ ORACLE' : 'FAILED'}\n`);

// ---- throughput ----
for (const n of [16, 17]) {
  const a = time(() => w.count(n));
  const b = time(() => base.count(n));
  console.log(`count(${n}): wasm ${a.ms.toFixed(1)} ms   js ${b.ms.toFixed(1)} ms   speedup ${(b.ms / a.ms).toFixed(2)}x`);
}

// ---- boundary round-trip: 10M trivial wasm calls ----
{
  const REPS = 10_000_000;
  let s = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < REPS; i++) s = w.noop(s);
  const t1 = process.hrtime.bigint();
  const nsPer = Number(t1 - t0) / REPS;
  console.log(`\nboundary: ${REPS.toLocaleString()} noop() calls in ${(Number(t1 - t0) / 1e6).toFixed(0)} ms = ${nsPer.toFixed(1)} ns/call (sink=${s})`);
}
console.log(`\nwasm module size: ${wasmBuf.length.toLocaleString()} bytes`);
