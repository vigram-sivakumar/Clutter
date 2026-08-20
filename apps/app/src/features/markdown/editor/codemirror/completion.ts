import { autocompletion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

import { dateCompletionSource } from './date/dateCompletionSource';
import { renderDateCompletion } from './date/dateCompletionRenderer';
import { renderWikiLinkCompletion } from './wikilink/wikiLinkCompletionRenderer';
import { wikiLinkAutocompleteTheme } from './wikilink/wikiLinkAutocomplete';
import { wikiLinkCompletionSource } from './wikilink/wikiLinkCompletionSource';
import type { GetWikiLinkSuggestions } from './wikilink/wikiLinkSuggestion';

/**
 * The one shared `autocompletion()` call for the whole editor.
 *
 * Required, not a stylistic preference: `@codemirror/autocomplete`'s
 * `completionConfig` facet has no merge combiner for its `override` field
 * (confirmed by reading `combineConfig`'s own source directly), so two
 * independent `autocompletion({ override: [...] })` calls active in the
 * same editor — one for WikiLink, a separate one for Date — throw
 * `"Config merge conflict for field override"` at runtime the moment both
 * mount. `override` accepting an array was already the extension point;
 * this file is where that array actually gets composed, once, from every
 * kind's own completion source — WikiLink's and Date's internals are
 * completely unchanged by this, they're just no longer each independently
 * calling `autocompletion()` themselves.
 *
 * Adding a future `@`-typed provider (Person/Page/Time) means adding one
 * more entry to `override` (and, if it wants custom popup rendering, one
 * more entry to `addToOptions` — see `renderWikiLinkCompletion`'s/
 * `renderDateCompletion`'s own doc comments for why each already guards
 * against rendering a completion that isn't its own kind) — never a new
 * `autocompletion()` call, and never a change to this file's shape.
 */
export function semanticCompletion(
  getWikiLinkSuggestions: () => GetWikiLinkSuggestions | undefined
): Extension {
  return [
    autocompletion({
      override: [wikiLinkCompletionSource(getWikiLinkSuggestions), dateCompletionSource()],
      icons: false,
      defaultKeymap: true,
      closeOnBlur: true,
      addToOptions: [
        { render: renderWikiLinkCompletion, position: 50 },
        { render: renderDateCompletion, position: 50 },
      ],
    }),
    wikiLinkAutocompleteTheme(),
  ];
}
