# ADR-0014: Offline / degraded-connectivity behavior for the Executor

**Status:** Draft
**Date:** 2026-07-03
**Deciders:** Emma (project owner)
**Related:** [ADR-0001](./ADR-0001-cross-platform-compute-architecture.md) (three-layer architecture; `Local`/`Worker`/`Remote` executors), [ADR-0013](./ADR-0013-phase-4-prework-and-split.md) (Phase 4b scope), [ADR-0004](./ADR-0004-application-surface-and-agentic-use-cases.md) (Draft, application surface)

## Context

ADR-0001 designed the compute layer around an `Executor` seam with three
implementations: `Local` (synchronous, in-process), `Worker` (background
thread, still entirely on-device), and `Remote` (hand off a search too large
for the device to a server). ADR-0013 schedules building this seam into
**Phase 4b**.

A 2026-07-03 conversation about running future apps on basic phones with no
internet access confirmed the core library itself makes zero network calls —
but identified `Remote` as the one `Executor` variant that inherently needs
connectivity. If a future app is configured to use `Remote` (or falls back to
it for a large search) and the device has no connection, what happens today
is undefined. Emma's direction: **fail gracefully** — offline apps are an
explicit goal, not an edge case to shrug off.

This is recorded now, ahead of Phase 4b actually starting, so the requirement
isn't discovered late or designed under time pressure once the `Executor` is
mid-implementation.

## Decision

Not yet made in full — this ADR frames the requirement and open questions for
Phase 4b to resolve when the `Executor` seam is actually built. The one thing
settled now: **`Remote` failing (no connectivity, or connectivity lost
mid-search) must degrade to an on-device path (`Worker` or `Local`), not
simply fail the operation.** Whatever the mechanism, "no internet" should
never be a hard stop for something the device is capable of computing itself
— it's the same reasoning that puts a hard length ceiling on the bounded
searcher (ADR-0011) rather than letting it run unbounded: bound the failure
mode instead of leaving it undefined.

## Open questions (Draft — to resolve during Phase 4b)

- **Detection.** Proactive (`navigator.onLine`, a preflight ping) vs reactive
  (attempt `Remote`, catch the failure)? Proactive is cheap but has known
  false positives/negatives (captive portals, DNS-only outages); reactive is
  more honest about actual reachability but costs a failed round-trip before
  falling back.
- **Fallback target.** `Worker` (background, still on-device) if available,
  else `Local`? Needs deciding against the actual budget/chunking model 4b
  builds — a `Remote`-sized job might be too large for `Local` to run
  synchronously without violating the budget contract.
- **Resumability.** If a `Remote` search was mid-flight (the "resumable chunk
  protocol" ADR-0013 already scopes for 4b) when connectivity dropped, does
  it resume from the last completed chunk on-device, or restart? This should
  reuse whatever resumability mechanism 4b builds for `Remote` itself, not
  invent a second one.
- **User visibility.** Silent fallback (the app just gets slower, no notice)
  vs a surfaced signal (e.g. "running locally — no server available")? This
  is as much an application-surface decision as an engine one — touches
  ADR-0004.
- **Where the decision boundary lives.** Does the core `Executor` own the
  fallback policy itself, or does it surface a typed error/event and let the
  calling app decide? The latter keeps the core policy-free (consistent with
  ADR-0001's layering — the core computes, the app decides UX), but means
  every app built on the library has to implement the same fallback logic
  unless a default is also provided.
  - *Precedent (2026-07-11, [ADR-0022](./ADR-0022-dynamic-method-library-loader.md)):* the analogous "who owns the fallback" question was settled for the **method-data** side the same way — the `cccbr-methods` loader **provides the mechanism** (it surfaces a typed failure rather than swallowing it) and the **app owns the policy** (degrade to the bundled `STANDARD_SET`, decide what to tell the user). Not binding on the `Executor` (a different surface — search execution, not data loading), but a data point for leaning this seam the same way when 4b resolves it.

## Consequences

- Keeps "fail gracefully offline" visible and specified *before* Phase 4b's
  implementation starts, rather than being discovered the first time someone
  actually loses connectivity mid-search.
- Slightly widens 4b's scope: the `Executor` seam needs a defined fallback
  contract between `Remote` and the on-device executors, not just three
  independently correct implementations.
- If the answer to "where does the decision boundary live" leans toward a
  core-owned default fallback, that's new public surface on `Executor` and
  should get its own `Options Considered` treatment when 4b starts — this
  ADR is deliberately not settling that now.
