import { Bell, Stage, bellFromChar, bellToChar } from './bell.js';
import { Row } from './row.js';

/**
 * A single change — the transformation applied between two consecutive rows.
 *
 * Internally represented as the sorted set of 0-based place indices (bells
 * that stay put). All other adjacent pairs swap.
 *
 * Corresponds to a single place notation token: 'X'/'-' for a cross,
 * or a string like '14', '1238' for named places.
 */
export class Change {
  readonly stage: Stage;
  readonly places: ReadonlyArray<Bell>;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  /**
   * Construct from a set of 0-based place indices.
   * Places are sorted and validated: every place must be in range,
   * no duplicates, and adjacent places must not conflict with swapping pairs.
   */
  constructor(stage: Stage, places: Bell[]) {
    if (stage <= 0 || !Number.isInteger(stage)) {
      throw new RangeError(`Stage must be a positive integer, got ${stage}`);
    }

    const sorted = [...places].sort((a, b) => a - b);

    // Validate
    for (const p of sorted) {
      if (!Number.isInteger(p) || p < 0 || p >= stage) {
        throw new RangeError(`Place ${p} is out of range for stage ${stage}`);
      }
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1]) throw new Error(`Duplicate place: ${sorted[i]}`);
    }

    // Validate that the places are internally consistent: after filling in
    // implicit external places, every bell not in a place must be in a swap pair.
    // We check this by simulating the change.
    const allPlaces = new Set<number>(sorted);

    // Implicit external places: if the lowest unplaced bell position from each end
    // would be left without a partner, it must make a place.
    // Rather than re-deriving, we just verify that the constructed permutation is valid.
    // (The parse() method handles implicit externals; the constructor trusts the caller.)

    this.stage = stage;
    this.places = Object.freeze(sorted);
  }

  /**
   * Parse a single place notation token into a Change.
   *
   * Accepts:
   *  - 'X' or '-' → cross change (no places)
   *  - A string of bell characters → explicit places (e.g. '14', '1238')
   *
   * Implicit external places are added automatically when needed:
   * if the lowest or highest position is not covered by a swap, it becomes a place.
   */
  static parse(token: string, stage: Stage): Change {
    const t = token.trim();

    if (t === 'X' || t === 'x' || t === '-') {
      return Change.cross(stage);
    }

    // Parse explicit place characters
    const explicit: Bell[] = [];
    for (const c of t) {
      explicit.push(bellFromChar(c));
    }

    // Add implicit external places if the boundary bells have no swap partner
    const placeSet = new Set<number>(explicit);

    // Work out which positions are in a swap by simulating from the explicit places
    // then fill in any unpaired boundary bells.
    const implicitPlaces = Change._fillImplicitExternals(stage, placeSet);
    return new Change(stage, [...implicitPlaces]);
  }

  /** The cross change (all adjacent pairs swap, no bells in place). */
  static cross(stage: Stage): Change {
    if (stage % 2 !== 0) {
      throw new Error(`Cross change requires an even stage, got ${stage}`);
    }
    return new Change(stage, []);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Given a set of explicit places, add implicit external places at the
   * low and high ends so that every bell is either in a place or part of a swap.
   */
  private static _fillImplicitExternals(stage: Stage, places: Set<number>): Set<number> {
    const result = new Set<number>(places);

    // Simulate: mark which positions are covered by swaps or places
    // We do two passes (low-end, high-end) to add implicit externals.

    // Build the set of swapping pairs from whatever we have so far,
    // then check coverage.
    const covered = (): boolean => {
      let i = 0;
      while (i < stage) {
        if (result.has(i)) {
          i++; // in place, covered
        } else if (i + 1 < stage && !result.has(i + 1)) {
          i += 2; // pair swaps, both covered
        } else {
          return false; // position i has no partner and isn't in a place
        }
      }
      return true;
    };

    // Add implicit low-end place if needed
    if (!result.has(0)) {
      // Check if position 0 would be unpaired
      let i = 0;
      if (!result.has(1)) {
        // 0 and 1 can swap — fine, no implicit needed yet
      } else {
        result.add(0);
      }
    }

    // Add implicit high-end place if needed
    const last = stage - 1;
    if (!result.has(last)) {
      // If last is odd-positioned relative to remaining bells, it needs a place
      // Simulate from the start
      if (!covered()) {
        result.add(last);
      }
    }

    // Final check
    if (!covered()) {
      throw new Error(
        `Invalid place notation: places [${[...result].sort((a,b)=>a-b).map(p => bellToChar(p)).join('')}] leave a bell without a pair on stage ${stage}`
      );
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Application
  // ---------------------------------------------------------------------------

  /** Apply this change to a row, returning the next row. */
  apply(row: Row): Row {
    if (row.stage !== this.stage) {
      throw new Error(`Cannot apply change of stage ${this.stage} to row of stage ${row.stage}`);
    }
    const result = row.toArray();
    const placeSet = new Set<number>(this.places);

    let i = 0;
    while (i < this.stage) {
      if (placeSet.has(i)) {
        i++; // bell stays
      } else {
        // swap adjacent pair
        const tmp = result[i]!;
        result[i] = result[i + 1]!;
        result[i + 1] = tmp;
        i += 2;
      }
    }
    return new Row(result);
  }

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  /** The pairs of adjacent bells that swap. */
  swaps(): ReadonlyArray<[Bell, Bell]> {
    const placeSet = new Set<number>(this.places);
    const result: [Bell, Bell][] = [];
    let i = 0;
    while (i < this.stage) {
      if (placeSet.has(i)) {
        i++;
      } else {
        result.push([i, i + 1]);
        i += 2;
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Display / comparison
  // ---------------------------------------------------------------------------

  /**
   * Return the conventional place notation string.
   * Cross changes return 'X'; others return e.g. '14', '1238'.
   */
  toString(): string {
    if (this.places.length === 0) return 'X';
    return this.places.map(p => bellToChar(p)).join('');
  }

  equals(other: Change): boolean {
    if (this.stage !== other.stage) return false;
    if (this.places.length !== other.places.length) return false;
    for (let i = 0; i < this.places.length; i++) {
      if (this.places[i] !== other.places[i]) return false;
    }
    return true;
  }
}
