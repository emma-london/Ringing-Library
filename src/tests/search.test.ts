import { describe, it, expect } from 'vitest';
import { Method } from '../method.js';
import { Composition } from '../composition.js';
import { Touch } from '../touch.js';
import { searchTouches, type SearchResult } from '../search.js';
import {
  STANDARD_METHODS,
  grandsireCalls,
  plainBobCalls,
} from '../data/standard-methods.js';

const grandsireEntry = STANDARD_METHODS.find((m) => m.name === 'Grandsire Triples')!;
const grandsire = Method.fromPlaceNotation(grandsireEntry.notation, 7, grandsireEntry.name);

const pbMinorEntry = STANDARD_METHODS.find((m) => m.name === 'Plain Bob Minor')!;
const pbMinor = Method.fromPlaceNotation(pbMinorEntry.notation, 6, pbMinorEntry.name);

/** Re-ring a result through the real core and confirm it is genuinely true. */
function reprove(method: Method, calls: ReturnType<typeof grandsireCalls>, r: SearchResult) {
  const comp = Composition.fromCalling(method, r.calling, { calls });
  const touch = new Touch(comp);
  return {
    isTrue: touch.prove().isTrue,
    came: touch.comesToRounds(),
    changes: touch.changeCount(),
    snap: touch.isSnapFinish(),
  };
}

describe('searchTouches — invariants', () => {
  it('every result it returns is genuinely true, comes round, and matches its reported length/snap', () => {
    const calls = grandsireCalls(7);
    const { results } = searchTouches({ method: grandsire, calls, maxChanges: 140, limit: 1000, maxNodes: 30_000_000 });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const v = reprove(grandsire, calls, r);
      expect(v.isTrue, `calling ${r.calling} should prove true`).toBe(true);
      expect(v.came, `calling ${r.calling} should come round`).toBe(true);
      expect(v.changes, `calling ${r.calling} length`).toBe(r.changes);
      expect(v.snap, `calling ${r.calling} snap flag`).toBe(r.snap);
    }
  });

  it('returns results shortest-first (non-decreasing changes)', () => {
    const { results } = searchTouches({ method: grandsire, calls: grandsireCalls(7), maxChanges: 140, limit: 1000, maxNodes: 30_000_000 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.changes).toBeGreaterThanOrEqual(results[i - 1]!.changes);
    }
  });

  it('respects the maxChanges ceiling and the result limit', () => {
    const capped = searchTouches({ method: grandsire, calls: grandsireCalls(7), maxChanges: 84, limit: 1000, maxNodes: 30_000_000 });
    expect(capped.results.every((r) => r.changes <= 84)).toBe(true);

    const limited = searchTouches({ method: grandsire, calls: grandsireCalls(7), maxChanges: 140, limit: 5, maxNodes: 30_000_000 });
    expect(limited.results.length).toBe(5);
    expect(limited.truncated).toBe(true);
  });
});

describe('searchTouches — live diff vs the C++ grandsire_solver prototype', () => {
  // Oracle captured from `prototypes/grandsire_solver count 10` (bobs + singles):
  // true come-round Grandsire Triples touches by lead count, split lead-end / snap.
  const ORACLE: Record<number, { leadEnd: number; snap: number }> = {
    3: { leadEnd: 1, snap: 0 },
    5: { leadEnd: 1, snap: 0 },
    6: { leadEnd: 7, snap: 0 },
    7: { leadEnd: 0, snap: 1 },
    8: { leadEnd: 6, snap: 3 },
    9: { leadEnd: 30, snap: 10 },
    10: { leadEnd: 10, snap: 14 },
  };
  // Exact callings for every true touch up to 6 leads (from `... list 6`).
  const CALLINGS_TO_6 = [
    '---', '.....',
    '--s--s', '-s--s-', '-ss-ss', 's--s--', 's-ss-s', 'ss-ss-', 'ssssss',
  ].sort();

  const { results, truncated } = searchTouches({
    method: grandsire,
    calls: grandsireCalls(7),
    maxChanges: 140, // exactly 10 leads
    limit: 1000,
    maxNodes: 30_000_000,
  });

  it('exhausts the space within 10 leads (not truncated)', () => {
    expect(truncated).toBe(false);
  });

  it('matches the C++ per-length counts exactly (lead-end and snap)', () => {
    const tally: Record<number, { leadEnd: number; snap: number }> = {};
    for (const r of results) {
      const t = (tally[r.leads] ??= { leadEnd: 0, snap: 0 });
      if (r.snap) t.snap++; else t.leadEnd++;
    }
    expect(tally).toEqual(ORACLE);
    // Totals: 55 lead-end + 28 snap = 83 true come-round touches up to 10 leads.
    expect(results.length).toBe(83);
  });

  it('matches the exact callings up to 6 leads', () => {
    const got = results.filter((r) => r.leads <= 6).map((r) => r.calling).sort();
    expect(got).toEqual(CALLINGS_TO_6);
  });

  it('finds the SPSPSBP snap finish (s.s.s-., 97 changes) as the only 7-lead touch', () => {
    const sevens = results.filter((r) => r.leads === 7);
    expect(sevens).toEqual([{ calling: 's.s.s-.', changes: 97, leads: 7, snap: true }]);
  });
});

describe('searchTouches — other methods and edge cases', () => {
  it('with no calls, finds exactly the plain course (and it proves true)', () => {
    const { results } = searchTouches({ method: pbMinor, calls: [], maxChanges: 250, limit: 200, maxNodes: 30_000_000 });
    expect(results.length).toBe(1);
    const pc = results[0]!;
    expect(/^\.+$/.test(pc.calling)).toBe(true); // all plain leads
    const v = reprove(pbMinor, plainBobCalls(6), pc);
    expect(v.isTrue).toBe(true);
    expect(v.came).toBe(true);
  });

  it('the searcher never returns a false touch (Plain Bob Minor, bobs + singles)', () => {
    const calls = plainBobCalls(6);
    const { results } = searchTouches({ method: pbMinor, calls, maxChanges: 120, limit: 500, maxNodes: 30_000_000 });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(reprove(pbMinor, calls, r).isTrue, `Plain Bob Minor ${r.calling}`).toBe(true);
    }
  });
});
