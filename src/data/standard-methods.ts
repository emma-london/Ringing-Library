import { Stage } from '../bell.js';
import { Change } from '../change.js';
import { Composition, CallDefinition, CallingEntry } from '../composition.js';
import { Method } from '../method.js';
import { MethodLibraryEntry } from '../method-library.js';

/**
 * A curated set of real methods, with place notations verified against the
 * Central Council method library and published blue lines. This is deliberately
 * a small, correct subset — enough to test truth against *real* methods in
 * Phase 3. A platform loader can replace it with the full CCCBR library later
 * (the `MethodLibrary` takes any array), without touching the core.
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
  {
    name: 'Cambridge Surprise Major',
    stage: 8,
    notation: '&-38-14-1258-36-14-58-16-78,12',
    classification: 'Surprise',
    leadHead: '15738264',
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
// Stedman Triples calls (ADR-0007, Option B)
// ---------------------------------------------------------------------------

/**
 * Stedman is a *principle* built from alternating sixes, and its calls are made
 * at **six-ends** — every 6 changes. The library models Stedman as a repeating
 * 12-change *double-six* lead (see `STANDARD_METHODS`), so a lead spans two
 * six-ends. ADR-0006 allows only one call per lead, so per ADR-0007 each of the
 * nine possible (first-six, second-six) callings of a double-six is encoded as a
 * single compound call: the eight non-plain combinations of {Plain, Bob, Single}.
 *
 * At a six-end the plain back-work change is `7` (the bell lies behind); a **bob**
 * makes 5ths (`5`) and a **single** makes 5ths-6ths-7ths (`567`) — each a single
 * change substituted for the `7` that *begins* its six. In the double-six lead
 * `3.1.7.3.1.3.1.3.7.1.3.1` those two `7`s are at change-indices 2 (first six-end)
 * and 8 (second six-end). Verified against published touches: bobs at sixes
 * 3,4,7,8,12,13 (SLQ) come round true in 84; a single at an unaffected six,
 * repeated, comes round true in 168.
 *
 * Symbols are the two-letter pair, e.g. `BB`, `SP`, `PB` (case-insensitive). The
 * plain double-six (`PP`) is the absence of a call.
 */
export function stedmanTriplesCalls(): CallDefinition[] {
  const sixEndChange: Record<string, string> = { P: '7', B: '5', S: '567' };
  const plain = ['3', '1', '7', '3', '1', '3', '1', '3', '7', '1', '3', '1'];
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
      changes: tokens.map((t) => Change.parse(t, 7)),
    };
  });
}

/**
 * Build a Stedman Triples `Composition` from a **per-six** calling string — the
 * natural notation ringers use, one character per six read left to right:
 * `.`/`p` plain, `-`/`b` bob, `s` single (case-insensitive). The number of
 * characters is the number of sixes; they are folded into double-six leads and
 * mapped onto the eight compound calls of `stedmanTriplesCalls()`.
 *
 * An odd number of sixes is allowed (a touch may come round on the first six of a
 * lead); the final half-lead's second six is left plain and the touch comes round
 * at its true six-end (checked at every row by `Touch`).
 *
 * @example
 *   // SLQ — bobs at sixes 3,4,7,8,12,13 → true 84
 *   stedmanTriplesComposition('..bb..bb...bb.');
 */
export function stedmanTriplesComposition(
  perSixCalling: string,
  method?: Method,
): Composition {
  const m = method ?? Method.fromPlaceNotation('3.1.7.3.1.3,1', 7, 'Stedman Triples');
  const calls = stedmanTriplesCalls();
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
