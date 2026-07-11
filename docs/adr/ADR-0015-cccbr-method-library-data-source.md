# ADR-0015: CCCBR method library data source — bundled snapshot vs live fetch

**Status:** Accepted
**Date:** 2026-07-03 (Draft); Accepted 2026-07-03
**Deciders:** Emma (project owner)
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) (zero-I/O core), `src/method-library.ts`, `src/data/standard-methods.ts`, [ADR-0013](./ADR-0013-phase-4-prework-and-split.md) (Phase 4a scope), [ADR-0008](./ADR-0008-truth-fixture-corpus.md) (bundled-JSON precedent), [ADR-0016](./ADR-0016-library-to-app-interface-contract.md) (public surface / additive fields)

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

## Resolved decisions (2026-07-03)

All five open questions were resolved in a working session with Emma. A quick
review of the live CCCBR data (`methods.cccbr.org.uk`, generated 2026-06-28,
**over 20,000 methods**) informed each.

- **Source format → Text.** The CCCBR publishes three formats: Text
  (tab-separated), MicroSiril (legacy ASCII), and XML (richest — adds
  false-coursehead groups, hunt-bell path, first-performance history). We take
  the **Text** format. Its columns — `Id, Method, First rung, Refs, FCHs,
  Stage, Sym, Lit, LLen, Leadhead, Notation` — carry the entire Lean field set
  we keep (below), so XML's extra richness would buy nothing we bundle, at the
  cost of more parser code and binary-zip handling. XML remains the upgrade
  path *only if* we later decide to bundle FCHs.
- **Fields → the Lean set.** Per method we keep: **id, name, stage,
  classification, notation, lead-head code (or lead-head row when uncoded),
  symmetry, little**. Dropped: first-rung date and refs (provenance, no engine
  use), FCHs (heavy, only meaningful for some methods — deferred), and lead
  length (derivable from notation). `MethodLibraryEntry` gained `id?`,
  `leadHeadCode?`, `symmetry?`, `little?` — all optional, so additive and
  non-breaking under ADR-0016.
- **Lead-head code → read in and interpreted.** The CCCBR `Leadhead` column is
  **either a code or a full row**: a code (`a`–`s`, optionally with a trailing
  digit — Framework Appendix C) when the first lead head matches one in the
  plain course of Plain Bob or Grandsire, otherwise the full lead-head row.
  These are stored separately (`leadHeadCode` vs `leadHead`), discriminated by
  the fact that codes are lower-case letters while rows are bell-name
  characters of length `stage`. `MethodLibrary.byLeadHeadCode()` groups methods
  that share a lead head (hence lead order / coursing) — a better structural
  signal for calling than `classification`.
- **Size / loading → shard by stage, small local set + downloadable full
  library.** Transformed to the Lean fields the whole library is a few MB
  (a few hundred KB gzipped) — small in absolute terms but more than a phone
  should parse on every launch. So: an always-bundled **standard set** (the
  local set) plus the **full library sharded one JSON asset per stage**
  (`data/method-library/full/stage-<n>.json`), the natural access pattern —
  a band rings one stage at a time and loads only that shard. `MethodLibrary`
  itself is unchanged (it takes a plain array); which array(s) a platform loads
  is its choice.
- **Standard set → an ID-keyed membership list resolved at build time; no
  hand-typed notation.** The always-bundled local set is defined by
  `src/data/standard-set-seed.json` — a minimal, hand-maintained list of
  methods identified by **title + stage** (and optionally a pinned CCCBR `id`).
  The refresh script **resolves each entry against the fetched snapshot** to
  populate the lean data, and **fails loudly** if a title/id can't be found or
  a pinned id's title doesn't match — so place notation is never typed by hand
  (Emma's explicit requirement: an easy source of error) and stale/mistyped
  references surface at build time, not silently. Starter membership drafted
  from Snowdon's *Diagrams* + the Standard 8 Surprise Major (~45 methods), for
  Emma to trim/extend.
  - *Note on keying:* the seed holds **`{ id, name, stage }`** — the CCCBR
    method `id` is the key, `name` + `stage` are human-readable and
    cross-checked. The resolver looks each id up in the snapshot and fails loud
    if it's missing or its title doesn't match the seed. (Title+stage matching
    without an id is still supported as a fallback, for quickly adding a method
    whose id isn't to hand — the resolver then keys on title+stage — but the
    committed seed pins ids.) Only these three fields are hand-maintained;
    notation and all other lean fields come from the snapshot, never typed.
- **Refresh mechanism → `npm run data:refresh`.** `scripts/refresh-method-library.mjs`
  (orchestrator) fetches each per-class-per-stage Text file, parses via the pure
  `scripts/lib/parse-cccbr-text.mjs`, shards by stage, resolves the standard
  set, and writes a `manifest.json`. Run by hand when a refresh is wanted;
  network + file I/O live entirely here, never in the runtime core (the
  ADR-0008 boundary). Jump and Dynamic methods are **excluded** — they use an
  extended place notation the core doesn't model.
- **Staleness visibility → a manifest.** `data/method-library/manifest.json`
  records the upstream "Generated by … on <date>" marker, the snapshot fetch
  timestamp, per-stage counts, total, and a `schemaVersion` — so an app (or a
  person chasing a missing method) can see how stale the bundle is.
- **Relationship to `STANDARD_METHODS` → kept distinct.** `STANDARD_METHODS`
  stays the small, hand-verified truth-corpus subset (ADR-0008); the snapshot
  is separate bulk application data. Conflating them would weaken the corpus's
  per-entry evidentiary standard.

## Options Considered

- **Live fetch of the CCCBR data at runtime** — rejected in Context: reintroduces
  the network dependency the zero-I/O core (ADR-0001) exists to avoid, for data
  that changes only ~monthly.
- **XML source instead of Text** — rejected: the Lean field set is fully present
  in Text; XML's extra data (FCHs, hunt path, performance history) is exactly
  what we chose *not* to bundle, so it adds parser complexity and binary-zip
  handling for no shipped benefit. Kept as the documented upgrade path if FCHs
  are ever bundled.
- **One monolithic library asset** — rejected for the phone-performance goal:
  forces parsing the whole library to look up one method. Per-stage shards match
  the access pattern.
- **Seed the standard set by raw notation / by hand-typed data** — rejected:
  hand-typed place notation is error-prone (Emma's point). Resolving a
  title/id list against the authoritative snapshot moves correctness to the
  upstream data and a loud build-time check.
- **Fold the full library into `STANDARD_METHODS`** — rejected: see above.

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
- The "distinct from `STANDARD_METHODS`" lean is confirmed:
  `MethodLibrary` is now constructed from two different arrays for two
  different purposes (a verified-subset instance for tests/corpus work, a
  full-library or standard-set instance for applications) — worth naming
  clearly in code so the distinction doesn't get muddled later.

## What was built (2026-07-03) / what remains

Built this session:

- `scripts/lib/parse-cccbr-text.mjs` — pure Text-format parser (lead-head
  code/row discrimination, full-title reconstruction, symmetry, little),
  covered by `src/tests/parse-cccbr-text.test.ts` (8 tests) against **real
  CCCBR rows**, including a cross-check that the parsed notation rebuilds the
  same lead heads as the hand-verified `STANDARD_METHODS` (Grandsire `1253746`,
  Plain Bob `1352746`).
- `scripts/refresh-method-library.mjs` + `npm run data:refresh` — the fetch /
  shard / resolve / manifest orchestrator.
- `src/data/standard-set-seed.json` — the starter standard-set membership.
- `MethodLibraryEntry` extended with `id? / leadHeadCode? / symmetry? /
  little?`; `MethodLibrary.byLeadHeadCode()` added.

Remains (Emma's environment — the sandbox this was built in can't make the
outbound calls): **run `npm run data:refresh` to vendor the actual snapshot**
(`data/method-library/full/stage-*.json`, `src/data/method-library/standard-set.json`,
`data/method-library/manifest.json`), then review the resolved `standard-set.json`
and trim/extend the seed. A thin platform loader (`import` the JSON →
`new MethodLibrary(...)`) is a one-liner per app and stays out of the zero-I/O core.

**Update (2026-07-05, ADR-0019):** the "thin platform loader" step is now done —
the standard set ships as the typed subpath export `ringing-lib-ts/data/standard-set`
(`STANDARD_SET`). As part of that, the resolved `standard-set.json` **moved under
`src/`** (`src/data/method-library/standard-set.json`) so the build emits and ships
it; the full shards and `manifest.json` stay under `data/`. The refresh script was
updated to match. See [ADR-0019](./ADR-0019-standard-set-subpath-export.md).

**Update (2026-07-11, [ADR-0022](./ADR-0022-dynamic-method-library-loader.md)) —
partial amendment, not a supersede.** This ADR's core decision — "bundled
snapshot, *not* a live fetch," and the rejected "Live fetch of the CCCBR data at
runtime" option — is scoped to the **zero-I/O core** (ADR-0001), and **still
stands** as the default and the offline guarantee. ADR-0022 adds a narrow,
**opt-in** exception for power users: a live CCCBR fetch behind a *separate*
subpath (`ringing-lib-ts/cccbr-methods`), **outside** the core, that never runs
unless an app imports it and that **degrades back to the bundled `STANDARD_SET`**
on any failure. So the runtime-fetch prohibition here is best read as scoped to
the core, with ADR-0022's loader as the documented opt-in alongside it — not as a
blanket ban this ADR forbids everywhere. ADR-0022 reuses this ADR's endpoints
(`methods.cccbr.org.uk/text`, per-`(file-class, stage)` files), its lean
`MethodLibraryEntry` shape, and its pure Text parser (which ADR-0022 promotes
from `scripts/` into shipped `src/` so the loader and this refresh script share
one copy).
