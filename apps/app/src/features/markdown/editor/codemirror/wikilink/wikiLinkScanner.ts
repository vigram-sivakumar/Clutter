export interface WikiLinkMatch {
  readonly path: string;
  readonly alias: string | null;
  /** Index one past the closing `]]`, within the `text` passed to {@link scanWikiLink}. */
  readonly end: number;
}

/**
 * CommonMark's escapable ASCII punctuation set (the full set — WikiLink
 * escaping reuses CommonMark's own backslash-escape semantics rather than
 * inventing a narrower one, per the locked grammar decision). A backslash
 * followed by one of these is a recognized escape (literal character,
 * backslash consumed); a backslash followed by anything else is not a
 * recognized escape at all (both characters stay literal).
 */
const ASCII_PUNCTUATION = new Set([
  '!', '"', '#', '$', '%', '&', "'", '(', ')', '*', '+', ',', '-', '.', '/',
  ':', ';', '<', '=', '>', '?', '@', '[', '\\', ']', '^', '_', '`', '{', '|',
  '}', '~',
]);

interface SegmentScan {
  readonly text: string;
  /** Index of the character that stopped the scan — the unescaped `|`, or the first `]` of an unescaped `]]`. */
  readonly stoppedAt: number;
  readonly stoppedOnPipe: boolean;
}

/**
 * Scans literal content from `start`, honoring single-character backslash
 * escapes throughout. Stops at the first unescaped `|` (only when
 * `stopOnPipe` is true) or the first unescaped `]]`. Returns `null` if the
 * input ends before either stop condition is reached — this function never
 * returns a partial result.
 */
function scanSegment(text: string, start: number, stopOnPipe: boolean): SegmentScan | null {
  let out = '';
  let i = start;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '\\' && i + 1 < text.length) {
      // The i + 1 < text.length check above guarantees this index is in
      // bounds; the assertion is only needed because indexed access is
      // typed as possibly-undefined regardless of prior bounds checks.
      const escaped = text[i + 1] as string;
      if (ASCII_PUNCTUATION.has(escaped)) {
        out += escaped;
        i += 2;
        continue;
      }
      // Not a recognized escape — both characters stay literal, matching
      // CommonMark's own handling of an escape of a non-punctuation char.
      out += ch;
      i += 1;
      continue;
    }

    if (stopOnPipe && ch === '|') {
      return { text: out, stoppedAt: i, stoppedOnPipe: true };
    }

    if (ch === ']' && text[i + 1] === ']') {
      return { text: out, stoppedAt: i, stoppedOnPipe: false };
    }

    out += ch;
    i += 1;
  }

  return null;
}

/**
 * Scans a WikiLink starting at `startIndex`, which must point at the first
 * `[` of an opening `[[`. Implements, exactly as locked:
 *
 * - first unescaped `|` is the alias separator, and only the first —
 *   further unescaped pipes are literal alias text;
 * - first unescaped `]]` always terminates (lazy match, not greedy);
 * - CommonMark-style single-character backslash escaping;
 * - no nested `[[` (an inner `[[` is never special-cased, so it's already
 *   just literal data by construction — nothing here treats it specially);
 * - all-or-nothing: returns `null` on any failure to find a valid close,
 *   never a partial result;
 * - continuation-lookahead: returns `null` (deferring to `Link`/`Image`)
 *   if `(` or `[` immediately follows the close, so a genuine CommonMark
 *   link/image whose text happens to be a doubled bracket is never stolen.
 */
export function scanWikiLink(text: string, startIndex: number): WikiLinkMatch | null {
  if (text[startIndex] !== '[' || text[startIndex + 1] !== '[') {
    return null;
  }

  const pathScan = scanSegment(text, startIndex + 2, true);
  if (!pathScan) {
    return null;
  }

  const path = pathScan.text;
  let alias: string | null = null;
  let closeStart: number;

  if (pathScan.stoppedOnPipe) {
    const aliasScan = scanSegment(text, pathScan.stoppedAt + 1, false);
    if (!aliasScan) {
      return null;
    }
    alias = aliasScan.text;
    closeStart = aliasScan.stoppedAt;
  } else {
    closeStart = pathScan.stoppedAt;
  }

  const end = closeStart + 2;
  const after = text[end];
  if (after === '(' || after === '[') {
    return null;
  }

  return { path, alias, end };
}
