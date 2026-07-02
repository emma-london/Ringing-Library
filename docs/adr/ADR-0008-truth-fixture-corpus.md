# ADR-0008 — A declarative corpus of known-true/false test fixtures

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Emma (project owner)
- **Related:** [ADR-0005](ADR-0005-composition-identity-and-proof-result.md) (`Proof`), [ADR-0006](ADR-0006-call-model-and-come-round.md), [ADR-0007](ADR-0007-stedman-and-six-based-calling.md), [ADR-0009](ADR-0009-generic-method-and-call-construction.md) (`standardCalls`); `docs/example-touches.md`

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

## Decision

A single **JSON data file**, `src/tests/fixtures/known-touches.json`, holds every known
true/false **full-composition verdict** the project relies on as a test oracle. A small
loader + per-family adapter turns each entry into a `Touch` to prove; `docs/example-touches.md`
is regenerated from the same file so the narrative doc and the tests can never drift apart.

### Format & location

**External JSON file**, not a TS module. This is a deliberate departure from the project's
usual "pure TS, zero I/O" posture (see `CLAUDE.md`'s engineering norms) — accepted because
the corpus is data *about* the library, not the library itself, and a plain-data format is
what lets a future non-test consumer (a doc generator, an app "known touches" view) read it
without depending on the TypeScript toolchain. The loader (`src/tests/fixtures/load-fixtures.ts`)
does the one bit of I/O this requires, reading and `JSON.parse`-ing the file at test time;
it lives under `src/tests/`, alongside the tests it serves, not in the core.

### Schema

```jsonc
{
  "method": "Grandsire Triples",  // name into MethodLibrary(STANDARD_METHODS)
  "stage": 7,                     // redundant with the method entry, kept for human
                                   // readability and so the doc generator needs no import
  "family": "lead",               // "lead" | "stedman-six" — selects the adapter
  "calling": ".....",             // in the family's own notation
  "startRow": null,               // optional; omitted/null = rounds
  "expected": {
    "isTrue": true,
    "changeCount": 70,
    "comesToRounds": true,
    "isSnapFinish": false
  },
  "source": "docs/example-touches.md row 2",
  "notes": "Plain course"
}
```

**No explicit `calls` field.** A fixture names a method and a calling; the calls
themselves come from **`standardCalls(method)`** (ADR-0009) at execution time. This
was an open question until ADR-0009 landed — before that, a fixture would have needed to
carry or reference its own `CallDefinition[]`. Now the corpus can assume standard calls
apply and stay one field simpler. (If a fixture ever needs deliberately non-standard
calls, that's the signal to add an optional override field then — not a blocker now.)

### Per-family adapter

Two families cover everything in the corpus today:

- **`"lead"`** — one call character per lead. Adapter: resolve the method, call
  `standardCalls(method)`, build via `Composition.fromCalling(method, calling, { calls, startRow })`.
- **`"stedman-six"`** — one call character per six. Adapter: `stedmanComposition(calling, method)`
  (see below — generalized alongside this ADR so it isn't stuck at Triples-only).

Adding a third family (e.g. a future full sub-lead Stedman calling, ADR-0007's deferred
Option A) means adding one more adapter branch, not restructuring the schema.

### `stedmanTriplesComposition` generalized to `stedmanComposition`

The corpus needing Stedman fixtures at any stage from Triples up (mirroring
`stedmanCalls`, ADR-0009) means the per-six *composition builder*, not just the *calls*,
had to generalize too. `stedmanComposition(perSixCalling, method?)` accepts any Stedman
method at stage 7+; `stedmanTriplesComposition` becomes a stage-7 back-compat alias. This
was flagged as a gap when ADR-0009 landed (calls were generalized, the composition
builder wasn't) — closed here rather than left for later, since the corpus is exactly the
thing that needed it.

### Relationship to `docs/example-touches.md`

**Generated from the corpus**, by `scripts/generate-example-touches.mjs` (a plain Node
script — no TS compile needed, it only reads JSON and writes Markdown). This closes an
existing gap: the five Stedman oracles in `stedman-calls.test.ts` had **no prose entry at
all** before this ADR, only code. Regenerating folds them in automatically. The script is
run by hand when the corpus changes (`npm run docs:example-touches`), not on every build.

### Scope: composition verdicts only

The corpus holds **`{method, calling} → verdict`** facts — a full composition, proved or
disproved. It does **not** hold:

- **Method-level call-structure facts** (e.g. "`standardCalls('Grandsire Triples')`
  returns bob `3.1`"). Those are a different kind of claim — about a function's output
  shape, not a composition's truth — and stay as ordinary unit tests
  (`src/tests/standard-calls.test.ts`).
- **Aggregate/enumeration facts** (e.g. "there are 46 true bobs-only Stedman touches
  ≤84 changes," from `stedman-search.test.ts`). These describe a whole search space, not
  one composition's verdict, and don't fit the fixture schema without forcing it into a
  shape it wasn't designed for. They stay where they are.

## Options Considered

**Format.** (A, chosen) external JSON file. (B, rejected) a TS module of typed fixture
objects — keeps compile-time checking and needs no loader, but locks the corpus to the
TypeScript toolchain and doesn't serve a future non-test consumer as directly. (C,
rejected) status quo, inline per test — the thing being fixed.

**Calls field.** (A, chosen) derive via `standardCalls(method)`, no explicit field —
only possible because ADR-0009 now exists; simpler schema. (B, rejected for now) always
carry explicit calls — more self-contained, but every one of today's fixtures uses
standard calls, so it's pure overhead until a genuine non-standard-calls fixture shows up.

**`stedmanTriplesComposition` generalization.** (A, chosen) generalize now, alongside the
corpus — small work given `stedmanCalls` already solved the hard part (tenor-place
scaling), and it removes a known gap rather than deferring it again. (B, rejected)
Triples-only corpus for now — would have meant the corpus schema supports higher-stage
Stedman in principle but nothing could actually build one.

**Prose doc.** (A, chosen) generate `docs/example-touches.md` from the corpus. (B,
rejected) keep it hand-written — would have left the Stedman-oracle documentation gap
in place indefinitely, and two hand-maintained descriptions of the same facts is exactly
the duplication this ADR exists to remove.

**Scope.** (A, chosen) composition verdicts only. (B, rejected) also fold in call-structure
facts and/or aggregate enumeration facts into one corpus — would unify "truth claims we
audit" under one roof, but mixes three different shapes of claim (a composition's verdict;
a function's output; a search space's size) into one schema for the sake of a single
home, which serves tidiness more than clarity.

## Consequences

**Becomes easier**
- Truth claims are auditable in one place; adding a validated touch is a JSON entry, not
  a new test function.
- The Stedman oracles finally have a prose home (`docs/example-touches.md`), generated,
  so it can never silently drift from what the tests actually check.
- `stedmanComposition` now supports Stedman at any stage from Triples up, closing the gap
  ADR-0009 left open — future Stedman Caters/Cinques fixtures are a data addition, not a
  code change.
- Fixtures are shorter (no `calls` field) because they lean on ADR-0009's `standardCalls`.

**To watch**
- **This is the project's first runtime file I/O outside a script/test context** (the
  loader reads a JSON file at test time). It's contained to `src/tests/`, but it's a
  precedent worth remembering if a similar temptation arises inside the actual core.
- The JSON file has no compile-time type checking; the loader must validate shape at
  runtime and needs its own tests for malformed-fixture handling.
- `docs/example-touches.md` is now a build artefact of the corpus, not hand-authored —
  anyone editing it directly will have their edit silently overwritten next regeneration.
  Worth a comment at the top of the generated file saying so.
- Call-structure facts and aggregate/enumeration facts stay scattered by design (see
  Scope) — this ADR doesn't unify *all* truth claims, only composition verdicts. If that
  scatter becomes a real problem later, it's a new ADR, not a reopening of this one.
- Adding `@types/node` as a devDependency (for `fs`/`path`/`url` in the loader and the
  generation script) is a small toolchain footprint increase — still no new *runtime*
  toolchain, just type declarations for Node built-ins already available in the test/dev
  environment.
