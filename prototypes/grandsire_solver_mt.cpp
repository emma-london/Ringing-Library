// grandsire_solver_mt.cpp  —  multi-threaded true-touch search for Grandsire Triples
//
// Same four modes as grandsire_solver.cpp (list / count / find / mitm), now parallel.
//
// Parallelisation strategy (works for every mode): the search tree from rounds
// splits into independent subtrees. We enumerate a FRONTIER of true partial touches
// of `splitDepth` leads (cheap, single-threaded), then a thread pool consumes that
// frontier with dynamic load-balancing (atomic task index). Each worker carries its
// OWN truth bitset + call stack + accumulators (counts / solutions), so there are no
// shared-write hazards in the hot loop; the read-only tables and reachability DP are
// shared. Results are merged after the join. Finishes that occur at or before the
// split depth are recorded during frontier generation, so nothing is missed or
// double-counted.
//
//   list  N        every true come-round touch up to N leads, ordered by length
//   count N        counts per length up to N (lead-end vs snap)
//   find  L [cap]  up to `cap` true touches of exactly L leads (parallel early-stop)
//   mitm  L        total count at exactly L via meet-in-the-middle (parallel both sides)
//
//   --threads K    worker threads (default: hardware concurrency)
//
// Build:  g++ -O2 -std=c++17 -pthread grandsire_solver_mt.cpp -o solver_mt
// Run:    ./solver_mt <mode> <N|L> [cap] [--threads K]

#include <algorithm>
#include <array>
#include <atomic>
#include <bitset>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <functional>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

static constexpr int N = 7, FACT_N = 5040, LEAD_LEN = 14, N_CALLS = 3, NLH = 720;
enum Call { PLAIN = 0, BOB = 1, SINGLE = 2 };
static const char CALL_CH[3] = {'.', '-', 's'};
using Row = std::array<uint8_t, N>; using Perm = std::array<uint8_t, N>;
using RowSet = std::bitset<FACT_N>;

// ---- core ----
static int FACT[N + 1];
static uint16_t rankRow(const Row& r){ uint16_t k=0; for(int i=0;i<N;i++){int s=0;for(int j=i+1;j<N;j++)if(r[j]<r[i])s++;k+=(uint16_t)(s*FACT[N-1-i]);}return k; }
static Row unrankRow(uint16_t rk){ std::vector<int> a(N); for(int i=0;i<N;i++)a[i]=i; Row r{}; for(int i=0;i<N;i++){int f=FACT[N-1-i],d=rk/f;rk%=f;r[i]=(uint8_t)a[d];a.erase(a.begin()+d);} return r; }
static Perm changeFromPlaces(const std::vector<int>& pl){ std::array<bool,N> P{}; for(int p:pl)P[p]=true; Perm pe{}; int i=0; while(i<N){ if(P[i]){pe[i]=(uint8_t)i;i++;} else {pe[i]=(uint8_t)(i+1);pe[i+1]=(uint8_t)i;i+=2;} } return pe; }
static Perm composeP(const Perm&p,const Perm&q){ Perm r{}; for(int i=0;i<N;i++)r[i]=p[q[i]]; return r; }
static Perm invertPerm(const Perm&p){ Perm r{}; for(int i=0;i<N;i++)r[p[i]]=(uint8_t)i; return r; }
static Row  applyPerm(const Row&row,const Perm&p){ Row o{}; for(int i=0;i<N;i++)o[i]=row[p[i]]; return o; }
static std::vector<int> placesOf(const char*t){ std::vector<int> v; for(const char*c=t;*c;++c)v.push_back(*c-'1'); return v; }

struct Method { std::array<Perm, LEAD_LEN+1> P[N_CALLS]; };
static Method M;
static void buildGrandsire(){
    const char* common[12]={"3","1","7","1","7","1","7","1","7","1","7","1"};
    struct{const char*a;const char*b;} tail[N_CALLS]={{"7","1"},{"3","1"},{"3","123"}};
    Perm id{}; for(int i=0;i<N;i++)id[i]=(uint8_t)i;
    for(int c=0;c<N_CALLS;c++){ std::array<Perm,LEAD_LEN> ch;
        for(int k=0;k<12;k++)ch[k]=changeFromPlaces(placesOf(common[k]));
        ch[12]=changeFromPlaces(placesOf(tail[c].a)); ch[13]=changeFromPlaces(placesOf(tail[c].b));
        M.P[c][0]=id; for(int k=1;k<=LEAD_LEN;k++)M.P[c][k]=composeP(M.P[c][k-1],ch[k-1]); }
}
struct Tables { int lhId[FACT_N]; uint16_t lhRank[NLH]; int nextId[NLH][N_CALLS], backId[NLH][N_CALLS];
                uint16_t rows[NLH][N_CALLS][LEAD_LEN]; int snapHeadId[N_CALLS]; int roundsId; };
static Tables T;
static void buildTables(){
    for(int i=0;i<FACT_N;i++)T.lhId[i]=-1; int id=0;
    for(int r=0;r<FACT_N;r++){ Row row=unrankRow((uint16_t)r); if(row[0]==0){T.lhId[r]=id;T.lhRank[id]=(uint16_t)r;id++;} }
    Perm invLH[N_CALLS]; for(int c=0;c<N_CALLS;c++)invLH[c]=invertPerm(M.P[c][LEAD_LEN]);
    for(int i=0;i<NLH;i++){ Row head=unrankRow(T.lhRank[i]);
        for(int c=0;c<N_CALLS;c++){ for(int k=0;k<LEAD_LEN;k++)T.rows[i][c][k]=rankRow(applyPerm(head,M.P[c][k]));
            T.nextId[i][c]=T.lhId[rankRow(applyPerm(head,M.P[c][LEAD_LEN]))];
            T.backId[i][c]=T.lhId[rankRow(applyPerm(head,invLH[c]))]; } }
    T.roundsId=T.lhId[0];
    for(int c=0;c<N_CALLS;c++){ Perm inv=invertPerm(M.P[c][13]); Row h{}; for(int i=0;i<N;i++)h[i]=inv[i]; T.snapHeadId[c]=T.lhId[rankRow(h)]; }
}
// reachability DP (parity- and snap-aware), read-only after build
static int DPN; static std::vector<uint8_t> CF, within;
static inline uint8_t cf(int k,int id,int par){ return CF[(size_t)k*NLH*2+id*2+par]; }
static inline bool finishWithin(int id,int r){ if(r<0)return false; if(r>DPN)r=DPN; return within[(size_t)id*(DPN+1)+r]; }
static void buildDP(int n){
    DPN=n; CF.assign((size_t)(n+1)*NLH*2,0);
    for(int id=0;id<NLH;id++) for(int c=0;c<N_CALLS;c++){ int par=(c==SINGLE)?1:0;
        if(T.nextId[id][c]==T.roundsId) CF[(size_t)1*NLH*2+id*2+par]=1;
        if(id==T.snapHeadId[c])         CF[(size_t)1*NLH*2+id*2+par]=1; }
    for(int k=2;k<=n;k++) for(int id=0;id<NLH;id++) for(int par=0;par<2;par++){ uint8_t v=0;
        for(int c=0;c<N_CALLS&&!v;c++) v|=CF[(size_t)(k-1)*NLH*2+T.nextId[id][c]*2+(par^((c==SINGLE)?1:0))];
        CF[(size_t)k*NLH*2+id*2+par]=v; }
    within.assign((size_t)NLH*(n+1),0);
    for(int id=0;id<NLH;id++){ uint8_t acc=0; for(int r=0;r<=n;r++){ if(r>=1) acc|=(cf(r,id,0)||cf(r,id,1)); within[(size_t)id*(n+1)+r]=acc; } }
}

// ---- unified DFS with per-thread context ----
enum Mode { LIST, COUNT, FIND };
struct Sol { std::vector<uint8_t> calls; bool snap; };
static Mode g_mode; static int g_N, g_cap; static std::atomic<int> g_found{0};

struct Task { int node, depth, par; RowSet used; std::vector<uint8_t> calls; };
struct Ctx {
    RowSet used; std::vector<uint8_t> calls;
    uint64_t cl[128]={0}, cs[128]={0};   // count: lead-end / snap by #leads
    std::vector<Sol> sols;               // list / find
    int splitDepth=-1; std::vector<Task>* taskOut=nullptr;   // frontier generation
    bool stop=false;
};
static inline void rec(Ctx& x, bool snap){
    int leads=(int)x.calls.size();
    if(g_mode==FIND){ if(leads!=g_N) return; int cur=g_found.fetch_add(1);
        if(cur<g_cap) x.sols.push_back({x.calls,snap}); if(g_found.load()>=g_cap) x.stop=true; return; }
    if(g_mode==LIST) x.sols.push_back({x.calls,snap});
    if(snap) x.cs[leads]++; else x.cl[leads]++;
}
static void dfs(Ctx& x,int node,int depth,int par){
    if(x.stop) return;
    if(g_mode==FIND && g_found.load()>=g_cap){ x.stop=true; return; }
    int budget=g_N-depth;
    if(g_mode==FIND){ if(!cf(budget,node,par)) return; } else { if(!finishWithin(node,budget)) return; }
    if(x.splitDepth>=0 && depth==x.splitDepth){ x.taskOut->push_back({node,depth,par,x.used,x.calls}); return; }
    for(int c=0;c<N_CALLS;c++){
        if(T.rows[node][c][13]==0){                       // snap finish
            bool ok=true; for(int k=0;k<=12&&ok;k++) if(x.used.test(T.rows[node][c][k])) ok=false;
            if(ok){ x.calls.push_back((uint8_t)c); rec(x,true); x.calls.pop_back(); }
            continue;
        }
        bool ok=true; for(int k=0;k<LEAD_LEN&&ok;k++) if(x.used.test(T.rows[node][c][k])) ok=false;
        if(!ok) continue;
        for(int k=0;k<LEAD_LEN;k++) x.used.set(T.rows[node][c][k]);
        x.calls.push_back((uint8_t)c);
        int nxt=T.nextId[node][c], np=par^((c==SINGLE)?1:0);
        if(nxt==T.roundsId) rec(x,false);
        else if(depth+1<g_N) dfs(x,nxt,depth+1,np);
        x.calls.pop_back();
        for(int k=0;k<LEAD_LEN;k++) x.used.reset(T.rows[node][c][k]);
        if(x.stop) return;
    }
}

// run a frontier of tasks across `nthreads` workers; merge into `merged`
static void runFrontier(const std::vector<Task>& tasks,int nthreads,std::vector<Ctx>& out){
    std::atomic<size_t> idx{0};
    auto worker=[&](int tid){
        Ctx& x=out[tid];
        for(;;){ size_t i=idx.fetch_add(1); if(i>=tasks.size()||x.stop) break;
            x.used=tasks[i].used; x.calls=tasks[i].calls; x.splitDepth=-1;
            dfs(x,tasks[i].node,tasks[i].depth,tasks[i].par); }
    };
    std::vector<std::thread> th; for(int t=0;t<nthreads;t++) th.emplace_back(worker,t);
    for(auto& t:th) t.join();
}

static int lengthChanges(const Sol&s){ return (int)s.calls.size()*LEAD_LEN-(s.snap?1:0); }
static std::string callsStr(const std::vector<uint8_t>&c){ std::string s; for(auto x:c)s+=CALL_CH[x]; return s; }
static bool verifyTouch(const std::vector<uint8_t>&calls,bool snap){
    RowSet seen; int node=T.roundsId; bool trueT=true,round=false;
    for(size_t L=0;L<calls.size();L++){ int c=calls[L]; bool last=(L+1==calls.size()); int upto=(last&&snap)?13:14;
        for(int k=1;k<=upto;k++){ uint16_t rr=rankRow(applyPerm(unrankRow(T.lhRank[node]),M.P[c][k]));
            if(rr==0) round=true; else { if(seen.test(rr)) trueT=false; seen.set(rr); } }
        node=T.nextId[node][c]; }
    return trueT&&round;
}

// ---- MITM (parallel) ----
struct Half { int endId; RowSet rows; };
// forward frontier: partial forward paths of `df` leads
static void fwdFrontier(int df,std::vector<Task>& out){
    RowSet used; std::vector<uint8_t> calls;
    std::function<void(int,int)> rec2=[&](int id,int depth){
        if(depth==df){ out.push_back({id,depth,0,used,calls}); return; }
        for(int c=0;c<N_CALLS;c++){ bool ok=true; for(int k=0;k<LEAD_LEN&&ok;k++) if(used.test(T.rows[id][c][k]))ok=false;
            if(!ok)continue; for(int k=0;k<LEAD_LEN;k++)used.set(T.rows[id][c][k]); calls.push_back((uint8_t)c);
            rec2(T.nextId[id][c],depth+1); calls.pop_back(); for(int k=0;k<LEAD_LEN;k++)used.reset(T.rows[id][c][k]); }
    };
    rec2(T.roundsId,0);
}
static void fwdContinue(const Task& t,int m,std::vector<Half>& out){
    RowSet used=t.used;
    std::function<void(int,int)> rec2=[&](int id,int depth){
        if(depth==m){ out.push_back({id,used}); return; }
        for(int c=0;c<N_CALLS;c++){ bool ok=true; for(int k=0;k<LEAD_LEN&&ok;k++) if(used.test(T.rows[id][c][k]))ok=false;
            if(!ok)continue; for(int k=0;k<LEAD_LEN;k++)used.set(T.rows[id][c][k]);
            rec2(T.nextId[id][c],depth+1); for(int k=0;k<LEAD_LEN;k++)used.reset(T.rows[id][c][k]); }
    };
    rec2(t.node,t.depth);
}
// backward frontier: first step may snap; we expand depth 0 here, emit tasks at `db`>=1
struct BTask { int node,depth; RowSet used; bool snap; };
static void bwdFrontier(int db,std::vector<BTask>& out){
    RowSet used;
    std::function<void(int,int,bool)> rec2=[&](int id,int depth,bool snap){
        if(depth==db){ out.push_back({id,depth,used,snap}); return; }
        for(int c=0;c<N_CALLS;c++){ int X=T.backId[id][c]; bool ok=true;
            for(int k=0;k<LEAD_LEN&&ok;k++) if(used.test(T.rows[X][c][k]))ok=false; if(!ok)continue;
            for(int k=0;k<LEAD_LEN;k++)used.set(T.rows[X][c][k]); rec2(X,depth+1,snap);
            for(int k=0;k<LEAD_LEN;k++)used.reset(T.rows[X][c][k]); }
        if(depth==0){ for(int c=0;c<N_CALLS;c++){ int X=T.snapHeadId[c]; bool ok=true;
            for(int k=0;k<=12&&ok;k++) if(used.test(T.rows[X][c][k]))ok=false; if(!ok)continue;
            for(int k=0;k<=12;k++)used.set(T.rows[X][c][k]); rec2(X,depth+1,true);
            for(int k=0;k<=12;k++)used.reset(T.rows[X][c][k]); } }
    };
    rec2(T.roundsId,0,false);
}
static void bwdContinue(const BTask& t,int total,const std::unordered_map<int,std::vector<int>>& bucket,
                        const std::vector<Half>& fwd,uint64_t& found,uint64_t& snaps){
    RowSet used=t.used;
    std::function<void(int,int)> rec2=[&](int id,int depth){
        if(depth==total){ auto it=bucket.find(id); if(it==bucket.end())return;
            for(int fi:it->second){ if((fwd[fi].rows&used).none()){ found++; if(t.snap) snaps++; } } return; }
        for(int c=0;c<N_CALLS;c++){ int X=T.backId[id][c]; bool ok=true;
            for(int k=0;k<LEAD_LEN&&ok;k++) if(used.test(T.rows[X][c][k]))ok=false; if(!ok)continue;
            for(int k=0;k<LEAD_LEN;k++)used.set(T.rows[X][c][k]); rec2(X,depth+1);
            for(int k=0;k<LEAD_LEN;k++)used.reset(T.rows[X][c][k]); }
    };
    rec2(t.node,t.depth);
}

// ---- main ----
int main(int argc,char**argv){
    FACT[0]=1; for(int i=1;i<=N;i++)FACT[i]=FACT[i-1]*i;
    buildGrandsire(); buildTables();
    int nthreads=(int)std::thread::hardware_concurrency(); if(nthreads<1)nthreads=4;
    std::vector<std::string> pos;
    for(int i=1;i<argc;i++){ std::string a=argv[i];
        if(a=="--threads"&&i+1<argc){ nthreads=std::atoi(argv[++i]); }
        else if(a.rfind("-j",0)==0){ nthreads=std::atoi(a.c_str()+2); }
        else pos.push_back(a); }
    if(nthreads<1)nthreads=1;
    if(pos.size()<2){ fprintf(stderr,"usage: %s list|count|find|mitm <N|L> [cap] [--threads K]\n",argv[0]); return 1; }
    std::string mode=pos[0]; int X=std::atoi(pos[1].c_str());
    if(X<1){ fprintf(stderr,"N/L must be >= 1\n"); return 1; }
    printf("[threads: %d]\n", nthreads);

    if(mode=="list"||mode=="count"||mode=="find"){
        g_mode=(mode=="list")?LIST:(mode=="count")?COUNT:FIND;
        g_N=X; g_cap=(mode=="find")?((pos.size()>2)?std::atoi(pos[2].c_str()):20):0;
        buildDP(X);
        int splitDepth=std::min(7,std::max(1,X-1));
        auto t0=std::chrono::steady_clock::now();
        // phase 1: frontier (records finishes <= splitDepth, emits deeper tasks)
        Ctx gen; gen.splitDepth=splitDepth; std::vector<Task> tasks; gen.taskOut=&tasks;
        dfs(gen,T.roundsId,0,0);
        // phase 2: parallel
        std::vector<Ctx> out(nthreads);
        runFrontier(tasks,nthreads,out);
        auto t1=std::chrono::steady_clock::now();
        // merge
        uint64_t cl[128]={0},cs[128]={0}; std::vector<Sol> sols=std::move(gen.sols);
        for(int L=0;L<128;L++){ cl[L]+=gen.cl[L]; cs[L]+=gen.cs[L]; }
        for(auto& c:out){ for(int L=0;L<128;L++){ cl[L]+=c.cl[L]; cs[L]+=c.cs[L]; }
            for(auto& s:c.sols) sols.push_back(std::move(s)); }
        double ms=std::chrono::duration<double,std::milli>(t1-t0).count();
        if(g_mode==COUNT){
            printf("True come-round touches by length, up to %d leads (%d tasks, %.0f ms)\n\n",X,(int)tasks.size(),ms);
            printf("%6s %14s %14s %14s\n","leads","lead-end","snap","total"); uint64_t tl=0,ts=0;
            for(int L=1;L<=X;L++) if(cl[L]||cs[L]){ printf("%6d %14llu %14llu %14llu\n",L,(unsigned long long)cl[L],(unsigned long long)cs[L],(unsigned long long)(cl[L]+cs[L])); tl+=cl[L]; ts+=cs[L]; }
            printf("%6s %14llu %14llu %14llu\n","all",(unsigned long long)tl,(unsigned long long)ts,(unsigned long long)(tl+ts));
        } else if(g_mode==LIST){
            std::sort(sols.begin(),sols.end(),[](const Sol&a,const Sol&b){int la=lengthChanges(a),lb=lengthChanges(b);if(la!=lb)return la<lb;return a.calls<b.calls;});
            printf("True touches up to %d leads (%.0f ms)\n\n%8s %6s  %-8s %s\n",X,ms,"changes","leads","finish","calling");
            int cur=-1; for(auto&s:sols){int len=lengthChanges(s);if(len!=cur){cur=len;printf("\n");}
                printf("%8d %6zu  %-8s %s\n",len,s.calls.size(),s.snap?"snap":"lead-end",callsStr(s.calls).c_str());}
            printf("\nTotal: %zu touches.\n",sols.size());
        } else { // FIND
            std::sort(sols.begin(),sols.end(),[](const Sol&a,const Sol&b){return a.calls<b.calls;});
            if((int)sols.size()>g_cap) sols.resize(g_cap);
            printf("Up to %d true come-round touches of exactly %d leads (%.0f ms):\n\n%8s  %-8s %-7s %s\n",g_cap,X,ms,"changes","finish","verify","calling");
            for(auto&s:sols){ bool ok=verifyTouch(s.calls,s.snap); int ch=(int)s.calls.size()*LEAD_LEN-(s.snap?1:0);
                printf("%8d  %-8s %-7s %s\n",ch,s.snap?"snap":"lead-end",ok?"TRUE":"FALSE!",callsStr(s.calls).c_str()); }
            printf("\nFound %zu in %.0f ms.%s\n",sols.size(),ms,sols.empty()?"  (none exist at this length)":"");
        }
    }
    else if(mode=="mitm"){
        int L=X, m=L/2;
        auto t0=std::chrono::steady_clock::now();
        // forward halves (parallel)
        int df=std::min(5,std::max(0,m-1));
        std::vector<Half> fwd;
        if(df<=0){ Task root{T.roundsId,0,0,RowSet{},{}}; fwdContinue(root,m,fwd); }
        else { std::vector<Task> ftasks; fwdFrontier(df,ftasks);
            std::vector<std::vector<Half>> partial(nthreads); std::atomic<size_t> fi{0};
            auto fw=[&](int tid){ for(;;){ size_t i=fi.fetch_add(1); if(i>=ftasks.size())break; fwdContinue(ftasks[i],m,partial[tid]); } };
            std::vector<std::thread> th; for(int t=0;t<nthreads;t++)th.emplace_back(fw,t); for(auto&t:th)t.join();
            for(auto& p:partial){ for(auto& h:p) fwd.push_back(std::move(h)); } }
        std::unordered_map<int,std::vector<int>> bucket; bucket.reserve(fwd.size()*2);
        for(int i=0;i<(int)fwd.size();i++) bucket[fwd[i].endId].push_back(i);
        // backward join (parallel)
        int back=L-m, db=std::min(4,std::max(1,back-1));
        uint64_t total=0,snaps=0;
        if(db>=back){ std::vector<BTask> bt; bwdFrontier(back,bt);   // tiny: do directly
            for(auto& t:bt){ auto it=bucket.find(t.node); if(it==bucket.end())continue;
                for(int fidx:it->second) if((fwd[fidx].rows&t.used).none()){ total++; if(t.snap)snaps++; } } }
        else { std::vector<BTask> btasks; bwdFrontier(db,btasks);
            std::vector<uint64_t> tf(nthreads,0),ts(nthreads,0); std::atomic<size_t> bi{0};
            auto bw=[&](int tid){ for(;;){ size_t i=bi.fetch_add(1); if(i>=btasks.size())break;
                uint64_t f=0,s=0; bwdContinue(btasks[i],back,bucket,fwd,f,s); tf[tid]+=f; ts[tid]+=s; } };
            std::vector<std::thread> th; for(int t=0;t<nthreads;t++)th.emplace_back(bw,t); for(auto&t:th)t.join();
            for(int t=0;t<nthreads;t++){ total+=tf[t]; snaps+=ts[t]; } }
        auto t1=std::chrono::steady_clock::now();
        printf("MITM, exactly %d leads:  total=%llu  (lead-end=%llu, snap=%llu)\n",L,(unsigned long long)total,(unsigned long long)(total-snaps),(unsigned long long)snaps);
        printf("forward halves=%zu (split %d/%d)  time=%.0f ms\n",fwd.size(),m,L-m,std::chrono::duration<double,std::milli>(t1-t0).count());
    }
    else { fprintf(stderr,"unknown mode '%s'\n",mode.c_str()); return 1; }
    return 0;
}
