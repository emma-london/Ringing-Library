import { Bell, Stage, BELL_NAMES, bellFromChar, bellToChar } from './bell.js';
import type { Change } from './change.js';

/**
 * An immutable permutation of `stage` bells, representing a single row in a touch.
 *
 * All operations that produce a new Row return a fresh immutable instance.
 */
export class Row {
  readonly stage: Stage;
  private readonly _bells: ReadonlyArray<Bell>;

  // ---------------------------------------------------------------------------
  // Construction
  // ---------------------------------------------------------------------------

  constructor(bells: Bell[]) {
    const stage = bells.length;
    if (stage === 0) throw new Error('Row must have at least one bell');

    // Validate: every value 0..stage-1 appears exactly once
    const seen = new Uint8Array(stage);
    for (const b of bells) {
      if (b < 0 || b >= stage || !Number.isInteger(b)) {
        throw new RangeError(`Bell ${b} is out of range for stage ${stage}`);
      }
      if ((seen[b] ?? 0) > 0) {
        throw new Error(`Bell ${b} appears more than once`);
      }
      seen[b] = 1;
    }

    this.stage = stage;
    this._bells = Object.freeze([...bells]);
  }

  /** Parse from a string like '214365' or '13572468'. */
  static parse(s: string): Row {
    if (s.length === 0) throw new Error('Cannot parse empty string as Row');
    const bells = [...s].map(c => {
      const i = BELL_NAMES.indexOf(c);
      if (i === -1) throw new Error(`Unrecognised bell character: '${c}'`);
      return i;
    });
    return new Row(bells);
  }

  /** Return the rounds row for a given stage: 0, 1, 2, …, stage-1 */
  static rounds(stage: Stage): Row {
    if (stage <= 0 || !Number.isInteger(stage)) {
      throw new RangeError(`Stage must be a positive integer, got ${stage}`);
    }
    return new Row(Array.from({ length: stage }, (_, i) => i));
  }

  // ---------------------------------------------------------------------------
  // Access
  // ---------------------------------------------------------------------------

  /** The bell at position i (0-based). */
  at(i: number): Bell {
    const b = this._bells[i];
    if (b === undefined) throw new RangeError(`Position ${i} out of range for stage ${this.stage}`);
    return b;
  }

  [Symbol.iterator](): Iterator<Bell> {
    return (this._bells as Bell[])[Symbol.iterator]();
  }

  toArray(): Bell[] {
    return [...this._bells];
  }

  toString(): string {
    return this._bells.map(bellToChar).join('');
  }

  // ---------------------------------------------------------------------------
  // Algebraic operations
  // ---------------------------------------------------------------------------

  /**
   * Compose two rows: (this ∘ other)[i] = this[other[i]].
   * Equivalent to applying `other` first, then `this`.
   */
  compose(other: Row): Row {
    if (this.stage !== other.stage) {
      throw new Error(`Cannot compose rows of different stages (${this.stage} vs ${other.stage})`);
    }
    const result: Bell[] = new Array(this.stage);
    for (let i = 0; i < this.stage; i++) {
      result[i] = this._bells[other._bells[i]!]!;
    }
    return new Row(result);
  }

  /**
   * Apply a Change to this row, producing the next row.
   * Delegates to Change.apply for a single source of truth.
   */
  apply(change: Change): Row {
    return change.apply(this);
  }

  /** The inverse permutation: this.compose(this.inverse()).isRounds() === true */
  inverse(): Row {
    const result: Bell[] = new Array(this.stage);
    for (let i = 0; i < this.stage; i++) {
      result[this._bells[i]!] = i;
    }
    return new Row(result);
  }

  // ---------------------------------------------------------------------------
  // Properties
  // ---------------------------------------------------------------------------

  /** +1 for an even permutation, -1 for odd. Computed via cycle decomposition. */
  sign(): 1 | -1 {
    const visited = new Uint8Array(this.stage);
    let sign = 1;
    for (let i = 0; i < this.stage; i++) {
      if (visited[i]) continue;
      let cycleLength = 0;
      let j = i;
      while (!visited[j]) {
        visited[j] = 1;
        j = this._bells[j]!;
        cycleLength++;
      }
      // A cycle of length k contributes (k-1) transpositions
      if (cycleLength % 2 === 0) sign = -sign;
    }
    return sign as 1 | -1;
  }

  isEvenPermutation(): boolean {
    return this.sign() === 1;
  }

  /** True if this row is rounds (the identity permutation). */
  isRounds(): boolean {
    for (let i = 0; i < this.stage; i++) {
      if (this._bells[i] !== i) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Comparison
  // ---------------------------------------------------------------------------

  equals(other: Row): boolean {
    if (this.stage !== other.stage) return false;
    for (let i = 0; i < this.stage; i++) {
      if (this._bells[i] !== other._bells[i]) return false;
    }
    return true;
  }

  /**
   * Lexicographic comparison, consistent with C++ ringing-lib.
   * Returns negative if this < other, 0 if equal, positive if this > other.
   */
  compare(other: Row): number {
    const len = Math.min(this.stage, other.stage);
    for (let i = 0; i < len; i++) {
      const diff = (this._bells[i] ?? 0) - (other._bells[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return this.stage - other.stage;
  }
}

// Re-export Bell/Stage so consumers can import from a single place if desired
export { Bell, Stage, bellFromChar, bellToChar, BELL_NAMES };
