# ADR-0005: Composition identity and the `Proof` result type

**Status:** Accepted
**Date:** 2026-06-20
**Deciders:** Emma (project owner)
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md), [ADR-0002](./ADR-0002-description-vs-execution.md), [ADR-0003](./ADR-0003-phasing-and-roadmap.md)

## Context

ADR-0002 introduced `Composition` (immutable data) and `Prover` (verifier) but deliberately deferred two questions to its *To revisit* list:

1. Whether `Composition` should carry optional metadata (composer, music score) or whether that belongs to the corpus.
2. Whether a `Proof` *value type* (an immutable record of a proving result — true/false + false rows) is worth adding, now that `Prover` is the actor.

ADR-0003 places both the `Composition` serializable shape and the `Prover` public surface in **Phase 3**, and identifies the `Composition` shape as the one ADR-0001 hook that must be fixed *now* (it is simultaneously the job spec, the content-addressed cache key, and the Phase 4 search-result type). That makes these two questions blocking: we cannot lock the Phase 3 shape while they are open. This ADR resolves them.

## Decision

**1. `Composition` is the bare calling, and its content hash is its identity.**
`Composition` carries exactly `(method reference, start row, ordered calls, target length)` — and nothing else. No composer, title, music score, or provenance. Its content hash *is* its identity, so two values that describe the same calling are the same `Composition`.

**2. Metadata lives outside `Composition`, in the corpus, keyed by hash.**
Composer, title, music score, and any other annotation live in the `CompositionLibrary`/corpus as an annotation layer keyed by the `Composition`'s content hash — not inside the value.

**3. `Prover` returns an immutable `Proof` value type.**
`Prover` yields a `Proof` value — `{ isTrue, falseRows (with line numbers) }` (carrying enough context, e.g. stage/length, to stand alone) — rather than only exposing a `falseRows()` accessor. `falseRows` is a field of `Proof`. This makes `Proof` the serializable truth record.

## Rationale

On `Composition` identity: whether a touch is **true** depends only on the calling, never on who composed it or how musical it is. Music score in particular is **scoring-version-dependent** — it changes when the scoring tables change, while the calling does not. Baking either into the hashed value would make the *same calling* hash differently across composers or scoring versions, which breaks content-addressing, the cache key, and the "same spec runs anywhere" property from ADR-0001. This is exactly ADR-0001's instruction to *split eternal truth facts from scoring-version-tagged quality facts*, applied to the value type: `Composition` is the eternal fact; metadata is the quality annotation.

On the `Proof` value type: ADR-0001 wants truth to be **cached** — including cached negatives ("no true touch of length L satisfying Z"). A cacheable truth result has to be a serializable value, not a transient accessor on the verifier. A `Proof` value type *is* that eternal truth fact: storable, attachable to a `Composition` in the corpus, and consistent with the immutable-values-everywhere design. The cost is one small new public type, paid back immediately by giving the cache and corpus something concrete to store.

## Options Considered

**Composition metadata.** (A, chosen) bare calling + external metadata keyed by hash. (B, rejected) metadata fields inside `Composition` — conflates quality with truth and destabilises the hash/cache key, so the same calling no longer content-addresses to one value.

**Prover result.** (A, chosen) immutable `Proof` value type. (B, rejected) bare `falseRows()` accessor — not serializable, can't be cached or stored as a truth fact, and is the lone non-value result in an otherwise value-typed surface.

## Consequences

**Becomes easier**
- `Composition`'s Phase 3 shape can now be locked: exactly `(method ref, start, calls, length)`.
- The corpus gets a clean two-layer model — `Composition` (identity/truth) plus annotations (composer, music, score) keyed by hash — matching ADR-0001's caching split.
- `Proof` gives the truth cache and the corpus a concrete, serializable fact to store, and answers ADR-0002's open "is a `Proof` value type worth it?" with yes.

**To watch**
- Music scoring still needs a home; it is an annotation / quality fact in the corpus, not part of `Composition` — keep it on the annotation side. This connects to the constraint/scoring vocabulary flagged open in [ADR-0004](./ADR-0004-application-surface-and-agentic-use-cases.md).

## Resolves

- ADR-0002 *To revisit*: "Whether a `Proof` value type is worth adding" → **yes** (decision 3).
- ADR-0002 *To revisit*: "Whether `Composition` should carry optional metadata or it belongs in the corpus" → **corpus** (decisions 1–2).

## References

- [ADR-0002](./ADR-0002-description-vs-execution.md) — the two open items resolved here.
- [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) — truth-fact caching; eternal-vs-quality split; job/cache-key as content-addressed data.
- [ADR-0003](./ADR-0003-phasing-and-roadmap.md) — why these had to be resolved before Phase 3 locks the `Composition` shape.
