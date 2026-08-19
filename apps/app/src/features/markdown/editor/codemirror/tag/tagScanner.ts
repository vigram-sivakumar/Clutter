/**
 * Pure text-level tag grammar — no Lezer dependency, matching the same
 * scanner/glue split `wikiLinkScanner.ts` uses. Deliberately matches
 * `TagExtractor.ts`'s own already-shipped extraction regex
 * (`/(^|\s)#([a-zA-Z0-9_-]+)/g`) exactly: identifier characters are
 * `[A-Za-z0-9_-]+`, no path/nesting syntax, no escaping. This is a real
 * constraint, not a style choice — the editor's live rendering must never
 * disagree with what Vault Ingest actually indexes as a tag, or the two
 * would silently drift (something rendered as a tag in the editor that
 * TagExtractor never picks up on save, or vice versa).
 */

const TAG_NAME_PATTERN = /^[A-Za-z0-9_-]+/;

export interface TagMatch {
  /** The identifier only, without the leading `#` — e.g. "project" for "#project". */
  readonly name: string;
  /** Offset, relative to the scan start, one past the last matched identifier character. */
  readonly end: number;
}

/**
 * Scans for `#<identifier>` starting exactly at `offset` in `text`.
 * `text[offset]` must be `#`; returns `null` if there is no `#` there, or
 * if no valid identifier character follows it (a bare `#`, `#-only-punctuation`,
 * or end-of-input right after the `#` is not a tag).
 */
export function scanTag(text: string, offset: number): TagMatch | null {
  if (text[offset] !== '#') {
    return null;
  }

  const match = TAG_NAME_PATTERN.exec(text.slice(offset + 1));
  if (!match) {
    return null;
  }

  return { name: match[0], end: offset + 1 + match[0].length };
}

/**
 * Whether `char` (a single character, or `undefined` for "no character —
 * start of content") counts as valid context immediately before a `#` for
 * it to begin a tag — matches `TagExtractor.ts`'s `(^|\s)` lookbehind
 * exactly. JavaScript's `\s` (and this check) already includes `\n`, so a
 * tag at the start of any line — not just the start of the document — is
 * naturally covered without a separate "start of line" case.
 */
export function isValidTagPrecedingContext(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}
