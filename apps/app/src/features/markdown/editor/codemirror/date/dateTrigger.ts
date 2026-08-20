import type { CompletionContext } from '@codemirror/autocomplete';

import type { AtTriggerMatch } from '../at/atTrigger';
import { isValidDatePrecedingContext, scanDate } from './dateScanner';
import { MAX_DATE_QUERY_TOKENS } from './dateQueryResolver';

/**
 * Date's own trigger boundary — deliberately separate from, and does not
 * modify, the shared `atTrigger.ts`. `atTrigger.ts`'s `/@[^\s]*$/` is a
 * single-word boundary by design (documented there as the reusable
 * primitive for any future `@`-kind); Date is the one kind whose grammar
 * needs a query to survive internal spaces (`@12 mar`, `@2027 jan 12`).
 * Widening the shared pattern in place would change behavior for every
 * future `@`-provider built on it, not just Date — so Date gets its own
 * extractor instead, mirroring how `wikiLinkCompletionSource.ts` already
 * has its own `WIKILINK_TRIGGER_PATTERN` rather than reusing `atTrigger.ts`.
 *
 * Unlike WikiLink's `[[...]]`, `@` has no closing delimiter to bound a
 * multi-word query syntactically, so this does not try to validate
 * "still looks like a date" token-by-token here — it only bounds the
 * query to at most `MAX_DATE_QUERY_TOKENS` space-separated words (no
 * supported grammar form is longer) and rejects a couple of clearly
 * non-date shapes (leading whitespace right after `@`, tabs/newlines).
 * The actual "is this still a valid/plausible date expression" judgment
 * belongs to `dateQueryResolver.ts` alone — once it returns no result,
 * `dateCompletionSource.ts` returns `null` and the popup closes on its
 * own, which is what "terminates correctly when the expression ends"
 * means in practice: no separate grammar predictor duplicated here.
 */
export function extractDateTriggerQuery(context: CompletionContext): AtTriggerMatch | null {
  const { state, pos } = context;
  const line = state.doc.lineAt(pos);
  const textBeforeCursor = line.text.slice(0, pos - line.from);

  const atIndex = textBeforeCursor.lastIndexOf('@');
  if (atIndex === -1) {
    return null;
  }

  const before = atIndex > 0 ? textBeforeCursor[atIndex - 1] : undefined;
  if (!isValidDatePrecedingContext(before)) {
    return null;
  }

  // A complete `@YYYY-MM-DD` is a *closed* Date expression — the grammar
  // never continues past one (no "ISO date + more tokens" form exists).
  // Reusing `scanDate` (the exact same shape-check the Date node's own
  // parser uses) here, rather than a second regex, means this can never
  // drift from what actually counts as a complete Date shape. Once such a
  // shape is immediately followed by anything at all — even just the
  // space a user types after accepting a completion — the trigger must
  // die outright, not merely re-narrow to the closed token: an accepted
  // `@2026-08-20` followed by Space must show no popup at all, matching
  // ordinary text after any other completed token. Tokens that are only
  // *prefixes* of a larger expression (`12`, `mar`, `2027`, `2027 jan`)
  // never match this shape, so they're unaffected and stay live across a
  // trailing space exactly as before.
  //
  // `scanDate(text, offset)`'s returned `end` is already an index into
  // `text` itself (`offset` is baked into its arithmetic) — since `text`
  // here is the *un-sliced* `textBeforeCursor` and `offset` is `atIndex`,
  // `closedDate.end` is already directly comparable against
  // `textBeforeCursor.length`. Adding `atIndex` again double-counts it —
  // a real bug this comment used to describe as the fix, confirmed via
  // live instrumentation: with more than one `@YYYY-MM-DD` earlier on the
  // same line (atIndex > 0), the inflated sum made this check
  // unreachable, so a trailing space after the LAST Date on the line
  // never closed the trigger. Invisible whenever the Date starts at
  // column 0, since `atIndex` is then 0 either way — exactly why this
  // survived undetected until a multi-Date-token line was tried.
  const closedDate = scanDate(textBeforeCursor, atIndex);
  if (closedDate && textBeforeCursor.length > closedDate.end) {
    return null;
  }

  const query = textBeforeCursor.slice(atIndex + 1);

  // A space directly after `@` breaks the trigger immediately — same as
  // the shared single-word boundary's existing behavior for bare `@` + space.
  if (query !== '' && /^\s/.test(query)) {
    return null;
  }
  if (/[\t\n\r]/.test(query)) {
    return null;
  }

  const tokenCount = query === '' ? 0 : query.split(' ').length;
  if (tokenCount > MAX_DATE_QUERY_TOKENS) {
    return null;
  }

  return { from: atIndex + line.from, query };
}
