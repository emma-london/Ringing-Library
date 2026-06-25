# ADR-0002: Separating description from execution — renaming `Touch` and `Proof`

**Status:** Accepted
**Date:** 2026-06-20
**Deciders:** Emma (project owner)
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md). The two *To revisit* items (Composition metadata; whether to add a `Proof` value type) are resolved by [ADR-0005](./ADR-0005-composition-identity-and-proof-result.md).

## Context

The TypeScript library inherits its decomposition from the 1990s C++ `ringing-lib`. Reviewing that structure against the architecture in ADR-0001, the value-type spine (`Bell`, `Stage`, `Row`, `Change`, `PlaceNotation`, `Method`, `MethodLibrary`) holds up well and is reinforced by our plans — these model mathematical objects that don't age, and they are exactly the portable, deterministic "domain core" the verifier and every platform rely on.

Two classes do **not** sit as comfortably: `Touch` and `Proof`. Both have always felt bolted on. The reason is now clear: the original library was designed for a **single-process, compute-now, ephemeral, desktop** world, and `Touch`/`Proof` encode that assumption. They model *execution* rather than *the domain*, and ADR-0001 changed the execution model to distributed, asynchronous, cached, and budgeted. The strain is therefore concentrated in exactly these two classes.

Specifically:

- **`Proof` conflates two roles.** As sketched it stores `Row` objects in a map and offers `remove()` explicitly "for backtracking during composition search." In the old world one class was both the *verifier* (is this finished touch true?) and the *search-time prover* (backtracking truth during a DFS). ADR-0001 splits these into two layers: a cheap `Row`-based verifier in the core (the trust boundary that re-proves any result) and a dense rank/bitset prover **inside the WASM engine** (the search hot loop, where `Row`-object maps would be fatal). One class can no longer be both.

- **`Touch` is a mutable imperative builder, but a touch now needs to be data.** As sketched, `Touch` is mutated via `defineCall(...)`/`call(...)` returning `void`. But ADR-0001 requires a touch to be a **serializable, hashable value**: it is the job spec that moves between `Local`/`Worker`/`Remote` executors, the content-addressed cache key, and the value the search engine *emits* as a result. An imperative builder can be none of those.

Critically, **neither class is implemented yet** — they exist only in `ringing-api-sketch.ts`; `src/` contains only `bell`, `change`, `method`, `place-notation`, `row`. This is the cheapest possible moment to correct the design, before Phase 3 builds them.

## Decision

Re-cast both classes around a single principle: **separate the immutable description of a touch from the execution over it**, and rename them so the names reflect purpose. The chosen names use authentic ringing vocabulary (a *composition* is the calling on paper; a *touch* is the calling actually rung; *proving* is checking truth).

1. **Introduce `Composition`** — an immutable, serializable value: `(method reference, start row, ordered calls, target length)`. This is the description. It is the job spec (ADR-0001 "a job is location-independent serializable data"), the cache key, and the search engine's result type. Replaces the *builder* role of the old `Touch`.

2. **Redefine `Touch`** — keep the name, drop the mutability. A `Touch` becomes a read-only **expansion/view** constructed from a `Composition`: iterate `rows()`, get `rowCount()`. Pure execution over a description. (Convenience builders may still produce a `Composition`, but the `Composition` is the source of truth, not a mutated object.)

3. **Rename `Proof` → `Prover`** — the cheap, `Row`-based **verifier** and trust boundary. It proves a finished `Touch`/`Composition` true and reports *where* it is false (`falseRows()` with line numbers — a genuinely useful verifier feature, retained). The `remove()` method and its "composition-search backtracking" rationale are **dropped**: backtracking search no longer happens here.

4. **Keep the search-time prover internal.** The rank/bitset truth structure lives inside the WASM engine (working name `SearchTruth`), is not part of the public surface, and is never expressed in terms of `Row` objects. Its `remove`-as-unmark-a-bit operation is the home for the backtracking that used to justify `Proof.remove()`.

## Options Considered

### The structural decision: split vs. patch

**Option A — Split description from execution (CHOSEN).** Introduce `Composition` as data; make `Touch` a view; make `Prover` purely the verifier.

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low now (nothing implemented); avoids a costly retrofit later |
| Fit with ADR-0001 | Direct — yields the serializable job spec / cache key / result type for free |
| Immutability | Restores it; `Touch` stops being the lone mutable class |

**Pros:** One clean concept (data vs. view) fixes both classes; gives ADR-0001 the value types it needs; authentic domain vocabulary.
**Cons:** Two concepts where there was one (`Composition` + `Touch`); a small amount of new surface.

**Option B — Keep one mutable `Touch` and one dual-role `Proof`, patch as needed.** Add `serialize()`/`hash()` to the existing `Touch`; keep `Proof.remove()`.

**Pros:** Fewer types; closest to the original.
**Cons:** Perpetuates the conflation; a mutable object that also claims to be a cache key is a bug magnet; re-imports the divergence/clarity problems ADR-0001 set out to avoid. Rejected.

### The naming decision

Names are easy to change later; recommendations in **bold**, alternatives listed so the choice is on record.

| Role | Recommended | Alternatives considered |
|---|---|---|
| Immutable touch description (data) | **`Composition`** | `TouchSpec`, `Calling`, `TouchPlan` |
| Read-only rung expansion (view) | **`Touch`** (redefined) | `RungTouch`, `RowBlock` (C++ term), `TouchExpansion` |
| Core verifier / trust boundary | **`Prover`** | `Verifier`, `TruthChecker`, keep `Proof` |
| Engine-internal search truth | **`SearchTruth`** (internal) | `RankProver`, `BitsetTruth` |

Rationale for the recommendations: `Composition` and `Touch` mirror how ringers already talk (paper calling vs. rung result), so the data/view split lands intuitively. `Prover` names the actor that *proves* a touch and reads naturally as the trust boundary, while leaving the word "proof" free for a possible value-type result later. `SearchTruth` is deliberately unglamorous because it is private to the engine.

## Trade-off Analysis

The only real cost of Option A is one extra public concept (`Composition` alongside `Touch`). That cost is paid back immediately: the same `Composition` value *is* the job spec, the cache key, and the search result, so three separate needs from ADR-0001 are satisfied by one type instead of bolted onto a mutable object after the fact. Doing this now, pre-implementation, is essentially free; doing it after Phase 3 builds a mutable `Touch` and a dual-role `Proof` would be a breaking change to a published surface.

On naming specifically: keeping the word `Touch` (rather than inventing `RungTouch`) preserves continuity with `context.md` and the domain, at the small risk that readers expect the old mutable builder. The ADR resolves that by pinning `Touch` firmly to the *view* meaning. Renaming `Proof`→`Prover` is the higher-friction rename (it's the more familiar word), but it is the one that most clearly signals the role change, which is the whole point of this ADR.

## Consequences

**Becomes easier**

- ADR-0001's executor handoff, caching, and search-result handling all consume one immutable `Composition` value — no special-casing a mutable object.
- The trust boundary is unmistakable: `Prover` verifies; the engine searches; they share no class.
- Immutability is now uniform across the public surface.
- `falseRows()`-with-line-numbers stays as a first-class "tell me *where* it's false" feature of the verifier.

**Becomes harder / to watch**

- One more public concept to document and teach (`Composition` vs `Touch`).
- We must keep `SearchTruth` genuinely internal so it never leaks `Row`-object semantics into the hot loop.
- `context.md`'s domain-concepts table and the API sketch need updating to the new names.

**To revisit**

- Whether a `Proof` *value type* (an immutable record of a proving result — true/false + false rows) is worth adding later, now that `Prover` is the actor.
- Whether `Composition` should carry optional metadata (composer, music score) or whether that belongs in the `CompositionLibrary` corpus from ADR-0001.

## Action Items

1. [ ] Update `ringing-api-sketch.ts`: replace `Touch` with `Composition` (data) + `Touch` (view); rename `Proof` → `Prover`; remove `Prover.remove()` and its composition-search note.
2. [ ] Specify `Composition` as a plain serializable shape (method ref, start row, calls, length) suitable for hashing and transport — align it with the ADR-0001 "job spec."
3. [ ] Note `SearchTruth` as an engine-internal type in the ADR-0001 engine boundary; it owns the backtracking (`remove`-as-unmark).
4. [ ] Update `context.md` domain-concepts table and the "Likely next steps / Phase 3" section to the new names.
5. [ ] Carry the new names into the Phase 3 implementation of `Prover`, `Composition`, and `Touch`.

## References

- [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) — three-layer architecture, verify invariant, job-as-data, engine boundary.
- `ringing-api-sketch.ts` — current sketched surface (`Touch`, `Proof`).
- `context.md` — domain-concepts table to be updated.
