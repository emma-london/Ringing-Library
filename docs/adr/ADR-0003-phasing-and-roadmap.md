# ADR-0003: Phasing and roadmap — truth-first core before the search engine

**Status:** Accepted
**Date:** 2026-06-20
**Deciders:** Emma (project owner)
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md), [ADR-0002](./ADR-0002-description-vs-execution.md)

## Context

ADR-0001 set the three-layer architecture (TS domain core / WASM search engine / TS orchestration) and the verify-on-client invariant. ADR-0002 fixed the names and shapes of the contested types (`Composition` / `Touch` / `Prover`, with `SearchTruth` kept engine-internal). Neither ADR said **in what order** the remaining work happens. This record does.

The situation that drives the ordering has an important asymmetry:

- The riskiest **mathematics** is already behind us. The C++ prototypes (`grandsire_solver.cpp` and the multi-threaded build) implement ranking + bitset truth, reachability DP, meet-in-the-middle, Q-set structure, and snap finishes, and four independent searchers agree on exact touch counts. The search *algorithms* are validated.
- The riskiest **engineering** is still ahead: the TS↔WASM boundary, a new toolchain (Rust/wasm-pack or AssemblyScript), and threading setup. This is genuinely unbuilt.

ADR-0001's "now" action list assumed some execution plumbing (an `Executor` seam, a budget parameter on search calls, a deterministic *search* mode) would be scaffolded early to avoid retrofits. That assumption is worth re-examining once the searcher itself is scheduled, because plumbing with no caller is plumbing whose interface we are guessing.

A second force shapes the phasing as much as the architecture: **truth is the most important property of the library.** A large performance roadmap is queued up behind the WASM engine, but none of it matters if the core can return a touch that is false. Phase 3's job is therefore not "build features" but "prove a TypeScript library that is correct."

## Decision

Phase the project so that a **correct, fully-tested, pure-TypeScript domain core ships first**, and the search engine and its execution plumbing follow as a self-contained later phase.

### Phase 3 — "Make sure a TS library actually works" (truth-first, pure TS)

Build the four remaining core types from ADR-0002 — `Composition`, `Touch`, `Prover`, `MethodLibrary` — and nothing that needs a new toolchain. The deliverable is a usable client-side library: prove, parse, generate, validate, expand. The phase is defined by its **tests, not its features**:

- **Truth is the headline.** `Prover` correctness is exercised with extensive positive *and* negative cases and deliberately stress-tested. False touches must be caught and located (`falseRows()` with line numbers); true touches must never be flagged. Real worked examples (owner-supplied) seed the negative cases so nothing is missed.
- **Protect `Composition`'s serializable/hashable shape now.** This is the one ADR-0001 hook that stays in Phase 3. It is not execution plumbing — it is an intrinsic property of the value type, which is simultaneously the job spec, the content-addressed cache key, and the Phase 4 search-result type. Getting the shape wrong is a true retrofit because Phase 4 builds directly on it. Everything else execution-related is deferred (see below).
- **Bring in real method data early.** Load real methods (e.g. the CCCBR method library) early in the phase so `MethodLibrary` and `Prover` are tested against real methods, not just hand-built fixtures.

### Phase 4 — Search engine + the execution plumbing it serves

The WASM engine and **all** the execution machinery that only exists to serve a searcher: the `Executor` seam (`Local`/`Worker`/`Remote`), the per-call budget, the deterministic search mode, streaming/progress/cancellation, and the resumable chunk protocol. Validation is by **live diff against the C++ prototypes**, not frozen vectors (see Options).

### Phase 5 — Orchestration and scale

The ADR-0001 "later" items: admission controller, cost model, server handoff UX, and the cached composition corpus.

### Decisions folded in

1. **The searcher is deferred to Phase 4** — but the architecture leaves space for it (the `Composition` shape, the `Prover` trust boundary, and the ADR-0001 seams are all designed to receive it). *Why:* search is the rarely-exercised path for >99% of use, and it is trivial to test side-by-side against the existing C++. Pulling it forward would interrupt the core with a new toolchain for little early benefit.
2. **No throwaway TS searcher in the early phases.** *Why:* it would be the "second searcher that drifts" ADR-0001 warns against, and the side-by-side C++ already gives us an oracle. Not worth the maintenance or the divergence risk.
3. **The execution plumbing moves to Phase 4 with the engine, not Phase 3.** *Why:* with no searcher until Phase 4, the `Executor` seam / budget / deterministic-search-mode have no caller in Phase 3. Scaffolding them early means guessing their interface against an absent consumer — the retrofit risk those hooks were meant to avoid, re-acquired in a different form. Space is left for them; they are not pre-built.
4. **`Composition`'s serializable shape is the one exception kept in Phase 3** — for the reason given above.
5. **Validate the engine by live C++ diff, not frozen golden vectors.** *Why:* the prototypes build and run cheaply and agree four ways; a live oracle is stronger than a snapshot and is one fewer fixture set to maintain. (Re-examine only if the prototypes become expensive to keep building.)
6. **Real method data comes in early in Phase 3**, so truth is tested on real methods.

## Options Considered

### Ordering: finish the core first vs. de-risk the WASM boundary first

**Option A — Complete the pure-TS core (Phase 3), then the engine (Phase 4). CHOSEN.**

| Dimension | Assessment |
|---|---|
| Risk retired first | The thing most important to get right (truth) and most fully specified |
| Toolchain churn | None in Phase 3; a single contained WASM phase later |
| Early deliverable | A genuinely usable client-side library with no WASM |

**Pros:** Ships correctness first; no toolchain context-switch mid-core; the engine lands on a verified foundation with a ready-made oracle.
**Cons:** The biggest engineering unknown (the TS↔WASM boundary) is validated later rather than sooner.

**Option B — Spike the TS↔WASM boundary now, inside Phase 3.** Prove one trivial kernel across the seam before building much on top.

**Pros:** Validates the load-bearing architectural assumption early.
**Cons:** Interrupts the core for a new toolchain; the boundary is low-risk in practice because the search path is rarely used and is easy to test side-by-side against the C++. Rejected on that basis — the de-risking value doesn't justify the context-switch when the fallback (diff against C++) is so cheap.

### Validation: live C++ diff vs. frozen golden vectors

Frozen vectors were the ADR-0001 suggestion. But the prototypes are cheap to build and already cross-validated, so diffing against them live is both stronger (catches drift on both sides) and lower-maintenance than freezing a fixture set. Chose the live diff; revisit only if keeping the C++ buildable becomes a burden.

### A temporary TS searcher behind the Executor seam

Considered for an early end-to-end demo and a second conformance implementation. Rejected: it is precisely the divergent second searcher ADR-0001 exists to prevent, and the side-by-side C++ already serves as the oracle.

## Consequences

**Becomes easier**

- Correctness is locked down and heavily tested before any performance machinery exists — the right thing to harden first.
- Phase 3 needs no new toolchain, so it proceeds at the pace of the existing TS work.
- The engine arrives in Phase 4 onto a verified core with a live C++ oracle, so its conformance check is built in.
- `Composition` being pinned to a serializable shape in Phase 3 means the Phase 4 job-spec / cache-key / result-type all exist for free.

**Becomes harder / to watch**

- The TS↔WASM boundary stays unproven until Phase 4. Mitigated by how rarely the search path runs and how cheap side-by-side C++ testing is — but if the boundary turns out to be the schedule risk, revisit Option B.
- "Leave space, don't build" for the execution plumbing requires discipline: design `Composition` and `Prover` so the Phase 4 seams *fit*, without pre-building the seams.
- Keeping the C++ prototypes buildable is now load-bearing for engine validation.

**To revisit**

- Whether any execution plumbing needs to move earlier once Phase 3 reveals the real `Composition` shape.
- The live-diff-vs-frozen-vectors call, if the prototypes stop being cheap to run.
- Pulling the WASM spike forward (Option B) if the boundary becomes the critical risk.

## Action Items

**Phase 3 (now)**
1. [ ] Implement `Composition` — fix the serializable/hashable shape first (job spec / cache key / Phase 4 result type), align with ADR-0001 "job is data."
2. [ ] Implement `Touch` (read-only view over a `Composition`) and `MethodLibrary`.
3. [ ] Implement `Prover` (Row-based verifier, `falseRows()` with line numbers).
4. [ ] Build the truth test suite: extensive positive **and** negative cases, stress-tested; seed negatives from owner-supplied worked examples.
5. [ ] Load real method data (e.g. CCCBR) early and test truth against real methods.
6. [ ] Update `context.md` roadmap at end of phase (per project convention).

**Phase 4 (deferred, space left)**
7. [ ] Engine-language spike (Rust/wasm-pack vs AssemblyScript) on the ranked-lead-head DFS + bitset truth; measure boundary overhead, fix chunk size.
8. [ ] Port the validated prototype techniques; validate by live diff against the C++ prototypes.
9. [ ] Build the execution plumbing the engine serves: `Executor` (`Local`/`Worker`/`Remote`), per-call budget, deterministic search mode, resumable chunk protocol, streaming/progress/cancel.

**Phase 5 (later)**
10. [ ] Admission controller, cost model, server handoff UX, cached composition corpus (per ADR-0001 "later").

## References

- [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) — architecture, verify invariant, the "now/next/later" action list this record sequences.
- [ADR-0002](./ADR-0002-description-vs-execution.md) — `Composition` / `Touch` / `Prover` / `SearchTruth`.
- `context.md` — current state (Phase 2 complete, 103 tests) and roadmap.
- `prototypes/grandsire_solver.cpp` (+ `…_mt.cpp`) — the validated search oracle for Phase 4.
