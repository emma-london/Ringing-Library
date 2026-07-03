# `engine/` — Phase 4a language spike (ADR-0017)

This directory holds the **language spike** that decided Phase 4a's engine
toolchain, **not** the production engine. The production engine core lives in
`src/engine/` (optimized TypeScript, per the spike's finding — see
[ADR-0017](../docs/adr/ADR-0017-engine-language-spike.md)).

## What's here

| File | Purpose |
|---|---|
| `assembly/kernel.ts` | AssemblyScript port of `grandsire_solver.cpp`'s `count` hot loop (ranked-lead-head DFS + bitset truth + parity/snap-aware reachability DP). Builds to a 7–10 KB wasm module. |
| `spike/baseline.mjs` | First pure-JS baseline — **BigInt** bitset (a deliberately naive representation, to show the trap). |
| `spike/baseline-fast.mjs` | Fair pure-JS baseline — `Uint32Array` bitset. The real thing wasm is compared against. |
| `spike/run.mjs` | Correctness (vs the C++ oracle counts) + throughput (wasm vs naive-JS) + boundary round-trip micro-benchmark. |
| `spike/run-fair.mjs` | Throughput: wasm vs the **fair** JS baseline. |
| `spike/results.md` | The recorded measurements ADR-0017 cites. |

## Reproducing

```sh
cd engine
npm ci                      # installs assemblyscript (devDependency of the spike only)
npm run asc                 # build assembly/kernel.ts -> spike/kernel.wasm  (--optimize --runtime minimal)
node spike/run-fair.mjs     # wasm vs fair JS
g++ -O2 -std=c++17 ../prototypes/grandsire_solver.cpp -o /tmp/solver && /tmp/solver count 16   # native oracle/proxy
```

## Headline finding

On the `count(16)` hot loop (Node/V8): **C++ native 97 ms → optimized TS 185 ms →
AssemblyScript-wasm 422 ms.** AssemblyScript was ~2.3× slower than plain optimized
TS here; only a native-class toolchain (Rust/wasm-pack) beats the JIT, and that
toolchain could not be provisioned in this project's sandbox/CI (rustup is
allowlist-blocked). Decision: build the 4a engine in optimized TS behind a stable
seam now; keep Rust/wasm-pack as the future drop-in. Full rationale in ADR-0017.
