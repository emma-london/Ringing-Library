import { Method } from './dist/method.js';
import { standardCalls, STANDARD_METHODS } from './dist/data/standard-methods.js';
import { searchTouches } from './dist/search.js';
import { Composition } from './dist/composition.js';
import { Touch } from './dist/touch.js';

const e = STANDARD_METHODS.find(m => m.name === 'Plain Bob Doubles');
const method = Method.fromPlaceNotation(e.notation, e.stage, e.name);
const calls = standardCalls(method);
const rep = searchTouches({ method, calls, maxChanges: 120, limit: 5000, maxNodes: 8_000_000 });
const singled120 = rep.results.filter(r => r.calling.includes('s') && r.changes === 120);
console.log('120-change singled extents found by searcher:', singled120.length);
for (const r of singled120) {
  const c = Composition.fromCalling(method, r.calling, { calls });
  const t = new Touch(c);
  const p = t.prove();
  const rows = t.toArray().map(x => x.toString());
  const body = rows.slice(0, rows.length - 1);
  const distinct = new Set(body).size;
  const nS = (r.calling.match(/s/g) || []).length;
  console.log(`calling="${r.calling}" true=${p.isTrue} comesRound=${t.comesToRounds()} singles=${nS} distinct=${distinct} extent120=${distinct===120}`);
}
// Negative control: force the degenerate 12345 single and show it is FALSE
import { Change } from './dist/change.js';
const badCalls = [
  { name:'Bob', symbol:'-', changes:[Change.parse('14',5)] },
  { name:'Single', symbol:'s', changes:[Change.parse('1234',5)] }, // -> 12345 degenerate
];
const bad = Composition.fromCalling(method, singled120[0].calling, { calls: badCalls });
const bt = new Touch(bad);
console.log('\nNEGATIVE (single=12345): comesRound=', bt.comesToRounds(), 'true=', bt.prove().isTrue);
