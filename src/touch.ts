import { Change } from './change.js';
import { Row } from './row.js';
import { Composition } from './composition.js';
import { Prover, Proof } from './prover.js';

/**
 * A touch: the rows produced by ringing a `Composition` (ADR-0002).
 *
 * `Touch` is a read-only expansion/view. It holds no mutable state of its own
 * and is constructed from a `Composition` (the description). This is the
 * description-vs-execution split: the `Composition` is the data, the `Touch`
 * is the rung result.
 *
 * ## Come-round and snap finishes
 *
 * The touch ends when it returns to its start row. That return is checked at
 * *every* row, not only at lead-ends — which is what makes Grandsire **snap
 * finishes** work: Grandsire's treble leads for two blows, so rounds can come
 * up one change before the lead-end. A return to the start row only counts as
 * the finish if it falls within the *last* specified lead; an earlier return
 * means the calling repeats itself and the touch is false (the duplicate rows
 * are then caught by the `Prover`).
 */
export class Touch {
  readonly composition: Composition;

  private _rungCache?: { rows: Row[]; cameRound: boolean; comeRoundIndex: number | null };

  constructor(composition: Composition) {
    this.composition = composition;
  }

  // ---------------------------------------------------------------------------
  // Lead expansion
  // ---------------------------------------------------------------------------

  /**
   * The changes of one lead, with any call for that lead substituted into the
   * tail. The call's replacement changes overwrite the last `changes.length`
   * changes (offset earlier by `position`).
   */
  leadChanges(lead: number): Change[] {
    const base = [...this.composition.method.changes];
    const call = this.composition.callAt(lead);
    if (call === undefined) return base;

    const k = call.changes.length;
    const pos = call.position ?? 0;
    const endIdx = base.length - 1 - pos; // index of the replacement's last change
    const startIdx = endIdx - k + 1;
    if (startIdx < 0 || endIdx >= base.length) {
      throw new RangeError(
        `Call '${call.name}' (${k} changes at position ${pos}) does not fit a lead of length ${base.length}`,
      );
    }
    for (let j = 0; j < k; j++) base[startIdx + j] = call.changes[j]!;
    return base;
  }

  // ---------------------------------------------------------------------------
  // Internal expansion (cached)
  // ---------------------------------------------------------------------------

  private _rung(): { rows: Row[]; cameRound: boolean; comeRoundIndex: number | null } {
    if (this._rungCache !== undefined) return this._rungCache;

    const { method, length, startRow } = this.composition;
    const leadLength = method.leadLength;
    const lastLeadStart = (length - 1) * leadLength; // change-index at which the last lead begins

    const rows: Row[] = [startRow];
    let row = startRow;
    let cameRound = false;
    let comeRoundIndex: number | null = null;

    outer: for (let lead = 0; lead < length; lead++) {
      const changes = this.leadChanges(lead);
      for (const change of changes) {
        row = change.apply(row);
        const changeIndex = rows.length; // 1-based count of changes applied to reach `row`
        if (row.equals(startRow) && changeIndex > lastLeadStart) {
          // Legitimate finish (lead-end or snap) within the last specified lead.
          rows.push(row);
          cameRound = true;
          comeRoundIndex = changeIndex;
          break outer;
        }
        rows.push(row);
      }
    }

    this._rungCache = { rows, cameRound, comeRoundIndex };
    return this._rungCache;
  }

  // ---------------------------------------------------------------------------
  // Access
  // ---------------------------------------------------------------------------

  /**
   * The rows of the rung touch, in order, starting from `composition.startRow`.
   * For a touch that comes round, the final row is the come-round repeat of the
   * start row (so the sequence both starts and ends at rounds).
   */
  *rows(): Iterable<Row> {
    yield* this._rung().rows;
  }

  /** All rows as an array (convenience). */
  toArray(): Row[] {
    return [...this._rung().rows];
  }

  /** The number of rows produced by `rows()` (includes start and final row). */
  rowCount(): number {
    return this._rung().rows.length;
  }

  /** The number of changes rung — the headline length (e.g. 70, 84, 97, 224). */
  changeCount(): number {
    return this._rung().rows.length - 1;
  }

  /** The number of leads (equals `composition.length`). */
  leadCount(): number {
    return this.composition.length;
  }

  /** True if the touch returns to its start row within the last specified lead. */
  comesToRounds(): boolean {
    return this._rung().cameRound;
  }

  /** True if the come-round is a snap (one change before a lead-end). */
  isSnapFinish(): boolean {
    const { cameRound, comeRoundIndex } = this._rung();
    if (!cameRound || comeRoundIndex === null) return false;
    return comeRoundIndex % this.composition.method.leadLength !== 0;
  }

  // ---------------------------------------------------------------------------
  // Proving (trust boundary convenience)
  // ---------------------------------------------------------------------------

  /**
   * Prove the touch true or false, returning an immutable `Proof` (ADR-0005).
   *
   * The come-round repeat of the start row is excluded from the proven rows, so
   * a true touch's start row is counted exactly once. `maxOccurs` raises the
   * repetition threshold for multi-extent touches (default 1 = standard truth).
   */
  prove(maxOccurs = 1): Proof {
    const { rows, cameRound } = this._rung();
    const toProve = cameRound ? rows.slice(0, -1) : rows;
    const prover = new Prover(maxOccurs);
    prover.addAll(toProve);
    return prover.proof();
  }
}
