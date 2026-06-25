import { describe, it, expect } from 'vitest';
import { PlaceNotation } from '../place-notation.js';
import { Stage } from '../bell.js';

describe('PlaceNotation.parse — symmetric &', () => {
  it('PB Major: &-18-18-18-18,12 → 16 changes', () => {
    const changes = PlaceNotation.parse('&-18-18-18-18,12', Stage.MAJOR);
    expect(changes.length).toBe(16);
    expect(changes[0]!.toString()).toBe('X');   // first change is cross
    expect(changes[15]!.toString()).toBe('12');  // lead-end is 12
  });

  it('CSM: &-38-14-1258-36-14-58-16-78,12 → 32 changes', () => {
    const changes = PlaceNotation.parse('&-38-14-1258-36-14-58-16-78,12', Stage.MAJOR);
    expect(changes.length).toBe(32);
    expect(changes[0]!.toString()).toBe('X');
    expect(changes[31]!.toString()).toBe('12');
  });

  it('symmetric body is a palindrome (excluding lead-end)', () => {
    const changes = PlaceNotation.parse('&-18-18-18-18,12', Stage.MAJOR);
    // changes[0..14] should be palindromic: changes[i] == changes[14-i]
    for (let i = 0; i < 7; i++) {
      expect(changes[i]!.equals(changes[14 - i]!)).toBe(true);
    }
  });

  it('without comma: palindrome only (2n-1 changes)', () => {
    // Body X,18,X,18,X,18,X,18 (n=8) → palindrome = 15 changes
    const changes = PlaceNotation.parse('&-18-18-18-18', Stage.MAJOR);
    expect(changes.length).toBe(15);
  });
});

describe('PlaceNotation.parse — non-symmetric', () => {
  it('full notation without comma', () => {
    // Write out PB Major in full (16 explicit changes)
    const full = 'X.18.X.18.X.18.X.18.X.18.X.18.X.18.X.12';
    const changes = PlaceNotation.parse(full, Stage.MAJOR);
    expect(changes.length).toBe(16);
    expect(changes[15]!.toString()).toBe('12');
  });

  it('comma without & still expands palindromically', () => {
    // body = [X,18,X,18] (n=4) → palindrome (7) + lead-end = 8 changes
    // This matches the standard ringing convention: , always implies palindromic
    const changes = PlaceNotation.parse('-18-18,12', Stage.MAJOR);
    expect(changes.length).toBe(8);
    expect(changes[0]!.toString()).toBe('X');
    expect(changes[7]!.toString()).toBe('12');
  });

  it('& is optional when , is present — same result with or without', () => {
    const withAmp    = PlaceNotation.parse('&-18-18-18-18,12', Stage.MAJOR);
    const withoutAmp = PlaceNotation.parse('-18-18-18-18,12', Stage.MAJOR);
    expect(withAmp.length).toBe(withoutAmp.length);
    for (let i = 0; i < withAmp.length; i++) {
      expect(withAmp[i]!.equals(withoutAmp[i]!)).toBe(true);
    }
  });

  it('X and - are both recognised as cross', () => {
    const a = PlaceNotation.parse('X.18.X.18', Stage.MAJOR);
    const b = PlaceNotation.parse('-18-18', Stage.MAJOR);
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      expect(a[i]!.equals(b[i]!)).toBe(true);
    }
  });
});

describe('PlaceNotation.parse — implicit external places', () => {
  it('1 on major gets implicit tenor place → 18', () => {
    const changes = PlaceNotation.parse('&-1-1-1-1-1-1-1,2', Stage.MAJOR);
    // '1' parsed as '18' on major; same result as '-18-...'
    const ref = PlaceNotation.parse('&-18-18-18-18-18-18-18,2', Stage.MAJOR);
    expect(changes.length).toBe(ref.length);
    for (let i = 0; i < changes.length; i++) {
      expect(changes[i]!.equals(ref[i]!)).toBe(true);
    }
  });
});

describe('PlaceNotation.stringify', () => {
  it('round-trips PB Major changes via auto-detect symmetric', () => {
    const changes = PlaceNotation.parse('&-18-18-18-18,12', Stage.MAJOR);
    const s = PlaceNotation.stringify(changes);
    expect(s).toContain('&');
    expect(s).toContain(',');
    // Re-parse and verify identity
    const reparsed = PlaceNotation.parse(s, Stage.MAJOR);
    expect(reparsed.length).toBe(changes.length);
    for (let i = 0; i < changes.length; i++) {
      expect(reparsed[i]!.equals(changes[i]!)).toBe(true);
    }
  });

  it('symmetric=false emits full dot-separated notation', () => {
    const changes = PlaceNotation.parse('&-18-18-18-18,12', Stage.MAJOR);
    const s = PlaceNotation.stringify(changes, false);
    expect(s).not.toContain('&');
    expect(s.split('.').length).toBe(16);
  });
});
