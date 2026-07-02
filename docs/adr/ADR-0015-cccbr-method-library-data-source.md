# ADR-0015: CCCBR method library data source — bundled snapshot vs live fetch

**Status:** Draft
**Date:** 2026-07-03
**Deciders:** Emma (project owner)
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) (zero-I/O core), `src/method-library.ts`, `src/data/standard-methods.ts`, [ADR-0013](./ADR-0013-phase-4-prework-and-split.md) (Phase 4a scope), [ADR-0008](./ADR-0008-truth-fixture-corpus.md) (bundled-JSON precedent)

## Context

`MethodLibrary` (Phase 3) is decoupled from I/O by design: it's constructed
from a plain array, no file or network access inside the core. Today that
array is `STANDARD_METHODS` — a small, hand-verified, correct subset.
`context.md` has long noted that "the full [Central Council library] can drop
into `MethodLibrary` later via a thin loader," but that loader was never
built or scheduled.

A 2026-07-03 conversation about offline-capable future apps identified this
as the second place a hidden network dependency could sneak in (the first
being the `Executor`'s `Remote` variant, ADR-0014): the CCCBR's published
method library (`methods.cccbr.org.uk`, mirrored at
`cccbr.github.io/methods`) is a live, server-hosted dataset. If the "thin
loader" simply fetches it at runtime, any app using the full library needs
connectivity just to list methods — silently reintroducing the network
dependency the core was designed to avoid.

Emma requested this be scheduled into **Phase 4a** (previously unscheduled
backlog) and set the direction: **bundle a snapshot into the repo, don't
fetch live**, since the upstream data "changes around monthly" — infrequent
enough that a periodically-refreshed local copy is a good trade for
guaranteed offline reliability. This mirrors the precedent ADR-0008 already
set with `known-touches.json`: data that changes slowly lives as a bundled,
versioned file, not a runtime dependency.

## Decision

The full CCCBR method library ships as a **bundled static snapshot** (data
file(s) vendored into the repo, format TBD — see Open Questions), not a
live fetch. `MethodLibrary` itself needs no change: it already takes a plain
array, so this is purely a question of *where that array's data comes from*
for the "full library" case, layered alongside — not replacing —
`STANDARD_METHODS`.

## Open questions (Draft — to resolve during Phase 4a)

- **Refresh mechanism.** A script (same shape as
  `scripts/generate-example-touches.mjs`) that re-fetches the upstream CCCBR
  data and regenerates the bundled snapshot — run by hand, or on some
  schedule matching the ~monthly upstream cadence Emma noted? The refresh
  script itself needs network access, but only at data-authoring time, never
  at runtime for an app consuming the library — the same "I/O lives outside
  the core" boundary ADR-0008's fixture loader already established.
- **Format.** Raw CCCBR JSON as published, or pre-transformed into
  `MethodLibraryEntry[]` shape at snapshot time, so the runtime bundle ships
  no transform logic? Leaning the latter — consistent with how
  `STANDARD_METHODS` is already shaped, and keeps parsing cost out of the
  hot path for an app on modest hardware.
- **Size and loading strategy.** The full library is large (thousands of
  methods). Does it ship as one JSON asset always loaded whole, or does
  `MethodLibrary` (or a wrapper around it) get a way to lazy-load by stage or
  classification, so a phone app isn't forced to parse the entire library
  upfront just to look up one method? This interacts directly with the
  "basic phones" performance goal, not just the offline one.
- **Staleness visibility.** Should the snapshot carry its own
  fetch/generation date (and maybe a source commit/version reference), so an
  app — or a person debugging a missing/outdated method — can tell how stale
  the bundled data is relative to the live CCCBR source?
- **Relationship to `STANDARD_METHODS`.** Stays a distinct, small,
  hand-verified subset used by the truth corpus and tests (ADR-0008), or
  does the full bundled library subsume it? Leaning **keep them distinct** —
  `STANDARD_METHODS` exists specifically because it's small enough to
  verify by hand against published blue lines; the full library is bulk data
  that hasn't had (and won't get) that same per-entry scrutiny. Conflating
  them would quietly weaken the corpus's evidentiary standard.

## Consequences

- Scheduling this into Phase 4a means the WASM engine spike and the "real,
  complete method data" question land in the same phase, rather than the
  engine being validated indefinitely against only the small curated set.
- Bundling trades data freshness for offline reliability — a deliberate
  choice given the upstream's slow (~monthly) change cadence, not an
  oversight.
- Adds a small recurring maintenance task (re-running the refresh script
  periodically) that doesn't exist today; someone has to actually do this or
  the bundled data silently goes stale.
- If the "distinct from `STANDARD_METHODS`" lean is confirmed when 4a starts,
  `MethodLibrary` may end up constructed from two different arrays for two
  different purposes (a verified-subset instance for tests/corpus work, a
  full-library instance for applications) — worth naming clearly in code so
  the distinction doesn't get muddled later.
