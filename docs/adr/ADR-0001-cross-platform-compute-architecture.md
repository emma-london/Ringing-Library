# ADR-0001: Cross-platform compute architecture — TypeScript core with a WebAssembly engine

**Status:** Accepted
**Date:** 2026-06-20
**Deciders:** Emma (project owner)
**Revised by:** [ADR-0003](./ADR-0003-phasing-and-roadmap.md) revises the *Now* action-item sequencing below — the `Executor` seam, the per-call budget, and the deterministic search mode are deferred to Phase 4 (built alongside the engine that consumes them), not scaffolded early. The architecture, invariants, and decision here stand unchanged.

## Context

We are building a general-purpose change ringing library. The existing assets are a working C++ library (`ringing-lib`-style), a local C++ proof-of-concept for brute-force composition discovery, and an in-progress TypeScript reimplementation whose goals are portability, supportability, and future expansion to mobile and web.

The library must serve use cases with **wildly different compute profiles**, which collapse onto two axes — compute cost and latency budget:

| Use case | Compute | Budget | Natural home |
|---|---|---|---|
| Prove a specific composition is true | trivial, bounded | instant | always client |
| "30 seconds of nice Grandsire, 8–10 leads" | bounded search | ~30 s, anytime | client (mobile budget) |
| Compose method X / stage Y / constraints Z | unbounded search | background | client *or* server, by size |
| Create / validate a new method | light (validation) | instant | client |

Two observations shape everything below. First, *prove* and *validate-a-method* are cheap deterministic domain operations, not search. Second, "compose with constraints" and "30 seconds of nice Grandsire" are the **same operation** at different budgets. So there are really only two kinds of work: cheap deterministic domain logic, and one budgeted search engine.

The forces at play:

- **Portability & supportability** — one codebase across web, mobile, and server is the stated goal; divergent per-platform implementations are the thing to avoid.
- **Performance** — the search hot loop is `uint16` rank arithmetic and large bitsets (validated in the C++ prototypes), exactly where idiomatic TypeScript is 5–20× slower than native.
- **User distribution** — >99% of users are well served by client-side compute within a sensible budget; only rare heavy jobs need a server.
- **Safety** — some requests are computationally enormous or infeasible; the system must refuse to set a phone (or a shared server) on an impossible job.
- **Correctness across platforms** — a result must never be judged true on one platform and false on another.

## Decision

Adopt a **three-layer architecture with a single shared compute engine**:

1. **Domain core (TypeScript).** `Bell`, `Row`, `Change`, `Method`, `Composition`, `Touch`, `Prover`, `MethodLibrary` (see ADR-0002 for the `Composition`/`Touch`/`Prover` naming). Pure, immutable, zero I/O, identical on every platform. Cheap operations — *prove*, *parse*, *generate*, *validate a method* — live here and run client-side, instantly, everywhere. (This is the layer already under construction; Phase 2 complete.)

2. **Search / composition engine (one implementation, compiled to WebAssembly).** The validated prototype techniques — ranked lead-head state, bitset truth, reachability DP, meet-in-the-middle, Q-set generative search, snap-finish handling — implemented once (Rust preferred; AssemblyScript a gentler but smaller-ecosystem alternative) and compiled to a single `.wasm` module. The **same module runs on mobile and in the browser**; the server runs a multi-threaded build of the **same source**. There is no parallel TypeScript searcher to drift from it.

3. **Orchestration (TypeScript).** Decides *where* a job runs and enforces limits. Hosts the `Executor` abstraction (`Local` / `Worker` / `Remote`), the admission controller (future), the cost model, and the cache.

The load-bearing invariant tying these together:

> **Search may run anywhere; every result is re-proved by the cheap deterministic core on the client before it is trusted or displayed.**

The trust boundary is therefore the tiny verifier, not the heavy compute. The server, a peer, or a cache is an *untrusted suggestion box*; the client's core is the arbiter.

## Options Considered

### Option A: Pure TypeScript everywhere (heavy jobs to server)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low — single language, single toolchain |
| Cost | Low to build; higher server spend (more jobs forced off-device) |
| Scalability | Hot loop 5–20× slower; many medium jobs can't finish client-side |
| Team familiarity | High |

**Pros:** Simplest, most supportable, truest to "one codebase." No FFI/marshalling. Fast to ship.
**Cons:** The hot loop is precisely TS's weak spot; the client/server boundary moves *up*, pushing many jobs that *could* run on-device onto a paid server. Risks a second (server-side, possibly C++) searcher creeping back in → divergence.

### Option B: TypeScript core + WebAssembly hot loop (CHOSEN)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium — adds a WASM toolchain and a TS↔WASM boundary |
| Cost | Medium build; low run (most jobs stay on-device) |
| Scalability | Near-native client-side speed; one engine scales from phone to server |
| Team familiarity | Medium — Rust/WASM is a new skill to acquire |

**Pros:** One engine binary on every platform → engine cannot disagree with itself. Bitsets and `uint16` arrays are WASM's native habitat. Keeps heavy compute *client-side* far longer, shrinking server cost and the cases needing handoff. Preserves "same engine everywhere" while the TS core keeps the developer experience idiomatic.
**Cons:** A new toolchain and skill (Rust/wasm-pack); a TS↔WASM boundary to design carefully; harder debugging; WASM threads need extra setup (SharedArrayBuffer + COOP/COEP headers in browsers).

### Option C: C++ engine, server-only; TypeScript clients

| Dimension | Assessment |
|-----------|------------|
| Complexity | High — two languages, two codebases |
| Cost | High server spend; all non-trivial search is remote |
| Scalability | Native server speed, but nothing heavy runs on-device |
| Team familiarity | High for C++, but split across stacks |

**Pros:** Reuses the existing, validated C++ directly; maximal server throughput.
**Cons:** Two implementations of the domain/search → the exact divergence risk we must avoid; offline/mobile clients can't do meaningful search; works directly against the portability and supportability goals.

### Option D (noted, rejected): Native per-platform engines (Kotlin/Swift/JS)

Best raw performance per platform, but multiplies the codebase and the divergence surface by the number of platforms. Rejected on supportability grounds.

## Trade-off Analysis

The decisive trade-off is **performance vs. single-codebase portability**, and WASM is the option that refuses to choose: one compiled artifact gives near-native speed *and* runs on every platform, so the portability win does not cost the performance win. The price is a new toolchain and a boundary to design — a contained, one-time complexity, not an ongoing divergence tax.

Against Option A: the >99%-served-by-TS argument is real, but it argues for *where the engine runs* (client), not *what language the engine is*. WASM keeps the engine client-side for more cases than pure TS could, which actually *strengthens* the "client-first" position rather than undermining it. The TS-everywhere simplicity is attractive, but the moment a second server-side searcher appears to handle what TS can't, we have re-acquired Option C's divergence risk without admitting it.

Against Option C: native server speed is real but bought with two codebases and a mobile experience that can't search offline. The verify invariant means we don't *need* server and client to compute the same thing — but we do need the *engine* to be one thing, and C++-server-plus-TS-client makes it two.

On determinism specifically: we separate **correctness** (is a touch true/valid — must be identical everywhere, always) from **output** (which valid touch is returned — may legitimately differ by budget and core count, and that's fine). One engine binary plus one verifier in the core makes correctness divergence structurally impossible; we deliberately do *not* promise byte-identical output except in an opt-in deterministic mode used for caching keys and tests.

## Consequences

**Becomes easier**

- Heavy compute stays on-device for far more cases, cutting server cost and latency.
- Client/server handoff is trivial and safe: a job is serializable data with a budget, so the *same spec* runs either place; the `Executor` seam (`Local`/`Worker`/`Remote`) relocates an operation without changing the call.
- Caching is safe and high-leverage: results are immutable facts, re-proved on read, so untrusted/shared/edge caches can't yield a wrong answer.
- Correctness divergence between mobile and server is impossible by design (one engine, one verifier, client re-proves everything).

**Becomes harder**

- New toolchain and skill (Rust + wasm-pack, or AssemblyScript) and a TS↔WASM marshalling boundary.
- Debugging the WASM kernel is harder than TS; threading needs cross-origin headers in the browser.
- Constraints must largely be expressed as *data the engine interprets*, not arbitrary JS callbacks, to keep the boundary non-chatty (see Action Items).

**To revisit**

- Whether to also compile the *verifier* (`Prover`) to WASM later for speed; if so it must be WASM **everywhere**, never WASM-on-server / TS-on-client.
- The exact split point of the TS↔WASM boundary, tuned against measured boundary overhead.
- Engine language choice (Rust vs AssemblyScript) after a small spike.

## Key design rules that follow from this decision

These are consequences worth stating explicitly because they constrain near-term code even before the WASM engine exists:

- **The boundary is the *job*, never the node.** WASM owns the entire hot loop and runs in cooperative chunks via a resumable protocol — roughly `init(jobSpec) -> handle`, `run(handle, chunkBudget) -> {status, newResults, progress, done}`, `cancel`, `free`. Crossings happen tens of times per second, not per node; this gives streaming, progress, and cancellation while the hot loop stays inside WASM. The engine instance persists across chunks so tables and the truth bitset are built once.
- **Data crosses as flat numeric buffers.** Inputs (expanded lead tables, calls, budget) written into linear memory once; outputs are compact encoded touches (`Uint16Array` of lead-head rank + call-id), rehydrated into rich `Touch` objects by the core only for the few that are displayed.
- **Constraints are declarative data**, not JS callbacks — music-scoring tables, required/forbidden rows, max consecutive bobs, part structure — so the engine evaluates them internally. An arbitrary-JS-predicate escape hatch is allowed only for post-filtering a small result set.
- **Every engine call carries an explicit budget (node/ms cap) and reports actuals.** This is the day-1 hook the admission controller and cost model plug into later.
- **A job is location-independent serializable data.** This single property enables the WASM chunk protocol, the client→server handoff, and cache keys simultaneously.

## Action Items

**Now (cheap hooks that avoid expensive retrofits)**

1. [ ] Make every engine/search call take an explicit budget (max nodes or ms) and return actuals — even in the current TS prototype.
2. [ ] Model a job as serializable data (method, stage, calls, constraint spec, budget) — the unit that will later move between `Local`/`Worker`/`Remote` executors.
3. [ ] Define the `Executor` interface (`Local`/`Worker`/`Remote`) behind a single `compose()` entrypoint, with `prove()` staying in the core and never touching the engine.
4. [ ] Keep `Prover` / truth as one deterministic implementation in the core; add golden truth vectors generated from the validated C++ prototype as a conformance oracle.
5. [ ] Add a deterministic mode (fixed call ordering, canonical tie-breaking, single-threaded, seeded) for cache keys and tests.

**Next (Phase 3 and the WASM spike)**

6. [ ] Spike the engine language (Rust + wasm-pack vs AssemblyScript) on one kernel — the ranked-lead-head DFS with bitset truth — and measure boundary overhead to fix the chunk size.
7. [ ] Port the prototype searcher (reachability DP, MITM, Q-set, snap finishes) into the chosen WASM target; cross-check counts against the C++ prototypes (which already agree four ways).
8. [ ] Implement the resumable chunk protocol and wire streaming/progress/cancellation through the `Worker` executor.

**Later (designed-in, not built day 1)**

9. [ ] Admission controller as a pure function `(jobSpec, deviceProfile, calibration) -> {class, estimate, rationale}`, reusing the reachability DP as the feasibility estimator and sharing one cost model with the engine. Runs on both client (protect device, predict server) and server (protect shared resource; rate limits, per-user budgets).
10. [ ] Caching as a first-class precomputed composition corpus: canonical content-addressed keys; split eternal *truth* facts from scoring-version-tagged *quality* facts; cache negatives ("no true touch of length L satisfying Z"); layer client seed → shared server → edge; verify every cached result on read.
11. [ ] Server handoff UX: predict with admission control, offer server, stream back, re-prove locally; optional fire-local-and-server-in-parallel with swap-in.

## References

- Project context: `context.md` (domain concepts, Phase 2 status, prototype findings).
- Validated prototypes: `prototypes/grandsire_solver.cpp` and the multi-threaded `…_mt.cpp` (ranking + bitset truth, snap finishes, reachability DP, MITM) — the algorithmic basis for the WASM engine.
- Reference interface: [ringing-lib](https://github.com/ringing-lib/ringing-lib) (C++).
