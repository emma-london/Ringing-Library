# ADR-0008 — A declarative corpus of known-true/false test fixtures

- **Status:** Draft
- **Date:** 2026-06-27
- **Deciders:** Project
- **Related:** [ADR-0005](ADR-0005-composition-identity-and-proof-result.md) (`Proof`), [ADR-0006](ADR-0006-call-model-and-come-round.md), [ADR-0007](ADR-0007-stedman-and-six-based-calling.md); `docs/example-touches.md`

## Context

Truth is the headline property of the core, and the tests carry that weight with
known-true and known-false compositions used as oracles. Today those oracles are:

- **Scattered** across `src/tests/example-touches.test.ts`, `src/tests/stedman-calls.test.ts`,
  and the prose oracle `docs/example-touches.md`.
- **Implemented in code** — each test constructs its composition inline and asserts
  length / come-round / truth in TypeScript.

That couples the *data* (which touch, what calling, what verdict) to the *execution*
(how this family is rung and asserted). A reviewer who just wants to see "what do we
claim is true/false, and where did it come from" has to read several test files. Adding a
new validated touch means writing code.

The goal: a **single, human-readable, declarative fixture file** that lists known
compositions and their expected results, read by whichever test needs them. Execution will
still differ per family (Grandsire uses `fromCalling`, Stedman uses the per-six
`stedmanTriplesComposition`), and that's fine — the *data* is what should be centralised.

## Open questions (this is a Draft framing the decision)

- **Format & location.** JSON/JSON5/YAML data, or a TS module exporting plain objects, in
  `src/tests/fixtures/` or `docs/`? A TS module keeps types; pure data is more obviously
  "config". 
- **Schema.** Likely: method reference (by name into `MethodLibrary`), calling (in the
  family's own notation), `start`, and expected `{ changeCount, comesToRounds, isSnap?,
  isTrue, falseRows? }`, plus `source` (URL/citation) and `notes`.
- **How different execution paths consume one fixture.** A small per-family adapter that
  turns `{method, calling}` into a `Composition` (one for lead-based `fromCalling`, one for
  Stedman per-six), so the corpus stays execution-agnostic.
- **Relationship to `docs/example-touches.md`.** Does the prose doc become generated from
  the corpus, or remain the narrative companion that the corpus cites?

## Options (sketch — to be expanded when scheduled)

1. **Declarative data file + thin loader/adapters (leaning).** One corpus, family adapters
   build `Composition`s, a shared assert helper checks the `Proof`. Most reuse; easiest to
   review and extend.
2. **Single TS fixtures module** exporting typed fixture objects (no parser, keeps
   compile-time checking) consumed by each test file.
3. **Status quo** — inline per test. Rejected as the thing we're trying to fix, kept as the
   baseline to beat.

## Consequences

- Centralising the corpus makes the truth claims auditable in one place and lets new
  validated touches be added as data, not code — directly serving the "truth is the
  headline" norm.
- Requires a small adapter seam per calling family; worth it, and a natural place to add
  future families.
- Decide before the corpus grows much further (currently small: the six `example-touches`
  cases plus the Stedman oracles).
