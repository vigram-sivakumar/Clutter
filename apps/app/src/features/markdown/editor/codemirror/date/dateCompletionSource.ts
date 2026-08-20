import type { Completion, CompletionResult, CompletionSource } from '@codemirror/autocomplete';

import type { DateCompletion } from './dateCompletionRenderer';
import { extractDateTriggerQuery } from './dateTrigger';
import { getDateSuggestions, type DateSuggestion } from './dateSuggestion';

function toCompletion(suggestion: DateSuggestion): Completion {
  const completion: DateCompletion = {
    label: suggestion.label,
    dateSuggestion: suggestion,
    apply(view, _completion, from, to) {
      // Always `@YYYY-MM-DD` — identical on a task line or in ordinary
      // content. There is deliberately no task-context branching here:
      // task-due-date semantics are assembled entirely downstream by
      // TaskExtractor.ts reading the same bare-date syntax, never decided
      // by the completion/insertion layer (per the explicit product
      // decision — "task semantics are handled downstream by the task
      // extraction layer").
      const insert = `@${suggestion.isoDate}`;

      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
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
      options: items.map(toCompletion),
      // Suggestions are already filtered by getDateSuggestions's own
      // prefix match — see its doc comment for why a second, competing
      // fuzzy re-filter on top would be redundant.
      filter: false,
    };
    return result;
  };
}
