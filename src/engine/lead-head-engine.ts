import { Row } from '../row.js';
import { Change } from '../change.js';
import { Method } from '../method.js';
import { Composition, type CallDefinition } from '../composition.js';
import { Touch } from '../touch.js';

/**
 * Generic lead-head composition engine — Phase 4a core (ADR-0013 / ADR-0017 /
 * ADR-0018).
 *
 * A method-agnostic port of the validated C++ prototype
 * `prototypes/grandsire_solver.cpp`. Where the first engine hardcoded Grandsire
 * Triples, this one is built from any **lead-head (treble-hunt) `Method`** plus
 * its `CallDefinition[]` — Plain Bob, Grandsire, treble-bob/surprise, and so on
 * (ADR-0018). Principles like Stedman (no treble-defined lead head) are out of
 * scope and stay with `searchStedmanTouches` (ADR-0012).
 *
 * ## Layering (ADR-0002, ADR-0018)
 *
 * - **Boundary uses library types.** The engine consumes a `Method` +
 *   `CallDefinition[]` and builds its lookup tables from `method.changes` via
 *   `Change.apply` on a rounds `Row` — one shared definition of what a change
 *   does. Results are emitted as `Composition`s (the ADR-0002/0005 search-result
 *   type), each re-provable by `new Touch(composition).prove()`.
 * - **Kernel stays flat.** The DFS/MITM hot loop is a dense-rank + bitset engine
 *   (Lehmer ranking, per-lead-head tables, a 5040-/`N!`-bit truth set). This is
 *   the engine-internal `SearchTruth` ADR-0002 keeps off the public surface *so
 *   that it can be this fast*. Immutable `Row`/`Change` objects are deliberately
 *   **not** used inside the loop — allocating one per node across millions of
 *   nodes would erase the performance the engine exists for.
 *
 * ## Techniques carried from the prototype
 *
 * Lehmer ranking → dense row id; bitset truth with subtree pruning; snap finishes
 * (rounds coming up mid-lead, at the treble's internal lead blow); a reachability
 * DP (can this lead-head still reach rounds within budget); and meet-in-the-middle
 * counting. The Grandsire-specific singles-parity refinement is intentionally
 * dropped for a universally-correct reachability-only prune (ADR-0018).
 *
 * ## Stage ceiling
 *
 * The dense model needs an `N!`-entry rank map and `N!`-bit truth sets, which is
 * fine to Royal (10 bells) but blows up by Maximus (12). Stages above 10 throw
 * (deferred, ADR-0018).
 */

// ---- shared result / seam types ----

/** One true come-round touch reported by the engine. */
export interface EngineTouch {
  /** Calling, one char per lead: `.` plain, else the call's symbol. */
  calling: string;
  /** Length in changes. A snap finish is short of `leads * leadLength`. */
  changes: number;
  /** Number of leads rung. */
  leads: number;
  /** True if the come-round is a snap (rounds before a lead-end). */
  snap: boolean;
  /** The result as a `Composition` (ADR-0002/0005) — re-provable via `Touch`. */
  composition: Composition;
}

/** A find() result: an {@link EngineTouch} plus its independent re-proof. */
export interface EngineFind extends EngineTouch {
  /** True if `new Touch(composition).prove()` confirms it true and come-round. */
  verifiedTrue: boolean;
  /** Changes counted by the independent `Touch` ring-out. */
  verifyChanges: number;
}

/** One length's tally in a {@link CountReport}. */
export interface CountRow { leads: number; leadEnd: number; snap: number; total: number; }

/** The `count` mode result: true come-round touches broken out by length. */
export interface CountReport { byLength: CountRow[]; totalLeadEnd: number; totalSnap: number; total: number; }

/** The `mitmCount` mode result: total true come-round touches of an exact length. */
export interface MitmCount { leads: number; total: number; leadEnd: number; snap: number; forwardHalves: number; }

/** One call's Q-set structure. */
export interface QSet {
  /** The call this describes (its definition name, lower-cased). */
  call: string;
  transpositionCycle: number;
  order: number;
  leadHeadOrbits: number;
  qSetSize: number;
}

/**
 * The stable engine seam (ADR-0017/ADR-0018). A future Rust/wasm-pack build
 * implements this same interface; `src/search.ts`'s bounded DFS is what 4b swaps
 * for it (behind `SearchReport`).
 */
export interface CompositionEngine {
  count(maxLeads: number): CountReport;
  list(maxLeads: number): EngineTouch[];
  find(exactLeads: number, cap?: number): EngineFind[];
  mitmCount(exactLeads: number): MitmCount;
  qsets(): QSet[];
}

// ---- small permutation helpers (build-time only) ----
function invertPermArr(p: Uint8Array, n: number): Uint8Array {
  const r = new Uint8Array(n);
  for (let i = 0; i < n; i++) r[p[i]!] = i;
  return r;
}
function composePermArr(p: Uint8Array, q: Uint8Array, n: number): Uint8Array {
  const r = new Uint8Array(n);
  for (let i = 0; i < n; i++) r[i] = p[q[i]!]!;
  return r;
}

/** The largest stage the dense-rank model supports (Royal). Above this, throw. */
const MAX_STAGE = 10;

/**
 * Generic lead-head engine. Builds all lookup tables once in the constructor from
 * the `Method` + calls, then answers queries with no further table work.
 */
export class LeadHeadEngine implements CompositionEngine {
  readonly method: Method;
  readonly calls: ReadonlyArray<CallDefinition>;

  private readonly N: number;
  private readonly leadLen: number;
  private readonly nCalls: number; // 1 (plain) + calls.length
  private readonly FACT_N: number;
  private readonly NLH: number;
  private readonly WORDS: number; // 32-bit words to cover FACT_N bits
  private readonly optionSymbol: string[]; // index 0 = '.', then each call symbol

  private readonly FACT: Float64Array;
  // P[opt][k] flattened perm store (nCalls * (leadLen+1) * N)
  private readonly P: Uint8Array;
  private readonly leadHeadPerm: Uint8Array[] = [];

  private readonly lhId: Int32Array;
  private readonly lhRank: Int32Array;
  private readonly nextId: Int32Array;
  private readonly backId: Int32Array;
  private readonly rowsT: Uint16Array; // NLH * nCalls * leadLen
  private roundsId = 0;

  // snap structure (assumption-free, ADR-0018): one seed per (head, option) that
  // reaches rounds at an internal row.
  private readonly hasSnap: Uint8Array; // per lead-head id
  private readonly snapSeeds: Array<{ headId: number; option: number; k: number; partial: number[] }> = [];

  // reachability DP (rebuilt per query length)
  private DPN = 0;
  private reach = new Uint8Array(0);
  private within = new Uint8Array(0);

  // search state
  private readonly used: Uint32Array;
  private readonly callStack: number[] = [];

  constructor(method: Method, calls: CallDefinition[]) {
    this.method = method;
    this.calls = Object.freeze([...calls]);
    this.N = method.stage;
    if (this.N > MAX_STAGE) {
      throw new RangeError(
        `LeadHeadEngine supports stages up to ${MAX_STAGE} (Royal); the dense-rank ` +
          `truth model does not scale to stage ${this.N} (deferred, ADR-0018).`,
      );
    }
    this.leadLen = method.leadLength;
    this.nCalls = 1 + calls.length;
    for (const c of calls) {
      if (c.symbol.length !== 1 || c.symbol === '.') {
        throw new Error(`Call '${c.name}' needs a single-character symbol other than '.'; got '${c.symbol}'.`);
      }
    }
    this.optionSymbol = ['.', ...calls.map((c) => c.symbol)];

    this.FACT = new Float64Array(this.N + 1);
    this.FACT[0] = 1;
    for (let i = 1; i <= this.N; i++) this.FACT[i] = this.FACT[i - 1]! * i;
    this.FACT_N = this.FACT[this.N]!;
    this.NLH = this.FACT[this.N - 1]!;
    this.WORDS = Math.ceil(this.FACT_N / 32);

    this.P = new Uint8Array(this.nCalls * (this.leadLen + 1) * this.N);
    this.lhId = new Int32Array(this.FACT_N);
    this.lhRank = new Int32Array(this.NLH);
    this.nextId = new Int32Array(this.NLH * this.nCalls);
    this.backId = new Int32Array(this.NLH * this.nCalls);
    this.rowsT = new Uint16Array(this.NLH * this.nCalls * this.leadLen);
    this.hasSnap = new Uint8Array(this.NLH);
    this.used = new Uint32Array(this.WORDS);

    this.buildMethod();
    this.buildTables();
    this.buildSnapSeeds();
  }

  private pIdx(opt: number, k: number, i: number): number { return (opt * (this.leadLen + 1) + k) * this.N + i; }

  private rankRow(r: Uint8Array): number {
    const n = this.N;
    let rank = 0;
    for (let i = 0; i < n; i++) {
      let smaller = 0;
      for (let j = i + 1; j < n; j++) if (r[j]! < r[i]!) smaller++;
      rank += smaller * this.FACT[n - 1 - i]!;
    }
    return rank;
  }
  private unrankRow(rank: number, out: Uint8Array): void {
    const n = this.N;
    const avail: number[] = [];
    for (let i = 0; i < n; i++) avail.push(i);
    for (let i = 0; i < n; i++) {
      const f = this.FACT[n - 1 - i]!;
      const d = Math.floor(rank / f); rank -= d * f;
      out[i] = avail[d]!;
      avail.splice(d, 1);
    }
  }
  private applyPerm(row: Uint8Array, perm: Uint8Array): Uint8Array {
    const n = this.N, o = new Uint8Array(n);
    for (let i = 0; i < n; i++) o[i] = row[perm[i]!]!;
    return o;
  }

  /** The change sequence of one lead for an option (plain or a call), mirroring
   * `Touch.leadChanges` — a call's changes replace the tail of the plain lead. */
  private optionChanges(optIndex: number): Change[] {
    const base = [...this.method.changes];
    if (optIndex === 0) return base;
    const call = this.calls[optIndex - 1]!;
    const k = call.changes.length;
    const pos = call.position ?? 0;
    const endIdx = base.length - 1 - pos;
    const startIdx = endIdx - k + 1;
    if (startIdx < 0 || endIdx >= base.length) {
      throw new RangeError(`Call '${call.name}' (${k} changes at position ${pos}) does not fit a lead of length ${base.length}`);
    }
    for (let j = 0; j < k; j++) base[startIdx + j] = call.changes[j]!;
    return base;
  }

  /** Build P[opt][k] from the library `Change`s: P[opt][k] is the row reached by
   * applying the option's first k changes to rounds (its permutation). */
  private buildMethod(): void {
    const n = this.N;
    const rounds = Row.rounds(n);
    for (let opt = 0; opt < this.nCalls; opt++) {
      const changes = this.optionChanges(opt);
      if (changes.length !== this.leadLen) {
        throw new Error(`Option ${opt} produced ${changes.length} changes, expected leadLength ${this.leadLen}.`);
      }
      let row = rounds;
      // P[opt][0] = identity
      for (let i = 0; i < n; i++) this.P[this.pIdx(opt, 0, i)] = i;
      for (let k = 1; k <= this.leadLen; k++) {
        row = changes[k - 1]!.apply(row);
        const arr = row.toArray();
        for (let i = 0; i < n; i++) this.P[this.pIdx(opt, k, i)] = arr[i]!;
      }
      const lh = new Uint8Array(n);
      for (let i = 0; i < n; i++) lh[i] = this.P[this.pIdx(opt, this.leadLen, i)]!;
      this.leadHeadPerm[opt] = lh;
    }
  }

  private buildTables(): void {
    const n = this.N;
    this.lhId.fill(-1);
    let id = 0;
    const row = new Uint8Array(n);
    for (let r = 0; r < this.FACT_N; r++) {
      this.unrankRow(r, row);
      if (row[0] === 0) { this.lhId[r] = id; this.lhRank[id] = r; id++; } // treble leading = lead head
    }
    const invLH = this.leadHeadPerm.map((p) => invertPermArr(p, n));
    const perm = new Uint8Array(n);
    for (let i = 0; i < this.NLH; i++) {
      const head = new Uint8Array(n);
      this.unrankRow(this.lhRank[i]!, head);
      for (let c = 0; c < this.nCalls; c++) {
        for (let k = 0; k < this.leadLen; k++) {
          for (let t = 0; t < n; t++) perm[t] = this.P[this.pIdx(c, k, t)]!;
          this.rowsT[(i * this.nCalls + c) * this.leadLen + k] = this.rankRow(this.applyPerm(head, perm));
        }
        const nxtRank = this.rankRow(this.applyPerm(head, this.leadHeadPerm[c]!));
        const backRank = this.rankRow(this.applyPerm(head, invLH[c]!));
        const nxt = this.lhId[nxtRank]!;
        if (nxt < 0) {
          throw new Error(
            `Method '${this.method.name}' is not a lead-head method: a lead does not return the ` +
              `treble to lead (option ${c}). Only treble-hunt lead-head methods are supported (ADR-0018).`,
          );
        }
        this.nextId[i * this.nCalls + c] = nxt;
        this.backId[i * this.nCalls + c] = this.lhId[backRank]!;
      }
    }
    this.roundsId = this.lhId[0]!;
  }

  /** Precompute, assumption-free, every (lead-head, option) that reaches rounds at
   * an internal row — the snap finishes. One at most per (head, option). */
  private buildSnapSeeds(): void {
    for (let i = 0; i < this.NLH; i++) {
      for (let c = 0; c < this.nCalls; c++) {
        const base = (i * this.nCalls + c) * this.leadLen;
        for (let k = 1; k < this.leadLen; k++) {
          if (this.rowsT[base + k] === 0) { // rounds mid-lead
            const partial: number[] = [];
            for (let t = 0; t < k; t++) partial.push(this.rowsT[base + t]!);
            this.snapSeeds.push({ headId: i, option: c, k, partial });
            this.hasSnap[i] = 1;
            break; // a true lead hits rounds at most once
          }
        }
      }
    }
  }

  // ---- bitset ----
  private bTest(r: number): boolean { return (this.used[r >> 5]! & (1 << (r & 31))) !== 0; }
  private bSet(r: number): void { this.used[r >> 5]! |= (1 << (r & 31)); }
  private bReset(r: number): void { this.used[r >> 5]! &= ~(1 << (r & 31)); }

  // ---- reachability DP (parity-free, safe for any method — ADR-0018) ----
  private reachAt(k: number, id: number): number { return this.reach[k * this.NLH + id]!; }
  private finishWithin(id: number, r: number): boolean {
    if (r < 0) return false;
    if (r > this.DPN) r = this.DPN;
    return this.within[id * (this.DPN + 1) + r]! !== 0;
  }
  private buildDP(nLeads: number): void {
    this.DPN = nLeads;
    const NLH = this.NLH;
    this.reach = new Uint8Array((nLeads + 1) * NLH);
    // reach[1][id] = a finish in exactly one lead: a lead-end finish or a snap.
    for (let id = 0; id < NLH; id++) {
      let v = this.hasSnap[id]!;
      for (let c = 0; c < this.nCalls && !v; c++) if (this.nextId[id * this.nCalls + c] === this.roundsId) v = 1;
      this.reach[NLH + id] = v;
    }
    for (let k = 2; k <= nLeads; k++) {
      for (let id = 0; id < NLH; id++) {
        let v = 0;
        for (let c = 0; c < this.nCalls && !v; c++) v |= this.reach[(k - 1) * NLH + this.nextId[id * this.nCalls + c]!]!;
        this.reach[k * NLH + id] = v;
      }
    }
    this.within = new Uint8Array(NLH * (nLeads + 1));
    for (let id = 0; id < NLH; id++) {
      let acc = 0;
      for (let r = 0; r <= nLeads; r++) {
        if (r >= 1 && this.reachAt(r, id)) acc = 1;
        this.within[id * (nLeads + 1) + r] = acc;
      }
    }
  }

  // ---- forward DFS (list / count / find) ----
  private compositionFor(calling: string): Composition {
    return Composition.fromCalling(this.method, calling, { calls: [...this.calls] });
  }
  private callingString(): string {
    let s = '';
    for (const opt of this.callStack) s += this.optionSymbol[opt];
    return s;
  }

  private dfs(
    node: number, depth: number,
    mode: 'count' | 'list' | 'find', target: number, cap: number,
    out: EngineTouch[], countLead: Float64Array, countSnap: Float64Array,
    stop: { done: boolean },
  ): void {
    if (stop.done) return;
    const budget = target - depth;
    if (mode === 'find') { if (!this.reachAt(budget, node)) return; }
    else { if (!this.finishWithin(node, budget)) return; }

    for (let c = 0; c < this.nCalls; c++) {
      const base = (node * this.nCalls + c) * this.leadLen;
      // snap finish: rounds at an internal row
      let kSnap = -1;
      for (let k = 1; k < this.leadLen; k++) if (this.rowsT[base + k] === 0) { kSnap = k; break; }
      if (kSnap !== -1) {
        let ok = true;
        for (let k = 0; k < kSnap && ok; k++) if (this.bTest(this.rowsT[base + k]!)) ok = false;
        if (ok) {
          this.callStack.push(c);
          this.record(true, (this.callStack.length - 1) * this.leadLen + kSnap, mode, target, cap, out, countLead, countSnap, stop);
          this.callStack.pop();
        }
        continue; // a full lead here would repeat rounds
      }
      // full lead
      let ok = true;
      for (let k = 0; k < this.leadLen && ok; k++) if (this.bTest(this.rowsT[base + k]!)) ok = false;
      if (!ok) continue;
      for (let k = 0; k < this.leadLen; k++) this.bSet(this.rowsT[base + k]!);
      this.callStack.push(c);
      const nxt = this.nextId[node * this.nCalls + c]!;
      if (nxt === this.roundsId) {
        this.record(false, this.callStack.length * this.leadLen, mode, target, cap, out, countLead, countSnap, stop);
      } else if (depth + 1 < target) {
        this.dfs(nxt, depth + 1, mode, target, cap, out, countLead, countSnap, stop);
      }
      this.callStack.pop();
      for (let k = 0; k < this.leadLen; k++) this.bReset(this.rowsT[base + k]!);
      if (stop.done) return;
    }
  }

  private record(
    snap: boolean, changes: number, mode: 'count' | 'list' | 'find', target: number, cap: number,
    out: EngineTouch[], countLead: Float64Array, countSnap: Float64Array, stop: { done: boolean },
  ): void {
    const leads = this.callStack.length;
    if (mode === 'find') {
      if (leads !== target) return;
      const calling = this.callingString();
      out.push({ calling, changes, leads, snap, composition: this.compositionFor(calling) });
      if (out.length >= cap) stop.done = true;
      return;
    }
    if (mode === 'list') {
      const calling = this.callingString();
      out.push({ calling, changes, leads, snap, composition: this.compositionFor(calling) });
    }
    if (snap) countSnap[leads]!++; else countLead[leads]!++;
  }

  count(maxLeads: number): CountReport {
    this.assertLeads(maxLeads);
    const countLead = new Float64Array(256), countSnap = new Float64Array(256);
    this.used.fill(0); this.callStack.length = 0;
    this.buildDP(maxLeads);
    this.dfs(this.roundsId, 0, 'count', maxLeads, 0, [], countLead, countSnap, { done: false });
    const byLength: CountRow[] = [];
    let totalLeadEnd = 0, totalSnap = 0;
    for (let L = 1; L <= maxLeads; L++) {
      const le = countLead[L]!, sn = countSnap[L]!;
      if (le || sn) { byLength.push({ leads: L, leadEnd: le, snap: sn, total: le + sn }); totalLeadEnd += le; totalSnap += sn; }
    }
    return { byLength, totalLeadEnd, totalSnap, total: totalLeadEnd + totalSnap };
  }

  list(maxLeads: number): EngineTouch[] {
    this.assertLeads(maxLeads);
    const out: EngineTouch[] = [];
    this.used.fill(0); this.callStack.length = 0;
    this.buildDP(maxLeads);
    this.dfs(this.roundsId, 0, 'list', maxLeads, 0, out, new Float64Array(256), new Float64Array(256), { done: false });
    out.sort((a, b) => a.changes - b.changes || (a.calling < b.calling ? -1 : a.calling > b.calling ? 1 : 0));
    return out;
  }

  find(exactLeads: number, cap = 20): EngineFind[] {
    this.assertLeads(exactLeads);
    const out: EngineTouch[] = [];
    this.used.fill(0); this.callStack.length = 0;
    this.buildDP(exactLeads);
    this.dfs(this.roundsId, 0, 'find', exactLeads, Math.max(1, cap), out, new Float64Array(256), new Float64Array(256), { done: false });
    out.sort((a, b) => (a.calling < b.calling ? -1 : a.calling > b.calling ? 1 : 0));
    // Independent re-proof through the public core (uses the library structures).
    return out.map((t) => {
      const touch = new Touch(t.composition);
      const verifiedTrue = touch.prove().isTrue && touch.comesToRounds();
      return { ...t, verifiedTrue, verifyChanges: touch.changeCount() };
    });
  }

  // ---- meet-in-the-middle ----
  private enumForward(len: number): Array<{ endId: number; rows: Uint32Array }> {
    const out: Array<{ endId: number; rows: Uint32Array }> = [];
    const used = new Uint32Array(this.WORDS);
    const rec = (id: number, depth: number): void => {
      if (depth === len) { out.push({ endId: id, rows: used.slice() }); return; }
      for (let c = 0; c < this.nCalls; c++) {
        const base = (id * this.nCalls + c) * this.leadLen;
        let ok = true;
        for (let k = 0; k < this.leadLen && ok; k++) { const r = this.rowsT[base + k]!; if (used[r >> 5]! & (1 << (r & 31))) ok = false; }
        if (!ok) continue;
        for (let k = 0; k < this.leadLen; k++) { const r = this.rowsT[base + k]!; used[r >> 5]! |= (1 << (r & 31)); }
        rec(this.nextId[id * this.nCalls + c]!, depth + 1);
        for (let k = 0; k < this.leadLen; k++) { const r = this.rowsT[base + k]!; used[r >> 5]! &= ~(1 << (r & 31)); }
      }
    };
    rec(this.roundsId, 0);
    return out;
  }

  mitmCount(exactLeads: number): MitmCount {
    this.assertLeads(exactLeads);
    const L = exactLeads, m = L >> 1, backLen = L - m;
    const fwd = this.enumForward(m);
    const bucket = new Map<number, number[]>();
    for (let i = 0; i < fwd.length; i++) {
      const arr = bucket.get(fwd[i]!.endId);
      if (arr) arr.push(i); else bucket.set(fwd[i]!.endId, [i]);
    }

    const used = new Uint32Array(this.WORDS);
    let found = 0, snaps = 0;
    const disjoint = (a: Uint32Array): boolean => { for (let w = 0; w < this.WORDS; w++) if (a[w]! & used[w]!) return false; return true; };
    const markLead = (X: number, c: number, on: boolean): void => {
      const b = (X * this.nCalls + c) * this.leadLen;
      for (let k = 0; k < this.leadLen; k++) { const r = this.rowsT[b + k]!; if (on) used[r >> 5]! |= (1 << (r & 31)); else used[r >> 5]! &= ~(1 << (r & 31)); }
    };
    const canLead = (X: number, c: number): boolean => {
      const b = (X * this.nCalls + c) * this.leadLen;
      for (let k = 0; k < this.leadLen; k++) { const r = this.rowsT[b + k]!; if (used[r >> 5]! & (1 << (r & 31))) return false; }
      return true;
    };
    const joinAt = (id: number, snap: boolean): void => {
      const b = bucket.get(id); if (!b) return;
      for (const fi of b) if (disjoint(fwd[fi]!.rows)) { found++; if (snap) snaps++; }
    };
    // backward full-lead recursion (no more snaps once the first step is taken)
    const recNormal = (id: number, depth: number, snap: boolean): void => {
      if (depth === backLen) { joinAt(id, snap); return; }
      for (let c = 0; c < this.nCalls; c++) {
        const X = this.backId[id * this.nCalls + c]!;
        if (!canLead(X, c)) continue;
        markLead(X, c, true);
        recNormal(X, depth + 1, snap);
        markLead(X, c, false);
      }
    };
    // First backward step may be a snap (the touch's final short lead) or a normal lead.
    if (backLen === 0) {
      joinAt(this.roundsId, false);
    } else {
      // normal first step
      recNormal(this.roundsId, 0, false);
      // snap first step: seed each snap lead ending at rounds, then normal leads back
      for (const seed of this.snapSeeds) {
        let ok = true;
        for (const r of seed.partial) if (used[r >> 5]! & (1 << (r & 31))) { ok = false; break; }
        if (!ok) continue;
        for (const r of seed.partial) used[r >> 5]! |= (1 << (r & 31));
        recNormal(seed.headId, 1, true);
        for (const r of seed.partial) used[r >> 5]! &= ~(1 << (r & 31));
      }
    }
    return { leads: L, total: found, leadEnd: found - snaps, snap: snaps, forwardHalves: fwd.length };
  }

  // ---- Q-set structure ----
  qsets(): QSet[] {
    const n = this.N;
    const invPlain = invertPermArr(this.leadHeadPerm[0]!, n);
    const gcd = (x: number, y: number): number => { while (y) { const z = x % y; x = y; y = z; } return x; };
    const result: QSet[] = [];
    const head = new Uint8Array(n);
    for (let opt = 1; opt < this.nCalls; opt++) {
      const q = composePermArr(invPlain, this.leadHeadPerm[opt]!, n);
      const seen = new Uint8Array(this.NLH); const sizes: number[] = [];
      for (let i = 0; i < this.NLH; i++) {
        if (seen[i]) continue;
        let len = 0, cur = i;
        while (!seen[cur]) {
          seen[cur] = 1;
          this.unrankRow(this.lhRank[cur]!, head);
          cur = this.lhId[this.rankRow(this.applyPerm(head, q))]!;
          len++;
        }
        sizes.push(len);
      }
      let mx = sizes[0]!; for (const s of sizes) if (s > mx) mx = s;
      const cseen = new Uint8Array(n); let order = 1;
      for (let i = 0; i < n; i++) { if (cseen[i]) continue; let len = 0, j = i; while (!cseen[j]) { cseen[j] = 1; j = q[j]!; len++; } order = (order / gcd(order, len)) * len; }
      result.push({ call: this.calls[opt - 1]!.name.toLowerCase(), transpositionCycle: mx, order, leadHeadOrbits: sizes.length, qSetSize: mx });
    }
    return result;
  }

  private assertLeads(n: number): void {
    if (!Number.isInteger(n) || n < 1) throw new RangeError(`leads must be a positive integer, got ${n}`);
  }
}
