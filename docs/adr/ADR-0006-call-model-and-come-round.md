# ADR-0006: The call model, calling notation, and come-round detection

**Status:** Accepted
**Date:** 2026-06-23
**Deciders:** Emma (project owner)
**Related:** [ADR-0002](./ADR-0002-description-vs-execution.md), [ADR-0003](./ADR-0003-phasing-and-roadmap.md), [ADR-0005](./ADR-0005-composition-identity-and-proof-result.md)

## Context

ADR-0002 and ADR-0005 fixed the *shape* of `Composition` — `(method ref, start row, ordered calls, target length)` — and the `Prover`/`Proof` contract. They did not pin down three things Phase 3 cannot build without:

1. **How a call alters a lead.** A `CallDefinition` carries replacement changes, but the rule for *where* those changes land was unspecified.
2. **How a calling is written.** Phase 3 is defined by its tests, seeded from real worked examples (`docs/example-touches.md`). Those examples are written in a compact per-lead notation that the library must parse.
3. **How a touch ends (come-round), including snap finishes.** Grandsire's treble leads for two blows, so a touch can come round one change *before* the lead-end. ADR-0003 and `context.md` both call snap finishes out as a correctness requirement: "the `Proof`/search API must treat a snap as a legal come-round." `docs/example-touches.md` includes SPSPSBP (`s.s.s-.`, 97 changes) specifically to exercise this.

These are public-surface and correctness decisions, so they get a record.

## Decision

### 1. A call substitutes the tail of a lead

A `CallDefinition` is `{ name, symbol, changes, position? }`. Its `changes` replace the **last `changes.length` changes** of the plain lead. `position` (default 0) shifts the substitution's end earlier: the replacement's final change aligns at index `leadLength − 1 − position`. Every standard call uses `position = 0`.

Concretely, with **standard CompLib transpositions** (confirmed with Emma):

| Method | Plain lead-end | Bob (`-`) | Single (`s`) |
|---|---|---|---|
| Grandsire Triples | `…7.1` | `…3.1` (last 2 changes) | `…3.123` (last 2 changes) |
| Plain Bob Major | `…12` | `…14` (last 1 change) | `…1234` (last 1 change) |

This is why the model replaces a *run* of changes rather than a single one: Grandsire's call spans the final two changes, Plain Bob's a single change.

### 2. Calling notation: one character per lead

A calling string is read left to right, one character per lead. `.` is a plain lead; every other character is matched to a defined call by `symbol`, **case-insensitively** (so `S` ≡ `s`). The number of characters is the number of leads. `Composition.fromCalling(method, str, { calls })` is the parser.

Examples (from `docs/example-touches.md`): `.....` = plain course; `-s--s-` = BSBBSB; `s.s.s-.` = SPSPSBP; `-.....--.....-` = Plain Bob Major WHWH.

### 3. Come-round is checked at every row; a finish must fall in the last lead

`Touch` expands the composition and detects come-round by testing **every** row against the start row — not only lead-ends. This makes snap finishes fall out for free: Grandsire rounds at row 13 of a lead is detected like any other return.

A return to the start row only counts as the **finish** if it occurs within the **last specified lead** (change index > `(length−1) × leadLength`). An earlier return is *premature*: the calling has come round before its stated length, which means ringing the full length repeats rows — caught as falseness by the `Prover`. Truth itself (per ADR-0005, `Proof` = `isTrue` + `falseRows`) stays purely about row repetition; come-round is a `Touch` property (`comesToRounds()`, `isSnapFinish()`), not part of `Proof`.

When proving, the come-round repeat of the start row is excluded from the proven rows, so a true touch's start row is counted exactly once. A true touch of *c* changes therefore proves *c* distinct rows (e.g. plain course of Grandsire Triples = 70).

## Options Considered

**Call placement.** (A, chosen) replace the tail run of `changes.length` changes, with an optional `position` offset. (B, rejected) a single lead-end change only — cannot express Grandsire's two-change bob. (C, rejected) full per-lead place-notation override — correct but verbose, and loses the "a call is a small substitution" intuition that the corpus and search will want.

**Calling notation.** (A, chosen) one char per lead, `.` = plain, symbol-matched calls. Matches `docs/example-touches.md` exactly and how ringers write callings. (B, rejected) explicit `(lead, call)` list only — kept as the underlying data (`CallingEntry[]`), but too noisy as the authoring form. (C, rejected) lead-relative shorthand (W/H/etc.) — method-and-position-specific; deferred to a later authoring layer.

**Come-round / snaps.** (A, chosen) check every row; finish must be in the last lead; premature return ⇒ false via the `Prover`. (B, rejected) check only lead-ends — silently misses snap finishes, violating the ADR-0003 correctness requirement. (C, rejected) an explicit "snap finish" flag on `Composition` — redundant once every row is checked, and it would pollute the content hash with something derivable.

## Consequences

**Becomes easier**
- The six `docs/example-touches.md` cases are expressible and all verify to their stated verdicts and lengths (70 / 84 / 97 / 224), snap included.
- Snap finishes need no special case in `Composition`; they are an emergent property of per-row come-round detection.
- Standard calls for new methods are one small factory each (`grandsireCalls`, `plainBobCalls`).

**To watch**
- `maxOccurs > 1` (multi-extent) interacts with come-round: the start row may legitimately recur mid-touch. The current rule (a finish must be in the last lead) is safe for Phase 3's single-extent cases; multi-extent come-round semantics are deferred.
- Lead-relative call notation (W/H/M and named positions) is a future authoring convenience on top of the per-lead form, not a change to it.
- `position` is implemented but unexercised by standard calls; keep a test if a real `position > 0` call is added.

## Note — Cambridge Surprise Major notation corrected

While testing truth against real methods, the place notation carried in the Phase 2 tests for "Cambridge Surprise Major" (`&-36-14-1256-36-14-58-16-78,12`) was found to be **wrong**: it produces lead head `18345627` and a 3-lead course, i.e. not Cambridge. The correct notation `&-38-14-1258-36-14-58-16-78,12` (lead head `15738264`, true 7-lead / 224-change plain course) was substituted everywhere (`src/data`, `method.test.ts`, `place-notation.test.ts`, `playground-phase2.ts`, the `place-notation.ts` doc comment). This is a bug fix, not a design decision, recorded here only so the change is traceable.
