# ADR-0017 spike measurements

Environment: Linux x86-64 sandbox, Node v22.22.3 (V8), g++ 11.4.0 `-O2`.
Workload: `count(N)` — enumerate every true come-round touch of Grandsire Triples
up to N leads (ranked-lead-head DFS + 5040-bit bitset truth + parity/snap-aware
reachability DP). Identical algorithm in all three implementations.

## Correctness (all match the C++ oracle exactly)

| N (leads) | expected total | AS-wasm | JS (fair) |
|---|---|---|---|
| 12 | 859 | 859 ✓ | 859 ✓ |
| 14 | 7,674 | 7,674 ✓ | 7,674 ✓ |
| 16 | 44,907 | 44,907 ✓ | 44,907 ✓ |

## Throughput

| workload | C++ native | optimized TS/JS (V8) | AssemblyScript-wasm (best) |
|---|---|---|---|
| count(16) | **97 ms** | **185 ms** (1.9× native) | **422 ms** (4.3× native) |
| count(17) | 303 ms | ~600 ms | ~1,430 ms |

AS-wasm best config: `asc --optimize --runtime minimal`, `u32` bitset. Notes:
- The default GC runtime (`--runtime incremental`) cost ~2× here even with zero
  hot-loop allocation; `--runtime minimal` was needed to reach 422 ms.
- `--noAssert -O3 --converge` and a `u64` bitset were both *slower* than the best
  config on this workload.
- A first, naive JS baseline using a **BigInt** bitset ran ~3,070 ms at count(16)
  — i.e. wasm "won" 6.9× only against JS's worst representation. Against a fair
  `Uint32Array` JS bitset, wasm **loses** at 0.44×.

## Boundary overhead

10,000,000 trivial `noop(i32): i32` calls across the JS→wasm boundary: **75 ms
total = 7.5 ns/call**. Negligible; not a factor in the decision either way.

## Module size

AS-wasm module: **7.3 KB** (`--optimize --runtime minimal`), 10.6 KB at `-O3`.

## Toolchain provisioning (a first-class finding)

- **AssemblyScript**: `npm i -D assemblyscript` — installs and builds in the
  existing Node toolchain with zero system dependencies.
- **Rust/wasm-pack**: could **not** be provisioned in this sandbox/CI. `rustup`'s
  host (`static.rust-lang.org`) is blocked by the network allowlist; `sudo` is
  unavailable ("no new privileges"); and Ubuntu's apt `rustc` (1.75) ships
  without the `wasm32-unknown-unknown` target regardless. A real Rust→wasm build
  would need an allowlist entry + a provisioning step this environment does not
  currently grant.

## Conclusion

For this integer-heavy DFS on V8, AssemblyScript is ~2.3× **slower** than
well-written TS; only a native-class toolchain (Rust/wasm-pack) beats the JIT,
and it is exactly the one with real provisioning friction here. So: build the 4a
engine in optimized TS behind a stable seam now; keep Rust/wasm-pack as the
future drop-in behind the same interface when peal-length performance demands the
extra ~2× over the JIT (and native's ~2× over that). See ADR-0017.
