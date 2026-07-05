# ADR-0020: Deprecate the public `STANDARD_METHODS` export

**Status:** Accepted
**Date:** 2026-07-05
**Deciders:** Emma (project owner)
**Related:** [ADR-0019](./ADR-0019-standard-set-subpath-export.md) (the `STANDARD_SET` subpath export this steers consumers to), [ADR-0016](./ADR-0016-library-to-app-interface-contract.md) (public surface + the deprecation policy this follows), [ADR-0008](./ADR-0008-truth-fixture-corpus.md) (the truth-corpus role `STANDARD_METHODS` keeps internally), [ADR-0015](./ADR-0015-cccbr-method-library-data-source.md) (the standard-set/corpus distinction)

## Context

After ADR-0019 added the bundled standard set (`STANDARD_SET`, ~45 methods, via
`ringing-lib-ts/data/standard-set`), the package's root surface exposes **two**
method arrays:

- `STANDARD_METHODS` (~9) — the hand-verified **truth corpus** (ADR-0008): a
  small set whose place notation was checked by hand against published blue
  lines, existing so the core's truth tests have an oracle that is *not* derived
  from the same CCCBR snapshot pipeline it partly validates (using the snapshot
  to test the snapshot would be circular).
- `STANDARD_SET` (~45) — bulk **application data** resolved from the CCCBR
  snapshot, the set an app should actually build a `MethodLibrary` from.

Having both on the root export is the exact trap that prompted ADR-0019: a
consumer reaching for "the standard methods" lands on `STANDARD_METHODS` and gets
9, when they wanted the standard set. The corpus itself must stay — it is the
right oracle for tests — but it has no reason to be part of the *public* surface;
internal callers (the tests and `GrandsireTriplesEngine`) already import it
directly from `src/data/standard-methods.ts`, not through the package root.

## Decision

**Deprecate the public `STANDARD_METHODS` export, scheduled for removal in the
next major (2.0.0)**, steering consumers to `STANDARD_SET`. Follow ADR-0016's
deprecation mechanism rather than removing it outright, since removal from the
public surface is a breaking change and the package is already published.

Concretely:

- The root `index.ts` no longer re-exports the raw array. It exports a
  `@deprecated`-annotated wrapper: a `Proxy` over the internal corpus that emits
  a **one-time** `console.warn` on first access (pointing at
  `import { STANDARD_SET } from 'ringing-lib-ts/data/standard-set'`) and is
  otherwise fully transparent — same values, same type, non-breaking.
- The corpus itself (`src/data/standard-methods.ts`) is **unchanged and not
  deprecated**. Tests and the engine keep importing it directly, so they neither
  break nor trip the runtime warning; it simply reverts to being a purely
  internal fixture, which is what it always was in substance.
- This is a **non-breaking, additive-style** change: `STANDARD_METHODS` still
  resolves and still returns the same array, so it goes out in the same MINOR as
  ADR-0019 (1.2.0). Removal waits for 2.0.0, honouring ADR-0016's guaranteed
  one-MAJOR-cycle window.

## Options Considered

- **Deprecate now, remove in 2.0.0 (chosen).** Honours ADR-0016's contract
  (JSDoc `@deprecated` + first-use `console.warn` + a full major-cycle window),
  keeps existing code working, and gives the clear "use `STANDARD_SET`" signal
  in both the IDE (strikethrough) and at runtime.
- **Remove now as a breaking 2.0.0.** Cleanest end-state immediately, and
  defensible given the package is brand-new with effectively one consumer (the
  in-repo app, already migrated to `STANDARD_SET`). Rejected for now: a 2.0.0
  one release after 1.0.0 is a poor stability signal, and the deprecation path
  reaches the same end-state at the next natural major without breaking anyone in
  the meantime.
- **Keep both, just document the distinction.** Rejected: documentation alone
  doesn't stop the "reach for the wrong one" mistake — the same ambiguity that
  motivated ADR-0019 would remain on the root surface.
- **Also remove `STANDARD_METHODS` from `src/data/standard-methods.ts`.**
  Rejected — that array is the test oracle (ADR-0008) and must stay; only its
  *public* exposure is the problem.

Note the sibling call helpers in the same module — `standardCalls`,
`grandsireCalls`, `plainBobCalls`, `stedmanCalls`, `stedmanComposition`, and the
back-compat aliases — are genuinely useful public API and are **kept**; only the
`STANDARD_METHODS` array export is deprecated.

## Consequences

- The root surface now points unambiguously at `STANDARD_SET` for building a
  library; `STANDARD_METHODS` stays available but self-announces as the wrong
  tool. The truth-corpus vs application-data distinction (ADR-0015) is finally
  reflected in what the package exposes.
- A one-time runtime warning fires the first time an external consumer touches
  the export. Because the warning is behind a Proxy `get` trap guarded by a
  module-level flag, it fires at most once per process and never during our own
  tests/engine (which import the corpus directly) — verified.
- Minor implementation cost: the root export is now a `Proxy`, not the literal
  array. It is transparent for every normal use (indexing, `length`, iteration,
  spread, `find`, …); a consumer doing identity checks against the underlying
  module array would see a different reference, an acceptable edge for a
  deprecated export.
- **2.0.0 carries a scheduled task:** delete the deprecated wrapper from
  `index.ts` (the corpus in `src/data/standard-methods.ts` stays for tests). A
  `CHANGELOG.md` "Deprecated" entry records the window.
