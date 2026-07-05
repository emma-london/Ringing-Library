# ADR-0019: Exposing the bundled standard set through a subpath export

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Emma (project owner)
**Related:** [ADR-0015](./ADR-0015-cccbr-method-library-data-source.md) (the CCCBR snapshot / standard-set seed — this ADR resolves its "remaining" loader step), [ADR-0016](./ADR-0016-library-to-app-interface-contract.md) (public surface / additive, non-breaking changes), [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) (zero-I/O core), [ADR-0010](./ADR-0010-test-bench-deployment.md) (the in-repo app imports straight from `src/`)

## Context

An app built against the published package (`ringing-lib-ts`) was only seeing
**9 methods**, not the ~45 of the standard set. Investigation showed this was
not a truncation bug but a **gap in the public surface**:

- The package's only `MethodLibrary`-ready array on its public surface is
  `STANDARD_METHODS` — the small, hand-verified *truth corpus* (ADR-0008),
  exported from the root `index.ts`. An app reaching for "the standard methods"
  naturally lands on it and gets 9.
- The ~45-method **standard set** that ADR-0015 designed *does* exist as
  resolved data (`standard-set.json`, built from `standard-set-seed.json` by
  `npm run data:refresh`), but it was **never wired into the package**:
  - nothing in `index.ts` referenced it, and
  - it lived under `data/method-library/`, outside `dist`, while
    `package.json`'s `files` ships only `dist` — so it wasn't even present in
    the published tarball.

ADR-0015 had explicitly flagged this: it built the seed, the refresh
orchestrator and the JSON, but left "a thin platform loader (`import` the JSON →
`new MethodLibrary(...)`)" as remaining work. This ADR is that step, plus the
decision about *how* the data reaches a consumer.

ADR-0015 also set the framing this builds on: the standard set is the
**always-bundled** local set (a few dozen methods), distinct from the **full
library**, which is **sharded by stage and downloadable, not bundled**. So the
question is only how to expose the *standard set* through the package; the full
shards stay out of the shipped tarball by design.

## Decision

Expose the standard set as a **dedicated subpath export**, `ringing-lib-ts/data/standard-set`,
resolving to a typed module that re-exports the bundled data as
`MethodLibraryEntry[]`:

```ts
import { MethodLibrary } from 'ringing-lib-ts';
import { STANDARD_SET } from 'ringing-lib-ts/data/standard-set';

const lib = new MethodLibrary(STANDARD_SET);   // ~45 methods
```

Concretely:

- **A typed wrapper**, `src/data/standard-set.ts`, imports the resolved JSON and
  re-exports it as `STANDARD_SET: MethodLibraryEntry[]` (named + default). This
  gives consumers a fully-typed array and a stable export name decoupled from
  the data-file layout — they never touch raw JSON or need `resolveJsonModule`.
- **The resolved JSON moves under `src/`** (`src/data/method-library/standard-set.json`)
  so it sits inside tsc's `rootDir` and is emitted into `dist` on build, and so
  it ships inside the existing `files: ["dist"]` allow-list with no change to
  what is packaged. `resolveJsonModule` is enabled; the JSON is imported with an
  import attribute (`with { type: 'json' }`), which the ESM output preserves.
  The **full per-stage shards and the manifest stay in `data/method-library/`**
  (outside `dist`) — the downloadable full library is deliberately *not*
  bundled. `refresh-method-library.mjs` now writes `standard-set.json` under
  `src/` and the shards/manifest under `data/`.
- **`package.json` gains an `exports` map** with `.` (the root, unchanged
  behaviour) and `./data/standard-set`. `main`/`types` are kept for older
  resolvers.
- **The standard set is *not* added to the root `index.ts`.** Keeping it on its
  own subpath means an app that only wants the compute core (or brings its own
  method data) never pays for the ~7 KB of bundled methods — the subpath
  tree-shakes away when unused. It also keeps the root entry's meaning of
  "methods" unambiguously the hand-verified corpus.

## Options Considered

- **Re-export `STANDARD_SET` from the root `index.ts`** (the simplest for a
  consumer — one import, no subpath). Rejected as the default: it bundles the
  method data into the main entry for *every* consumer whether they want it or
  not, and it blurs the root surface where "methods" has meant the verified
  corpus. The subpath gives the same one-line ergonomics
  (`import { STANDARD_SET } from 'ringing-lib-ts/data/standard-set'`) without
  either cost, and extends naturally if we later expose full-library shards the
  same way.
- **Ship raw JSON and have consumers import `…/standard-set.json` directly.**
  Rejected: the consumer gets a structurally-inferred type, not
  `MethodLibraryEntry[]`, and must enable `resolveJsonModule` and know the file
  path. A typed wrapper is a truer public API and hides the file layout.
- **Leave it to each app to load the JSON itself (no package change).**
  Rejected: this is exactly the state that produced the bug. It only works for
  the in-repo app (which imports from `src/`); a real npm consumer cannot reach
  data that isn't in the tarball. The point is to make the standard set usable
  by *any* consumer.
- **Keep the JSON under `data/` and copy it into `dist` with a build step**
  (leaving source layout untouched). Rejected as more machinery for the same
  result: a wrapper importing a file *outside* `rootDir` makes tsc relocate the
  output tree (breaking `main`) and does **not** emit the JSON, so it needs a
  bespoke copy step and hand-written typings. Moving the one bundled file inside
  `src/` lets the normal tsc pipeline emit and type it, and Vite (the in-repo
  app, ADR-0010) resolves the same import with no extra config. Verified
  empirically before choosing: JSON imported from inside `rootDir` is emitted
  into `dist`; from outside it is silently dropped and the output tree is
  mangled.
- **Bundle the full per-stage library too.** Out of scope and against ADR-0015:
  the full library is megabytes and is the *downloadable* dataset; only the
  small standard set is always-bundled. The subpath mechanism established here
  is the natural place to add opt-in shard exports later if wanted.

## Consequences

- Any consumer can now build a real `MethodLibrary` in two lines, closing the
  ADR-0015 loader gap. `STANDARD_METHODS` (root) and `STANDARD_SET`
  (`/data/standard-set`) now clearly delineate the two long-distinguished sets:
  hand-verified truth corpus vs bundled application data.
- The published tarball grows by ~7 KB (the standard-set JSON, emitted into
  `dist`). The full shards remain unbundled.
- Adding the subpath is additive and non-breaking under ADR-0016: the root
  entry and every existing export are unchanged. Introducing an `exports` map
  does, however, make the package's entry points *authoritative* — deep imports
  into `dist/**` that aren't declared as subpaths are no longer resolvable. Only
  `.` and `./data/standard-set` are public; that is the intent.
- A small maintenance coupling: `standard-set.json` is now a build-tracked file
  under `src/`. `npm run data:refresh` regenerates it in place (the shards and
  manifest still land under `data/`), so a refresh now touches `src/` — expected
  and documented in the script header.
- The in-repo test-bench app (ADR-0010) now consumes `STANDARD_SET`, so it
  exercises the same surface a real consumer would and displays all ~45 methods.
  Wiring the larger set through the app also surfaced that the Compose tab
  hard-coded Stedman to Triples; fixed to pass the selected method so higher
  Stedman stages compose at their own stage.
