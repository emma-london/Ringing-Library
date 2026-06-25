# Architecture Decision Records

This directory holds the project's Architecture Decision Records (ADRs). Recording significant decisions here is the **default for the whole project** — see `../../CLAUDE.md`.

## What gets an ADR

Anything that shapes the public surface, the architecture, the phasing, the toolchain, or a trade-off a future contributor would otherwise have to reverse-engineer. When in doubt, write one — they are cheap and the rationale is the point.

Decisions still being worked out also get an ADR, in `Draft` status, framing the open questions so the thinking survives between sessions.

## Format

Each ADR is one Markdown file, numbered and titled: `ADR-NNNN-short-kebab-title.md`. Use the next free number; never reuse one.

A record carries, at minimum:

- **Header** — `Status`, `Date`, `Deciders`, and `Related` (links to other ADRs).
- **Context** — the forces in tension and what prompted the decision.
- **Decision** — what was chosen, stated plainly.
- **Options Considered** — the alternatives, with why each was or wasn't chosen. This is the part that prevents relitigation; do not skip it.
- **Consequences** — what becomes easier, what becomes harder, what to revisit.

`Status` moves `Draft` → `Proposed` → `Accepted`, or `Superseded by ADR-NNNN`. Never delete or silently rewrite a superseded ADR — mark it, link forward, and keep the history.

## Index

- **ADR-0001** — *(Accepted)* Cross-platform compute architecture (TS core + WASM engine). The three-layer architecture and the verify-on-client invariant. *Now*-list sequencing revised by ADR-0003.
- **ADR-0002** — *(Accepted)* Separating description from execution. `Composition` (data) / `Touch` (view) / `Prover` (verifier); `SearchTruth` kept engine-internal. Open items resolved by ADR-0005.
- **ADR-0003** — *(Accepted)* Phasing and roadmap. Phase 3 = truth-first pure-TS core; searcher and execution plumbing deferred to Phase 4.
- **ADR-0004** — *(Draft)* Application surface and agentic use cases. The deterministic/cached vs conversational/agentic split.
- **ADR-0005** — *(Accepted)* Composition identity and the `Proof` result type. `Composition` is the bare calling (hash = identity, no metadata); `Prover` returns an immutable `Proof` value.
- **ADR-0006** — *(Accepted)* The call model, calling notation, and come-round detection. Calls replace the tail of a lead; callings are one char per lead; come-round is checked at every row (snap finishes fall out for free) and must land in the last lead. Phase 3 implementation decisions.
