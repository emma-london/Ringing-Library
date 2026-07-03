import { describe, it, expect } from 'vitest';
import { Method } from '../method.js';
import { Composition } from '../composition.js';
import { Touch } from '../touch.js';
import { GrandsireTriplesEngine, type EngineTouch } from '../engine/index.js';
import { STANDARD_METHODS, grandsireCalls } from '../data/standard-methods.js';

// Phase 4a engine tests (ADR-0013 / ADR-0017).
//
// Two independent oracles guard the engine:
//   1. Pinned counts/callings from the C++ prototype `grandsire_solver.cpp`
//      (the live-diff oracle; `scripts/engine-live-diff.mjs` re-checks these
//      against a freshly compiled binary — this suite pins the results so CI
//      needs no g++).
//   2. Re-proof through the public core: every listed/found touch is rung out by
//      `Touch` and proved by `Prover`, confirming it is genuinely true and comes
//      round — the same truth model used everywhere else in the library.

const grandsireEntry = STANDARD_METHODS.find((m) => m.name === 'Grandsire Triples')!;
const grandsire = Method.fromPlaceNotation(grandsireEntry.notation, 7, grandsireEntry.name);
const calls = grandsireCalls(7);

/** Ring a reported touch through the real core and confirm it is genuinely true. */
function reprove(t: EngineTouch) {
  const comp = Composition.fromCalling(grandsire, t.calling, { calls });
  const touch = new Touch(comp);
  return {
    isTrue: touch.prove().isTrue,
    comesRound: touch.comesToRounds(),
    changeCount: touch.changeCount(),
    snap: touch.isSnapFinish(),
  };
}

const engine = new GrandsireTriplesEngine();

// count(14) — full per-length breakdown, pinned from grandsire_solver.cpp.
const COUNT_14: Array<[number, number, number]> = [
  // [leads, leadEnd, snap]
  [3, 1, 0], [5, 1, 0], [6, 7, 0], [7, 0, 1], [8, 6, 3], [9, 30, 10],
  [10, 10, 14], [11, 231, 63], [12, 287, 195], [13, 481, 362], [14, 4760, 1212],
];

describe('GrandsireTriplesEngine — count', () => {
  it('matches the C++ oracle per-length up to 14 leads', () => {
    const rep = engine.count(14);
    const got = rep.byLength.map((r) => [r.leads, r.leadEnd, r.snap]);
    expect(got).toEqual(COUNT_14);
    expect(rep.totalLeadEnd).toBe(5814);
    expect(rep.totalSnap).toBe(1860);
    expect(rep.total).toBe(7674);
  });

  it('matches pinned totals at 12 and 16 leads', () => {
    expect(engine.count(12).total).toBe(859);
    expect(engine.count(16).total).toBe(44907);
  });

  it('every byLength row is internally consistent (leadEnd + snap = total)', () => {
    for (const r of engine.count(16).byLength) expect(r.leadEnd + r.snap).toBe(r.total);
  });

  it('rejects non-positive lengths', () => {
    expect(() => engine.count(0)).toThrow(RangeError);
    expect(() => engine.count(-1)).toThrow();
  });
});

describe('GrandsireTriplesEngine — list', () => {
  it('lists exactly 19 true touches up to 8 leads, shortest first', () => {
    const list = engine.list(8);
    expect(list.length).toBe(19);
    for (let i = 1; i < list.length; i++) expect(list[i]!.changes).toBeGreaterThanOrEqual(list[i - 1]!.changes);
  });

  it('includes the SPSPSBP snap finish (s.s.s-., 97 changes)', () => {
    const list = engine.list(8);
    const snap = list.find((t) => t.calling === 's.s.s-.');
    expect(snap).toBeDefined();
    expect(snap!.changes).toBe(97);
    expect(snap!.leads).toBe(7);
    expect(snap!.snap).toBe(true);
  });

  it('the plain course (5 leads, 70 changes) is listed and true', () => {
    const list = engine.list(8);
    const pc = list.find((t) => t.calling === '.....');
    expect(pc).toBeDefined();
    expect(pc!.changes).toBe(70);
    expect(pc!.snap).toBe(false);
  });

  it('every listed touch (to 10 leads) re-proves true, comes round, and agrees on length + snap', () => {
    const list = engine.list(10);
    expect(list.length).toBe(83);
    for (const t of list) {
      const r = reprove(t);
      expect(r.isTrue, `calling ${t.calling}`).toBe(true);
      expect(r.comesRound, `calling ${t.calling}`).toBe(true);
      expect(r.changeCount, `calling ${t.calling}`).toBe(t.changes);
      expect(r.snap, `calling ${t.calling}`).toBe(t.snap);
    }
  });
});

describe('GrandsireTriplesEngine — find (exact length, reachability DP)', () => {
  it('finds the unique 3-lead touch (--- , 42 changes) and verifies it', () => {
    const found = engine.find(3);
    expect(found.map((t) => t.calling)).toEqual(['---']);
    expect(found[0]!.changes).toBe(42);
    expect(found[0]!.verifiedTrue).toBe(true);
  });

  it('honours the cap and returns only exact-length touches, all verified + re-proved', () => {
    const found = engine.find(10, 8);
    expect(found.length).toBe(8);
    for (const t of found) {
      expect(t.leads).toBe(10);
      expect(t.verifiedTrue).toBe(true);
      const r = reprove(t);
      expect(r.isTrue).toBe(true);
      expect(r.comesRound).toBe(true);
    }
  });
});

describe('GrandsireTriplesEngine — meet-in-the-middle', () => {
  it('mitmCount equals the count-mode tally for the same exact length', () => {
    for (const L of [10, 12, 14]) {
      const m = engine.mitmCount(L);
      const row = engine.count(L).byLength.find((r) => r.leads === L)!;
      expect([m.total, m.leadEnd, m.snap]).toEqual([row.total, row.leadEnd, row.snap]);
    }
  });

  it('matches the pinned C++ MITM totals', () => {
    expect(engine.mitmCount(10).total).toBe(24);
    expect(engine.mitmCount(12).total).toBe(482);
    expect(engine.mitmCount(14).total).toBe(5972);
  });
});

describe('GrandsireTriplesEngine — Q-set structure', () => {
  it('computes bob = Q-set 5 (5-cycle) and single = Q-set 6 (6-cycle)', () => {
    const q = engine.qsets();
    const bob = q.find((x) => x.call === 'bob')!;
    const single = q.find((x) => x.call === 'single')!;
    expect(bob.qSetSize).toBe(5);
    expect(bob.order).toBe(5);
    expect(single.qSetSize).toBe(6);
    expect(single.order).toBe(6);
  });
});
