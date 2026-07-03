import { Method } from '../method.js';
import { STANDARD_METHODS, grandsireCalls } from '../data/standard-methods.js';
import { LeadHeadEngine } from './lead-head-engine.js';

const GRANDSIRE_TRIPLES = STANDARD_METHODS.find((m) => m.name === 'Grandsire Triples')!;

/**
 * Grandsire Triples engine — now a **thin preset** over the generic
 * {@link LeadHeadEngine} (ADR-0018). It exists as a named convenience and as the
 * path the C++ live-diff oracle (`scripts/engine-live-diff.mjs`) validates: the
 * Grandsire Triples `Method` + `grandsireCalls(7)` fed to the generic engine.
 *
 * All behaviour (count / list / find / mitmCount / qsets, snap finishes,
 * `Composition` results) comes from `LeadHeadEngine`; nothing Grandsire-specific
 * lives here any more beyond the method and call definitions.
 */
export class GrandsireTriplesEngine extends LeadHeadEngine {
  constructor() {
    super(
      Method.fromPlaceNotation(GRANDSIRE_TRIPLES.notation, 7, GRANDSIRE_TRIPLES.name),
      grandsireCalls(7),
    );
  }
}
