#!/usr/bin/env bash
# Build the Grandsire prototypes locally (macOS or Linux). Requires a C++17
# compiler. On macOS, run `xcode-select --install` first if `g++` is missing.
set -e
cd "$(dirname "$0")"
g++ -O2 -std=c++17 grandsire_bruteforce.cpp -o grandsire
g++ -O2 -std=c++17 grandsire_search.cpp    -o gsearch
g++ -O2 -std=c++17 grandsire_touches.cpp   -o touches
g++ -O2 -std=c++17 grandsire_solver.cpp    -o solver
g++ -O2 -std=c++17 -pthread grandsire_solver_mt.cpp -o solver_mt
echo "Built: ./grandsire  ./gsearch  ./touches  ./solver  ./solver_mt"
