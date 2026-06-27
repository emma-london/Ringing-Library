# ADR-0007 — Stedman, principles, and six-based calling

- **Status:** Accepted
- **Date:** 2026-06-25 (accepted 2026-06-27)
- **Deciders:** Project
- **Related:** [ADR-0006](ADR-0006-call-model-and-come-round.md) (call model — one call per lead, tail substitution); [ADR-0002](ADR-0002-description-vs-execution.md) / [ADR-0005](ADR-0005-composition-identity-and-proof-result.md) (`Composition` identity)

## Context

Stedman Triples was added to `MethodLibrary` (via `src/data/standard-methods.ts`) as a
deliberate structural stress-test of the Phase 3 core: an odd stage (7 bells, so cross
changes are impossible — every change makes at least one place), and a **principle** —
no fixed hunt bell, every bell does the same work, and the method is built from
alternating slow/quick **sixes** (6 changes each) rather than one repeating lead.

To fit the lead-based `Method` shape, Stedman is modelled as one repeating **double-six**
(slow + quick = 12 changes), notation `3.1.7.3.1.3,1`, lead head `6347251`, plain course
= 7 leads / 84 changes. Expansion (`Touch`) and proof (`Prover`) of the plain course are
**fully correct** — verified against complib and the existing `stedman.test.ts`.

The open question was **calling**. ADR-0006 fixes the call model as *one call per lead, the
call replacing the tail of that lead*. Stedman's bobs and singles are made at **six-ends**
— every 6 changes — so in a 12-change double-six lead there are *two* six-ends and only
the second coincides with the lead boundary.

**Where the six-ends are (corrected).** The double-six block starts from rounds *in the
middle of a six*, so the block boundaries (rows 0 and 12) are **not** true six-ends. Within
the first lead the six-ends fall at the rows after changes **2 and 8** (`2314567` and
`3426175`) — i.e. immediately before the `7` place-changes, which sit at the *start* of
each six (changes 3 and 9). A call substitutes the `7` that begins its six.

## Decision

Adopt **Option B for Phase 3**: keep the double-six lead and encode each of the nine
possible (first-six, second-six) callings of a double-six as a call, i.e. the **eight
non-plain compound calls** `PB PS BP BB BS SP SB SS` (`PP` = plain = no call). This stays
entirely inside ADR-0006 (one call per lead) — a compound call is just a whole-lead tail
substitution — so `Composition` identity, hashing and the `Prover` are untouched.

Call notation at a six-end (verified against the standard form): the plain back-work is
`7`; a **bob** makes 5ths (`5`); a **single** makes 5-6-7ths (`567`). In the double-six
`3.1.7.3.1.3.1.3.7.1.3.1` the two substitutable `7`s are at change-indices **2 and 8**.

Implementation (`src/data/standard-methods.ts`):
- `stedmanTriplesCalls()` — the eight compound `CallDefinition`s.
- `stedmanTriplesComposition(perSixCalling)` — builds a `Composition` from the **natural
  per-six** string ringers use (one char per six: `.`/`p` plain, `-`/`b` bob, `s` single),
  folding sixes into double-six leads and mapping each pair onto a compound call. This keeps
  the human-facing notation per-six while the stored model stays one-call-per-lead.

**Truth oracles** (published, `wiki.changeringing.co.uk/Conducting_Stedman`), all reproduced
by the implementation and pinned in `src/tests/stedman-calls.test.ts`:
- Bobs at S,L,Q = sixes 3,4,7,8,12,13 → **true, comes round in 84** (one course).
- A single at an unaffected six, repeated → **true 168**.
- A bob calling oneself unaffected three times → **true 252**.
- Negative control: SLQ rung twice (already round at 84) is correctly proved **false**.

Option A (full sub-lead calls) remains the documented general direction for a later phase
(see Options 3 below); if pursued it will likely supersede ADR-0006's "one call per lead"
clause. It is **not** required for Stedman now.

## Options Considered

1. **Double-six principle, plain only.** Reuses everything unchanged but ships no Stedman
   *touches*. Superseded by the decision above now that calls are correctly encoded.
2. **Model the method as a single six (6-change lead).** Rejected: a `Method` holds one
   fixed change sequence per lead, but slow and quick sixes differ, so a single `Method`
   cannot alternate them.
3. **Generalise the calling model to address sub-lead positions (Option A).** The
   domain-faithful, reusable answer (each six-end called independently; covers rare
   sub-lead calls in other methods too). Deferred: it changes the calling contract and
   `key()`/`hash()` canonicalisation — a genuine public-surface change that deserves its
   own scheduled work and a successor to ADR-0006, not a Phase 3 bolt-on.
4. **Eight compound double-six calls (Option B — chosen).** Stays inside ADR-0006; purely
   additive call *data*; correct and fully testable now. Cost: the encoding is
   Stedman-specific and one stored symbol covers two six decisions — mitigated by
   `stedmanTriplesComposition` accepting the natural per-six string at the boundary.
5. **Bespoke per-method calling *type*.** Rejected: method-specific calling machinery
   undermines the uniform `Composition` identity (ADR-0005). Option B needs no new type —
   only new `CallDefinition` data — so it avoids this.

## Consequences

- **Easier now:** Stedman Triples can be composed and proved with real bobs and singles via
  the per-six notation; the core (`PlaceNotation` / `Method` / `Touch` / `Prover`) is
  exercised on a principle, an odd stage, and called touches — a strong breadth test. The
  test-bench app exposes a per-six calling box for Stedman.
- **Constraints to remember:** the stored calling is one compound symbol per *double-six*,
  so a touch whose come-round falls on the first six of a lead is expressed with the final
  half-lead's second six left plain (`Touch` still detects the come-round at every row). The
  app relabels a non-lead-boundary finish as a *six-end finish* rather than a snap.
- **Open / future (Option A):** first-class sub-lead calling remains the general solution
  for Stedman and other six-/block-called methods; schedule it as its own ADR superseding
  ADR-0006's one-call-per-lead clause when the calling surface is next revisited.
