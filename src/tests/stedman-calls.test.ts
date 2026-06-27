import { describe, it, expect } from 'vitest';
import {
  Touch,
  stedmanTriplesCalls,
  stedmanTriplesComposition,
} from '../index.js';

/**
 * Stedman Triples *called* touches (ADR-0007, Option B).
 *
 * Stedman's bobs and singles are made at six-ends. Modelled as a 12-change
 * double-six lead, each lead spans two six-ends, encoded as eight compound
 * calls. At a six-end the plain back-work is `7`; a bob makes 5ths (`5`), a
 * single makes 5ths-6ths-7ths (`567`), substituted for the `7` that begins the
 * six (change indices 2 and 8 of the double-six).
 *
 * Truth oracles (published, see wiki.changeringing.co.uk/Conducting_Stedman):
 *  - Bobs at S,L,Q = sixes 3,4,7,8,12,13  → true, comes round in 84 (one course).
 *  - A single at an unaffected six, repeated → true 168.
 *  - A bob calling oneself unaffected three times → true 252.
 */

describe('stedmanTriplesCalls', () => {
  const calls = stedmanTriplesCalls();

  it('defines the eight non-plain compound calls', () => {
    expect(calls.map((c) => c.symbol)).toEqual([
      'PB', 'PS', 'BP', 'BB', 'BS', 'SP', 'SB', 'SS',
    ]);
  });

  it('each compound call replaces a whole double-six lead (12 changes)', () => {
    for (const c of calls) expect(c.changes.length).toBe(12);
  });

  it('BB makes 5ths at both six-ends (indices 2 and 8)', () => {
    const bb = calls.find((c) => c.symbol === 'BB')!;
    expect(bb.changes[2]!.toString()).toBe('5');
    expect(bb.changes[8]!.toString()).toBe('5');
    // the other ten changes are the plain double-six
    expect(bb.changes[0]!.toString()).toBe('3');
    expect(bb.changes[3]!.toString()).toBe('3');
  });

  it('SS makes 5-6-7ths at both six-ends', () => {
    const ss = calls.find((c) => c.symbol === 'SS')!;
    expect(ss.changes[2]!.toString()).toBe('567');
    expect(ss.changes[8]!.toString()).toBe('567');
  });
});

describe('Stedman Triples called touches — truth oracles', () => {
  it('plain course is 84 changes, comes round, and is true', () => {
    const t = new Touch(stedmanTriplesComposition('.'.repeat(14)));
    expect(t.changeCount()).toBe(84);
    expect(t.comesToRounds()).toBe(true);
    expect(t.prove().isTrue).toBe(true);
  });

  it('SLQ (bobs at sixes 3,4,7,8,12,13) is a true 84', () => {
    const t = new Touch(stedmanTriplesComposition('..bb..bb...bb.'));
    expect(t.changeCount()).toBe(84);
    expect(t.comesToRounds()).toBe(true);
    expect(t.prove().isTrue).toBe(true);
  });

  it('a single at six 1, repeated at six 15, is a true 168', () => {
    const perSix = 's' + '.'.repeat(13) + 's' + '.'.repeat(13); // 28 sixes
    const t = new Touch(stedmanTriplesComposition(perSix));
    expect(t.changeCount()).toBe(168);
    expect(t.comesToRounds()).toBe(true);
    expect(t.prove().isTrue).toBe(true);
  });

  it('bobs at sixes 3, 17, 31 give a true 252', () => {
    const arr = Array(42).fill('.');
    for (const six of [3, 17, 31]) arr[six - 1] = 'b';
    const t = new Touch(stedmanTriplesComposition(arr.join('')));
    expect(t.changeCount()).toBe(252);
    expect(t.prove().isTrue).toBe(true);
  });

  it('repeating SLQ (which already comes round in 84) over 168 is FALSE', () => {
    // The calling returns to rounds at change 84, inside the touch, so every row
    // is rung twice — the Prover must catch it.
    const slq = '..bb..bb...bb.';
    const t = new Touch(stedmanTriplesComposition(slq + slq)); // 28 sixes
    const proof = t.prove();
    expect(proof.isTrue).toBe(false);
    expect(proof.falseRows.length).toBeGreaterThan(0);
  });

  it('accepts -, b, ., p and s spellings equivalently', () => {
    const a = stedmanTriplesComposition('..bb..bb...bb.');
    const b = stedmanTriplesComposition('pp--pp--ppp--p');
    expect(a.hash()).toBe(b.hash());
  });
});
