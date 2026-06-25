import { Stage } from './bell.js';
import { Change } from './change.js';
import { Row } from './row.js';
import { Method } from './method.js';
import { PlaceNotation } from './place-notation.js';

/**
 * The definition of one call type, e.g. Bob or Single.
 *
 * A call substitutes a short run of changes at the end of a lead. Its
 * `changes` replace the *last* `changes.length` changes of the plain lead
 * (when `position` is 0). For example, a Grandsire bob is `3.1` replacing the
 * plain `7.1`; a Plain Bob Major bob is `14` replacing the plain `12`.
 *
 * `position` shifts the substitution earlier: the replacement's final change is
 * aligned at index `leadLength - 1 - position`. The default (0) means the
 * replacement ends exactly at the lead-end change. This covers every standard
 * call; `position` is provided for the rare cases that need it.
 */
export interface CallDefinition {
  /** Display name, e.g. 'Bob', 'Single'. */
  name: string;
  /** Single-character notation symbol, e.g. '-' (bob), 's' (single). */
  symbol: string;
  /** The replacement changes for the tail of the lead. */
  changes: Change[];
  /** Offset of the substitution's end from the lead end (default 0). */
  position?: number;
}

/** One entry in the calling: make `call` at the given 0-based `lead`. */
export interface CallingEntry {
  /** 0-based lead index. */
  lead: number;
  /** The call symbol made at this lead (e.g. '-', 's'). */
  call: string;
}

/**
 * Plain-data form of a `Composition` for transport and storage.
 * References the method by identity (name + notation + stage).
 */
export interface CompositionJSON {
  method: { name: string; notation: string; stage: Stage };
  startRow: string;
  length: number;
  calls: Array<{ name: string; symbol: string; notation: string; position?: number }>;
  calling: CallingEntry[];
}

/**
 * The immutable, serializable description of a touch: a method rung for a
 * number of leads, with a calling (which call is made at which lead).
 *
 * Per ADR-0002 / ADR-0005 a `Composition` is exactly
 * `(method reference, start row, ordered calls, target length)` — the bare
 * calling, no metadata. Its content hash is its identity. It is the single
 * value that serves as the job spec, the content-addressed cache key, and the
 * search engine's result type.
 *
 * A `Composition` does not itself produce rows — use `Touch` for that.
 */
export class Composition {
  readonly method: Method;
  readonly startRow: Row;
  /** Number of leads in the touch. */
  readonly length: number;
  /** The available call types, indexed for lookup by symbol. */
  readonly calls: ReadonlyArray<CallDefinition>;
  /** Which call is made at which lead; plain leads are omitted. Sorted by lead. */
  readonly calling: ReadonlyArray<CallingEntry>;

  private readonly _callBySymbol: Map<string, CallDefinition>;
  private readonly _callByLead: Map<number, CallDefinition>;

  constructor(spec: {
    method: Method;
    length: number;
    calls?: CallDefinition[];
    calling?: CallingEntry[];
    startRow?: Row;
  }) {
    if (!Number.isInteger(spec.length) || spec.length < 0) {
      throw new RangeError(`length must be a non-negative integer, got ${spec.length}`);
    }
    this.method = spec.method;
    this.length = spec.length;
    this.startRow = spec.startRow ?? Row.rounds(spec.method.stage);
    if (this.startRow.stage !== spec.method.stage) {
      throw new Error(
        `Start row stage (${this.startRow.stage}) does not match method stage (${spec.method.stage})`,
      );
    }

    this.calls = Object.freeze([...(spec.calls ?? [])]);
    this._callBySymbol = new Map();
    for (const c of this.calls) {
      this._callBySymbol.set(c.symbol.toLowerCase(), c);
    }

    const calling = [...(spec.calling ?? [])].sort((a, b) => a.lead - b.lead);
    this._callByLead = new Map();
    for (const entry of calling) {
      if (entry.lead < 0 || entry.lead >= spec.length) {
        throw new RangeError(
          `Calling entry lead ${entry.lead} is out of range [0, ${spec.length})`,
        );
      }
      const call = this._callBySymbol.get(entry.call.toLowerCase());
      if (call === undefined) {
        throw new Error(`Calling references unknown call symbol '${entry.call}'`);
      }
      this._callByLead.set(entry.lead, call);
    }
    this.calling = Object.freeze(calling);
  }

  /** The call made at a given lead, or undefined for a plain lead. */
  callAt(lead: number): CallDefinition | undefined {
    return this._callByLead.get(lead);
  }

  /** Look up a defined call by its symbol (case-insensitive). */
  callBySymbol(symbol: string): CallDefinition | undefined {
    return this._callBySymbol.get(symbol.toLowerCase());
  }

  // ---------------------------------------------------------------------------
  // Construction helpers
  // ---------------------------------------------------------------------------

  /**
   * Build a `Composition` from a calling string: one character per lead, read
   * left to right. `.` is a plain lead; every other character is matched to a
   * defined call by symbol (case-insensitively). The number of characters is
   * the number of leads.
   *
   * @example
   * Composition.fromCalling(grandsire, 's.s.s-.', { calls });  // SPSPSBP
   */
  static fromCalling(
    method: Method,
    callingStr: string,
    opts: { calls: CallDefinition[]; startRow?: Row; plainSymbol?: string } = { calls: [] },
  ): Composition {
    const plain = opts.plainSymbol ?? '.';
    const chars = [...callingStr.trim()];
    const calling: CallingEntry[] = [];
    chars.forEach((c, lead) => {
      if (c === plain) return;
      calling.push({ lead, call: c });
    });
    return new Composition({
      method,
      length: chars.length,
      calls: opts.calls,
      calling,
      ...(opts.startRow ? { startRow: opts.startRow } : {}),
    });
  }

  /** Ergonomic builder yielding an immutable `Composition`. */
  static builder(method: Method, length: number): CompositionBuilder {
    return new CompositionBuilder(method, length);
  }

  // ---------------------------------------------------------------------------
  // Immutable updates
  // ---------------------------------------------------------------------------

  /** Return a new Composition with `callSymbol` made at `lead`. */
  withCall(lead: number, callSymbol: string): Composition {
    const calling = this.calling.filter((e) => e.lead !== lead);
    calling.push({ lead, call: callSymbol });
    return new Composition({
      method: this.method,
      length: this.length,
      calls: [...this.calls],
      calling,
      startRow: this.startRow,
    });
  }

  /** Return a new Composition with the call at `lead` removed (made plain). */
  withoutCall(lead: number): Composition {
    return new Composition({
      method: this.method,
      length: this.length,
      calls: [...this.calls],
      calling: this.calling.filter((e) => e.lead !== lead),
      startRow: this.startRow,
    });
  }

  // ---------------------------------------------------------------------------
  // Serialisation / identity
  // ---------------------------------------------------------------------------

  toJSON(): CompositionJSON {
    return {
      method: {
        name: this.method.name,
        notation: PlaceNotation.stringify([...this.method.changes]),
        stage: this.method.stage,
      },
      startRow: this.startRow.toString(),
      length: this.length,
      calls: this.calls.map((c) => ({
        name: c.name,
        symbol: c.symbol,
        notation: PlaceNotation.stringify(c.changes, false),
        ...(c.position ? { position: c.position } : {}),
      })),
      calling: this.calling.map((e) => ({ lead: e.lead, call: e.call })),
    };
  }

  /** Reconstruct from `toJSON()` output. Rebuilds the method from its notation. */
  static fromJSON(json: CompositionJSON): Composition {
    const method = Method.fromPlaceNotation(json.method.notation, json.method.stage, json.method.name);
    const calls: CallDefinition[] = json.calls.map((c) => ({
      name: c.name,
      symbol: c.symbol,
      changes: PlaceNotation.parse(c.notation, json.method.stage),
      ...(c.position ? { position: c.position } : {}),
    }));
    return new Composition({
      method,
      length: json.length,
      calls,
      calling: json.calling,
      startRow: Row.parse(json.startRow),
    });
  }

  /**
   * A canonical, deterministic descriptor string. Two compositions that
   * describe the same touch produce the same key. Identity is the bare calling
   * — method, start, calls actually made, and length — and nothing else
   * (ADR-0005).
   */
  key(): string {
    const methodId = `${this.method.stage}:${PlaceNotation.stringify([...this.method.changes], false)}`;
    // Only calls actually used affect the touch; include their definitions so
    // two callings that mean different things never collide.
    const usedSymbols = new Set(this.calling.map((e) => e.call.toLowerCase()));
    const callDefs = this.calls
      .filter((c) => usedSymbols.has(c.symbol.toLowerCase()))
      .map((c) => `${c.symbol.toLowerCase()}=${PlaceNotation.stringify(c.changes, false)}@${c.position ?? 0}`)
      .sort()
      .join('|');
    const callingStr = this.calling
      .map((e) => `${e.lead}${e.call.toLowerCase()}`)
      .join(',');
    return [
      `m=${methodId}`,
      `s=${this.startRow.toString()}`,
      `n=${this.length}`,
      `c=${callDefs}`,
      `k=${callingStr}`,
    ].join(';');
  }

  /** A short content hash (FNV-1a, 32-bit) of `key()` — pure, portable. */
  hash(): string {
    return fnv1a(this.key());
  }

  equals(other: Composition): boolean {
    return this.key() === other.key();
  }
}

/** Mutable builder that yields an immutable `Composition`. */
export class CompositionBuilder {
  private readonly _method: Method;
  private readonly _length: number;
  private readonly _calls: CallDefinition[] = [];
  private readonly _calling: CallingEntry[] = [];
  private _startRow?: Row;

  constructor(method: Method, length: number) {
    this._method = method;
    this._length = length;
  }

  defineCall(name: string, symbol: string, changes: Change[], position?: number): this {
    this._calls.push({ name, symbol, changes, ...(position ? { position } : {}) });
    return this;
  }

  call(lead: number, callSymbol: string): this {
    this._calling.push({ lead, call: callSymbol });
    return this;
  }

  startFrom(row: Row): this {
    this._startRow = row;
    return this;
  }

  build(): Composition {
    return new Composition({
      method: this._method,
      length: this._length,
      calls: this._calls,
      calling: this._calling,
      ...(this._startRow ? { startRow: this._startRow } : {}),
    });
  }
}

/** FNV-1a 32-bit hash, returned as 8 hex chars. Deterministic and pure. */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // h *= 16777619, kept in 32-bit range via Math.imul
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
