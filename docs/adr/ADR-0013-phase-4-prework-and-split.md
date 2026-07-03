# ADR-0013: Phase 4 pre-work and split (pre-4 → 4a → 4b)

**Status:** Accepted
**Date:** 2026-07-02
**Deciders:** Emma (project owner)
**Supersedes:** [ADR-0003](./ADR-0003-phasing-and-roadmap.md) (phasing and roadmap)
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md), [ADR-0008](./ADR-0008-truth-fixture-corpus.md), [ADR-0009](./ADR-0009-generic-method-and-call-construction.md), [ADR-0011](./ADR-0011-bounded-app-composition-searcher.md), [ADR-0012](./ADR-0012-stedman-in-bounded-searcher.md), [ADR-0014](./ADR-0014-executor-offline-fallback.md) (Draft, added to 4b 2026-07-03), [ADR-0015](./ADR-0015-cccbr-method-library-data-source.md) (Draft, added to 4a 2026-07-03)

## Context

Phase 3 is complete (210 tests, truth-first core). ADR-0003 defined Phase 4 as
"the WASM engine and all the execution machinery that only exists to serve a
searcher" — a single undifferentiated phase. Two things have become clear now
that Phase 4 is about to start:

1. **Two backlog items are unsequenced against Phase 4.** ADR-0008 (declarative
   truth-fixture corpus) and ADR-0009 (generic method & call construction) are
   both `Draft`, both scoped, both independent of WASM — but neither ADR-0003
   nor `context.md` says *when* they happen relative to the engine work. ADR-0009
   already flags a preference ("after ADR-0008 so the broadened call coverage is
   validated against the centralised corpus") but that was never promoted to a
   phasing decision.
2. **Phase 4 bundles two risk profiles with a one-directional dependency.** The
   engine (language spike, porting the validated C++ algorithms, live-diff
   validation) is a self-contained mathematics/toolchain problem. The execution
   plumbing (`Executor` seam, budget, deterministic mode, resumable chunk
   protocol, streaming/progress/cancel) has no caller until the engine exists —
   ADR-0003 already noted this as the reason the plumbing was deferred past
   Phase 3. That same one-directional dependency exists *inside* Phase 4: the
   plumbing depends on the engine, never the reverse. Treating them as one
   block hides a natural checkpoint and makes the phase hard to estimate or
   schedule partially.

This ADR revises ADR-0003's phase structure to address both.

## Decision

Insert a **pre-4** step ahead of the engine work, and split **Phase 4** into
**4a** (engine core) and **4b** (execution plumbing + integration).

### Pre-4 — Close out the call-model backlog

Finalize and implement, **in this order**:

1. **ADR-0008** — the declarative truth-fixture corpus. Promote `Draft` →
   `Accepted`, build the fixture file + per-family adapters, migrate the
   scattered oracles (`example-touches.test.ts`, `stedman-calls.test.ts`,
   `docs/example-touches.md`) onto it.
2. **ADR-0009** — generic method & call construction. Promote `Draft` →
   `Accepted`, build `standardCalls(method)` + the Grandsire/Stedman
   special-case registry, replacing the per-method factories as the public
   surface.

Both are pure-TS, no new toolchain, and were already fully scoped as Draft
ADRs before Phase 3 closed — this is finishing already-started thinking, not
new work.

Also folded into pre-4, unordered relative to the above (no dependency either
way):

3. **Bell names beyond Maximus** — `src/bell.ts`'s `BELL_NAMES` stops at 12
   (`1234567890ET`); extend to the standard higher-stage symbols and add
   tests. Small, concrete, no ADR needed. It rides along with pre-4 rather
   than sitting in general backlog because it's the same shape of work
   (small, pure-TS, zero toolchain risk) and pre-4 is already the checkpoint
   for "finish the loose ends before the WASM migration starts" — no reason
   to leave it stranded once that checkpoint exists.

### Phase 4a — WASM engine core

The mathematics/toolchain half of ADR-0003's original Phase 4:

- Spike the engine language (Rust/wasm-pack vs AssemblyScript) on the
  ranked-lead-head DFS + bitset truth kernel; measure boundary overhead.
- Port the remaining validated prototype techniques: reachability DP,
  meet-in-the-middle, Q-set generative search, snap-finish handling.
- Validate by live diff against `grandsire_solver.cpp` / `…_mt.cpp` (per
  ADR-0003's existing validation call).

Deliverable: a working, verified WASM module, callable directly (even
synchronously, with no `Executor` or chunking) — a genuine checkpoint, not a
half-built phase.

> **Amended by [ADR-0017](./ADR-0017-engine-language-spike.md) (2026-07-03):**
> the language spike found AssemblyScript ~2.3× *slower* than optimized TS on the
> kernel, and Rust/wasm-pack (the only real speed win) unprovisionable in this
> sandbox/CI. The 4a deliverable is therefore revised to "a working, verified
> engine core behind a **stable seam**, in optimized TS," with WASM compilation
> (via Rust/wasm-pack, **not** AssemblyScript) deferred to a future drop-in behind
> the same seam. The pre-4 / 4a / 4b split and all other 4a scope (algorithms,
> live-diff validation, the "callable directly" checkpoint) stand unchanged.

> **Addendum (2026-07-03):** also scoped into 4a — vendoring the full CCCBR
> method library as a **bundled static snapshot** (not a live fetch), so
> `MethodLibrary` can offer the complete method set without an app needing
> network access just to look up a method. Bundling over fetching is the
> direction Emma set, given the upstream data changes only ~monthly.
> Mechanics (refresh script, format, lazy-loading, staleness marker,
> relationship to `STANDARD_METHODS`) are open questions framed in the new
> [ADR-0015](./ADR-0015-cccbr-method-library-data-source.md) (Draft).

### Phase 4b — Execution plumbing + integration

The systems half, entirely downstream of 4a:

- `Executor` seam (`Local`/`Worker`/`Remote`), per-call budget, deterministic
  search mode.
- Resumable chunk protocol (`init`/`run`/`cancel`/`free`); streaming/progress/
  cancellation wired through the `Worker` executor.
- Swap `src/search.ts`'s two bounded DFS searchers (`searchTouches`,
  `searchStedmanTouches`) for the 4a engine behind the same `SearchReport`
  interface — the integration ADR-0011/0012 already flagged as expected,
  removing their length/result/node ceilings in the process.

> **Addendum (2026-07-03):** also scoped into 4b — the `Executor`'s `Remote`
> variant must **fail gracefully** when connectivity isn't available,
> degrading to an on-device path (`Worker`/`Local`) rather than simply
> erroring. Flagged during a conversation about offline-capable future apps:
> the core is already zero-I/O, but `Remote` is the one `Executor` variant
> that inherently needs a network (ADR-0001's original three-executor
> design). Detection strategy, fallback target, resumability, and UX
> visibility are open questions framed in the new
> [ADR-0014](./ADR-0014-executor-offline-fallback.md) (Draft).

## Options Considered

### Sequencing pre-4 vs folding ADR-0008/0009 into Phase 4a

**Option A — Sequence pre-4 strictly before 4a (CHOSEN).** Close out the
call-model/truth-corpus refactor while everything is still pure TS, before a
toolchain migration is in flight.

**Pros:** ADR-0008 and ADR-0009 touch the same surface (`CallDefinition`,
`MethodLibrary`, the truth oracles) that 4a's live-diff validation depends on
being stable — validating against a call surface that's mid-refactor is a
moving target. Keeps the WASM toolchain migration isolated as the only thing
changing during 4a, so a regression during 4a is unambiguously about the
engine, not an entangled TS refactor. Matches ADR-0009's own noted preference.
**Cons:** Delays the start of engine work by however long pre-4 takes.

**Option B — Do pre-4 concurrently with 4a.** Both are scoped and
independent in principle.

**Pros:** No calendar delay to 4a.
**Cons:** Doubles the surface area under change at once (call-model semantics
*and* a new toolchain), makes it harder to attribute a regression to either,
and works against ADR-0009's own stated sequencing preference. Rejected.

**Option C — Leave ADR-0008/0009 as unscheduled backlog, start 4a now.**
Status quo per ADR-0003/`context.md`.

**Pros:** Fastest path to the engine.
**Cons:** Leaves two Draft ADRs open indefinitely with no forcing function;
risks 4a validating against a call surface (per-method factories) that's
already known to not scale, then having to re-validate after ADR-0009 lands
later anyway. Rejected.

### Splitting Phase 4 into 4a/4b vs keeping it as one phase

**Option A — Split into 4a/4b (CHOSEN).** See Decision above.

**Pros:** The dependency between engine and plumbing is already
one-directional (ADR-0003 noted the plumbing has "no caller" without a
searcher); splitting just makes that structure visible and schedulable. 4a
alone is a demonstrable, live-diffable deliverable. Different risk profiles
(numerical/toolchain vs systems/concurrency) get different, focused
attention instead of one large phase mixing both.

**Pros (cont.):** Mirrors the "Now / Next / Later" tiering ADR-0001 already
used for its action items — 4a is that ADR's "Next," 4b is its "Now-deferred"
plumbing.

**Cons:** Two phase boundaries to track instead of one; a small amount of
process overhead (another `context.md` update, another checkpoint).

**Option B — Keep Phase 4 as a single undifferentiated phase.**

**Pros:** Fewer named phases.
**Cons:** No natural checkpoint between "the engine works" and "the engine is
wired up" — a delay anywhere in the combined phase reads as "Phase 4 is late"
with no way to say which half is the problem. Rejected: the split costs
almost nothing and buys a real checkpoint.

## Consequences

**Becomes easier**

- Pre-4 clears the call-model debt (per-method factories, scattered truth
  oracles) while it's still cheap, pure-TS work — before it's entangled with
  a toolchain migration.
- 4a is independently checkpoint-able: a working, live-diff-verified WASM
  kernel is a real deliverable even before any plumbing exists, and de-risks
  the Rust-vs-AssemblyScript choice before more work is built on top of it.
- 4b's scope is now crisply "wire up an engine that already works," not
  "build the engine and wire it up" — easier to estimate, easier to test
  (interface/behavior tests of the seam, not correctness-of-search tests).

**Becomes harder / to watch**

- Two extra phase boundaries to track in `context.md`'s roadmap.
- Risk that pre-4 scope-creeps beyond what ADR-0008/0009 already drafted —
  both should stay tightly scoped to their existing Draft content, not grow
  new ambition now that they're on the critical path to 4a.
- If pre-4 work reveals the call model needs an ADR-0006 amendment (ADR-0009
  already flags this as possible), that amendment must land before 4a's
  live-diff validation, since the diff needs a stable call surface.

**To revisit**

- Whether 4a's "callable synchronously, no plumbing" checkpoint is itself
  worth exposing somewhere (e.g. a CLI/test harness) before 4b starts, purely
  for early feedback.
- Re-examine this split if 4b turns out to be small enough not to warrant a
  separate phase once 4a's actual engine shape is known.

## Action Items

**Pre-4**
1. [ ] Promote ADR-0008 `Draft` → `Accepted`; implement the fixture corpus +
   per-family adapters; migrate existing oracles onto it.
2. [ ] Promote ADR-0009 `Draft` → `Accepted`; implement `standardCalls()` +
   the Grandsire/Stedman special-case registry.
3. [ ] Extend `BELL_NAMES` beyond Maximus to the standard higher-stage
   symbols (confirm convention against CCCBR); add tests. No ordering
   dependency on items 1–2.
4. [ ] Update `context.md` roadmap and backlog sections.

**Phase 4a**
4. [ ] Engine language spike (Rust/wasm-pack vs AssemblyScript) on the
   ranked-lead-head DFS + bitset truth kernel; measure boundary overhead, fix
   chunk size.
5. [ ] Port reachability DP, meet-in-the-middle, Q-set generative search,
   snap-finish handling.
6. [ ] Validate by live diff against `grandsire_solver.cpp` / `…_mt.cpp`.
6a. [ ] *(Added 2026-07-03)* Resolve [ADR-0015](./ADR-0015-cccbr-method-library-data-source.md)'s
   open questions (refresh mechanism, format, lazy-loading, staleness
   marker); vendor a bundled snapshot of the full CCCBR method library and
   wire it into `MethodLibrary` alongside `STANDARD_METHODS`.

**Phase 4b**
7. [ ] `Executor` seam (`Local`/`Worker`/`Remote`), per-call budget,
   deterministic search mode.
8. [ ] Resumable chunk protocol (`init`/`run`/`cancel`/`free`);
   streaming/progress/cancel through the `Worker` executor.
9. [ ] Swap `src/search.ts`'s bounded searcher bodies for the 4a engine
   behind the existing `SearchReport` interface (supersedes ADR-0011/0012's
   DFS bodies); drop the app's length/result/node ceilings.
9a. [ ] *(Added 2026-07-03)* Resolve [ADR-0014](./ADR-0014-executor-offline-fallback.md)'s
   open questions and implement the `Remote` → `Worker`/`Local` graceful
   fallback contract as part of the `Executor` seam, not as an afterthought
   once `Remote` already exists.

## References

- [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) — architecture,
  the "Now/Next/Later" action-item tiering this ADR mirrors for the 4a/4b split.
- [ADR-0003](./ADR-0003-phasing-and-roadmap.md) — the phasing this ADR
  supersedes; Phase 3 completion and the original (undifferentiated) Phase 4.
- [ADR-0008](./ADR-0008-truth-fixture-corpus.md), [ADR-0009](./ADR-0009-generic-method-and-call-construction.md) —
  the pre-4 work.
- [ADR-0011](./ADR-0011-bounded-app-composition-searcher.md), [ADR-0012](./ADR-0012-stedman-in-bounded-searcher.md) —
  the bounded searchers 4b's integration step supersedes.
- `prototypes/grandsire_solver.cpp` (+ `…_mt.cpp`) — the 4a validation oracle.
- [ADR-0014](./ADR-0014-executor-offline-fallback.md) *(Draft, added 2026-07-03)* —
  the `Remote` → `Worker`/`Local` graceful-degradation requirement, scoped
  into 4b.
- [ADR-0015](./ADR-0015-cccbr-method-library-data-source.md) *(Draft, added
  2026-07-03)* — the bundled-snapshot decision for the full CCCBR method
  library, scoped into 4a.
