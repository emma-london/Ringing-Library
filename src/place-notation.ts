import { Stage } from './bell.js';
import { Change } from './change.js';

/**
 * Parser and serialiser for place notation strings.
 *
 * Handles the full grammar used in change ringing:
 *  - 'X' or '-'  cross change (also acts as a separator)
 *  - '.'         separator between adjacent place-change tokens
 *  - '&'         optional explicit symmetric marker
 *  - ','         separates body from lead-end; ALWAYS implies palindromic
 *                expansion (body reflected, then lead-end appended)
 *
 * The '&' prefix is optional: 'body,leadEnd' and '&body,leadEnd' are
 * equivalent. Both produce a palindrome of the body (2n-1 changes) with
 * the lead-end appended (2n changes total). This matches the standard
 * ringing convention used by complib, Blueline, and ringing-lib.
 *
 * Without a comma, '&body' produces just the 2n-1 palindrome.
 * Without '&' or ',', all changes are taken as-is (full explicit notation).
 *
 * Examples:
 *  '&-18-18-18-18,12'              Plain Bob Major  (16 changes)
 *  '-18-18-18-18,12'               Same — & is optional when , is present
 *  '3.1.7.3.1.3,1'                 Stedman Triples  (12 changes)
 *  '&-38-14-1258-36-14-58-16-78,12'  Cambridge Surprise Major (32 changes)
 */
export class PlaceNotation {

  /**
   * Parse a full place notation string into an ordered array of Changes.
   *
   * Symmetric form ('&body,leadEnd'):
   *   Body of n changes expands to palindrome (2n-1 changes) plus the
   *   lead-end appended — giving 2n changes total.
   *   Without a comma: yields just the 2n-1 palindrome.
   *
   * Non-symmetric form:
   *   All changes written out in full, '-'/'X' act as cross tokens and
   *   as separators; '.' separates adjacent place tokens.
   *   If ',' is present, the part after it is appended as the lead-end.
   */
  static parse(notation: string, stage: Stage): Change[] {
    const s = notation.trim();

    // Strip optional & prefix — comma already implies palindromic expansion
    const body = s.startsWith('&') ? s.slice(1) : s;

    // Comma present → palindromic expansion + lead-end (with or without &)
    if (body.includes(',')) {
      return PlaceNotation._parseSymmetric(body, stage);
    }

    // & without comma → palindrome only (no lead-end appended)
    if (s.startsWith('&')) {
      return PlaceNotation._parseSymmetric(body, stage);
    }

    // No & and no comma → full explicit notation, take changes as-is
    return PlaceNotation._tokenize(s, stage);
  }

  /**
   * Reconstruct a compact place notation string from an array of Changes.
   *
   * Auto-detects symmetric palindromic sequences and emits '&...,<lead-end>'
   * form when symmetric=true (the default). Pass symmetric=false to force
   * full dot-separated output.
   */
  static stringify(changes: Change[], symmetric?: boolean): string {
    if (changes.length === 0) return '';

    const useSymmetric = symmetric ?? PlaceNotation._isSymmetric(changes);

    if (useSymmetric && changes.length >= 3) {
      // Body is all changes except the lead-end, up to the midpoint
      const n    = (changes.length) / 2;          // full lead = 2n changes
      const body = changes.slice(0, Math.ceil(n)); // first n changes
      const leadEnd = changes[changes.length - 1]!;
      return '&' + PlaceNotation._stringifyBody(body) + ',' + leadEnd.toString();
    }

    return PlaceNotation._stringifyBody(changes);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Parse the part after '&', which may contain a comma for the lead-end.
   *
   * `&body,leadEnd` → palindrome(body) + [leadEnd]   = 2n changes
   * `&body`         → palindrome(body)                = 2n-1 changes
   */
  private static _parseSymmetric(rest: string, stage: Stage): Change[] {
    const commaIdx = rest.indexOf(',');
    const bodyStr     = commaIdx !== -1 ? rest.slice(0, commaIdx) : rest;
    const leadEndStr  = commaIdx !== -1 ? rest.slice(commaIdx + 1).trim() : null;

    const body = PlaceNotation._tokenize(bodyStr, stage);
    if (body.length === 0) throw new Error('Empty symmetric place notation body');

    // Palindrome: body + reversed(body without its last element)
    const palindrome = [...body, ...body.slice(0, -1).reverse()];

    if (leadEndStr !== null) {
      palindrome.push(Change.parse(leadEndStr, stage));
    }

    return palindrome;
  }

  /**
   * Tokenize a place notation body string into Changes.
   *
   * '-' and 'X'/'x' each produce a cross change AND act as separators.
   * '.' is a pure separator (between adjacent place-change tokens).
   * Everything else is collected as a place-change token.
   */
  private static _tokenize(s: string, stage: Stage): Change[] {
    const changes: Change[] = [];
    let i = 0;

    while (i < s.length) {
      const c = s[i]!;

      if (c === '-' || c === 'x' || c === 'X') {
        changes.push(Change.cross(stage));
        i++;
      } else if (c === '.') {
        i++; // separator only
      } else {
        // Collect a run of bell characters into a place-change token
        let token = '';
        while (
          i < s.length &&
          s[i] !== '-' && s[i] !== 'x' && s[i] !== 'X' &&
          s[i] !== '.' && s[i] !== ','
        ) {
          token += s[i]!;
          i++;
        }
        if (token) changes.push(Change.parse(token, stage));
      }
    }

    return changes;
  }

  /**
   * Emit a dot-separated notation string, using '-' for cross changes.
   * Adjacent cross changes are separated by '.' for readability.
   */
  private static _stringifyBody(changes: Change[]): string {
    return changes
      .map(c => c.toString())
      .join('.')
      .replace(/X\.X/g, 'X.X'); // keep as-is; '-' vs 'X' is stylistic
  }

  /**
   * A lead is symmetric if the sequence (minus the lead-end) is a palindrome.
   * Checks changes[i] === changes[n-2-i] for i in 0..floor((n-1)/2)-1.
   */
  private static _isSymmetric(changes: Change[]): boolean {
    const n = changes.length;
    if (n < 3) return false;
    const body = changes.slice(0, n - 1);
    for (let i = 0; i < Math.floor(body.length / 2); i++) {
      if (!body[i]!.equals(body[body.length - 1 - i]!)) return false;
    }
    return true;
  }
}
