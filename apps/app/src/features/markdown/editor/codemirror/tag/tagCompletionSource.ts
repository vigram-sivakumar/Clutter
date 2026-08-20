import type { Completion, CompletionResult, CompletionSource } from '@codemirror/autocomplete';

import { serializeTagName } from '@core/vault/models/Tag';
import { extractTagTriggerQuery } from './tagTrigger';
import type { GetTagSuggestions } from './tagSuggestion';

/**
 * `name` is already the display label (`GetTagSuggestions` returns
 * `formatTagDisplayLabel`-formatted names — see `tagSuggestions.ts`), so
 * the popup shows the same "Product design" form the at-rest widget does.
 * Accepting always serializes with `serializeTagName` (spaces → `-`)
 * regardless of what separator, if any, the vault's preferred spelling
 * happened to use — the product decision that Clutter only ever *writes*
 * the canonical hyphen form for a tag it creates, never `_`, even when
 * completing an existing suggestion.
 */
function toCompletion(name: string): Completion {
  return {
    label: `#${name}`,
    apply(view, _completion, from, to) {
      const insert = `#${serializeTagName(name)}`;

      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + insert.length },
      });
    },
  };
}

/**
 * Tag's `CompletionSource` — built on Tag's own trigger boundary
 * (`tagTrigger.ts`), mirroring `dateCompletionSource.ts`'s shape: no
 * reference-zone reactivation case like WikiLink's, since a Tag has no
 * internal editing zones (no alias, no closing delimiter) to reactivate
 * into — `tagTrigger.ts`'s single extractor already covers editing
 * anywhere inside an existing tag, not just fresh typing.
 */
export function tagCompletionSource(
  getSuggestions: () => GetTagSuggestions | undefined
): CompletionSource {
  return (context) => {
    const suggestions = getSuggestions();
    if (!suggestions) {
      return null;
    }

    const trigger = extractTagTriggerQuery(context);
    if (!trigger) {
      return null;
    }

    const items = suggestions(trigger.query);
    if (items.length === 0) {
      return null;
    }

    const result: CompletionResult = {
      from: trigger.from,
      to: trigger.to,
      options: items.map(toCompletion),
      // Suggestions are already filtered by the injected suggester's own
      // substring match — see wikiLinkCompletionSource.ts's identical
      // reasoning for why a second, competing CM6 fuzzy re-filter on top
      // would be redundant.
      filter: false,
    };
    return result;
  };
}
