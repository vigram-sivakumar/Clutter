/**
 * Pure text-level Date grammar — no Lezer dependency, matching the same
 * scanner/glue split `wikiLinkScanner.ts`/`tagScanner.ts` use.
 *
 * Shape-only: `[A-Za-z0-9]`-bounded `\d{4}-\d{2}-\d{2}` after `@`, preceded
 * by whitespace or start of content. Deliberately does NOT validate
 * calendar correctness (`2026-13-45` still matches) — that's a separate,
 * later concern (`isValidCalendarDate`, `shared/helpers/time`), per the
 * parse-vs-validate distinction already established for `@due:`-style
 * property values (docs/editor-research/clutter-editor-shared-semantic-inline-model.md).
 * Falling all the way through to plain text for a shape-valid-but-
 * calendar-invalid date would make "malformed" indistinguishable from
 * "not a date at all," losing real information.
 *
 * Independently mirrors (does not import) `TaskExtractor.ts`'s
 * `BARE_DATE_PATTERN` — same non-sharing precedent every other pair of
 * Vault-Ingest/editor-scanner regexes in this codebase already follows
 * (`TagExtractor.ts` vs. `tagScanner.ts`), since nothing in this codebase
 * lets `core/vault/` import from `features/markdown/editor/`.
 */

const DATE_SHAPE_PATTERN = /^\d{4}-\d{2}-\d{2}/;

export interface DateMatch {
  /** The matched date text, e.g. "2026-08-20" — shape-valid, not necessarily calendar-valid. */
  readonly isoDate: string;
  /** Offset, relative to the scan start, one past the last matched date character. */
  readonly end: number;
}

/**
 * Scans for `@<date-shape>` starting exactly at `offset` in `text`.
 * `text[offset]` must be `@`; returns `null` if there is no `@` there, if
 * the following 10 characters don't match `\d{4}-\d{2}-\d{2}`, or if the
 * character immediately after that shape is itself alphanumeric (rejects
 * `@2026-08-20x` — a false continuation, not a valid date boundary).
 */
export function scanDate(text: string, offset: number): DateMatch | null {
  if (text[offset] !== '@') {
    return null;
  }

  const match = DATE_SHAPE_PATTERN.exec(text.slice(offset + 1));
  if (!match) {
    return null;
  }

  const end = offset + 1 + match[0].length;
  const boundary = text[end];
  if (boundary !== undefined && /[A-Za-z0-9]/.test(boundary)) {
    return null;
  }

  return { isoDate: match[0], end };
}

/**
 * Whether `char` (a single character, or `undefined` for "no character —
 * start of content") counts as valid context immediately before `@` for a
 * Date to begin there — same whitespace-or-start rule `tagScanner.ts`'s
 * `isValidTagPrecedingContext` already establishes for `#`, applied here
 * to `@` instead. Not shared code with Tag's version (each kind keeps its
 * own copy, per the established per-kind-adapter precedent), but the same
 * rule: `foo@2026-08-20` must not match, `foo @2026-08-20` must.
 */
export function isValidDatePrecedingContext(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}
