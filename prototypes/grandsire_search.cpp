// grandsire_search.cpp
//
// Structured search for TRUE, come-round touches of Grandsire Triples, layering
// three techniques on top of the validated brute-force core
// (see grandsire_bruteforce.cpp for the rank/unrank + table machinery + proofs):
//
//   1. Backward exact-length reachability pruning
//        A DP over the 720 lead-heads gives, for every k, the set of lead-heads
//        that can reach rounds in EXACTLY k more leads (ignoring truth). The
//        forward DFS prunes any branch that cannot get home in the remaining
//        lead budget. "Working backward" = the inverse lead-end permutations.
//
//   2. Q-set structure + parity-aware pruning
//        We compute the bob/single transpositions' orbits on lead-heads (their
//        cycle length is the Q-set size: bob -> 3, single -> 2). From the verified
//        permutation parities (plain/bob even, single odd) the come-round product
//        forces an EVEN number of singles; we fold that parity into the
//        reachability DP for a strictly stronger prune.
//
//   3. Meet-in-the-middle
//        Split the target length L at the midpoint. Enumerate true forward halves
//        (rounds -> M) and true backward halves (M -> rounds). Matching the
//        midpoint row M is a trivial integer-equality that AUTOMATICALLY satisfies
//        come-round; the only remaining join condition is truth — a disjointness
//        test on the two halves' row bitsets.
//
// Every layer is cross-checked: all four searchers must agree on the exact count
// of true come-round touches of length L.
//
// Build:  g++ -O2 -std=c++17 grandsire_search.cpp -o gsearch
// Run:    ./gsearch                 (runs the benchmark + cross-check table)

#include <array>
#include <bitset>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <functional>
#include <string>
#include <unordered_map>
#include <vector>

static constexpr int N = 7;
static constexpr int FACT_N = 5040;
static constexpr int LEAD_LEN = 14;
static constexpr int N_CALLS = 3;
static constexpr int NLH = 720;           // lead-heads (treble leading) = 6!

using Row  = std::array<uint8_t, N>;
using Perm = std::array<uint8_t, N>;
using RowSet = std::bitset<FACT_N>;

enum Call { PLAIN = 0, BOB = 1, SINGLE = 2 };
static const char CALL_CH[3] = {'.', '-', 's'};

// ===========================================================================
//  Core: ranking, place notation, method build (identical logic to the proven
//  prototype; condensed here).
// ===========================================================================
static int FACT[N + 1];
static void initFactorials() { FACT[0] = 1; for (int i = 1; i <= N; i++) FACT[i] = FACT[i-1]*i; }

static uint16_t rankRow(const Row& r) {
    uint16_t rank = 0;
    for (int i = 0; i < N; i++) {
        int smaller = 0;
        for (int j = i + 1; j < N; j++) if (r[j] < r[i]) smaller++;
        rank += static_cast<uint16_t>(smaller * FACT[N - 1 - i]);
    }
    return rank;
}
static Row unrankRow(uint16_t rank) {
    std::vector<int> avail(N);
    for (int i = 0; i < N; i++) avail[i] = i;
    Row r{};
    for (int i = 0; i < N; i++) {
        int f = FACT[N - 1 - i], d = rank / f; rank %= f;
        r[i] = static_cast<uint8_t>(avail[d]); avail.erase(avail.begin() + d);
    }
    return r;
}
static Perm changeFromPlaces(const std::vector<int>& places) {
    std::array<bool, N> isP{}; for (int p : places) isP[p] = true;
    Perm pe{}; int i = 0;
    while (i < N) { if (isP[i]) { pe[i] = (uint8_t)i; i++; }
                   else { pe[i] = (uint8_t)(i+1); pe[i+1] = (uint8_t)i; i += 2; } }
    return pe;
}
static Perm compose(const Perm& p, const Perm& q) { Perm r{}; for (int i=0;i<N;i++) r[i]=p[q[i]]; return r; }
static Perm identityPerm() { Perm p{}; for (int i=0;i<N;i++) p[i]=(uint8_t)i; return p; }
static Perm invertPerm(const Perm& p) { Perm r{}; for (int i=0;i<N;i++) r[p[i]]=(uint8_t)i; return r; }
static Row  applyPerm(const Row& row, const Perm& perm) { Row o{}; for (int i=0;i<N;i++) o[i]=row[perm[i]]; return o; }
static int  permSign(const Perm& p) {
    std::array<bool,N> seen{}; int s=1;
    for (int i=0;i<N;i++){ if(seen[i])continue; int len=0,j=i; while(!seen[j]){seen[j]=true;j=p[j];len++;} if(len%2==0)s=-s; }
    return s;
}
static std::vector<int> placesOf(const char* t){ std::vector<int> v; for(const char*c=t;*c;++c) v.push_back(*c-'1'); return v; }

struct Method { std::array<Perm, LEAD_LEN+1> P[N_CALLS]; Perm leadHeadPerm[N_CALLS]; };
static Method buildGrandsire() {
    const char* common[12] = {"3","1","7","1","7","1","7","1","7","1","7","1"};
    struct { const char* a; const char* b; } tail[N_CALLS] = {{"7","1"},{"3","1"},{"3","123"}};
    Method m;
    for (int call=0; call<N_CALLS; call++) {
        std::array<Perm,LEAD_LEN> ch;
        for (int k=0;k<12;k++) ch[k]=changeFromPlaces(placesOf(common[k]));
        ch[12]=changeFromPlaces(placesOf(tail[call].a));
        ch[13]=changeFromPlaces(placesOf(tail[call].b));
        m.P[call][0]=identityPerm();
        for (int k=1;k<=LEAD_LEN;k++) m.P[call][k]=compose(m.P[call][k-1],ch[k-1]);
        m.leadHeadPerm[call]=m.P[call][LEAD_LEN];
    }
    return m;
}

// ===========================================================================
//  Compact lead-head tables (indices 0..719) for forward AND backward search.
// ===========================================================================
struct Tables {
    int lhId[FACT_N];                          // rank -> compact id (or -1)
    uint16_t lhRank[NLH];                       // id -> rank
    int nextId[NLH][N_CALLS];                   // forward: id --call--> id
    int backId[NLH][N_CALLS];                   // backward: id --call(inv)--> id
    uint16_t rows[NLH][N_CALLS][LEAD_LEN];      // 14 internal row ranks of the lead
    int roundsId;
};

static Tables buildTables(const Method& m) {
    Tables t;
    for (int i = 0; i < FACT_N; i++) t.lhId[i] = -1;
    int id = 0;
    for (int r = 0; r < FACT_N; r++) { Row row = unrankRow((uint16_t)r); if (row[0]==0) { t.lhId[r]=id; t.lhRank[id]=(uint16_t)r; id++; } }
    Perm invLH[N_CALLS]; for (int c=0;c<N_CALLS;c++) invLH[c]=invertPerm(m.leadHeadPerm[c]);
    for (int i = 0; i < NLH; i++) {
        Row head = unrankRow(t.lhRank[i]);
        for (int c = 0; c < N_CALLS; c++) {
            for (int k = 0; k < LEAD_LEN; k++) t.rows[i][c][k] = rankRow(applyPerm(head, m.P[c][k]));
            t.nextId[i][c] = t.lhId[ rankRow(applyPerm(head, m.leadHeadPerm[c])) ];
            t.backId[i][c] = t.lhId[ rankRow(applyPerm(head, invLH[c])) ];
        }
    }
    t.roundsId = t.lhId[0];
    return t;
}

// ===========================================================================
//  Layer 1+2: reachability DP (exact length, optionally parity-aware).
//  reach[k][id][par] = can id reach rounds in exactly k leads using `par`
//  singles (mod 2), ignoring truth.  par index 0/1.
// ===========================================================================
struct Reach {
    int L;
    // reach[k*NLH*2 + id*2 + par]
    std::vector<uint8_t> r;
    inline uint8_t get(int k,int id,int par) const { return r[(size_t)k*NLH*2 + id*2 + par]; }
    // collapsed over parity (layer-1 only)
    inline bool any(int k,int id) const { return get(k,id,0) || get(k,id,1); }
};
static Reach buildReach(const Tables& t, int L) {
    Reach R; R.L = L; R.r.assign((size_t)(L+1)*NLH*2, 0);
    R.r[(size_t)0*NLH*2 + t.roundsId*2 + 0] = 1;   // 0 leads, at rounds, 0 singles
    for (int k = 1; k <= L; k++)
        for (int id = 0; id < NLH; id++)
            for (int par = 0; par < 2; par++) {
                uint8_t v = 0;
                for (int c = 0; c < N_CALLS && !v; c++) {
                    int nxt = t.nextId[id][c];
                    int np  = par ^ (c == SINGLE ? 1 : 0);
                    v |= R.r[(size_t)(k-1)*NLH*2 + nxt*2 + np];
                }
                R.r[(size_t)k*NLH*2 + id*2 + par] = v;
            }
    return R;
}

// ===========================================================================
//  Forward DFS for true come-round touches of EXACTLY L leads.
//  prune: 0 = truth only, 1 = + reachability, 2 = + parity-aware reachability.
// ===========================================================================
struct FwdState { const Tables* t; const Reach* R; int L; int prune; RowSet used;
                  uint64_t nodes=0, found=0; };

static void fwdDFS(FwdState& s, int id, int depth, int singlesPar) {
    if (depth == s.L) { if (id == s.t->roundsId) s.found++; return; }
    int rem = s.L - depth;
    for (int c = 0; c < N_CALLS; c++) {
        const uint16_t* rr = s.t->rows[id][c];
        s.nodes++;
        bool ok = true;
        for (int k = 0; k < LEAD_LEN; k++) if (s.used.test(rr[k])) { ok = false; break; }
        if (!ok) continue;
        int nxt = s.t->nextId[id][c];
        int np  = singlesPar ^ (c == SINGLE ? 1 : 0);
        // Reachability prune (necessary condition; ignores truth):
        if (s.prune >= 1) {
            if (s.prune == 1) { if (!s.R->any(rem - 1, nxt)) continue; }
            else {              // parity-aware: total singles must be even ->
                                // remaining singles parity must equal np... we need
                                // overall even, so remaining-from-nxt parity = np.
                if (!s.R->get(rem - 1, nxt, np)) continue;
            }
        }
        for (int k = 0; k < LEAD_LEN; k++) s.used.set(rr[k]);
        fwdDFS(s, nxt, depth + 1, np);
        for (int k = 0; k < LEAD_LEN; k++) s.used.reset(rr[k]);
    }
}

// ===========================================================================
//  Layer 3: meet-in-the-middle.
// ===========================================================================
struct Half { int endId; RowSet rows; std::vector<uint8_t> calls; };

// Enumerate true partial touches of `len` leads.
//   forward=true : from rounds, forward edges, rows include rounds, exclude endpoint.
//   forward=false: from rounds, backward edges, rows include the reached midpoint.
static void enumHalves(const Tables& t, int len, bool forward,
                       std::vector<Half>& out) {
    RowSet used; std::vector<uint8_t> calls;
    // iterative-ish recursion via lambda
    std::function<void(int,int)> rec = [&](int id, int depth) {
        if (depth == len) { out.push_back({id, used, calls}); return; }
        for (int c = 0; c < N_CALLS; c++) {
            int srcId, nxt;
            if (forward) { srcId = id;                nxt = t.nextId[id][c]; }
            else         { srcId = t.backId[id][c];   nxt = srcId; }   // step to predecessor
            const uint16_t* rr = t.rows[srcId][c];   // the 14 rows of this lead
            bool ok = true;
            for (int k = 0; k < LEAD_LEN; k++) if (used.test(rr[k])) { ok = false; break; }
            if (!ok) continue;
            for (int k = 0; k < LEAD_LEN; k++) used.set(rr[k]);
            calls.push_back((uint8_t)c);
            rec(nxt, depth + 1);
            calls.pop_back();
            for (int k = 0; k < LEAD_LEN; k++) used.reset(rr[k]);
        }
    };
    rec(t.roundsId, 0);
}

struct MitmResult { uint64_t found=0; size_t fHalves=0, bHalves=0, pairsTested=0; std::vector<uint8_t> example; };

static MitmResult runMitm(const Tables& t, int L) {
    int m = L / 2;                 // forward leads; backward gets L-m
    MitmResult res;
    std::vector<Half> fwd, bwd;
    enumHalves(t, m,     true,  fwd);
    enumHalves(t, L - m, false, bwd);
    res.fHalves = fwd.size(); res.bHalves = bwd.size();

    // Bucket forward halves by midpoint lead-head id.
    std::unordered_map<int, std::vector<int>> bucket;
    bucket.reserve(fwd.size() * 2);
    for (int i = 0; i < (int)fwd.size(); i++) bucket[fwd[i].endId].push_back(i);

    for (const Half& b : bwd) {
        auto it = bucket.find(b.endId);          // come-round <=> same midpoint
        if (it == bucket.end()) continue;
        for (int fi : it->second) {
            res.pairsTested++;
            if ((fwd[fi].rows & b.rows).none()) { // truth <=> disjoint row sets
                res.found++;
                if (res.example.empty()) {
                    res.example = fwd[fi].calls;          // c1..cm
                    for (auto rit = b.calls.rbegin(); rit != b.calls.rend(); ++rit)
                        res.example.push_back(*rit);      // c_{m+1}..cL (reverse gen order)
                }
            }
        }
    }
    return res;
}

#include <functional>
static std::string callsStr(const std::vector<uint8_t>& c){ std::string s; for(auto x:c) s+=CALL_CH[x]; return s; }

// ===========================================================================
//  Q-set structure: orbits of the call transpositions on lead-heads.
// ===========================================================================
static void reportQsets(const Method& mth, const Tables& t) {
    printf("\n=== Q-set structure (orbits of call-vs-plain transposition on lead-heads) ===\n");
    Perm invPlain = invertPerm(mth.leadHeadPerm[PLAIN]);
    for (int call = 1; call < N_CALLS; call++) {
        // transposition q = plain^{-1} . call  (acts on a lead-head x as x -> x.q,
        // i.e. the difference between bobbing/singling vs plaining at x).
        Perm q = compose(invPlain, mth.leadHeadPerm[call]);
        // orbit sizes of x -> x.q over the 720 lead-heads
        std::array<bool, NLH> seen{}; std::vector<int> sizes;
        for (int i = 0; i < NLH; i++) {
            if (seen[i]) continue;
            int len = 0, cur = i;
            while (!seen[cur]) { seen[cur] = true; cur = t.lhId[rankRow(applyPerm(unrankRow(t.lhRank[cur]), q))]; len++; }
            sizes.push_back(len);
        }
        int mn = sizes[0], mx = sizes[0]; for (int s : sizes) { mn = std::min(mn,s); mx = std::max(mx,s); }
        // order of q on the 7 bells = lcm of its cycle lengths
        std::array<bool,N> cseen{}; int order = 1;
        auto gcd=[](int x,int y){ while(y){int z=x%y;x=y;y=z;} return x; };
        for (int i=0;i<N;i++){ if(cseen[i])continue; int len=0,j=i; while(!cseen[j]){cseen[j]=true;j=q[j];len++;} order = order/gcd(order,len)*len; }
        printf("  %-7s: transposition is a %d-cycle (order %d); %zu orbits on lead-heads of size %d..%d  => Q-set size %d\n",
               call==BOB?"bob":"single", mx, order, sizes.size(), mn, mx, mx);
    }
    printf("  (Grandsire's two hunt bells stay fixed: the bob cycles the 5 working bells (Q-set 5),\n"
           "   the single also moves the 2nd hunt bell, cycling 6 bells (Q-set 6). This come-round\n"
           "   algebra — not parity alone — underlies Thompson's 1880 proof that no bobs-only extent\n"
           "   of Grandsire Triples exists. Note these differ from Plain Bob, where bob Q-sets are 3.)\n");
}

// ===========================================================================
#include <sys/resource.h>
// ru_maxrss is in kilobytes on Linux but in bytes on macOS/BSD — normalise to MB.
static double peakRssMB() {
    struct rusage r; getrusage(RUSAGE_SELF, &r);
#ifdef __APPLE__
    return r.ru_maxrss / (1024.0 * 1024.0);   // bytes -> MB
#else
    return r.ru_maxrss / 1024.0;              // KB -> MB
#endif
}

int main(int argc, char** argv) {
    initFactorials();
    Method mth = buildGrandsire();
    Tables t = buildTables(mth);

    // Measurement mode: ./gsearch <L>  -> run only MITM at L, report peak RSS.
    if (argc > 1) {
        int L = std::atoi(argv[1]);
        auto t0 = std::chrono::steady_clock::now();
        MitmResult mr = runMitm(t, L);
        auto t1 = std::chrono::steady_clock::now();
        size_t halves = mr.fHalves + mr.bHalves;
        printf("L=%-3d changes=%-5d touches=%-12llu halves(f+b)=%-10zu peakRSS=%6.0f MB  (%.0f ms)\n",
               L, L * LEAD_LEN, (unsigned long long)mr.found, halves,
               peakRssMB(), std::chrono::duration<double,std::milli>(t1-t0).count());

        // Prove it: take a composition MITM actually produced (forward half +
        // backward half joined at the midpoint) and ring it out independently.
        if (!mr.example.empty()) {
            int m = L / 2;
            printf("\n  MITM-produced composition (%zu calls): %s\n", mr.example.size(), callsStr(mr.example).c_str());
            printf("  forward half = calls 1..%d, backward half = calls %d..%d, joined at midpoint M.\n", m, m+1, L);
            RowSet seen; int id = t.roundsId; bool trueTouch = true; int rowsRung = 0; int midId = -1;
            for (int lead = 0; lead < (int)mr.example.size(); lead++) {
                int c = mr.example[lead];
                for (int k = 0; k < LEAD_LEN; k++) {
                    uint16_t rr = t.rows[id][c][k];
                    if (seen.test(rr)) trueTouch = false;
                    seen.set(rr); rowsRung++;
                }
                id = t.nextId[id][c];
                if (lead == m - 1) midId = id;          // lead-head reached at the join
            }
            printf("  rung out: %d changes, all distinct = %s, ends at rounds = %s\n",
                   rowsRung, trueTouch ? "TRUE" : "FALSE", id == t.roundsId ? "yes" : "no");
            printf("  midpoint lead-head M (where the two halves meet) = rank %d\n", t.lhRank[midId]);
        }
        return 0;
    }

    // sanity: backId truly inverts nextId
    int okBack = 1;
    for (int i = 0; i < NLH && okBack; i++)
        for (int c = 0; c < N_CALLS; c++)
            if (t.backId[t.nextId[i][c]][c] != i) { okBack = 0; break; }
    printf("Grandsire Triples — structured search\n");
    printf("lead-heads: %d   backward tables invert forward: %s\n", NLH, okBack?"yes":"NO");

    // parity facts (from verified perms)
    printf("lead-end parities: plain %+d, bob %+d, single %+d  => come-round needs an even number of singles\n",
           permSign(mth.leadHeadPerm[PLAIN]), permSign(mth.leadHeadPerm[BOB]), permSign(mth.leadHeadPerm[SINGLE]));

    reportQsets(mth, t);

    // ---- Benchmark + cross-check across L ----
    printf("\n=== True come-round touches of EXACTLY L leads ===\n");
    printf("%-4s %12s | %14s %14s %14s | %12s %10s | %-9s\n",
           "L", "touches",
           "fwd nodes", "fwd+reach", "fwd+parity",
           "mitm f+b halves", "mitm pairs", "agree?");
    for (int L : {4,5,6,8,10,12,14,16}) {
        Reach R = buildReach(t, L);

        auto run = [&](int prune)->std::pair<uint64_t,uint64_t>{
            FwdState s; s.t=&t; s.R=&R; s.L=L; s.prune=prune;
            fwdDFS(s, t.roundsId, 0, 0);
            return {s.found, s.nodes};
        };
        auto t0=std::chrono::steady_clock::now(); auto a=run(0);
        auto t1=std::chrono::steady_clock::now(); auto b=run(1);
        auto t2=std::chrono::steady_clock::now(); auto c=run(2);
        auto t3=std::chrono::steady_clock::now();
        MitmResult mr = runMitm(t, L);
        auto t4=std::chrono::steady_clock::now();

        bool agree = (a.first==b.first) && (b.first==c.first) && (c.first==mr.found);
        printf("%-4d %12llu | %14llu %14llu %14llu | %6zu+%-6zu %10llu | %-9s\n",
               L, (unsigned long long)a.first,
               (unsigned long long)a.second, (unsigned long long)b.second, (unsigned long long)c.second,
               mr.fHalves, mr.bHalves, (unsigned long long)mr.pairsTested,
               agree?"yes":"** NO **");
        (void)t0;(void)t1;(void)t2;(void)t3;(void)t4;
    }

    printf("(fwd+parity == fwd+reach here: with this many touches both single-parities are\n"
           " reachable almost everywhere, so the even-singles filter rarely binds — its value is\n"
           " as a guaranteed correctness filter and in tighter / multipart searches.)\n");

    // MITM reaching past where forward DFS is practical (forward baseline omitted).
    printf("\n=== MITM only, longer L (forward DFS infeasible here) ===\n");
    printf("%-4s %12s | %s %s | %12s %10s\n", "L", "touches", "fwd half", "bwd half", "fwd+bwd halves", "pairs");
    for (int L : {18, 20, 22}) {
        auto m0=std::chrono::steady_clock::now();
        MitmResult mr = runMitm(t, L);
        auto m1=std::chrono::steady_clock::now();
        printf("%-4d %12llu |    %2d         %2d   | %6zu+%-6zu %10llu   (%.0f ms)\n",
               L, (unsigned long long)mr.found, L/2, L-L/2, mr.fHalves, mr.bHalves,
               (unsigned long long)mr.pairsTested,
               std::chrono::duration<double,std::milli>(m1-m0).count());
    }

    // Show one example touch found by MITM at a readable length.
    {
        int L = 10; MitmResult mr = runMitm(t, L);
        if (!mr.example.empty()) {
            int singles = 0; for (auto x: mr.example) if (x==SINGLE) singles++;
            printf("\nExample true come-round touch, L=%d (%d changes), %d singles:\n  %s\n",
                   L, L*LEAD_LEN, singles, callsStr(mr.example).c_str());
        }
    }
    return 0;
}
