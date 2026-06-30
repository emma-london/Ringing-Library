import { describe, it, expect } from 'vitest';
import { Method } from '../method.js';
import { Touch } from '../touch.js';
import { Row } from '../row.js';
import { searchStedmanTouches, type SearchResult } from '../search.js';
import { stedmanTriplesComposition } from '../data/standard-methods.js';

// ---------------------------------------------------------------------------
// Stedman / six-based search (ADR-0012)
//
// Truth carries the weight (CLAUDE.md): every result is re-proved through the
// independent `stedmanTriplesComposition` + `Touch` path, never through the
// searcher's own machinery. The count oracle below is derived by an independent
// truth-checked enumeration over `Touch`'s rows (see the test that rebuilds it),
// not by trusting the searcher's output.
//
// Phase-3 stabiliser (per the deciders): a deliberate 3× uplift on both the
// search *node budget* and the per-test *wall-clock budget*, so these
// compute-heavy Stedman searches never brush a ceiling under CI/local load.
// The six-based searcher is slated for a full rewrite in Phase 4 (ADR-0012), so
// this is a cheap de-flake, not a design choice. Raising `maxNodes` only adds
// headroom — each search still stops the instant it exhausts the space or hits
// `limit`, so the asserted results and `truncated` flags are unchanged.
// ---------------------------------------------------------------------------

const NODE_BUDGET = 150_000_000; // 3× the 50M previously used for exhaustive runs
const TEST_TIMEOUT_MS = 15_000; // 3× vitest's 5s default

/** Re-ring a per-six calling through the real core and report the ground truth. */
function reprove(r: SearchResult) {
  const touch = new Touch(stedmanTriplesComposition(r.calling));
  return {
    isTrue: touch.prove().isTrue,
    came: touch.comesToRounds(),
    changes: touch.changeCount(),
    snap: touch.isSnapFinish(),
  };
}

describe('searchStedmanTouches — invariants', () => {
  it('every result is genuinely true, comes round, and matches its reported length & snap', () => {
    const { results } = searchStedmanTouches({ maxChanges: 84, limit: 60, maxNodes: NODE_BUDGET });
    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      const v = reprove(r);
      expect(v.isTrue, `calling ${r.calling} should prove true`).toBe(true);
      expect(v.came, `calling ${r.calling} should come round`).toBe(true);
      expect(v.changes, `calling ${r.calling} length`).toBe(r.changes);
      // The searcher's snap flag must agree with Touch.isSnapFinish exactly, so
      // a result shows the same badge in Search and in Compose (ADR-0012).
      expect(r.snap, `calling ${r.calling} snap flag`).toBe(v.snap);
      // `leads` carries the number of sixes (ADR-0012); the calling has one char per six.
      expect(r.leads).toBe(r.calling.length);
    }
  }, TEST_TIMEOUT_MS);

  it('returns results shortest-first (non-decreasing changes)', () => {
    const { results } = searchStedmanTouches({ maxChanges: 84, limit: 60, maxNodes: NODE_BUDGET });
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.changes).toBeGreaterThanOrEqual(results[i - 1]!.changes);
    }
  }, TEST_TIMEOUT_MS);

  it('with no calls, finds exactly the plain course (all plain sixes, true, 84 changes)', () => {
    const { results } = searchStedmanTouches({ calls: [], maxChanges: 200, limit: 50, maxNodes: NODE_BUDGET });
    expect(results.length).toBe(1);
    const pc = results[0]!;
    expect(/^\.+$/.test(pc.calling)).toBe(true); // every six plain
    expect(pc.changes).toBe(84);
    expect(pc.leads).toBe(14); // 14 sixes
    expect(pc.snap).toBe(false); // comes round on a double-six boundary (84 % 12 === 0)
    const v = reprove(pc);
    expect(v.isTrue).toBe(true);
    expect(v.came).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('respects the result limit (and flags truncated) and the maxChanges ceiling', () => {
    const limited = searchStedmanTouches({ maxChanges: 200, limit: 5, maxNodes: NODE_BUDGET });
    expect(limited.results.length).toBe(5);
    expect(limited.truncated).toBe(true);

    const capped = searchStedmanTouches({ calls: ['bob'], maxChanges: 72, limit: 1000, maxNodes: NODE_BUDGET });
    expect(capped.results.every((r) => r.changes <= 72)).toBe(true);
  }, TEST_TIMEOUT_MS);

  it('respects the minChanges floor — skips shorter touches but keeps the rest, in order', () => {
    // Bobs-only ≤ 84 (the fast, fully-enumerated space) has lengths 60/70/72/82/84;
    // a floor of 70 must drop exactly the 60-change touches and keep the order.
    const base = { calls: ['bob'] as const, maxChanges: 84, limit: 1000, maxNodes: NODE_BUDGET };
    const full = searchStedmanTouches(base).results;
    const floored = searchStedmanTouches({ ...base, minChanges: 70 }).results;
    expect(floored.every((r) => r.changes >= 70)).toBe(true);
    expect(floored.map((r) => r.calling)).toEqual(full.filter((r) => r.changes >= 70).map((r) => r.calling));
    expect(full.some((r) => r.changes < 70)).toBe(true); // there were shorter ones to drop
  }, TEST_TIMEOUT_MS);

  it('rejects a non-Stedman (non-double-six) method', () => {
    const grandsire = Method.fromPlaceNotation('3.1.7.1.7.1.7.1.7.1.7.1.7.1', 7, 'Grandsire Triples');
    expect(() => searchStedmanTouches({ method: grandsire })).toThrow(/double-six/);
  }, TEST_TIMEOUT_MS);
});

describe('searchStedmanTouches — independent truth-checked enumeration (bobs only, ≤ 84)', () => {
  // Oracle built WITHOUT the searcher: brute-force every plain/bob per-six
  // calling, ring it with `Touch`, and keep those whose first repeat of a row
  // *is* rounds (true) at ≤ 84 changes, trimming trailing unused sixes. This is
  // the searcher's definition of a hit, computed by a different path.
  function buildOracle(): Map<string, number> {
    const start = Row.rounds(7).toString();
    const firstTrueRounds = (calling: string): number => {
      const rows = [...new Touch(stedmanTriplesComposition(calling)).rows()];
      const seen = new Set<string>([start]);
      for (let i = 1; i < rows.length; i++) {
        const s = rows[i]!.toString();
        if (s === start) return i; // came round true
        if (seen.has(s)) return -1; // repeated a non-rounds row first → false
        seen.add(s);
      }
      return -1;
    };
    const trimmedSeen = new Set<string>();
    const oracle = new Map<string, number>(); // calling → changes
    for (let mask = 0; mask < (1 << 14); mask++) {
      let s = '';
      for (let k = 0; k < 14; k++) s += (mask >> k) & 1 ? '-' : '.';
      const fr = firstTrueRounds(s);
      if (fr < 0 || fr > 84) continue;
      const used = Math.ceil((fr - 2) / 6);
      const trimmed = s.slice(0, used);
      if (trimmedSeen.has(trimmed)) continue;
      trimmedSeen.add(trimmed);
      oracle.set(trimmed, fr);
    }
    return oracle;
  }

  const oracle = buildOracle();
  const { results, truncated } = searchStedmanTouches({
    calls: ['bob'],
    maxChanges: 84,
    limit: 100000,
    maxNodes: NODE_BUDGET,
  });

  it('exhausts the bobs-only space within 84 changes (not truncated)', () => {
    expect(truncated).toBe(false);
  }, TEST_TIMEOUT_MS);

  it('finds exactly the 46 true come-round touches the oracle finds — same callings, same lengths', () => {
    expect(results.length).toBe(46);
    expect(oracle.size).toBe(46);
    const got = new Map(results.map((r) => [r.calling, r.changes]));
    expect(new Set(got.keys())).toEqual(new Set(oracle.keys()));
    for (const [calling, changes] of oracle) {
      expect(got.get(calling), `length of ${calling}`).toBe(changes);
    }
  }, TEST_TIMEOUT_MS);

  it('matches the per-length tally', () => {
    const tally: Record<number, number> = {};
    for (const r of results) tally[r.changes] = (tally[r.changes] ?? 0) + 1;
    expect(tally).toEqual({ 60: 6, 70: 4, 72: 6, 82: 20, 84: 10 });
  }, TEST_TIMEOUT_MS);

  it('includes the plain course and the SLQ touch (`..--..--...--.`) among the ten 84-change touches', () => {
    const at84 = results.filter((r) => r.changes === 84).map((r) => r.calling).sort();
    expect(at84.length).toBe(10);
    expect(at84).toContain('..............'); // plain course
    expect(at84).toContain('..--..--...--.'); // SLQ (bobs at sixes 3,4,7,8,12,13)
    // SLQ proves true at 84 via the independent path.
    const slq = new Touch(stedmanTriplesComposition('..--..--...--.'));
    expect(slq.prove().isTrue).toBe(true);
    expect(slq.changeCount()).toBe(84);
  }, TEST_TIMEOUT_MS);
});
