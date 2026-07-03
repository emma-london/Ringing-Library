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
  /**
   * The first lead-head **row** (e.g. `'15738264'`), when known. Always
   * derivable from `notation` via `Method.leadHead`, so this is an optional
   * cache — set by the curated `STANDARD_METHODS` and left unset by the bulk
   * CCCBR snapshot (whose Leadhead column is often a code, not a row — see
   * `leadHeadCode`).
   */
  leadHead?: string;
  /**
   * The CCCBR/CompLib method id (the `Id` column; CompLib's `m`-prefixed id
   * without the prefix). Stable and globally unique — the durable key for the
   * standard-set list and for linking to `complib.org/method/{id}`. Present on
   * snapshot entries; unset on the hand-authored `STANDARD_METHODS`.
   */
  id?: number;
  /**
   * The CCCBR **lead-head code** (Framework Appendix C: `a`–`s`, optionally with
   * a trailing digit, e.g. `'b'`, `'j1'`, `'q6'`), when the method's first lead
   * head matches one in the plain course of Plain Bob or Grandsire. Absent when
   * the method has no coded lead head (the CCCBR Leadhead column then holds the
   * full row, captured in `leadHead`). A structural shorthand for lead order /
   * coursing — see `docs/adr/ADR-0015`.
   */
  leadHeadCode?: string;
  /**
   * Method symmetry, using the CCCBR initial letters (`A` asymmetric, `P`
   * palindromic, `D` double, `R` rotational; combinations occur, e.g. `'DPR'`).
   * From the snapshot's `Sym` column.
   */
  symmetry?: string;
  /**
   * `true` for a Little method — the principal hunt bell does not ring in every
   * place. From the snapshot's `Lit` column.
   */
  little?: boolean;
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

  /**
   * All entries sharing a CCCBR lead-head code (e.g. `'b'`, `'j1'`). Methods
   * with the same code share their first lead head, hence lead order / coursing
   * — a useful grouping for calling structure. Case-sensitive (codes are
   * lower-case by convention).
   */
  byLeadHeadCode(code: string): MethodLibraryEntry[] {
    return this._entries.filter((e) => e.leadHeadCode === code);
  }

  /** Number of entries. */
  get size(): number {
    return this._entries.length;
  }

  [Symbol.iterator](): Iterator<MethodLibraryEntry> {
    return this._entries[Symbol.iterator]();
  }
}
