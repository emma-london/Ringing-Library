# ADR-0009 — Generic method & call construction (vs per-method factories)

- **Status:** Accepted
- **Date:** 2026-07-02
- **Deciders:** Emma (project owner)
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

## Decision

**`standardCalls(method: Method): CallDefinition[]`** replaces classification as the
generic path. It is a two-tier lookup, checked in order:

1. **Special-case families, matched by method-name prefix (case-insensitive), not by
   exact name.**
   - **`Grandsire*`, Doubles upwards.** Any method whose name starts with `Grandsire` —
     Doubles, Triples, Caters, Cinques, … — dispatches to `grandsireCalls(stage)` (bob
     `3.1` / single `3.123`). The correction from the first pass of this decision: this is
     **not** two named exceptions (Triples, Doubles) but one *family*, general at every
     Grandsire stage, because `3.1`/`3.123` is already stage-independent (the same
     `Change.parse` mechanism that makes `14`/`1234` stage-independent).
   - **`Stedman*`, Triples upwards.** Any method whose name starts with `Stedman` at
     stage 7 (Triples) or above — Caters, Cinques, … — dispatches to the newly
     generalized `stedmanCalls(stage)` (ADR-0007's eight compound six-end calls, with the
     plain six-end token scaled to the method's own tenor place instead of a
     Triples-only hardcoded `7`). Bob (`5`) and single (`567`) stay literal at every stage,
     same stage-independence mechanism as Grandsire and the default.
   - **`Stedman*` at stage 5 (Doubles) is excluded and throws.** Stedman Doubles is a
     **genuine structural exception**, not a smaller version of the Triples-and-up
     pattern — confirmed by Emma: "Stedman doubles: this is totally different... a bit of
     a mess." `stedmanCalls(5)` (and `standardCalls` on a stage-5 Stedman method) throws a
     clear error naming the exception, rather than silently returning something wrong.
     Left as an explicit placeholder for **Phase 5** (see Consequences) — no
     implementation attempted now.
2. **Default: bob `14` / single `1234`.** Every other method gets these two literal,
   stage-independent notation strings, parsed via `Change.parse(_, method.stage)` — the
   same mechanism already validated for Plain Bob Major/Minor/Doubles/Triples.

`MethodClassification` (Bob/Place/Surprise/Treble Bob/Delight/…) is **not** the dispatch
key. It is the Central Council's blue-line taxonomy (hunt-bell/dodging structure), not a
call-notation taxonomy, and our own data shows it can't be: Grandsire Triples is classified
`'Place'`, the same class as methods that *do* take the default calls. Classification is
left as descriptive metadata on `MethodLibraryEntry`; call derivation is name-family-based
(for the two true exceptions) with a stage-independent literal default otherwise.

### The near/far distinction — real, but doesn't gate the default

Treble-dominated single-hunt methods split by their plain lead head: **near** (`12`,
e.g. Plain Bob, Cambridge) vs **far** (`18` on Major, `16` on Minor, `10` on Royal, `1T` on
Maximus — e.g. Bristol, Double Norwich, Kent Treble Bob). This is a genuine structural
difference, confirmed against real methods in `STANDARD_METHODS` (Kent Treble Bob Minor's
lead end is `16` — far — and it already takes the default `14`/`1234` calls per its
existing comment).

For a far method the composer has a choice: use the same `14`/`1234` calls as near methods
(what "almost everyone does," per Emma), or the alternative convention of making places at
the end of the change. **`standardCalls` implements only the first option.** The
alternative far-calling convention is real but uncommon enough that supporting it now would
delay Pre-4 for negligible coverage gain — it is explicitly deferred (see Consequences).

## Options Considered

**Dispatch key.** (A, chosen) name-*family*-based registry (prefix match: `Grandsire*`
at any stage from Doubles up, `Stedman*` at any stage from Triples up, with Stedman
Doubles as an explicit excluded stage) + a stage-independent literal default
(`14`/`1234`) for everything else. An earlier pass of this ADR chose exact-name matching
(`'grandsire triples'`, `'grandsire doubles'`, `'stedman triples'`) — corrected once it
became clear the exception is a *family* (any stage), not a fixed list of named methods;
exact-name matching would have silently fallen through to the wrong default for
Grandsire Caters/Cinques or Stedman Caters/Cinques. (B, rejected) dispatch off
`MethodClassification` — disproven by Grandsire being classed `'Place'`, the same class
as ordinary methods; classification both over- and under-groups relative to call
notation. (C, rejected) structural pattern-matching on the method's actual lead-end place
notation (e.g. detect the two-hunt-bell shape programmatically) — more "automatic," but
the exception set is two named families and a principle; a small prefix-match registry is
simpler and doesn't risk misclassifying an unfamiliar method that happens to share a
lead-end shape.

**Stedman Doubles.** (A, chosen) exclude explicitly and throw, rather than let it fall
through to the Triples-and-up generalization or the `14`/`1234` default — both would be
wrong, and a thrown error is more honest than a silently incorrect result. (B, rejected)
attempt an implementation now — Emma flagged Stedman Doubles' call structure as "totally
different" and "a bit of a mess"; not worth the design cost now for one stage. Placeholder
left for **Phase 5**.

**Where call definitions live.** (A, chosen) pure factory function, nothing stored on
`MethodLibraryEntry` — keeps the data plain and the derivation logic in one place. (B,
rejected, deferred) declarative calls attached to individual entries — revisit only if a
method needs calls `standardCalls` can't produce (e.g. a far method wanting the
alternative convention).

**Far-method alternative calls.** (A, chosen) out of scope for Pre-4; `standardCalls`
always returns the near-style default for non-exception methods, near or far. (B,
rejected for now) support both conventions per method — needs a per-method or
per-composition choice of call family, which is real design work for a rare case; deferred
to a future ADR-0009 successor if/when a far-alternative composition is actually needed.

## Consequences

**Becomes easier**
- Bulk-importing the CCCBR library becomes practical: any method not matched by the
  `Grandsire*`/`Stedman*` family prefixes gets working calls for free, no per-method code
  required — and, unlike the exact-name version of this decision, this now also covers
  Grandsire/Stedman at stages the curated `STANDARD_METHODS` data doesn't even list yet
  (Caters, Cinques, …) the moment they're loaded from a fuller method library.
- The special-case families keep Grandsire/Stedman exactly as validated (ADR-0006,
  ADR-0007), generalized by stage using the same `Change.parse` stage-independence
  mechanism as the default — `standardCalls` adds coverage without touching proven
  behaviour.
- `grandsireCalls`/`plainBobCalls`/`stedmanCalls`/`stedmanTriplesCalls` stay as-is (the
  last two now stage-parameterized/back-compat-aliased), called internally by
  `standardCalls` rather than by name at each call site.

**To watch**
- **Stedman Doubles has no implementation.** `stedmanCalls(5)` and `standardCalls` on any
  stage-5 Stedman method throw rather than guess. This is placeholder-only: **tracked as
  Phase 5 work**, not pre-4 or Phase 4 scope. Anyone hitting the thrown error should read
  it as "not yet built," not a bug.
- **Far-alternative calls are not supported.** If a future composition needs the
  places-at-the-end convention for a far method (Bristol, Double Norwich, etc.), that's a
  new ADR-0009 successor, not a bug in this one — tracked as backlog, not blocking.
- The registry is name-prefix-keyed and manual. If a third true exception family turns up
  (another principle, another two-hunt-bell method), it gets added the same way
  Grandsire/Stedman were — this doesn't scale to hundreds of families, but the domain
  doesn't have hundreds; two is the expected steady state.
- Touches ADR-0006's `CallDefinition` surface only in that `standardCalls` is a new
  producer of it; the shape itself is unchanged.
- **Sequencing note:** [ADR-0013](ADR-0013-phase-4-prework-and-split.md) ordered pre-4 as
  ADR-0008 then ADR-0009. This ADR is implemented first instead, at Emma's direction —
  `standardCalls` doesn't depend on the fixture corpus existing, and its tests are added
  inline for now. When ADR-0008 lands, fold the new `standardCalls` fixtures into the
  centralised corpus rather than leaving them stranded in a separate test file.
