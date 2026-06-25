/**
 * Bell and Stage primitives.
 */

/**
 * A Bell is a 0-based index: 0 = treble, 1 = 2nd, etc.
 * Kept as a plain number to avoid boxing overhead.
 */
export type Bell = number;

/**
 * The number of bells in a method or row.
 */
export type Stage = number;

export const Stage = {
  SINGLES:  3,
  MINIMUS:  4,
  DOUBLES:  5,
  MINOR:    6,
  TRIPLES:  7,
  MAJOR:    8,
  CATERS:   9,
  ROYAL:    10,
  CINQUES:  11,
  MAXIMUS:  12,
} as const;

/**
 * Standard bell name characters in order.
 * Index 0 → '1' (treble), index 9 → '0' (ten), index 10 → 'E', index 11 → 'T'.
 */
export const BELL_NAMES = '1234567890ET';

/**
 * Convert a 0-based bell index to its display character.
 * Throws if the index is out of range.
 */
export function bellToChar(b: Bell): string {
  const c = BELL_NAMES[b];
  if (c === undefined) {
    throw new RangeError(`Bell index ${b} out of range (max ${BELL_NAMES.length - 1})`);
  }
  return c;
}

/**
 * Parse a bell character to its 0-based index.
 * Throws if the character is not recognised.
 */
export function bellFromChar(c: string): Bell {
  const i = BELL_NAMES.indexOf(c);
  if (i === -1) {
    throw new Error(`Unrecognised bell character: '${c}'`);
  }
  return i;
}
