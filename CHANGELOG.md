# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Version numbers follow [Semantic Versioning](https://semver.org/), with the
project's pre-1.0 policy made explicit in
[ADR-0016](docs/adr/ADR-0016-library-to-app-interface-contract.md): **while
the version is `0.x`, any MINOR release may include breaking changes** (this
is SemVer's own rule for initial development, not a departure from it) — pin
an exact version, not a range, until `1.0.0` ships. See ADR-0016 for the full
policy on the public surface, deprecation, and why `Composition`'s serialized
JSON shape is versioned separately from the function API.

## [Unreleased]

## [1.0.0] - 2026-07-03

First stable release — marks **Phase 4a completion** (ADR-0016). From here the
public surface (`src/index.ts`) is governed by SemVer proper: breaking changes
require a MAJOR bump. `Composition`'s serialized JSON is versioned separately
via `schemaVersion` (ADR-0016).

### Added
- `standardCalls(method)` — generic call construction for the common case
  (bob `14` / single `1234`), dispatching `Grandsire*` (Doubles upwards) and
  `Stedman*` (Triples upwards) to their special-case factories by name.
  `Stedman*` at stage 5 (Doubles) throws rather than guessing — a genuine
  structural exception, deferred to a future phase, not silently wrong.
  (ADR-0009)
- `stedmanCalls(stage)` and `stedmanComposition(calling, method)` — Stedman's
  six-end calls and per-six composition builder, generalized from
  Triples-only to any stage from Triples upwards. `stedmanTriplesCalls()` and
  `stedmanTriplesComposition()` remain as stage-7 back-compat aliases.
  (ADR-0008, ADR-0009)
- `BELL_NAMES` extended from 12 to 33 bells
  (`1234567890ETABCDFGHJKLMNPQRSUVWYZ`), matching the CCCBR Framework's
  letter convention for bells beyond Maximus (digits, then `0` for the 10th,
  then letters skipping `I`/`O`/`X`).
- `CompositionJSON` now carries a `schemaVersion` field
  (`COMPOSITION_JSON_SCHEMA_VERSION`, currently `1`). `Composition.fromJSON`
  rejects a missing or unrecognised `schemaVersion` with a clear error,
  rather than attempting to parse a shape it doesn't recognise. (ADR-0016)
- A declarative truth-fixture corpus
  (`src/tests/fixtures/known-touches.json`) consolidating the known-true/false
  composition oracles used in testing. Internal to the test suite, not part
  of the public API surface; `docs/example-touches.md` is now generated from
  it. (ADR-0008)
- **Composition search engine core** behind a stable `CompositionEngine` seam:
  `LeadHeadEngine` (generic over any treble-hunt lead-head method up to Royal)
  and `GrandsireTriplesEngine` (a thin preset + the C++ live-diff path), with
  result/report types `EngineTouch`, `EngineFind`, `CountRow`, `CountReport`,
  `MitmCount`, `QSet`. An optimized-TypeScript port of the validated C++
  prototype (ranked lead-head DFS, bitset truth, reachability DP,
  meet-in-the-middle, Q-sets, snap finishes); emits re-provable `Composition`s.
  Rust/wasm-pack remains the recorded future drop-in behind the same seam.
  (ADR-0013, ADR-0017, ADR-0018)
- **Bounded composition searchers** `searchTouches` (lead-end methods) and
  `searchStedmanTouches` (six-based), with `SearchOptions`, `SearchResult`,
  `SearchReport`, `StedmanSearchOptions`, and `StedmanCall` types — capped,
  shortest-first, truth-pruned; a stable interface the Phase 4b engine slots
  behind unchanged. (ADR-0011, ADR-0012)
- **CCCBR method-library snapshot support.** `MethodLibraryEntry` gained
  optional `id`, `leadHeadCode`, `symmetry`, and `little`; `MethodLibrary`
  gained `byLeadHeadCode()`. Backed by an authoring-time pipeline
  (`npm run data:refresh`) that vendors the full CCCBR library sharded by
  stage plus a resolved standard set — data and tooling only, outside the
  public API and the zero-I/O runtime core. (ADR-0015)

### Notes
- Nothing in this release removes or changes the behavior of any
  previously-existing export — `grandsireCalls`, `plainBobCalls`,
  `stedmanTriplesCalls`, and `stedmanTriplesComposition` all still work
  exactly as before; `standardCalls` and the generalized Stedman helpers are
  additive.
- This `1.0.0` is staged in the repo but **not yet published** to a package
  registry: `package.json` stays `"private": true` until someone runs the
  manual `npm publish` step (see CONTRIBUTING.md, "Releasing"). Flipping
  `private` and publishing is the final, human-run action.
