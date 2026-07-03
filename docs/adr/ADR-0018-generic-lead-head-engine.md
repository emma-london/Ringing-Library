# ADR-0018: Generalize the engine core to any lead-head method

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Emma (project owner)
**Amends:** [ADR-0017](./ADR-0017-engine-language-spike.md) — reshapes the
`CompositionEngine` seam it introduced: the engine is constructed from a `Method`
+ calls (not a hardcoded method) and emits `Composition` results. The optimized-TS
/ Rust-wasm-later decision of ADR-0017 is unchanged.
**Related:** [ADR-0002](./ADR-0002-description-vs-execution.md) (`Composition` as
the search result type; engine-internal `SearchTruth` = rank/bitset),
[ADR-0011](./ADR-0011-bounded-app-composition-searcher.md) /
[ADR-0012](./ADR-0012-stedman-in-bounded-searcher.md) (the lead-end vs Stedman
split this mirrors; `searchTouches` as the generic cross-oracle),
[ADR-0009](./ADR-0009-generic-method-and-call-construction.md) (`standardCalls`),
`prototypes/grandsire_solver.cpp` (the ported algorithms).

## Context

Phase 4a's first engine (ADR-0017, `src/engine/grandsire-triples-engine.ts`) is a
faithful but **Grandsire-Triples-specific** port of the C++ prototype. Two things
are hardcoded into it that shouldn't be:

1. **The method.** `N = 7`, `FACT_N = 5040`, the plain lead and the three call
   tails are literal permutation tables built inside the engine
   (`common`/`tailA`/`tailB`); the snap check is nailed to row 13; the
   reachability DP encodes Grandsire's "come-round needs an even number of
   singles" parity rule. None of this transfers to another method.
2. **The library types.** The engine imports *nothing* from the core — it
   reimplements `changeFromPlaces`, never touches `Method`/`Change`, and emits an
   ad-hoc `{ calling: string }` instead of a `Composition`. So the one value-type
   ADR-0002 designates as *the search result* (`Composition`) isn't produced, and
   the engine's method definition can silently diverge from what `Method`/`Change`
   would compute (the same class of drift ADR-0016 caught in `app/main.ts`).

Emma asked for two changes: make the DFS/MITM approach **generic over any
method**, and make the algorithms **use the library structures** (`Change`,
`Method`, `Composition`, …).

## Decision

Generalize the engine to **any lead-head (treble-hunt) method**, built from a
`Method` + `CallDefinition[]`, with the library value-types at the boundary and a
flat rank/bitset kernel inside.

### Scope: lead-head methods only

"Any method" is taken as **any treble-hunt lead-head method** — Plain Bob,
Grandsire, treble-bob/surprise, etc.: methods where the treble is the hunt bell
and a lead is delimited by the treble returning to lead. The ranked-lead-head
model generalizes to exactly these. **Principles (Stedman and kin) are out of
scope** and stay their own track, precisely mirroring the existing bounded-search
split (`searchTouches` for lead-end methods, `searchStedmanTouches` for Stedman —
ADR-0011/0012). A principle has no treble-defined lead head, so the lead-head
compaction and the whole `nextId`/`backId` table structure don't apply; folding it
in would mean a second, division-based engine mode, deferred.

### Boundary uses library types; kernel stays flat (ADR-0002)

- **Input:** `new LeadHeadEngine(method: Method, calls: CallDefinition[])`. The
  per-call lead tables are built from `method.changes` and the calls' tail
  substitution — computed through `Change.apply` on a rounds `Row`, so the engine
  and the rest of the library share one definition of what a change *does* (no
  reimplemented place-notation logic).
- **Kernel:** the DFS/MITM hot loop stays a flat typed-array rank + bitset engine.
  This is deliberate and ADR-0002-sanctioned: the search-time truth prover is the
  engine-internal `SearchTruth` (rank/bitset), *not* part of the public surface,
  precisely so it can be this fast. Putting immutable `Row`/`Change` objects in the
  inner loop (allocation + validation per node, millions of nodes) would forfeit
  the performance the whole engine exists for. Library types belong at the seams,
  not the core of the loop.
- **Output:** results are `Composition`s (via `Composition.fromCalling(method,
  calling, { calls })`), the ADR-0002/0005 result type — each independently
  re-provable by `new Touch(composition).prove()`. Come-round metadata (length in
  changes, snap flag) rides alongside.

### Generic snap, generic prune

- **Snap position generalizes to `leadLen - 1`.** For a treble-hunt method the
  treble makes its two blows at lead at rows `leadLen-1` and `leadLen`, so rounds
  can only come up mid-lead at `leadLen-1` — exactly Grandsire's row 13, now
  derived not hardcoded. The engine detects this position from the plain lead and
  guards the assumption (a method whose treble doesn't lead there gets no snap
  handling / an explicit error), rather than assuming it.
- **The parity refinement is dropped; reachability-only pruning is kept.** The C++
  "even number of singles" prune is Grandsire-specific (it depends on the calls'
  permutation signs). Rather than re-derive a per-method sign parity — a subtle,
  easy-to-get-wrong *necessary-condition* filter — the generic engine prunes with
  **reachability alone** (can this lead-head still reach rounds within the lead
  budget), which is correct for every method and never excludes a real touch. The
  project rule is explicit: **truth correctness outranks performance everywhere**,
  and the prototype itself measured parity as "rarely the binding constraint." A
  per-method parity refinement is recorded as a future optimization, not a
  requirement. Pruning strength never changes *which* touches are found (only
  speed), so the Grandsire live-diff counts are unaffected.

### API: generic engine + Grandsire preset

`LeadHeadEngine` is the generic class; **`GrandsireTriplesEngine` becomes a thin
preset** — `new LeadHeadEngine(Grandsire Triples, grandsireCalls(7))` — preserving
its exact public API so the C++ live-diff oracle (`scripts/engine-live-diff.mjs`)
and `src/tests/engine.test.ts` keep validating the same path. `CompositionEngine`
stays the seam a future Rust/wasm build implements.

### Validation

The C++ prototype only oracles Grandsire Triples, so it can't validate other
methods. The generic cross-oracle is **`searchTouches`** (ADR-0011): the bounded
searcher already enumerates true come-round touches for any lead-end method and is
itself C++-validated for Grandsire. For each test method the engine's
listed/found set must **equal `searchTouches`'s set** over the same bound, and
**every result must re-prove true via `Touch.prove()`**. Grandsire additionally
keeps its exact C++ live-diff through the preset.

## Options Considered

### Scope — lead-head only vs unified with principles

**Lead-head only (CHOSEN).** Mirrors the shipped `searchTouches` /
`searchStedmanTouches` split; the ranked-lead-head tables map 1:1 onto treble-hunt
methods; contained, validatable this pass. **Con:** Stedman needs its own engine
later. **Unified engine (rejected for now):** one class for both, but principles
have no lead-head so it needs a parallel division-based mode — materially more
design and validation than this change warrants, and no existing oracle for the
principle path beyond `searchStedmanTouches`.

### Where the library types live — boundary vs throughout

**Boundary + flat kernel (CHOSEN):** `Method`/`CallDefinition` in, `Composition`
out, tables built via `Change`; rank/bitset inside. Honors ADR-0002's explicit
"engine-internal `SearchTruth`" design and keeps the speed. **Throughout
(rejected):** using `Row`/`Change` objects in the DFS/MITM inner loop reads as
"more idiomatic" but allocates and validates a frozen `Row` per node across
millions of nodes — it would erase the performance that motivated the engine and
contradicts ADR-0002. The request to "use the library structures" is satisfied by
consuming and producing them, not by threading them through the hot loop.

### The parity prune — generalize it vs drop it

**Drop it, keep reachability (CHOSEN):** unconditionally correct for any method,
zero risk of an over-prune silently dropping a true touch, negligible measured
cost. **Generalize it from call signs (rejected for now):** a stronger prune, but
a fiddly necessary-condition to get exactly right per method (especially for the
snap/partial-lead case), and the prototype shows the payoff is small. Recorded as
a future optimization behind the same interface.

## Consequences

**Becomes easier**
- The engine runs any lead-head method (Plain Bob, Grandsire, surprise, …) from
  its `Method` + `standardCalls(method)`, not just Grandsire Triples.
- Results are `Composition`s — directly cacheable, hashable, serializable, and
  re-provable (ADR-0002/0005), with no adapter between engine output and the rest
  of the library.
- The method definition can't drift from `Change`/`Method`: tables are built from
  them, one source of truth.

**Becomes harder / to watch**
- A stage ceiling is now explicit: dense rank + an `N!`-bit truth set is fine to
  Royal (10 bells ≈ 3.6M rows ≈ 0.45 MB/bitset; lead-head tables ≈ tens of MB) but
  blows up by Maximus (12 ≈ 479M rows). The engine guards stage and treats
  higher stages as unsupported (a clear error), deferred like other stage-ceiling
  work. MITM in particular stores many row-sets and is the first to feel it.
- Correctness now rests on the `searchTouches` cross-oracle for non-Grandsire
  methods (the C++ oracle covers only Grandsire). `searchTouches` is trusted
  (re-proved + C++-diffed for Grandsire), but any future doubt about it weakens the
  engine's non-Grandsire validation — they should be kept mutually checking.
- Dropping the parity prune means find-mode does marginally more work on
  Grandsire than the C++ does; acceptable per the correctness-first rule, and
  recoverable via the recorded future optimization.

**To revisit**
- Per-method parity (sign-based) reachability refinement, if a workload shows the
  reachability-only prune is too weak.
- A non-dense truth structure (hashed row ids) if Maximus-stage search is ever
  needed.
- Folding principles (Stedman) into a unified or sibling engine, when that track
  is picked up (currently `searchStedmanTouches`).

## Validation outcome (a vindication of dropping parity)

Generalizing surfaced a real gap in the C++ prototype's `find`: it returns only
**lead-end** touches of exactly *L* leads and silently drops the **snap** ones —
e.g. `find 10` returns 10, while the prototype's own `count 10` reports 24
(10 lead-end + 14 snap). The cause is exactly the Grandsire-specific parity DP
ADR-0018 chose *not* to carry: it assigns a full lead's call-parity to a
13-change snap lead, so the exact-parity prune wrongly excludes snap-terminated
touches in find mode. The engine's **reachability-only** `find` returns all 24,
each re-proved true via `Touch.prove()` and matching `count`/`list`. So the
generic engine is *more* complete than the C++ `find` here — the live-diff for
`find` therefore checks against the prototype's `list`/`count` (which handle
snaps), not its `find`. This is direct evidence for the ADR-0018 decision:
dropping the fiddly parity refinement removed a latent correctness bug, at
negligible measured cost.

## Action Items

1. [x] `src/engine/lead-head-engine.ts` — the generic engine from `Method` +
   `CallDefinition[]`; tables from `Change`; `Composition` results; reachability
   prune; stage guard.
2. [x] `GrandsireTriplesEngine` → thin preset over `LeadHeadEngine`; keeps its API
   and the C++ live-diff green (via `list`/`count`, see above).
3. [x] Cross-oracle tests vs `searchTouches` + `Touch.prove()` for Plain Bob
   (Major/Minor/Triples), Grandsire Triples, and Cambridge Surprise Major
   (`src/tests/lead-head-engine.test.ts`); exact set match, plain course re-proved.
4. [ ] Update `docs/adr/README.md`, `context.md`, and architecture memory.
