# ADR-0012 — Stedman (six-based calling) in the bounded app searcher

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Project
- **Related:** [ADR-0011](ADR-0011-bounded-app-composition-searcher.md) (the bounded searcher this extends — its Stedman exclusion is superseded here); [ADR-0007](ADR-0007-stedman-and-six-based-calling.md) (Stedman as a double-six principle; six-end calls bob `5` / single `567`; `stedmanTriplesComposition`); [ADR-0006](ADR-0006-call-model-and-come-round.md) (come-round at every row); [ADR-0003](ADR-0003-phasing-and-roadmap.md) (phasing — the scalable engine is still Phase 4); [ADR-0010](ADR-0010-test-bench-deployment.md) (the `app/` test bench)

## Context

ADR-0011 added a bounded, capped, shortest-first composition searcher (`src/search.ts` / `searchTouches`) and a "Search" tab, but **scoped it to the lead-end call model** (Grandsire, Plain Bob / surprise). It explicitly put **Stedman out of scope** (ADR-0011 §5): the Search tab omits it and `searchTouches` rejects multi-character (compound) call symbols. The stated reason was that Stedman's calls fall at *six-ends*, not lead-ends, and ADR-0006's one-call-per-lead model expresses a double-six only through the eight compound calls of `stedmanTriplesCalls()` — symbols like `BB`, `SP` — which the lead-end DFS cannot walk.

The consequence: a user on the Search tab sees Grandsire and Plain Bob but **not Stedman Triples**, even though the library proves Stedman perfectly (`stedmanTriplesComposition`, verified true against published touches — ADR-0007). For a library whose headline is truth across *real* methods, a flagship principle being absent from search is a real coverage gap, not a cosmetic one. It was raised directly as a stress-test omission.

The forces in tension are the same ones ADR-0011 weighed, and they still hold:

- The scalable, long-length search engine is **Phase 4**, in WASM, validated against the C++ prototypes. This ADR must not pull that forward.
- But Stedman search at *bounded, shortest-first* length is exactly as small as the lead-end case ADR-0011 already accepted — the explosion is sidestepped by the same caps.
- The truth authority must stay singular. Any Stedman searcher must report only touches the existing `Touch` / `Prover` would independently confirm, and its results must round-trip through `stedmanTriplesComposition` for re-proving.

The key realisation that unblocks this cheaply: **the compound double-six calls were a consequence of ADR-0006's one-call-per-lead constraint, not of Stedman itself.** A searcher is free to make its decision *per six* rather than per lead. Per six, the calls are single changes with single-character symbols — plain `7`, bob `5`, single `567` — substituted for the `7` that begins each six. The whole reason `searchTouches` rejected Stedman (multi-character symbols) simply does not arise when the search unit is the six.

A small empirical step pins the geometry down. Stedman Triples is a 2-change "lead-in" (`3.1` from rounds) followed by sixes that alternate two templates — `[head, 3, 1, 3, 1, 3]` (quick) and `[head, 1, 3, 1, 3, 1]` (slow) — where `head` is the six-end change (`7` plain, `5` bob, `567` single). Walking that change stream and checking come-round at every row reproduces `new Touch(stedmanTriplesComposition(calling)).rows()` **row-for-row** for the plain course, SLQ, and mixed single/bob callings; the plain course's come-round at row 84 (two changes shy of the 14th six-end — a "half-six" finish) falls out of the every-row check exactly as it does in `Touch`.

## Decision

**Bring Stedman / six-based calling into the bounded searcher, superseding ADR-0011's Stedman exclusion (§5).** Specifically:

1. **Add `searchStedmanTouches` to `src/search.ts`**, returning the *same* `SearchReport` / `SearchResult` types as `searchTouches` behind a stable signature. It is a per-six iterative-deepening, truth-pruned DFS over the choice {plain, bob, single} at each six, with the **same three hard ceilings** as ADR-0011 (`maxChanges` default/UI-capped at 250, `limit` shortest-first, `maxNodes` budget) and the same `truncated` honesty. The `calling` it returns is the **per-six string** ringers already use (`.` plain, `-` bob, `s` single), the exact input `stedmanTriplesComposition` consumes.

2. **It stays the dumb algorithm on purpose**, exactly as ADR-0011 §2: no reachability DP, no rank/bitset, no Q-sets, no MITM. Come-round is checked at *every* row (so a half-six finish needs no special case), mirroring `Touch`. The body remains disposable behind the interface; Phase 4's engine is still the real searcher.

3. **`SearchResult` field semantics for six-based results** are documented, not changed: `changes` is the length in changes as before; `leads` carries the **number of sixes** rung; `snap` follows the **same `Touch.isSnapFinish` rule the rest of the core uses** — `true` when the touch comes round other than on a double-six (lead) boundary (`changes % leadLength !== 0`), the direct analogue of a Grandsire snap. Using the identical rule keeps the Search tab and the Compose tab in agreement when a result is opened.

4. **The lead-end path is untouched.** `searchTouches` keeps its signature, its body, its tests, and its rejection of multi-character symbols — Stedman simply no longer routes through it. The new function is a sibling, not a generalisation that risks the heavily-tested lead-end DFS. (Deliberate, contained duplication of the DFS scaffold; both are throwaway behind the interface — see Options.)

5. **Verification rides the same discipline (CLAUDE.md, ADR-0011 §4).** Every touch `searchStedmanTouches` returns is independently re-proved by building `stedmanTriplesComposition(result.calling)` and calling `Touch.prove()` — and confirmed to come round at `result.changes`. The known published touches (plain course 84, SLQ 84) are asserted to be found; shortest-first ordering and the ceilings are tested. The row-stream model itself is locked to `Touch` by an equality test across several callings.

6. **The app Search tab includes Stedman**: the `classification === 'Principle'` / `stedman` exclusion filter is removed, the tab dispatches to `searchStedmanTouches` for Stedman, renders per-six callings, and (as for every other method) each result opens straight into Compose & Prove.

**Acknowledged (unchanged from ADR-0011):** this is bounded work whose *body* is expected to be superseded by the Phase 4 WASM engine. Bringing Stedman in does not change that; it widens the bounded searcher's coverage to match the core's, behind the same disposable-body / durable-interface contract.

## Options Considered

- **Leave Stedman out until Phase 4 (honour ADR-0011 §5 literally).** Rejected. The exclusion's premise — "the one-call-per-lead model can't walk six-ends" — dissolves once the search decides per six, where calls are single-character. The feature is now as small and bounded as the lead-end case already shipped; leaving a flagship principle un-searchable is a real, avoidable gap.

- **Generalise `searchTouches` to a step/segment provider that both lead-end and Stedman share.** A single DFS parameterised by `optionsAt(depth)` and a length/snap rule. Rejected for now: the lead-end path is heavily tested and live-diffed against the C++ oracle, and the length/snap/lead-in semantics differ enough that folding them together entangles two clean behaviours for little gain. Both bodies are disposable behind the shared `SearchReport` interface, so the duplication is cheap and contained. If a third six-/principle-based family appears, revisit and extract the shared core then.

- **Reuse the eight compound double-six calls (`stedmanTriplesCalls`) as the search alphabet, one decision per lead.** Rejected: it reintroduces the very multi-character-symbol problem ADR-0011 hit, and a come-round in the *first* six of a double-six makes the second six's choice spurious — producing duplicate results that differ only in an unused symbol. Deciding per six avoids both.

- **Drive the search by repeatedly building `stedmanTriplesComposition` + `Touch` and proving (no own row walk).** Correct but quadratic — it re-expands the whole touch at every DFS node and discards incremental truth pruning. Rejected for the search loop; *kept as the verification path* (every hit is re-proved exactly this way), which is where its correctness value belongs.

- **`SearchResult` shape — add Stedman-specific fields vs reuse with documented semantics.** Chose reuse: keeping one result type means the app, the result-handoff bus, and any future consumer stay uniform. The only reinterpretation (`leads` = sixes, `snap` = half-six finish) is documented on the type and in this ADR.

## Consequences

**Easier**

- The Search tab now covers **Stedman Triples** alongside the lead-end methods — shortest first, half-six finishes surfaced, each result opening into Compose & Prove. The searcher's coverage finally matches what the core can already prove.
- The per-six row-stream model is locked to `Touch` by test, and every result is re-proved through `stedmanTriplesComposition`, so the new path adds **no new truth authority** — the same singular truth definition, reused.
- Phase 4 gains a second already-exercised seam (`searchStedmanTouches`) with the same `SearchReport` contract to implement the six-/principle-based case against.

**Harder / to revisit**

- There are now **two bounded DFS bodies** in `src/search.ts` (lead-end and six-based) with deliberately duplicated scaffolding. Both are throwaway behind `SearchReport`. If a further principle family lands, extract the shared core (the generalisation rejected above) rather than adding a third copy.
- The Stedman searcher inherits every ADR-0011 limitation: **bounded, not complete, not for long lengths**; `truncated` flags when a ceiling stops it. Completeness and peal-length Stedman search still wait for the Phase 4 engine.
- `SearchResult.leads` is now overloaded (leads for lead-end methods, sixes for Stedman). Documented, but a consumer must know which family produced the result. The app does; note it if the type is reused elsewhere.
