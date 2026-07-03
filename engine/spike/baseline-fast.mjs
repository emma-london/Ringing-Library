// Hand-optimized pure-JS baseline: identical algorithm to baseline.mjs but with a
// Uint32Array bitset (two 32-bit words instead of BigInt) — the fairest JS the
// spike compares wasm against, so ADR-0017's speedup number is not inflated by
// BigInt overhead.
const N = 7, FACT_N = 5040, LEAD_LEN = 14, N_CALLS = 3, NLH = 720, SINGLE = 2;
const FACT = new Int32Array(N + 1);
const P = new Uint8Array(N_CALLS * (LEAD_LEN + 1) * N);
const pIdx = (c, k, i) => (c * (LEAD_LEN + 1) + k) * N + i;
const lhId = new Int32Array(FACT_N);
const lhRank = new Uint16Array(NLH);
const nextId = new Int32Array(NLH * N_CALLS);
const rowsT = new Uint16Array(NLH * N_CALLS * LEAD_LEN);
const snapHeadId = new Int32Array(N_CALLS);
let roundsId = 0;
const used = new Uint32Array(158); // 158*32 = 5056 bits
const bTest = (r) => (used[r >> 5] & (1 << (r & 31))) !== 0;
const bSet = (r) => { used[r >> 5] |= (1 << (r & 31)); };
const bReset = (r) => { used[r >> 5] &= ~(1 << (r & 31)); };
let DPN = 0, CF = new Uint8Array(0), within = new Uint8Array(0);
const cf = (k, id, par) => CF[k * NLH * 2 + id * 2 + par];
function finishWithin(id, r) { if (r < 0) return false; if (r > DPN) r = DPN; return within[id * (DPN + 1) + r] !== 0; }
const countLead = new Float64Array(128), countSnap = new Float64Array(128);
const scratchA = new Uint8Array(N), scratchB = new Uint8Array(N);
function rankRow(r) { let k = 0; for (let i = 0; i < N; i++) { let s = 0; for (let j = i + 1; j < N; j++) if (r[j] < r[i]) s++; k += s * FACT[N - 1 - i]; } return k; }
function unrankRow(rk, out) { const a = scratchB; for (let i = 0; i < N; i++) a[i] = i; let na = N; for (let i = 0; i < N; i++) { const f = FACT[N - 1 - i], d = (rk / f) | 0; rk = rk % f; out[i] = a[d]; for (let t = d; t < na - 1; t++) a[t] = a[t + 1]; na--; } }
function changeFromPlaces(pl, out) { const isP = new Uint8Array(N); for (const p of pl) isP[p] = 1; let i = 0; while (i < N) { if (isP[i]) { out[i] = i; i++; } else { out[i] = i + 1; out[i + 1] = i; i += 2; } } }
function buildMethod() { const common = [[2],[0],[6],[0],[6],[0],[6],[0],[6],[0],[6],[0]]; const tailA = [[6],[2],[2]], tailB = [[0],[0],[0,1,2]]; const id = new Uint8Array(N); for (let i = 0; i < N; i++) id[i] = i; const ch = new Uint8Array(LEAD_LEN * N), cs = new Uint8Array(N); for (let c = 0; c < N_CALLS; c++) { for (let k = 0; k < 12; k++) { changeFromPlaces(common[k], cs); for (let i = 0; i < N; i++) ch[k * N + i] = cs[i]; } changeFromPlaces(tailA[c], cs); for (let i = 0; i < N; i++) ch[12 * N + i] = cs[i]; changeFromPlaces(tailB[c], cs); for (let i = 0; i < N; i++) ch[13 * N + i] = cs[i]; for (let i = 0; i < N; i++) P[pIdx(c, 0, i)] = id[i]; for (let k = 1; k <= LEAD_LEN; k++) for (let i = 0; i < N; i++) { const qi = ch[(k - 1) * N + i]; P[pIdx(c, k, i)] = P[pIdx(c, k - 1, qi)]; } } }
function applyPk(h, c, k, out) { unrankRow(h, scratchA); for (let i = 0; i < N; i++) out[i] = scratchA[P[pIdx(c, k, i)]]; return rankRow(out); }
function buildTables() { lhId.fill(-1); let id = 0; const row = new Uint8Array(N); for (let r = 0; r < FACT_N; r++) { unrankRow(r, row); if (row[0] === 0) { lhId[r] = id; lhRank[id] = r; id++; } } const out = new Uint8Array(N); for (let i = 0; i < NLH; i++) { const hr = lhRank[i]; for (let c = 0; c < N_CALLS; c++) { for (let k = 0; k < LEAD_LEN; k++) rowsT[(i * N_CALLS + c) * LEAD_LEN + k] = applyPk(hr, c, k, out); nextId[i * N_CALLS + c] = lhId[applyPk(hr, c, LEAD_LEN, out)]; } } roundsId = lhId[0]; for (let c = 0; c < N_CALLS; c++) { const h = new Uint8Array(N); for (let i = 0; i < N; i++) h[P[pIdx(c, 13, i)]] = i; snapHeadId[c] = lhId[rankRow(h)]; } }
export function init() { FACT[0] = 1; for (let i = 1; i <= N; i++) FACT[i] = FACT[i - 1] * i; buildMethod(); buildTables(); }
function buildDP(n) { DPN = n; CF = new Uint8Array((n + 1) * NLH * 2); for (let id = 0; id < NLH; id++) for (let c = 0; c < N_CALLS; c++) { const par = c === SINGLE ? 1 : 0; if (nextId[id * N_CALLS + c] === roundsId) CF[NLH * 2 + id * 2 + par] = 1; if (id === snapHeadId[c]) CF[NLH * 2 + id * 2 + par] = 1; } for (let k = 2; k <= n; k++) for (let id = 0; id < NLH; id++) for (let par = 0; par < 2; par++) { let v = 0; for (let c = 0; c < N_CALLS && !v; c++) { const np = par ^ (c === SINGLE ? 1 : 0); v |= CF[(k - 1) * NLH * 2 + nextId[id * N_CALLS + c] * 2 + np]; } CF[k * NLH * 2 + id * 2 + par] = v; } within = new Uint8Array(NLH * (n + 1)); for (let id = 0; id < NLH; id++) { let acc = 0; for (let r = 0; r <= n; r++) { if (r >= 1) { if (cf(r, id, 0) || cf(r, id, 1)) acc = 1; } within[id * (n + 1) + r] = acc; } } }
let g_maxN = 0, g_depthCalls = 0;
function record(snap) { if (snap) countSnap[g_depthCalls]++; else countLead[g_depthCalls]++; }
function dfs(node, depth, par) { if (!finishWithin(node, g_maxN - depth)) return; for (let c = 0; c < N_CALLS; c++) { const base = (node * N_CALLS + c) * LEAD_LEN; if (rowsT[base + 13] === 0) { let ok = true; for (let k = 0; k <= 12 && ok; k++) if (bTest(rowsT[base + k])) ok = false; if (ok) { g_depthCalls++; record(true); g_depthCalls--; } continue; } let ok = true; for (let k = 0; k < LEAD_LEN && ok; k++) if (bTest(rowsT[base + k])) ok = false; if (!ok) continue; for (let k = 0; k < LEAD_LEN; k++) bSet(rowsT[base + k]); g_depthCalls++; const nxt = nextId[node * N_CALLS + c], np = par ^ (c === SINGLE ? 1 : 0); if (nxt === roundsId) record(false); else if (depth + 1 < g_maxN) dfs(nxt, depth + 1, np); g_depthCalls--; for (let k = 0; k < LEAD_LEN; k++) bReset(rowsT[base + k]); } }
export function count(n) { g_maxN = n; countLead.fill(0); countSnap.fill(0); used.fill(0); buildDP(n); g_depthCalls = 0; dfs(roundsId, 0, 0); let total = 0; for (let i = 0; i < 128; i++) total += countLead[i] + countSnap[i]; return total; }
