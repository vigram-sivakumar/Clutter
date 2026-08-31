/**
 * Pure text-level `@completed:<date>` grammar — no Lezer dependency,
 * matching the same scanner/glue split `dateScanner.ts`/`tagScanner.ts`/
 * `wikiLinkScanner.ts` use.
 *
 * Shape-only: the literal `completed:` immediately after `@`, followed by
 * a `\d{4}-\d{2}-\d{2}` date shape, `[A-Za-z0-9]`-bounded (rejects
 * `@completed:2026-08-31x` as a false continuation), preceded by
 * whitespace or start of content. Deliberately does NOT validate calendar
 * correctness — same parse-vs-validate split `dateScanner.ts` documents
 * for its own bare-`@date` shape.
 *
 * Independently mirrors (does not import) `core/vault/ingest/extractors/
 * TaskExtractor.ts`'s own `METADATA_TOKEN_PATTERN`/`RecognizedMetadataKey`
 * (`@([a-zA-Z]+):(\S+)`, `'due' | 'completed'`) — the exact same
 * non-sharing precedent `dateScanner.ts`'s own doc comment already
 * establishes and explains: "nothing in this codebase lets `core/vault/`
 * import from `features/markdown/editor/`," and the reverse direction is
 * avoided too, by the same convention, for every other Vault-Ingest/
 * editor-scanner pair (`TagExtractor.ts` vs. `tagScanner.ts`). Narrower
 * than `TaskExtractor.ts`'s own general `@key:value` shape on purpose:
 * this slice only needs `@completed:` recognized (the one construct the
 * visual-rendering work requires hiding) — `@due:` is a `TaskExtractor.ts`-
 * only concept today, not rendered specially by this grammar, and adding
 * it here is a separate, later, explicitly-scoped decision, not something
 * to speculatively generalize to now.
 */

const DATE_SHAPE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const COMPLETED_KEY_PREFIX = 'completed:';

export interface TaskCompletionMetadataMatch {
  /** Offset, relative to the scan start, one past the last matched character. */
  readonly end: number;
}

/**
 * Scans for `@completed:<date-shape>` starting exactly at `offset` in
 * `text`. `text[offset]` must be `@`; returns `null` if there is no `@`
 * there, if it isn't immediately followed by the literal `completed:`, if
 * the next 10 characters don't match `\d{4}-\d{2}-\d{2}`, or if the
 * character immediately after that shape is itself alphanumeric.
 */
export function scanTaskCompletionMetadata(
  text: string,
  offset: number
): TaskCompletionMetadataMatch | null {
  if (text[offset] !== '@') {
    return null;
  }

  const afterAt = text.slice(offset + 1);
  if (!afterAt.startsWith(COMPLETED_KEY_PREFIX)) {
    return null;
  }

  const afterKey = afterAt.slice(COMPLETED_KEY_PREFIX.length);
  const match = DATE_SHAPE_PATTERN.exec(afterKey);
  if (!match) {
    return null;
  }

  const end = offset + 1 + COMPLETED_KEY_PREFIX.length + match[0].length;
  const boundary = text[end];
  if (boundary !== undefined && /[A-Za-z0-9]/.test(boundary)) {
    return null;
  }

  return { end };
}

/**
 * Same whitespace-or-start rule `dateScanner.ts`'s own
 * `isValidDatePrecedingContext` establishes for bare `@date` — applied
 * identically here so `Completed@completed:2026-08-31` (no separating
 * space) does not match, matching every other `@`/`#`-triggered
 * construct's own preceding-context rule in this codebase.
 */
export function isValidTaskCompletionMetadataPrecedingContext(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}
