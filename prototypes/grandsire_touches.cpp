// grandsire_touches.cpp
//
// Print every TRUE touch of Grandsire Triples that ends in rounds, up to N leads
// long. Output is ordered by length (shortest first), then by calling.
//
//   . = plain lead    - = bob    s = single        (1 lead = 14 changes)
//
// A "true touch ending in rounds" is a sequence of leads from rounds that repeats
// no row and returns to rounds.
//
// IMPORTANT — snap finishes: the treble makes two blows at lead, so it is in 1st
// place at BOTH row 13 and row 14 of every lead. Rounds can therefore come up at
// row 13 — one change before the lead-end — which is a valid "snap" finish
// (e.g. SPSPSBP). The search checks row 13 as well as the lead-end (row 14);
// these are the only two places rounds can appear (besides the start), because
// the treble leads nowhere else in the lead. A snap finish rings 13 changes in
// its final lead, so its length is 14*(leads) - 1 changes.
//
// Build:  g++ -O2 -std=c++17 grandsire_touches.cpp -o touches
// Run:    ./touches N        (N = maximum length in leads; default 6)

#include <algorithm>
#include <array>
#include <bitset>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

static constexpr int N = 7;
static constexpr int FACT_N = 5040;
static constexpr int LEAD_LEN = 14;
static constexpr int N_CALLS = 3;
enum Call { PLAIN = 0, BOB = 1, SINGLE = 2 };
static const char CALL_CH[3] = {'.', '-', 's'};

using Row  = std::array<uint8_t, N>;
using Perm = std::array<uint8_t, N>;

// --- ranking (Lehmer code) — only rank() is needed here ---
static int FACT[N + 1];
static uint16_t rankRow(const Row& r) {
    uint16_t rank = 0;
    for (int i = 0; i < N; i++) {
        int sm = 0;
        for (int j = i + 1; j < N; j++) if (r[j] < r[i]) sm++;
        rank += (uint16_t)(sm * FACT[N - 1 - i]);
    }
    return rank;
}

// --- place notation -> permutation, and the three lead-end transforms ---
static Perm changeFromPlaces(const std::vector<int>& pl) {
    std::array<bool, N> isP{}; for (int p : pl) isP[p] = true;
    Perm pe{}; int i = 0;
    while (i < N) { if (isP[i]) { pe[i] = (uint8_t)i; i++; }
                   else { pe[i] = (uint8_t)(i+1); pe[i+1] = (uint8_t)i; i += 2; } }
    return pe;
}
static Perm compose(const Perm& p, const Perm& q) { Perm r{}; for (int i=0;i<N;i++) r[i]=p[q[i]]; return r; }
static Row  applyPerm(const Row& row, const Perm& p) { Row o{}; for (int i=0;i<N;i++) o[i]=row[p[i]]; return o; }
static std::vector<int> placesOf(const char* t){ std::vector<int> v; for(const char*c=t;*c;++c) v.push_back(*c-'1'); return v; }

// P[call][k] = product of the first k changes of the lead (k = 0..14).
static std::array<std::array<Perm, LEAD_LEN + 1>, N_CALLS> buildMethod() {
    const char* common[12] = {"3","1","7","1","7","1","7","1","7","1","7","1"};
    struct { const char* a; const char* b; } tail[N_CALLS] = {{"7","1"},{"3","1"},{"3","123"}};
    std::array<std::array<Perm, LEAD_LEN + 1>, N_CALLS> P;
    Perm id{}; for (int i=0;i<N;i++) id[i]=(uint8_t)i;
    for (int c = 0; c < N_CALLS; c++) {
        std::array<Perm, LEAD_LEN> ch;
        for (int k=0;k<12;k++) ch[k]=changeFromPlaces(placesOf(common[k]));
        ch[12]=changeFromPlaces(placesOf(tail[c].a));
        ch[13]=changeFromPlaces(placesOf(tail[c].b));
        P[c][0]=id;
        for (int k=1;k<=LEAD_LEN;k++) P[c][k]=compose(P[c][k-1],ch[k-1]);
    }
    return P;
}

// --- search state ---
struct Touch { std::vector<uint8_t> calls; bool snap; };
static std::array<std::array<Perm, LEAD_LEN + 1>, N_CALLS> P;
static std::bitset<FACT_N> used;
static std::vector<uint8_t> calls;
static std::vector<Touch> touches;
static int maxLeads;

static void dfs(const Row& head, int depth) {
    if (depth >= maxLeads) return;
    for (int c = 0; c < N_CALLS; c++) {
        // Snap finish? Rounds at row 13 (one change before the lead-end).
        if (rankRow(applyPerm(head, P[c][13])) == 0) {
            bool ok = true;                       // rows 0..12 of this short lead must be true
            for (int k = 0; k <= 12 && ok; k++)
                if (used.test(rankRow(applyPerm(head, P[c][k])))) ok = false;
            if (ok) { calls.push_back((uint8_t)c); touches.push_back({calls, true}); calls.pop_back(); }
            continue;                             // a full lead here would repeat rounds -> false
        }
        // Normal lead: rank rows 0..13, bail on the first repeat.
        uint16_t rr[LEAD_LEN];
        bool ok = true;
        for (int k = 0; k < LEAD_LEN; k++) {
            rr[k] = rankRow(applyPerm(head, P[c][k]));
            if (used.test(rr[k])) { ok = false; break; }
        }
        if (!ok) continue;
        for (int k = 0; k < LEAD_LEN; k++) used.set(rr[k]);
        calls.push_back((uint8_t)c);

        Row next = applyPerm(head, P[c][LEAD_LEN]);
        if (rankRow(next) == 0) touches.push_back({calls, false});  // lead-end finish
        else                    dfs(next, depth + 1);

        calls.pop_back();
        for (int k = 0; k < LEAD_LEN; k++) used.reset(rr[k]);
    }
}

static int lengthChanges(const Touch& t) {
    return (int)t.calls.size() * LEAD_LEN - (t.snap ? 1 : 0);
}

int main(int argc, char** argv) {
    FACT[0] = 1; for (int i = 1; i <= N; i++) FACT[i] = FACT[i-1]*i;
    maxLeads = (argc > 1) ? std::atoi(argv[1]) : 6;
    if (maxLeads < 1) { fprintf(stderr, "usage: %s N   (N = max length in leads >= 1)\n", argv[0]); return 1; }

    P = buildMethod();
    Row rounds{0,1,2,3,4,5,6};
    dfs(rounds, 0);

    // order by length (in changes), then by calling (plain < bob < single)
    std::sort(touches.begin(), touches.end(), [](const Touch& a, const Touch& b){
        int la = lengthChanges(a), lb = lengthChanges(b);
        if (la != lb) return la < lb;
        return a.calls < b.calls;
    });

    printf("True touches of Grandsire Triples ending in rounds, up to %d leads\n", maxLeads);
    printf(". = plain   - = bob   s = single   (1 lead = 14 changes; snap = comes round one change early)\n\n");
    printf("%8s %6s  %-7s %s\n", "changes", "leads", "finish", "calling");
    int curLen = -1, nSnap = 0;
    for (const auto& t : touches) {
        int len = lengthChanges(t);
        if (len != curLen) { curLen = len; printf("\n"); }
        if (t.snap) nSnap++;
        std::string s; for (uint8_t c : t.calls) s += CALL_CH[c];
        printf("%8d %6zu  %-7s %s\n", len, t.calls.size(), t.snap ? "snap" : "lead-end", s.c_str());
    }
    printf("\nTotal: %zu true come-round touches up to %d leads (%d at the snap).\n",
           touches.size(), maxLeads, nSnap);
    return 0;
}
