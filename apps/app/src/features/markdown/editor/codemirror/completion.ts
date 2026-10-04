import { autocompletion } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

import { completionSectionLimit, limitCompletionSections } from './completionPopup/completionSectionLimit';
import { completionScrollFade } from './completionPopup/completionScrollFade';
import { renderCompletionRow } from './completionPopup/completionRow';
import { completionPopupTheme } from './completionPopup/completionPopupTheme';
import { dateCompletionSource } from './date/dateCompletionSource';
import { embedCompletionSource } from './embed/embedCompletionSource';
import type {
  GetEmbedHeadingSuggestions,
  GetEmbedSuggestions,
} from './embed/embedSuggestion';
import { tagCompletionSource } from './tag/tagCompletionSource';
import type { GetTagSuggestions } from './tag/tagSuggestion';
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
 * more entry to `override`, its completions carrying a `row` (see below) —
 * never a new `autocompletion()` call, and never a change to this file's shape.
 *
 * Every kind's rows are drawn by the one `renderCompletionRow` (`completionPopup/`): a source maps
 * its suggestions to a row spec, it never renders DOM or styles of its own, so all five kinds
 * (`[[`, `![[`, `![[Page#`, `#`, `@`) look, space and select like `PickerList`'s rows. The one
 * `completionPopupTheme()` skins the popup itself.
 */
export function semanticCompletion(
  getWikiLinkSuggestions: () => GetWikiLinkSuggestions | undefined,
  getTagSuggestions: () => GetTagSuggestions | undefined = () => undefined,
  getEmbedSuggestions: () => GetEmbedSuggestions | undefined = () => undefined,
  getEmbedHeadingSuggestions: () =>
    GetEmbedHeadingSuggestions | undefined = () => undefined
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
        // Only the long lists (`[[` notes, `![[` assets) are capped with "Show N more"; headings, dates
        // and tags have no sections and are short.
        limitCompletionSections(embedCompletionSource(getEmbedSuggestions, getEmbedHeadingSuggestions)),
        limitCompletionSections(wikiLinkCompletionSource(getWikiLinkSuggestions)),
        dateCompletionSource(),
        tagCompletionSource(getTagSuggestions),
      ],
      icons: false,
      defaultKeymap: true,
      closeOnBlur: false,
      addToOptions: [{ render: renderCompletionRow, position: 50 }],
    }),
    completionPopupTheme(),
    completionScrollFade(),
    completionSectionLimit(),
  ];
}
