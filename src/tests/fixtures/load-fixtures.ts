import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expect } from 'vitest';

import { Composition } from '../../composition.js';
import { Row } from '../../row.js';
import { Touch } from '../../touch.js';
import { MethodLibrary } from '../../method-library.js';
import { standardCalls, stedmanComposition } from '../../data/standard-methods.js';

/**
 * The declarative truth-fixture corpus (ADR-0008). Every entry is a full
 * composition's known verdict: `{method, calling} -> expected`. Calls are not
 * stored here — they're derived from `standardCalls(method)` (ADR-0009) at
 * execution time, so a fixture is only as much data as it needs to be.
 *
 * Scope: composition verdicts only. Method-level call-structure facts and
 * search-space aggregate facts are deliberately out of scope — see ADR-0008.
 */

/** Which per-family adapter builds a `Composition` from `calling`. */
export type FixtureFamily = 'lead' | 'stedman-six';

export interface Fixture {
  /** Method name, resolved via `MethodLibrary.method(name)`. */
  method: string;
  /** Redundant with the method's own stage — kept for human readability and so the doc generator needs no library import. */
  stage: number;
  family: FixtureFamily;
  /** Calling string in the family's own notation (one char per lead, or per six). */
  calling: string;
  /** Row string; omitted means rounds. Not supported for the 'stedman-six' family. */
  startRow?: string;
  expected: {
    isTrue: boolean;
    changeCount?: number;
    comesToRounds?: boolean;
    isSnapFinish?: boolean;
  };
  source?: string;
  notes?: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_PATH = join(__dirname, 'known-touches.json');

/** Read and validate `known-touches.json`. Throws on malformed fixtures. */
export function loadFixtures(): Fixture[] {
  const raw = readFileSync(FIXTURES_PATH, 'utf-8');
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error(`${FIXTURES_PATH} must contain a JSON array of fixtures`);
  }
  return data.map((entry, i) => validateFixture(entry, i));
}

function validateFixture(entry: unknown, index: number): Fixture {
  if (typeof entry !== 'object' || entry === null) {
    throw new Error(`Fixture ${index}: expected an object`);
  }
  const e = entry as Record<string, unknown>;
  const label = typeof e.method === 'string' ? e.method : `#${index}`;

  if (typeof e.method !== 'string') {
    throw new Error(`Fixture ${index}: 'method' must be a string`);
  }
  if (typeof e.stage !== 'number') {
    throw new Error(`Fixture ${label}: 'stage' must be a number`);
  }
  if (e.family !== 'lead' && e.family !== 'stedman-six') {
    throw new Error(`Fixture ${label}: 'family' must be 'lead' or 'stedman-six', got ${JSON.stringify(e.family)}`);
  }
  if (typeof e.calling !== 'string') {
    throw new Error(`Fixture ${label}: 'calling' must be a string`);
  }
  if (typeof e.expected !== 'object' || e.expected === null) {
    throw new Error(`Fixture ${label}: 'expected' must be an object`);
  }
  const expected = e.expected as Record<string, unknown>;
  if (typeof expected.isTrue !== 'boolean') {
    throw new Error(`Fixture ${label}: 'expected.isTrue' must be a boolean`);
  }

  return {
    method: e.method,
    stage: e.stage,
    family: e.family,
    calling: e.calling,
    ...(typeof e.startRow === 'string' ? { startRow: e.startRow } : {}),
    expected: {
      isTrue: expected.isTrue,
      ...(typeof expected.changeCount === 'number' ? { changeCount: expected.changeCount } : {}),
      ...(typeof expected.comesToRounds === 'boolean' ? { comesToRounds: expected.comesToRounds } : {}),
      ...(typeof expected.isSnapFinish === 'boolean' ? { isSnapFinish: expected.isSnapFinish } : {}),
    },
    ...(typeof e.source === 'string' ? { source: e.source } : {}),
    ...(typeof e.notes === 'string' ? { notes: e.notes } : {}),
  };
}

/** Build the `Touch` a fixture describes, via its family's adapter. */
export function buildTouch(fixture: Fixture, lib: MethodLibrary): Touch {
  const method = lib.method(fixture.method);
  if (method === undefined) {
    throw new Error(`Fixture references unknown method '${fixture.method}' (not in the given MethodLibrary)`);
  }
  if (method.stage !== fixture.stage) {
    throw new Error(
      `Fixture stage mismatch for '${fixture.method}': fixture says ${fixture.stage}, library says ${method.stage}`,
    );
  }

  if (fixture.family === 'stedman-six') {
    if (fixture.startRow !== undefined) {
      throw new Error(`Fixture '${fixture.method}': 'startRow' is not supported for the 'stedman-six' family`);
    }
    return new Touch(stedmanComposition(fixture.calling, method));
  }

  // family === 'lead'
  const calls = standardCalls(method);
  const startRow = fixture.startRow !== undefined ? Row.parse(fixture.startRow) : undefined;
  return new Touch(
    Composition.fromCalling(method, fixture.calling, {
      calls,
      ...(startRow ? { startRow } : {}),
    }),
  );
}

/** Prove a fixture's `Touch` and assert it matches the fixture's expected verdict. */
export function assertFixture(fixture: Fixture, touch: Touch): void {
  const label = `${fixture.method} '${fixture.calling}'${fixture.notes ? ` (${fixture.notes})` : ''}`;
  const proof = touch.prove();

  expect(proof.isTrue, label).toBe(fixture.expected.isTrue);

  if (fixture.expected.isTrue) {
    expect(touch.comesToRounds(), label).toBe(fixture.expected.comesToRounds ?? true);
    if (fixture.expected.changeCount !== undefined) {
      expect(touch.changeCount(), label).toBe(fixture.expected.changeCount);
    }
    if (fixture.expected.isSnapFinish !== undefined) {
      expect(touch.isSnapFinish(), label).toBe(fixture.expected.isSnapFinish);
    }
  } else {
    expect(proof.falseRows.length, label).toBeGreaterThan(0);
  }
}
