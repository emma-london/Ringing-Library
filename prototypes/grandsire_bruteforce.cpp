// grandsire_bruteforce.cpp
//
// Prototype: brute-force discovery of TRUE touches of Grandsire Triples, using
//   (1) factoradic (Lehmer-code) ranking of rows  -> dense integer in [0,5040),
//   (2) precomputed per-lead transition + internal-row tables (no change
//       arithmetic in the hot loop),
//   (3) a bitset-of-used-rows for O(1) incremental truth, with DFS pruning the
//       entire subtree the instant a row repeats.
//
// Conventions match the TS "Ringing Library": bells are 0-based (treble = 0),
// stage 7, place-notation tokens, rows are immutable permutations.
//
// Authoritative facts this file verifies itself against:
//   - Plain lead notation 3.1.7.1.7.1.7.1.7.1.7.1.7.1  (CCCBR / Blueline)
//   - Plain course = 5 leads, 70 distinct rows, returns to rounds
//   - Plain lead heads: 1253746, 1275634, 1267453, 1246375, 1234567
//   - Bob applied to rounds -> 1532746  (Heaton, "Conducting Grandsire Triples")
//   - Bob = CompLib "3.1 LE", Single = CompLib "3.123 LE"
//
// Build:  g++ -O2 -std=c++17 grandsire_bruteforce.cpp -o grandsire
// Run:    ./grandsire [maxLeads]      (default 8)

#include <array>
#include <bitset>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

static constexpr int N = 7;            // stage (triples)
static constexpr int FACT_N = 5040;    // 7!
static constexpr int LEAD_LEN = 14;    // changes per lead
static constexpr int N_CALLS = 3;      // plain, bob, single

using Row  = std::array<uint8_t, N>;   // a row / permutation (0 = treble)
using Perm = std::array<uint8_t, N>;   // a position-permutation: out[i] = in[perm[i]]

enum Call { PLAIN = 0, BOB = 1, SINGLE = 2 };
static const char  CALL_CH[3]   = {'.', '-', 's'};   // conventional shorthand

// --------------------------------------------------------------------------
// Factoradic rank / unrank (Lehmer code).  Dense bijection rows <-> [0,7!).
// rank() is O(n^2); for n<=8 that is a few dozen ops. We only ever call it at
// precompute time, never in the DFS hot loop.
// --------------------------------------------------------------------------
static int FACT[N + 1];

static void initFactorials() {
    FACT[0] = 1;
    for (int i = 1; i <= N; i++) FACT[i] = FACT[i - 1] * i;
}

static uint16_t rankRow(const Row& r) {
    uint16_t rank = 0;
    for (int i = 0; i < N; i++) {
        int smaller = 0;                          // Lehmer digit
        for (int j = i + 1; j < N; j++)
            if (r[j] < r[i]) smaller++;
        rank += static_cast<uint16_t>(smaller * FACT[N - 1 - i]);
    }
    return rank;
}

static Row unrankRowSafe(uint16_t rank) {
    std::vector<int> avail(N);
    for (int i = 0; i < N; i++) avail[i] = i;
    Row r{};
    for (int i = 0; i < N; i++) {
        int f = FACT[N - 1 - i];
        int d = rank / f;
        rank %= f;
        r[i] = static_cast<uint8_t>(avail[d]);
        avail.erase(avail.begin() + d);
    }
    return r;
}

// --------------------------------------------------------------------------
// Place notation -> position permutation.  out[i] = in[perm[i]].
// A token is the set of 0-based "places" (positions that stay); every other
// adjacent pair swaps. Treble = bell 0; place "1" = index 0, "7" = index 6.
// --------------------------------------------------------------------------
static Perm changeFromPlaces(const std::vector<int>& places) {
    std::array<bool, N> isPlace{};
    for (int p : places) isPlace[p] = true;
    Perm perm{};
    int i = 0;
    while (i < N) {
        if (isPlace[i]) { perm[i] = static_cast<uint8_t>(i); i++; }
        else {            // swap adjacent pair (i, i+1)
            perm[i]     = static_cast<uint8_t>(i + 1);
            perm[i + 1] = static_cast<uint8_t>(i);
            i += 2;
        }
    }
    return perm;
}

// Compose so that applying p then q to a row equals applying r=compose(p,q):
//   row1 = row0 . p ;  row2 = row1 . q = row0 . (p.q) ; (p.q)[i] = p[q[i]]
static Perm compose(const Perm& p, const Perm& q) {
    Perm r{};
    for (int i = 0; i < N; i++) r[i] = p[q[i]];
    return r;
}

static Perm identityPerm() {
    Perm p{};
    for (int i = 0; i < N; i++) p[i] = static_cast<uint8_t>(i);
    return p;
}

// Apply a position-perm to a row: out[i] = row[perm[i]]  (this is row . perm)
static Row applyPerm(const Row& row, const Perm& perm) {
    Row out{};
    for (int i = 0; i < N; i++) out[i] = row[perm[i]];
    return out;
}

static int permSign(const Perm& p) {           // +1 even, -1 odd
    std::array<bool, N> seen{};
    int sign = 1;
    for (int i = 0; i < N; i++) {
        if (seen[i]) continue;
        int len = 0, j = i;
        while (!seen[j]) { seen[j] = true; j = p[j]; len++; }
        if (len % 2 == 0) sign = -sign;
    }
    return sign;
}

static std::string rowToStr(const Row& r) {
    static const char* names = "1234567890ET";
    std::string s;
    for (int i = 0; i < N; i++) s += names[r[i]];
    return s;
}

// --------------------------------------------------------------------------
// Build the method.  For each call type we build P[0..LEAD_LEN], where
//   P[k] = c1 . c2 . ... . ck   (P[0] = identity),
// so a lead with head H has internal rows  r_k = H . P[k]  (k = 0..13)
// and the next lead head is  H . P[LEAD_LEN].
//
// Changes 1..12 are identical for all calls; only c13 and c14 differ:
//   plain : c13 = 7    c14 = 1
//   bob   : c13 = 3    c14 = 1
//   single: c13 = 3    c14 = 123
// --------------------------------------------------------------------------
struct Method {
    std::array<Perm, LEAD_LEN + 1> P[N_CALLS];   // P[call][0..14]
    Perm leadHeadPerm[N_CALLS];                  // = P[call][14]
};

static std::vector<int> placesOf(const char* tok) {
    // tok is one of "1","3","7","123"
    std::vector<int> places;
    for (const char* c = tok; *c; ++c) places.push_back(*c - '1');  // '1'->0 ...
    return places;
}

static Method buildGrandsire() {
    // The 14 change tokens for each call.
    const char* common[12] = {"3","1","7","1","7","1","7","1","7","1","7","1"};
    struct { const char* c13; const char* c14; } tail[N_CALLS] = {
        {"7", "1"},     // plain
        {"3", "1"},     // bob    (CompLib 3.1 LE)
        {"3", "123"},   // single (CompLib 3.123 LE)
    };

    Method m;
    for (int call = 0; call < N_CALLS; call++) {
        std::array<Perm, LEAD_LEN> ch;
        for (int k = 0; k < 12; k++) ch[k] = changeFromPlaces(placesOf(common[k]));
        ch[12] = changeFromPlaces(placesOf(tail[call].c13));   // c13
        ch[13] = changeFromPlaces(placesOf(tail[call].c14));   // c14

        m.P[call][0] = identityPerm();
        for (int k = 1; k <= LEAD_LEN; k++)
            m.P[call][k] = compose(m.P[call][k - 1], ch[k - 1]);
        m.leadHeadPerm[call] = m.P[call][LEAD_LEN];
    }
    return m;
}

// --------------------------------------------------------------------------
// Precomputed search tables, keyed by lead-head rank (0..5039; only the 720
// rows with the treble leading are ever used). For each (lead head, call):
//   next[h][call]      = rank of the next lead head
//   rows[h][call][0..13] = ranks of the 14 internal rows (the truth payload)
// With these, the DFS does zero permutation math: just table lookups + bitset.
// --------------------------------------------------------------------------
struct Tables {
    std::vector<std::array<uint16_t, N_CALLS>> next;                 // [5040]
    std::vector<std::array<std::array<uint16_t, LEAD_LEN>, N_CALLS>> rows; // [5040]
    std::vector<uint8_t> isLeadHead;                                 // [5040] bool
    int nLeadHeads = 0;
};

static Tables buildTables(const Method& m) {
    Tables t;
    t.next.assign(FACT_N, {});
    t.rows.assign(FACT_N, {});
    t.isLeadHead.assign(FACT_N, 0);

    for (int h = 0; h < FACT_N; h++) {
        Row head = unrankRowSafe(static_cast<uint16_t>(h));
        if (head[0] != 0) continue;        // treble must lead
        t.isLeadHead[h] = 1;
        t.nLeadHeads++;
        for (int call = 0; call < N_CALLS; call++) {
            for (int k = 0; k < LEAD_LEN; k++)
                t.rows[h][call][k] = rankRow(applyPerm(head, m.P[call][k]));
            t.next[h][call] = rankRow(applyPerm(head, m.leadHeadPerm[call]));
        }
    }
    return t;
}

// --------------------------------------------------------------------------
// Verification harness — fail loudly if any known fact is violated.
// --------------------------------------------------------------------------
static int g_checks = 0, g_fails = 0;
static void check(bool ok, const std::string& what) {
    g_checks++;
    if (!ok) { g_fails++; printf("  [FAIL] %s\n", what.c_str()); }
    else       printf("  [ ok ] %s\n", what.c_str());
}

static void verify(const Method& m, const Tables& t) {
    printf("\n=== Verification ===\n");

    // Plain lead head from rounds = 1253746.
    Row rounds{0,1,2,3,4,5,6};
    Row plainLH = applyPerm(rounds, m.leadHeadPerm[PLAIN]);
    check(rowToStr(plainLH) == "1253746", "plain lead head from rounds == 1253746");

    // Bob oracle (Heaton, "Conducting Grandsire Triples", Table 4): the bobbed
    // 5th lead, whose head is 1246375, produces 1532746 (vs plain's 1234567).
    // Verified independently by tracing the bob's internal changes: ...1.3.1
    // where plain rings ...1.7.1 (i.e. c13 = 7 -> 3).
    Row h5{0,1,3,5,2,6,4};   // 1246375 = head of the plain course's 5th lead
    Row bobFrom5 = applyPerm(h5, m.leadHeadPerm[BOB]);
    check(rowToStr(bobFrom5) == "1532746", "bob(1246375) == 1532746  (Heaton Table 4)");

    // Single: opposite parity to plain/bob (this is WHY singles are needed to
    // reach the whole extent).
    int sPlain = permSign(m.leadHeadPerm[PLAIN]);
    int sBob   = permSign(m.leadHeadPerm[BOB]);
    int sSing  = permSign(m.leadHeadPerm[SINGLE]);
    check(sPlain == sBob,  "plain & bob lead-end have equal parity");
    check(sSing == -sPlain, "single flips parity vs plain/bob");

    // Single oracle (Heaton, old-style conducting): at the first lead end the
    // bob gives coursing order 752346 and the single 572346 — i.e. single =
    // bob with bells 5 and 7 swapped. Check our rows show exactly that swap.
    Row bobLH  = applyPerm(rounds, m.leadHeadPerm[BOB]);     // 1752634
    Row singLH = applyPerm(rounds, m.leadHeadPerm[SINGLE]);  // 1572634
    int diff = 0, p5 = -1, p7 = -1;
    for (int i = 0; i < N; i++) {
        if (bobLH[i] != singLH[i]) diff++;
        if (bobLH[i] == 4) p5 = i;     // bell '5' (0-based 4)
        if (bobLH[i] == 6) p7 = i;     // bell '7' (0-based 6)
    }
    bool swap57 = (diff == 2 && singLH[p5] == 6 && singLH[p7] == 4);
    check(swap57, "single = bob with bells 5 and 7 swapped (Heaton coursing orders)");
    printf("         bob(rounds)=%s  single(rounds)=%s\n",
           rowToStr(bobLH).c_str(), rowToStr(singLH).c_str());

    // Plain course: 5 plain leads, must give the 5 documented lead heads,
    // 70 distinct rows, and return to rounds.
    const char* expected[5] = {"1253746","1275634","1267453","1246375","1234567"};
    std::bitset<FACT_N> used;
    Row head = rounds;
    bool lhOK = true, trueCourse = true;
    int rowsSeen = 0;
    for (int lead = 0; lead < 5; lead++) {
        uint16_t h = rankRow(head);
        for (int k = 0; k < LEAD_LEN; k++) {
            uint16_t rr = t.rows[h][PLAIN][k];
            if (used.test(rr)) trueCourse = false;
            used.set(rr);
            rowsSeen++;
        }
        head = unrankRowSafe(t.next[h][PLAIN]);
        if (rowToStr(head) != expected[lead]) lhOK = false;
    }
    check(lhOK, "plain course produces the 5 documented lead heads");
    check(trueCourse && rowsSeen == 70, "plain course is true with 70 distinct rows");
    check(rowToStr(head) == "1234567", "plain course comes round after 5 leads");
}

// --------------------------------------------------------------------------
// DFS: enumerate TRUE round blocks starting and ending at rounds.
// State = current lead head + the bitset of rows already used. We try each call
// at each lead; if the new lead's 14 rows are all unused we descend, otherwise
// the whole subtree is dead and we prune. A return to rounds at depth>=1 is a
// true round-block touch.
// --------------------------------------------------------------------------
struct Stats {
    uint64_t nodes = 0;         // lead-placements attempted
    uint64_t pruned = 0;        // placements rejected as false
    uint64_t trueBlocks = 0;    // round blocks found
    std::array<uint64_t, 64> blocksByLen{};  // round blocks of each length
    uint64_t bestLen = 0;
    std::vector<uint8_t> bestCalls;          // calls of the longest block found
};

static const Tables* T;
static int g_maxLeads;
static std::bitset<FACT_N>* g_used;
static std::vector<uint8_t>* g_calls;
static Stats* g_st;
static uint16_t ROUNDS_RANK;

static void dfs(uint16_t head, int depth) {
    for (int call = 0; call < N_CALLS; call++) {
        const auto& rr = T->rows[head][call];
        // Truth check: are any of the 14 rows already used?
        bool ok = true;
        for (int k = 0; k < LEAD_LEN; k++)
            if (g_used->test(rr[k])) { ok = false; break; }

        g_st->nodes++;
        if (!ok) { g_st->pruned++; continue; }

        for (int k = 0; k < LEAD_LEN; k++) g_used->set(rr[k]);
        g_calls->push_back(static_cast<uint8_t>(call));

        uint16_t nxt = T->next[head][call];
        if (nxt == ROUNDS_RANK) {
            // Closed a true round block of (depth+1) leads.
            int len = depth + 1;
            g_st->trueBlocks++;
            if (len < 64) g_st->blocksByLen[len]++;
            if ((uint64_t)len > g_st->bestLen) {
                g_st->bestLen = len;
                g_st->bestCalls = *g_calls;
            }
        } else if (depth + 1 < g_maxLeads) {
            dfs(nxt, depth + 1);
        }

        g_calls->pop_back();
        for (int k = 0; k < LEAD_LEN; k++) g_used->reset(rr[k]);
    }
}

static std::string callsToStr(const std::vector<uint8_t>& calls) {
    std::string s;
    for (uint8_t c : calls) s += CALL_CH[c];
    return s;
}

int main(int argc, char** argv) {
    initFactorials();
    g_maxLeads = (argc > 1) ? std::atoi(argv[1]) : 8;

    Method m = buildGrandsire();

    auto t0 = std::chrono::steady_clock::now();
    Tables t = buildTables(m);
    auto t1 = std::chrono::steady_clock::now();

    printf("Grandsire Triples — brute-force prototype\n");
    printf("Lead heads (treble leading): %d (= 6! = 720 expected)\n", t.nLeadHeads);
    printf("Table precompute: %.1f ms\n",
           std::chrono::duration<double, std::milli>(t1 - t0).count());

    verify(m, t);
    if (g_fails) { printf("\n%d/%d checks FAILED — aborting.\n", g_fails, g_checks); return 1; }
    printf("\nAll %d checks passed.\n", g_checks);

    // ---- Search ----
    printf("\n=== Brute-force search for true round blocks (max %d leads) ===\n", g_maxLeads);
    static std::bitset<FACT_N> used;
    std::vector<uint8_t> calls;
    Stats st;
    Row rounds{0,1,2,3,4,5,6};
    ROUNDS_RANK = rankRow(rounds);      // == 0
    T = &t; g_used = &used; g_calls = &calls; g_st = &st;

    auto s0 = std::chrono::steady_clock::now();
    dfs(ROUNDS_RANK, 0);
    auto s1 = std::chrono::steady_clock::now();

    double ms = std::chrono::duration<double, std::milli>(s1 - s0).count();
    printf("nodes attempted : %llu\n", (unsigned long long)st.nodes);
    printf("pruned (false)  : %llu  (%.1f%%)\n",
           (unsigned long long)st.pruned,
           100.0 * st.pruned / (st.nodes ? st.nodes : 1));
    printf("true round blocks found: %llu\n", (unsigned long long)st.trueBlocks);
    printf("search time     : %.1f ms  (%.2f M nodes/s)\n",
           ms, st.nodes / (ms * 1000.0));

    printf("\nTrue round blocks by length (leads : count : changes):\n");
    for (int L = 1; L < 64; L++)
        if (st.blocksByLen[L])
            printf("  %2d leads : %8llu   (%d changes)\n",
                   L, (unsigned long long)st.blocksByLen[L], L * LEAD_LEN);

    if (st.bestLen) {
        printf("\nLongest block found: %llu leads = %llu changes\n",
               (unsigned long long)st.bestLen,
               (unsigned long long)st.bestLen * LEAD_LEN);
        printf("  calls (. plain, - bob, s single): %s\n",
               callsToStr(st.bestCalls).c_str());
    }
    return 0;
}
