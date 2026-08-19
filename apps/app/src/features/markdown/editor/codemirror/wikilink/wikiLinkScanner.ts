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
 * `stopOnPipe` is true) or the first unescaped `]]`. When `requireStop` is
 * true (the default — every existing call site relies on this), returns
 * `null` if the input ends before either stop condition is reached, so
 * `scanWikiLink`'s all-or-nothing contract is unchanged: a closed WikiLink
 * that never finds its terminator is genuinely invalid, not a partial
 * result. When `requireStop` is false, running off the end of `text`
 * without finding a stop is a valid outcome (used for in-progress,
 * not-yet-closed text, which has no `]]` to find) — the fully-decoded text
 * scanned so far is still returned rather than discarded.
 */
function scanSegment(text: string, start: number, stopOnPipe: boolean, requireStop = true): SegmentScan | null {
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

  return requireStop ? null : { text: out, stoppedAt: i, stoppedOnPipe: false };
}

export interface WikiLinkQuerySplit {
  /** Decoded (escapes resolved) text before the first unescaped `|`, or the whole (decoded) input if it has none. */
  readonly reference: string;
  /** Index of the first unescaped `|` within the original (raw, undecoded) `text` passed in, or `null` if there is none. */
  readonly pipeIndex: number | null;
}

/**
 * For in-progress (not-yet-closed) `[[...` text — i.e. everything between
 * the opening `[[` and the cursor, with no `]]` yet — splits it at the
 * first unescaped `|`, if any, reusing {@link scanSegment}'s own escaping
 * rules rather than a second, separate notion of "unescaped pipe" (the
 * same escaping semantics {@link scanWikiLink} already applies once the
 * link closes). `requireStop: false` is what makes this valid for
 * in-progress text specifically: there is no closing `]]` for it to stop
 * on, so running off the end of `text` (no `|` typed yet) is an expected
 * outcome here, not the "invalid/incomplete" case `scanWikiLink` itself
 * still treats as `null`.
 */
export function splitAtFirstUnescapedPipe(text: string): WikiLinkQuerySplit {
  // requireStop: false — see the doc comment above and on scanSegment
  // itself — so this is never null.
  const scan = scanSegment(text, 0, true, false) as SegmentScan;
  return { reference: scan.text, pipeIndex: scan.stoppedOnPipe ? scan.stoppedAt : null };
}

/**
 * Raw-buffer offset (not decoded) of the last unescaped `/` within a
 * WikiLink's reference text (e.g. `"Projects/Project A/Note"`), or `null`
 * if it has no folder component. Used to find the boundary between the
 * folder prefix — concealed while the WikiLink is engaged, per the
 * editing-representation UX — and the filename, which always stays
 * visible; a raw offset because it feeds directly into a
 * `Decoration.replace` range, not a decoded display string.
 *
 * Deliberately narrower than {@link scanSegment}'s general escape
 * handling: it only needs to skip a backslash-escaped pair so an escaped
 * `\/` is never mistaken for a real path separator, not to validate which
 * character was escaped or to decode the result — the caller only needs
 * *where* the last separator is. Callers pass the already-isolated
 * reference text (e.g. `referenceZoneAt`'s own `[from, to)` slice), which
 * never contains the alias or the closing `]]`.
 */
export function lastUnescapedSlashOffset(referenceText: string): number | null {
  let last: number | null = null;
  let i = 0;

  while (i < referenceText.length) {
    if (referenceText[i] === '\\' && i + 1 < referenceText.length) {
      i += 2;
      continue;
    }
    if (referenceText[i] === '/') {
      last = i;
    }
    i += 1;
  }

  return last;
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
