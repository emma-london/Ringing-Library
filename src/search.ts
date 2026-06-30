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
 *   and the Plain Bob / surprise family. Stedman's six-based calling is handled
 *   by its own sibling, `searchStedmanTouches` (ADR-0012), not this function.
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
  /**
   * Lower bound on touch length in changes — shorter true touches are skipped
   * while the search keeps going, so `limit` applies to results that pass the
   * filter. Default 0 (no lower bound); clamped to [0, maxChanges].
   */
  minChanges?: number;
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
  const minChanges = Math.min(maxChanges, Math.max(0, opts.minChanges ?? 0));
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

      if (outcome === 'finish' && finishChanges >= minChanges) {
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

// ===========================================================================
// Stedman / six-based search (ADR-0012)
// ===========================================================================

/**
 * Which calls the Stedman search may make at a six-end. A plain six is always
 * implicitly available.
 */
export type StedmanCall = 'bob' | 'single';

export interface StedmanSearchOptions {
  /**
   * The Stedman method to search. Defaults to **Stedman Triples**
   * (`3.1.7.3.1.3,1`). Must be a 12-change double-six with the six-end change
   * (`7`) at indices 2 and 8 — the searcher derives the six templates from it
   * and guards that shape.
   */
  method?: Method;
  /**
   * Calls usable at each six-end. A plain six is always implicitly available
   * too. Default: both `'bob'` and `'single'`.
   */
  calls?: ReadonlyArray<StedmanCall>;
  /** Hard ceiling on touch length in changes. Default 250; clamped to [1, 1000]. */
  maxChanges?: number;
  /**
   * Lower bound on touch length in changes — shorter true touches are skipped
   * while the search keeps going, so `limit` applies to results that pass the
   * filter. Default 0 (no lower bound); clamped to [0, maxChanges].
   */
  minChanges?: number;
  /** Maximum number of results to return, shortest first. Default 200. */
  limit?: number;
  /**
   * Hard ceiling on six expansions — guarantees the search always terminates
   * quickly. Default 8,000,000. When hit, the search stops and `truncated` is set.
   */
  maxNodes?: number;
  /** Start row (default: rounds at the method's stage). */
  startRow?: Row;
}

/**
 * Enumerate true come-round **Stedman** touches, shortest first (ADR-0012).
 *
 * This is the six-based sibling of {@link searchTouches}. ADR-0011 scoped the
 * lead-end searcher away from Stedman because ADR-0006's one-call-per-lead model
 * expresses a double-six only through compound (multi-character) calls. The
 * dodge is to make the search decision **per six** rather than per lead: per six
 * the calls are single changes — plain `7`, bob `5`, single `567` — substituted
 * for the `7` that begins each six. There is no compound symbol to render.
 *
 * The walk uses the verified per-six change-stream model: a 2-change lead-in
 * (`3.1` from rounds), then sixes that alternate quick `[head,3,1,3,1,3]` and
 * slow `[head,1,3,1,3,1]`, with `head` the six-end change. This reproduces
 * `new Touch(stedmanTriplesComposition(calling)).rows()` row-for-row (locked by
 * test), so every result round-trips through `stedmanTriplesComposition` for
 * independent re-proof.
 *
 * Everything else mirrors {@link searchTouches}: iterative-deepening,
 * truth-pruned, come-round checked at *every* row (so a Stedman "half-six"
 * finish — rounds two changes shy of a six-end, as the plain course itself
 * does — falls out for free), the same three hard ceilings, the same shortest-
 * first ordering and `truncated` honesty.
 *
 * `SearchResult` field semantics for these results (ADR-0012):
 * - `calling` — the **per-six** string ringers use: `.` plain, `-` bob, `s`
 *   single (exactly what `stedmanTriplesComposition` consumes).
 * - `changes` — length in changes, as for any result.
 * - `leads` — the **number of sixes** rung (not leads).
 * - `snap` — `true` when the touch comes round other than exactly at a full
 *   six-end (the Stedman half-six finish; the direct analogue of a Grandsire snap).
 */
export function searchStedmanTouches(opts: StedmanSearchOptions = {}): SearchReport {
  const method = opts.method ?? Method.fromPlaceNotation('3.1.7.3.1.3,1', 7, 'Stedman Triples');
  const stage = method.stage;
  const lead = method.changes;

  // Guard the assumed shape so we never mis-walk a non-Stedman method.
  if (lead.length !== 12 || lead[2]!.toString() !== '7' || lead[8]!.toString() !== '7') {
    throw new Error(
      `searchStedmanTouches expects a 12-change double-six with the six-end '7' at ` +
      `indices 2 and 8 (Stedman Triples); got a ${lead.length}-change lead.`,
    );
  }

  const allowBob = !opts.calls || opts.calls.includes('bob');
  const allowSingle = !opts.calls || opts.calls.includes('single');
  const limit = Math.max(1, opts.limit ?? 200);
  const maxChanges = Math.min(1000, Math.max(1, opts.maxChanges ?? 250));
  const minChanges = Math.min(maxChanges, Math.max(0, opts.minChanges ?? 0));
  const maxNodes = Math.max(1, opts.maxNodes ?? 8_000_000);
  const startRow = opts.startRow ?? Row.rounds(stage);
  const startStr = startRow.toString();

  // Call head substitutions (Stedman Triples): bob makes 5ths, single 5-6-7ths,
  // each replacing the `7` that begins a six (ADR-0007).
  const bobHead = Change.parse('5', stage);
  const singleHead = Change.parse('567', stage);

  // The six-options provider. Six `k` (0-based) spans change-stream positions
  // [2 + 6k .. 7 + 6k]; position `g` is `lead[g % 12]`. j = 0 is the head (the
  // call point). Quick/slow alternation falls out of `g % 12` automatically.
  interface Option { char: string; changes: Change[]; }
  function optionsForSix(k: number): Option[] {
    const tail: Change[] = [];
    for (let j = 1; j < 6; j++) tail.push(lead[(2 + 6 * k + j) % 12]!);
    const plainHead = lead[(2 + 6 * k) % 12]!; // always the `7`
    const opts: Option[] = [{ char: '.', changes: [plainHead, ...tail] }];
    if (allowBob) opts.push({ char: '-', changes: [bobHead, ...tail] });
    if (allowSingle) opts.push({ char: 's', changes: [singleHead, ...tail] });
    return opts;
  }

  // The unconditional 2-change lead-in (`3.1` from rounds). Its rows occupy
  // truth slots but offer no call choice and can never be a finish.
  const leadIn = [lead[0]!, lead[1]!];

  // Largest six count whose shortest finish still fits in maxChanges. A finish
  // at six d (0-based) is at least `2 + 6d + 1` changes, so d ≤ (maxChanges-3)/6.
  const maxSixes = Math.max(1, Math.floor((maxChanges - 3) / 6) + 1);

  const results: SearchResult[] = [];
  let nodes = 0;
  let truncated = false;
  let sixesSearched = 0;

  const seen = new Set<string>();
  const callingChars: string[] = [];

  // DFS to exactly `targetSixes` sixes, recording touches that first come round
  // at the final six (mirrors searchTouches' record-at-target-depth rule).
  function dfs(row: Row, depth: number, targetSixes: number, found: SearchResult[]): void {
    const finalSix = depth + 1 === targetSixes;
    for (const opt of optionsForSix(depth)) {
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
          if (finalSix) {
            outcome = 'finish';
            finishChanges = 2 + depth * 6 + (i + 1); // 2 = lead-in
            // Same rule as Touch.isSnapFinish: came round other than on a
            // double-six (lead) boundary. Keeps search and Compose in agreement.
            snap = finishChanges % lead.length !== 0;
          } else {
            outcome = 'early'; // shorter touch, already found at a smaller depth
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

      if (outcome === 'finish' && finishChanges >= minChanges) {
        found.push({
          calling: callingChars.join('') + opt.char,
          changes: finishChanges,
          leads: targetSixes, // = number of sixes (ADR-0012)
          snap,
        });
      } else if (outcome === 'full' && !finalSix) {
        callingChars.push(opt.char);
        dfs(cur, depth + 1, targetSixes, found);
        callingChars.pop();
      }
      for (const s of added) seen.delete(s);
    }
  }

  try {
    for (let D = 1; D <= maxSixes; D++) {
      sixesSearched = D;
      // Reset truth and replay the constant lead-in for this depth.
      seen.clear();
      seen.add(startStr);
      let row = startRow;
      let leadInOk = true;
      for (const ch of leadIn) {
        row = ch.apply(row);
        const s = row.toString();
        if (s === startStr || seen.has(s)) { leadInOk = false; break; } // impossible, but safe
        seen.add(s);
      }
      if (!leadInOk) break;

      const found: SearchResult[] = [];
      dfs(row, 0, D, found);
      found.sort((a, b) => a.changes - b.changes || (a.calling < b.calling ? -1 : a.calling > b.calling ? 1 : 0));
      for (const r of found) results.push(r);
      if (results.length >= limit) {
        truncated = true;
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
    leadsSearched: sixesSearched, // = sixes searched for the Stedman path
  };
}
