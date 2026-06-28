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
- **[ADR-0010](docs/adr/ADR-0010-test-bench-deployment.md)** *(Accepted)* — deploying the test bench as a public web app. A **Vite SPA in `app/` that imports straight from `src/`** (no hand-bundled global), published to **GitHub Pages via GitHub Actions** on push to `main`. The deployed demo can't drift from the core because Vite rebuilds `src/` every time; `base: '/Ringing-Library/'`. Supersedes the self-contained `ringing-test-bench.html`. (ADR-0008/0009 remain Draft and are tracked in `docs/adr/`.)

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

**Phase 3 complete.** The truth-first core is built: `Composition`, `Touch`, `Prover`/`Proof`, and `MethodLibrary`, all implemented and tested against real methods. Truth is the headline — positive and negative cases, with the negatives seeded from real worked examples (`docs/example-touches.md`), including the SPSPSBP **snap finish**. (Phase 2 — PlaceNotation and Method — remains complete underneath.)

### Files

| File | Purpose |
|---|---|
| `ringing-api-sketch.ts` | Original API surface design (reference) |
| `package.json` | npm config; `npm test` runs vitest, `npm run build` compiles; `app:dev`/`app:build`/`app:preview` run the Vite test-bench app (ADR-0010) |
| `tsconfig.json` | Strict TypeScript, ESM (`NodeNext`), output to `dist/` |
| `src/bell.ts` | `Bell`, `Stage`, `BELL_NAMES`, `bellToChar`, `bellFromChar` |
| `src/row.ts` | `Row` — immutable permutation, full algebra |
| `src/change.ts` | `Change` — place notation token, apply/swaps, parse with implicit externals |
| `src/place-notation.ts` | `PlaceNotation` — parse/stringify; handles `&`, `-`/`X`, `.`, `,` grammar |
| `src/method.ts` | `Method` — leadRows, leadRowsNoLH, leadHead, leadHeads, toString |
| `src/prover.ts` | `Prover` (pure incremental truth verifier) + `Proof` (immutable result value) — Phase 3 |
| `src/composition.ts` | `Composition` + `CompositionBuilder`, `CallDefinition`/`CallingEntry`, `fromCalling`, `key()`/`hash()` (FNV-1a), `toJSON`/`fromJSON` — Phase 3 |
| `src/touch.ts` | `Touch` — lead expansion with call substitution, come-round/snap detection, `prove()` — Phase 3 |
| `src/method-library.ts` | `MethodLibrary` — find/byStage/byClass/method()/iterator — Phase 3 |
| `src/data/standard-methods.ts` | Curated real CCCBR method data (incl. **Stedman Triples**, a principle — ADR-0007) + `grandsireCalls`/`plainBobCalls`/`stedmanTriplesCalls` factories and `stedmanTriplesComposition` (per-six calling) — Phase 3 |
| `src/index.ts` | Barrel export |
| `app/` | **Live test bench** — Vite single-page app deployed to GitHub Pages (ADR-0010). `index.html` (markup/styles), `main.ts` (UI, imports the real core via `import * as R from '../src'`), `vite.config.ts` (`base: '/Ringing-Library/'`). Compose & Prove, Method Explorer (plain course / blue line), Row & Change playground. The deployed demo can't drift from the core because Vite bundles `src/` on every build |
| `.github/workflows/deploy.yml` | GitHub Actions: build `app/dist` and publish to Pages on push to `main` (ADR-0010). URL: `https://emma-london.github.io/Ringing-Library/` |
| `ringing-test-bench.html` | **Superseded by `app/`** (ADR-0010) — the original self-contained browser app with the library hand-bundled in via esbuild. Frozen; kept for reference only |
| `src/tests/bell.test.ts` | 13 tests |
| `src/tests/row.test.ts` | 34 tests |
| `src/tests/change.test.ts` | 24 tests |
| `src/tests/place-notation.test.ts` | 11 tests |
| `src/tests/method.test.ts` | 22 tests |
| `src/tests/stedman.test.ts` | 15 tests |
| `src/tests/prover.test.ts` | 14 tests — Phase 3 |
| `src/tests/composition.test.ts` | 19 tests — Phase 3 |
| `src/tests/touch.test.ts` | 17 tests — Phase 3 |
| `src/tests/method-library.test.ts` | 7 tests — Phase 3 |
| `src/tests/example-touches.test.ts` | 6 tests — the `docs/example-touches.md` oracle — Phase 3 |
| `src/tests/stedman-calls.test.ts` | 10 tests — Stedman six-end calls vs published touches (ADR-0007) |
| `playground.ts` | Phase 1 self-contained TS Playground file |
| `playground-phase2.ts` | Phase 2 self-contained TS Playground file |

**192 tests, all passing.** Clean `tsc` build.

### Implementation notes

- `Change.parse` handles implicit external places (e.g. `'1'` on major auto-adds the tenor place at the high end)
- `Row.apply(change)` delegates to `Change.apply(row)` — single source of truth for the swap logic
- All `Row`, `Change`, `Method`, `Composition`, `Touch`, and `Proof` instances are immutable
- `PlaceNotation._tokenize` treats `-` as both a cross change token AND a separator (the standard convention); `.` is a pure separator
- Symmetric `&body,leadEnd` expands to palindrome(body) + [leadEnd] = 2n changes; `&body` without comma = palindrome only = 2n-1 changes
- **Calls replace the tail of a lead** (ADR-0006): Grandsire bob `3.1` / single `3.123` (last 2 changes), Plain Bob bob `14` / single `1234` (last change)
- **Come-round is checked at every row**, so **snap finishes** work without a special case; a return only counts as a finish in the last specified lead. A true touch of *c* changes proves *c* distinct rows (Grandsire Triples plain course = 70)
- `Composition` identity = content hash of (method ref, start, calls used, calling, length) via FNV-1a; metadata stays out of the hash (ADR-0005)
- Truth verified against the six `docs/example-touches.md` cases: verdicts and lengths (70 / 84 / 97 snap / 224) all match, both false cases report their repeated rows with line numbers
- **Bug fixed in passing:** the Phase 2 tests carried a wrong Cambridge S Major notation (`-36-14-1256-…`, lead head `18345627`, a 3-lead course — not Cambridge). Corrected everywhere to `&-38-14-1258-36-14-58-16-78,12` (lead head `15738264`, true 7-lead / 224-change plain course). See ADR-0006.

---

## Roadmap (agreed — see [ADR-0003](docs/adr/ADR-0003-phasing-and-roadmap.md))

**Phase 3 — "Make sure a TS library actually works" (truth-first, pure TS, no new toolchain). ✅ COMPLETE (2026-06-23).** Built `Composition`, `Touch`, `Prover`/`Proof`, `MethodLibrary`. Defined by its tests: **truth is the headline** — 182 tests, positive *and* negative, negatives seeded from `docs/example-touches.md` (incl. the snap finish). `Composition`'s serializable/hashable shape is fixed (FNV-1a content hash; the one ADR-0001 hook kept in this phase). Real method data loaded via `src/data/standard-methods.ts` (curated correct CCCBR subset; the full [Central Council library](https://cccbr.github.io/methods/) can drop into `MethodLibrary` later via a thin loader). Call model and come-round/snap decisions recorded in **ADR-0006**.

**Phase 4 — Search engine + the execution plumbing it serves.** WASM engine (Rust/wasm-pack or AssemblyScript spike first), plus everything that only exists to serve a searcher: `Executor` (`Local`/`Worker`/`Remote`), per-call budget, deterministic search mode, resumable chunk protocol, streaming/progress/cancel. Validated by **live diff against the C++ prototypes** (not frozen vectors). Deferred deliberately — search is rarely used and cheap to test side-by-side; space is left for it, it is not pre-built. No throwaway TS searcher.

**Phase 5 — Orchestration and scale.** Admission controller, cost model, server handoff UX, cached composition corpus (ADR-0001 "later").

**App phase (open, [ADR-0004](docs/adr/ADR-0004-application-surface-and-agentic-use-cases.md) Draft).** Platform/app surface and the deterministic-vs-agentic intent split — still being thought through; downstream of the core and engine.

### Backlog (scheduled, not yet started)

Captured from code review; each is unblocked and can be picked up independently.

- **Declarative truth-fixture corpus** — centralise the scattered, code-implemented known-true/false test oracles into one human-readable data file with per-family adapters. Design in **[ADR-0008](docs/adr/ADR-0008-truth-fixture-corpus.md)** *(Draft)*.
- **Generic method & call construction** — replace per-method call factories (`grandsireCalls`/`plainBobCalls`/`stedmanTriplesCalls`) with a generic lead-end call path for the common 95%+, plus a special-case registry for Grandsire/Stedman; best done with the full-library loader. Design in **[ADR-0009](docs/adr/ADR-0009-generic-method-and-call-construction.md)** *(Draft)*.
- **Bell names beyond Maximus** — `src/bell.ts` `BELL_NAMES` stops at 12 (`1234567890ET`). Extend to the standard higher-stage symbols (sixteen, eighteen, twenty…) and add tests. Small, concrete; no ADR needed — confirm the exact symbol convention (e.g. `A B C D …`) against CCCBR when implementing.

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
