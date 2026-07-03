/**
 * Phase 4a engine core (ADR-0013, ADR-0017, ADR-0018).
 *
 * A verified, optimized-TypeScript composition engine behind a stable seam
 * ({@link CompositionEngine}). {@link LeadHeadEngine} is the generic engine over
 * any lead-head (treble-hunt) `Method` + its calls; {@link GrandsireTriplesEngine}
 * is a named preset over it (and the C++ live-diff path). It ports the validated
 * search prototypes (`prototypes/grandsire_solver.cpp`) and is callable directly
 * and synchronously — no `Executor`/chunking (that is Phase 4b). A future
 * Rust/wasm-pack build can implement the same seam for extra performance
 * (ADR-0017); the interface is the durable part.
 */
export { LeadHeadEngine } from './lead-head-engine.js';
export { GrandsireTriplesEngine } from './grandsire-triples-engine.js';
export type {
  CompositionEngine,
  EngineTouch,
  EngineFind,
  CountRow,
  CountReport,
  MitmCount,
  QSet,
} from './lead-head-engine.js';
