import { Stage, bellToChar } from '../bell.js';
import { Change } from '../change.js';
import { Composition, type CallDefinition, type CallingEntry } from '../composition.js';
import { Method } from '../method.js';
import { type MethodLibraryEntry } from '../method-library.js';

/**
 * A curated set of real methods, with place notations verified against the
 * Central Council method library and published blue lines. This is deliberately
 * a small, correct subset — the **truth corpus** the tests and engine use as an
 * independently hand-verified oracle (imported directly from this module).
 *
 * It is an **internal fixture**, not the set an application should use. The
 * public root re-export of the same name is **deprecated** (ADR-0020) in favour
 * of the bundled standard set (`STANDARD_SET`, `src/data/standard-set.ts` →
 * `ringing-lib-ts/data/standard-set`); this array stays here, un-deprecated, so
 * internal callers use it without tripping the runtime warning.
 */
export const STANDARD_METHODS: MethodLibraryEntry[] = [
  // Grandsire Triples — plain lead written out explicitly (14 changes).
  // Lead head 1253746; plain course = 5 leads / 70 rows (see context.md).
  {
    name: 'Grandsire Triples',
    stage: 7,
    notation: '3.1.7.1.7.1.7.1.7.1.7.1.7.1',
    classification: 'Place', // approximate; Grandsire predates the modern scheme
    leadHead: '1253746',
  },
  // Grandsire Doubles — the 5-bell Grandsire (lie behind is `5`). Lead 10 changes,
  // plain course 3 leads / 30 changes, lead head 12534. Verified against complib
  // (method/10587). Calls are the stage-independent Grandsire bob `3.1` / single `3.123`.
  {
    name: 'Grandsire Doubles',
    stage: 5,
    notation: '3.1.5.1.5.1.5.1.5.1',
    classification: 'Place', // as for Grandsire Triples — predates the modern scheme
    leadHead: '12534',
  },
  {
    name: 'Plain Bob Major',
    stage: 8,
    notation: '&-18-18-18-18,12',
    classification: 'Bob',
    leadHead: '13527486',
  },
  {
    name: 'Plain Bob Minor',
    stage: 6,
    notation: '&-16-16-16,12',
    classification: 'Bob',
  },
  {
    name: 'Plain Bob Doubles',
    stage: 5,
    notation: '&5.1.5.1.5,125',
    classification: 'Bob',
  },
  // Plain Bob Triples — lead 14 changes, plain course 6 leads / 84 changes, lead
  // head 1352746. Verified against complib (method/12399). Calls: bob `14` / single
  // `1234` (plainBobCalls), with the tenor `7` implied externally on stage 7.
  {
    name: 'Plain Bob Triples',
    stage: 7,
    notation: '&7.1.7.1.7.1.7,127',
    classification: 'Bob',
    leadHead: '1352746',
  },
  {
    name: 'Cambridge Surprise Major',
    stage: 8,
    notation: '&-38-14-1258-36-14-58-16-78,12',
    classification: 'Surprise',
    leadHead: '15738264',
  },
  // Kent Treble Bob Minor — the classic treble-dodging minor method (the "Kent
  // places" 34/34 give the slow-bell work). Lead 24 changes, plain course 5 leads
  // / 120 changes, lead head 142635. Verified against complib (method/26082). A
  // sixth-place method; lead-end calls are bob `14` / single `1234` (plainBobCalls).
  {
    name: 'Kent Treble Bob Minor',
    stage: 6,
    notation: '&34-34.16-12-16-12-16,16',
    classification: 'Treble Bob',
    leadHead: '142635',
  },
  // Stedman Triples — a *principle* (every bell does the same work; no fixed
  // hunt bell), built from alternating slow/quick "sixes". It is modelled here
  // as one repeating double-six (slow + quick = 12 changes) so it fits the
  // lead-based `Method` shape: lead head 6347251, plain course = 7 leads / 84
  // changes. Notation uses the comma palindrome convention without '&':
  //   3.1.7.3.1.3,1  →  3.1.7.3.1.3.1.3.7.1.3.1  (verified against complib).
  // NB: Stedman's calls are made at *six*-ends (every 6 changes), which the
  // current one-call-per-lead model (ADR-0006) cannot fully express — see
  // ADR-0007. Plain ringing and proving work correctly.
  {
    name: 'Stedman Triples',
    stage: 7,
    notation: '3.1.7.3.1.3,1',
    classification: 'Principle',
    leadHead: '6347251',
  },
];

/**
 * Standard CompLib calls for Grandsire (bob `3.1`, single `3.123` at the lead
 * end — see context.md and ADR-0006). The replacement occupies the final two
 * changes of the lead.
 */
export function grandsireCalls(stage: Stage = 7): CallDefinition[] {
  return [
    {
      name: 'Bob',
      symbol: '-',
      changes: [Change.parse('3', stage), Change.parse('1', stage)],
    },
    {
      name: 'Single',
      symbol: 's',
      changes: [Change.parse('3', stage), Change.parse('123', stage)],
    },
  ];
}

/**
 * Standard CompLib calls for Plain Bob (bob `14`, single `1234` at the lead
 * end). The replacement occupies the final change of the lead.
 */
export function plainBobCalls(stage: Stage = 8): CallDefinition[] {
  return [
    { name: 'Bob', symbol: '-', changes: [Change.parse('14', stage)] },
    { name: 'Single', symbol: 's', changes: [Change.parse('1234', stage)] },
  ];
}

// ---------------------------------------------------------------------------
// Stedman calls, Triples and upwards (ADR-0007 Option B, generalized by ADR-0009)
// ---------------------------------------------------------------------------

/**
 * Stedman is a *principle* built from alternating sixes, and its calls are made
 * at **six-ends** — every 6 changes. The library models Stedman as a repeating
 * 12-change *double-six* lead (see `STANDARD_METHODS`), so a lead spans two
 * six-ends. ADR-0006 allows only one call per lead, so per ADR-0007 each of the
 * nine possible (first-six, second-six) callings of a double-six is encoded as a
 * single compound call: the eight non-plain combinations of {Plain, Bob, Single}.
 *
 * At a six-end the plain back-work change is the **tenor place** (the bell lies
 * behind — `7` on Triples, `9` on Caters, `e`/`E` on Cinques, …); a **bob** makes
 * 5ths (`5`) and a **single** makes 5ths-6ths-7ths (`567`) — each a single change
 * substituted for the tenor-place token that *begins* its six. In the double-six
 * lead those two tenor-place tokens are at change-indices 2 (first six-end) and 8
 * (second six-end). This generalizes cleanly from Triples upwards (Caters,
 * Cinques, …): the front-three "point and cross" work that makes Stedman what it
 * is never changes; only the tenor-place token and the stage passed to
 * `Change.parse` scale with the extra pairs of bells dodging behind. Verified for
 * Triples against published touches: bobs at sixes 3,4,7,8,12,13 (SLQ) come round
 * true in 84; a single at an unaffected six, repeated, comes round true in 168.
 *
 * **Stedman Doubles (stage 5) is excluded — not a smaller version of this
 * pattern.** With only two working bells behind the front three there is no room
 * for the same six-end bob/single shape; Doubles' calls are a genuine structural
 * exception. Deferred to a future phase (see ADR-0009) — call `stedmanCalls(5)`
 * and it throws rather than returning something silently wrong.
 *
 * Symbols are the two-letter pair, e.g. `BB`, `SP`, `PB` (case-insensitive). The
 * plain double-six (`PP`) is the absence of a call.
 */
export function stedmanCalls(stage: Stage = Stage.TRIPLES): CallDefinition[] {
  if (stage === Stage.DOUBLES) {
    throw new Error(
      'Stedman Doubles (stage 5) calls are not implemented — its six-end call ' +
        'structure is a genuine exception to the Triples-and-upwards pattern, not ' +
        'just a smaller version of it. Deferred to a future phase (see ADR-0009).',
    );
  }
  if (stage % 2 === 0 || stage < Stage.TRIPLES) {
    throw new Error(
      `stedmanCalls is defined for odd stages Triples (7) and upwards; got stage ${stage}`,
    );
  }

  const tenor = bellToChar(stage - 1); // the tenor lies behind at every plain six-end
  const sixEndChange: Record<string, string> = { P: tenor, B: '5', S: '567' };
  const plain = ['3', '1', tenor, '3', '1', '3', '1', '3', tenor, '1', '3', '1'];
  const longName: Record<string, string> = { P: 'Plain', B: 'Bob', S: 'Single' };
  const pairs = ['PB', 'PS', 'BP', 'BB', 'BS', 'SP', 'SB', 'SS'];
  return pairs.map((sym) => {
    const a = sym[0]!; // first six-end (change index 2)
    const b = sym[1]!; // second six-end (change index 8)
    const tokens = [...plain];
    tokens[2] = sixEndChange[a]!;
    tokens[8] = sixEndChange[b]!;
    return {
      name: `${longName[a]}/${longName[b]} six`,
      symbol: sym,
      changes: tokens.map((t) => Change.parse(t, stage)),
    };
  });
}

/** Back-compat alias: `stedmanCalls` at stage 7 (Triples) specifically. */
export function stedmanTriplesCalls(): CallDefinition[] {
  return stedmanCalls(Stage.TRIPLES);
}

/** The default Stedman method for a given stage (Triples upwards), built the same way STANDARD_METHODS' entry is. */
function defaultStedmanMethod(stage: Stage): Method {
  const tenor = bellToChar(stage - 1);
  return Method.fromPlaceNotation(`3.1.${tenor}.3.1.3,1`, stage, `Stedman ${stage === Stage.TRIPLES ? 'Triples' : stage}`);
}

/**
 * Build a Stedman `Composition` (Triples upwards, ADR-0009) from a **per-six**
 * calling string — the natural notation ringers use, one character per six read
 * left to right: `.`/`p` plain, `-`/`b` bob, `s` single (case-insensitive). The
 * number of characters is the number of sixes; they are folded into double-six
 * leads and mapped onto the eight compound calls of `stedmanCalls(method.stage)`.
 *
 * `method` defaults to Stedman Triples (stage 7) if omitted; pass a higher-stage
 * Stedman method (Caters, Cinques, …) to build at that stage — the compound calls
 * scale their tenor-place token automatically (see `stedmanCalls`). Stage 5
 * (Doubles) is not supported here either, for the same reason `stedmanCalls`
 * excludes it.
 *
 * An odd number of sixes is allowed (a touch may come round on the first six of a
 * lead); the final half-lead's second six is left plain and the touch comes round
 * at its true six-end (checked at every row by `Touch`).
 *
 * @example
 *   // SLQ — bobs at sixes 3,4,7,8,12,13 → true 84
 *   stedmanComposition('..bb..bb...bb.');
 */
export function stedmanComposition(perSixCalling: string, method?: Method): Composition {
  const m = method ?? defaultStedmanMethod(Stage.TRIPLES);
  const calls = stedmanCalls(m.stage);
  const code = (ch: string): 'P' | 'B' | 'S' => {
    const c = ch.toLowerCase();
    if (c === '.' || c === 'p') return 'P';
    if (c === '-' || c === 'b') return 'B';
    if (c === 's') return 'S';
    throw new Error(`Unrecognised six call '${ch}' (use . / - / s)`);
  };
  const sixes = [...perSixCalling.trim()].map(code);
  const length = Math.ceil(sixes.length / 2);
  const calling: CallingEntry[] = [];
  for (let lead = 0; lead < length; lead++) {
    const a = sixes[2 * lead] ?? 'P';      // first six of this double-six
    const b = sixes[2 * lead + 1] ?? 'P';  // second six (may be absent)
    if (a === 'P' && b === 'P') continue;  // plain lead
    calling.push({ lead, call: `${a}${b}` });
  }
  return new Composition({ method: m, length, calls, calling });
}

/** Back-compat alias: `stedmanComposition` at stage 7 (Triples) specifically. */
export function stedmanTriplesComposition(perSixCalling: string, method?: Method): Composition {
  return stedmanComposition(perSixCalling, method);
}

// ---------------------------------------------------------------------------
// Generic call construction (ADR-0009)
// ---------------------------------------------------------------------------

/**
 * Standard calls for a method, without a bespoke per-method factory.
 *
 * Two-tier lookup, dispatched by **method-name family**, not by
 * `MethodClassification` (see below):
 *
 *  1. **Special-case families**, matched by name prefix (case-insensitive):
 *     - `Grandsire*` (Doubles, Triples, Caters, Cinques, …) → `grandsireCalls(stage)`.
 *       The bob `3.1` / single `3.123` shape is stage-independent and holds for
 *       every Grandsire stage, not just Triples.
 *     - `Stedman*` at stage 7 (Triples) and upwards (Caters, Cinques, …) →
 *       `stedmanCalls(stage)`. The six-end call shape generalizes the same way.
 *     - `Stedman*` at **stage 5 (Doubles)** → throws. Stedman Doubles is a
 *       genuine structural exception, not a smaller version of the
 *       Triples-and-up pattern — deferred to a future phase (see ADR-0009).
 *     These don't fit the generic pattern at all (a two-hunt-bell lead end; a
 *     principle with no fixed lead end), so they stay exactly as validated.
 *  2. **Default: bob `14` / single `1234`.** Every other method — near lead
 *     head (`12`, e.g. Plain Bob, Cambridge) or far (`18`/`16`/`10`/`1T`, e.g.
 *     Kent Treble Bob, Bristol) — gets these two literal, stage-independent
 *     notation strings, parsed via `Change.parse(_, method.stage)`. This is
 *     the convention "almost everyone" uses even on far methods; the
 *     alternative far-calling convention (places at the end) is out of scope
 *     for now (ADR-0009 — deferred as backlog, not a blocker).
 *
 * `MethodClassification` is deliberately *not* the dispatch key: it's the
 * Central Council's blue-line taxonomy, not a call-notation taxonomy, and
 * Grandsire (classified `'Place'`, same as ordinary methods) proves the two
 * don't line up.
 */
export function standardCalls(method: Method): CallDefinition[] {
  const name = method.name.trim().toLowerCase();

  if (name.startsWith('grandsire')) {
    return grandsireCalls(method.stage);
  }

  if (name.startsWith('stedman')) {
    return stedmanCalls(method.stage); // throws for stage 5 (Doubles) — see above
  }

  return [
    { name: 'Bob', symbol: '-', changes: [Change.parse('14', method.stage)] },
    { name: 'Single', symbol: 's', changes: [Change.parse('1234', method.stage)] },
  ];
}
