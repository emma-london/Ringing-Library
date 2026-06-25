# Grandsire search prototypes

C++17 research spikes. The binaries are **not** checked in — they're
platform-specific, so build them on your own machine.

## Build

    ./build.sh

(or manually:)

    g++ -O2 -std=c++17 grandsire_bruteforce.cpp -o grandsire
    g++ -O2 -std=c++17 grandsire_search.cpp    -o gsearch

On macOS, if `g++` is missing, install the Command Line Tools once with
`xcode-select --install` (`g++` then maps to clang, which is fine).

## Run

    ./grandsire [maxLeads]   # core: verification + naive truth-pruned DFS sweep
    ./gsearch                # benchmark: reachability + Q-set + MITM cross-check
    ./gsearch <L>            # MITM at length L: touch count, peak RAM, a verified
                             #   example composition (rung out, proven true + round)

Lengths are in *leads*; one Grandsire Triples lead = 14 changes.

## touches

    ./touches N    # print every TRUE touch ending in rounds, up to N leads,
                   #   ordered by length (. plain, - bob, s single)

## solver  (all-in-one)

    ./solver list  N        # every true come-round touch up to N leads, by length
    ./solver count N        # counts per length up to N (lead-end vs snap)
    ./solver find  L [cap]   # up to `cap` true touches of exactly L leads, fast
                            #   (reaches quarter/peal length instantly), each verified
    ./solver mitm  L        # total count at exactly L via meet-in-the-middle

All techniques wired in: factoradic ranking + bitset truth, snap finishes (row 13),
parity- and snap-aware reachability pruning, and MITM. `find` is the one that
reaches ~30-90 leads; `list`/`count` are complete but output/enumeration-bound.

## solver_mt  (parallel)

Multi-threaded version of `solver` — same modes and output, plus `--threads K`
(default: all cores). Build needs `-pthread` (handled by build.sh).

    ./solver_mt count 18           # uses all cores
    ./solver_mt mitm 22 --threads 8
    ./solver_mt find 90 10 --threads 8

Strategy: a frontier of independent sub-touches at a shallow split depth is
distributed across a thread pool with dynamic load-balancing; each worker keeps
its own truth bitset and accumulators, merged at the end. Counts are identical to
the single-threaded `solver` (verified). Measured ~3.2x on 4 cores for mitm.
