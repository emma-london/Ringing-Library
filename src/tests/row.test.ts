import { describe, it, expect } from 'vitest';
import { Row, Stage } from '../row.js';

describe('Row construction', () => {
  it('constructs from valid array', () => {
    // [1,0,2,3] → pos0=bell1('2'), pos1=bell0('1'), pos2=bell2('3'), pos3=bell3('4')
    const r = new Row([1, 0, 2, 3]);
    expect(r.stage).toBe(4);
    expect(r.toString()).toBe('2134');
  });

  it('throws on duplicate bell', () => {
    expect(() => new Row([0, 0, 2, 3])).toThrow();
  });

  it('throws on out-of-range bell', () => {
    expect(() => new Row([0, 1, 4, 3])).toThrow(RangeError);
  });

  it('throws on empty array', () => {
    expect(() => new Row([])).toThrow();
  });
});

describe('Row.parse', () => {
  it('parses rounds on major', () => {
    const r = Row.parse('12345678');
    expect(r.toString()).toBe('12345678');
    expect(r.stage).toBe(8);
  });

  it('parses a non-rounds row', () => {
    const r = Row.parse('21436587');
    expect(r.toString()).toBe('21436587');
  });

  it('throws on empty string', () => {
    expect(() => Row.parse('')).toThrow();
  });

  it('throws on invalid character', () => {
    expect(() => Row.parse('1234A678')).toThrow();
  });
});

describe('Row.rounds', () => {
  it('produces correct rounds for major', () => {
    expect(Row.rounds(Stage.MAJOR).toString()).toBe('12345678');
  });

  it('produces correct rounds for minor', () => {
    expect(Row.rounds(Stage.MINOR).toString()).toBe('123456');
  });

  it('throws on non-positive stage', () => {
    expect(() => Row.rounds(0)).toThrow(RangeError);
  });
});

describe('Row.at', () => {
  it('returns correct bell at position', () => {
    const r = Row.parse('21436587');
    expect(r.at(0)).toBe(1); // '2' = bell index 1
    expect(r.at(1)).toBe(0); // '1' = bell index 0
  });

  it('throws on out-of-range position', () => {
    expect(() => Row.rounds(6).at(6)).toThrow(RangeError);
  });
});

describe('Row iterator', () => {
  it('iterates all bells in order', () => {
    const r = Row.parse('213456');
    expect([...r]).toEqual([1, 0, 2, 3, 4, 5]);
  });
});

describe('Row.compose', () => {
  it('rounds composed with rounds is rounds', () => {
    const r = Row.rounds(Stage.MAJOR);
    expect(r.compose(r).isRounds()).toBe(true);
  });

  it('row composed with its inverse is rounds', () => {
    const r = Row.parse('21436587');
    expect(r.compose(r.inverse()).isRounds()).toBe(true);
  });

  it('compose is associative', () => {
    const a = Row.parse('21436587');
    const b = Row.parse('12346578');
    const c = Row.parse('21345678');
    expect(a.compose(b).compose(c).toString())
      .toBe(a.compose(b.compose(c)).toString());
  });

  it('throws on stage mismatch', () => {
    expect(() => Row.rounds(6).compose(Row.rounds(8))).toThrow();
  });
});

describe('Row.inverse', () => {
  it('inverse of rounds is rounds', () => {
    expect(Row.rounds(Stage.MAJOR).inverse().isRounds()).toBe(true);
  });

  it('row * inverse = rounds', () => {
    const r = Row.parse('21436587');
    expect(r.compose(r.inverse()).isRounds()).toBe(true);
    expect(r.inverse().compose(r).isRounds()).toBe(true);
  });

  it('inverse of inverse is identity', () => {
    const r = Row.parse('21436587');
    expect(r.inverse().inverse().toString()).toBe(r.toString());
  });
});

describe('Row.sign', () => {
  it('rounds is even', () => {
    expect(Row.rounds(Stage.MAJOR).sign()).toBe(1);
  });

  it('single transposition is odd', () => {
    // '21345678' swaps first two bells — one transposition, so odd
    expect(Row.parse('21345678').sign()).toBe(-1);
  });

  it('four transpositions is even', () => {
    // '21436587' swaps 4 pairs: (0,1),(2,3),(4,5),(6,7) → even permutation
    expect(Row.parse('21436587').sign()).toBe(1);
  });
});

describe('Row.isRounds', () => {
  it('rounds returns true', () => {
    expect(Row.rounds(8).isRounds()).toBe(true);
  });
  it('non-rounds returns false', () => {
    expect(Row.parse('21345678').isRounds()).toBe(false);
  });
});

describe('Row.equals', () => {
  it('same row is equal', () => {
    expect(Row.parse('21436587').equals(Row.parse('21436587'))).toBe(true);
  });
  it('different rows are not equal', () => {
    expect(Row.parse('21436587').equals(Row.parse('12436587'))).toBe(false);
  });
  it('different stages are not equal', () => {
    expect(Row.rounds(6).equals(Row.rounds(8))).toBe(false);
  });
});

describe('Row.compare', () => {
  it('same row compares as 0', () => {
    expect(Row.parse('21436587').compare(Row.parse('21436587'))).toBe(0);
  });
  it('lexicographically earlier row is negative', () => {
    expect(Row.parse('12345678').compare(Row.parse('21345678'))).toBeLessThan(0);
  });
  it('lexicographically later row is positive', () => {
    expect(Row.parse('21345678').compare(Row.parse('12345678'))).toBeGreaterThan(0);
  });
});

describe('Row.toArray', () => {
  it('returns mutable copy', () => {
    const r = Row.parse('21436587');
    const arr = r.toArray();
    arr[0] = 99;
    expect(r.at(0)).toBe(1); // original unchanged
  });
});

describe('immutability', () => {
  it('_bells array is frozen', () => {
    const r = Row.rounds(8);
    expect(Object.isFrozen(r['_bells' as keyof typeof r])).toBe(true);
  });
});
