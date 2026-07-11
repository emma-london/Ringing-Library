# ADR-0021 — Plain Bob Doubles single is `123`, not `1234`

- **Status:** Accepted
- **Date:** 2026-07-11
- **Deciders:** Emma (project owner)
- **Related:** [ADR-0009](ADR-0009-generic-method-and-call-construction.md) (generic call construction / the `14`/`1234` default), [ADR-0006](ADR-0006-call-model-and-come-round.md) (calls replace the tail of a lead), `src/data/standard-methods.ts`, `src/change.ts` (implicit external places)

## Context

Per ADR-0009 the generic call default — and `plainBobCalls` — produce a **single of `1234`** at the lead end. That is correct for Plain Bob at Minor, Triples, Major and up, but it is **wrong at Doubles**.

On five bells the place-notation `1234` is not what it appears. `Change.parse` supplies **implicit external places** (`src/change.ts`): place 4 is made, which leaves lone place 5 above it with no bell to cross, so place 5 must also be made. `1234` therefore auto-completes to **`12345`** — *every* bell makes a place. No pair of bells crosses, so the change is the identity: the "lead-end" row is identical to the row before it. A touch calling this single can never be true (it repeats a row on the spot) and never comes round.

This is a well-known, non-intuitive convention in ringing. Singles are rarely rung in Plain Bob Doubles, but when they are, the single is **`123`** (2nds and 3rds held; 4ths and 5ths cross) — a real, odd change that flips the parity the way a single must. The bob is unaffected: `14` auto-completes to `145` on five bells (2nds and 3rds cross), which is the correct Plain Bob Doubles bob.

The defect surfaced as a live bug: `standardCalls(Plain Bob Doubles)` and `plainBobCalls(5)` both returned the degenerate single.

## Decision

**At Doubles (stage 5), the Plain Bob single is `123`.** Everything else is unchanged.

- **`plainBobCalls(stage)`** returns single `123` when `stage === Stage.DOUBLES`, and `1234` otherwise. The bob stays `14` at every stage (it reads back as `145` on five bells). The exception lives here because this is *the* Plain Bob call factory, so Doubles is intrinsically in its remit.
- **`standardCalls(method)`** gains a narrow branch, checked after the Grandsire/Stedman families and before the generic default: a method whose name starts with `plain bob` **and** is at stage 5 routes to `plainBobCalls(method.stage)` (carrying the `123` single). Every other method — including Plain Bob at other stages — is untouched and still hits the generic `14`/`1234` default exactly as ADR-0009 specifies.

**Scope: Plain Bob Doubles only, deliberately.** The `12345` degeneracy would afflict *any* Doubles method that took the `1234` default single, but the *correct* replacement is method-specific (it depends on the plain and bob lead-end shapes). So we do not make this a general Doubles rule. Other Doubles methods keep the generic default and its known limitation; correcting them is out of scope, alongside the far-method alternative calling convention ADR-0009 already deferred.

## Options Considered

**What single to use.** (A, chosen) `123`, the standard convention Emma specified and the searcher confirms yields true full extents. (B, rejected) leave `1234` — produces `12345`, a degenerate identity change; every singled Plain Bob Doubles touch is false. (C, considered, rejected) `345` — also a valid odd change on five bells, but not the convention rung; `123` is what ringers call.

**Scope of the exception.** (A, chosen) Plain Bob Doubles specifically — matches how the convention is actually described ("this only applies to Plain Bob Doubles") and avoids guessing wrong singles for other Doubles methods. (B, rejected) a general "stage-5 default single" rule — would need a single that is correct for every Doubles method, which is false; the right single is per-method. (C, rejected) detect the degeneracy structurally (any single that auto-completes to all-places) and substitute — clever but overreaching: it would silently rewrite composers' calls for methods we haven't validated, exactly the kind of automatic misclassification ADR-0009 declined.

**Where the exception lives.** (A, chosen) inside `plainBobCalls`, with `standardCalls` routing Plain Bob Doubles to it — one home for the fact, and `plainBobCalls(5)` is correct for direct callers too. (B, rejected) inline the special-case single in `standardCalls` only — would leave `plainBobCalls(5)` still returning the degenerate single for anyone calling it directly.

**Keeping Plain Bob in the generic default (ADR-0009).** ADR-0009 deliberately routed Plain Bob through the generic `14`/`1234` default rather than a named branch. This ADR adds the *narrowest* branch that corrects Doubles (name `plain bob` **and** stage 5) and leaves that design intact for every other Plain Bob stage.

## Consequences

**Becomes easier**
- Singled Plain Bob Doubles compositions work. The bounded searcher now finds true come-round touches using singles — including eight full 120-change extents, e.g. the textbook `...s...s...s` (a single at the end of each of the three plain courses), each independently re-proved true via `Touch.prove()` with 120 distinct rows.
- The corpus (ADR-0008) gains a Plain Bob Doubles singled-extent fixture, so the fact is pinned as a truth oracle, not just a unit test.

**To watch**
- **Other Doubles methods still get the degenerate `12345` single from the default.** This is a pre-existing limitation, now documented and explicitly out of scope. If a real composition needs singles on another Doubles method, that method needs its own correct single — a future successor to this ADR, not a bug in it.
- The `standardCalls` branch is name-prefix + stage keyed (`plain bob` at stage 5). A method named "Plain Bob …" at Doubles that somehow wanted different calls would need revisiting, but the domain has one Plain Bob Doubles.
- No change to `CallDefinition`, the call model (ADR-0006), or any other stage — the fix is one place-notation string at one stage.
