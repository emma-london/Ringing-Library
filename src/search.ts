import { Change } from './change.js';
import { Row } from './row.js';
import { Method } from './method.js';
import { type CallDefinition } from './composition.js';

/**
 * Bounded composition search (ADR-0011).
 *
 * This is the **Phase 3 app-only** searcher: a small, capped, shortest-first
 * enumerator of true come-round touches, built directly on the public core
 * (`Method` / `Change` / `Row`). It exists to serve the test-bench "Search" tab
 * ("give me true compositions up to N changes"). It is deliberately *not* the
 * Phase 4 search engine (ADR-0003): it has hard ceilings, does no reachability
 * DP / rank-bitset cleverness, and is not meant to reach quarter-peal lengths.
 *
 * The value here is the **interface**, not the implementation. `searchTouches`
 * returns plain, serializable `SearchResult` data behind a stable signature, so
 * the Phase 4 WASM engine can replace the body of this module without the app
 * (or its result type) changing. The throwaway is contained to the DFS below.
 *
 * Truth is still owned by the same model used everywhere else: the searcher
 * only ever reports a touch as a hit if every row is distinct and it returns to
 * its start row — the same definition `Touch`/`Prover` enforce. Every result is
 * independently re-provable by `Touch.prove()` (the tests do exactly that).
 *
 * ## Assumptions / scope
 * - The call model is ADR-0006 lead-end calls: at each lead the search picks a
 *   plain lead or one of `calls`. Call symbols are assumed single-character so a
 *   calling renders as one char per lead (e.g. `s.s.s-.`). This covers Grandsire
 *   and the Plain Bob / surprise family. Stedman's six-based calling (ADR-0007)
 *   is out of scope for this bounded searcher and is left to Phase 4.
 * - Come-round is checked at *every* row, so Grandsire **snap finishes** fall out
 *   for free (a touch of `leads*leadLength - 1` changes), exactly as in `Touch`.
 */

/** One true come-round touch found by the searcher. Plain, serializable data. */
export interface SearchResult {
  /** Calling, one character per lead: `.` for a plain lead, else the call symbol. */
  calling: string;
  /** Length in changes. A snap finish is one less than `leads * leadLength`. */
  changes: number;
  /** Number of leads rung. */
  leads: number;
  /** True if the come-round is a snap (one change before a lead-end). */
  snap: boolean;
}

export interface SearchOptions {
  /** The method to search. */
  method: Method;
  /**
   * Calls usable at each lead. A plain lead is always implicitly available too.
   * Symbols must be single-character (see scope note above).
   */
  calls: CallDefinition[];
  /** Hard ceiling on touch length in changes. Default 250; clamped to [1, 1000]. */
  maxChanges?: number;
  /** Maximum number of results to return, shortest first. Default 200. */
  limit?: number;
  /**
   * Hard ceiling on lead expansions — guarantees the search always terminates
   * quickly regardless of the method. Default 8,000,000. When hit, the search
   * stops and `truncated` is set.
   */
  maxNodes?: number;
  /** Start row (default: rounds at the method's stage). */
  startRow?: Row;
}

export interface SearchReport {
  /** True come-round touches, shortest first (by changes, then calling). */
  results: SearchResult[];
  /**
   * True if a ceiling stopped the search before it had exhausted every touch
   * within `maxChanges` — i.e. `limit` was reached or the `maxNodes` budget ran
   * out, so more true touches may exist that are not listed.
   */
  truncated: boolean;
  /** Lead expansions performed — a measure of the work done. */
  nodes: number;
  /** The deepest lead count actually searched. */
  leadsSearched: number;
}

/** Thrown internally to unwind the DFS once a hard ceiling is hit. */
class SearchBudgetExceeded extends Error {}

/**
 * Enumerate true come-round touches of `method`, shortest first.
 *
 * The walk is an iterative-deepening DFS over the per-lead choice of
 * plain/call. At depth *D* it records only touches that *first* come round at
 * lead *D* (earlier come-rounds are shorter touches, already found at a smaller
 * depth), pruning any branch the instant a row repeats. Because depth is
 * explored in ascending order and length is monotonic in depth, results emerge
 * shortest first; the search stops as soon as `limit` is reached, so it never
 * explores deeper than it must.
 */
export function searchTouches(opts: SearchOptions): SearchReport {
  const { method } = opts;
  const calls = opts.calls ?? [];
  const limit = Math.max(1, opts.limit ?? 200);
  const maxChanges = Math.min(1000, Math.max(1, opts.maxChanges ?? 250));
  const maxNodes = Math.max(1, opts.maxNodes ?? 8_000_000);
  const startRow = opts.startRow ?? Row.rounds(method.stage);
  const startStr = startRow.toString();
  const leadLen = method.leadLength;

  // Precompute the change sequence for each option (plain + each call), mirroring
  // Touch.leadChanges: a call's changes replace the tail of the plain lead.
  const base = [...method.changes];
  interface Option { char: string; changes: Change[]; }
  const options: Option[] = [{ char: '.', changes: base }];
  for (const call of calls) {
    if (call.symbol.length !== 1) {
      throw new Error(
        `searchTouches requires single-character call symbols; got '${call.symbol}' ` +
        `(${call.name}). Six-based callings are out of scope for the bounded searcher (ADR-0011).`,
      );
    }
    const k = call.changes.length;
    const pos = call.position ?? 0;
    const endIdx = base.length - 1 - pos;
    const startIdx = endIdx - k + 1;
    if (startIdx < 0 || endIdx >= base.length) {
      throw new RangeError(
        `Call '${call.name}' (${k} changes at position ${pos}) does not fit a lead of length ${base.length}`,
      );
    }
    const changes = [...base];
    for (let j = 0; j < k; j++) changes[startIdx + j] = call.changes[j]!;
    options.push({ char: call.symbol, changes });
  }

  // Largest lead count whose shortest finish (a snap) still fits in maxChanges.
  const maxLeads = Math.floor((maxChanges + 1) / leadLen);

  const results: SearchResult[] = [];
  let nodes = 0;
  let truncated = false;
  let leadsSearched = 0;

  // Truth set: string forms of every row currently committed to the touch.
  // Seeded with the start row (it occupies "line 1" and may only recur as the
  // legitimate come-round finish).
  const seen = new Set<string>([startStr]);
  // Calling characters for the leads already committed above the current one.
  const callingChars: string[] = [];

  // DFS to exactly `targetLeads` leads, recording touches that first come round
  // at the final lead. Returns nothing; pushes into `found`.
  function dfs(row: Row, depth: number, targetLeads: number, found: SearchResult[]): void {
    const finalLead = depth + 1 === targetLeads;
    for (const opt of options) {
      if (++nodes > maxNodes) {
        truncated = true;
        throw new SearchBudgetExceeded();
      }
      const added: string[] = [];
      let cur = row;
      let outcome: 'full' | 'finish' | 'conflict' | 'early' = 'full';
      let finishChanges = 0;
      let snap = false;

      for (let i = 0; i < opt.changes.length; i++) {
        cur = opt.changes[i]!.apply(cur);
        const s = cur.toString();
        if (s === startStr) {
          if (finalLead) {
            outcome = 'finish';
            finishChanges = depth * leadLen + (i + 1);
            snap = i + 1 !== leadLen;
          } else {
            // Comes round before the target depth: a shorter touch, already
            // enumerated at a smaller depth. Prune this branch.
            outcome = 'early';
          }
          break;
        }
        if (seen.has(s)) {
          outcome = 'conflict';
          break;
        }
        seen.add(s);
        added.push(s);
      }

      if (outcome === 'finish') {
        found.push({
          calling: callingChars.join('') + opt.char,
          changes: finishChanges,
          leads: targetLeads,
          snap,
        });
      } else if (outcome === 'full' && !finalLead) {
        callingChars.push(opt.char);
        dfs(cur, depth + 1, targetLeads, found);
        callingChars.pop();
      }
      // 'full' on the final lead = reached depth without coming round → prune.
      // 'conflict' / 'early' → prune. In all cases, undo this lead's rows.
      for (const s of added) seen.delete(s);
    }
  }

  try {
    for (let D = 1; D <= maxLeads; D++) {
      leadsSearched = D;
      const found: SearchResult[] = [];
      dfs(startRow, 0, D, found);
      // Within a depth, order by length (snaps precede lead-ends) then calling.
      found.sort((a, b) => a.changes - b.changes || (a.calling < b.calling ? -1 : a.calling > b.calling ? 1 : 0));
      for (const r of found) results.push(r);
      if (results.length >= limit) {
        truncated = true; // there may be more at this or a deeper length
        break;
      }
    }
  } catch (e) {
    if (!(e instanceof SearchBudgetExceeded)) throw e;
  }

  return {
    results: results.slice(0, limit),
    truncated,
    nodes,
    leadsSearched,
  };
}
