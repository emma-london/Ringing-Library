# ADR-0017: Phase 4a engine language — optimized TS now, Rust/wasm-pack later; AssemblyScript rejected

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Emma (project owner)
**Amends:** [ADR-0013](./ADR-0013-phase-4-prework-and-split.md) — revises Phase 4a's
deliverable from "a working, verified **WASM module**" to "a working, verified
engine core behind a **stable seam**, implemented in optimized TS for now." The
pre-4 / 4a / 4b split and every other part of ADR-0013 stand unchanged.
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) (the
three-layer architecture; the WASM engine layer), [ADR-0011](./ADR-0011-bounded-app-composition-searcher.md) /
[ADR-0012](./ADR-0012-stedman-in-bounded-searcher.md) (the `SearchReport` seam 4b
swaps the engine behind), `prototypes/grandsire_solver.cpp` (the ported algorithms
and the validation oracle), `engine/` (the spike itself).

## Context

ADR-0013 opened Phase 4a with a **language spike**: "Rust/wasm-pack vs
AssemblyScript on the ranked-lead-head DFS + bitset truth kernel; measure boundary
overhead." The premise — inherited from ADR-0001 — was that the search hot loop
must be compiled to WASM to be fast enough, and the only open question was *which*
WASM toolchain.

The spike was run for real (`engine/`): the `count(N)` hot loop of
`grandsire_solver.cpp` (Lehmer ranking, lead tables, parity/snap-aware
reachability DP, truth-pruned DFS) ported to AssemblyScript and to two pure-JS
baselines, cross-checked against the C++ oracle's known counts, and timed against
a native C++ build as the Rust/wasm-pack performance proxy. Full numbers in
`engine/spike/results.md`. The measurements overturned the premise.

### What the spike found

Correctness first: the AssemblyScript build matches the C++ oracle exactly
(count(12)=859, count(14)=7,674, count(16)=44,907), as does every JS baseline — so
this is a fair comparison of equivalent, correct implementations.

Performance, `count(16)`, on Node/V8:

| implementation | time | vs native |
|---|---|---|
| C++ native (`-O2`) — the Rust/wasm-pack proxy | **97 ms** | 1.0× |
| optimized TS/JS (`Uint32Array` bitset, V8 JIT) | **185 ms** | 1.9× |
| AssemblyScript-wasm (best config) | **422 ms** | 4.3× |

Three things follow:

1. **AssemblyScript is ~2.3× slower than well-written TS here.** V8's JIT compiles
   this integer/typed-array DFS extremely well. Adopting a whole new language and
   build step *to run slower than the TS we already have* fails the only test that
   matters. (The result is not a tuning artifact: `--runtime minimal` + a `u32`
   bitset was AS's best of several configs; `-O3 --noAssert --converge` and a `u64`
   bitset were both slower.)
2. **The "wasm is faster" intuition came from a strawman.** A first JS baseline
   using a **BigInt** bitset ran ~3,070 ms — and wasm "wins" 6.9× against *that*.
   Against a fair `Uint32Array` JS bitset, AS-wasm loses (0.44×). The lesson: the
   representation, not the language, dominated.
3. **Only a native-class toolchain earns the WASM layer** — and that toolchain
   (Rust/wasm-pack) is exactly the one that **could not be provisioned in this
   project's own sandbox/CI**: `rustup`'s host is blocked by the network
   allowlist, `sudo` is unavailable, and Ubuntu's apt `rustc` ships without the
   `wasm32-unknown-unknown` target. AssemblyScript, by contrast, is `npm i -D`
   with zero system dependencies.

Boundary overhead — the thing ADR-0013 flagged to measure — is **7.5 ns/call**
(10M `noop` round-trips in 75 ms). Negligible; it does not bear on the decision.

## Decision

**Build the Phase 4a engine core in optimized TypeScript now, behind a stable
engine seam, and defer WASM compilation to Rust/wasm-pack for if/when it is
actually warranted. AssemblyScript is rejected.**

Concretely:

- The engine core (`src/engine/`) is a faithful port of the validated
  `grandsire_solver.cpp` algorithms — Lehmer ranking, lead-head tables,
  parity/snap-aware reachability DP, forward DFS (list/count/find), MITM, Q-set
  structure, snap-finish handling — in optimized TS with typed arrays. It is
  callable directly and synchronously, with no `Executor`/chunking (exactly the
  ADR-0013 checkpoint), and it beats what an AssemblyScript build would deliver.
- The **seam is the durable artifact**, not the implementation language — the same
  principle ADR-0011/ADR-0012 already established for `SearchReport`. The engine
  exposes a small, documented, versioned interface (per ADR-0016, via
  `src/index.ts`) that a future Rust/wasm-pack implementation can satisfy
  unchanged.
- **Rust/wasm-pack is the recorded future drop-in.** When peal-length performance
  demands the ~2× that native buys over the JIT (and the JIT already buys ~2× over
  AssemblyScript), the work is: provision the toolchain (allowlist + a build/CI
  step) and implement the seam in Rust. Not AssemblyScript — the spike closes that
  door on evidence.
- ADR-0013's Phase 4a is otherwise unchanged: same algorithms, same live-diff
  validation against the C++ prototypes, same "callable directly" checkpoint. Only
  the *artifact language* changes (WASM module → TS behind a seam).

## Options Considered

### Option A — Optimized-TS engine now, Rust/wasm-pack later; AssemblyScript rejected (CHOSEN)

**Pros:** Ships a working, live-diff-verified engine *this phase*, faster than the
AssemblyScript alternative and with no new toolchain to provision or teach.
Honours the spike's actual finding instead of overriding it. Keeps the WASM option
fully open behind the seam, aimed at the toolchain (Rust) that would actually pay
off. Zero new system dependencies; the core stays pure, portable TS (ADR-0001's
"identical on every platform" property is *strengthened*, not compromised — there
is no native binary to build per target yet). De-risks 4b: the `Executor` seam now
wraps a real, fast, correct engine.
**Cons:** No WASM artifact yet, so ADR-0001's WASM layer is deferred, not
delivered — a future performance ceiling remains until Rust lands. The engine's
speed is now hostage to V8's JIT characteristics (warmup, potential deopt) on
whatever runs it, including low-end mobile — the very place a predictable wasm
module would have helped. Accepted because: (a) the bounded searchers it replaces
were far slower anyway, (b) the seam makes the later swap cheap, and (c) the spike
shows AssemblyScript would not have relieved that ceiling regardless.

### Option B — Ship the AssemblyScript-wasm engine as originally scoped

**Pros:** Produces a real WASM artifact and the portability/predictability story
(no JIT warmup, uniform performance across engines); AssemblyScript stays in the
familiar TS-ish language and the npm toolchain; tiny module (7–10 KB); negligible
boundary cost.
**Cons:** It is **~2.3× slower than the optimized TS it would replace** on the one
workload that defines the engine. Adopting a new language and build step to go
*slower* is unjustifiable on this evidence; the predictability argument does not
rescue a 2.3× regression against code we already have. Rejected — this is the
option the spike was designed to test, and it failed.

### Option C — Pause and provision Rust/wasm-pack first, then build the real native-class engine

**Pros:** Delivers the actual performance win ADR-0001 envisaged (~native), behind
the same seam; targets the toolchain the spike vindicates.
**Cons:** Cannot proceed in the current environment without out-of-band allowlist
and CI changes; blocks the 4a checkpoint on infrastructure work with no engine to
show meanwhile. The seam-first approach (Option A) lets this happen *later* at no
extra cost — the TS engine is not wasted work, it's the reference implementation
and live-diff peer the Rust port will validate against. Deferred, not rejected:
this is precisely the "future drop-in" Option A records.

## Consequences

**Becomes easier**
- Phase 4a completes with a fast, verified engine and **no toolchain migration in
  flight** — the exact risk ADR-0013's pre-4 sequencing worked to avoid, now
  avoided in 4a too.
- The engine is plain TS: it runs anywhere the core runs, is debuggable with the
  same tools, and is trivially unit-testable and live-diffable against the C++
  prototypes.
- 4b's `Executor` seam wraps a real engine immediately; no "stub until wasm
  arrives" gap.

**Becomes harder / to watch**
- ADR-0001's WASM engine layer is now explicitly **deferred**. A future
  performance ceiling (V8 JIT vs native, ~2×) remains until Rust/wasm-pack lands.
  The seam must be kept genuinely implementation-agnostic so that swap stays cheap
  — no V8-specific assumptions leaking into the interface.
- "Optimized TS" invites micro-optimization creep. The engine should stay
  readable and correctness-first (the project's standing rule: truth outranks
  performance everywhere); the typed-array style is justified by the spike, not a
  licence to obscure the algorithms.
- The Rust provisioning problem is real and will recur for anyone who tries to add
  the wasm build later. That prerequisite (allowlist + CI) is documented here and
  in `engine/spike/results.md` so it isn't rediscovered from scratch.

**To revisit**
- Trigger to actually build the Rust/wasm engine: when a target workload (peal- or
  multi-extent-length search, or low-end mobile where JIT warmup bites) is
  measured to miss its budget on the TS engine. At that point, provision
  Rust/wasm-pack and implement the existing seam; keep the TS engine as the
  reference oracle for the port's own live-diff.
- If a third principle family or a generalization beyond Grandsire Triples reshapes
  the engine interface, re-examine the seam here before committing 4b to it.

## WASM revisit checklist (deferred)

When a measured workload justifies the Rust/wasm-pack build (see the trigger under
"To revisit"), do these — recorded now so the friction isn't rediscovered:

1. **Unblock the Rust toolchain (the spike's hard blocker).** In this
   sandbox/CI, `rustup` could not install: `static.rust-lang.org` is
   403'd by the network allowlist, `sudo` is unavailable ("no new privileges"),
   and Ubuntu's apt `rustc` (1.75) ships **without** the
   `wasm32-unknown-unknown` target so it's a dead end regardless. To provision:
   - Allowlist the toolchain hosts: `sh.rustup.rs` (installer), `static.rust-lang.org`
     (toolchains), `crates.io` + `index.crates.io` + `static.crates.io` (deps),
     and `github.com` + `objects.githubusercontent.com` (the `wasm-pack` /
     `wasm-bindgen` release binaries).
   - Install via **rustup in userspace** (no sudo needed — it writes to
     `~/.rustup` / `~/.cargo`), then `rustup target add wasm32-unknown-unknown`,
     then `cargo install wasm-pack` (or the wasm-pack installer). Do **not** rely
     on apt `rustc`.
   - *(Emma will grant these permissions when we revisit — 2026-07-03.)*
2. **Run a real on-device benchmark before committing.** Build the browser
   harness deferred from this session: the same `count(N)` workload in optimized
   TS vs the AS-wasm module vs the new Rust/wasm module, reporting **cold-run and
   warmed** numbers, opened on the *actual target phone* (up-to-date mobile
   Chrome). The desktop-x86 V8 numbers here are a proxy, not the device; the open
   question is specifically JS JIT **warmup** on short mobile bursts, which only a
   device measurement settles. This is also the evidence that should accompany
   any decision to ship the Rust build.
3. **Implement the existing `CompositionEngine` seam in Rust**, keeping the TS
   engine as the reference oracle for the port's own live-diff (same pattern as
   the TS engine's live-diff against the C++ prototype).

## Action Items

1. [x] Run the spike (AS vs fair JS vs native C++ proxy); record measurements
   (`engine/spike/results.md`).
2. [x] Record the decision (this ADR); note the amendment to ADR-0013's 4a
   deliverable wording.
3. [x] Build `src/engine/` — the optimized-TS engine core behind the stable seam
   (ADR-0013 Action Items 4–5, re-homed to TS).
4. [x] Live-diff the TS engine against `grandsire_solver.cpp`; re-prove every
   listed/found touch via `Touch.prove()` (ADR-0013 Action Item 6).
   `scripts/engine-live-diff.mjs` + `src/tests/engine.test.ts`.
5. [x] Update `context.md` (roadmap/state) to reflect the TS-engine path and the
   deferred-Rust-wasm future.
6. [ ] *(Deferred to the WASM revisit — see checklist above.)* Provision
   Rust/wasm-pack, build the on-device benchmark harness, implement the seam in
   Rust.
