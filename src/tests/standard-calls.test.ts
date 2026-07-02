import { describe, it, expect } from 'vitest';
import { type Stage, bellToChar } from '../bell.js';
import { Change } from '../change.js';
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
