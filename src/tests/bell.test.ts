import { describe, it, expect } from 'vitest';
import { bellToChar, bellFromChar, BELL_NAMES, Stage } from '../bell.js';

describe('bellToChar', () => {
  it('converts 0 to treble', () => expect(bellToChar(0)).toBe('1'));
  it('converts 1 to second', () => expect(bellToChar(1)).toBe('2'));
  it('converts 9 to ten', () => expect(bellToChar(9)).toBe('0'));
  it('converts 10 to E', () => expect(bellToChar(10)).toBe('E'));
  it('converts 11 to T', () => expect(bellToChar(11)).toBe('T'));
  it('throws on out-of-range index', () => {
    expect(() => bellToChar(BELL_NAMES.length)).toThrow(RangeError);
    expect(() => bellToChar(-1)).toThrow(RangeError);
  });
});

describe('bellFromChar', () => {
  it('parses treble', () => expect(bellFromChar('1')).toBe(0));
  it('parses ten', () => expect(bellFromChar('0')).toBe(9));
  it('parses E', () => expect(bellFromChar('E')).toBe(10));
  it('parses T', () => expect(bellFromChar('T')).toBe(11));
  it('throws on unrecognised character', () => {
    // I, O, X are deliberately excluded by the CCCBR convention (visually
    // ambiguous with 1, 0, and the cross-change token) — genuinely invalid.
    expect(() => bellFromChar('I')).toThrow();
    expect(() => bellFromChar('O')).toThrow();
    expect(() => bellFromChar('X')).toThrow();
    expect(() => bellFromChar('@')).toThrow();
  });
});

describe('BELL_NAMES round-trip', () => {
  it('bellFromChar(bellToChar(i)) === i for all valid bells', () => {
    for (let i = 0; i < BELL_NAMES.length; i++) {
      expect(bellFromChar(bellToChar(i))).toBe(i);
    }
  });
});

describe('BELL_NAMES beyond Maximus (bells 13-33, CCCBR Framework §B.1)', () => {
  it('has 33 characters, one per bell 1-33', () => {
    expect(BELL_NAMES.length).toBe(33);
  });

  it('converts 12 (13th bell) to A, immediately after Maximus (T = 12th)', () => {
    expect(bellToChar(12)).toBe('A');
    expect(bellFromChar('A')).toBe(12);
  });

  it('matches the full CCCBR letter sequence for 13th through 33rd', () => {
    // 'E' (11th) and 'T' (12th) already claimed; I, O, X excluded throughout.
    const expected = 'ABCDFGHJKLMNPQRSUVWYZ';
    expect(BELL_NAMES.slice(12)).toBe(expected);
    expect(bellToChar(32)).toBe('Z'); // 33rd bell
  });

  it('has no duplicate characters', () => {
    expect(new Set(BELL_NAMES).size).toBe(BELL_NAMES.length);
  });
});

describe('Stage constants', () => {
  it('has correct values', () => {
    expect(Stage.MINOR).toBe(6);
    expect(Stage.MAJOR).toBe(8);
    expect(Stage.MAXIMUS).toBe(12);
    expect(Stage.SINGLES).toBe(3);
  });
});
