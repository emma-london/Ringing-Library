export { Stage, BELL_NAMES, bellToChar, bellFromChar } from './bell.js';
export type { Bell } from './bell.js';
export { Row } from './row.js';
export { Change } from './change.js';
export { PlaceNotation } from './place-notation.js';
export { Method } from './method.js';
export { Prover, Proof } from './prover.js';
export type { FalseRow } from './prover.js';
export { Composition, CompositionBuilder, COMPOSITION_JSON_SCHEMA_VERSION } from './composition.js';
export type { CallDefinition, CallingEntry, CompositionJSON } from './composition.js';
export { Touch } from './touch.js';
export { searchTouches, searchStedmanTouches } from './search.js';
export type {
  SearchOptions,
  SearchResult,
  SearchReport,
  StedmanCall,
  StedmanSearchOptions,
} from './search.js';
export { MethodLibrary } from './method-library.js';
export type { MethodLibraryEntry, MethodClassification } from './method-library.js';
export { LeadHeadEngine, GrandsireTriplesEngine } from './engine/index.js';
export type {
  CompositionEngine,
  EngineTouch,
  EngineFind,
  CountRow,
  CountReport,
  MitmCount,
  QSet,
} from './engine/index.js';
export {
  standardCalls,
  grandsireCalls,
  plainBobCalls,
  stedmanCalls,
  stedmanTriplesCalls,
  stedmanComposition,
  stedmanTriplesComposition,
} from './data/standard-methods.js';

// ---------------------------------------------------------------------------
// Deprecated public export (ADR-0020)
// ---------------------------------------------------------------------------

import { type MethodLibraryEntry } from './method-library.js';
import { STANDARD_METHODS as STANDARD_METHODS_CORPUS } from './data/standard-methods.js';

let _warnedStandardMethods = false;

/**
 * @deprecated Since 1.2.0 — scheduled for removal in 2.0.0 (ADR-0020, per the
 * ADR-0016 deprecation policy).
 *
 * `STANDARD_METHODS` is the small, hand-verified **truth corpus** (~10 methods)
 * used to test the core against methods whose place notation was checked by hand
 * — it is not the set an application should build a `MethodLibrary` from. For
 * that, use the bundled **standard set** (~45 methods), exposed as its own
 * subpath export:
 *
 * ```ts
 * import { MethodLibrary } from 'ringing-lib-ts';
 * import { STANDARD_SET } from 'ringing-lib-ts/data/standard-set';
 * const lib = new MethodLibrary(STANDARD_SET);
 * ```
 *
 * Accessing this export logs a one-time deprecation warning at runtime.
 */
export const STANDARD_METHODS: MethodLibraryEntry[] = new Proxy(STANDARD_METHODS_CORPUS, {
  get(target, prop, receiver) {
    if (!_warnedStandardMethods) {
      _warnedStandardMethods = true;
      console.warn(
        "[ringing-lib-ts] `STANDARD_METHODS` is deprecated and will be removed in 2.0.0. " +
          "It is a small hand-verified truth corpus, not the set to build a MethodLibrary from. " +
          "Use the bundled standard set instead: " +
          "import { STANDARD_SET } from 'ringing-lib-ts/data/standard-set'.",
      );
    }
    return Reflect.get(target, prop, receiver);
  },
});
