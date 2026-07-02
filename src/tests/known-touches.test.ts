import { describe, it, expect } from 'vitest';
import { MethodLibrary } from '../method-library.js';
import { STANDARD_METHODS } from '../data/standard-methods.js';
import { loadFixtures, buildTouch, assertFixture } from './fixtures/load-fixtures.js';

// ---------------------------------------------------------------------------
// The truth-fixture corpus (ADR-0008) — src/tests/fixtures/known-touches.json
//
// Supersedes the oracles formerly scattered across example-touches.test.ts
// (Grandsire/Plain Bob) and stedman-calls.test.ts's "truth oracles" block
// (Stedman) — those facts now live as data, read once here. This file also
// doubles as the source docs/example-touches.md is generated from
// (scripts/generate-example-touches.mjs).
// ---------------------------------------------------------------------------

const lib = new MethodLibrary(STANDARD_METHODS);
const fixtures = loadFixtures();

describe('known-touches corpus', () => {
  it('loads a non-empty set of fixtures', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  it.each(fixtures.map((f) => [`${f.method} '${f.calling}' (${f.notes ?? 'no notes'})`, f] as const))(
    '%s',
    (_label, fixture) => {
      const touch = buildTouch(fixture, lib);
      assertFixture(fixture, touch);
    },
  );
});

describe('known-touches corpus — loader validation', () => {
  it('rejects a fixture referencing an unknown method', () => {
    expect(() =>
      buildTouch(
        {
          method: 'Not A Real Method',
          stage: 8,
          family: 'lead',
          calling: '.',
          expected: { isTrue: true },
        },
        lib,
      ),
    ).toThrow(/unknown method/);
  });

  it('rejects a fixture whose stage disagrees with the library', () => {
    expect(() =>
      buildTouch(
        {
          method: 'Plain Bob Major',
          stage: 6, // wrong — Plain Bob Major is stage 8
          family: 'lead',
          calling: '.',
          expected: { isTrue: true },
        },
        lib,
      ),
    ).toThrow(/stage mismatch/);
  });

  it('rejects startRow on a stedman-six fixture', () => {
    expect(() =>
      buildTouch(
        {
          method: 'Stedman Triples',
          stage: 7,
          family: 'stedman-six',
          calling: '.',
          startRow: '1234567',
          expected: { isTrue: true },
        },
        lib,
      ),
    ).toThrow(/not supported/);
  });
});
