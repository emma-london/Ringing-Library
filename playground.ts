// =============================================================================
// Ringing Library — Phase 1 playground
// Paste this into https://www.typescriptlang.org/play and hit Run
// =============================================================================


// ---------------------------------------------------------------------------
// Bell & Stage primitives
// ---------------------------------------------------------------------------

export type Bell = number;
export type Stage = number;

export const Stage = {
  SINGLES:  3,
  MINIMUS:  4,
  DOUBLES:  5,
  MINOR:    6,
  TRIPLES:  7,
  MAJOR:    8,
  CATERS:   9,
  ROYAL:    10,
  CINQUES:  11,
  MAXIMUS:  12,
} as const;

export const BELL_NAMES = '1234567890ET';

export function bellToChar(b: Bell): string {
  const c = BELL_NAMES[b];
  if (c === undefined) throw new RangeError(`Bell index ${b} out of range`);
  return c;
}

export function bellFromChar(c: string): Bell {
  const i = BELL_NAMES.indexOf(c);
  if (i === -1) throw new Error(`Unrecognised bell character: '${c}'`);
  return i;
}


// ---------------------------------------------------------------------------
// Change (declared before Row so Row.apply can reference it)
// ---------------------------------------------------------------------------

export class Change {
  readonly stage: Stage;
  readonly places: ReadonlyArray<Bell>;

  constructor(stage: Stage, places: Bell[]) {
    if (stage <= 0 || !Number.isInteger(stage))
      throw new RangeError(`Stage must be a positive integer, got ${stage}`);
    const sorted = [...places].sort((a, b) => a - b);
    for (const p of sorted) {
      if (!Number.isInteger(p) || p < 0 || p >= stage)
        throw new RangeError(`Place ${p} out of range for stage ${stage}`);
    }
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === sorted[i - 1]) throw new Error(`Duplicate place: ${sorted[i]}`);
    }
    this.stage = stage;
    this.places = Object.freeze(sorted);
  }

  static parse(token: string, stage: Stage): Change {
    const t = token.trim();
    if (t === 'X' || t === 'x' || t === '-') return Change.cross(stage);
    const explicit = [...t].map(c => bellFromChar(c));
    const filled = Change._fillImplicitExternals(stage, new Set(explicit));
    return new Change(stage, [...filled]);
  }

  static cross(stage: Stage): Change {
    if (stage % 2 !== 0) throw new Error(`Cross change requires even stage, got ${stage}`);
    return new Change(stage, []);
  }

  private static _fillImplicitExternals(stage: Stage, places: Set<number>): Set<number> {
    const result = new Set<number>(places);
    const covered = (): boolean => {
      let i = 0;
      while (i < stage) {
        if (result.has(i)) { i++; }
        else if (i + 1 < stage && !result.has(i + 1)) { i += 2; }
        else return false;
      }
      return true;
    };
    if (!result.has(0) && result.has(1)) result.add(0);
    if (!result.has(stage - 1) && !covered()) result.add(stage - 1);
    if (!covered())
      throw new Error(`Invalid places for stage ${stage}`);
    return result;
  }

  apply(row: Row): Row {
    if (row.stage !== this.stage)
      throw new Error(`Stage mismatch: change ${this.stage} vs row ${row.stage}`);
    const result = row.toArray();
    const placeSet = new Set<number>(this.places);
    let i = 0;
    while (i < this.stage) {
      if (placeSet.has(i)) { i++; }
      else { const tmp = result[i]!; result[i] = result[i+1]!; result[i+1] = tmp; i += 2; }
    }
    return new Row(result);
  }

  swaps(): ReadonlyArray<[Bell, Bell]> {
    const placeSet = new Set<number>(this.places);
    const result: [Bell, Bell][] = [];
    let i = 0;
    while (i < this.stage) {
      if (placeSet.has(i)) { i++; }
      else { result.push([i, i + 1]); i += 2; }
    }
    return result;
  }

  toString(): string {
    if (this.places.length === 0) return 'X';
    return this.places.map(p => bellToChar(p)).join('');
  }

  equals(other: Change): boolean {
    if (this.stage !== other.stage || this.places.length !== other.places.length) return false;
    for (let i = 0; i < this.places.length; i++)
      if (this.places[i] !== other.places[i]) return false;
    return true;
  }
}


// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

export class Row {
  readonly stage: Stage;
  private readonly _bells: ReadonlyArray<Bell>;

  constructor(bells: Bell[]) {
    const stage = bells.length;
    if (stage === 0) throw new Error('Row must have at least one bell');
    const seen = new Uint8Array(stage);
    for (const b of bells) {
      if (b < 0 || b >= stage || !Number.isInteger(b))
        throw new RangeError(`Bell ${b} out of range for stage ${stage}`);
      if ((seen[b] ?? 0) > 0) throw new Error(`Bell ${b} appears more than once`);
      seen[b] = 1;
    }
    this.stage = stage;
    this._bells = Object.freeze([...bells]);
  }

  static parse(s: string): Row {
    if (s.length === 0) throw new Error('Cannot parse empty string as Row');
    return new Row([...s].map(c => {
      const i = BELL_NAMES.indexOf(c);
      if (i === -1) throw new Error(`Unrecognised bell character: '${c}'`);
      return i;
    }));
  }

  static rounds(stage: Stage): Row {
    if (stage <= 0 || !Number.isInteger(stage))
      throw new RangeError(`Stage must be a positive integer, got ${stage}`);
    return new Row(Array.from({ length: stage }, (_, i) => i));
  }

  at(i: number): Bell {
    const b = this._bells[i];
    if (b === undefined) throw new RangeError(`Position ${i} out of range for stage ${this.stage}`);
    return b;
  }

  [Symbol.iterator](): Iterator<Bell> {
    return (this._bells as Bell[])[Symbol.iterator]();
  }

  toArray(): Bell[] { return [...this._bells]; }

  toString(): string { return this._bells.map(bellToChar).join(''); }

  compose(other: Row): Row {
    if (this.stage !== other.stage)
      throw new Error(`Stage mismatch: ${this.stage} vs ${other.stage}`);
    const result: Bell[] = new Array(this.stage);
    for (let i = 0; i < this.stage; i++) result[i] = this._bells[other._bells[i]!]!;
    return new Row(result);
  }

  apply(change: Change): Row { return change.apply(this); }

  inverse(): Row {
    const result: Bell[] = new Array(this.stage);
    for (let i = 0; i < this.stage; i++) result[this._bells[i]!] = i;
    return new Row(result);
  }

  sign(): 1 | -1 {
    const visited = new Uint8Array(this.stage);
    let sign = 1;
    for (let i = 0; i < this.stage; i++) {
      if (visited[i]) continue;
      let len = 0, j = i;
      while (!visited[j]) { visited[j] = 1; j = this._bells[j]!; len++; }
      if (len % 2 === 0) sign = -sign;
    }
    return sign as 1 | -1;
  }

  isEvenPermutation(): boolean { return this.sign() === 1; }

  isRounds(): boolean {
    for (let i = 0; i < this.stage; i++) if (this._bells[i] !== i) return false;
    return true;
  }

  equals(other: Row): boolean {
    if (this.stage !== other.stage) return false;
    for (let i = 0; i < this.stage; i++) if (this._bells[i] !== other._bells[i]) return false;
    return true;
  }

  compare(other: Row): number {
    const len = Math.min(this.stage, other.stage);
    for (let i = 0; i < len; i++) {
      const diff = (this._bells[i] ?? 0) - (other._bells[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return this.stage - other.stage;
  }
}


// =============================================================================
// ✏️  Playground — edit freely below this line
// =============================================================================

// --- Bell helpers ---
console.log('Bell 0 is:', bellToChar(0));   // '1' (treble)
console.log('Bell 9 is:', bellToChar(9));   // '0' (ten)

// --- Rows ---
const rounds = Row.rounds(Stage.MAJOR);
console.log('\nRounds on major:', rounds.toString());         // 12345678
console.log('Is rounds?', rounds.isRounds());                // true
console.log('Sign of rounds:', rounds.sign());               // 1 (even)

const r = Row.parse('21436587');
console.log('\nParsed row:', r.toString());
console.log('Is rounds?', r.isRounds());                     // false
console.log('Inverse:', r.inverse().toString());
console.log('r * r.inverse() = rounds?', r.compose(r.inverse()).isRounds()); // true

// --- Changes ---
const cross = Change.cross(8);
console.log('\nCross change:', cross.toString());             // X
console.log('Swaps:', cross.swaps());                        // [[0,1],[2,3],[4,5],[6,7]]

const c14 = Change.parse('14', 8);
console.log('\n14 change:', c14.toString());                  // 14
console.log('Places:', [...c14.places]);                     // [0, 3]
console.log('Swaps:', c14.swaps());

// --- Applying changes ---
console.log('\nApplying changes to rounds:');
let row = Row.rounds(Stage.MAJOR);
console.log('Start:   ', row.toString());                    // 12345678
row = cross.apply(row);
console.log('After X: ', row.toString());                    // 21436587
row = c14.apply(row);
console.log('After 14:', row.toString());                    // 24135678
row = cross.apply(row);
console.log('After X: ', row.toString());
