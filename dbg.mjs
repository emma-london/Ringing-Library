import { Method } from './dist/method.js';
import { LeadHeadEngine } from './dist/engine/index.js';
import { searchTouches } from './dist/search.js';
import { Touch } from './dist/touch.js';
import { STANDARD_METHODS, standardCalls } from './dist/data/standard-methods.js';
const e = STANDARD_METHODS.find(m=>m.name==='Cambridge Surprise Major');
const method = Method.fromPlaceNotation(e.notation, e.stage, e.name);
const calls = standardCalls(method);
const eng = new LeadHeadEngine(method, calls);
const t0=Date.now();
const list = eng.list(7);
console.log('Cambridge list(7):', list.length, 'in', Date.now()-t0,'ms');
for (const t of list) console.log('  ', t.calling, t.changes, t.snap?'snap':'lead-end');
// verify plain course present + true
const pc = list.find(t=>t.calling==='.......');
console.log('plain course found?', !!pc, pc && pc.changes);
if (pc) { const tr=new Touch(pc.composition); console.log('  reproved true?', tr.prove().isTrue, 'comesRound?', tr.comesToRounds()); }
const t1=Date.now();
const rep = searchTouches({ method, calls, maxChanges: 7*32, limit: 100000, maxNodes: 500000000 });
console.log('searchTouches(224):', rep.results.length, 'trunc', rep.truncated, 'in', Date.now()-t1,'ms');
