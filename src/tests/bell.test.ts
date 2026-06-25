import { describe, it, expect } from 'vitest';
import { bellToChar, bellFromChar, BELL_NAMES, Stage } from '../bell.js';

describe('bellToChar', () => {
  it('converts 0 to treble', () => expect(bellToChar(0)).toBe('1'));
  it('converts 1 to second', () => expect(bellToChar(1)).toBe('2'));
  it('converts 9 to ten', () => expect(bellToChar(9)).toBe('0'));
  it('converts 10 to E', () => expect(bellToChar(10)).toBe('E'));
  it('converts 11 to T', () => expect(bellToChar(11)).toBe('T'));
  it('throws on out-of-range index', () => {
    expect(() => bellToChar(12)).toThrow(RangeError);
    expect(() => bellToChar(-1)).toThrow(RangeError);
  });
});

describe('bellFromChar', () => {
  it('parses treble', () => expect(bellFromChar('1')).toBe(0));
  it('parses ten', () => expect(bellFromChar('0')).toBe(9));
  it('parses E', () => expect(bellFromChar('E')).toBe(10));
  it('parses T', () => expect(bellFromChar('T')).toBe(11));
  it('throws on unrecognised character', () => {
    expect(() => bellFromChar('Z')).toThrow();
    expect(() => bellFromChar('A')).toThrow();
  });
});

describe('BELL_NAMES round-trip', () => {
  it('bellFromChar(bellToChar(i)) === i for all valid bells', () => {
    for (let i = 0; i < BELL_NAMES.length; i++) {
      expect(bellFromChar(bellToChar(i))).toBe(i);
    }
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
