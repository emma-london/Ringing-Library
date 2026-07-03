import { describe, it, expect } from 'vitest';
import { Method } from '../method.js';
import { Touch } from '../touch.js';
import { searchTouches } from '../search.js';
import { LeadHeadEngine, type EngineTouch } from '../engine/index.js';
import { STANDARD_METHODS, standardCalls } from '../data/standard-methods.js';

// Generic lead-head engine tests (ADR-0018).
//
// The C++ oracle covers only Grandsire Triples (see engine.test.ts). For any
// *other* lead-head method the cross-oracle is `searchTouches` (ADR-0011) — the
// bounded searcher already enumerates true come-round touches for any lead-end
// method and is itself C++-validated for Grandsire. For each method the engine's
// `list` set must equal `searchTouches`'s set over the same bound, and every
// engine result must independently re-prove true via `Touch.prove()`.

function method(name: string): Method {
  const e = STANDARD_METHODS.find((m) => m.name === name)!;
  return Method.fromPlaceNotation(e.notation, e.stage, e.name);
}

const key = (t: { calling: string; changes: number; snap: boolean }) =>
  `${t.calling}:${t.changes}:${t.snap ? 'snap' : 'lead-end'}`;

/** Re-ring every engine result through the public core and confirm it is true. */
function reproveAll(results: EngineTouch[]) {
  for (const t of results) {
    const touch = new Touch(t.composition);
    expect(touch.prove().isTrue, `true: ${t.calling}`).toBe(true);
    expect(touch.comesToRounds(), `comes round: ${t.calling}`).toBe(true);
    expect(touch.changeCount(), `length: ${t.calling}`).toBe(t.changes);
    expect(touch.isSnapFinish(), `snap: ${t.calling}`).toBe(t.snap);
  }
}

/** Engine.list(maxLeads) must equal searchTouches over the same lead bound. */
function expectMatchesSearch(name: string, maxLeads: number) {
  const m = method(name);
  const calls = standardCalls(m);
  const engine = new LeadHeadEngine(m, calls);
  const list = engine.list(maxLeads);

  const report = searchTouches({ method: m, calls, maxChanges: maxLeads * m.leadLength, limit: 1_000_000, maxNodes: 500_000_000 });
  expect(report.truncated, `${name}: searchTouches must not truncate`).toBe(false);

  const engineSet = new Set(list.map(key));
  const searchSet = new Set(report.results.map(key));
  expect(engineSet).toEqual(searchSet);
  reproveAll(list);
  return list;
}

describe('LeadHeadEngine — matches searchTouches across methods', () => {
  it('Plain Bob Minor (stage 6)', () => { expect(expectMatchesSearch('Plain Bob Minor', 6).length).toBeGreaterThan(0); });
  it('Plain Bob Triples (stage 7)', () => { expectMatchesSearch('Plain Bob Triples', 6); });
  it('Plain Bob Major (stage 8)', () => { expectMatchesSearch('Plain Bob Major', 5); });
  it('Grandsire Triples (stage 7)', () => { expectMatchesSearch('Grandsire Triples', 8); });
  it('Cambridge Surprise Major (stage 8, surprise)', () => {
    const list = expectMatchesSearch('Cambridge Surprise Major', 7);
    const plainCourse = list.find((t) => t.calling === '.......');
    expect(plainCourse, 'plain course comes round in 7 leads (224)').toBeDefined();
    expect(plainCourse!.changes).toBe(224);
  });
});

describe('LeadHeadEngine — find and mitm generalize', () => {
  it('Plain Bob Minor: find(exact) returns only that lead count, all re-proved', () => {
    const m = method('Plain Bob Minor');
    const engine = new LeadHeadEngine(m, standardCalls(m));
    const found = engine.find(5, 1000);
    expect(found.length).toBeGreaterThan(0);
    for (const t of found) {
      expect(t.leads).toBe(5);
      expect(t.verifiedTrue).toBe(true);
    }
  });

  it('Plain Bob Major: mitmCount equals the count-mode tally for the same length', () => {
    const m = method('Plain Bob Major');
    const engine = new LeadHeadEngine(m, standardCalls(m));
    for (const L of [3, 4, 5]) {
      const mm = engine.mitmCount(L);
      const row = engine.count(L).byLength.find((r) => r.leads === L);
      const total = row ? row.total : 0;
      const leadEnd = row ? row.leadEnd : 0;
      const snap = row ? row.snap : 0;
      expect([mm.total, mm.leadEnd, mm.snap]).toEqual([total, leadEnd, snap]);
    }
  });
});

describe('LeadHeadEngine — results are Compositions (ADR-0002/0018)', () => {
  it('each list result carries a re-provable Composition with the right calling', () => {
    const m = method('Plain Bob Minor');
    const engine = new LeadHeadEngine(m, standardCalls(m));
    for (const t of engine.list(5)) {
      // The calling round-trips through Composition.fromCalling.
      expect(t.composition.length).toBe(t.leads);
      expect(new Touch(t.composition).changeCount()).toBe(t.changes);
    }
  });
});

describe('LeadHeadEngine — scope guards (ADR-0018)', () => {
  it('rejects a principle (Stedman: treble is not a hunt bell)', () => {
    const stedman = Method.fromPlaceNotation('3.1.7.3.1.3,1', 7, 'Stedman Triples');
    expect(() => new LeadHeadEngine(stedman, [])).toThrow(/lead-head method/);
  });

  it('rejects stages above the dense-model ceiling (Royal)', () => {
    const bigStage = Method.fromPlaceNotation('&-1-1-1-1-1,1', 12, 'Plain Hunt Maximus');
    expect(() => new LeadHeadEngine(bigStage, [])).toThrow(/stage/);
  });
});
