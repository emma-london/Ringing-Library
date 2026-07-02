import { describe, it, expect } from 'vitest';
import { stedmanTriplesCalls, stedmanTriplesComposition } from '../index.js';

/**
 * Stedman Triples *call-structure* facts (ADR-0007, Option B).
 *
 * Stedman's bobs and singles are made at six-ends. Modelled as a 12-change
 * double-six lead, each lead spans two six-ends, encoded as eight compound
 * calls. At a six-end the plain back-work is `7`; a bob makes 5ths (`5`), a
 * single makes 5ths-6ths-7ths (`567`), substituted for the `7` that begins the
 * six (change indices 2 and 8 of the double-six).
 *
 * This file covers the *shape* of `stedmanTriplesCalls()`'s output only.
 * Full-composition truth oracles (plain course, SLQ, etc. — published, see
 * wiki.changeringing.co.uk/Conducting_Stedman) now live in the declarative
 * corpus (ADR-0008): `src/tests/fixtures/known-touches.json`, exercised by
 * `src/tests/known-touches.test.ts`.
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

describe('stedmanTriplesComposition — per-six notation parsing', () => {
  // The truth verdicts these callings produce are covered by the corpus
  // (ADR-0008); this just confirms alternate spellings parse to the same
  // Composition.
  it('accepts -, b, ., p and s spellings equivalently', () => {
    const a = stedmanTriplesComposition('..bb..bb...bb.');
    const b = stedmanTriplesComposition('pp--pp--ppp--p');
    expect(a.hash()).toBe(b.hash());
  });
});
