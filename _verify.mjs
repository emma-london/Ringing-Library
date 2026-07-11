import { Change } from './dist/change.js';
import { Method } from './dist/method.js';
import { Row } from './dist/row.js';

function show(nota, stage) {
  const c = Change.parse(nota, stage);
  return c.toString();
}
console.log("PBDoubles plain LE '125' ->", show('125',5));
console.log("bob '14' on 5 ->", show('14',5));
console.log("single '1234' on 5 ->", show('1234',5), " (12345 = all places, degenerate)");
console.log("single '123' on 5 ->", show('123',5));
console.log("single '345' on 5 ->", show('345',5));

// apply single 123 to a row to confirm it swaps 4&5
const r = Row.rounds(5);
console.log("rounds:", r.toString());
console.log("apply 12345:", r.apply(Change.parse('1234',5)).toString());
console.log("apply 123 :", r.apply(Change.parse('123',5)).toString());
