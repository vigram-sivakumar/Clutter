/**
 * THE tag grammar — the one definition of what a Markdown `#tag` is, used
 * by the editor's `Tag` Lezer node (`tagSyntax.ts`), by Vault Ingest's
 * extraction (`findTagOccurrences.ts` → `TagExtractor`), by tag rename/
 * removal (`tagMarkdownEdits.ts`), and by every editor-side consumer that
 * needs to ask "is this text a tag" (decorations, activation, completion
 * trigger, the Properties tag input). Nothing else in the codebase may
 * express this grammar again: this is a pure text-level lexer (no Lezer
 * dependency), and *where* a `#` may start a tag at all (not inside code,
 * not escaped, not inside a URL, not a heading marker) is decided by the
 * Markdown parse tree, never by a second scan.
 *
 * Grammar (docs/tag-architecture-research.md §2):
 * - A tag is `#` followed by a run of Unicode letters, numbers, combining
 *   marks, `_` and `-`.
 * - The run must contain at least one letter (`#1984`, `#123`, `#_` are
 *   not tags — issue/PR references stay text).
 * - Trailing `-`/`_` are not part of the tag (`#design-` is `#design`).
 * - `.`, `,`, `:`, `)` … end the tag (sentence punctuation): `#design.` is
 *   the tag `design` followed by `.`; `#foo.bar` is `#foo` + `.bar`.
 * - A run immediately followed by `/` and more tag characters is **not a
 *   tag at all** (`#foo/bar`): `/` is reserved for future nested tags, and
 *   truncating to `#foo` would silently misindex what the user wrote.
 * - A run longer than MAX_TAG_LENGTH is not a tag (never truncated).
 */

const TAG_RUN = /[\p{L}\p{N}\p{M}_-]+/uy;
const TAG_CHAR = /[\p{L}\p{N}\p{M}_-]/u;
const HAS_LETTER = /\p{L}/u;
const TRAILING_SEPARATORS = /[-_]+$/;

export const MAX_TAG_LENGTH = 100;

export interface TagMatch {
  /** The identifier only, without the leading `#` — e.g. "project" for "#project". */
  readonly name: string;
  /** Offset, relative to the scan start, one past the last matched identifier character. */
  readonly end: number;
}

/**
 * Scans for `#<identifier>` starting exactly at `offset` in `text`.
 * `text[offset]` must be `#`. Returns `null` when there is no `#` there or
 * what follows is not a valid tag per the grammar above.
 */
export function scanTag(text: string, offset: number): TagMatch | null {
  if (text[offset] !== '#') {
    return null;
  }

  TAG_RUN.lastIndex = offset + 1;
  const match = TAG_RUN.exec(text);
  if (!match) {
    return null;
  }

  const runEnd = offset + 1 + match[0].length;

  // `#foo/bar`: reserved nested-tag shape — reject the whole token.
  if (text[runEnd] === '/' && runEnd + 1 < text.length && TAG_CHAR.test(text[runEnd + 1]!)) {
    return null;
  }

  const name = match[0].replace(TRAILING_SEPARATORS, '');

  if (!name || name.length > MAX_TAG_LENGTH || !HAS_LETTER.test(name)) {
    return null;
  }

  return { name, end: offset + 1 + name.length };
}

/**
 * Whether `char` (a single character, or `undefined` for "no character —
 * start of content") counts as valid context immediately before a `#` for
 * it to begin a tag: start of content or whitespace. JavaScript's `\s`
 * already includes `\n`, so a tag at the start of any line is covered.
 */
export function isValidTagPrecedingContext(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

/**
 * Whether `text` consists only of characters a tag may contain — used by
 * the completion trigger to decide that the text between a `#` and the
 * cursor is still a live tag query. Same character class as `scanTag`.
 */
export function isTagQueryText(text: string): boolean {
  return /^[\p{L}\p{N}\p{M}_-]*$/u.test(text);
}

/**
 * Whether `name` (no leading `#`) is, in full, one valid tag per the
 * grammar — what any code that *creates* a tag name (rename target,
 * "create tag", the Properties tag input) must check, so nothing is ever
 * written that the grammar would then read back as a different tag.
 */
export function isValidTagName(name: string): boolean {
  const match = scanTag(`#${name}`, 0);

  return match !== null && match.name === name;
}
