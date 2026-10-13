import type { CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

import { splitTargetFragment } from '../../../../../core/vault/ingest/grammar/targetFragment';
import { COMPLETION_ICONS } from './completionIcons';
import type { RowCompletion } from './completionRow';

/**
 * The one heading-reference completion, shared by `[[Page#` (WikiLink) and `![[Page#` (Embed): once the
 * typed target contains `#`, both sources switch from note suggestions to this note's headings. Heading
 * discovery (the injected `GetHeadingSuggestions`), the popup row, the "replace the whole reference" rule
 * and the option list are all here; a source supplies only how its own syntax inserts the finished target
 * (`apply`) — the one thing that genuinely differs (an embed breaks the line, a link adds a space).
 */

/**
 * A heading within one already-resolved page — never a vault-wide search. `heading` is the heading's
 * literal text, exactly what gets inserted after `#`.
 */
export interface HeadingSuggestion {
  readonly kind: 'heading';
  readonly heading: string;
  readonly level: number;
}

/**
 * `pagePath` is the already-typed portion before `#` (the string the resolvers resolve a page from);
 * `query` is whatever follows `#` so far. Scoped to that one page: the app-layer composer must never
 * search headings across the vault for this.
 */
export type GetHeadingSuggestions = (pagePath: string, query: string) => readonly HeadingSuggestion[];

/** A heading option: its row, and the full `page#heading` reference it inserts (`|` commits it as the reference). */
export interface HeadingCompletion extends RowCompletion {
  readonly suggestion: HeadingSuggestion;
  readonly target: string;
}

/** A heading suggestion's popup row: the heading's text, its level (`H2`) on the right. */
export function headingRow(suggestion: HeadingSuggestion): Pick<HeadingCompletion, 'row'> {
  return { row: { iconSvg: COMPLETION_ICONS.hash, title: suggestion.heading, trailing: `H${suggestion.level}` } };
}

/** How a source writes the finished `page#heading` target into its own syntax, replacing `[from, to)`. */
export type ApplyHeadingTarget = (view: EditorView, target: string, from: number, to: number) => void;

/**
 * The completion for a reference that contains `#`, or `undefined` when it does not (the caller then
 * offers notes as usual). `null` means "a heading reference, but nothing to offer": no heading suggester
 * injected, or the page does not resolve / has no matching heading — never a fallback to note suggestions
 * (a `Page#` is not a note name to search for or create).
 *
 * `reference` is the full reference text (folder prefix kept), `[from, to)` the range an accepted heading
 * replaces — the whole reference, as every other completion does. Matching is the suggester's.
 */
export function headingCompletionResult(
  reference: string,
  from: number,
  to: number,
  getHeadingSuggestions: GetHeadingSuggestions | undefined,
  apply: ApplyHeadingTarget
): CompletionResult | null | undefined {
  const { pagePart, fragment } = splitTargetFragment(reference);

  if (fragment === null) {
    return undefined;
  }

  const items = getHeadingSuggestions?.(pagePart, fragment) ?? [];

  if (items.length === 0) {
    return null;
  }

  return {
    from,
    to,
    options: items.map((suggestion): HeadingCompletion => {
      const target = `${pagePart}#${suggestion.heading}`;

      return {
        label: suggestion.heading,
        suggestion,
        target,
        ...headingRow(suggestion),
        apply: (view, _completion, applyFrom, applyTo) => apply(view, target, applyFrom, applyTo),
      };
    }),
    // Already filtered by the app-layer suggester's own substring match; CM6's fuzzy re-filter on top
    // would be a second, competing matcher over the same list.
    filter: false,
  };
}
