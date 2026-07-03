# ADR-0016: Library-to-app interface contract — versioning, distribution, and deprecation

**Status:** Accepted
**Date:** 2026-07-03
**Deciders:** Emma (project owner)
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) (architecture, "one engine everywhere"), [ADR-0002](./ADR-0002-description-vs-execution.md) / [ADR-0005](./ADR-0005-composition-identity-and-proof-result.md) (`Composition` serialization/identity), [ADR-0004](./ADR-0004-application-surface-and-agentic-use-cases.md) (Draft, application surface — the product-shape question this ADR's plumbing question is distinct from), [ADR-0010](./ADR-0010-test-bench-deployment.md) (test-bench deployment; its Option C already flagged this decision as future work), `src/index.ts` (the barrel = the public surface)

## Context

Today there is exactly one app (`app/`, the test bench), and it consumes the
library by importing straight from `../src` — Vite bundles the real source on
every build (ADR-0010), so the demo can never drift from the core. That was
the right call for a single, same-repo, disposable reference UI: always-fresh,
zero packaging overhead, no version-skew risk because there's only one thing
consuming it and it lives right next to the source. ADR-0010 itself already
named this as temporary ("Option C... Rejected for now: Phase 3 has no
published package... Revisit if/when the library is published").

That model breaks down the moment a second app exists, especially once apps
are written by other people, outside this repo. This session surfaced a
concrete instance of the underlying problem even *inside* this repo:
`app/main.ts` had its own hand-rolled `callsFor()` that duplicated the
library's call-dispatch logic, because there was no other way for it to ask
the library "what are the standard calls for this method" — it had to know
the answer itself. When ADR-0009 changed that logic, the app's copy silently
went stale until someone noticed and fixed it by hand. Multiply that by
several apps, some maintained by people who don't have this repo's context,
and "the library changed underneath me" stops being a one-line fix and starts
being a support burden — or worse, silent wrong behavior nobody notices.

The requirement, stated directly by Emma: apps should keep working across
library updates they haven't explicitly opted into, and if an app is running
against something the library has genuinely moved past, that should fail in
an obvious, debuggable way — not silently compute something subtly wrong.
This needs deciding once, as a policy, not re-litigated per app. The test
bench is explicitly *not* the model for this policy — it was written quickly,
will probably disappear, and is named here as the exception, not the pattern.

## Decision

### 1. The public surface is exactly `src/index.ts`'s exports — nothing else

Anything re-exported from the barrel is public API, covered by everything
below. Anything not exported (internal module structure, unexported helpers,
implementation details inside `src/data/standard-methods.ts` beyond what the
barrel re-exports, etc.) is free to change at any time without notice — it
was never a promise to begin with. This is already true structurally today;
this ADR makes it a named, load-bearing rule rather than an implicit
convention nobody wrote down.

### 2. Semantic Versioning governs the public surface, with the pre-1.0 caveat made explicit

Standard SemVer (`MAJOR.MINOR.PATCH`): PATCH = fixes, no API change; MINOR =
additive, backward-compatible; MAJOR = breaking. The project is at `0.1.0`
today. Per the SemVer spec itself, **`0.x` means "anything may change at any
MINOR bump"** — this isn't a departure from SemVer, it *is* SemVer's own rule
for initial development. Worth being explicit about now rather than early
apps quietly assuming `0.x` already means stable: **until `1.0.0`, apps should
pin an exact version, not a range.** Once `1.0.0` ships, full SemVer
discipline applies and range-pinning becomes reasonable.

### 3. Apps consume the library as a versioned dependency — not shared source

Every app other than the test bench installs the library the normal npm way
(`npm install ringing-lib-ts@x.y.z`, or a range once post-1.0), pinned in the
app's own `package.json`. This is the actual decoupling mechanism: an app only
picks up a new library version when *it* runs an install/update, never
automatically because the library's source changed underneath it. This
requires the library to actually be published somewhere apps can depend on —
a public npm registry, given the repo itself is already public. Publishing
mechanics (registry choice, package name/scope, release automation) are an
open implementation question (see Consequences) — this ADR fixes the *shape*
of the contract (published, versioned, pinned), not the tooling.

### 4. The test bench is a named, explicit exception — not a precedent

`app/`'s `../src` import (ADR-0010) stays exactly as is. It is the project's
own scratch/reference UI, explicitly expected to be short-lived, and benefits
from always tracking current source for dogfooding — a change that breaks the
test bench is a signal *to this project*, not to an external consumer.
**No other app — first-party or third-party — gets this exception.** If a
second in-repo app is ever built for real (not scratch/reference), it
consumes the published package like everyone else; source-sharing does not
get to quietly become "how multiple first-party apps do it" just because one
of them started that way.

### 5. Deprecate before removing, and fail loudly during the deprecation window

Before any public export is removed or has a breaking behavior change:

- Mark it `@deprecated` in its JSDoc, with a one-line pointer to the
  replacement. This surfaces in editors and TS tooling immediately — a signal
  for anyone building against current source or types.
- Also emit a runtime `console.warn` the first time a deprecated export is
  actually *called* (not just referenced) — this catches apps that don't
  type-check against the latest types, or that consume compiled JS directly,
  who would otherwise get no signal at all.
- Keep the deprecated export working, unchanged, for at least one full MAJOR
  version cycle before actual removal. Removal only happens in a MAJOR bump,
  documented in a `CHANGELOG.md` entry with a migration note (what changed,
  why, and the replacement call).

This is the mechanism behind "fail predictably": an app on an old pinned
MAJOR version simply keeps working, unchanged, forever, until *it* chooses to
upgrade — at which point a MAJOR bump's CHANGELOG entry, and (if it kept
current during the deprecation window) console warnings, will already have
told it what to change, well before removal actually lands.

### 6. Serialized `Composition` data is its own versioned contract, separate from the function API

`Composition.toJSON()`/`fromJSON()` (ADR-0002, ADR-0005) is explicitly
designed to be cached, shared, and persisted — a composition is meant to
outlive the process that created it. That makes its JSON shape a
compatibility surface in its own right, independent of whether any function
signature changed. Concretely: add a schema-version field to
`CompositionJSON` (e.g. `schemaVersion: 1`) before any app starts persisting
these. `fromJSON` should check it and throw a clear, specific error on an
unrecognised version, rather than attempting to parse a shape it doesn't
understand and failing confusingly — or, worse, "succeeding" with silently
wrong data. This is cheap to do now (nothing has persisted a `Composition`
yet) and expensive to retrofit once real stored data exists in the wild.

## Options Considered

**Distribution model.** (A, chosen) publish a versioned package; apps depend
on it normally. (B, rejected) keep source-sharing as the general model (what
the test bench does today) — works only inside this one repo, for one app,
maintained by the same people who maintain the library; falls apart
immediately for external consumers, and was already shown (via `callsFor`) to
create silent drift even for a first-party, same-repo app. (C, rejected) a
git-URL dependency (`npm install git+https://...`, no registry) — avoids
registry setup, but loses SemVer range resolution and most tooling's
version-awareness; reasonable as a stopgap before a real publish, not as
standing policy.

**Pre-1.0 versioning stance.** (A, chosen) be explicit that `0.x` may break on
any MINOR, and tell early apps to pin exact versions. (B, rejected) promise
stability before `1.0` — a false promise given the API is still actively
changing (this session alone reshaped the call-construction surface twice);
better to be honest about it than to get blamed later for "breaking semver"
when `0.x` never promised otherwise.

**Deprecation signal.** (A, chosen) JSDoc `@deprecated` + runtime
`console.warn` + a guaranteed one-MAJOR-cycle window. (B, rejected)
types-only signal, no runtime warning — misses any consumer not actively
type-checking against current types (plain JS, or an app that vendored old
`.d.ts` files). (C, rejected) no formal deprecation window, just remove
things in MAJOR bumps with a CHANGELOG note — technically SemVer-compliant,
but gives real apps zero advance *runtime* signal before something they're
actively calling disappears; combining the warning with the window is barely
more work and meaningfully kinder.

**Composition JSON versioning.** (A, chosen) add `schemaVersion` now. (B,
rejected) defer until the shape actually needs to change — by then, real
stored data exists with no version tag on it, so there'd be no way to
distinguish an old blob from a new one without heuristics. Cheap now,
expensive later; chosen for that asymmetry alone.

## Consequences

**Becomes easier**
- Future apps — first-party or third-party — get a real contract to build
  against, instead of each one having to track this repo's source or guess
  what's stable.
- A breaking change becomes a documented, opt-in event (a MAJOR bump an app
  chooses to install) rather than something that happens to every consumer
  the moment `main` changes.
- The `callsFor`-style silent-drift problem this session fixed by hand can't
  recur the same way for a properly-distributed app: it either keeps working
  (pinned version) or gets a clear deprecation warning and CHANGELOG entry
  (upgraded version) — never silent behavior change.

**To watch**
- **Publishing mechanics are still open**: package name/scope, registry
  choice (public npm vs. GitHub Packages), and whether releases are cut by
  hand or automated (e.g. Changesets) are none of them decided here — this
  ADR fixes the *shape* of the contract, not the tooling. Needs resolving
  before the first non-test-bench app actually exists, not before Phase 4.
- **This adds real process weight**: every public-surface change now needs a
  SemVer-correctness judgment call, and breaking changes need a deprecation
  cycle instead of just landing. Worth it once there's more than one
  consumer; pure overhead while it's still just the test bench.
- **The test-bench exception needs active gatekeeping.** It's easy for a
  second "quick" in-repo app to start the same way (import straight from
  `src/`) and quietly become a second exception. §4's rule is deliberately
  absolute — no second source-sharing app — precisely to prevent that
  erosion.
- **`CompositionJSON`'s new `schemaVersion` field is itself a small breaking
  change** to that JSON shape (an added required field) — since nothing has
  published or persisted a composition yet, this is the cheapest possible
  moment to make it; it should be the first line of the first `CHANGELOG.md`
  entry once publishing starts.

## Action items

- [x] Add `schemaVersion` to `CompositionJSON` (`src/composition.ts`); make
  `Composition.fromJSON` validate it and throw clearly on a mismatch.
- [x] Add a `CHANGELOG.md` at the repo root (currently absent) — start it now,
  even pre-publish, so the `schemaVersion` addition is the first entry rather
  than an undocumented day-one assumption.
- [x] Decide publishing mechanics (registry, package name/scope, release
  process) before the first external or non-test-bench app is built. — see
  addendum below.
- [x] Cross-reference this ADR from ADR-0010 (done — see that ADR's
  Consequences section).

## Addendum (2026-07-03): publishing mechanics

Resolving the "Publishing mechanics are still open" item from Consequences,
ahead of any external app existing:

- **Registry: public npm.** The repo is already public; a git-URL dependency
  or private registry would add friction with no corresponding benefit.
- **`package.json` now carries `"private": true`.** This is a deliberate
  safety guard, not a policy decision — it makes `npm publish` fail closed
  until someone deliberately flips it, so nothing goes out before the license
  and 1.0.0 questions (below) are actually settled.
- **Release process is manual for now** (single maintainer): bump the
  version, move `CHANGELOG.md`'s `[Unreleased]` section to the new version
  with a date, tag via `npm version`, then `npm publish` by hand. Documented
  in `CONTRIBUTING.md` under "Releasing." Revisit as a `Draft` ADR if/when
  there's a release cadence or more than one maintainer — not worth
  automating (e.g. Changesets, CI-driven publish) for a single person cutting
  occasional releases.
- **Still open, deliberately not decided here:** the package's public
  `license` field (currently `"UNLICENSED"` as an explicit placeholder — *not*
  a decision, just the safe default until one is chosen) and whether
  `ringing-lib-ts` is the name to publish under or whether a scoped name
  (e.g. `@emma-london/ringing-lib`) is preferred. Both are Emma's call, not an
  engineering default — tracked as open questions, not action items with an
  assumed answer.

## Addendum (2026-07-03): license, package name, and the 1.0.0 line — decided

Resolving the two open questions above, and the separate "when is 1.0.0"
question Emma raised alongside the publishing-mechanics work:

- **License: MIT.** Added as `LICENSE` at the repo root and set in
  `package.json`'s `license` field. Chosen over Apache-2.0 for simplicity —
  no patent-grant machinery needed for a library of this scope — consistent
  with encouraging the third-party app authors this ADR is written for.
- **Package name: `ringing-lib-ts`, unscoped.** Kept as-is rather than moved
  to a scoped name (e.g. `@emma-london/ringing-lib`) — no reason found to
  change it.
- **`1.0.0` ships at Phase 4a completion**, not at Phase 4b or on
  first-external-app demand. Rationale: ADR-0011/ADR-0012/ADR-0013 already
  commit to `SearchReport`'s interface surviving the 4a→4b engine-body swap
  unchanged — the public surface is designed to be stable across that
  transition, so holding `0.x` through all of Phase 4b would deny consumers
  range-pinning with no corresponding gain in actual interface stability.
  Once Phase 4a's engine is live-diff-validated and swapped in
  behind the existing `SearchReport` signature, the public surface is
  considered stable and `1.0.0` is cut per the "Releasing" process in
  `CONTRIBUTING.md`.
- `package.json` remains `"private": true` until that point — this addendum
  sets the target, not an immediate publish.
