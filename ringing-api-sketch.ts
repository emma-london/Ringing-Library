/**
 * ringing-api-sketch.ts
 *
 * Proposed public API for a TypeScript change ringing library,
 * modelled on the interface of ringing-lib (C++) but adapted
 * for TypeScript idioms: immutable value types, explicit method
 * calls in place of operator overloading, and factory methods
 * for parsing.
 *
 * This file is a design sketch — method bodies are intentionally
 * absent. The goal is to agree the surface API before implementation.
 */


// ---------------------------------------------------------------------------
// Bell and Stage primitives
// ---------------------------------------------------------------------------

/**
 * A Bell is a 0-based index: 0 = treble, 1 = 2nd, etc.
 * Keeping it as a plain number avoids boxing overhead and
 * makes array indexing natural. Display conversion is handled
 * by the helper functions below.
 */
export type Bell = number;

/**
 * The number of bells in a method or row.
 * Named constants (MINOR, MAJOR, etc.) are provided for readability.
 */
export type Stage = number;

export const Stage = {
  SINGLES:    3,
  MINIMUS:    4,
  DOUBLES:    5,
  MINOR:      6,
  TRIPLES:    7,
  MAJOR:      8,
  CATERS:     9,
  ROYAL:      10,
  CINQUES:    11,
  MAXIMUS:    12,
} as const;

/**
 * The standard bell name characters, in order.
 * Index 0 = '1' (treble), index 9 = '0' (ten), index 10 = 'E', etc.
 */
export const BELL_NAMES = '1234567890ET';

/** Convert a bell index to its display character ('1', '2', ... 'E', 'T'). */
export function bellToChar(b: Bell): string;

/** Parse a bell character to its 0-based index. Throws if unrecognised. */
export function bellFromChar(c: string): Bell;


// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

/**
 * An immutable permutation of `stage` bells, representing a single row
 * in a touch.
 *
 * In C++ this class supports operator* for composition. Here we use
 * explicit methods throughout for clarity.
 *
 * All methods that produce a new Row return a fresh immutable instance.
 */
export class Row {

  readonly stage: Stage;

  // --- Construction ---------------------------------------------------------

  /** Construct from an array of bell indices. Validates length and uniqueness. */
  constructor(bells: Bell[]);

  /** Parse from a string like '214365' or '13572468'. */
  static parse(s: string): Row;

  /** Return the rounds row for a given stage: 0,1,2,...,n-1 */
  static rounds(stage: Stage): Row;

  /** Return queens, tittums, or other named rows if useful later. */

  // --- Access ---------------------------------------------------------------

  /** The bell at position i (0-based). */
  at(i: number): Bell;

  /** Iterate over bells in order. Enables `for...of` and spread. */
  [Symbol.iterator](): Iterator<Bell>;

  /** Return a plain (mutable) copy as an array. */
  toArray(): Bell[];

  /** Display string, e.g. '21436587'. */
  toString(): string;

  // --- Algebraic operations -------------------------------------------------

  /**
   * Compose two rows (equivalent to C++ operator*).
   * (this * other)[i] = this[other[i]]
   * The result is the row you get by applying `other` first, then `this`.
   */
  compose(other: Row): Row;

  /**
   * Apply a Change to this row, producing the next row.
   * Equivalent to C++ row * change.
   */
  apply(change: Change): Row;

  /** The inverse permutation: this.compose(this.inverse()).isRounds() === true */
  inverse(): Row;

  // --- Properties -----------------------------------------------------------

  /** +1 for even permutation, -1 for odd. */
  sign(): 1 | -1;

  isEvenPermutation(): boolean;

  /** True if this row is rounds (the identity permutation). */
  isRounds(): boolean;

  // --- Comparison -----------------------------------------------------------

  equals(other: Row): boolean;

  /**
   * Lexicographic comparison, consistent with C++.
   * Returns negative, zero, or positive.
   */
  compare(other: Row): number;
}


// ---------------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------------

/**
 * A single change — the transformation applied between two consecutive rows.
 * Internally represented as the set of bells making a place (staying put),
 * with all other adjacent pairs swapping.
 *
 * Corresponds directly to a single token of place notation, e.g. 'X', '14', '1238'.
 */
export class Change {

  readonly stage: Stage;

  // --- Construction ---------------------------------------------------------

  /**
   * Construct from a set of 0-based place indices (bells that do NOT move).
   * E.g. for a cross on 8 bells, places = [].
   * For '14' on 8 bells, places = [0, 3].
   */
  constructor(stage: Stage, places: Bell[]);

  /**
   * Parse a single place notation token.
   * Accepts 'X' or '-' for a cross, or place strings like '14', '1238'.
   * Stage is required to validate and fill implicit external places.
   */
  static parse(token: string, stage: Stage): Change;

  /** The cross change (no bells in place) for a given stage. */
  static cross(stage: Stage): Change;

  // --- Access ---------------------------------------------------------------

  /** The bells that are in place (not swapping), as 0-based indices. */
  readonly places: ReadonlyArray<Bell>;

  /**
   * The pairs of adjacent bells that swap.
   * Derived from `places`; provided for convenience.
   */
  swaps(): ReadonlyArray<[Bell, Bell]>;

  // --- Application ----------------------------------------------------------

  /** Apply this change to a row, returning the next row. */
  apply(row: Row): Row;

  // --- Display / comparison -------------------------------------------------

  /**
   * Return the conventional place notation string for this change.
   * Cross changes return 'X'; others return e.g. '14', '1238'.
   */
  toString(): string;

  equals(other: Change): boolean;
}


// ---------------------------------------------------------------------------
// PlaceNotation
// ---------------------------------------------------------------------------

/**
 * A complete place notation string for a method, e.g. '&-1-1-1,2' or
 * 'X.14.X.14.X.14.X.14.X.14.X.16'.
 *
 * Parses both the abbreviated symmetric form (using '&') and the full form.
 * Returns an ordered array of Changes ready for use in a Method.
 */
export class PlaceNotation {

  /**
   * Parse a full place notation string into an array of Changes.
   *
   * Handles:
   *  - '.' as a separator between changes
   *  - 'X' or '-' for cross changes
   *  - '&' prefix for symmetric notation (reflects and appends)
   *  - ',' to separate the main body from a different lead-end change
   *
   * Throws a descriptive error on invalid input.
   */
  static parse(notation: string, stage: Stage): Change[];

  /** Reconstruct a compact place notation string from an array of Changes. */
  static stringify(changes: Change[], symmetric?: boolean): string;
}


// ---------------------------------------------------------------------------
// Method
// ---------------------------------------------------------------------------

/**
 * A named sequence of Changes forming one lead of a method.
 *
 * Immutable: all operations return new values. Access individual changes
 * by index or iterate over them.
 */
export class Method {

  readonly name: string;
  readonly stage: Stage;

  /** The ordered list of changes in one lead. */
  readonly changes: ReadonlyArray<Change>;

  // --- Construction ---------------------------------------------------------

  constructor(changes: Change[], name?: string);

  /**
   * Convenience factory: parse place notation and build a Method.
   * The most common way to construct a method.
   *
   * @example
   * const pb = Method.fromPlaceNotation('&-1-1-1-1-1,2', 8, 'Plain Bob Major');
   */
  static fromPlaceNotation(notation: string, stage: Stage, name?: string): Method;

  // --- Access ---------------------------------------------------------------

  /** Number of changes in one lead. */
  readonly leadLength: number;

  /** The change at position i (0-based). */
  at(i: number): Change;

  /** Iterate over changes in the lead. Enables `for...of`. */
  [Symbol.iterator](): Iterator<Change>;

  // --- Lead structure -------------------------------------------------------

  /**
   * The lead head: the row produced after ringing one complete lead
   * starting from rounds.
   */
  leadHead(): Row;

  /**
   * Generate all rows in one lead, starting from `startRow` (default: rounds).
   *
   * Yields `leadLength + 1` rows, matching the behaviour of C++ `row_block`:
   *   - index 0: the starting row (rounds by default)
   *   - index 1..leadLength: the row produced after each change
   *   - final row: the lead head
   *
   * If you do not want the lead head included (e.g. when proof-checking a
   * multi-lead touch where the lead head is also the first row of the next
   * lead), slice off the last element or use `leadRowsNoLH`.
   */
  leadRows(startRow?: Row): Iterable<Row>;

  /**
   * Like `leadRows`, but omits the final lead head.
   * Yields exactly `leadLength` rows.
   * Mirrors the C++ `row_block::no_final_lead_head` flag.
   */
  leadRowsNoLH(startRow?: Row): Iterable<Row>;

  /**
   * Generate lead-head rows for successive leads, starting from rounds.
   * Useful for checking the lead head order of a method.
   */
  leadHeads(): Iterable<Row>;

  // --- Display --------------------------------------------------------------

  /** Return the place notation string. */
  toString(): string;
}


// ---------------------------------------------------------------------------
// Composition  (the description — immutable, serializable data)
// ---------------------------------------------------------------------------

/**
 * The definition of a single call type, e.g. Bob or Single.
 * A call substitutes one or more changes at a given offset from the lead end.
 */
export interface CallDefinition {
  /** Short name, e.g. 'Bob', 'Single'. */
  name: string;
  /** The replacement changes (usually just the lead-end change). */
  changes: Change[];
  /** Position from the lead end (default 0 = the lead-end change itself). */
  position?: number;
}

/** One entry in the calling: make `call` at the given 0-based `lead`. */
export interface CallingEntry {
  lead: number;
  call: string;
}

/**
 * The immutable, serializable description of a touch: a method rung for a
 * number of leads, with a calling (which call is made at which lead).
 *
 * This is the canonical "touch as data". Per ADR-0002 it is the single value
 * that serves as:
 *   - the job spec handed to an Executor (Local / Worker / Remote),
 *   - the content-addressed cache key (see `key()`),
 *   - the result type emitted by the search engine.
 *
 * A `Composition` is immutable: `withCall` and friends return a new instance.
 * It describes a touch but does not itself produce rows — use `Touch` for that.
 */
export class Composition {

  readonly method: Method;
  readonly startRow: Row;
  /** Number of leads in the touch. */
  readonly length: number;
  /** The available call types. */
  readonly calls: ReadonlyArray<CallDefinition>;
  /** Which call is made at which lead; plain leads are omitted. */
  readonly calling: ReadonlyArray<CallingEntry>;

  // --- Construction ---------------------------------------------------------

  constructor(spec: {
    method: Method;
    length: number;
    calls?: CallDefinition[];
    calling?: CallingEntry[];
    startRow?: Row;            // default: rounds for the method's stage
  });

  /**
   * Ergonomic builder, replacing the old mutable `Touch` workflow.
   * Returns a fresh `Composition` once `build()` is called.
   */
  static builder(method: Method, length: number): CompositionBuilder;

  // --- Immutable updates ----------------------------------------------------

  /** Return a new Composition with `callName` made at `lead`. */
  withCall(lead: number, callName: string): Composition;

  /** Return a new Composition with the call at `lead` removed (made plain). */
  withoutCall(lead: number): Composition;

  // --- Serialisation / identity ---------------------------------------------

  /**
   * A plain-data form suitable for transport and storage. References the
   * method by identity (name + notation + stage), not the full object.
   */
  toJSON(): object;

  /** Reconstruct from `toJSON()` output, resolving the method via a lookup. */
  static fromJSON(json: object, methods: MethodLibrary): Composition;

  /**
   * A canonical, deterministic key for caching and equality. Two compositions
   * that describe the same touch produce the same key (see ADR-0001 caching
   * and ADR-0002 deterministic mode).
   */
  key(): string;

  equals(other: Composition): boolean;
}

/** Mutable builder that yields an immutable `Composition`. */
export interface CompositionBuilder {
  defineCall(name: string, changes: Change[], position?: number): CompositionBuilder;
  call(lead: number, callName: string): CompositionBuilder;
  startFrom(row: Row): CompositionBuilder;
  build(): Composition;
}


// ---------------------------------------------------------------------------
// Touch  (the execution — a read-only view over a Composition)
// ---------------------------------------------------------------------------

/**
 * A touch: the rows produced by ringing a `Composition`.
 *
 * `Touch` is a read-only expansion/view. It holds no mutable state of its own
 * and is constructed from a `Composition` (the description). This is the
 * description-vs-execution split from ADR-0002.
 */
export class Touch {

  readonly composition: Composition;

  constructor(composition: Composition);

  /**
   * Generate all rows in the touch, in order, expanding the composition's
   * method and calling. Starts from `composition.startRow`.
   */
  rows(): Iterable<Row>;

  /** The total number of rows in the touch (leadLength × number of leads). */
  rowCount(): number;

  /** The number of leads (equals `composition.length`). */
  leadCount(): number;
}


// ---------------------------------------------------------------------------
// Prover  (the verifier — the trust boundary)
// ---------------------------------------------------------------------------

/**
 * Truth checker for a touch: tracks which rows have been seen and detects
 * repetitions. This is the cheap, `Row`-based verifier and the trust boundary
 * of ADR-0001 — every result (including any produced by the search engine, a
 * server, or the cache) is re-proved here on the client before it is trusted.
 *
 * Designed for incremental use: feed rows in one at a time as they are
 * generated, allowing early exit on a false touch.
 *
 * Note (ADR-0002): backtracking truth during composition *search* does NOT
 * live here. That is the job of the engine-internal rank/bitset prover
 * (`SearchTruth`), which operates on dense integer ranks, not `Row` objects.
 * `Prover` is purely the verifier, so it has no `remove()`.
 *
 * `maxOccurs` controls how many times a row may appear before the touch is
 * considered false. Default is 1 (standard truth); set to 2 for touches
 * spanning two extents, etc.
 */
export class Prover {

  constructor(maxOccurs?: number);

  /**
   * Add a single row. Returns true if the touch is still true after adding,
   * false if this row has now appeared more than `maxOccurs` times.
   */
  add(row: Row): boolean;

  /** Add multiple rows. Returns false if any row exceeds `maxOccurs`. */
  addAll(rows: Iterable<Row>): boolean;

  /** True if no row has exceeded `maxOccurs`. */
  isTrue(): boolean;

  /** How many times a specific row has been seen. */
  countRow(row: Row): number;

  /**
   * All rows that have exceeded `maxOccurs`, along with the line numbers
   * at which each occurrence was seen. Lets the verifier report *where* a
   * touch is false.
   */
  falseRows(): Array<{ row: Row; lines: number[] }>;

  /** The number of rows that have been added in total. */
  size(): number;

  /** Reset state to check a new touch. */
  reset(): void;
}


// ---------------------------------------------------------------------------
// Library (method lookup)
// ---------------------------------------------------------------------------

/**
 * A searchable collection of named methods.
 *
 * In C++, this wraps file-based XML/MCP method libraries.
 * In TypeScript, we decouple loading from querying: the library
 * is loaded from a plain JSON/array source, and queried by name or
 * properties. This keeps the core library portable (no file I/O),
 * while allowing platform-specific loaders to feed data in.
 */
export class MethodLibrary {

  constructor(entries: MethodLibraryEntry[]);

  /** Look up by exact name (case-insensitive). */
  find(name: string): MethodLibraryEntry | undefined;

  /** Return all entries matching a given stage. */
  byStage(stage: Stage): MethodLibraryEntry[];

  /** Return all entries matching a classification (e.g. 'Surprise', 'Treble Bob'). */
  byClass(classification: MethodClassification): MethodLibraryEntry[];

  /** Iterate over all entries. */
  [Symbol.iterator](): Iterator<MethodLibraryEntry>;
}

export interface MethodLibraryEntry {
  name:           string;
  stage:          Stage;
  notation:       string;           // raw place notation string
  classification: MethodClassification;
  leadHead:       string;           // lead head code, e.g. 'b', 'f'
}

export type MethodClassification =
  | 'Principle'
  | 'Bob'
  | 'Place'
  | 'Treble Bob'
  | 'Surprise'
  | 'Delight'
  | 'Treble Place'
  | 'Alliance'
  | 'Hybrid'
  | 'Differential';
