# ringing-lib-ts

[![npm version](https://img.shields.io/npm/v/ringing-lib-ts.svg)](https://www.npmjs.com/package/ringing-lib-ts)
[![license: MIT](https://img.shields.io/npm/l/ringing-lib-ts.svg)](./LICENSE)

A TypeScript library for **change ringing** — the English art of ringing tower
and hand bells in mathematical sequences. It models the domain from first
principles (bells, rows, changes, methods, compositions) and, above all, tells
you the **truth** about a touch: whether every row is unique and it comes round.

The design is modelled on the C++ [ringing-lib](https://github.com/ringing-lib/ringing-lib),
adapted to TypeScript idioms: immutable value types, explicit methods in place of
operator overloading, and factory methods for parsing.

**Live demo:** an interactive test bench (compose & prove, search, method
explorer, row playground) is deployed at
**<https://emma-london.github.io/Ringing-Library/>**.

## Why this library

- **Truth is the headline.** Whether a touch is true (all rows distinct) and
  comes round is computed identically on every platform, and is tested with
  positive *and* negative cases seeded from real, cited compositions.
- **Pure, immutable, zero-I/O core.** `Row`, `Change`, `Method`, `Composition`,
  `Touch`, and `Proof` are immutable value types; operations return new values.
  The core makes no file or network calls, so it runs anywhere — Node, browser,
  a phone.
- **No runtime dependencies.** Just TypeScript, strict, ESM.
- **Real methods, real place notation.** Full place-notation parsing
  (`&` symmetry, `-`/`X` cross, `.` separators, `,` lead-end), the CCCBR bell
  alphabet up to 33 bells, and the special cases that stress the model
  (Grandsire, Stedman's six-based calling).

## Install

```bash
npm install ringing-lib-ts
```

Requires an ESM environment (Node 20+ or a bundler). The published surface is
exactly what `ringing-lib-ts` exports — see [API](#api-surface) below.

## Quick start

Compose a touch of Grandsire Triples and prove it:

```ts
import { Method, Composition, Touch, standardCalls, Stage } from 'ringing-lib-ts';

// Grandsire Triples, written as one lead of place notation.
const grandsire = Method.fromPlaceNotation(
  '3.1.7.1.7.1.7.1.7.1.7.1.7.1', Stage.TRIPLES, 'Grandsire Triples',
);

// Standard calls for the method: bob `3.1`, single `3.123`.
const calls = standardCalls(grandsire);

// A calling — one character per lead: '.' plain, 's' single, '-' bob.
// This is the classic SPSPSBP touch.
const touch = new Touch(Composition.fromCalling(grandsire, 's.s.s-.', { calls }));

const proof = touch.prove();
console.log(proof.isTrue);          // true
console.log(touch.changeCount());   // 97
console.log(touch.isSnapFinish());  // true  (comes round one change before a lead end)
```

If a touch is false, the proof tells you exactly where:

```ts
const proof = touch.prove();
if (!proof.isTrue) {
  for (const clash of proof.falseRows) {
    console.log(clash); // the repeated row and the line numbers where it occurs
  }
}
```

## Core concepts

| Concept | What it represents |
|---|---|
| `Bell` | A 0-based bell index (`0` = treble). A plain `number`, to avoid boxing. |
| `Stage` | The number of bells; named constants (`Stage.MAJOR` = 8, `Stage.TRIPLES` = 7, …). |
| `Row` | An immutable permutation of bells — one moment in a touch. |
| `Change` | A single place-notation token (`X`, `14`, `1238`) — the step between two rows. |
| `PlaceNotation` | Parser/serialiser for a full place-notation string. |
| `Method` | A named sequence of changes forming one lead. |
| `Composition` | An immutable, serializable description of a touch (method, start, calls, length). |
| `Touch` | A read-only expansion of a `Composition` into its rows. |
| `Prover` / `Proof` | The truth-checker and its immutable result (`isTrue` + `falseRows`). |
| `MethodLibrary` | A searchable collection of methods, loaded from a plain array. |

## Examples

### Rows and changes

```ts
import { Row, Change, Stage } from 'ringing-lib-ts';

const rounds = Row.rounds(Stage.MAJOR);            // 12345678
const crossed = rounds.apply(Change.parse('-', Stage.MAJOR));
console.log(crossed.toString());                   // 21436587
console.log(crossed.isRounds());                   // false
console.log(Row.parse('13527486').isEvenPermutation()); // true
```

### Methods and place notation

```ts
import { Method, Stage } from 'ringing-lib-ts';

const cambridge = Method.fromPlaceNotation(
  '&-38-14-1258-36-14-58-16-78,12', Stage.MAJOR, 'Cambridge Surprise Major',
);

console.log(cambridge.leadHead().toString()); // 15738264
console.log(cambridge.leadLength);            // 32

// The plain course, lead head by lead head:
for (const lh of cambridge.leadHeads()) console.log(lh.toString());

// Every row of the first lead (the "blue line" data):
for (const row of cambridge.leadRows()) console.log(row.toString());
```

### Searching for true touches

`searchTouches` is a bounded, shortest-first enumerator of true come-round
touches — handy for "give me true compositions up to N changes". Every result
is independently re-provable with `Touch.prove()`.

```ts
import { Method, standardCalls, searchTouches, Stage } from 'ringing-lib-ts';

const grandsire = Method.fromPlaceNotation(
  '3.1.7.1.7.1.7.1.7.1.7.1.7.1', Stage.TRIPLES, 'Grandsire Triples',
);

const report = searchTouches({
  method: grandsire,
  calls: standardCalls(grandsire),
  maxChanges: 140,
  limit: 5,
});

for (const r of report.results) {
  console.log(`${r.changes} changes  ${r.calling}${r.snap ? '  (snap)' : ''}`);
}
```

Stedman's six-based calling has its own sibling, `searchStedmanTouches`.

### The method library

The package ships `STANDARD_METHODS` — a small, hand-verified set covering the
common methods — ready to drop into a `MethodLibrary`:

```ts
import { MethodLibrary, STANDARD_METHODS, Stage } from 'ringing-lib-ts';

const lib = new MethodLibrary(STANDARD_METHODS);

const cambridge = lib.method('Cambridge Surprise Major'); // Method | undefined
const major = lib.byStage(Stage.MAJOR).map((e) => e.name);
```

For the **full CCCBR library** (25,000+ methods), a `MethodLibrary` takes any
array of entries, so an app can construct one from a bundled CCCBR snapshot.
Contributors generate that snapshot with `npm run data:refresh` (it is not
shipped in the npm package — it is application data, not core code). Entries
carry the CCCBR lead-head code, so methods sharing a lead head can be grouped:

```ts
lib.byLeadHeadCode('b'); // methods whose first lead head is Plain Bob code 'b'
```

## API surface

The public API is **exactly** the set of exports from the package entry point.
It follows [Semantic Versioning](https://semver.org/): breaking changes require
a MAJOR bump. `Composition`'s serialized JSON is versioned independently via a
`schemaVersion` field, so persisted or shared compositions stay compatible
across releases. See [`CHANGELOG.md`](./CHANGELOG.md) for the release history.

## Project status

`1.0.0` — the truth-first core, a validated composition engine, and the CCCBR
method database are all complete and tested (275 tests). Execution plumbing
(worker/remote executors, budgets, streaming search) is the next phase.

The design decisions behind the library, with their rationale, are recorded as
Architecture Decision Records in [`docs/adr/`](./docs/adr/). Start with
[`context.md`](./context.md) for a load-first overview of the domain, the
current state, and the roadmap.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). In short: read `context.md` first,
keep the core pure and immutable, and back every truth-bearing change with
positive and negative tests from cited examples.

```bash
npm install
npm test          # the full vitest suite
npm run build     # tsc, strict, ESM
npm run app:dev   # the interactive test bench (Vite)
```

## License

[MIT](./LICENSE) © Emma Bruce
