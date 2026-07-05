# Contributing to Ringing Library

Welcome. This guide covers how we work on this project: how to get oriented, the
engineering norms, how decisions are recorded, and how we review and schedule work. It is
deliberately short — the authoritative detail lives in `context.md`, `CLAUDE.md`, and the
ADRs, and this guide points you to them.

## Get oriented first

Read **`context.md`** before anything else. It is the single load-first document: the
domain table (Bell, Row, Change, Method, Composition, Touch, Prover, …), the current phase
and state, and the roadmap. Then skim **`docs/adr/README.md`** for the decisions that got
us here — the ADRs carry the *why*, which is usually what you need.

## Build, test, run

```bash
npm install
npm test          # vitest run — the full suite
npm run test:watch
npm run build     # tsc, strict, ESM (NodeNext), output to dist/
```

The core is plain TypeScript with no runtime dependencies. The browser test bench lives in
`app/` (a Vite SPA, deployed via GitHub Pages — see ADR-0010) and imports the library
directly from `../src`; run it locally with `npm run app:dev`. Per ADR-0016 the test bench
is the **sole, named exception** to "apps consume the published package" — every other app
(present or future) must depend on a published version, never on `src` directly.

## Engineering norms

These are non-negotiable; see `CLAUDE.md` for the full statement.

- **The TypeScript core is pure, immutable, and zero-I/O** — identical behaviour on every
  platform (ADR-0001). `Row`, `Change`, `Method`, `Composition`, `Touch`, and `Proof`
  instances are immutable; operations return new values.
- **Truth correctness is paramount.** Validity (which rows are true/false) must be
  identical everywhere and **outranks performance everywhere**. Output (which valid touch
  to emit under a budget) may vary; correctness may not. Never trade the first for the
  second.
- **Tests carry the weight on truth.** Every truth-bearing change needs **positive and
  negative** cases, and negatives should be seeded from real, cited examples (see
  `docs/example-touches.md` and the Stedman oracles). A new validated touch should come
  with its source.

## Decisions are recorded as ADRs (the default)

Every significant decision is captured as an ADR **before** it is acted on — anything that
shapes the public surface, the architecture, the phasing, the toolchain, or a trade-off a
future contributor would otherwise have to reverse-engineer. This is the standing default,
not a per-task choice.

- Record the **why**, not just the what: options considered and why the losing ones lost.
- State the **decision** explicitly, with `Status` (`Draft` / `Proposed` / `Accepted` /
  `Superseded`) and date.
- Open threads still being worked out get a **`Draft` ADR** that frames the questions, so
  the thinking survives between sessions.
- **Supersede, don't silently rewrite.** Mark the old ADR `Superseded by ADR-NNNN`, link
  forward, and keep the history.

Format and numbering are in `docs/adr/README.md`. Keep **`context.md` current**: update the
domain table, state, and roadmap at the end of each phase and whenever the roadmap changes.

## Code review and feedback

We favour a lightweight, durable workflow:

- **For design discussion and small fixes**, plain review notes work best: number the
  points, reference **file:line**, and split them into **"now"** (address this change) vs
  **"future"** (schedule it). This is fast and unambiguous.
- **For a finished diff before it merges**, use **pull-request review comments** — inline,
  per-thread, alongside the diff and CI status. Prefer this once changes are concrete or
  once there is more than one contributor.
- **Durable feedback lands in the repo, not only in the conversation.** "Now" items are
  fixed in the change; "future" items become a `Draft` ADR (if they are a decision) or a
  **Backlog** entry in `context.md` (if they are a concrete, undecided-but-clear task).
  Review threads are ephemeral; ADRs, `context.md`, and the backlog are the memory.

## Scheduling future work

The roadmap and the **Backlog** section of `context.md` are where unstarted work lives.
Design-shaped items get a `Draft` ADR and a backlog pointer; small concrete extensions get
a backlog entry alone. Pick anything in the backlog up independently — each is written to
be unblocked.

## A note on the special-case methods

Grandsire and Stedman are intentionally in the curated method set because they stress the
model (odd stages, principles, six-end calls). If you are generalising the common path
(e.g. method/call construction), treat them as explicitly-registered special cases — see
ADR-0006, ADR-0007, and ADR-0009 — rather than bending the general mechanism around them.

## Releasing

The package is cleared to publish to the public npm registry as `ringing-lib-ts`
(unscoped, MIT). The one-time setup is done: the `LICENSE`, package name, and
version-1.0.0 criteria (ADR-0016 addenda) are settled, and `package.json`'s
`"private"` field is `false`. Each release is then a manual, per-release sequence:

1. Update `CHANGELOG.md`: rename `[Unreleased]` to the version being released (with date),
   and start a fresh empty `[Unreleased]` section above it. Commit this first — the next
   step requires a clean working tree.
2. `npm version <patch|minor|major>` on a clean tree — this writes the new version into
   `package.json` **and** creates the `vX.Y.Z` commit + git tag in one step (so don't
   hand-edit the version). Pick the bump per SemVer / ADR-0016: additive → `minor`,
   breaking → `major`, fixes → `patch`.
3. `git push --follow-tags` — pushes the release commit and its tag together.
4. Sanity-check the tarball with `npm pack --dry-run`: it should list the whole `dist/`
   tree, including `dist/data/standard-set.js` and
   `dist/data/method-library/standard-set.json` (the `./data/standard-set` subpath export,
   ADR-0019). Because `package.json` now declares an `exports` map, only the `.` and
   `./data/standard-set` entry points are publicly resolvable — deep `dist/**` imports are
   not.
5. `npm publish` (requires an authenticated npm account with publish rights — `npm whoami`
   to check; `npm login` if needed. A manual, human step; not something to run unattended).

This is a manual process for now, appropriate for a single maintainer. If/when there are
multiple contributors or a release cadence, revisit as a `Draft` ADR (CI-driven publish,
required reviews before a version bump, etc.) rather than improvising at release time.
