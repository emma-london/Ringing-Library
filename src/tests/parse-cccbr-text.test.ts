import { describe, it, expect } from 'vitest';
// The parser now ships in `src/` (ADR-0022) so the runtime cccbr-methods loader
// and the authoring-time refresh script share one copy. Truth carries the weight
// in this codebase, so it gets real tests. Fixtures are genuine rows copied from
// the CCCBR Text library (generated 2026-06-28).
import {
  parseTextLibrary,
  reconstructTitle,
  cccbrTokensToNotation,
  classificationFor,
} from '../cccbr/parse-text.js';
import { Method } from '../method.js';

/** Build a tab-separated CCCBR text file body from row field-arrays. */
function file(rows: string[][]): string {
  const header =
    'Id\tMethod\tFirst rung\tRefs\tFCHs\tStage\tSym\tLit\tLLen\tLeadhead\tPlace Notation';
  return [
    'Central Council Collection of Methods',
    'Copyright (c) 2026 ...',
    'Some Heading Methods',
    '',
    header,
    ...rows.map((r) => r.join('\t')),
  ].join('\n');
}

// Real rows (tabs between every column; place notation is one token per column).
const GRANDSIRE_TRIPLES = ['12415', 'Grandsire', '1715-05-02', 'RW:1958/767', '', '7', 'P', '', '14', 'a',
  '3', '1', '7', '1', '7', '1', '7', '1', '7', '1', '7', '1', '7', '1'];
const PLAIN_BOB_TRIPLES = ['12399', 'Plain Bob', '1690-01-06', 'RW:1958/767', '', '7', 'P', '', '14', 'p',
  '7', '1', '7', '1', '7', '1', '7', '1', '7', '1', '7', '1', '7', '127'];
const STEDMAN_TRIPLES = ['27985', 'Stedman', '1731-10-25', 'RW:1958/699', '', '7', 'P', '', '12', '6347251',
  '3', '1', '7', '3', '1', '3', '1', '3', '7', '1', '3', '1'];

const WESTMINSTER = ['15755', 'Westminster', '1975-11-05', 'RW:1975/997 1981/871', 'BD', '8', 'P', '', '32', 'a',
  '-', '34', '-', '14', '-', '12', '-', '38', '-', '12', '-', '38', '-', '12', '-', '38', '-', '12', '-', '38',
  '-', '12', '-', '38', '-', '12', '-', '14', '-', '34', '-', '12'];
const BEDFORD_PARK = ['15760', 'Bedford Park', '2012-04-30', 'RW:2012/527', '', '8', 'P', '', '32', '18756243',
  '-', '34', '-', '14', '-', '12', '-', '38', '-', '14', '-', '58', '-', '16', '-', '78', '-', '16', '-', '58',
  '-', '14', '-', '38', '-', '12', '-', '14', '-', '34', '-', '18'];
const LITTLE = ["21052", "Richard Harris's Cat Little", '1982-03-07', 'RW:1982/277', '', '8', 'P', 'Y', '24', '15236847',
  '-', '34', '-', '14', '-', '12', '-', '16', '-', '12', '-', '16', '-', '12', '-', '16', '-', '12', '-', '14', '-', '34', '-', '18'];

describe('CCCBR text parser — helpers', () => {
  it('reconstructs full titles from the file class + stage', () => {
    expect(reconstructTitle('Grandsire', 'Plain', 7)).toBe('Grandsire Triples');
    expect(reconstructTitle('Plain Bob', 'Plain', 7)).toBe('Plain Bob Triples');
    expect(reconstructTitle('Stedman', 'Principle', 7)).toBe('Stedman Triples');
    expect(reconstructTitle('Cambridge', 'Surprise', 8)).toBe('Cambridge Surprise Major');
    expect(reconstructTitle('Kent', 'Treble Bob', 6)).toBe('Kent Treble Bob Minor');
    // "Little" is carried in the displayed name; the class word slots after it.
    expect(reconstructTitle("Richard Harris's Cat Little", 'Surprise', 8))
      .toBe("Richard Harris's Cat Little Surprise Major");
  });

  it('splits Plain methods into Bob vs Place by name', () => {
    expect(classificationFor('Plain', 'Plain Bob')).toBe('Bob');
    expect(classificationFor('Plain', 'Reverse Canterbury Pleasure Place')).toBe('Place');
    expect(classificationFor('Surprise', 'Cambridge')).toBe('Surprise');
    expect(classificationFor('Principle', 'Stedman')).toBe('Principle');
  });

  it('joins CCCBR tokens into canonical place notation', () => {
    expect(cccbrTokensToNotation(['3', '1', '7', '1'])).toBe('3.1.7.1');
    expect(cccbrTokensToNotation(['-', '34', '-', '14'])).toBe('-34-14');
    expect(cccbrTokensToNotation(['34', '-', '14', '58'])).toBe('34-14.58');
  });
});

describe('CCCBR text parser — rows', () => {
  const entries = parseTextLibrary(
    file([GRANDSIRE_TRIPLES, PLAIN_BOB_TRIPLES]),
    { fileClass: 'Plain', stage: 7 },
  );
  const byName = Object.fromEntries(entries.map((e) => [e.name, e]));

  it('parses a coded-lead-head Plain method (Grandsire)', () => {
    const g = byName['Grandsire Triples'];
    expect(g).toMatchObject({
      id: 12415, name: 'Grandsire Triples', stage: 7,
      classification: 'Bob', leadHeadCode: 'a', symmetry: 'P',
      notation: '3.1.7.1.7.1.7.1.7.1.7.1.7.1',
    });
    expect(g.leadHead).toBeUndefined();
    expect(g.little).toBeUndefined();
  });

  it('matches the hand-verified STANDARD_METHODS notation', () => {
    // The parsed notation must build the same method (same lead head) as the
    // curated entry — the snapshot and the truth corpus agree on real methods.
    const g = byName['Grandsire Triples'];
    const m = Method.fromPlaceNotation(g.notation, 7, g.name);
    expect(m.leadHead().toString()).toBe('1253746');
    const pb = byName['Plain Bob Triples'];
    const mpb = Method.fromPlaceNotation(pb.notation, 7, pb.name);
    expect(mpb.leadHead().toString()).toBe('1352746');
  });

  it('parses a row (uncoded) lead head as leadHead, not leadHeadCode', () => {
    const [s] = parseTextLibrary(file([STEDMAN_TRIPLES]), { fileClass: 'Principle', stage: 7 });
    expect(s).toMatchObject({
      id: 27985, name: 'Stedman Triples', classification: 'Principle',
      leadHead: '6347251', notation: '3.1.7.3.1.3.1.3.7.1.3.1',
    });
    expect(s.leadHeadCode).toBeUndefined();
  });

  it('parses Surprise Major with a code, a row, and a Little flag', () => {
    const list = parseTextLibrary(file([WESTMINSTER, BEDFORD_PARK, LITTLE]), { fileClass: 'Surprise', stage: 8 });
    const m = Object.fromEntries(list.map((e) => [e.name, e]));
    expect(m['Westminster Surprise Major']).toMatchObject({ leadHeadCode: 'a', classification: 'Surprise', symmetry: 'P' });
    expect(m['Bedford Park Surprise Major']).toMatchObject({ leadHead: '18756243' });
    expect(m['Bedford Park Surprise Major'].leadHeadCode).toBeUndefined();
    expect(m["Richard Harris's Cat Little Surprise Major"]).toMatchObject({ little: true });
  });

  it('ignores preamble and stops cleanly (only real rows survive)', () => {
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => Number.isFinite(e.id))).toBe(true);
  });
});
