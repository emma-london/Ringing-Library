import { Stage } from '../bell.js';
import { Change } from '../change.js';
import { CallDefinition } from '../composition.js';
import { MethodLibraryEntry } from '../method-library.js';

/**
 * A curated set of real methods, with place notations verified against the
 * Central Council method library and published blue lines. This is deliberately
 * a small, correct subset — enough to test truth against *real* methods in
 * Phase 3. A platform loader can replace it with the full CCCBR library later
 * (the `MethodLibrary` takes any array), without touching the core.
 */
export const STANDARD_METHODS: MethodLibraryEntry[] = [
  // Grandsire Triples — plain lead written out explicitly (14 changes).
  // Lead head 1253746; plain course = 5 leads / 70 rows (see context.md).
  {
    name: 'Grandsire Triples',
    stage: 7,
    notation: '3.1.7.1.7.1.7.1.7.1.7.1.7.1',
    classification: 'Place', // approximate; Grandsire predates the modern scheme
    leadHead: '1253746',
  },
  {
    name: 'Plain Bob Major',
    stage: 8,
    notation: '&-18-18-18-18,12',
    classification: 'Bob',
    leadHead: '13527486',
  },
  {
    name: 'Plain Bob Minor',
    stage: 6,
    notation: '&-16-16-16,12',
    classification: 'Bob',
  },
  {
    name: 'Plain Bob Doubles',
    stage: 5,
    notation: '&5.1.5.1.5,125',
    classification: 'Bob',
  },
  {
    name: 'Cambridge Surprise Major',
    stage: 8,
    notation: '&-38-14-1258-36-14-58-16-78,12',
    classification: 'Surprise',
    leadHead: '15738264',
  },
];

/**
 * Standard CompLib calls for Grandsire (bob `3.1`, single `3.123` at the lead
 * end — see context.md and ADR-0006). The replacement occupies the final two
 * changes of the lead.
 */
export function grandsireCalls(stage: Stage = 7): CallDefinition[] {
  return [
    {
      name: 'Bob',
      symbol: '-',
      changes: [Change.parse('3', stage), Change.parse('1', stage)],
    },
    {
      name: 'Single',
      symbol: 's',
      changes: [Change.parse('3', stage), Change.parse('123', stage)],
    },
  ];
}

/**
 * Standard CompLib calls for Plain Bob (bob `14`, single `1234` at the lead
 * end). The replacement occupies the final change of the lead.
 */
export function plainBobCalls(stage: Stage = 8): CallDefinition[] {
  return [
    { name: 'Bob', symbol: '-', changes: [Change.parse('14', stage)] },
    { name: 'Single', symbol: 's', changes: [Change.parse('1234', stage)] },
  ];
}
