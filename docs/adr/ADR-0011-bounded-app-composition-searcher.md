# ADR-0011 — A bounded composition searcher in the app, ahead of the Phase 4 engine

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Project
- **Related:** [ADR-0003](ADR-0003-phasing-and-roadmap.md) (phasing — searcher deferred to Phase 4; "no throwaway TS searcher"); [ADR-0001](ADR-0001-cross-platform-compute-architecture.md) (the WASM search engine + verify-on-client invariant); [ADR-0002](ADR-0002-description-vs-execution.md) / [ADR-0005](ADR-0005-composition-identity-and-proof-result.md) (`Composition` / `Touch` / `Prover` / `Proof`); [ADR-0006](ADR-0006-call-model-and-come-round.md) (lead-end call model, come-round at every row); [ADR-0007](ADR-0007-stedman-and-six-based-calling.md) (six-based calling); [ADR-0010](ADR-0010-test-bench-deployment.md) (the `app/` test bench)

## Context

The test bench gained a feature request: after picking a method, *"give me true compositions up to N changes"* — a small search, capped at 250 changes to start, returning a list of true callings that come round.

This bumps directly against **ADR-0003**, which deferred *the searcher and all execution plumbing* to **Phase 4** and stated plainly: **"No throwaway TS searcher."** The reasoning there is sound and still holds. The C++ research spike (`prototypes/`) shows that real search at quarter-peal/peal length needs *structure* — backward reachability DP, Q-set/parity pruning, meet-in-the-middle on the ranked lead-head state, multipart symmetry. Truth-pruning alone barely dents the tree (~2.8×/lead). That scalable engine is to be written **once**, in WASM, validated by live diff against the C++ prototypes (ADR-0001/0003) — *not* hand-rolled in TypeScript only to be torn out.

The question this ADR settles: **does the requested feature *make us build that forbidden searcher early*, or is it a different, smaller thing?**

The forces in tension:

- The number of *true come-round* touches explodes fast — the C++ `count` mode shows tens of billions by ~30 leads (83 by 10 leads, 859 by 12, …). A literal "all compositions up to 250 changes" is infeasible and meaningless to display.
- But the request is naturally **bounded**: *shortest first*, with a **result cap** and a **length ceiling**. Under that framing you never enumerate the astronomical tail — short true touches are found cheaply by a plain truth-pruned walk over the rows the core already produces.
- The app (ADR-0010) is a thin client of the real core. A searcher that *reuses* `Method` / `Change` / `Row` and reports results re-provable by `Touch.prove()` adds no new truth authority and no new toolchain.

## Decision

Add a **bounded, capped, shortest-first composition searcher** to the app in Phase 3 — `src/search.ts`, exported as `searchTouches` with a "Search" tab in `app/` — **explicitly scoped so it is not the searcher ADR-0003 deferred**, and recorded as such here. Specifically:

1. **It is bounded by construction, not by hope.** Three hard ceilings, all enforced in code: a **length cap** (`maxChanges`, default and UI-capped at **250**), a **result cap** (`limit`, shortest first), and a **node budget** (`maxNodes`) that guarantees termination in well under a few seconds for any method. When a ceiling stops the search it reports `truncated: true`; it never claims completeness it didn't achieve.

2. **It is the dumb algorithm on purpose.** An iterative-deepening DFS over the per-lead choice of plain/call, truth-pruned by a row-set, recording a touch only when it *first* comes round (come-round checked at *every* row, so Grandsire snaps fall out for free — ADR-0006). **No reachability DP, no rank/bitset, no Q-sets, no MITM.** Those are the Phase 4 engine's job. Keeping the body naive is what makes it cheap to delete later.

3. **The interface is the durable part; the body is the disposable part.** `searchTouches` returns plain, serializable `SearchResult` data (`calling`, `changes`, `leads`, `snap`) behind a stable signature. Phase 4 swaps the *implementation* for the WASM engine without the app, the result type, or this signature changing. The throwaway is contained to one file's DFS — not a hand-rolled truth engine, not a new public type, not UI that assumes a particular algorithm.

4. **Verification rides the project's existing discipline.** Truth carries the weight (CLAUDE.md): every returned touch is independently re-proved by `Touch.prove()` in the tests, and the searcher's exhaustive output is **live-diffed against the C++ `grandsire_solver` prototype** — exact per-length counts (lead-end vs snap) and exact callings up to 6 leads, 83 touches to 10 leads — exactly the "validated by live diff against the C++ prototypes" stance ADR-0003 sets for the engine.

5. **Scope is the lead-end call model (ADR-0006):** Grandsire and the Plain Bob / surprise family. **Stedman's six-based calling (ADR-0007) is out of scope** for this bounded searcher and is left to Phase 4; the Search tab omits it and `searchTouches` rejects multi-character (compound) call symbols rather than silently mis-rendering them.

**Acknowledged explicitly (the deciders' caveat):** this is bounded work we accept will be **re-thought in Phase 4**, and the *body* of `src/search.ts` is expected to be replaced by the WASM engine. That is acceptable precisely because the throwaway is confined to a naive DFS behind a stable interface — not a parallel truth authority. If Phase 4 finds itself preserving or extending this DFS rather than replacing it, that is a signal to revisit this ADR.

## Options Considered

- **Defer entirely to Phase 4 (honour ADR-0003 literally).** The safest read of the existing phasing. Rejected *as the whole answer* because the requested feature is genuinely smaller than the deferred engine: its caps sidestep the combinatorial explosion that motivated the deferral, and it needs none of the structural search techniques. Deferring would also leave the test bench unable to demonstrate truth-at-scale at all until Phase 4. (Had the request been for long lengths or completeness, this option would have won.)

- **Build a *scalable* TS searcher now.** Port the reachability DP / MITM from the C++ prototypes to TS for the app. **Rejected outright** — this *is* the "throwaway TS searcher" ADR-0003 forbids: large, duplicative of the Phase 4 engine, and validated against the same prototypes the engine will use. All cost, and it gets torn out.

- **Bounded naive searcher in `src/`, behind a stable interface (chosen).** Reuses the tested core, hard ceilings, disposable body, durable result type and signature. Minimises throwaway to a single DFS while delivering the feature.

- **Bury the search loop inside the app UI (`app/main.ts`).** Simpler wiring, no new `src/` module. Rejected: it would put an (even if temporary) algorithm outside the tested core, can't be unit-tested or live-diffed against the C++ oracle, and gives Phase 4 nothing to cleanly swap. Putting it in `src/` with tests is the lower-throwaway choice even though the code is temporary.

- **Result scoping — "all up to N" vs capped-shortest-first vs counts-only.** "All" is infeasible (the explosion). "Counts only" is cheap but unactionable. **Capped, shortest-first** was chosen: it is the only framing that is both bounded and useful, and it is what makes the naive algorithm viable (you stop before the tail).

- **Snap handling — special-case row 13 (as the C++ does) vs come-round-at-every-row (as `Touch` does).** Chose the latter, reusing the existing `Touch` semantics (ADR-0006) so the searcher and the rest of the core agree on what "comes round" means by construction.

## Consequences

**Easier**

- The test bench can now answer "find me true touches up to N changes" for the lead-end methods, shortest first, with snaps surfaced — and each result opens straight into Compose & Prove.
- The searcher is unit-tested and **cross-checked against the C++ oracle**, so it is trustworthy now and a ready reference point when the Phase 4 engine is validated against the same prototypes.
- `searchTouches`'s signature gives Phase 4 a concrete, already-exercised seam to implement against.

**Harder / to revisit**

- There is **deliberate, bounded overlap** with Phase 4: the engine will supersede `src/search.ts`'s body. Tracked here so it is not silent. When the WASM engine lands, replace the DFS behind the same interface and update this ADR's status accordingly (likely *Superseded by* the Phase 4 search ADR).
- The searcher is **not complete and not for long lengths** — by design. Results past the caps are not shown (`truncated` flags this). Anyone wanting completeness or peal-length search must wait for Phase 4.
- **Stedman is unsupported** in search until the six-based calling path exists (ADR-0007 successor / Phase 4).
- Performance is "fine for a test bench" (sub-second to a few seconds within the caps), not engineered; the node budget is the backstop. It is not a basis for any throughput expectation of the real engine.
