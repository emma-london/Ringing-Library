# Architecture Decision Records

This directory holds the project's Architecture Decision Records (ADRs). Recording significant decisions here is the **default for the whole project** — see `../../CLAUDE.md`.

## What gets an ADR

Anything that shapes the public surface, the architecture, the phasing, the toolchain, or a trade-off a future contributor would otherwise have to reverse-engineer. When in doubt, write one — they are cheap and the rationale is the point.

Decisions still being worked out also get an ADR, in `Draft` status, framing the open questions so the thinking survives between sessions.

## Format

Each ADR is one Markdown file, numbered and titled: `ADR-NNNN-short-kebab-title.md`. Use the next free number; never reuse one.

A record carries, at minimum:

- **Header** — `Status`, `Date`, `Deciders`, and `Related` (links to other ADRs).
- **Context** — the forces in tension and what prompted the decision.
- **Decision** — what was chosen, stated plainly.
- **Options Considered** — the alternatives, with why each was or wasn't chosen. This is the part that prevents relitigation; do not skip it.
- **Consequences** — what becomes easier, what becomes harder, what to revisit.

`Status` moves `Draft` → `Proposed` → `Accepted`, or `Superseded by ADR-NNNN`. Never delete or silently rewrite a superseded ADR — mark it, link forward, and keep the history.

## Index

- **ADR-0001** — *(Accepted)* Cross-platform compute architecture (TS core + WASM engine). The three-layer architecture and the verify-on-client invariant. *Now*-list sequencing revised by ADR-0003.
- **ADR-0002** — *(Accepted)* Separating description from execution. `Composition` (data) / `Touch` (view) / `Prover` (verifier); `SearchTruth` kept engine-internal. Open items resolved by ADR-0005.
- **ADR-0003** — *(Accepted)* Phasing and roadmap. Phase 3 = truth-first pure-TS core; searcher and execution plumbing deferred to Phase 4.
- **ADR-0004** — *(Draft)* Application surface and agentic use cases. The deterministic/cached vs conversational/agentic split.
- **ADR-0005** — *(Accepted)* Composition identity and the `Proof` result type. `Composition` is the bare calling (hash = identity, no metadata); `Prover` returns an immutable `Proof` value.
- **ADR-0006** — *(Accepted)* The call model, calling notation, and come-round detection. Calls replace the tail of a lead; callings are one char per lead; come-round is checked at every row (snap finishes fall out for free) and must land in the last lead. Phase 3 implementation decisions.
- **ADR-0007** — *(Accepted)* Stedman, principles, and six-based calling. Stedman is a 12-change double-six principle; six-ends fall at changes 2 & 8 (the `7` begins each six). Phase 3 adopts **Option B**: eight compound double-six calls (bob `5`, single `567`) inside ADR-0006, built from a natural per-six string (`stedmanTriplesCalls` / `stedmanTriplesComposition`); verified true against published touches (SLQ=84, single×2=168, bobs=252). Full sub-lead calling (Option A) deferred as a future ADR-0006 successor.
- **ADR-0008** — *(Draft)* A declarative corpus of known-true/false test fixtures. Centralise the truth oracles (today scattered and code-implemented) into one human-readable data file with per-family adapters. Open: format, schema, relationship to `docs/example-touches.md`.
- **ADR-0010** — *(Accepted)* Deploying the test bench as a public web app. A Vite SPA under `app/` that imports straight from `src/` (no hand-bundled global), published to GitHub Pages via GitHub Actions; `base: /Ringing-Library/`. Supersedes the self-contained `ringing-test-bench.html`.
- **ADR-0009** — *(Draft)* Generic method & call construction. Replace per-method factories (`grandsireCalls`/`plainBobCalls`/`stedmanTriplesCalls`) with a generic lead-end call path for the common 95%+, plus a special-case registry for Grandsire/Stedman. Sequence with the full-library loader.
- **ADR-0011** — *(Accepted)* A bounded composition searcher in the app, ahead of the Phase 4 engine. A capped, shortest-first, truth-pruned enumerator (`src/search.ts` / `searchTouches`, "Search" tab) for the lead-end call methods, with hard length/result/node ceilings and a stable interface Phase 4 swaps the implementation behind. Scoped *not* to be the throwaway searcher ADR-0003 forbids: naive body, no reachability DP/rank-bitset, results re-provable by `Touch.prove()` and live-diffed against the C++ `grandsire_solver` prototype. Stedman (six-based calling) out of scope. Expected to be superseded by the Phase 4 search engine.
