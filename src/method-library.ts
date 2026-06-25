import { Stage } from './bell.js';
import { Method } from './method.js';

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

export interface MethodLibraryEntry {
  name: string;
  stage: Stage;
  /** Raw place notation string (the form accepted by `PlaceNotation.parse`). */
  notation: string;
  classification: MethodClassification;
  /** Lead head code, e.g. 'b', 'f' (free-form; not interpreted here). */
  leadHead?: string;
}

/**
 * A searchable collection of named methods.
 *
 * Loading is decoupled from querying: the library is constructed from a plain
 * array (which a platform-specific loader can populate from the CCCBR method
 * library or any other source), and queried by name or properties. The core
 * does no file I/O, so it stays portable across environments.
 */
export class MethodLibrary {
  private readonly _entries: MethodLibraryEntry[];
  private readonly _byName: Map<string, MethodLibraryEntry>;

  constructor(entries: MethodLibraryEntry[]) {
    this._entries = [...entries];
    this._byName = new Map();
    for (const e of this._entries) {
      this._byName.set(e.name.toLowerCase(), e);
    }
  }

  /** Look up an entry by exact name (case-insensitive). */
  find(name: string): MethodLibraryEntry | undefined {
    return this._byName.get(name.toLowerCase());
  }

  /** Look up a method by name and build it (case-insensitive). */
  method(name: string): Method | undefined {
    const e = this.find(name);
    if (e === undefined) return undefined;
    return Method.fromPlaceNotation(e.notation, e.stage, e.name);
  }

  /** All entries matching a given stage. */
  byStage(stage: Stage): MethodLibraryEntry[] {
    return this._entries.filter((e) => e.stage === stage);
  }

  /** All entries matching a classification. */
  byClass(classification: MethodClassification): MethodLibraryEntry[] {
    return this._entries.filter((e) => e.classification === classification);
  }

  /** Number of entries. */
  get size(): number {
    return this._entries.length;
  }

  [Symbol.iterator](): Iterator<MethodLibraryEntry> {
    return this._entries[Symbol.iterator]();
  }
}
