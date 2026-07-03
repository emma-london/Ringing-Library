import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as fast from './baseline-fast.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const { instance } = await WebAssembly.instantiate(readFileSync(join(here, 'kernel.wasm')), { env: { abort() { throw new Error('abort'); } } });
const w = instance.exports;
const time = (fn) => { const t0 = process.hrtime.bigint(); const r = fn(); return { ms: Number(process.hrtime.bigint() - t0) / 1e6, r }; };
w.init(); fast.init();
for (const n of [12,14,16]) { const a = w.count(n), b = BigInt(fast.count(n)); console.log(`count(${n}) fast-js=${b} wasm=${a} ${a===b?'OK':'X'}`); }
for (const n of [16, 17]) { const a = time(() => w.count(n)); const b = time(() => fast.count(n)); console.log(`count(${n}): wasm ${a.ms.toFixed(1)} ms   fast-js ${b.ms.toFixed(1)} ms   speedup ${(b.ms/a.ms).toFixed(2)}x`); }
