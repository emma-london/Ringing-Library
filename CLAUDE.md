# Ringing Library — working conventions

Project context lives in `context.md` (domain concepts, current phase, prototype findings). Read it first.

## Decision records are the default (read this)

**Every significant decision on this project is recorded as an ADR before it is acted on.** This is the standing default for the whole project, not a per-task choice. A decision is "significant" if it shapes the public surface, the architecture, the phasing, the toolchain, or anything a future contributor would otherwise have to reverse-engineer from the code.

When a decision like that is made — in conversation, in review, or while implementing — capture it:

- **Record the *why*, not just the *what*.** The options considered, the forces in tension, and the reason the losing options lost are the valuable part. A decision without its rationale is a decision that gets relitigated.
- **Record the final decision explicitly**, with status (`Draft` / `Proposed` / `Accepted` / `Superseded`) and date.
- **Capture open threads too.** A decision still being thought through is recorded as a `Draft` ADR that frames the open questions, so the thinking isn't lost between sessions.
- **Supersede, don't silently rewrite.** When a later decision overrides an earlier one, mark the old ADR `Superseded by ADR-NNNN` and link forward; keep the history.

ADRs live in `docs/adr/` — see `docs/adr/README.md` for the format and numbering. The default expectation: if we decided something and the reasoning mattered, there is an ADR for it.

## Keep context.md current

Update `context.md` at the end of each phase (and when the roadmap changes) without being asked — domain table, current state, and roadmap. It is the single load-first orientation document.

## Engineering norms

- TypeScript core is pure, immutable, zero I/O — identical on every platform (ADR-0001).
- Correctness (truth/validity) must be identical everywhere; output (which valid touch) may vary by budget. Never trade away the first for the second.
- Tests carry the weight on truth: positive **and** negative cases, stress-tested. Truth correctness outranks performance everywhere in this codebase.
