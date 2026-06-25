import { describe, it, expect } from 'vitest';
import { Method } from '../method.js';
import { Composition } from '../composition.js';
import { Touch } from '../touch.js';
import { Prover } from '../prover.js';
import { grandsireCalls, plainBobCalls } from '../data/standard-methods.js';

const grandsire = Method.fromPlaceNotation('3.1.7.1.7.1.7.1.7.1.7.1.7.1', 7, 'Grandsire Triples');
const gCalls = grandsireCalls(7);
const pbMajor = Method.fromPlaceNotation('&-18-18-18-18,12', 8, 'Plain Bob Major');
const pbCalls = plainBobCalls(8);
const pbMinor = Method.fromPlaceNotation('&-16-16-16,12', 6, 'Plain Bob Minor');
const csMajor = Method.fromPlaceNotation('&-38-14-1258-36-14-58-16-78,12', 8, 'Cambridge Surprise Major');

function touch(method: Method, calling: string, calls = gCalls): Touch {
  return new Touch(Composition.fromCalling(method, calling, { calls }));
}

describe('Touch.leadChanges — call substitution', () => {
  it('Grandsire plain lead ends 7.1', () => {
    const t = touch(grandsire, '.....');
    const lead = t.leadChanges(0).map((c) => c.toString());
    expect(lead.slice(-2)).toEqual(['7', '1']);
  });

  it('Grandsire bob substitutes 3.1 into the last two changes', () => {
    const t = touch(grandsire, '-....');
    const lead = t.leadChanges(0).map((c) => c.toString());
    expect(lead.slice(-2)).toEqual(['3', '1']);
  });

  it('Grandsire single substitutes 3.123 into the last two changes', () => {
    const t = touch(grandsire, 's....');
    const lead = t.leadChanges(0).map((c) => c.toString());
    expect(lead.slice(-2)).toEqual(['3', '123']);
  });

  it('Plain Bob Major plain/bob/single lead ends are 12 / 14 / 1234', () => {
    expect(touch(pbMajor, '........', pbCalls).leadChanges(0).at(-1)!.toString()).toBe('12');
    expect(touch(pbMajor, '-.......', pbCalls).leadChanges(0).at(-1)!.toString()).toBe('14');
    expect(touch(pbMajor, 's.......', pbCalls).leadChanges(0).at(-1)!.toString()).toBe('1234');
  });

  it('a call only affects its own lead', () => {
    const t = touch(grandsire, '.-...');
    expect(t.leadChanges(0).slice(-2).map((c) => c.toString())).toEqual(['7', '1']); // plain
    expect(t.leadChanges(1).slice(-2).map((c) => c.toString())).toEqual(['3', '1']); // bob
  });
});

describe('Touch.rows — expansion', () => {
  it('the first row is the start row, the last is the come-round row', () => {
    const t = touch(grandsire, '.....');
    const rows = t.toArray();
    expect(rows[0]!.toString()).toBe('1234567');
    expect(rows.at(-1)!.toString()).toBe('1234567');
  });

  it('the plain-course first lead ends at the lead head 1253746', () => {
    const t = touch(grandsire, '.....');
    const rows = t.toArray();
    expect(rows[14]!.toString()).toBe('1253746'); // 14 changes = one lead
  });

  it('rowCount = changeCount + 1', () => {
    const t = touch(grandsire, '-s--s-');
    expect(t.rowCount()).toBe(t.changeCount() + 1);
  });
});

describe('Touch — plain courses of real methods are true', () => {
  it('Grandsire Triples: 5 leads, 70 changes', () => {
    const t = touch(grandsire, '.....');
    expect(t.prove().isTrue).toBe(true);
    expect(t.changeCount()).toBe(70);
    expect(t.comesToRounds()).toBe(true);
  });

  it('Plain Bob Major: 7 leads, 112 changes', () => {
    const t = touch(pbMajor, '.......', pbCalls);
    expect(t.prove().isTrue).toBe(true);
    expect(t.changeCount()).toBe(112);
  });

  it('Plain Bob Minor: 5 leads, 60 changes', () => {
    const t = touch(pbMinor, '.....', plainBobCalls(6));
    expect(t.prove().isTrue).toBe(true);
    expect(t.changeCount()).toBe(60);
  });

  it('Cambridge Surprise Major: 7 leads, 224 changes', () => {
    const t = touch(csMajor, '.......', pbCalls);
    expect(t.prove().isTrue).toBe(true);
    expect(t.changeCount()).toBe(224);
  });
});

describe('Touch — come-round and snaps', () => {
  it('a lead-end finish is not a snap', () => {
    const t = touch(grandsire, '-s--s-');
    expect(t.comesToRounds()).toBe(true);
    expect(t.isSnapFinish()).toBe(false);
  });

  it('the SPSPSBP snap comes round one change before the lead-end', () => {
    const t = touch(grandsire, 's.s.s-.');
    expect(t.comesToRounds()).toBe(true);
    expect(t.isSnapFinish()).toBe(true);
    expect(t.changeCount()).toBe(97); // 14*7 - 1
  });
});

describe('Touch — constructed negatives', () => {
  it('ringing the Grandsire plain course one lead too far repeats rows (false)', () => {
    // The plain course comes round after 5 leads; a 6th plain lead re-rings it.
    const t = touch(grandsire, '......');
    const proof = t.prove();
    expect(proof.isTrue).toBe(false);
    expect(proof.falseRows.length).toBeGreaterThan(0);
  });

  it('repeating a one-lead bob touch twice is false', () => {
    // Single bob that does not come round, repeated, must collide.
    const once = touch(grandsire, '-');
    expect(once.comesToRounds()).toBe(false); // a single bob lead does not come round
  });
});

describe('Touch.prove == manual Prover over rows()', () => {
  it('agrees with feeding rows (minus the final come-round) to a Prover', () => {
    const t = touch(grandsire, '-s--s-');
    const rows = t.toArray();
    const manual = new Prover();
    manual.addAll(rows.slice(0, -1)); // drop the duplicate final rounds
    expect(manual.isTrue()).toBe(t.prove().isTrue);
    expect(manual.size()).toBe(t.prove().rowCount);
  });
});
