import { describe, it, expect } from 'vitest';
import { Method } from '../method.js';
import { Composition } from '../composition.js';
import { Touch } from '../touch.js';
import { grandsireCalls, plainBobCalls } from '../data/standard-methods.js';

// ---------------------------------------------------------------------------
// The oracle: docs/example-touches.md
//
// Columns: Method, Stage, True/False, Composition, Comment.
// Calling notation: one character per lead, read left to right —
//   '.' = plain, '-' = bob, 's'/'S' = single. Standard CompLib transpositions.
// ---------------------------------------------------------------------------

const grandsire = Method.fromPlaceNotation(
  '3.1.7.1.7.1.7.1.7.1.7.1.7.1',
  7,
  'Grandsire Triples',
);
const gCalls = grandsireCalls(7);

const pbMajor = Method.fromPlaceNotation('&-18-18-18-18,12', 8, 'Plain Bob Major');
const pbCalls = plainBobCalls(8);

function grandsireTouch(calling: string): Touch {
  return new Touch(Composition.fromCalling(grandsire, calling, { calls: gCalls }));
}
function pbMajorTouch(calling: string): Touch {
  return new Touch(Composition.fromCalling(pbMajor, calling, { calls: pbCalls }));
}

describe('example-touches.md — Grandsire Triples', () => {
  it('row 2: plain course `.....` is TRUE, 70 changes, comes round at the lead-end', () => {
    const t = grandsireTouch('.....');
    const proof = t.prove();
    expect(proof.isTrue).toBe(true);
    expect(t.comesToRounds()).toBe(true);
    expect(t.isSnapFinish()).toBe(false);
    expect(t.changeCount()).toBe(70);
    expect(proof.rowCount).toBe(70);
  });

  it('row 3: `-s--s-` (BSBBSB) is TRUE, 84 changes', () => {
    const t = grandsireTouch('-s--s-');
    const proof = t.prove();
    expect(proof.isTrue).toBe(true);
    expect(t.comesToRounds()).toBe(true);
    expect(t.isSnapFinish()).toBe(false);
    expect(t.changeCount()).toBe(84);
  });

  it('row 4: `s.s.s-.` (SPSPSBP) is TRUE, 97 changes, SNAP finish', () => {
    const t = grandsireTouch('s.s.s-.');
    const proof = t.prove();
    expect(proof.isTrue).toBe(true);
    expect(t.comesToRounds()).toBe(true);
    expect(t.isSnapFinish()).toBe(true);
    expect(t.changeCount()).toBe(97);
  });

  it('row 1: `.S---.S.S---.S.S---.S` is FALSE', () => {
    const t = grandsireTouch('.S---.S.S---.S.S---.S');
    const proof = t.prove();
    expect(proof.isTrue).toBe(false);
    expect(proof.falseRows.length).toBeGreaterThan(0);
  });
});

describe('example-touches.md — Plain Bob Major', () => {
  it('row 6: `-.....--.....-` (WHWH) is TRUE, 224 changes', () => {
    const t = pbMajorTouch('-.....--.....-');
    const proof = t.prove();
    expect(proof.isTrue).toBe(true);
    expect(t.comesToRounds()).toBe(true);
    expect(t.changeCount()).toBe(224);
  });

  it('row 5: `-..S..-.---..` is FALSE', () => {
    const t = pbMajorTouch('-..S..-.---..');
    const proof = t.prove();
    expect(proof.isTrue).toBe(false);
    expect(proof.falseRows.length).toBeGreaterThan(0);
  });
});
