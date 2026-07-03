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

### Notes
- Nothing in this release removes or changes the behavior of any
  previously-existing export — `grandsireCalls`, `plainBobCalls`,
  `stedmanTriplesCalls`, and `stedmanTriplesComposition` all still work
  exactly as before; `standardCalls` and the generalized Stedman helpers are
  additive.
- This project has not been published to a package registry yet. Once it is,
  this file's `[Unreleased]` heading becomes the first tagged version and a
  new `[Unreleased]` section starts above it.
