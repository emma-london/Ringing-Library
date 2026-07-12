// Shared canonical hash of the standard-set seed (ADR-0023).
//
// Used by BOTH the producer (scripts/refresh-method-library.mjs, which writes
// the hash) and the verifier (scripts/check-standard-set.mjs, which compares
// it). Keeping the hashing in one place means the two can never drift.
//
// The hash captures the seed's *method membership* — which methods are in the
// standard set — not its formatting. It is:
//   - insensitive to key order, whitespace, and the ordering of seed lines
//     (so a cosmetic reflow of standard-set-seed.json does NOT force a refresh);
//   - sensitive to any add / remove / retitle-that-changes-matching of a method
//     (which DOES change the resolved standard-set.json, so a refresh is due).
// Title normalisation mirrors `normTitle` in refresh-method-library.mjs, so the
// hash changes exactly when the seed→snapshot resolution would.

import { createHash } from 'node:crypto';

/** Normalise a title the way the refresh script matches them (case, curly
 * quotes, whitespace). Kept in sync with refresh-method-library.mjs. */
function normTitle(s) {
  return String(s).toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
}

/**
 * Canonical SHA-256 (hex) of the seed's method membership.
 * @param {string} seedRaw raw contents of standard-set-seed.json
 */
export function seedHash(seedRaw) {
  const methods = JSON.parse(seedRaw).methods;
  const canonical = methods
    .map((m) => ({ id: m.id ?? null, name: normTitle(m.name), stage: m.stage }))
    .sort((a, b) => (a.id ?? -1) - (b.id ?? -1) || a.stage - b.stage || a.name.localeCompare(b.name));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
