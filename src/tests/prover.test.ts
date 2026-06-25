import { describe, it, expect } from 'vitest';
import { Prover, Proof } from '../prover.js';
import { Row } from '../row.js';

const r = (s: string) => Row.parse(s);

describe('Prover — positive (true) cases', () => {
  it('a sequence of distinct rows is true', () => {
    const p = new Prover();
    expect(p.add(r('1234'))).toBe(true);
    expect(p.add(r('2143'))).toBe(true);
    expect(p.add(r('2413'))).toBe(true);
    expect(p.isTrue()).toBe(true);
    expect(p.size()).toBe(3);
    expect(p.falseRows()).toEqual([]);
  });

  it('addAll over distinct rows returns true', () => {
    const p = new Prover();
    const ok = p.addAll([r('123456'), r('214365'), r('241635')]);
    expect(ok).toBe(true);
    expect(p.isTrue()).toBe(true);
  });

  it('an empty prover is vacuously true', () => {
    const p = new Prover();
    expect(p.isTrue()).toBe(true);
    expect(p.size()).toBe(0);
  });
});

describe('Prover — negative (false) cases', () => {
  it('detects a repeated row and reports its line numbers', () => {
    const p = new Prover();
    p.add(r('1234')); // line 1
    p.add(r('2143')); // line 2
    expect(p.add(r('1234'))).toBe(false); // line 3 — repeat
    expect(p.isTrue()).toBe(false);
    const fr = p.falseRows();
    expect(fr).toHaveLength(1);
    expect(fr[0]!.row.toString()).toBe('1234');
    expect(fr[0]!.lines).toEqual([1, 3]);
  });

  it('addAll keeps going and collects every false row (no short-circuit)', () => {
    const p = new Prover();
    const ok = p.addAll([r('1234'), r('2143'), r('1234'), r('2143')]);
    expect(ok).toBe(false);
    const fr = p.falseRows();
    expect(fr).toHaveLength(2);
    expect(fr.map((f) => f.row.toString())).toEqual(['1234', '2143']);
    expect(fr[0]!.lines).toEqual([1, 3]);
    expect(fr[1]!.lines).toEqual([2, 4]);
  });

  it('countRow reports occurrences', () => {
    const p = new Prover();
    p.addAll([r('1234'), r('1234'), r('1234')]);
    expect(p.countRow(r('1234'))).toBe(3);
    expect(p.countRow(r('4321'))).toBe(0);
  });
});

describe('Prover — maxOccurs (multi-extent)', () => {
  it('allows a row twice when maxOccurs is 2', () => {
    const p = new Prover(2);
    expect(p.add(r('1234'))).toBe(true);
    expect(p.add(r('1234'))).toBe(true); // 2nd occurrence still ok
    expect(p.isTrue()).toBe(true);
    expect(p.add(r('1234'))).toBe(false); // 3rd is too many
    expect(p.isTrue()).toBe(false);
  });

  it('rejects maxOccurs < 1', () => {
    expect(() => new Prover(0)).toThrow(RangeError);
    expect(() => new Prover(-1)).toThrow(RangeError);
  });
});

describe('Prover — misc', () => {
  it('throws on mixed stages', () => {
    const p = new Prover();
    p.add(r('1234'));
    expect(() => p.add(r('123456'))).toThrow();
  });

  it('reset clears state', () => {
    const p = new Prover();
    p.addAll([r('1234'), r('1234')]);
    expect(p.isTrue()).toBe(false);
    p.reset();
    expect(p.isTrue()).toBe(true);
    expect(p.size()).toBe(0);
    expect(p.add(r('1234'))).toBe(true);
  });
});

describe('Proof — immutable value type (ADR-0005)', () => {
  it('snapshots stage, rowCount, maxOccurs and falseRows', () => {
    const p = new Prover();
    p.addAll([r('1234'), r('2143'), r('1234')]);
    const proof = p.proof();
    expect(proof).toBeInstanceOf(Proof);
    expect(proof.isTrue).toBe(false);
    expect(proof.stage).toBe(4);
    expect(proof.rowCount).toBe(3);
    expect(proof.maxOccurs).toBe(1);
    expect(proof.falseRows[0]!.lines).toEqual([1, 3]);
  });

  it('is frozen / immutable', () => {
    const proof = new Prover().proof();
    expect(Object.isFrozen(proof)).toBe(true);
    expect(() => {
      (proof as unknown as { isTrue: boolean }).isTrue = false;
    }).toThrow();
  });

  it('serialises to plain JSON with rows as strings', () => {
    const p = new Prover();
    p.addAll([r('1234'), r('1234')]);
    const json = p.proof().toJSON() as {
      isTrue: boolean;
      falseRows: Array<{ row: string; lines: number[] }>;
    };
    expect(json.isTrue).toBe(false);
    expect(json.falseRows).toEqual([{ row: '1234', lines: [1, 2] }]);
  });

  it('toString summarises true and false proofs', () => {
    const t = new Prover();
    t.addAll([r('1234'), r('2143')]);
    expect(t.proof().toString()).toContain('TRUE');

    const f = new Prover();
    f.addAll([r('1234'), r('1234')]);
    expect(f.proof().toString()).toContain('FALSE');
  });
});
