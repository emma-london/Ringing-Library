# ADR-0010 — Deploying the test bench as a public web app

- **Status:** Accepted
- **Date:** 2026-06-28
- **Deciders:** Emma
- **Related:** [ADR-0001](ADR-0001-cross-platform-compute-architecture.md) (TS core runs identically on every platform, including the browser), [ADR-0004](ADR-0004-application-surface-and-agentic-use-cases.md) (application surface)

## Context

`ringing-test-bench.html` (Phase 3) has proven useful enough to want it on the
public internet — a link people can open, not a file they have to clone and run.

Two forces shape the decision:

1. **The core is the source of truth.** Per ADR-0001 the pure TS core must run
   byte-identically in the browser. The test bench is a thin UI over that core.
   Whatever we ship must keep exercising the *real* `src/`, not a copy of it.
2. **The current bundling is manual.** Today the compiled library is pasted into
   the HTML as an esbuild IIFE that publishes `window.RingingLib`, and the UI
   reads off that global. Every change to `src/` requires a hand re-bundle and
   copy-paste — a silent-drift hazard exactly where correctness matters most.

A prior project ("Call Change App") deployed a similar small app with **Vite +
GitHub Pages** and it worked well. This repo is already on GitHub
(`emma-london/Ringing-Library`), so Pages is zero extra infrastructure. Volumes
are negligible; a static CDN is more than sufficient.

## Decision

Ship the test bench as a **Vite single-page app** that **imports directly from
`src/`**, deployed to **GitHub Pages via GitHub Actions**.

- The app lives in **`app/`** — `index.html`, `main.ts`, `vite.config.ts` —
  keeping the published library root clean and the demo app clearly separate.
- `main.ts` does `import * as R from '../src/index.js'`. Vite (esbuild) bundles
  the real core on every build; the `window.RingingLib` global and the inlined
  IIFE are removed. The UI can no longer drift from the core — it *is* the core.
- `base` is set to `/Ringing-Library/` (project-page path).
- A GitHub Actions workflow builds `app/dist` and publishes it to Pages on every
  push to `main`. Deployed URL: `https://emma-london.github.io/Ringing-Library/`.
- The deployed app is a **read-only client of the core**: pure compute, no
  backend, no I/O — consistent with the verify-on-client invariant (ADR-0001).

## Options Considered

**A. Vite app importing from `src/` (chosen).** One build pipeline; the demo
always tracks the real core; standard, well-trodden Pages deploy. Cost: a small
refactor (global → ES import) and a build step. Accepted because it removes the
drift hazard permanently and matches a known-good pattern.

**B. Host the existing self-contained HTML as-is.** Cheapest to stand up — just
publish the file. Rejected: it preserves the manual re-bundle-and-paste loop, so
the public demo can silently fall behind `src/`. The drift risk is the whole
reason not to do this.

**C. Bundle the published library as an npm artifact and import that.** Cleaner
dependency boundary long-term. Rejected for now: Phase 3 has no published
package, and pointing the demo at a build artifact reintroduces a sync step
between `src/` and the artifact. Revisit if/when the library is published.

**D. A different host (Netlify / Vercel / Cloudflare Pages).** All fine
technically. Rejected: GitHub Pages is already where the repo lives, needs no new
account or secret, and the traffic is trivial. No reason to add a vendor.

**E. App at the repo root vs. in `app/`.** Root is flatter but mixes app tooling
(Vite config, app `index.html`) with the library it demonstrates. Chose `app/`
for a clean separation between the library and its demo surface.

## Consequences

- **Easier:** the public demo can never drift from the core; shipping a change is
  a `git push`; no manual esbuild step survives.
- **Harder / to watch:** `src/` is now also a *browser* build input, so anything
  Node-only or with import side effects would break the app build — a constraint
  that already aligns with ADR-0001's "pure, zero-I/O core."
- **New surface:** `base: '/Ringing-Library/'` is tied to the repo name; renaming
  the repo (or moving to a custom domain) means updating it.
- **`ringing-test-bench.html` is now superseded** by `app/`. It is left in place
  for reference but should be treated as frozen; `app/` is the living version.
- Revisit if the library is published as a package (Option C) or if the app grows
  beyond a single-page test bench.
