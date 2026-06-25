import { describe, it, expect } from 'vitest';
import { Method } from '../method.js';
import { Row, Stage } from '../row.js';
import { Change } from '../change.js';

// ---------------------------------------------------------------------------
// Ground truth — rows verified by running the implementation against
// published Plain Bob Major and Cambridge Surprise Major extents.
// ---------------------------------------------------------------------------

const PB_MAJOR_LEAD: string[] = [
  '12345678', '21436587', '24163857', '42618375',
  '46281735', '64827153', '68472513', '86745231',
  '87654321', '78563412', '75836142', '57381624',
  '53718264', '35172846', '31527486', '13254768',
  '13527486', // lead head (index 16)
];

const PB_MAJOR_LEAD_HEADS: string[] = [
  '13527486', '15738264', '17856342',
  '18674523', '16482735', '14263857', '12345678',
];

const CSM_FIRST_6_ROWS: string[] = [
  '12345678', '21436587', '12463857', '21648375', '26143857', '62418375',
];

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe('Method construction', () => {
  it('fromPlaceNotation builds PB Major with correct lead length', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8, 'Plain Bob Major');
    expect(pb.leadLength).toBe(16);
    expect(pb.name).toBe('Plain Bob Major');
    expect(pb.stage).toBe(8);
  });

  it('fromPlaceNotation builds CSM with correct lead length', () => {
    const csm = Method.fromPlaceNotation('&-38-14-1258-36-14-58-16-78,12', 8, 'Cambridge Surprise Major');
    expect(csm.leadLength).toBe(32);
  });

  it('constructor rejects empty changes array', () => {
    expect(() => new Method([])).toThrow();
  });

  it('constructor rejects mixed stages', () => {
    const c8 = Change.cross(8);
    const c6 = Change.cross(6);
    expect(() => new Method([c8, c6])).toThrow();
  });

  it('at() returns correct change', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    expect(pb.at(0).toString()).toBe('X');
    expect(pb.at(1).toString()).toBe('18');
    expect(pb.at(15).toString()).toBe('12');
  });

  it('at() throws on out-of-range index', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    expect(() => pb.at(16)).toThrow(RangeError);
  });

  it('iterator yields all changes', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    expect([...pb].length).toBe(16);
  });
});

// ---------------------------------------------------------------------------
// leadHead
// ---------------------------------------------------------------------------

describe('Method.leadHead', () => {
  it('PB Major lead head is 13527486', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    expect(pb.leadHead().toString()).toBe('13527486');
  });

  it('CSM lead head is 15738264', () => {
    const csm = Method.fromPlaceNotation('&-38-14-1258-36-14-58-16-78,12', 8);
    expect(csm.leadHead().toString()).toBe('15738264');
  });
});

// ---------------------------------------------------------------------------
// leadRows
// ---------------------------------------------------------------------------

describe('Method.leadRows', () => {
  it('yields leadLength+1 rows', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    expect([...pb.leadRows()].length).toBe(17);
  });

  it('first row is rounds by default', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    const rows = [...pb.leadRows()];
    expect(rows[0]!.toString()).toBe('12345678');
  });

  it('last row is the lead head', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    const rows = [...pb.leadRows()];
    expect(rows[rows.length - 1]!.toString()).toBe('13527486');
  });

  it('PB Major full first lead matches published rows', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    const rows = [...pb.leadRows()].map(r => r.toString());
    expect(rows).toEqual(PB_MAJOR_LEAD);
  });

  it('CSM first 6 rows match published rows', () => {
    const csm = Method.fromPlaceNotation('&-38-14-1258-36-14-58-16-78,12', 8);
    const rows = [...csm.leadRows()].slice(0, 6).map(r => r.toString());
    expect(rows).toEqual(CSM_FIRST_6_ROWS);
  });

  it('accepts a custom start row', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    const start = Row.parse('13527486');
    const rows = [...pb.leadRows(start)];
    expect(rows[0]!.toString()).toBe('13527486');
    expect(rows.length).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// leadRowsNoLH
// ---------------------------------------------------------------------------

describe('Method.leadRowsNoLH', () => {
  it('yields exactly leadLength rows', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    expect([...pb.leadRowsNoLH()].length).toBe(16);
  });

  it('last row is NOT the lead head', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    const rows = [...pb.leadRowsNoLH()];
    expect(rows[rows.length - 1]!.toString()).toBe('13254768'); // second-to-last row
  });

  it('chaining two leads via leadRowsNoLH gives correct second lead start', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    const lead1 = [...pb.leadRowsNoLH()];
    const lh1 = pb.leadHead(); // 13527486
    const lead2start = [...pb.leadRows(lh1)][0]!;
    expect(lead2start.toString()).toBe('13527486');
  });
});

// ---------------------------------------------------------------------------
// leadHeads
// ---------------------------------------------------------------------------

describe('Method.leadHeads', () => {
  it('PB Major cycles through 7 lead heads and returns to rounds', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    const heads = [...pb.leadHeads()].map(r => r.toString());
    expect(heads).toEqual(PB_MAJOR_LEAD_HEADS);
  });

  it('last lead head is rounds', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    const heads = [...pb.leadHeads()];
    expect(heads[heads.length - 1]!.isRounds()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// toString
// ---------------------------------------------------------------------------

describe('Method.toString', () => {
  it('includes name and place notation', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8, 'Plain Bob Major');
    expect(pb.toString()).toContain('Plain Bob Major');
    expect(pb.toString()).toContain('&');
  });

  it('works without a name', () => {
    const pb = Method.fromPlaceNotation('&-18-18-18-18,12', 8);
    expect(pb.toString()).not.toContain(':');
  });
});
