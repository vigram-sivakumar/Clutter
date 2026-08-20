import type { CompletionContext } from '@codemirror/autocomplete';

import { isValidTagPrecedingContext, scanTag } from './tagScanner';

/**
 * Tag's own trigger boundary — not built on the shared `@`-family
 * `atTrigger.ts` (that primitive is scoped to `@`; `#` is a different
 * trigger character entirely) and not a generic "hash trigger" either,
 * mirroring `dateTrigger.ts`'s own precedent of a per-kind extractor
 * rather than widening a shared one.
 *
 * Reuses `tagScanner.ts`'s `isValidTagPrecedingContext`/`scanTag` — the
 * exact same identifier grammar the `Tag` node's own parser and
 * `TagExtractor.ts` already agree on — rather than a second regex.
 *
 * The query is the identifier text spanning the WHOLE `#identifier`, not
 * just the prefix up to the cursor: `scanTag` extends forward from the
 * `#` across the full line, so placing the cursor in the middle of an
 * already-typed tag (e.g. to fix a typo) still queries and replaces the
 * complete tag, not just what's left of the cursor — the same "cursor
 * position must not determine the query" rule
 * `wikiLinkCompletionSource.ts`'s reference-zone case documents for
 * WikiLink. Unlike WikiLink, there's no separate alias/closing-delimiter
 * zone to reactivate into — a tag is one flat span, so one extractor
 * covers both the fresh-typing and mid-edit cases.
 */
const TAG_QUERY_CHARS = /^[A-Za-z0-9_-]*$/;

export interface TagTriggerMatch {
  /** Position of the `#` itself. */
  readonly from: number;
  /** End of the full identifier (possibly past the cursor). */
  readonly to: number;
  /** The identifier text, without the leading `#`. */
  readonly query: string;
}

export function extractTagTriggerQuery(context: CompletionContext): TagTriggerMatch | null {
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const textBeforeCursor = line.text.slice(0, pos - line.from);

  const hashIndex = textBeforeCursor.lastIndexOf('#');
  if (hashIndex === -1) {
    return null;
  }

  const before = hashIndex > 0 ? textBeforeCursor[hashIndex - 1] : undefined;
  if (!isValidTagPrecedingContext(before)) {
    return null;
  }

  // Everything between the `#` and the cursor must already be valid
  // identifier text — a space, newline, or other break in there (e.g. a
  // second, unrelated `#` earlier on the line, or the tail of an already-
  // terminated tag) means the cursor isn't inside a live tag query at all.
  const betweenHashAndCursor = textBeforeCursor.slice(hashIndex + 1);
  if (!TAG_QUERY_CHARS.test(betweenHashAndCursor)) {
    return null;
  }

  const scanned = scanTag(line.text, hashIndex);
  const end = scanned ? scanned.end : hashIndex + 1;

  return {
    from: hashIndex + line.from,
    to: end + line.from,
    query: line.text.slice(hashIndex + 1, end),
  };
}
