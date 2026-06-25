import { Row } from './row.js';
import { Stage } from './bell.js';

/**
 * A single false row: a row that occurred more times than allowed, together
 * with the 1-based line numbers at which each occurrence was seen.
 */
export interface FalseRow {
  /** The repeated row. */
  row: Row;
  /** 1-based line numbers (positions in the proven sequence) where it occurred. */
  lines: number[];
}

/**
 * The immutable result of proving a touch (ADR-0005).
 *
 * `Proof` is the serializable truth *fact*: it stands alone (carries stage and
 * the number of rows proven) so it can be cached, stored in the corpus, and
 * transported without the originating `Prover`. Truth depends only on the rows,
 * never on who composed the touch — so a `Proof` is the eternal fact ADR-0001
 * wants the cache to hold.
 */
export class Proof {
  /** True if no row exceeded the allowed number of occurrences. */
  readonly isTrue: boolean;
  /** Every row that occurred too many times, with the lines where it appeared. */
  readonly falseRows: ReadonlyArray<FalseRow>;
  /** The stage of the proven rows (0 if nothing was proven). */
  readonly stage: Stage;
  /** How many rows were proven in total. */
  readonly rowCount: number;
  /** The occurrence threshold used (1 = standard truth). */
  readonly maxOccurs: number;

  constructor(spec: {
    isTrue: boolean;
    falseRows: FalseRow[];
    stage: Stage;
    rowCount: number;
    maxOccurs: number;
  }) {
    this.isTrue = spec.isTrue;
    this.falseRows = Object.freeze(
      spec.falseRows.map((f) => Object.freeze({ row: f.row, lines: Object.freeze([...f.lines]) as number[] })),
    );
    this.stage = spec.stage;
    this.rowCount = spec.rowCount;
    this.maxOccurs = spec.maxOccurs;
    Object.freeze(this);
  }

  /** A plain-data form suitable for transport and storage. Rows render as strings. */
  toJSON(): object {
    return {
      isTrue: this.isTrue,
      stage: this.stage,
      rowCount: this.rowCount,
      maxOccurs: this.maxOccurs,
      falseRows: this.falseRows.map((f) => ({ row: f.row.toString(), lines: [...f.lines] })),
    };
  }

  /** Human-readable summary, e.g. `TRUE (70 rows)` or `FALSE: 12345 at lines 1, 71`. */
  toString(): string {
    if (this.isTrue) return `TRUE (${this.rowCount} rows)`;
    const detail = this.falseRows
      .map((f) => `${f.row.toString()} at lines ${f.lines.join(', ')}`)
      .join('; ');
    return `FALSE (${this.rowCount} rows): ${detail}`;
  }
}

/**
 * The cheap, `Row`-based truth verifier and trust boundary of ADR-0001: every
 * result — including anything produced by the search engine, a server, or the
 * cache — is re-proved here on the client before it is trusted.
 *
 * Designed for incremental use: feed rows in one at a time as they are
 * generated, allowing early exit on a false touch.
 *
 * Per ADR-0002 the `Prover` is *only* the verifier. Backtracking truth during
 * composition *search* lives in the engine-internal rank/bitset prover
 * (`SearchTruth`), which operates on dense integer ranks, not `Row` objects.
 * `Prover` therefore has no `remove()`.
 *
 * `maxOccurs` controls how many times a row may appear before the touch is
 * considered false. Default is 1 (standard truth); set to 2 for touches
 * spanning two extents, etc.
 */
export class Prover {
  private readonly _maxOccurs: number;
  /** Row string → list of 1-based line numbers where it has been seen. */
  private _seen = new Map<string, number[]>();
  private _stage = 0;
  private _count = 0;

  constructor(maxOccurs = 1) {
    if (!Number.isInteger(maxOccurs) || maxOccurs < 1) {
      throw new RangeError(`maxOccurs must be a positive integer, got ${maxOccurs}`);
    }
    this._maxOccurs = maxOccurs;
  }

  /** The occurrence threshold in use. */
  get maxOccurs(): number {
    return this._maxOccurs;
  }

  /**
   * Add a single row. Returns true if the touch is still true after adding,
   * false if this row has now appeared more than `maxOccurs` times.
   */
  add(row: Row): boolean {
    if (this._count === 0) {
      this._stage = row.stage;
    } else if (row.stage !== this._stage) {
      throw new Error(
        `Cannot prove rows of mixed stages (${this._stage} vs ${row.stage})`,
      );
    }
    this._count++;
    const key = row.toString();
    const lines = this._seen.get(key);
    if (lines === undefined) {
      this._seen.set(key, [this._count]);
      return true;
    }
    lines.push(this._count);
    return lines.length <= this._maxOccurs;
  }

  /** Add multiple rows. Returns false if any row exceeds `maxOccurs`. */
  addAll(rows: Iterable<Row>): boolean {
    let ok = true;
    for (const row of rows) {
      // Always add every row so falseRows reports every occurrence; never short-circuit.
      if (!this.add(row)) ok = false;
    }
    return ok;
  }

  /** True if no row has exceeded `maxOccurs`. */
  isTrue(): boolean {
    for (const lines of this._seen.values()) {
      if (lines.length > this._maxOccurs) return false;
    }
    return true;
  }

  /** How many times a specific row has been seen. */
  countRow(row: Row): number {
    return this._seen.get(row.toString())?.length ?? 0;
  }

  /**
   * All rows that have exceeded `maxOccurs`, with the 1-based line numbers at
   * which each occurrence was seen. Lets the verifier report *where* a touch
   * is false. Ordered by first occurrence.
   */
  falseRows(): FalseRow[] {
    const out: FalseRow[] = [];
    for (const [key, lines] of this._seen) {
      if (lines.length > this._maxOccurs) {
        out.push({ row: Row.parse(key), lines: [...lines] });
      }
    }
    out.sort((a, b) => (a.lines[0] ?? 0) - (b.lines[0] ?? 0));
    return out;
  }

  /** The number of rows added in total. */
  size(): number {
    return this._count;
  }

  /** Snapshot the current state as an immutable `Proof` value (ADR-0005). */
  proof(): Proof {
    return new Proof({
      isTrue: this.isTrue(),
      falseRows: this.falseRows(),
      stage: this._stage,
      rowCount: this._count,
      maxOccurs: this._maxOccurs,
    });
  }

  /** Reset state to check a new touch. */
  reset(): void {
    this._seen = new Map<string, number[]>();
    this._stage = 0;
    this._count = 0;
  }
}
