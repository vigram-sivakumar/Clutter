import { autocompletion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

import { dateCompletionSource } from './date/dateCompletionSource';
import { renderDateCompletion } from './date/dateCompletionRenderer';
import { embedCompletionSource } from './embed/embedCompletionSource';
import { renderEmbedCompletion } from './embed/embedCompletionRenderer';
import type { GetEmbedSuggestions } from './embed/embedSuggestion';
import { tagCompletionSource } from './tag/tagCompletionSource';
import { renderTagCompletion } from './tag/tagCompletionRenderer';
import type { GetTagSuggestions } from './tag/tagSuggestion';
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
 *
 * Tag also needs its own `addToOptions` renderer (`renderTagCompletion`),
 * not just an `override` entry — `wikiLinkAutocompleteTheme()`'s shared
 * CSS hides CM6's default `.cm-completionLabel` for every row in this one
 * popup, not only WikiLink's, so any source without a replacement row
 * renders with no visible content at all. WikiLink's and Date's own
 * renderers already compensate for themselves; Tag's does the same.
 */
export function semanticCompletion(
  getWikiLinkSuggestions: () => GetWikiLinkSuggestions | undefined,
  getTagSuggestions: () => GetTagSuggestions | undefined = () => undefined,
  getEmbedSuggestions: () => GetEmbedSuggestions | undefined = () => undefined
): Extension {
  return [
    autocompletion({
      override: [
        // Embed's source is listed before WikiLink's: `@codemirror/
        // autocomplete` queries every registered source for a given
        // position and merges whichever return non-null results, so
        // ordering here is not what prevents the two from double-firing
        // for `![[` — wikiLinkCompletionSource.ts's own explicit
        // preceding-`!` guard is what does that (see its doc comment).
        // This ordering is cosmetic only.
        embedCompletionSource(getEmbedSuggestions),
        wikiLinkCompletionSource(getWikiLinkSuggestions),
        dateCompletionSource(),
        tagCompletionSource(getTagSuggestions),
      ],
      icons: false,
      defaultKeymap: true,
      closeOnBlur: true,
      addToOptions: [
        { render: renderEmbedCompletion, position: 50 },
        { render: renderWikiLinkCompletion, position: 50 },
        { render: renderDateCompletion, position: 50 },
        { render: renderTagCompletion, position: 50 },
      ],
    }),
    wikiLinkAutocompleteTheme(),
  ];
}
