import { describe, it, expect } from 'vitest';
import { Method } from '../method.js';
import { Row } from '../row.js';
import { Composition } from '../composition.js';
import { grandsireCalls, plainBobCalls } from '../data/standard-methods.js';

const grandsire = Method.fromPlaceNotation('3.1.7.1.7.1.7.1.7.1.7.1.7.1', 7, 'Grandsire Triples');
const gCalls = grandsireCalls(7);
const pbMajor = Method.fromPlaceNotation('&-18-18-18-18,12', 8, 'Plain Bob Major');
const pbCalls = plainBobCalls(8);

describe('Composition.fromCalling', () => {
  it('parses one char per lead; `.` is plain', () => {
    const c = Composition.fromCalling(grandsire, 's.s.s-.', { calls: gCalls });
    expect(c.length).toBe(7);
    expect(c.calling.map((e) => `${e.lead}${e.call}`)).toEqual(['0s', '2s', '4s', '5-']);
  });

  it('is case-insensitive on call symbols (S == s)', () => {
    const lower = Composition.fromCalling(grandsire, '.s---.s', { calls: gCalls });
    const upper = Composition.fromCalling(grandsire, '.S---.S', { calls: gCalls });
    expect(lower.key()).toBe(upper.key());
  });

  it('a plain course has no calling', () => {
    const c = Composition.fromCalling(grandsire, '.....', { calls: gCalls });
    expect(c.calling).toHaveLength(0);
    expect(c.length).toBe(5);
  });

  it('callAt resolves the call definition at a lead', () => {
    const c = Composition.fromCalling(grandsire, '-s...', { calls: gCalls });
    expect(c.callAt(0)?.name).toBe('Bob');
    expect(c.callAt(1)?.name).toBe('Single');
    expect(c.callAt(2)).toBeUndefined();
  });

  it('rejects an unknown call symbol', () => {
    expect(() => Composition.fromCalling(grandsire, 'x....', { calls: gCalls })).toThrow();
  });
});

describe('Composition validation', () => {
  it('rejects a calling entry out of range', () => {
    expect(
      () =>
        new Composition({
          method: grandsire,
          length: 3,
          calls: gCalls,
          calling: [{ lead: 5, call: '-' }],
        }),
    ).toThrow(RangeError);
  });

  it('rejects a start row of the wrong stage', () => {
    expect(
      () => new Composition({ method: grandsire, length: 5, startRow: Row.rounds(8) }),
    ).toThrow();
  });

  it('defaults the start row to rounds', () => {
    const c = new Composition({ method: grandsire, length: 5 });
    expect(c.startRow.toString()).toBe('1234567');
  });
});

describe('Composition immutable updates', () => {
  it('withCall returns a new composition and does not mutate', () => {
    const base = Composition.fromCalling(grandsire, '.....', { calls: gCalls });
    const called = base.withCall(2, '-');
    expect(base.calling).toHaveLength(0);
    expect(called.calling).toEqual([{ lead: 2, call: '-' }]);
  });

  it('withCall replaces an existing call at the same lead', () => {
    const c = Composition.fromCalling(grandsire, '-....', { calls: gCalls }).withCall(0, 's');
    expect(c.callAt(0)?.name).toBe('Single');
  });

  it('withoutCall removes a call (makes it plain)', () => {
    const c = Composition.fromCalling(grandsire, '-....', { calls: gCalls }).withoutCall(0);
    expect(c.calling).toHaveLength(0);
  });
});

describe('Composition identity (ADR-0005)', () => {
  it('two compositions describing the same touch share a key and hash', () => {
    const a = Composition.fromCalling(grandsire, '-s--s-', { calls: gCalls });
    const b = Composition.fromCalling(grandsire, '-s--s-', { calls: gCalls });
    expect(a.key()).toBe(b.key());
    expect(a.hash()).toBe(b.hash());
    expect(a.equals(b)).toBe(true);
  });

  it('different callings produce different keys', () => {
    const a = Composition.fromCalling(grandsire, '-s--s-', { calls: gCalls });
    const b = Composition.fromCalling(grandsire, '-s--s.', { calls: gCalls });
    expect(a.key()).not.toBe(b.key());
    expect(a.equals(b)).toBe(false);
  });

  it('different lengths produce different keys', () => {
    const a = Composition.fromCalling(grandsire, '.....', { calls: gCalls });
    const b = Composition.fromCalling(grandsire, '......', { calls: gCalls });
    expect(a.key()).not.toBe(b.key());
  });

  it('different methods produce different keys', () => {
    const a = Composition.fromCalling(grandsire, '-....', { calls: gCalls });
    const b = Composition.fromCalling(pbMajor, '-....', { calls: pbCalls });
    expect(a.key()).not.toBe(b.key());
  });

  it('hash is 8 hex chars and deterministic', () => {
    const c = Composition.fromCalling(grandsire, 's.s.s-.', { calls: gCalls });
    expect(c.hash()).toMatch(/^[0-9a-f]{8}$/);
    expect(c.hash()).toBe(c.hash());
  });
});

describe('Composition serialisation', () => {
  it('toJSON / fromJSON round-trips to an equal composition', () => {
    const original = Composition.fromCalling(grandsire, 's.s.s-.', { calls: gCalls });
    const json = JSON.parse(JSON.stringify(original.toJSON()));
    const restored = Composition.fromJSON(json);
    expect(restored.key()).toBe(original.key());
    expect(restored.length).toBe(original.length);
    expect(restored.calling).toEqual(original.calling);
  });

  it('round-trips Plain Bob Major with singles', () => {
    const original = Composition.fromCalling(pbMajor, '-.....--.....-', { calls: pbCalls });
    const restored = Composition.fromJSON(JSON.parse(JSON.stringify(original.toJSON())));
    expect(restored.key()).toBe(original.key());
  });
});

describe('CompositionBuilder', () => {
  it('builds an equivalent composition to fromCalling', () => {
    const built = Composition.builder(grandsire, 6)
      .defineCall('Bob', '-', gCalls[0]!.changes)
      .defineCall('Single', 's', gCalls[1]!.changes)
      .call(0, '-')
      .call(1, 's')
      .call(2, '-')
      .call(3, '-')
      .call(4, 's')
      .call(5, '-')
      .build();
    const viaCalling = Composition.fromCalling(grandsire, '-s--s-', { calls: gCalls });
    expect(built.key()).toBe(viaCalling.key());
  });
});
