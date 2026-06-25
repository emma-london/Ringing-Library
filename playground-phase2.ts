// =============================================================================
// Ringing Library — Phase 2 playground (PlaceNotation + Method)
// Paste this into https://www.typescriptlang.org/play and hit Run
// Includes all Phase 1 + Phase 2 code inline — no imports needed.
// =============================================================================


// ---------------------------------------------------------------------------
// Bell & Stage
// ---------------------------------------------------------------------------

export type Bell = number;
export type Stage = number;

export const Stage = {
  SINGLES: 3, MINIMUS: 4, DOUBLES: 5, MINOR: 6,
  TRIPLES: 7, MAJOR: 8, CATERS: 9, ROYAL: 10, CINQUES: 11, MAXIMUS: 12,
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
// Change
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
    if (!covered()) throw new Error(`Invalid places for stage ${stage}`);
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
    if (b === undefined) throw new RangeError(`Position ${i} out of range`);
    return b;
  }

  [Symbol.iterator](): Iterator<Bell> { return (this._bells as Bell[])[Symbol.iterator](); }
  toArray(): Bell[] { return [...this._bells]; }
  toString(): string { return this._bells.map(bellToChar).join(''); }

  compose(other: Row): Row {
    if (this.stage !== other.stage) throw new Error(`Stage mismatch`);
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


// ---------------------------------------------------------------------------
// PlaceNotation
//
// Key convention: a comma ALWAYS implies palindromic expansion, whether or
// not '&' is present. 'body,leadEnd' and '&body,leadEnd' are equivalent.
// This matches the standard used by complib, Blueline, and ringing-lib.
// ---------------------------------------------------------------------------

export class PlaceNotation {

  static parse(notation: string, stage: Stage): Change[] {
    const s = notation.trim();
    // Strip optional & — comma already implies palindromic expansion
    const body = s.startsWith('&') ? s.slice(1) : s;
    // Comma or & → palindromic expansion
    if (body.includes(',') || s.startsWith('&')) {
      return PlaceNotation._parseSymmetric(body, stage);
    }
    // No & and no comma → full explicit notation
    return PlaceNotation._tokenize(s, stage);
  }

  static stringify(changes: Change[], symmetric?: boolean): string {
    if (changes.length === 0) return '';
    const useSymmetric = symmetric ?? PlaceNotation._isSymmetric(changes);
    if (useSymmetric && changes.length >= 3) {
      const n = changes.length / 2;
      const body = changes.slice(0, Math.ceil(n));
      const leadEnd = changes[changes.length - 1]!;
      return '&' + PlaceNotation._stringifyBody(body) + ',' + leadEnd.toString();
    }
    return PlaceNotation._stringifyBody(changes);
  }

  private static _parseSymmetric(rest: string, stage: Stage): Change[] {
    const commaIdx = rest.indexOf(',');
    const bodyStr = commaIdx !== -1 ? rest.slice(0, commaIdx) : rest;
    const leadEndStr = commaIdx !== -1 ? rest.slice(commaIdx + 1).trim() : null;
    const body = PlaceNotation._tokenize(bodyStr, stage);
    if (body.length === 0) throw new Error('Empty symmetric place notation body');
    const palindrome = [...body, ...body.slice(0, -1).reverse()];
    if (leadEndStr !== null) palindrome.push(Change.parse(leadEndStr, stage));
    return palindrome;
  }

  private static _tokenize(s: string, stage: Stage): Change[] {
    const changes: Change[] = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i]!;
      if (c === '-' || c === 'x' || c === 'X') {
        changes.push(Change.cross(stage)); i++;
      } else if (c === '.') {
        i++;
      } else {
        let token = '';
        while (i < s.length && s[i] !== '-' && s[i] !== 'x' && s[i] !== 'X' && s[i] !== '.' && s[i] !== ',') {
          token += s[i]!; i++;
        }
        if (token) changes.push(Change.parse(token, stage));
      }
    }
    return changes;
  }

  private static _stringifyBody(changes: Change[]): string {
    return changes.map(c => c.toString()).join('.');
  }

  private static _isSymmetric(changes: Change[]): boolean {
    const n = changes.length;
    if (n < 3) return false;
    const body = changes.slice(0, n - 1);
    for (let i = 0; i < Math.floor(body.length / 2); i++) {
      if (!body[i]!.equals(body[body.length - 1 - i]!)) return false;
    }
    return true;
  }
}


// ---------------------------------------------------------------------------
// Method
// ---------------------------------------------------------------------------

function factorial(n: number): number {
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r;
}

export class Method {
  readonly name: string;
  readonly stage: Stage;
  readonly changes: ReadonlyArray<Change>;

  constructor(changes: Change[], name = '') {
    if (changes.length === 0) throw new Error('Method must have at least one change');
    const stage = changes[0]!.stage;
    for (const c of changes) {
      if (c.stage !== stage) throw new Error(`Stage mismatch in changes`);
    }
    this.changes = Object.freeze([...changes]);
    this.stage = stage;
    this.name = name;
  }

  static fromPlaceNotation(notation: string, stage: Stage, name = ''): Method {
    return new Method(PlaceNotation.parse(notation, stage), name);
  }

  get leadLength(): number { return this.changes.length; }

  at(i: number): Change {
    const c = this.changes[i];
    if (c === undefined) throw new RangeError(`Index ${i} out of range`);
    return c;
  }

  [Symbol.iterator](): Iterator<Change> { return (this.changes as Change[])[Symbol.iterator](); }

  leadHead(): Row {
    let row = Row.rounds(this.stage);
    for (const c of this.changes) row = c.apply(row);
    return row;
  }

  *leadRows(startRow?: Row): Iterable<Row> {
    let row = startRow ?? Row.rounds(this.stage);
    yield row;
    for (const change of this.changes) { row = change.apply(row); yield row; }
  }

  *leadRowsNoLH(startRow?: Row): Iterable<Row> {
    let row = startRow ?? Row.rounds(this.stage);
    yield row;
    for (let i = 0; i < this.changes.length - 1; i++) {
      row = this.changes[i]!.apply(row); yield row;
    }
  }

  *leadHeads(): Iterable<Row> {
    const maxLeads = factorial(this.stage);
    let row = Row.rounds(this.stage);
    const lh = this.leadHead();
    for (let i = 0; i < maxLeads; i++) {
      row = row.compose(lh); yield row;
      if (row.isRounds()) return;
    }
  }

  toString(): string {
    return (this.name ? `${this.name}: ` : '') + PlaceNotation.stringify([...this.changes]);
  }
}


// =============================================================================
// ✏️  Playground — edit freely below this line
// =============================================================================

// ---------------------------------------------------------------------------
// Plain Bob Major — even stage, cross changes, symmetric with &
// ---------------------------------------------------------------------------
console.log('=== Plain Bob Major ===');
const pb = Method.fromPlaceNotation('&-18-18-18-18,12', Stage.MAJOR, 'Plain Bob Major');
console.log(pb.toString());
console.log('Lead length:', pb.leadLength);         // 16
console.log('Lead head:  ', pb.leadHead().toString()); // 13527486

console.log('First lead:');
let i = 0;
for (const row of pb.leadRows()) {
  console.log(`  ${String(i++).padStart(2)}: ${row}`);
}

console.log('Lead heads (7 leads, returns to rounds):');
for (const lh of pb.leadHeads()) console.log(' ', lh.toString());


// ---------------------------------------------------------------------------
// Stedman Triples — odd stage, no cross changes, comma notation without &
// ---------------------------------------------------------------------------
console.log('\n=== Stedman Triples ===');

// Note: '3.1.7.3.1.3,1' uses the comma-implies-palindromic convention.
// The & prefix is optional. Both of these are identical:
//   PlaceNotation.parse('3.1.7.3.1.3,1',  7)
//   PlaceNotation.parse('&3.1.7.3.1.3,1', 7)
const st = Method.fromPlaceNotation('3.1.7.3.1.3,1', Stage.TRIPLES, 'Stedman Triples');
console.log(st.toString());
console.log('Lead length:', st.leadLength);          // 12 (two sixes)
console.log('Lead head:  ', st.leadHead().toString()); // 6347251

// Inspect the changes — no crosses on odd stage
const stChanges = PlaceNotation.parse('3.1.7.3.1.3,1', Stage.TRIPLES);
console.log('Expanded PN:', stChanges.map(c => c.toString()).join('.'));
console.log('Cross changes:', stChanges.filter(c => c.places.length === 0).length); // 0

console.log('\nFirst lead (slow six then quick six):');
i = 0;
for (const row of st.leadRows()) {
  const label = i === 0 ? '← rounds' : i === 6 ? '← six-head' : i === 12 ? '← lead head' : '';
  console.log(`  ${String(i++).padStart(2)}: ${row}  ${label}`);
}

console.log('\nPlain course lead heads (7 leads, returns to rounds):');
i = 1;
for (const lh of st.leadHeads()) console.log(`  Lead ${i++}: ${lh}`);


// ---------------------------------------------------------------------------
// Cambridge Surprise Major — try it yourself
// ---------------------------------------------------------------------------
console.log('\n=== Cambridge Surprise Major ===');
const csm = Method.fromPlaceNotation(
  '&-38-14-1258-36-14-58-16-78,12',
  Stage.MAJOR,
  'Cambridge Surprise Major'
);
console.log('Lead length:', csm.leadLength);           // 32
console.log('Lead head:  ', csm.leadHead().toString()); // 15738264
