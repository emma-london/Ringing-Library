# ADR-0009 — Generic method & call construction (vs per-method factories)

- **Status:** Draft
- **Date:** 2026-06-27
- **Deciders:** Project
- **Related:** [ADR-0006](ADR-0006-call-model-and-come-round.md) (call model), [ADR-0007](ADR-0007-stedman-and-six-based-calling.md) (Stedman), `src/data/standard-methods.ts`, `src/method-library.ts`

## Context

`src/data/standard-methods.ts` currently exposes calls through **per-method factory
functions**: `grandsireCalls()`, `plainBobCalls()`, `stedmanTriplesCalls()`. This was the
right way to *de-risk* the model — deliberately picking structurally awkward methods
(Grandsire's `3.1`/`3.123`, Stedman's six-end compound calls) to prove the core can cope.

But the great majority of methods share one structure: a **call is a place-notation
substitution at the lead-end** — typically bob `14` / single `1234` on even-bell plain and
treble-dominated methods, derived mechanically from stage and method class. Naming a
function after each method does not scale to the full CCCBR library and hides that
commonality. The aim: a **generic call-construction path for the common 95%+**, with
Grandsire and Stedman as explicitly-registered special cases rather than the template.

## Open questions (Draft — framing the decision)

- **What is the generic call descriptor?** e.g. a call defined by `{ name, symbol,
  notation, replaces }` where `notation` is the lead-end place-notation token(s) and
  `replaces` the number of tail changes — already expressible as `CallDefinition`
  (ADR-0006). The open part is *deriving* the standard bob/single for a method from its
  stage/class without a bespoke function.
- **Where do call definitions live?** Attached declaratively to `MethodLibraryEntry`
  (data), or produced by a generic factory `standardCalls(method)` keyed off class/stage?
  Data is transparent; a factory centralises the rules.
- **How are special cases registered?** Grandsire (`3.1` / `3.123`) and Stedman (compound
  six-end calls, ADR-0007) need an override hook — a small registry by method name/class —
  so they sit *beside* the generic path, not inside it.
- **Interaction with the full library import.** When the full CCCBR library drops in
  (`MethodLibrary` already takes any array), most entries should get standard calls for
  free; the loader shouldn't need per-method code.

## Options (sketch — to be expanded when scheduled)

1. **Generic `standardCalls(method)` + a special-case registry (leaning).** One function
   yields bob/single from stage+class; Grandsire/Stedman registered as overrides. Replaces
   `grandsireCalls`/`plainBobCalls`/`stedmanTriplesCalls` as the public surface (keep thin
   wrappers if needed for back-compat).
2. **Declarative calls on `MethodLibraryEntry`.** Each entry optionally carries its call
   set as data; a default is filled in by class/stage when omitted.
3. **Status quo** — per-method factories. Doesn't scale; kept as baseline.

## Consequences

- A generic path makes bulk-importing the CCCBR library practical and removes per-method
  code for the common case, while the special-case registry keeps Grandsire/Stedman honest.
- Touches ADR-0006's `CallDefinition` surface; if the generic descriptor needs new fields,
  expect a small ADR-0006 amendment.
- Sequencing: best done together with (or just before) the full-library loader, and after
  ADR-0008 so the broadened call coverage is validated against the centralised corpus.
