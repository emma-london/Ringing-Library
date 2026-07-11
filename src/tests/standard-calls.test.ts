import { describe, it, expect } from 'vitest';
import { type Stage, bellToChar } from '../bell.js';
import { Change } from '../change.js';
import { Row } from '../row.js';
import { type CallDefinition } from '../composition.js';
import { Composition } from '../composition.js';
import { Touch } from '../touch.js';
import { Method } from '../method.js';
import { MethodLibrary } from '../method-library.js';
import {
  STANDARD_METHODS,
  standardCalls,
  grandsireCalls,
  plainBobCalls,
  stedmanCalls,
  stedmanTriplesCalls,
} from '../data/standard-methods.js';

// ---------------------------------------------------------------------------
// standardCalls(method) — ADR-0009
//
// Two-tier dispatch by *name family* (not MethodClassification):
//  - "Grandsire*" at any stage, Doubles upwards -> grandsireCalls(stage)
//  - "Stedman*" at stage 7 (Triples) upwards   -> stedmanCalls(stage)
//  - "Stedman*" at stage 5 (Doubles)           -> throws (genuine exception,
//    not a smaller version of the Triples-up pattern; deferred to Phase 5)
//  - everything else -> stage-independent default bob 14 / single 1234,
//    regardless of near (12) vs far (18/16/10/1T) lead head.
// ---------------------------------------------------------------------------

/** Build a Grandsire-shaped plain lead notation for any odd stage (3.1 + (tenor.1) x (stage-1)). */
function grandsireNotation(stage: number): string {
  const tenor = bellToChar(stage - 1);
  const pairs = Array(stage - 1).fill(`${tenor}.1`).join('.');
  return `3.1.${pairs}`;
}

/** Build a Stedman-shaped double-six notation for stage 7 and up (3.1.tenor.3.1.3,1). */
function stedmanNotation(stage: number): string {
  const tenor = bellToChar(stage - 1);
  return `3.1.${tenor}.3.1.3,1`;
}

const lib = new MethodLibrary(STANDARD_METHODS);

/** Summarise calls for comparison, independent of array/object identity. */
function summary(calls: readonly CallDefinition[]) {
  return calls.map((c) => ({
    symbol: c.symbol.toLowerCase(),
    notation: c.changes.map((ch) => ch.toString()).join('.'),
  }));
}

describe('standardCalls — special-case registry', () => {
  it('Grandsire Triples matches grandsireCalls(7)', () => {
    const m = lib.method('Grandsire Triples')!;
    expect(summary(standardCalls(m))).toEqual(summary(grandsireCalls(7)));
  });

  it('Grandsire Doubles matches grandsireCalls(5)', () => {
    const m = lib.method('Grandsire Doubles')!;
    expect(summary(standardCalls(m))).toEqual(summary(grandsireCalls(5)));
  });

  it('Stedman Triples matches stedmanTriplesCalls()', () => {
    const m = lib.method('Stedman Triples')!;
    expect(summary(standardCalls(m))).toEqual(summary(stedmanTriplesCalls()));
  });

  it('registry lookup is case-insensitive on method name', () => {
    const m = Method.fromPlaceNotation('3.1.7.1.7.1.7.1.7.1.7.1.7.1', 7, 'GRANDSIRE TRIPLES');
    expect(summary(standardCalls(m))).toEqual(summary(grandsireCalls(7)));
  });
});

describe('standardCalls — Grandsire generalizes from Doubles upwards', () => {
  it('Grandsire Caters (stage 9) dispatches to grandsireCalls(9)', () => {
    const m = Method.fromPlaceNotation(grandsireNotation(9), 9, 'Grandsire Caters');
    expect(summary(standardCalls(m))).toEqual(summary(grandsireCalls(9)));
    expect(summary(standardCalls(m))).toEqual([
      { symbol: '-', notation: '3.1' },
      { symbol: 's', notation: '3.123' },
    ]);
  });

  it('Grandsire Cinques (stage 11) dispatches to grandsireCalls(11)', () => {
    const m = Method.fromPlaceNotation(grandsireNotation(11), 11, 'Grandsire Cinques');
    expect(summary(standardCalls(m))).toEqual(summary(grandsireCalls(11)));
  });
});

describe('standardCalls — Stedman generalizes from Triples upwards, except Doubles', () => {
  it('Stedman Caters (stage 9) dispatches to stedmanCalls(9), tenor place scaled to 9', () => {
    const m = Method.fromPlaceNotation(stedmanNotation(9), 9, 'Stedman Caters');
    expect(summary(standardCalls(m))).toEqual(summary(stedmanCalls(9)));

    const ps = stedmanCalls(9).find((c) => c.symbol === 'PS')!; // plain six, then single six
    expect(ps.changes[2]!.toString()).toBe('9'); // plain six-end = tenor place, not '7'
    expect(ps.changes[8]!.toString()).toBe('567'); // single six-end is stage-independent

    const bp = stedmanCalls(9).find((c) => c.symbol === 'BP')!; // bob six, then plain six
    expect(bp.changes[2]!.toString()).toBe('5'); // bob six-end is stage-independent
    expect(bp.changes[8]!.toString()).toBe('9');
  });

  it('Stedman Cinques (stage 11) dispatches to stedmanCalls(11), tenor place scaled to E', () => {
    const m = Method.fromPlaceNotation(stedmanNotation(11), 11, 'Stedman Cinques');
    expect(summary(standardCalls(m))).toEqual(summary(stedmanCalls(11)));
  });

  it('Stedman Doubles (stage 5) is a genuine exception — throws, not silently wrong', () => {
    // Notation here is a stand-in (Stedman Doubles' real call structure is exactly
    // the mess this test exists to keep out of scope) — only the name + stage 5
    // matter for exercising the dispatch guard.
    const m = Method.fromPlaceNotation('&5.1.5.1.5,125', 5, 'Stedman Doubles');
    expect(() => standardCalls(m)).toThrow(/Stedman Doubles/);
    expect(() => stedmanCalls(5)).toThrow(/Stedman Doubles/);
  });

  it('stedmanCalls rejects other invalid stages with a distinct message', () => {
    expect(() => stedmanCalls(6)).toThrow(/Triples \(7\) and upwards/);
    expect(() => stedmanCalls(3)).toThrow(/Triples \(7\) and upwards/);
  });
});

describe('standardCalls — default bob 14 / single 1234', () => {
  const nearAndFar: Array<[string, Stage]> = [
    ['Plain Bob Major', 8], // near: lead end 12
    ['Plain Bob Minor', 6], // near
    ['Plain Bob Doubles', 5], // near
    ['Plain Bob Triples', 7], // near
    ['Cambridge Surprise Major', 8], // near
    ['Kent Treble Bob Minor', 6], // far: lead end 16
  ];

  it.each(nearAndFar)('%s (stage %i) matches plainBobCalls at its own stage', (name, stage) => {
    const m = lib.method(name)!;
    expect(summary(standardCalls(m))).toEqual(summary(plainBobCalls(stage)));
    expect(standardCalls(m).map((c) => c.symbol)).toEqual(['-', 's']);
  });

  it('near (Cambridge, lead end 12) and far (Kent, lead end 16) get the identical default', () => {
    const cambridge = lib.method('Cambridge Surprise Major')!;
    const kent = lib.method('Kent Treble Bob Minor')!;

    // Confirm the near/far lead-end shapes actually differ...
    const cambridgeLeadEnd = cambridge.at(cambridge.leadLength - 1);
    const kentLeadEnd = kent.at(kent.leadLength - 1);
    expect(cambridgeLeadEnd.equals(Change.parse('12', 8))).toBe(true);
    expect(kentLeadEnd.equals(Change.parse('16', 6))).toBe(true);

    // ...but standardCalls doesn't gate on that difference: same default for both.
    expect(summary(standardCalls(cambridge))).toEqual([
      { symbol: '-', notation: '14' },
      { symbol: 's', notation: '1234' },
    ]);
    expect(summary(standardCalls(kent))).toEqual([
      { symbol: '-', notation: '14' },
      { symbol: 's', notation: '1234' },
    ]);
  });

  it('an unregistered method name falls through to the default, not an error', () => {
    const m = Method.fromPlaceNotation('&-16-16-16,12', 6, 'Some New Method');
    expect(summary(standardCalls(m))).toEqual(summary(plainBobCalls(6)));
  });
});

// ---------------------------------------------------------------------------
// Plain Bob Doubles single exception (ADR-0021)
//
// The generic/plain-bob default single is `1234`. On five bells that
// auto-completes to `12345` via the implicit external place at 5ths (place 4
// is made, so lone place 5 above it must be made too) — every bell makes a
// place, no bells cross, and the "single" repeats the previous row: false.
// Plain Bob Doubles rings the single as `123` (4ths & 5ths cross) instead.
// Scoped to Plain Bob Doubles; the bob `14` -> `145` is unaffected.
// ---------------------------------------------------------------------------

describe('Plain Bob Doubles single exception (ADR-0021)', () => {
  // `summary` canonicalises notation (implicit external places), so on five
  // bells the bob `14` reads back as `145`.
  it('plainBobCalls(5) single is 123 (not 1234/12345); higher stages keep 1234', () => {
    expect(summary(plainBobCalls(5))).toEqual([
      { symbol: '-', notation: '145' },
      { symbol: 's', notation: '123' },
    ]);
    // Unchanged everywhere else: the single is the plain `1234` for that stage,
    // never the Doubles-only `123`.
    for (const stage of [6, 7, 8, 10] as Stage[]) {
      const single = summary(plainBobCalls(stage))[1]!;
      expect(single.notation).toBe(Change.parse('1234', stage).toString());
      expect(single.notation).not.toBe('123');
    }
  });

  it('standardCalls(Plain Bob Doubles) single is 123, not the degenerate 12345', () => {
    const m = lib.method('Plain Bob Doubles')!;
    expect(summary(standardCalls(m))).toEqual([
      { symbol: '-', notation: '145' },
      { symbol: 's', notation: '123' },
    ]);
  });

  it('the exception is scoped to Plain Bob Doubles, not all Doubles methods', () => {
    // Some other (unregistered) Doubles method still gets the generic default —
    // this exception is deliberately Plain-Bob-specific (ADR-0021). Its single
    // is therefore still the (degenerate) `12345`, a pre-existing limitation
    // left out of scope, not the Plain-Bob `123`.
    const other = Method.fromPlaceNotation('&5.1.5.1.5,125', 5, 'St Simons Doubles');
    const s = summary(standardCalls(other));
    expect(s[1]!.notation).toBe('12345');
    expect(s[1]!.notation).not.toBe('123');
  });

  it('single 123 crosses 4·5 (valid); the degenerate 12345 crosses nothing', () => {
    const rounds = Row.rounds(5);
    // The correct single: bells in 4ths & 5ths swap.
    expect(rounds.apply(Change.parse('123', 5)).toString()).toBe('12354');
    // The degenerate default on 5 bells: `1234` auto-completes to `12345`,
    // an identity change — the row is unchanged, which is why it is false.
    expect(Change.parse('1234', 5).toString()).toBe('12345');
    expect(rounds.apply(Change.parse('1234', 5)).toString()).toBe('12345');
  });

  it('a singled 120 of Plain Bob Doubles proves true and is a full extent', () => {
    const m = lib.method('Plain Bob Doubles')!;
    const calls = standardCalls(m);
    // Textbook singles extent: a single at the end of each of the three
    // plain courses (leads 4, 8, 12 of a 12-lead touch).
    const t = new Touch(Composition.fromCalling(m, '...s...s...s', { calls }));
    const proof = t.prove();
    expect(proof.isTrue).toBe(true);
    expect(t.comesToRounds()).toBe(true);
    expect(t.changeCount()).toBe(120);
    // A true 120 of Doubles is the whole extent: 120 distinct rows.
    const body = t.toArray().slice(0, -1).map((r) => r.toString());
    expect(new Set(body).size).toBe(120);
  });

  it('the same calling with the degenerate 12345 single is false and never comes round', () => {
    const m = lib.method('Plain Bob Doubles')!;
    const degenerate: CallDefinition[] = [
      { name: 'Bob', symbol: '-', changes: [Change.parse('14', 5)] },
      { name: 'Single', symbol: 's', changes: [Change.parse('1234', 5)] }, // -> 12345
    ];
    const t = new Touch(Composition.fromCalling(m, '...s...s...s', { calls: degenerate }));
    expect(t.comesToRounds()).toBe(false);
    expect(t.prove().isTrue).toBe(false);
  });
});

describe('standardCalls — functional equivalence via existing oracles', () => {
  it('Plain Bob Major WHWH (224 changes) proves true using standardCalls in place of plainBobCalls', () => {
    const pbMajor = Method.fromPlaceNotation('&-18-18-18-18,12', 8, 'Plain Bob Major');
    const calls = standardCalls(pbMajor);
    const t = new Touch(Composition.fromCalling(pbMajor, '-.....--.....-', { calls }));
    const proof = t.prove();
    expect(proof.isTrue).toBe(true);
    expect(t.comesToRounds()).toBe(true);
    expect(t.changeCount()).toBe(224);
  });

  it('Grandsire Triples plain course (70 changes) proves true using standardCalls', () => {
    const grandsire = lib.method('Grandsire Triples')!;
    const calls = standardCalls(grandsire);
    const t = new Touch(Composition.fromCalling(grandsire, '.....', { calls }));
    const proof = t.prove();
    expect(proof.isTrue).toBe(true);
    expect(t.changeCount()).toBe(70);
  });
});
