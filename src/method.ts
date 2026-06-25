import { Stage } from './bell.js';
import { Change } from './change.js';
import { Row } from './row.js';
import { PlaceNotation } from './place-notation.js';

/**
 * A named sequence of Changes forming one lead of a method.
 *
 * Immutable. All row-generation methods return iterables of fresh Row instances.
 */
export class Method {

  readonly name: string;
  readonly stage: Stage;
  readonly changes: ReadonlyArray<Change>;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  constructor(changes: Change[], name = '') {
    if (changes.length === 0) throw new Error('Method must have at least one change');
    const stage = changes[0]!.stage;
    for (const c of changes) {
      if (c.stage !== stage)
        throw new Error(`All changes must have the same stage (expected ${stage}, got ${c.stage})`);
    }
    this.changes = Object.freeze([...changes]);
    this.stage = stage;
    this.name = name;
  }

  /**
   * Convenience factory: parse place notation and build a Method.
   *
   * @example
   * const pb = Method.fromPlaceNotation('&-1-1-1-1-1,2', 8, 'Plain Bob Major');
   */
  static fromPlaceNotation(notation: string, stage: Stage, name = ''): Method {
    const changes = PlaceNotation.parse(notation, stage);
    return new Method(changes, name);
  }

  // ---------------------------------------------------------------------------
  // Access
  // ---------------------------------------------------------------------------

  get leadLength(): number {
    return this.changes.length;
  }

  at(i: number): Change {
    const c = this.changes[i];
    if (c === undefined)
      throw new RangeError(`Change index ${i} out of range (lead length ${this.leadLength})`);
    return c;
  }

  [Symbol.iterator](): Iterator<Change> {
    return (this.changes as Change[])[Symbol.iterator]();
  }

  // ---------------------------------------------------------------------------
  // Lead structure
  // ---------------------------------------------------------------------------

  /**
   * The lead head: the row reached after one complete lead starting from rounds.
   */
  leadHead(): Row {
    return this._computeLeadHead(Row.rounds(this.stage));
  }

  /**
   * Generate all rows in one lead, starting from `startRow` (default: rounds).
   *
   * Yields `leadLength + 1` rows:
   *   index 0              — the starting row
   *   index 1..leadLength  — the row after each change
   *   final row            — the lead head (same as startRow for a plain course)
   */
  *leadRows(startRow?: Row): Iterable<Row> {
    let row = startRow ?? Row.rounds(this.stage);
    yield row;
    for (const change of this.changes) {
      row = change.apply(row);
      yield row;
    }
  }

  /**
   * Like `leadRows`, but omits the final lead head.
   * Yields exactly `leadLength` rows.
   * Use this when proof-checking a multi-lead touch to avoid counting
   * the lead head twice.
   */
  *leadRowsNoLH(startRow?: Row): Iterable<Row> {
    let row = startRow ?? Row.rounds(this.stage);
    yield row;
    for (let i = 0; i < this.changes.length - 1; i++) {
      row = this.changes[i]!.apply(row);
      yield row;
    }
  }

  /**
   * Generate lead-head rows for successive leads, starting from rounds.
   * Terminates when rounds is reached again (or after stage! leads as a safety cap).
   * Useful for inspecting the lead-head order of a method.
   */
  *leadHeads(): Iterable<Row> {
    const maxLeads = factorial(this.stage);
    let row = Row.rounds(this.stage);
    const lh = this.leadHead();

    for (let i = 0; i < maxLeads; i++) {
      row = row.compose(lh);
      yield row;
      if (row.isRounds()) return;
    }
  }

  // ---------------------------------------------------------------------------
  // Display
  // ---------------------------------------------------------------------------

  /** Return the place notation string for this method. */
  toString(): string {
    return (this.name ? `${this.name}: ` : '') +
      PlaceNotation.stringify([...this.changes]);
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  private _computeLeadHead(startRow: Row): Row {
    let row = startRow;
    for (const change of this.changes) row = change.apply(row);
    return row;
  }
}

function factorial(n: number): number {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
