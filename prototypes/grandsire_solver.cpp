// grandsire_solver.cpp  —  all-in-one true-touch search for Grandsire Triples
//
// One program, four modes (all techniques from the prototypes wired in):
//
//   list  N        every true come-round touch up to N leads, ordered by length.
//                  Forward DFS + truth bitset + snap finishes + reachability prune.
//                  Output-bound: practical to ~16-18 leads.
//
//   count N        counts of true come-round touches per length up to N leads
//                  (lead-end and snap finishes separately). Same complete engine.
//
//   find  L [cap]  up to `cap` (default 20) true come-round touches of EXACTLY L
//                  leads, found fast via the snap+parity-aware reachability DP and
//                  early-stop. Reaches L=30, 90, ... near-instantly because the DP
//                  guarantees every descended branch can still close. Each touch is
//                  independently rung out and verified before printing.
//
//   mitm  L        total count of true come-round touches of EXACTLY L leads via
//                  meet-in-the-middle (store forward halves, stream backward),
//                  including snap finishes (a snap is the touch's final short lead,
//                  seeded as the first backward step). The sqrt-time/space counter.
//
// Techniques: factoradic (Lehmer) ranking -> dense row id + std::bitset truth;
// precomputed forward/backward lead tables; snap detection at row 13 (the treble's
// 2nd blow at lead); a come-round reachability DP that is both PARITY-aware
// (come-round needs an even number of singles) and SNAP-aware; and MITM.
//
// Build:  g++ -O2 -std=c++17 grandsire_solver.cpp -o solver
// Run:    ./solver <mode> <N|L> [cap]

#include <algorithm>
#include <array>
#include <bitset>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <string>
#include <unordered_map>
#include <vector>

static constexpr int N = 7;
static constexpr int FACT_N = 5040;
static constexpr int LEAD_LEN = 14;
static constexpr int N_CALLS = 3;
static constexpr int NLH = 720;
enum Call { PLAIN = 0, BOB = 1, SINGLE = 2 };
static const char CALL_CH[3] = {'.', '-', 's'};

using Row  = std::array<uint8_t, N>;
using Perm = std::array<uint8_t, N>;
using RowSet = std::bitset<FACT_N>;

// ---- core: ranking + place notation + method ----
static int FACT[N + 1];
static uint16_t rankRow(const Row& r){ uint16_t k=0; for(int i=0;i<N;i++){int s=0;for(int j=i+1;j<N;j++)if(r[j]<r[i])s++;k+=(uint16_t)(s*FACT[N-1-i]);}return k; }
static Row unrankRow(uint16_t rk){ std::vector<int> a(N); for(int i=0;i<N;i++)a[i]=i; Row r{}; for(int i=0;i<N;i++){int f=FACT[N-1-i],d=rk/f;rk%=f;r[i]=(uint8_t)a[d];a.erase(a.begin()+d);} return r; }
static Perm changeFromPlaces(const std::vector<int>& pl){ std::array<bool,N> P{}; for(int p:pl)P[p]=true; Perm pe{}; int i=0; while(i<N){ if(P[i]){pe[i]=(uint8_t)i;i++;} else {pe[i]=(uint8_t)(i+1);pe[i+1]=(uint8_t)i;i+=2;} } return pe; }
static Perm compose(const Perm&p,const Perm&q){ Perm r{}; for(int i=0;i<N;i++)r[i]=p[q[i]]; return r; }
static Perm invertPerm(const Perm&p){ Perm r{}; for(int i=0;i<N;i++)r[p[i]]=(uint8_t)i; return r; }
static Row  applyPerm(const Row&row,const Perm&p){ Row o{}; for(int i=0;i<N;i++)o[i]=row[p[i]]; return o; }
static std::vector<int> placesOf(const char*t){ std::vector<int> v; for(const char*c=t;*c;++c)v.push_back(*c-'1'); return v; }

struct Method { std::array<Perm, LEAD_LEN+1> P[N_CALLS]; };
static Method buildGrandsire(){
    const char* common[12]={"3","1","7","1","7","1","7","1","7","1","7","1"};
    struct{const char*a;const char*b;} tail[N_CALLS]={{"7","1"},{"3","1"},{"3","123"}};
    Method m; Perm id{}; for(int i=0;i<N;i++)id[i]=(uint8_t)i;
    for(int c=0;c<N_CALLS;c++){
        std::array<Perm,LEAD_LEN> ch;
        for(int k=0;k<12;k++)ch[k]=changeFromPlaces(placesOf(common[k]));
        ch[12]=changeFromPlaces(placesOf(tail[c].a));
        ch[13]=changeFromPlaces(placesOf(tail[c].b));
        m.P[c][0]=id; for(int k=1;k<=LEAD_LEN;k++)m.P[c][k]=compose(m.P[c][k-1],ch[k-1]);
    }
    return m;
}

// ---- compact lead-head tables ----
struct Tables {
    int lhId[FACT_N]; uint16_t lhRank[NLH];
    int nextId[NLH][N_CALLS], backId[NLH][N_CALLS];
    uint16_t rows[NLH][N_CALLS][LEAD_LEN];   // 14 internal row ranks (row 0..13)
    int snapHeadId[N_CALLS];                  // lead-head from which call c snaps to rounds
    int roundsId;
};
static Tables T;
static Method M;

static void buildTables(){
    for(int i=0;i<FACT_N;i++)T.lhId[i]=-1;
    int id=0; for(int r=0;r<FACT_N;r++){ Row row=unrankRow((uint16_t)r); if(row[0]==0){T.lhId[r]=id;T.lhRank[id]=(uint16_t)r;id++;} }
    Perm invLH[N_CALLS]; for(int c=0;c<N_CALLS;c++)invLH[c]=invertPerm(M.P[c][LEAD_LEN]);
    for(int i=0;i<NLH;i++){
        Row head=unrankRow(T.lhRank[i]);
        for(int c=0;c<N_CALLS;c++){
            for(int k=0;k<LEAD_LEN;k++)T.rows[i][c][k]=rankRow(applyPerm(head,M.P[c][k]));
            T.nextId[i][c]=T.lhId[rankRow(applyPerm(head,M.P[c][LEAD_LEN]))];
            T.backId[i][c]=T.lhId[rankRow(applyPerm(head,invLH[c]))];
        }
    }
    T.roundsId=T.lhId[0];
    for(int c=0;c<N_CALLS;c++){ Perm inv=invertPerm(M.P[c][13]); Row h{}; for(int i=0;i<N;i++)h[i]=inv[i]; T.snapHeadId[c]=T.lhId[rankRow(h)]; }
}

// ---- come-round reachability DP: parity-aware AND snap-aware ----
// cf[k][id][par] = from id, can ring exactly k leads (last lead may be a snap) and
// finish on rounds using `par` singles (mod 2).  Ignores truth (a valid prune).
static int DPN;
static std::vector<uint8_t> CF;            // cf[k*NLH*2 + id*2 + par]
static inline uint8_t cf(int k,int id,int par){ return CF[(size_t)k*NLH*2+id*2+par]; }
static std::vector<uint8_t> within;        // within[id*(DPN+1)+r] = finish in <=r leads (any parity)

static void buildDP(int n){
    DPN=n; CF.assign((size_t)(n+1)*NLH*2,0);
    for(int id=0;id<NLH;id++) for(int c=0;c<N_CALLS;c++){
        int par=(c==SINGLE)?1:0;
        if(T.nextId[id][c]==T.roundsId) CF[(size_t)1*NLH*2+id*2+par]=1;   // lead-end finish
        if(id==T.snapHeadId[c])         CF[(size_t)1*NLH*2+id*2+par]=1;   // snap finish
    }
    for(int k=2;k<=n;k++) for(int id=0;id<NLH;id++) for(int par=0;par<2;par++){
        uint8_t v=0;
        for(int c=0;c<N_CALLS&&!v;c++) v|=CF[(size_t)(k-1)*NLH*2+T.nextId[id][c]*2+(par^((c==SINGLE)?1:0))];
        CF[(size_t)k*NLH*2+id*2+par]=v;
    }
    within.assign((size_t)NLH*(n+1),0);
    for(int id=0;id<NLH;id++){ uint8_t acc=0; for(int r=0;r<=n;r++){ if(r>=1) acc|= (cf(r,id,0)||cf(r,id,1)); within[(size_t)id*(n+1)+r]=acc; } }
}
static inline bool finishWithin(int id,int r){ if(r<0)return false; if(r>DPN)r=DPN; return within[(size_t)id*(DPN+1)+r]; }

// ---- forward DFS engine (list / count / find) ----
enum Mode { LIST, COUNT, FIND };
struct Sol { std::vector<uint8_t> calls; bool snap; };
static Mode g_mode; static int g_maxN, g_targetL, g_cap;
static RowSet g_used; static std::vector<uint8_t> g_calls;
static std::vector<Sol> g_sols;
static uint64_t g_countLead[128], g_countSnap[128];
static bool g_stop=false;

static void record(bool snap){
    int leads=(int)g_calls.size();
    if(g_mode==FIND){ if(leads!=g_targetL) return; g_sols.push_back({g_calls,snap}); if((int)g_sols.size()>=g_cap)g_stop=true; return; }
    if(g_mode==LIST) g_sols.push_back({g_calls,snap});
    if(snap) g_countSnap[leads]++; else g_countLead[leads]++;
}

static void dfs(int node,int depth,int par){
    if(g_stop) return;
    int budget = (g_mode==FIND? g_targetL : g_maxN) - depth;
    if(g_mode==FIND){ if(!cf(budget,node,par)) return; }     // exact-length, parity, snap-aware
    else            { if(!finishWithin(node,budget)) return; }
    for(int c=0;c<N_CALLS;c++){
        // snap finish: rounds at row 13
        if(T.rows[node][c][13]==0){
            bool ok=true; for(int k=0;k<=12&&ok;k++) if(g_used.test(T.rows[node][c][k])) ok=false;
            if(ok){ g_calls.push_back((uint8_t)c); record(true); g_calls.pop_back(); }
            continue;                                         // full lead here repeats rounds
        }
        // full lead
        bool ok=true; for(int k=0;k<LEAD_LEN&&ok;k++) if(g_used.test(T.rows[node][c][k])) ok=false;
        if(!ok) continue;
        for(int k=0;k<LEAD_LEN;k++) g_used.set(T.rows[node][c][k]);
        g_calls.push_back((uint8_t)c);
        int nxt=T.nextId[node][c], np=par^((c==SINGLE)?1:0);
        if(nxt==T.roundsId) record(false);                    // lead-end finish
        else {
            bool extend = (g_mode==FIND)? (depth+1<g_targetL) : (depth+1<g_maxN);
            if(extend) dfs(nxt,depth+1,np);
        }
        g_calls.pop_back();
        for(int k=0;k<LEAD_LEN;k++) g_used.reset(T.rows[node][c][k]);
        if(g_stop) return;
    }
}

static int lengthChanges(const Sol&s){ return (int)s.calls.size()*LEAD_LEN-(s.snap?1:0); }
static std::string callsStr(const std::vector<uint8_t>&c){ std::string s; for(auto x:c)s+=CALL_CH[x]; return s; }

// Independent ring-out verification of a touch (used by find): walk every change,
// counting changes, checking no row repeats and that it ends on rounds. A snap
// touch rings only 13 changes in its final lead.
static bool verify(const std::vector<uint8_t>&calls,bool snap,int&changesOut){
    RowSet seen; int node=T.roundsId, changes=0; bool trueT=true, round=false;
    for(size_t L=0;L<calls.size();L++){ int c=calls[L]; bool last=(L+1==calls.size());
        int upto=(last&&snap)?13:14;
        for(int k=1;k<=upto;k++){
            uint16_t rr=rankRow(applyPerm(unrankRow(T.lhRank[node]),M.P[c][k]));
            if(rr==0) round=true;                 // reached rounds (lead-end k=14, or snap k=13)
            else { if(seen.test(rr)) trueT=false; seen.set(rr); }
            changes++;
        }
        node=T.nextId[node][c];
    }
    changesOut=changes;
    return trueT && round;
}

// ---- MITM (mode mitm): count true come-round touches of exactly L leads ----
struct Half { int endId; RowSet rows; };
static void enumForward(int len, std::vector<Half>&out){
    RowSet used; std::function<void(int,int)> rec=[&](int id,int depth){
        if(depth==len){ out.push_back({id,used}); return; }
        for(int c=0;c<N_CALLS;c++){
            bool ok=true; for(int k=0;k<LEAD_LEN&&ok;k++) if(used.test(T.rows[id][c][k])) ok=false;
            if(!ok) continue;
            for(int k=0;k<LEAD_LEN;k++) used.set(T.rows[id][c][k]);
            rec(T.nextId[id][c],depth+1);
            for(int k=0;k<LEAD_LEN;k++) used.reset(T.rows[id][c][k]);
        }
    };
    rec(T.roundsId,0);
}
// backward halves: first step (the touch's LAST lead) may be a normal inverse lead
// OR a snap lead; later steps are normal inverse leads. Streamed into `join`.
static uint64_t mitmJoin(int len, const std::unordered_map<int,std::vector<int>>&bucket,
                         const std::vector<Half>&fwd, uint64_t&snapHits){
    RowSet used; uint64_t found=0; uint64_t snaps=0;
    std::function<void(int,int,bool)> rec=[&](int id,int depth,bool firstDone){
        if(depth==len){
            auto it=bucket.find(id); if(it==bucket.end())return;
            for(int fi:it->second) if((fwd[fi].rows&used).none()) found++;
            return;
        }
        // normal inverse lead
        for(int c=0;c<N_CALLS;c++){
            int X=T.backId[id][c];                       // predecessor lead-head
            bool ok=true; for(int k=0;k<LEAD_LEN&&ok;k++) if(used.test(T.rows[X][c][k])) ok=false;
            if(!ok) continue;
            for(int k=0;k<LEAD_LEN;k++) used.set(T.rows[X][c][k]);
            rec(X,depth+1,true);
            for(int k=0;k<LEAD_LEN;k++) used.reset(T.rows[X][c][k]);
        }
        // snap lead — only as the very first backward step (touch's last lead)
        if(!firstDone){
            for(int c=0;c<N_CALLS;c++){
                int X=T.snapHeadId[c];                    // snap lead-head
                bool ok=true; for(int k=0;k<=12&&ok;k++) if(used.test(T.rows[X][c][k])) ok=false;
                if(!ok) continue;
                for(int k=0;k<=12;k++) used.set(T.rows[X][c][k]);
                // count joins at this depth+? : a snap consumes one lead too
                std::function<void(int,int)> rec2=[&](int id2,int d2){
                    if(d2==len){
                        auto it=bucket.find(id2); if(it==bucket.end())return;
                        for(int fi:it->second){ if((fwd[fi].rows&used).none()){ found++; snaps++; } }
                        return;
                    }
                    for(int c2=0;c2<N_CALLS;c2++){ int X2=T.backId[id2][c2];
                        bool ok2=true; for(int k=0;k<LEAD_LEN&&ok2;k++) if(used.test(T.rows[X2][c2][k])) ok2=false;
                        if(!ok2)continue;
                        for(int k=0;k<LEAD_LEN;k++) used.set(T.rows[X2][c2][k]);
                        rec2(X2,d2+1);
                        for(int k=0;k<LEAD_LEN;k++) used.reset(T.rows[X2][c2][k]);
                    }
                };
                rec2(X,1);
                for(int k=0;k<=12;k++) used.reset(T.rows[X][c][k]);
            }
        }
    };
    rec(T.roundsId,0,false);
    snapHits=snaps; return found;
}

// ---- main ----
int main(int argc,char**argv){
    FACT[0]=1; for(int i=1;i<=N;i++)FACT[i]=FACT[i-1]*i;
    M=buildGrandsire(); buildTables();
    if(argc<3){ fprintf(stderr,"usage: %s list|count|find|mitm  <N|L> [cap]\n",argv[0]); return 1; }
    std::string mode=argv[1]; int X=std::atoi(argv[2]);
    if(X<1){ fprintf(stderr,"N/L must be >= 1\n"); return 1; }

    if(mode=="list"||mode=="count"){
        g_mode = (mode=="list")?LIST:COUNT; g_maxN=X;
        for(int i=0;i<128;i++){g_countLead[i]=0;g_countSnap[i]=0;}
        buildDP(X);
        dfs(T.roundsId,0,0);
        if(g_mode==LIST){
            std::sort(g_sols.begin(),g_sols.end(),[](const Sol&a,const Sol&b){ int la=lengthChanges(a),lb=lengthChanges(b); if(la!=lb)return la<lb; return a.calls<b.calls; });
            printf("True touches of Grandsire Triples ending in rounds, up to %d leads\n",X);
            printf(". plain  - bob  s single   (snap = comes round one change early)\n\n");
            printf("%8s %6s  %-8s %s\n","changes","leads","finish","calling");
            int cur=-1; for(const auto&s:g_sols){ int len=lengthChanges(s); if(len!=cur){cur=len;printf("\n");}
                printf("%8d %6zu  %-8s %s\n",len,s.calls.size(),s.snap?"snap":"lead-end",callsStr(s.calls).c_str()); }
            printf("\nTotal: %zu touches.\n",g_sols.size());
        } else {
            printf("True come-round touches of Grandsire Triples by length, up to %d leads\n\n",X);
            printf("%6s %12s %12s %12s\n","leads","lead-end","snap","total");
            uint64_t tl=0,ts=0;
            for(int L=1;L<=X;L++){ if(g_countLead[L]||g_countSnap[L]){ printf("%6d %12llu %12llu %12llu\n",L,(unsigned long long)g_countLead[L],(unsigned long long)g_countSnap[L],(unsigned long long)(g_countLead[L]+g_countSnap[L])); tl+=g_countLead[L]; ts+=g_countSnap[L]; } }
            printf("%6s %12llu %12llu %12llu\n","all",(unsigned long long)tl,(unsigned long long)ts,(unsigned long long)(tl+ts));
        }
    }
    else if(mode=="find"){
        g_mode=FIND; g_targetL=X; g_cap=(argc>3)?std::atoi(argv[3]):20;
        buildDP(X);
        auto t0=std::chrono::steady_clock::now();
        dfs(T.roundsId,0,0);
        auto t1=std::chrono::steady_clock::now();
        std::sort(g_sols.begin(),g_sols.end(),[](const Sol&a,const Sol&b){ return a.calls<b.calls; });
        printf("Up to %d true come-round touches of exactly %d leads:\n",g_cap,X);
        printf(". plain  - bob  s single   (snap = comes round one change early)\n\n");
        printf("%8s  %-8s %-7s %s\n","changes","finish","verify","calling");
        for(const auto&s:g_sols){ int ch=0; bool okv=verify(s.calls,s.snap,ch);
            printf("%8d  %-8s %-7s %s\n",ch,s.snap?"snap":"lead-end",okv?"TRUE":"FALSE!",callsStr(s.calls).c_str()); }
        printf("\nFound %zu (cap %d) in %.1f ms.%s\n",g_sols.size(),g_cap,
               std::chrono::duration<double,std::milli>(t1-t0).count(),
               g_sols.empty()?"  (none exist at this length)":"");
    }
    else if(mode=="mitm"){
        int L=X, m=L/2;
        auto t0=std::chrono::steady_clock::now();
        std::vector<Half> fwd; enumForward(m,fwd);
        std::unordered_map<int,std::vector<int>> bucket; bucket.reserve(fwd.size()*2);
        for(int i=0;i<(int)fwd.size();i++) bucket[fwd[i].endId].push_back(i);
        uint64_t snaps=0; uint64_t total=mitmJoin(L-m,bucket,fwd,snaps);
        auto t1=std::chrono::steady_clock::now();
        printf("MITM, exactly %d leads:  total=%llu  (lead-end=%llu, snap=%llu)\n",
               L,(unsigned long long)total,(unsigned long long)(total-snaps),(unsigned long long)snaps);
        printf("forward halves stored=%zu (split %d/%d leads)  time=%.0f ms\n",
               fwd.size(),m,L-m,std::chrono::duration<double,std::milli>(t1-t0).count());
    }
    else { fprintf(stderr,"unknown mode '%s'\n",mode.c_str()); return 1; }
    return 0;
}
