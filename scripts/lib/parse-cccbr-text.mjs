// Parser for the CCCBR Methods Library "Text" format (ADR-0015).
//
// Turns one per-class-per-stage CCCBR text file into an array of lean
// MethodLibraryEntry-shaped objects. Pure and I/O-free: it takes the raw file
// text plus the (class, stage) context that the file's URL already tells us,
// and returns plain objects. The network fetch, sharding and file writing live
// in the orchestrator (scripts/refresh-method-library.mjs) — the same
// "I/O lives outside the core" boundary ADR-0008's fixture loader established.
//
// Column layout of the text format (tab-separated; see
// http://methods.cccbr.org.uk/notes.html):
//   0 Id  1 Method  2 First rung  3 Refs  4 FCHs  5 Stage  6 Sym  7 Lit
//   8 LLen  9 Leadhead  10.. Place-notation tokens (one change per column)
//
// The Lean field set kept per ADR-0015: id, name, stage, classification,
// notation, leadHeadCode (or leadHead row), symmetry, little. First-rung date,
// refs, FCHs and lead length are deliberately dropped (provenance / derivable).

/** Bell-name characters, bells 1..33 — must match src/bell.ts BELL_NAMES. */
const BELL_CHARS = '1234567890ETABCDFGHJKLMNPQRSUVWYZ';

/** Stage number -> the stage word used in full method titles. */
const STAGE_NAMES = {
  2: 'Two', 3: 'Singles', 4: 'Minimus', 5: 'Doubles', 6: 'Minor', 7: 'Triples',
  8: 'Major', 9: 'Caters', 10: 'Royal', 11: 'Cinques', 12: 'Maximus',
  13: 'Sextuples', 14: 'Fourteen', 15: 'Septuples', 16: 'Sixteen',
  17: 'Octuples', 18: 'Eighteen', 20: 'Twenty', 22: 'Twenty-Two',
};

/**
 * The class word inserted into a full title for a given CCCBR file class.
 * Plain / Principle / Hybrid contribute no word (Plain sub-classes live in the
 * displayed name already; "Principle"/"Hybrid" are not title words).
 */
const CLASS_WORD = {
  Surprise: 'Surprise', Delight: 'Delight', 'Treble Bob': 'Treble Bob',
  Alliance: 'Alliance', 'Treble Place': 'Treble Place',
};

/** Our MethodClassification for a file class (+ name, to split Plain). */
export function classificationFor(fileClass, displayedName) {
  switch (fileClass) {
    case 'Plain':
      return displayedName.trim().endsWith('Place') ? 'Place' : 'Bob';
    case 'Principle': return 'Principle';
    case 'Hybrid': return 'Hybrid';
    case 'Surprise': return 'Surprise';
    case 'Delight': return 'Delight';
    case 'Treble Bob': return 'Treble Bob';
    case 'Alliance': return 'Alliance';
    case 'Treble Place': return 'Treble Place';
    default:
      throw new Error(`Unsupported CCCBR file class: ${fileClass}`);
  }
}

/** "Cambridge" + Surprise + 8 -> "Cambridge Surprise Major". */
export function reconstructTitle(displayedName, fileClass, stage) {
  const stageWord = STAGE_NAMES[stage];
  if (!stageWord) throw new Error(`No stage word for stage ${stage}`);
  const classWord = CLASS_WORD[fileClass] ?? '';
  return [displayedName.trim(), classWord, stageWord].filter(Boolean).join(' ');
}

/**
 * Join CCCBR change tokens into a canonical place-notation string.
 * `['-','34','-','14']` -> `'-34-14'`; `['3','1','7','1']` -> `'3.1.7.1'`.
 * (`join('.')` then collapse the dots that surround a cross change.)
 */
export function cccbrTokensToNotation(tokens) {
  return tokens.join('.').replace(/\.?-\.?/g, '-');
}

/** Is `s` a full lead-head row (all bell chars, length == stage)? */
function isLeadHeadRow(s, stage) {
  return s.length === stage && [...s].every((c) => BELL_CHARS.includes(c));
}

/** Minimal HTML-entity decode (the text files are served inside HTML). */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'");
}

/**
 * Parse one CCCBR text file into lean entries.
 *
 * @param {string} rawText  the file body (HTML wrapper tolerated)
 * @param {{fileClass: string, stage: number}} ctx
 * @returns {Array<object>} MethodLibraryEntry-shaped plain objects
 */
export function parseTextLibrary(rawText, { fileClass, stage }) {
  const lines = decodeEntities(rawText).split(/\r?\n/);
  const entries = [];
  let seenHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/<[^>]*>/g, ''); // strip any stray HTML tags
    if (!seenHeader) {
      if (/^\s*Id\b/.test(line) && line.includes('Method')) seenHeader = true;
      continue;
    }
    if (line.includes('```')) break; // end of the fenced block, if present
    const fields = line.split('\t');
    if (fields.length < 11) continue; // not a data row
    const id = Number.parseInt(fields[0].trim(), 10);
    if (!Number.isFinite(id)) continue;

    const displayedName = fields[1].trim();
    const rowStage = Number.parseInt(fields[5].trim(), 10);
    if (rowStage !== stage) continue; // guard against layout drift
    const symmetry = fields[6].trim();
    const little = fields[7].trim().toUpperCase() === 'Y';
    const leadHeadRaw = fields[9].trim();
    const tokens = fields.slice(10).map((t) => t.trim()).filter((t) => t.length > 0);
    if (tokens.length === 0) continue;

    const entry = {
      id,
      name: reconstructTitle(displayedName, fileClass, stage),
      stage,
      classification: classificationFor(fileClass, displayedName),
      notation: cccbrTokensToNotation(tokens),
    };
    if (isLeadHeadRow(leadHeadRaw, stage)) {
      entry.leadHead = leadHeadRaw;           // uncoded: a full row
    } else if (leadHeadRaw) {
      entry.leadHeadCode = leadHeadRaw;       // coded: a-s (+ optional digit)
    }
    if (symmetry) entry.symmetry = symmetry;
    if (little) entry.little = true;
    entries.push(entry);
  }
  return entries;
}
