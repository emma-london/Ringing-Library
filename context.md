# Ringing Library — Project Context

## What this is

A TypeScript library for change ringing, modelled on the interface of [ringing-lib](https://github.com/ringing-lib/ringing-lib) (C++) but adapted to TypeScript idioms: immutable value types, explicit method calls in place of operator overloading, and factory methods for parsing.

The project is currently at the **API design stage**. The single file in the repo (`ringing-api-sketch.ts`) is a surface API sketch — method bodies are intentionally absent. The goal is to agree the public interface before implementation begins.

---

## Architecture decisions (read these first)

The cross-platform direction is recorded as ADRs in `docs/adr/` (see `docs/adr/README.md` for the ADR process — **recording significant decisions as ADRs is the project default**; see `CLAUDE.md`):

- **[ADR-0001](docs/adr/ADR-0001-cross-platform-compute-architecture.md)** — three-layer architecture (TS domain core / WASM search engine / TS orchestration); the verify-on-client invariant as the trust boundary; budgeted serializable jobs; admission control and a composition cache/corpus designed in. Decision: **TS core + hot loop compiled to WASM**, one engine binary everywhere.
- **[ADR-0002](docs/adr/ADR-0002-description-vs-execution.md)** — separate *description* from *execution*. Introduces **`Composition`** (immutable, serializable data = job spec / cache key / search result), redefines **`Touch`** as a read-only view over a `Composition`, renames **`Proof` → `Prover`** (the cheap verifier / trust boundary), and keeps the rank/bitset search prover (`SearchTruth`) internal to the engine.
- **[ADR-0003](docs/adr/ADR-0003-phasing-and-roadmap.md)** — phasing and roadmap. Phase 3 is the **truth-first pure-TS core**; the searcher and all execution plumbing are deferred to Phase 4 (space left, not pre-built); `Composition`'s serializable shape is the one ADR-0001 hook kept in Phase 3; engine validated by live diff against the C++ prototypes; real method data brought in early.
- **[ADR-0004](docs/adr/ADR-0004-application-surface-and-agentic-use-cases.md)** *(Draft)* — application surface and the deterministic/cached vs conversational/agentic split. An open thinking record for the app phase; does not constrain Phase 3.
- **[ADR-0005](docs/adr/ADR-0005-composition-identity-and-proof-result.md)** *(Accepted)* — resolves ADR-0002's two open items. **`Composition` is the bare calling** (method ref, start, calls, length); its content hash is its identity and it carries **no metadata** — composer/title/music score live in the corpus, keyed by hash. **`Prover` returns an immutable `Proof` value** (`isTrue` + `falseRows` with line numbers), the serializable truth fact the cache/corpus stores.
- **[ADR-0006](docs/adr/ADR-0006-call-model-and-come-round.md)** *(Accepted)* — the Phase 3 call/come-round decisions. A **call replaces the tail run of a lead** (Grandsire bob `3.1` / single `3.123`; Plain Bob bob `14` / single `1234`). **Callings are one char per lead** (`.` plain, symbol-matched calls, case-insensitive). **Come-round is checked at every row** so Grandsire **snap finishes** fall out for free; a return only counts as a finish if it lands in the last specified lead, otherwise it is premature and caught as falseness.
- **[ADR-0007](docs/adr/ADR-0007-stedman-and-six-based-calling.md)** *(Accepted)* — Stedman, principles, and six-based calling. **Stedman Triples** is a 12-change **double-six principle** (`3.1.7.3.1.3,1`, lead head `6347251`, plain course 7 leads / 84 changes). Its **calls fall at six-ends** (changes 2 & 8 — the `7` begins each six; bob `5`, single `567`). Phase 3 adopts **Option B**: the eight compound double-six callings (`PB…SS`) encoded as calls *inside* ADR-0006, built from a natural **per-six** string via `stedmanTriplesCalls()` / `stedmanTriplesComposition()`. Verified true against published touches (SLQ = 84, single×2 = 168, bobs = 252; doubled-SLQ correctly false). Full sub-lead calling (**Option A**) is deferred as a future ADR-0006 successor.
- **[ADR-0008](docs/adr/ADR-0008-truth-fixture-corpus.md)** *(Accepted)* — a declarative corpus of known-true/false test fixtures. **`src/tests/fixtures/known-touches.json`**: a JSON data file (not a TS module, deliberately — the corpus is data *about* the library, and plain data serves future non-test consumers) holding `{method, stage, family, calling, expected, source?, notes?}` entries; **no `calls` field** — calls are derived via `standardCalls(method)` (ADR-0009) at execution time. Two adapters (`"lead"` and `"stedman-six"`) turn a fixture into a `Touch`; **`stedmanTriplesComposition` generalized to `stedmanComposition(calling, method)`** (Triples upwards, mirroring ADR-0009's `stedmanCalls`) so the corpus isn't stuck at stage 7. `docs/example-touches.md` is now **generated** from the corpus (`npm run docs:example-touches` → `scripts/generate-example-touches.mjs`), closing the gap where the Stedman oracles had no prose entry. Scope is **composition verdicts only** — method-level call-structure facts and search-space aggregate/enumeration facts stay out, left where they were (`standard-calls.test.ts`, `stedman-search.test.ts`). Supersedes `example-touches.test.ts` (deleted) and the truth-oracle block of `stedman-calls.test.ts` (trimmed to call-structure + notation-parsing checks only). First use of runtime file I/O outside a script/test context in this codebase (`@types/node` added as a devDependency for it).
- **[ADR-0009](docs/adr/ADR-0009-generic-method-and-call-construction.md)** *(Accepted)* — generic method & call construction, replacing per-method factories as the public dispatch surface. **`standardCalls(method)`**: dispatch by **name family** (prefix match, not exact name) — **`Grandsire*` at any stage from Doubles up** → `grandsireCalls(stage)`; **`Stedman*` at any stage from Triples up** (Caters, Cinques, …) → the newly stage-generalized `stedmanCalls(stage)`; **`Stedman*` at stage 5 (Doubles) throws** — a genuine structural exception ("totally different... a bit of a mess," per Emma), placeholder-only, deferred to **Phase 5**. Everything else gets a **stage-independent default of bob `14` / single `1234`**, near lead head (`12`) or far (`18`/`16`/`10`/`1T`) alike. `MethodClassification` is deliberately *not* the dispatch key (Grandsire is classed `'Place'`, same as ordinary methods — classification and call notation don't line up). The far-method alternative calling convention (places at the end) is real but rare and explicitly deferred, not blocking. Implemented ahead of ADR-0008 in the pre-4 order, at Emma's direction.
- **[ADR-0010](docs/adr/ADR-0010-test-bench-deployment.md)** *(Accepted)* — deploying the test bench as a public web app. A **Vite SPA in `app/` that imports straight from `src/`** (no hand-bundled global), published to **GitHub Pages via GitHub Actions** on push to `main`. The deployed demo can't drift from the core because Vite rebuilds `src/` every time; `base: '/Ringing-Library/'`. Supersedes the self-contained `ringing-test-bench.html`.
- **[ADR-0011](docs/adr/ADR-0011-bounded-app-composition-searcher.md)** *(Accepted)* — a **bounded composition searcher in the app, ahead of the Phase 4 engine**. `src/search.ts` / `searchTouches` + a "Search" tab: *"give me true compositions up to N changes"*, **capped, shortest-first, truth-pruned**, with hard **length (≤250) / result / node** ceilings. Deliberately scoped *not* to be the throwaway searcher ADR-0003 forbids — naive iterative-deepening DFS, **no** reachability DP / rank-bitset / MITM; come-round at every row (snaps free, per ADR-0006). The **interface is the durable part**; Phase 4's WASM engine swaps the body behind the same signature. Verified by re-proving every result via `Touch.prove()` **and live-diff against the C++ `grandsire_solver` prototype** (exact per-length counts and callings). Lead-end methods (Grandsire / Plain Bob / surprise); its **Stedman exclusion is now superseded by ADR-0012**. Expected to be *superseded by* the Phase 4 search ADR.
- **[ADR-0012](docs/adr/ADR-0012-stedman-in-bounded-searcher.md)** *(Accepted)* — **Stedman / six-based calling in the bounded searcher**, superseding ADR-0011's Stedman exclusion. Adds `src/search.ts` / `searchStedmanTouches` (same `SearchReport` interface, same ceilings) and removes the Search tab's Stedman filter. The dodge: decide the call **per six**, not per lead — then calls are single changes (plain `7` / bob `5` / single `567`) with single-character symbols (`.`/`-`/`s`), so ADR-0011's compound-symbol blocker never arises. Per-six iterative-deepening, truth-pruned DFS over a 2-change lead-in + alternating quick/slow sixes; `snap` follows `Touch.isSnapFinish` (came round off a double-six boundary) so Search and Compose agree. Verified by **row-for-row match to `Touch(stedmanTriplesComposition(...))`**, by re-proving every result, and by an **independent truth-checked enumeration** (bobs-only ≤84 = **46** true touches by length `{60:6,70:4,72:6,82:20,84:10}`, incl. the plain course and SLQ). Still bounded, not the Phase 4 engine.
- **[ADR-0013](docs/adr/ADR-0013-phase-4-prework-and-split.md)** *(Accepted)* — **Phase 4 pre-work and split**, superseding ADR-0003's Phase 4 phasing (ADR-0003's Phase 3 content stands unchanged). Inserts **pre-4**: finalize and implement ADR-0008 then ADR-0009, in that order — both pure-TS, closing out the call-model/truth-corpus backlog before a toolchain migration is in flight. Splits Phase 4 into **4a** (WASM engine core: language spike, port the validated C++ algorithms, live-diff validation — a checkpointable deliverable, callable synchronously, no plumbing dependency) and **4b** (execution plumbing: `Executor` seam, budget, deterministic mode, resumable chunk protocol, streaming/progress/cancel — then swap it into `src/search.ts`, superseding ADR-0011/ADR-0012's bounded DFS bodies). The split follows the one-directional dependency ADR-0003 already noted: plumbing has no caller without an engine. *Addenda (2026-07-03, from an offline-capability discussion):* 4a also scoped to vendor a bundled CCCBR method-library snapshot ([ADR-0015](docs/adr/ADR-0015-cccbr-method-library-data-source.md), Draft); 4b also scoped to define graceful `Remote`→`Worker`/`Local` offline fallback ([ADR-0014](docs/adr/ADR-0014-executor-offline-fallback.md), Draft).
- **[ADR-0014](docs/adr/ADR-0014-executor-offline-fallback.md)** *(Draft)* — offline / degraded-connectivity behavior for the `Executor`. The core library makes zero network calls; **`Remote` is the one `Executor` variant (ADR-0001) that needs connectivity**, and it must **fail gracefully** — degrade to `Worker`/`Local`, never just error out — when a connection isn't available. Open questions for Phase 4b: detection (proactive vs reactive), fallback target, resumability (reusing 4b's resumable chunk protocol), user-visible vs silent fallback, and whether the core or the calling app owns the fallback policy.
- **[ADR-0015](docs/adr/ADR-0015-cccbr-method-library-data-source.md)** *(Accepted)* — CCCBR method library data source. The full CCCBR library (**>20,000 methods**) ships as a **bundled static snapshot, not a live fetch** — since the upstream changes only ~monthly, and fetching it live would reintroduce a network dependency into the zero-I/O core. **Resolved:** source = **Text** format (has the whole Lean field set; XML kept as the FCH-upgrade path only); keep the **Lean fields** — id, name, stage, classification, notation, **lead-head code (or row when uncoded)**, symmetry, little — with `MethodLibraryEntry` extended additively (`id?`/`leadHeadCode?`/`symmetry?`/`little?`, plus `MethodLibrary.byLeadHeadCode()`); the full library is **sharded by stage**, alongside a small always-bundled **standard set** resolved at build time from an id/title **seed** (`src/data/standard-set-seed.json`) against the snapshot — **no hand-typed notation, fails loud** on any miss (Emma's error-avoidance requirement). Pipeline: pure Text parser `scripts/lib/parse-cccbr-text.mjs` (tested vs real rows) + `npm run data:refresh` orchestrator writing `data/method-library/{full/stage-*,standard-set,manifest}.json` (manifest = staleness marker). `STANDARD_METHODS` kept **distinct** (hand-verified truth corpus). Jump/Dynamic excluded (extended notation). *(The bundled `standard-set.json` later moved under `src/` and became the `ringing-lib-ts/data/standard-set` subpath export — ADR-0019.)* **Remaining:** run the refresh in a networked env to vendor the actual JSON, then trim the seed.
- **[ADR-0016](docs/adr/ADR-0016-library-to-app-interface-contract.md)** *(Accepted)* — library-to-app interface contract, prompted directly by `app/main.ts`'s `callsFor()` silently drifting from ADR-0009's `standardCalls` until caught and fixed by hand. **Public surface = exactly `src/index.ts`'s exports.** SemVer governs it, with the pre-1.0 caveat made explicit (`0.x` may break on any MINOR — pin exact versions until `1.0.0`). Future apps consume a **published, versioned npm package**, never shared source; **the test bench is the sole, named exception** (its `../src` import stays, per ADR-0010, precisely *because* it's disposable same-repo scratch UI — no second app gets that exception). Deprecated exports: JSDoc `@deprecated` + a runtime `console.warn` on first call + a guaranteed one-MAJOR-cycle window before removal, documented in a `CHANGELOG.md`. `CompositionJSON` gets its own `schemaVersion` field, since persisted/shared compositions (ADR-0002/0005) are a compatibility surface independent of the function API. *Addendum (2026-07-03):* publishing mechanics resolved — **public npm registry**, package name **`ringing-lib-ts`** (unscoped, unchanged), **manual release process** documented in `CONTRIBUTING.md` ("Releasing"), `package.json` carries `"private": true` as a safety guard until publishing actually begins. **License: MIT** (see `LICENSE`). **`1.0.0` target: Phase 4a completion** — `SearchReport`'s interface is already committed to surviving the 4a→4b engine swap unchanged (ADR-0011/0012/0013), so waiting for all of Phase 4b buys little extra stability.

- **[ADR-0017](docs/adr/ADR-0017-engine-language-spike.md)** *(Accepted; amends ADR-0013)* — Phase 4a engine language. A real spike (`engine/`) ported the ranked-lead-head DFS + bitset-truth kernel to **AssemblyScript** and measured it against optimized JS and native C++ (the Rust/wasm-pack proxy): on V8, `count(16)` was **C++ native 97 ms → optimized TS 185 ms → AS-wasm 422 ms** (all matching the C++ oracle exactly), boundary overhead a negligible **7.5 ns/call**. Finding: **AssemblyScript is ~2.3× slower than well-written TS here** (V8 JITs this integer DFS very well; the naive "6.9× wasm win" was entirely a BigInt-bitset strawman), and the only toolchain that beats the JIT — **Rust/wasm-pack** — **could not be provisioned** in this sandbox/CI (rustup allowlist-blocked, no sudo, apt `rustc` lacks the `wasm32` target). Decision: **build the 4a engine core in optimized TS behind a stable seam now** (`src/engine/`, `CompositionEngine`); keep **Rust/wasm-pack (not AssemblyScript)** as the future WASM drop-in behind the same interface, for if/when peal-length performance demands the extra ~2×. Revises only ADR-0013's "WASM module" deliverable wording; the pre-4/4a/4b split and all other 4a scope stand.

- **[ADR-0018](docs/adr/ADR-0018-generic-lead-head-engine.md)** *(Accepted; amends ADR-0017)* — generalize the engine core to **any lead-head method**. The first engine (ADR-0017) was Grandsire-Triples-specific and imported nothing from the core; this reworks it into a generic **`LeadHeadEngine(method, calls)`** over any treble-hunt lead-head method (Plain Bob, Grandsire, surprise, …), with **`GrandsireTriplesEngine` now a thin preset** over it (and the C++ live-diff path). **Library types at the boundary** — `Method` + `CallDefinition[]` in, per-lead tables built from `method.changes` via `Change.apply`, **`Composition` results** out (ADR-0002/0005), each re-provable by `Touch.prove()`; the **flat rank/bitset kernel stays internal** (ADR-0002 `SearchTruth`), deliberately *not* using `Row`/`Change` objects in the hot loop. Snap position derived (`leadLen-1`) not hardcoded; the Grandsire-specific singles-parity prune **dropped** for a universally-correct reachability-only prune (which also fixed a latent C++ `find` bug that silently dropped snap touches). **Principles (Stedman) stay out of scope**, mirroring the `searchTouches`/`searchStedmanTouches` split. Stage ceiling: Royal (10); above throws. Validated against **`searchTouches` + `Touch.prove()`** across Plain Bob Minor/Triples/Major, Grandsire Triples, and Cambridge Surprise Major (exact set match).

- **[ADR-0019](docs/adr/ADR-0019-standard-set-subpath-export.md)** *(Accepted; resolves ADR-0015's loader step, extends ADR-0016's public surface)* — exposing the bundled standard set. A downstream app on the published package saw only the **9-method** hand-verified corpus (`STANDARD_METHODS`), because the **~45-method standard set** ADR-0015 designed was built as data but **never wired into the package** — not exported from `index.ts`, and living under `data/` outside the `dist` tarball. Fix: a **typed wrapper** `src/data/standard-set.ts` re-exports the resolved JSON as **`STANDARD_SET: MethodLibraryEntry[]`**, shipped as a **dedicated subpath** — `import { STANDARD_SET } from 'ringing-lib-ts/data/standard-set'` — via a `package.json` `exports` map, **not** on the root entry (so it tree-shakes when unused; the root's "methods" stays the verified corpus). The bundled JSON **moved under `src/`** (inside `rootDir`) so tsc emits it into `dist`; the full per-stage shards stay in `data/` (downloadable, unbundled). Rejected: root re-export (bundles ~7 KB for all consumers), raw-JSON import (untyped, leaks file layout), app-loads-it-itself (the bug's status quo — unreachable by real consumers). Empirically verified JSON must sit inside `rootDir` to be emitted. The in-repo app now consumes `STANDARD_SET` (all ~45 methods) and its Compose tab no longer hard-codes Stedman to Triples.

- **[ADR-0020](docs/adr/ADR-0020-deprecate-public-standard-methods.md)** *(Accepted; follows ADR-0016's deprecation policy)* — deprecate the **public** `STANDARD_METHODS` export. After ADR-0019 the root surface carried two method arrays — the hand-verified **truth corpus** `STANDARD_METHODS` (~9) and the bundled app set `STANDARD_SET` (~45) — the same ambiguity that caused the "only 9 methods" confusion. The corpus stays (it's the right test oracle — testing the CCCBR snapshot against snapshot-derived data would be circular) but drops off the *public* surface: tests and the engine already import it directly from `src/data/standard-methods.ts`. `index.ts` now re-exports it as a `@deprecated` **`Proxy`** that logs a **one-time** `console.warn` steering to `STANDARD_SET`, otherwise transparent — **non-breaking**, so it ships in the same **1.2.0** MINOR as ADR-0019; **removal scheduled for 2.0.0**. The corpus module is unchanged, so internal callers don't break or trip the warning. The sibling call helpers (`standardCalls`, `grandsireCalls`, …) are kept — only the array is deprecated.

- **[ADR-0021](docs/adr/ADR-0021-plain-bob-doubles-single.md)** *(Accepted; corrects ADR-0009's default for one stage)* — **Plain Bob Doubles single = `123`, not `1234`.** On five bells `1234` auto-completes to `12345` via implicit external places (place 4 made ⇒ lone place 5 also made) — every bell makes a place, no bells cross, so the single repeats the previous row: every singled touch is false and never comes round. Plain Bob Doubles rings the single as `123` (4ths & 5ths cross); the bob `14`→`145` is unaffected. Fixed in **`plainBobCalls(5)`** (single `123` at `Stage.DOUBLES`) and a **narrow `standardCalls` branch** (name `plain bob` **and** stage 5 → `plainBobCalls`); everything else — Plain Bob at other stages, all other methods — is untouched (ADR-0009's generic `14`/`1234` default stands). **Deliberately scoped to Plain Bob Doubles**, not all Doubles methods: the correct single is method-specific, so the generic default's degenerate `12345` on other Doubles methods stays a known, deferred limitation. Verified by the bounded searcher (81 true touches, 8 full 120-change singled extents each re-proved by `Touch.prove()` with 120 distinct rows — incl. the textbook `...s...s...s`), a negative control (the `12345` single is false and never comes round), 6 unit tests, and a corpus fixture (ADR-0008).

> ADR-0001 and ADR-0002 are **Accepted**. ADR-0003's phasing revises ADR-0001's *Now* action sequencing (execution plumbing deferred to Phase 4); ADR-0005 resolves ADR-0002's open type questions.

> The domain table, design decisions, and `ringing-api-sketch.ts` now use the ADR-0002 names (`Composition` / `Touch` / `Prover`). Note: the **Research spike** sections further down still say "`Proof`" — there, that historical name refers to the *search-time truth / composition-search* design, which per ADR-0002 is the engine-internal **`SearchTruth`** (rank/bitset), not the `Prover` verifier.

---

## Core domain concepts

| Concept | What it represents |
|---|---|
| `Bell` | A 0-based index for a bell (0 = treble, 1 = 2nd, …) |
| `Stage` | Number of bells; named constants provided (`MINOR` = 6, `MAJOR` = 8, etc.) |
| `Row` | An immutable permutation of bells — one moment in a touch |
| `Change` | A single place-notation token (e.g. `X`, `14`, `1238`) — the transformation between two rows |
| `PlaceNotation` | Parser/serialiser for a full place notation string (e.g. `&-1-1-1,2`) |
| `Method` | A named sequence of changes forming one lead |
| `Composition` | Immutable, serializable description of a touch — exactly (method, start, calls, length); **content hash is its identity, no metadata** (ADR-0002, ADR-0005). The job spec, cache key, and search result |
| `Touch` | Read-only expansion of a `Composition` into its sequence of rows (ADR-0002) |
| `Prover` | Cheap incremental truth-checker / verifier — the trust boundary; returns a `Proof` (ADR-0002, ADR-0005) |
| `Proof` | Immutable result of proving a touch — `isTrue` + `falseRows` (with line numbers); the serializable truth fact the cache/corpus stores (ADR-0005) |
| `MethodLibrary` | Searchable collection of named methods, loaded from a plain JSON/array source |
| `SearchTruth` | Engine-internal rank/bitset prover that owns search-time backtracking; not part of the public surface (ADR-0002) |

---

## Key design decisions recorded in the sketch

- **Immutability throughout** — all `Row` and `Change` operations return new instances
- **`Bell` as `number`** — avoids boxing overhead; display conversion handled by `bellToChar` / `bellFromChar` helpers
- **`leadRows` vs `leadRowsNoLH`** — mirrors C++ `row_block::no_final_lead_head` flag; `leadRows` yields `leadLength + 1` rows (including the lead head), `leadRowsNoLH` yields exactly `leadLength`
- **Description vs execution (ADR-0002)** — `Composition` is the immutable, serializable data (the calling); `Touch` is a read-only view that expands it into rows; `Prover` is the verifier only. Search-time backtracking lives in the engine-internal `SearchTruth` (rank/bitset), not in `Prover` — so `Prover` has no `remove()`
- **`MethodLibrary` decoupled from I/O** — the library is loaded from a caller-supplied array; no file I/O in the core, so it stays portable across environments (browser, Node, etc.)
- **`PlaceNotation.parse` handles** `&` symmetric notation, `.` separators, `X`/`-` cross changes, and `,` lead-end variants

---

## Current state

**Phase 4a COMPLETE — v1.0.0 cut (2026-07-03).** Both 4a deliverables are done and
tested: the generic engine core (below) and the CCCBR method database (ADR-0015).
Per ADR-0016 (1.0.0 = Phase 4a completion) `package.json` is bumped to **1.0.0**
and `CHANGELOG.md` has a dated `1.0.0` section; the public surface (`src/index.ts`)
is now under full SemVer (breaking changes require a MAJOR bump). The package stays
`"private": true` — the actual `npm publish` is a deliberate manual step (see
CONTRIBUTING.md "Releasing"), not yet run. **Phase 4b (execution plumbing) is next.**

**Phase 4a — generic engine core built (2026-07-03).** The language
spike is done and decided (**ADR-0017**): AssemblyScript measured ~2.3× slower than
optimized TS on the kernel, Rust/wasm-pack unprovisionable in the sandbox/CI, so
the engine core is **optimized TypeScript behind a stable seam** (`src/engine/`,
`CompositionEngine`). It ports every validated technique from
`prototypes/grandsire_solver.cpp` (Lehmer ranking, lead-head tables, snap-aware
reachability DP, forward DFS list/count/find, meet-in-the-middle, Q-set structure,
snap finishes), callable directly and synchronously — no `Executor`/chunking (4b).

Per **ADR-0018** the engine is now **generic over any lead-head method**:
**`LeadHeadEngine(method, calls)`** builds its tables from a `Method` +
`CallDefinition[]` (via `Change.apply`) and emits **`Composition` results**
(re-provable by `Touch`); **`GrandsireTriplesEngine`** is a thin preset over it.
The flat rank/bitset kernel stays internal (ADR-0002 `SearchTruth`); the
Grandsire-specific parity prune was dropped for a universally-correct
reachability-only prune. **Validation:** the Grandsire preset is **live-diffed
against the C++ oracle** (`npm run engine:live-diff`; count/list/find/MITM agree —
`find` checked against C++ `list`/`count` since C++ `find` under-reports snaps),
and the generic engine is cross-checked against **`searchTouches` + `Touch.prove()`
across Plain Bob Minor/Triples/Major, Grandsire Triples, and Cambridge Surprise
Major** (`src/tests/lead-head-engine.test.ts`, exact set match). Stage ceiling:
Royal (10). Principles (Stedman) stay out of scope.

**CCCBR method-library snapshot — pipeline built (2026-07-03, ADR-0015 now
Accepted).** The full CCCBR library (>20,000 methods) will ship as a bundled,
by-stage-sharded snapshot (Text-format source, Lean fields), plus a small
always-bundled **standard set** resolved at build time from an id/title seed
(`src/data/standard-set-seed.json`) — no hand-typed notation, fails loud.
`MethodLibraryEntry` extended with `id?`/`leadHeadCode?`/`symmetry?`/`little?`
(additive, ADR-0016) and `MethodLibrary.byLeadHeadCode()` added; the CCCBR
lead-head **code** (a–s, else the row) is now read in and interpreted. Pure
parser `scripts/lib/parse-cccbr-text.mjs` is tested against real CCCBR rows
(`src/tests/parse-cccbr-text.test.ts`), the `npm run data:refresh` orchestrator
does fetch/shard/resolve/manifest. The standard set is now wired into the package
as the typed subpath export `ringing-lib-ts/data/standard-set` (`STANDARD_SET`,
~45 methods) — **ADR-0019**, resolving ADR-0015's loader step; its JSON moved
under `src/` so the build ships it, full shards stay in `data/` (downloadable,
unbundled). **Remaining:** run the refresh in a networked environment to
re-vendor the actual snapshot, then trim the seed. Rust/wasm-pack remains the
recorded future engine drop-in behind the same seam. See Roadmap below.

**Phase 3 complete.** The truth-first core is built: `Composition`, `Touch`, `Prover`/`Proof`, and `MethodLibrary`, all implemented and tested against real methods. Truth is the headline — positive and negative cases, with the negatives seeded from real worked examples (originally `docs/example-touches.md`; now the ADR-0008 corpus, `src/tests/fixtures/known-touches.json`, which generates that doc rather than being hand-authored alongside it), including the SPSPSBP **snap finish**. (Phase 2 — PlaceNotation and Method — remains complete underneath.)

A **bounded composition searcher** has since been added for the test bench (**ADR-0011**): `src/search.ts` / `searchTouches` + a Search tab, capped and shortest-first, deliberately scoped *not* to be the Phase 4 engine (see roadmap note). Verified by re-proving every result and by live-diff against the C++ `grandsire_solver`. **ADR-0012** then added its six-based sibling **`searchStedmanTouches`**, bringing **Stedman Triples** onto the Search tab (decide per six → single-character calls, so ADR-0011's compound-symbol blocker vanishes); verified by row-for-row match to `Touch` and an independent truth-checked enumeration.

### Files

| File | Purpose |
|---|---|
| `ringing-api-sketch.ts` | Original API surface design (reference) |
| `package.json` | npm config; `npm test` runs vitest, `npm run build` compiles; `app:dev`/`app:build`/`app:preview` run the Vite test-bench app (ADR-0010); `docs:example-touches` regenerates `docs/example-touches.md` from the corpus (ADR-0008). `@types/node` added as a devDependency for the fixture loader's/doc-generator's file I/O. **`exports` map (ADR-0019)** declares the two public entry points — `.` (root) and `./data/standard-set` (the bundled `STANDARD_SET`); deep `dist/**` imports are no longer resolvable |
| `tsconfig.json` | Strict TypeScript, ESM (`NodeNext`), output to `dist/`. `src/tests/**` excluded from the build (2026-07-02) — tests run via vitest straight from `src/` regardless; the exclusion keeps `dist/` (the published, browser-portable core) free of test-only Node dependencies, e.g. the ADR-0008 fixture loader's `fs` usage |
| `src/bell.ts` | `Bell`, `Stage`, `BELL_NAMES` (bells 1-33, extended beyond Maximus 2026-07-02 — CCCBR Framework §B.1: `1234567890ETABCDFGHJKLMNPQRSUVWYZ`, skipping I/O/X), `bellToChar`, `bellFromChar` |
| `src/row.ts` | `Row` — immutable permutation, full algebra |
| `src/change.ts` | `Change` — place notation token, apply/swaps, parse with implicit externals |
| `src/place-notation.ts` | `PlaceNotation` — parse/stringify; handles `&`, `-`/`X`, `.`, `,` grammar |
| `src/method.ts` | `Method` — leadRows, leadRowsNoLH, leadHead, leadHeads, toString |
| `src/prover.ts` | `Prover` (pure incremental truth verifier) + `Proof` (immutable result value) — Phase 3 |
| `src/composition.ts` | `Composition` + `CompositionBuilder`, `CallDefinition`/`CallingEntry`, `fromCalling`, `key()`/`hash()` (FNV-1a), `toJSON`/`fromJSON` — Phase 3 |
| `src/touch.ts` | `Touch` — lead expansion with call substitution, come-round/snap detection, `prove()` — Phase 3 |
| `src/search.ts` | `searchTouches` — **bounded** composition searcher (ADR-0011): capped, shortest-first, truth-pruned iterative-deepening DFS over plain/call per lead; hard length/result/node ceilings; come-round at every row (snaps free). Stable interface; Phase 4 swaps the body. Lead-end methods. Plus **`searchStedmanTouches`** (ADR-0012): the six-based sibling — same `SearchReport` + ceilings, per-six plain/bob/single DFS for Stedman |
| `src/method-library.ts` | `MethodLibrary` — find/byStage/byClass/**byLeadHeadCode**/method()/iterator. `MethodLibraryEntry` carries the **Lean** snapshot fields (ADR-0015): `name`, `stage`, `notation`, `classification`, plus optional `id`, `leadHeadCode`, `leadHead` (row), `symmetry`, `little` (additive/non-breaking, ADR-0016) — Phase 3 + 4a |
| `scripts/lib/parse-cccbr-text.mjs` | **CCCBR Text-format parser** (ADR-0015) — pure, I/O-free: raw file text + (class, stage) → Lean `MethodLibraryEntry` objects. Lead-head code/row discrimination, full-title reconstruction (class word + stage), Plain→Bob/Place split, canonical notation from tab-separated tokens |
| `scripts/refresh-method-library.mjs` | **Snapshot orchestrator** (`npm run data:refresh`, ADR-0015) — fetches each per-class-per-stage CCCBR Text file, parses, **shards by stage** → `data/method-library/full/stage-<n>.json`, **resolves the standard set** from the seed (fails loud on any miss), writes `src/data/method-library/standard-set.json` (bundled — under `src/` so the build ships it, ADR-0019) + `data/method-library/manifest.json` (staleness marker). Authoring-time network/I/O only; Jump/Dynamic excluded |
| `src/data/standard-set-seed.json` | **Standard-set membership seed** (ADR-0015) — the hand-maintained always-bundled local set as `{name, stage}` (optional pinned `id`); ~45 methods from *Diagrams* + the Standard 8. Resolved to full Lean data against the snapshot at build time — never carries notation. Distinct from `STANDARD_METHODS` |
| `data/method-library/` | **Generated snapshot** (ADR-0015; produced by `data:refresh`): `full/stage-<n>.json` (the **downloadable** by-stage shards — *not* bundled into the npm package), `manifest.json` (staleness marker). The bundled `standard-set.json` lives under `src/` instead (ADR-0019) |
| `src/data/method-library/standard-set.json` | **Bundled standard set** (~45 methods), resolved from the seed by `data:refresh`. Under `src/` (inside tsc's `rootDir`) so the build emits it into `dist` and it ships in `files: ["dist"]` — ADR-0019 |
| `src/data/standard-set.ts` | **Typed wrapper** (ADR-0019) re-exporting `standard-set.json` as `STANDARD_SET: MethodLibraryEntry[]`; shipped as the subpath export `ringing-lib-ts/data/standard-set`, deliberately *not* on the root entry. Distinct from `STANDARD_METHODS` (the hand-verified truth corpus — now **deprecated** on the root surface, ADR-0020) |
| `src/engine/` | **Phase 4a engine core** (ADR-0013/ADR-0017/ADR-0018). `lead-head-engine.ts` = `LeadHeadEngine implements CompositionEngine`, the **generic** optimized-TS port of `grandsire_solver.cpp` for **any lead-head method**: built from a `Method` + `CallDefinition[]` (tables from `Change.apply`), `count`/`list`/`find`/`mitmCount`/`qsets`, snap finishes derived (`leadLen-1`), reachability-only prune, **`Composition` results** (re-provable by `Touch`); typed-array hot loop (ADR-0002 `SearchTruth`), callable synchronously, no `Executor`; stage ceiling Royal (10). `grandsire-triples-engine.ts` = `GrandsireTriplesEngine`, a **thin preset** over it (Grandsire Triples + `grandsireCalls(7)`), the C++ live-diff path. `index.ts` = barrel + the **stable `CompositionEngine` seam** a future Rust/wasm-pack build implements. Exported from `src/index.ts` (public surface, ADR-0016) |
| `engine/` | **Phase 4a language spike** (ADR-0017) — *not* the production engine. `assembly/kernel.ts` (AssemblyScript port of the `count` hot loop), `spike/baseline*.mjs` (JS baselines: BigInt strawman + fair `Uint32Array`), `spike/run*.mjs` (throughput + boundary micro-bench), `spike/results.md` (the measurements ADR-0017 cites), `README.md`. Has its own throwaway `package.json` (assemblyscript devDep) |
| `scripts/engine-live-diff.mjs` | Live-diff harness (`npm run engine:live-diff`): compiles `grandsire_solver.cpp` (needs g++), runs count/list/find/mitm, and checks `dist/engine` agrees exactly. The reproducible form of the ADR-0013 validation call |
| `src/data/standard-methods.ts` | Curated real CCCBR method data (incl. **Stedman Triples**, a principle — ADR-0007) + `grandsireCalls`/`plainBobCalls` factories, `stedmanCalls(stage)` and **`stedmanComposition(calling, method)`** (both generalized Triples-and-up, ADR-0009/ADR-0008), `stedmanTriplesCalls`/`stedmanTriplesComposition` (stage-7 back-compat aliases) — Phase 3 — plus **`standardCalls(method)`** (ADR-0009): dispatches by name family — `Grandsire*` (Doubles up) and `Stedman*` (Triples up, stage 5 Doubles throws — Phase 5 placeholder) to their special-case factories, else a stage-independent bob-`14`/single-`1234` default. **`plainBobCalls(5)` and `standardCalls(Plain Bob Doubles)` return single `123`, not the degenerate `12345` — ADR-0021** |
| `src/index.ts` | Barrel export |
| `src/tests/fixtures/known-touches.json` | The truth-fixture corpus (ADR-0008): 12 known composition verdicts (4 Grandsire, 2 Plain Bob, 1 Plain Bob Doubles singled extent — ADR-0021, 5 Stedman) as `{method, stage, family, calling, expected, source?, notes?}` — no `calls` field, derived via `standardCalls` |
| `src/tests/fixtures/load-fixtures.ts` | Loader + per-family adapters (`"lead"` → `standardCalls`+`fromCalling`; `"stedman-six"` → `stedmanComposition`) + `assertFixture` helper for the corpus (ADR-0008) |
| `scripts/generate-example-touches.mjs` | Regenerates `docs/example-touches.md` from `known-touches.json` (ADR-0008); run via `npm run docs:example-touches`, plain Node, no TS compile needed |
| `app/` | **Live test bench** — Vite single-page app deployed to GitHub Pages (ADR-0010). `index.html` (markup/styles), `main.ts` (UI, imports the real core via `import * as R from '../src'`), `vite.config.ts` (`base: '/Ringing-Library/'`). Compose & Prove, **Search** (ADR-0011 lead-end methods + **ADR-0012 Stedman** via `searchStedmanTouches`; bounded true-composition search, results open into Compose & Prove), Method Explorer (plain course / blue line), Row & Change playground. The deployed demo can't drift from the core because Vite bundles `src/` on every build |
| `.github/workflows/deploy.yml` | GitHub Actions: build `app/dist` and publish to Pages on push to `main` (ADR-0010). URL: `https://emma-london.github.io/Ringing-Library/` |
| `ringing-test-bench.html` | **Superseded by `app/`** (ADR-0010) — the original self-contained browser app with the library hand-bundled in via esbuild. Frozen; kept for reference only |
| `src/tests/bell.test.ts` | 17 tests — incl. `BELL_NAMES` beyond Maximus (13th-33rd bells against the CCCBR letter sequence, I/O/X rejected, no duplicates) |
| `src/tests/row.test.ts` | 34 tests |
| `src/tests/change.test.ts` | 24 tests |
| `src/tests/place-notation.test.ts` | 11 tests |
| `src/tests/method.test.ts` | 22 tests |
| `src/tests/stedman.test.ts` | 15 tests |
| `src/tests/prover.test.ts` | 14 tests — Phase 3 |
| `src/tests/composition.test.ts` | 19 tests — Phase 3 |
| `src/tests/touch.test.ts` | 17 tests — Phase 3 |
| `src/tests/method-library.test.ts` | 7 tests — Phase 3 |
| `src/tests/parse-cccbr-text.test.ts` | 8 tests — the CCCBR Text parser (ADR-0015) against **real CCCBR rows**: title reconstruction (Plain/Surprise/Principle/Little), Plain→Bob/Place, token→notation, coded vs row lead heads, symmetry/little; cross-checks parsed notation rebuilds the hand-verified lead heads (Grandsire `1253746`, Plain Bob `1352746`) |
| `src/tests/known-touches.test.ts` | 15 tests — runs every fixture in `src/tests/fixtures/known-touches.json` through its family adapter + `assertFixture` (ADR-0008); supersedes the old `example-touches.test.ts` and `stedman-calls.test.ts`'s truth-oracle block; plus loader-validation tests (unknown method, stage mismatch, unsupported `startRow` on Stedman) |
| `src/tests/stedman-calls.test.ts` | 5 tests — Stedman six-end call **structure** (ADR-0007: symbols, replacement length, BB/SS tokens) and per-six notation-parsing equivalence; the truth-oracle verdicts formerly here now live in the corpus (ADR-0008) |
| `src/tests/standard-calls.test.ts` | 20 tests — `standardCalls` (ADR-0009): matches `grandsireCalls`/`stedmanTriplesCalls` for Triples/Doubles (incl. case-insensitive name lookup); **family generalization** — Grandsire Caters/Cinques (stage 9/11) and Stedman Caters/Cinques dispatch correctly, tenor-place token scales (not hardcoded `7`), bob `5`/single `567` stay stage-independent; **Stedman Doubles (stage 5) throws**, not silently wrong; matches `plainBobCalls` and defaults to `14`/`1234` for near (Cambridge) and far (Kent Treble Bob) methods alike; unregistered names fall through to the default; functional proof via the WHWH (224) and Grandsire plain-course (70) oracles rebuilt with `standardCalls` |
| `src/tests/search.test.ts` | 9 tests — bounded searcher (ADR-0011): every result re-proved true + comes round; shortest-first; length/limit ceilings; **live-diff vs the C++ `grandsire_solver`** (exact per-length counts 83-to-10-leads, exact callings, SPSPSBP snap); plain-course and no-false-touch checks |
| `src/tests/lead-head-engine.test.ts` | 10 tests — generic engine (ADR-0018): `LeadHeadEngine.list` set **equals `searchTouches`** (both untruncated) for Plain Bob Minor/Triples/Major, Grandsire Triples, Cambridge Surprise Major, with every result re-proved true via `Touch.prove()`; `find`/`mitmCount` generalize; results are re-provable `Composition`s; scope guards (Stedman principle rejected, stage > 10 rejected) |
| `src/tests/engine.test.ts` | 13 tests — Grandsire preset (ADR-0013/ADR-0017), via `LeadHeadEngine`: count per-length pinned to the C++ oracle (to 14 leads) + totals (12/16); `list` = 19 touches ≤8 leads, shortest-first, incl. the SPSPSBP snap and plain course; **every listed touch (≤10 leads, 83 of them) re-proved true via `Touch.prove()`** with length + snap agreement; `find` exact-length + cap + independent `verify`; `mitmCount` == count row and pinned MITM totals; Q-sets (bob 5 / single 6) |
| `src/tests/stedman-search.test.ts` | 9 tests — Stedman six-based searcher (ADR-0012): every result re-proved true via `stedmanTriplesComposition` + comes round + snap matches `Touch.isSnapFinish`; shortest-first; plain-course; ceilings; non-Stedman method rejected; **independent truth-checked enumeration** (bobs-only ≤84 = 46 touches, exact callings + per-length tally, incl. plain course & SLQ) |
| `playground.ts` | Phase 1 self-contained TS Playground file |
| `playground-phase2.ts` | Phase 2 self-contained TS Playground file |

**282 tests, all passing.** Clean `tsc` build.

### Implementation notes

- `Change.parse` handles implicit external places (e.g. `'1'` on major auto-adds the tenor place at the high end)
- `Row.apply(change)` delegates to `Change.apply(row)` — single source of truth for the swap logic
- All `Row`, `Change`, `Method`, `Composition`, `Touch`, and `Proof` instances are immutable
- `PlaceNotation._tokenize` treats `-` as both a cross change token AND a separator (the standard convention); `.` is a pure separator
- Symmetric `&body,leadEnd` expands to palindrome(body) + [leadEnd] = 2n changes; `&body` without comma = palindrome only = 2n-1 changes
- **Calls replace the tail of a lead** (ADR-0006): Grandsire bob `3.1` / single `3.123` (last 2 changes), Plain Bob bob `14` / single `1234` (last change)
- **Come-round is checked at every row**, so **snap finishes** work without a special case; a return only counts as a finish in the last specified lead. A true touch of *c* changes proves *c* distinct rows (Grandsire Triples plain course = 70)
- `Composition` identity = content hash of (method ref, start, calls used, calling, length) via FNV-1a; metadata stays out of the hash (ADR-0005)
- Truth verified against the ADR-0008 corpus (`src/tests/fixtures/known-touches.json`, generating `docs/example-touches.md`): 12 fixtures across Grandsire/Plain Bob/Plain Bob Doubles/Stedman — verdicts and lengths (70 / 84 / 97 snap / 224 / 120 Doubles singled extent / 84 / 168 / 252) all match; false cases report their repeated rows with line numbers
- **Bug fixed in passing:** the Phase 2 tests carried a wrong Cambridge S Major notation (`-36-14-1256-…`, lead head `18345627`, a 3-lead course — not Cambridge). Corrected everywhere to `&-38-14-1258-36-14-58-16-78,12` (lead head `15738264`, true 7-lead / 224-change plain course). See ADR-0006.

---

## Roadmap (agreed — see [ADR-0003](docs/adr/ADR-0003-phasing-and-roadmap.md) for Phase 3; Phase 4 phasing revised by [ADR-0013](docs/adr/ADR-0013-phase-4-prework-and-split.md))

**Phase 3 — "Make sure a TS library actually works" (truth-first, pure TS, no new toolchain). ✅ COMPLETE (2026-06-23).** Built `Composition`, `Touch`, `Prover`/`Proof`, `MethodLibrary`. Defined by its tests: **truth is the headline** — 182 tests, positive *and* negative, negatives seeded from `docs/example-touches.md` (incl. the snap finish). `Composition`'s serializable/hashable shape is fixed (FNV-1a content hash; the one ADR-0001 hook kept in this phase). Real method data loaded via `src/data/standard-methods.ts` (curated correct CCCBR subset; the full [Central Council library](https://cccbr.github.io/methods/) can drop into `MethodLibrary` later via a thin loader). Call model and come-round/snap decisions recorded in **ADR-0006**.

**Pre-4 ✅ COMPLETE (2026-07-02) — Close out the call-model backlog ([ADR-0013](docs/adr/ADR-0013-phase-4-prework-and-split.md)).** [ADR-0013](docs/adr/ADR-0013-phase-4-prework-and-split.md) ordered this as ADR-0008 then ADR-0009; **ADR-0009 was done first instead** (Emma's direction — `standardCalls` doesn't depend on the fixture corpus existing), with **ADR-0008 following the same day**, then the **`BELL_NAMES` extension** closing out pre-4. **ADR-0009:** `standardCalls(method)` dispatches by **name family** — `Grandsire*` (Doubles upwards) and `Stedman*` (Triples upwards, Caters/Cinques/…) to their generalized special-case factories, with a stage-independent bob-`14`/single-`1234` default for everything else, near or far lead head alike; **Stedman Doubles (stage 5) is an explicit excluded exception that throws**, placeholder-only, deferred to Phase 5 (see below). **ADR-0008:** the truth-fixture corpus (`src/tests/fixtures/known-touches.json`, a JSON data file) + loader/adapters (`src/tests/fixtures/load-fixtures.ts`) + `src/tests/known-touches.test.ts`, replacing the old `example-touches.test.ts` and `stedman-calls.test.ts`'s truth-oracle block; `stedmanTriplesComposition` generalized to `stedmanComposition` alongside it (Triples upwards); `docs/example-touches.md` now generated (`npm run docs:example-touches`), closing the gap where the Stedman oracles had no prose entry. This added the project's first runtime file I/O outside a script/test context (`@types/node` as a devDependency) — addressed by **excluding `src/tests/**` from the `tsc` build** (`tsconfig.json`), so the published `dist/` (the portable, zero-I/O core meant to run on anything down to a basic phone browser) never picks up the Node-only fixture loader; vitest is unaffected since it doesn't consult tsconfig include/exclude. **`BELL_NAMES` extended beyond Maximus:** `src/bell.ts`'s alphabet goes from 12 to the full CCCBR-standard 33 (`1234567890ETABCDFGHJKLMNPQRSUVWYZ` — digits, `0` for the 10th, then letters skipping I/O/X per the [CCCBR Framework](https://framework.cccbr.org.uk/version2/fundamentals.html) §B.1), confirmed against the published standard rather than guessed. **Backlog (not pre-4, no timeline):** the far-method alternative calling convention (places at the end, instead of the default `14`/`1234`) — real but rare, deferred per ADR-0009.

**Phase 4a — engine core + method database ([ADR-0013](docs/adr/ADR-0013-phase-4-prework-and-split.md), [ADR-0017](docs/adr/ADR-0017-engine-language-spike.md), [ADR-0015](docs/adr/ADR-0015-cccbr-method-library-data-source.md)). ✅ COMPLETE — v1.0.0 cut (2026-07-03).** The language spike is done: measured (`engine/`), decided (**ADR-0017**), and the engine core built. The spike found **AssemblyScript ~2.3× slower than optimized TS** on the ranked-DFS + bitset-truth kernel (C++ native 97 ms → optimized TS 185 ms → AS-wasm 422 ms at `count(16)`; boundary 7.5 ns/call), and **Rust/wasm-pack unprovisionable** in this sandbox/CI — so the engine core is **optimized TypeScript behind a stable `CompositionEngine` seam** (`src/engine/`), not a WASM module. It ports every validated prototype technique (reachability DP, meet-in-the-middle, Q-set structure, snap-finish handling), is callable directly with no `Executor`/chunking, and — per **ADR-0018** — is **generic over any lead-head method** (`LeadHeadEngine(method, calls)`, Grandsire now a preset), taking `Method`/`CallDefinition` in and `Composition` out. It is **live-diffed against the C++ prototypes** (`npm run engine:live-diff`) and cross-checked against **`searchTouches` + `Touch.prove()`** across five methods. **Rust/wasm-pack (not AssemblyScript)** is the recorded future WASM drop-in behind the same seam, for when peal-length performance demands the extra ~2×. **CCCBR method-library snapshot — pipeline built ([ADR-0015](docs/adr/ADR-0015-cccbr-method-library-data-source.md), now Accepted):** bundled (not live-fetched) so `MethodLibrary` can offer the full method set offline; Text-format source, Lean fields, **sharded by stage**, plus a small always-bundled **standard set** resolved from an id/title seed at build time (no hand-typed notation, fails loud); lead-head **codes** read in (`byLeadHeadCode`); pure parser + `npm run data:refresh` orchestrator + `manifest.json` staleness marker; `STANDARD_METHODS` kept distinct. The snapshot has been **generated and verified** (25,012 methods; `data:refresh` run 2026-07-03) and is **gitignored as a build artifact** (regenerated on demand / in CI, not vendored into git); the id-keyed standard-set seed (`{id, name, stage}`, 45 methods) is committed and trims/extends freely.

**Phase 4b — Execution plumbing + integration ([ADR-0013](docs/adr/ADR-0013-phase-4-prework-and-split.md)).** Everything that only exists to serve the 4a engine: `Executor` (`Local`/`Worker`/`Remote`), per-call budget, deterministic search mode, resumable chunk protocol, streaming/progress/cancel. Entirely downstream of 4a — the plumbing has no caller without an engine. Finishes by swapping `src/search.ts`'s two bounded DFS searchers (`searchTouches`, `searchStedmanTouches` — ADR-0011/ADR-0012) for the 4a engine behind the same `SearchReport` interface, dropping their length/result/node ceilings. If 4b finds itself extending those DFS bodies rather than replacing them (or a third principle family wants to share a core), revisit ADR-0011/ADR-0012 first. **Also scoped in (2026-07-03):** the `Remote` executor must **fail gracefully offline**, falling back to `Worker`/`Local` rather than erroring — offline-capable apps are an explicit goal ([ADR-0014](docs/adr/ADR-0014-executor-offline-fallback.md), Draft; detection strategy, fallback target, resumability, and UX visibility to resolve when 4b starts).

**Phase 5 — Orchestration and scale.** Admission controller, cost model, server handoff UX, cached composition corpus (ADR-0001 "later"). Also carries the **Stedman Doubles call-model placeholder** left by ADR-0009: `stedmanCalls(5)` currently throws rather than implementing the genuinely different (stage-5) call structure — picked up here, not before.

**App phase (open, [ADR-0004](docs/adr/ADR-0004-application-surface-and-agentic-use-cases.md) Draft).** Platform/app surface and the deterministic-vs-agentic intent split — still being thought through; downstream of the core and engine.

### Backlog (scheduled, not yet started)

**Pre-4 is complete** (2026-07-02). **Phase 4a is in progress** (2026-07-03): the engine language spike (ADR-0017) and the engine core (`src/engine/`) are **done** — optimized-TS, live-diffed against the C++ oracle. The **CCCBR method-library snapshot pipeline** (ADR-0015, now Accepted) is also **built** — Text parser + `data:refresh` orchestrator + standard-set seed/resolver + `MethodLibraryEntry` lean fields — and the standard set is now **wired into the package** as the subpath export `ringing-lib-ts/data/standard-set` (`STANDARD_SET`, ~45 methods; ADR-0019); **remaining in 4a:** run `npm run data:refresh` in a networked env to re-vendor the actual snapshot, then trim the seed. After that, **Phase 4b** (execution plumbing) is next. **Recorded future work — the WASM revisit (not blocking; see ADR-0017 "WASM revisit checklist"):** a Rust/wasm-pack build of the engine behind the same `CompositionEngine` seam, when peal-length performance demands the extra ~2× over the JIT. Carries two scheduled-in prerequisites: **(1)** provision the Rust toolchain — the spike's hard blocker was that `rustup` couldn't install in the sandbox/CI (`static.rust-lang.org` allowlist-403, no sudo, apt `rustc` lacks the `wasm32` target); the fix is allowlisting the rustup/crates/github hosts + a userspace `rustup` install + `rustup target add wasm32-unknown-unknown` (Emma to grant these permissions at revisit time, 2026-07-03); and **(2)** build the browser benchmark harness deferred from the 4a session (same `count(N)` workload, TS vs AS-wasm vs Rust-wasm, cold + warmed, run on an actual phone in mobile Chrome) — the desktop-x86 V8 numbers are a proxy, and JS JIT warmup on short mobile bursts can only be settled on-device.

**Unscheduled:** the far-method alternative calling convention (ADR-0009, deferred) — rare enough not to block Pre-4 or Phase 4. **Scheduled for Phase 5:** Stedman Doubles calls (ADR-0009) — a genuine structural exception to the Triples-and-up pattern, currently a thrown placeholder in `stedmanCalls(5)`.

**From ADR-0016 (2026-07-03), no phase assigned yet — needed before the first non-test-bench app:** add `schemaVersion` to `CompositionJSON` + validate it in `fromJSON`; add a `CHANGELOG.md`; decide publishing mechanics (registry, package name/scope, release automation).

---

## Research spike — brute-force composition search (C++)

A standalone C++17 prototype lives in `prototypes/grandsire_bruteforce.cpp` (build:
`g++ -O2 -std=c++17 prototypes/grandsire_bruteforce.cpp -o prototypes/grandsire`).
It exists to de-risk the `Proof` / composition-search design in TypeScript by
measuring real search behaviour. C++ chosen for the spike because of native
`uint16` and `std::bitset`; the TS port comes later.

**Approach (informs the future `Proof` API):**
- Rows ranked to a dense integer in `[0, 5040)` via the factoradic / Lehmer code
  (rank is O(n²), done once at precompute, never in the hot loop).
- Per-(lead-head, call) lookup tables: next lead-head rank + the 14 internal row
  ranks. The DFS does zero permutation arithmetic — just table lookups.
- Truth via a 5040-bit `std::bitset` of used rows; DFS prunes the whole subtree
  the instant a lead repeats a row. Backtracking unmarks the rows (mirrors the
  planned `Proof.remove()`).

**Grandsire Triples facts pinned down & self-verified by the prototype:**
- Plain lead `3.1.7.1.7.1.7.1.7.1.7.1.7.1`; lead head `1253746`; plain course =
  5 leads / 70 rows, comes round. (Verified exactly against the documented course.)
- Calls per CompLib: **Bob = `3.1` LE** (c13 `7`→`3`), **Single = `3.123` LE**
  (c13 `7`→`3`, c14 `1`→`123`). Bob verified against Heaton's Table 4
  (`bob(1246375)=1532746`) and by tracing internal changes `…1.3.1`; single
  verified by parity flip + the bob/single coursing-order swap of bells 5 & 7.

**Key finding (motivates the *next* layer of work):** naive truth-pruned DFS is
still ~2.8×/lead in the first ~18 leads — falseness is too rare early to help,
so the surviving tree is near the full 3ⁿ until the extent fills up (depth 18 =
242M nodes, ~7.9% pruned). Conclusion: truth-pruning alone cannot reach
quarter-peal length (90 leads). The real reductions must come from structure —
**come-round constraint + Q-set completeness + meet-in-the-middle on the ranked
lead-head state**, plus rotational dedup. These belong in the `Proof` /
composition-search design.

### Structured searcher — `prototypes/grandsire_search.cpp`

Layers three techniques on the validated core; build with
`g++ -O2 -std=c++17 prototypes/grandsire_search.cpp -o prototypes/gsearch`.
All four searchers are cross-checked to agree on the exact count of true
come-round touches of each length L (verified L = 4…16), which validates every
layer at once.

1. **Backward exact-length reachability prune.** Reverse lead tables (the inverse
   lead-end perms) + a DP giving, for each k, which lead-heads can reach rounds in
   exactly k leads. Prunes forward branches that can't get home in budget. Big
   win: L=16 forward nodes 31.6M → 0.36M (~87×).
2. **Q-set structure + parity prune.** Computed (not assumed) the call
   transpositions: for **Grandsire**, the bob is a **5-cycle on the 5 working
   bells (Q-set 5)** and the single a **6-cycle (Q-set 6)** — the two hunt bells
   stay fixed. *Correction to earlier discussion: these are 5/6, not 3; the "3"
   is Plain Bob, a different method.* Parity (plain/bob even, single odd) ⇒
   come-round needs an **even number of singles**; folded into the reach DP as a
   correctness filter (rarely the binding constraint at these L, so node counts
   match the plain reach prune).
3. **Meet-in-the-middle.** Enumerate true forward halves (rounds→M) and backward
   halves (M→rounds); matching the midpoint rank M *is* the come-round condition,
   so the only join test is row-bitset disjointness (truth). Reaches L=22 (~10M
   true touches, 4 s) where forward DFS is infeasible. Memory-bound for peal
   length (half-space too big to store) — that's where Q-set/multipart generation
   comes next.

**Next:** Q-set-*generative* search (build touches from complete Q-sets rather
than lead-by-lead) and multipart symmetry to fold the search by the part count;
then port the validated approach to TypeScript for the `Proof` API.

### Snap finishes (IMPORTANT correctness note)

Grandsire's treble makes two blows at lead, so it is in 1st place at **both row 13
and row 14** of every lead. Rounds can therefore come up at **row 13 — one change
before the lead-end** — a valid "snap" finish (e.g. SPSPSBP = `s.s.s-.`, 97
changes). Rounds can appear nowhere else in a lead (treble leads only at rows 0,
13, 14), so detecting snaps is a single extra check at row 13; a snap touch is
`14·leads − 1` changes and comes round at backstroke.

- `prototypes/grandsire_touches.cpp` **handles snap finishes** (checks row 13 as
  well as the lead-end) — `./touches 7` shows SPSPSBP.
- `grandsire_bruteforce.cpp` and `grandsire_search.cpp` (incl. MITM + the memory
  analysis) detect **lead-end finishes only** — their touch counts are therefore
  undercounts that exclude snaps. The `Proof`/search API must treat a snap as a
  legal come-round.

### All-in-one solver — `prototypes/grandsire_solver.cpp`

`./solver <mode> <N|L> [cap]`, every technique wired in (ranking + bitset truth,
snap finishes, parity-AND-snap-aware reachability DP, MITM with snap seeds):

- `list N`  — all true come-round touches up to N leads, ordered by length.
- `count N` — counts per length (lead-end vs snap broken out).
- `find L [cap]` — up to `cap` true touches of EXACTLY L leads, found via the
  reachability DP + early-stop; each independently rung out and verified.
  **Reaches 30 leads (420 ch) or 90 leads (1260 ch = quarter length) in ~0.1 ms.**
- `mitm L` — total count at exactly L via meet-in-the-middle, snaps included.

Validated: `mitm` ≡ `count` exactly (L=10→24=10+14, L=12→482=287+195); `find`
results all verify TRUE. Snap finishes handled in every mode (MITM seeds the snap
as the touch's final short lead = the first backward step).

**Guidance:** `find`/`mitm` reach long lengths; `list`/`count` are complete but
bounded by the touch count (tens of billions by ~30 leads), so they are the
small-N tools. This whole search design is what the TS `Proof` API should mirror.

### Parallel solver — `prototypes/grandsire_solver_mt.cpp`

Multi-threaded build of `solver` (build needs `-pthread`; in build.sh). Same modes
and output plus `--threads K` (default = all cores). Strategy: enumerate a frontier
of independent true sub-touches at a shallow split depth (single-threaded, cheap),
then a thread pool consumes it with dynamic load-balancing via an atomic task index.
Each worker owns its truth bitset + call stack + accumulators (no shared writes in
the hot loop); read-only tables/DP shared; results merged after join. Finishes at/
before the split depth are recorded during generation so nothing is missed or
double-counted. MITM parallelises both the forward half-enumeration and the backward
join. Verified: parallel counts are identical to single-threaded for every mode and
thread count. Measured on 4 cores: mitm 22 ~3.2x (8.0s->2.5s), count 18 ~2.3x.
