import type { CompletionContext } from '@codemirror/autocomplete';

/**
 * The shared `@`-word trigger boundary — genuinely reusable, not
 * speculative: this is the one piece of an `@`-triggered completion
 * source that has nothing to do with *what* the source offers (Date
 * today; a future Person/Page/Time provider would need the exact same
 * boundary rule). Deliberately a plain function, not a class, registry,
 * or coordinator — "leave an extension point," not "build the system that
 * would use it."
 *
 * Matches from the most recent `@` up to the cursor, excluding whitespace
 * and newlines (an `@`-word never spans either) — the `@`-family analog
 * of `wikiLinkCompletionSource.ts`'s `WIKILINK_TRIGGER_PATTERN`.
 * Deliberately permissive about *what* follows the `@` (no character-class
 * restriction beyond "not whitespace") — narrowing that down to
 * "looks date-shaped," "looks like a name," etc. is each individual
 * source's own job (`dateCompletionSource.ts` today), not this shared
 * boundary's.
 */
const AT_TRIGGER_PATTERN = /@[^\s]*$/;

export interface AtTriggerMatch {
  /** Position of the `@` itself. */
  readonly from: number;
  /** The text after `@`, up to the cursor. */
  readonly query: string;
}

export function extractAtTriggerQuery(context: CompletionContext): AtTriggerMatch | null {
  const match = context.matchBefore(AT_TRIGGER_PATTERN);
  if (!match) {
    return null;
  }

  return { from: match.from, query: match.text.slice(1) };
}
