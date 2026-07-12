# ADR-0023 — Seed-hash guard against a stale bundled standard set

- **Status:** Accepted (amended 2026-07-12 — build folded into publish; see Amendment)
- **Date:** 2026-07-12
- **Deciders:** Emma (project owner)
- **Related:** [ADR-0015](ADR-0015-cccbr-method-library-data-source.md) (seed → resolved standard set), [ADR-0019](ADR-0019-standard-set-subpath-export.md) (the bundled set ships via `dist`), [ADR-0016](ADR-0016-library-to-app-interface-contract.md) (release mechanics), `scripts/refresh-method-library.mjs`, `scripts/seed-hash.mjs`, `scripts/check-standard-set.mjs`, `.github/workflows/ci.yml`

## Context

`src/data/standard-set-seed.json` is the hand-maintained source of truth for the bundled standard set (ADR-0015). The set that actually ships, `src/data/method-library/standard-set.json`, is a **generated artifact** — `npm run data:refresh` resolves each seed entry against the CCCBR snapshot and writes the resolved JSON, which is committed so it can ship inside `dist` (ADR-0019).

Nothing kept the two in sync. `npm run build` is just `tsc`; it copies `standard-set.json` into `dist` verbatim and never re-resolves the seed. So editing the seed and then building — or publishing — silently ships the *old* standard set. There was also no npm-publish workflow at all (only the Pages deploy in `deploy.yml`), so publishing is a manual `npm publish` with nothing in the loop to catch the drift.

This bit us in practice: the seed was updated, the package built in GitHub Actions and published to npm, but the standard-set generation step never re-ran, so the published set was stale. `npm run data:refresh` fixed it after the fact.

The obvious "regenerate in CI and `git diff`" guard is awkward here: `data:refresh` makes live network calls to CCCBR and the full library shards are gitignored, so re-resolving the seed in CI needs the network and would also fold in unrelated upstream drift (a retitled method) as spurious failures. We want to catch **our** mistake — seed edited, generation not re-run — cheaply and deterministically.

## Decision

**Record a hash of the seed alongside the generated set, and verify it in a network-free guard on CI and before publish.**

- `scripts/seed-hash.mjs` computes a canonical SHA-256 of the seed's **method membership** — id, matched title, stage — normalised so it is insensitive to key order, whitespace, and seed line ordering, but sensitive to any add / remove / retitle-that-changes-matching. Title normalisation mirrors `normTitle` in the refresh script, so the hash changes exactly when the seed→snapshot resolution would. One module, imported by both producer and verifier, so they cannot drift.
- `scripts/refresh-method-library.mjs` writes the hash to `src/data/method-library/standard-set.seedhash` (committed, next to `standard-set.json`) every time it regenerates the set.
- `scripts/check-standard-set.mjs` (`npm run data:check`) recomputes the seed hash and compares it to the recorded one, failing with a message that points at `npm run data:refresh`. No network, no rebuild.
- The guard runs in a new `.github/workflows/ci.yml` (on push / PR to `main`, alongside `npm test` and `npm run build`) and as `prepublishOnly`, so a manual `npm publish` is blocked on a stale set too — the exact path that failed.

## Options Considered

**How to detect drift.** (A, chosen) a recorded seed hash, verified offline — catches "seed edited, not regenerated" deterministically, no network, no false positives from upstream churn. (B, rejected) regenerate in CI and `git diff --exit-code` — the textbook generated-file guard, but `data:refresh` needs the network (CCCBR) and the full shards aren't committed, so it can't run offline; it would also fail on unrelated upstream retitles, training people to ignore it. (C, rejected) a mtime / "seed newer than output" check — fragile across checkouts and rebases, where mtimes carry no meaning. (D, rejected) do nothing in CI and rely on discipline — the status quo that already shipped a stale set once.

**What to hash.** (A, chosen) canonical membership (id + normalised title + stage), order/format-independent — changes precisely when the resolved set would. (B, rejected) raw file bytes — trips on cosmetic reflows and comment edits that don't change the set, producing needless refresh churn. (C, rejected) hash the *output* `standard-set.json` instead — would detect a hand-edited output but not the actual failure mode (seed changed, output untouched), which is what we hit.

**Where to enforce.** (A, chosen) CI **and** `prepublishOnly` — CI catches it on the PR, `prepublishOnly` catches a local/manual publish, which is how releases actually happen (ADR-0016). (B, rejected) CI only — leaves the manual publish path, the one that failed, unguarded. (C, considered, deferred) a `prepublishOnly` that runs a full `data:refresh` + build — guarantees freshness but reintroduces the network dependency at publish time and folds in upstream drift silently; a build-on-publish step is a separate decision, out of scope here.

**Where the hash file lives.** (A, chosen) `src/data/method-library/standard-set.seedhash`, committed next to the generated JSON — one place, obviously paired with what it guards; confirmed not caught by the `data/method-library/` gitignore rule (which is root-anchored). (B, rejected) the existing `data/method-library/manifest.json` — gitignored and not shipped, so it isn't present in a fresh checkout to verify against.

## Consequences

**Becomes easier**
- Editing the seed without re-running `data:refresh` now fails fast — on the PR (CI) and at `npm publish` (`prepublishOnly`) — instead of silently shipping a stale set. Verified end-to-end: the guard passes in sync, fails (exit 1) on an unrefreshed seed edit, and passes again once reverted or regenerated.
- The project gains its first real CI beyond Pages deployment; `data:check`, `npm test`, and `npm run build` now run on every PR.

**To watch**
- The guard proves the set was regenerated *from the current seed*; it does not prove the snapshot is fresh against upstream CCCBR. Catching upstream drift (a method retitled at source) is a different concern — a scheduled/manual full `data:refresh`, deliberately left out of scope here.
- `seed-hash.mjs` must stay in step with the refresh script's `normTitle`. They're a matched pair by design (shared normalisation intent); if the resolution's matching logic changes, the hash canonicalisation should change with it. Both live in `scripts/` next to each other for that reason.
- ~~`prepublishOnly` runs only `data:check`, not a build — publishing still assumes `dist` was built (unchanged from before). Adding a build-on-publish step remains an open, separate question.~~ **Resolved by the 2026-07-12 amendment below** — `prepublishOnly` now builds too.

## Amendment (2026-07-12) — build folded into publish

The open thread above is now closed. `prepublishOnly` is **`npm run data:check && npm run build`**: a manual `npm publish` now rebuilds `dist` from source after the seed-hash guard passes, so the tarball can no longer ship a stale or hand-touched build. This removes the last "assumes `dist` was built by hand" gap and pairs naturally with the seed guard — publish now re-derives *both* generated surfaces it depends on (the guard proves the committed standard set matches the seed; the build re-emits `dist` from `src`).

**Order matters:** `data:check` runs first — it is cheap and network-free, so a stale seed fails fast before spending time on `tsc`.

**Scope, deliberately.** `prepublishOnly` still does **not** run `data:refresh` (which would re-fetch the CCCBR library over the network and fold in upstream drift at publish time, exactly what this ADR avoided). It rebuilds `dist` from the committed sources only. Regenerating the snapshot stays an explicit authoring-time step. Verified: `npm run data:check && npm run build` succeeds and emits `dist/index.js`, the `./data/standard-set` subpath, and the bundled `standard-set.json`.
