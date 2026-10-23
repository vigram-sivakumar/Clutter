import type { CompletionResult, CompletionSource } from '@codemirror/autocomplete';

import { trailingSpaceChange } from '../completionPopup/trailingSpace';
import { dateRow, type DateCompletion } from './dateCompletionRow';
import { extractDateTriggerQuery } from './dateTrigger';
import { serializeDateReference } from '@shared/helpers/time/dateReference';
import { getDateSuggestions, suggestionReference, type DateSuggestion } from './dateSuggestion';

function toCompletion(suggestion: DateSuggestion, boost: number): DateCompletion {
  const completion: DateCompletion = {
    // CM6's own internal identifier for this option — deliberately left
    // as `suggestion.label`, not the reformatted display text
    // `renderDateCompletion` shows: this is what existing consumers
    // (tests included) key off to find a specific suggestion among the
    // returned options, and it never reaches the visible popup itself —
    // `render` (`renderDateCompletion`) fully replaces the DOM CM6 would
    // otherwise build from this field.
    label: suggestion.label,
    dateSuggestion: suggestion,
    row: dateRow(suggestion),
    // The suggestions arrive best first (a time before the date); the popup keeps exactly that order.
    boost,
    apply(view, _completion, from, to) {
      // `@YYYY-MM-DD`, or `@YYYY-MM-DDTHH:mm` for a time suggestion — canonical whatever the display preferences,
      // and identical on a task line or in ordinary content. There is deliberately no task-context branching here:
      // task semantics are assembled entirely downstream by TaskExtractor.ts, never decided by the insertion layer.
      const insert = `@${serializeDateReference(suggestionReference(suggestion))}`;

      // The space is part of this transaction (one undo), unless one already follows.
      const space = trailingSpaceChange(view.state, to);
      view.dispatch({
        changes: [{ from, to, insert }, ...(space ? [space] : [])],
        selection: { anchor: from + insert.length + 1 },
      });
    },
  };

  return completion;
}

/**
 * Date's `CompletionSource` — built on Date's own `@`-trigger boundary
 * (`dateTrigger.ts`, not the shared single-word `atTrigger.ts` — Date's
 * grammar needs a query that can span spaces) but entirely Date-only from
 * there on, mirroring `wikiLinkCompletionSource`'s shape. No
 * reference-zone reactivation case like WikiLink's (editing an
 * already-closed reference) — a Date node has no internal editing zones
 * to reactivate into; re-engaging one and typing over it just triggers a
 * fresh completion from whatever `@` the cursor lands after, the same as
 * typing anywhere else.
 */
export function dateCompletionSource(): CompletionSource {
  return (context) => {
    const trigger = extractDateTriggerQuery(context);
    if (!trigger) {
      return null;
    }

    const items = getDateSuggestions(trigger.query);
    if (items.length === 0) {
      return null;
    }

    const result: CompletionResult = {
      from: trigger.from,
      options: items.map((item, index) => toCompletion(item, items.length - index)),
      // Suggestions are already filtered by getDateSuggestions's own
      // prefix match — see its doc comment for why a second, competing
      // fuzzy re-filter on top would be redundant.
      filter: false,
    };
    return result;
  };
}
