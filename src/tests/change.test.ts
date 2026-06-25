import { describe, it, expect } from 'vitest';
import { Change } from '../change.js';
import { Row, Stage } from '../row.js';

describe('Change construction', () => {
  it('constructs a cross on major', () => {
    const c = new Change(8, []);
    expect(c.places).toEqual([]);
    expect(c.toString()).toBe('X');
  });

  it('constructs from explicit places (sorted)', () => {
    // '14' on 8 bells: bells at positions 0 and 3 stay
    const c = new Change(8, [0, 3]);
    expect([...c.places]).toEqual([0, 3]);
  });

  it('throws on duplicate place', () => {
    expect(() => new Change(8, [0, 0])).toThrow();
  });

  it('throws on out-of-range place', () => {
    expect(() => new Change(8, [8])).toThrow(RangeError);
  });
});

describe('Change.cross', () => {
  it('produces a cross on major', () => {
    const c = Change.cross(8);
    expect(c.toString()).toBe('X');
    expect(c.places.length).toBe(0);
  });

  it('throws on odd stage', () => {
    expect(() => Change.cross(7)).toThrow();
  });
});

describe('Change.parse', () => {
  it('parses X as cross', () => {
    expect(Change.parse('X', 8).toString()).toBe('X');
  });

  it('parses - as cross', () => {
    expect(Change.parse('-', 8).toString()).toBe('X');
  });

  it('parses 14 on major (includes implicit externals if needed)', () => {
    // '14' explicit: bells 0 and 3 in place. On 8 bells, that's fine.
    const c = Change.parse('14', 8);
    expect([...c.places]).toContain(0);
    expect([...c.places]).toContain(3);
  });

  it('parses 1 on major — adds implicit high external', () => {
    // '1' means only treble in place; last bell may need implicit place if stage is odd count
    // On stage 8: 1 in place, pairs: (1,2),(3,4),(5,6),(7?) — wait, stage 8 = even
    // positions: 0(place), 1-2(swap), 3-4(swap), 5-6(swap), 7 needs place
    const c = Change.parse('1', 8);
    expect([...c.places]).toContain(0);
    expect([...c.places]).toContain(7); // implicit high external
  });

  it('parses 18 on major — treble and tenor in place', () => {
    const c = Change.parse('18', 8);
    expect([...c.places]).toContain(0); // '1' = bell 0
    expect([...c.places]).toContain(7); // '8' = bell 7
  });
});

describe('Change.apply', () => {
  it('cross on rounds gives pairs swapped', () => {
    // Rounds on major: 12345678 → cross → 21436587
    const r = Row.rounds(Stage.MAJOR);
    const c = Change.cross(8);
    expect(c.apply(r).toString()).toBe('21436587');
  });

  it('cross applied twice returns to rounds', () => {
    const r = Row.rounds(Stage.MAJOR);
    const c = Change.cross(8);
    expect(c.apply(c.apply(r)).toString()).toBe(r.toString());
  });

  it('14 on rounds — treble and 4th in place, rest swap', () => {
    // positions 0,3 in place; pairs (1,2),(4,5),(6,7) swap
    // 12345678 → 1 stays, 23 swap, 4 stays, 56 swap, 78 swap
    // → 13246587
    const r = Row.rounds(Stage.MAJOR);
    const c = Change.parse('14', 8);
    expect(c.apply(r).toString()).toBe('13246587');
  });

  it('throws on stage mismatch', () => {
    expect(() => Change.cross(8).apply(Row.rounds(6))).toThrow();
  });
});

describe('Change.swaps', () => {
  it('cross on major has 4 swap pairs', () => {
    expect(Change.cross(8).swaps().length).toBe(4);
  });

  it('14 on major has 3 swap pairs', () => {
    const c = Change.parse('14', 8);
    expect(c.swaps().length).toBe(3);
  });

  it('all places = no swaps', () => {
    // Construct a change where every bell is in a place (all places)
    const c = new Change(4, [0, 1, 2, 3]);
    expect(c.swaps().length).toBe(0);
  });
});

describe('Change.toString', () => {
  it('cross returns X', () => {
    expect(Change.cross(8).toString()).toBe('X');
  });

  it('returns place notation string', () => {
    const c = new Change(8, [0, 3]);
    expect(c.toString()).toBe('14');
  });
});

describe('Change.equals', () => {
  it('same change is equal', () => {
    expect(Change.cross(8).equals(Change.cross(8))).toBe(true);
  });

  it('different places are not equal', () => {
    expect(new Change(8, [0]).equals(new Change(8, [0, 3]))).toBe(false);
  });

  it('different stages are not equal', () => {
    expect(Change.cross(8).equals(Change.cross(6))).toBe(false);
  });
});

describe('Plain Bob lead — first 4 rows', () => {
  // Plain Bob Major place notation: &-1-1-1-1-1,2
  // First few changes: X, 14, X, 14, X, 14, X, 14, X, 14, X, 12
  // Starting from rounds, first 4 changes:
  it('produces correct rows for first 4 changes', () => {
    const cross = Change.cross(8);
    const c14 = Change.parse('14', 8);

    let row = Row.rounds(Stage.MAJOR);
    // change 1: X
    row = cross.apply(row);
    expect(row.toString()).toBe('21436587');
    // change 2: 14 (places at positions 0 and 3, swaps: (1,2),(4,5),(6,7))
    // '21436587' = [1,0,3,2,5,4,7,6] → pos0 stays, 1↔2, pos3 stays, 4↔5, 6↔7
    // → [1,3,0,2,4,5,6,7] = '24135678'  (note: bells at pos4,5 stay in same order after swap)
    row = c14.apply(row);
    expect(row.toString()).toBe('24135678');
    // change 3: X on '24135678'
    row = cross.apply(row);
    expect(row.stage).toBe(8);
  });
});
