# ADR-0004: Application surface and agentic use cases

**Status:** Draft — open exploration, no decision yet
**Date:** 2026-06-20
**Deciders:** Emma (project owner)
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md), [ADR-0002](./ADR-0002-description-vs-execution.md), [ADR-0003](./ADR-0003-phasing-and-roadmap.md)

> **This is a Draft.** It records a line of thinking to be developed, not a decision. It exists so the threads below survive between sessions and so the eventual decisions inherit a written rationale. Nothing here constrains Phase 3.

## Context

ADR-0001 gives us an architecture that *scales* — one engine from phone to server, jobs as serializable data, verify-on-client. What it deliberately did not address is the **application surface**: what the actual apps are, who uses them, and how a user's intent reaches the engine. The library is the substrate; the apps are the product, and they are varied enough that one UI model will not cover them.

Two threads are open and worth developing before the app phase.

### Thread 1 — the variety of platforms and apps

The same core serves several quite different products, and they impose different constraints: a mobile practice companion ("30 seconds of nice Grandsire") is offline-first and battery-bound; a desktop composing tool is throughput- and screen-bound; a tower/handbell tool, a teaching aid, and a web library browser each want different slices. The architecture is built to scale across these, but the **product shapes** — what each app *is*, what it shows, what it lets a user do — are unexamined. Worth mapping the use cases to app surfaces explicitly, and asking which slice of the core each one needs.

### Thread 2 — deterministic vs. agentic intent (the interesting one)

User requests fall on a spectrum between two poles, and the gap between them is where the product gets interesting:

- **Deterministic / cached.** *"Give me an 8-lead touch of Grandsire."* Fully specified, bounded, repeatable. The right answer is a lookup or a short bounded search; the same request should hit the cached composition corpus (ADR-0001) and return instantly. No conversation needed — the request **is** a `Composition` query.

- **Conversational / agentic.** *"I want a peal of Stedman Triples that doesn't use a single."* This is a goal with constraints, not a query. It needs interpreting ("peal" → length band; "no single" → a call-set restriction; "Stedman Triples" → method + stage), it may be infeasible, it may want negotiation ("there's no such true peal, but here's the closest / here's one with two singles"), and it benefits from an agent that can translate intent into a constraint spec, run the search under a budget, read the result, and converse about it.

The key observation: **both poles bottom out in the same machinery.** The agentic case is the deterministic case plus an interpretation-and-negotiation layer on top. The constraint spec the agent produces is exactly the declarative constraint data ADR-0001 already requires the engine to consume ("constraints are declarative data, not JS callbacks"). So the agent is a *front end that emits job specs and reads results* — it does not need its own search path, and it sits naturally on the same `Composition`/budget/verify substrate.

This matters for the architecture in a reassuring way: the agentic surface is largely **already designed for**, because a job is location-independent serializable data and constraints are already data. The open work is the interpretation layer (natural-language goal → constraint spec), the negotiation UX (infeasible / near-miss handling), and where the agent runs.

## Open questions (to develop, not yet answered)

- **App map.** What is the concrete set of apps, and what slice of the core does each need? Which are offline-first?
- **Intent routing.** How does a request get classified along the deterministic↔agentic spectrum, and routed to "cache lookup" vs "interpret-then-search"? Is that the admission controller's job (ADR-0001), a separate layer, or the agent's?
- **Constraint vocabulary.** What is the declarative constraint language an agent emits and the engine consumes? (e.g. method, stage, length band, required/forbidden calls, music targets, part structure.) This is the contract between the agentic front end and the engine — likely the highest-leverage thing to specify.
- **Negotiation model.** When a goal is infeasible or expensive, what does the system offer — nearest feasible, relaxed constraints, partial results, a cost estimate? How much of this is the admission controller's feasibility estimate (the reachability DP) surfaced to the user?
- **Where the agent runs**, and how it respects the verify-on-client invariant (the agent proposes; the core still re-proves every result before it is shown).
- **Caching for natural-language requests.** Deterministic requests cache cleanly on the `Composition` key; do interpreted requests cache on the *resolved* constraint spec? (Probably yes — the interpretation resolves to a spec, and the spec is the key.)

## Notes toward a future decision

- The agentic layer should almost certainly be **additive**: it emits `Composition` / constraint-spec values and consumes results, sharing the exact substrate the deterministic path uses. No separate engine, no separate truth.
- The verify-on-client invariant (ADR-0001) is what makes an agent safe here: the agent is an untrusted suggestion source like any other executor, and the core arbitrates truth.
- This is an **app-phase concern**, downstream of Phase 3/4. Capturing it now is about preserving the framing and protecting the constraint-spec contract so the core and engine don't foreclose it.

## Status / next

Remains `Draft` until the app map and the constraint vocabulary are worked through. Promote to `Proposed` once there is a concrete decision to make (likely: "the constraint spec is *X*, and the agentic layer is structured as *Y*"). Until then this is a thinking record, deliberately not constraining Phase 3.

## References

- [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) — jobs as data, constraints as declarative data, verify-on-client, admission controller, composition corpus.
- [ADR-0003](./ADR-0003-phasing-and-roadmap.md) — phasing; this is an app-phase concern downstream of the core and engine.
