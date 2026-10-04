import type { CompletionResult, CompletionSource } from '@codemirror/autocomplete';

import { serializeTagName } from '@core/vault/models/Tag';
import type { RowCompletion } from '../completionPopup/completionRow';
import { COMPLETION_SECTIONS } from '../completionPopup/completionSections';
import { trailingSpaceChange } from '../completionPopup/trailingSpace';
import { tagCreateRow, tagRow } from './tagCompletionRow';
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
function toCompletion(name: string, create = false): RowCompletion {
  return {
    label: create ? `Create "#${name}"` : `#${name}`,
    row: create ? tagCreateRow(name) : tagRow(name),
    // The create row stands alone; existing tags are one "Tags" section, capped like any other.
    ...(create ? {} : { section: COMPLETION_SECTIONS.tags }),
    apply(view, _completion, from, to) {
      const insert = `#${serializeTagName(name)}`;

      // The space is part of this transaction (one undo), unless one already follows.
      const space = trailingSpaceChange(view.state, to);
      view.dispatch({
        changes: [{ from, to, insert }, ...(space ? [space] : [])],
        selection: { anchor: from + insert.length + 1 },
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
    // Like `[[`: when nothing matches, offer to make what was typed a new tag. A tag is not a
    // thing created somewhere — writing `#name` is all it takes — so accepting just inserts it.
    // Nothing typed yet is nothing to create.
    if (items.length === 0 && trigger.query === '') {
      return null;
    }

    const result: CompletionResult = {
      from: trigger.from,
      to: trigger.to,
      options: items.length > 0 ? items.map((name) => toCompletion(name)) : [toCompletion(trigger.query, true)],
      // Suggestions are already filtered by the injected suggester's own
      // substring match — see wikiLinkCompletionSource.ts's identical
      // reasoning for why a second, competing CM6 fuzzy re-filter on top
      // would be redundant.
      filter: false,
    };
    return result;
  };
}
