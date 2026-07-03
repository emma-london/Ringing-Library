// AssemblyScript spike: Grandsire Triples ranked-lead-head DFS + bitset truth
// kernel, faithful port of grandsire_solver.cpp's `count` mode (the hot loop).
// Purpose: measure AS→wasm throughput and boundary overhead for ADR-0017.

const N: i32 = 7;
const FACT_N: i32 = 5040;
const LEAD_LEN: i32 = 14;
const N_CALLS: i32 = 3;
const NLH: i32 = 720;
const SINGLE: i32 = 2;

// ---- factorials ----
let FACT = new StaticArray<i32>(N + 1);

// ---- method: P[c][k] as flat perm store (3*15*7) ----
let P = new StaticArray<u8>(N_CALLS * (LEAD_LEN + 1) * N);
@inline function pIdx(c: i32, k: i32, i: i32): i32 { return (c * (LEAD_LEN + 1) + k) * N + i; }

// ---- tables ----
let lhId = new StaticArray<i32>(FACT_N);
let lhRank = new StaticArray<u16>(NLH);
let nextId = new StaticArray<i32>(NLH * N_CALLS);
let rowsT = new StaticArray<u16>(NLH * N_CALLS * LEAD_LEN);
let snapHeadId = new StaticArray<i32>(N_CALLS);
let roundsId: i32 = 0;

// ---- truth bitset over 5040 rows (158 * 32 = 5056 bits) ----
const WORDS: i32 = 158;
let used = new StaticArray<u32>(WORDS);
@inline function bTest(r: i32): bool { return (used[r >> 5] & ((1 as u32) << (r & 31))) != 0; }
@inline function bSet(r: i32): void { used[r >> 5] |= ((1 as u32) << (r & 31)); }
@inline function bReset(r: i32): void { used[r >> 5] &= ~((1 as u32) << (r & 31)); }

// ---- reachability DP ----
let DPN: i32 = 0;
let CF = new StaticArray<u8>(0);
let within = new StaticArray<u8>(0);
@inline function cf(k: i32, id: i32, par: i32): u8 { return CF[k * NLH * 2 + id * 2 + par]; }
@inline function finishWithin(id: i32, r: i32): bool {
  if (r < 0) return false;
  if (r > DPN) r = DPN;
  return within[id * (DPN + 1) + r] != 0;
}

// ---- per-length counters ----
let countLead = new StaticArray<u64>(128);
let countSnap = new StaticArray<u64>(128);

// scratch perms/rows
let scratchA = new StaticArray<u8>(N);
let scratchB = new StaticArray<u8>(N);

function rankRow(r: StaticArray<u8>): u16 {
  let k: u16 = 0;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = i + 1; j < N; j++) if (r[j] < r[i]) s++;
    k += (s * FACT[N - 1 - i]) as u16;
  }
  return k;
}
function unrankRow(rk: i32, out: StaticArray<u8>): void {
  let avail = scratchB;
  for (let i = 0; i < N; i++) avail[i] = i as u8;
  let navail = N;
  for (let i = 0; i < N; i++) {
    let f = FACT[N - 1 - i];
    let d = rk / f; rk = rk % f;
    out[i] = avail[d];
    for (let t = d; t < navail - 1; t++) avail[t] = avail[t + 1];
    navail--;
  }
}
// change from place-notation places (list of 0-based places), fill perm out
function changeFromPlaces(places: StaticArray<i32>, nplaces: i32, out: StaticArray<u8>): void {
  let isP = new StaticArray<bool>(N);
  for (let t = 0; t < nplaces; t++) isP[places[t]] = true;
  let i = 0;
  while (i < N) {
    if (isP[i]) { out[i] = i as u8; i++; }
    else { out[i] = (i + 1) as u8; out[i + 1] = i as u8; i += 2; }
  }
}

function buildMethod(): void {
  // common changes 3 1 7 1 7 1 7 1 7 1 7 1 ; tails per call
  let commonPlaces: i32[][] = [[2],[0],[6],[0],[6],[0],[6],[0],[6],[0],[6],[0]]; // '3'->2,'1'->0,'7'->6
  let tailA: i32[][] = [[6],[2],[2]];      // plain '7'->6, bob '3'->2, single '3'->2
  let tailB: i32[][] = [[0],[0],[0,1,2]];  // plain '1'->0, bob '1'->0, single '123'->0,1,2

  let id = new StaticArray<u8>(N);
  for (let i = 0; i < N; i++) id[i] = i as u8;

  let ch = new StaticArray<u8>(LEAD_LEN * N); // 14 change perms flat
  let tmpPlaces = new StaticArray<i32>(N);
  let chSlot = new StaticArray<u8>(N);

  for (let c = 0; c < N_CALLS; c++) {
    for (let k = 0; k < 12; k++) {
      let pl = commonPlaces[k];
      for (let t = 0; t < pl.length; t++) tmpPlaces[t] = pl[t];
      changeFromPlaces(tmpPlaces, pl.length, chSlot);
      for (let i = 0; i < N; i++) ch[k * N + i] = chSlot[i];
    }
    let ta = tailA[c];
    for (let t = 0; t < ta.length; t++) tmpPlaces[t] = ta[t];
    changeFromPlaces(tmpPlaces, ta.length, chSlot);
    for (let i = 0; i < N; i++) ch[12 * N + i] = chSlot[i];
    let tb = tailB[c];
    for (let t = 0; t < tb.length; t++) tmpPlaces[t] = tb[t];
    changeFromPlaces(tmpPlaces, tb.length, chSlot);
    for (let i = 0; i < N; i++) ch[13 * N + i] = chSlot[i];

    // P[c][0] = id ; P[c][k] = P[c][k-1] ∘ ch[k-1]
    for (let i = 0; i < N; i++) P[pIdx(c, 0, i)] = id[i];
    for (let k = 1; k <= LEAD_LEN; k++) {
      for (let i = 0; i < N; i++) {
        // (P[c][k-1] ∘ ch[k-1])[i] = P[c][k-1][ ch[k-1][i] ]
        let qi = ch[(k - 1) * N + i];
        P[pIdx(c, k, i)] = P[pIdx(c, k - 1, qi)];
      }
    }
  }
}

// apply perm P[c][k] to head row (headRank) -> out; returns rank
function applyPk(headRank: i32, c: i32, k: i32, out: StaticArray<u8>): u16 {
  unrankRow(headRank, scratchA);
  for (let i = 0; i < N; i++) out[i] = scratchA[P[pIdx(c, k, i)]];
  return rankRow(out);
}

function buildTables(): void {
  for (let i = 0; i < FACT_N; i++) lhId[i] = -1;
  let id = 0;
  let row = new StaticArray<u8>(N);
  for (let r = 0; r < FACT_N; r++) {
    unrankRow(r, row);
    if (row[0] == 0) { lhId[r] = id; lhRank[id] = r as u16; id++; }
  }
  let out = new StaticArray<u8>(N);
  for (let i = 0; i < NLH; i++) {
    let hr = lhRank[i] as i32;
    for (let c = 0; c < N_CALLS; c++) {
      for (let k = 0; k < LEAD_LEN; k++) rowsT[(i * N_CALLS + c) * LEAD_LEN + k] = applyPk(hr, c, k, out);
      nextId[i * N_CALLS + c] = lhId[applyPk(hr, c, LEAD_LEN, out)];
    }
  }
  roundsId = lhId[0];
  // snapHeadId[c] = lhId of inverse of P[c][13]
  for (let c = 0; c < N_CALLS; c++) {
    let h = new StaticArray<u8>(N);
    for (let i = 0; i < N; i++) h[P[pIdx(c, 13, i)]] = i as u8;
    snapHeadId[c] = lhId[rankRow(h)];
  }
}

export function init(): void {
  FACT[0] = 1;
  for (let i = 1; i <= N; i++) FACT[i] = FACT[i - 1] * i;
  buildMethod();
  buildTables();
}

function buildDP(n: i32): void {
  DPN = n;
  CF = new StaticArray<u8>((n + 1) * NLH * 2);
  for (let id = 0; id < NLH; id++) {
    for (let c = 0; c < N_CALLS; c++) {
      let par = (c == SINGLE) ? 1 : 0;
      if (nextId[id * N_CALLS + c] == roundsId) CF[1 * NLH * 2 + id * 2 + par] = 1;
      if (id == snapHeadId[c]) CF[1 * NLH * 2 + id * 2 + par] = 1;
    }
  }
  for (let k = 2; k <= n; k++) {
    for (let id = 0; id < NLH; id++) {
      for (let par = 0; par < 2; par++) {
        let v: u8 = 0;
        for (let c = 0; c < N_CALLS && v == 0; c++) {
          let np = par ^ ((c == SINGLE) ? 1 : 0);
          v |= CF[(k - 1) * NLH * 2 + nextId[id * N_CALLS + c] * 2 + np];
        }
        CF[k * NLH * 2 + id * 2 + par] = v;
      }
    }
  }
  within = new StaticArray<u8>(NLH * (n + 1));
  for (let id = 0; id < NLH; id++) {
    let acc: u8 = 0;
    for (let r = 0; r <= n; r++) {
      if (r >= 1) { if (cf(r, id, 0) != 0 || cf(r, id, 1) != 0) acc = 1; }
      within[id * (n + 1) + r] = acc;
    }
  }
}

let g_maxN: i32 = 0;
let g_depthCalls: i32 = 0; // current number of calls (leads) on the stack

function record(snap: bool): void {
  let leads = g_depthCalls;
  if (snap) countSnap[leads]++; else countLead[leads]++;
}

function dfs(node: i32, depth: i32, par: i32): void {
  let budget = g_maxN - depth;
  if (!finishWithin(node, budget)) return;
  for (let c = 0; c < N_CALLS; c++) {
    let base = (node * N_CALLS + c) * LEAD_LEN;
    // snap finish: rounds at row 13
    if (rowsT[base + 13] == 0) {
      let ok = true;
      for (let k = 0; k <= 12 && ok; k++) if (bTest(rowsT[base + k])) ok = false;
      if (ok) { g_depthCalls++; record(true); g_depthCalls--; }
      continue;
    }
    let ok = true;
    for (let k = 0; k < LEAD_LEN && ok; k++) if (bTest(rowsT[base + k])) ok = false;
    if (!ok) continue;
    for (let k = 0; k < LEAD_LEN; k++) bSet(rowsT[base + k]);
    g_depthCalls++;
    let nxt = nextId[node * N_CALLS + c];
    let np = par ^ ((c == SINGLE) ? 1 : 0);
    if (nxt == roundsId) record(false);
    else if (depth + 1 < g_maxN) dfs(nxt, depth + 1, np);
    g_depthCalls--;
    for (let k = 0; k < LEAD_LEN; k++) bReset(rowsT[base + k]);
  }
}

// Count all true come-round touches up to n leads; returns total.
export function count(n: i32): u64 {
  g_maxN = n;
  for (let i = 0; i < 128; i++) { countLead[i] = 0; countSnap[i] = 0; }
  for (let i = 0; i < WORDS; i++) used[i] = 0;
  buildDP(n);
  g_depthCalls = 0;
  dfs(roundsId, 0, 0);
  let total: u64 = 0;
  for (let i = 0; i < 128; i++) total += countLead[i] + countSnap[i];
  return total;
}
export function countLeadAt(L: i32): u64 { return countLead[L]; }
export function countSnapAt(L: i32): u64 { return countSnap[L]; }

// trivial round-trip for boundary-overhead measurement
export function noop(x: i32): i32 { return x + 1; }
