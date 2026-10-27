import { assetCompletionRow } from '../completionPopup/assetCompletionRow';
import { GROUPED_LAYOUT, applyListLayout, type CompletionListLayout, type RowCompletion } from '../completionPopup/completionRow';
import { COMPLETION_SECTIONS } from '../completionPopup/completionSections';
import { wikiLinkRow } from '../wikilink/wikiLinkCompletionRow';
import type {
  EmbedPageSuggestion,
  EmbedResourceSuggestion,
  EmbedSuggestion,
} from './embedSuggestion';

/** The one property `embedCompletionSource.ts` adds on top of the shared `RowCompletion`. */
export interface EmbedCompletion extends RowCompletion {
  readonly suggestion: EmbedSuggestion;
}

/**
 * A note or Daily Note reads exactly as it does after `[[` — `wikiLinkRow`, the note picker's own
 * rules — under Notes or Daily notes, so the popup tells a note from an asset by section.
 */
export function embedPageRow(
  suggestion: EmbedPageSuggestion,
  layout: CompletionListLayout = GROUPED_LAYOUT
): Pick<EmbedCompletion, 'row' | 'section' | 'limitKey'> {
  return wikiLinkRow(suggestion, layout);
}

/**
 * How a resource suggestion reads in the popup — the shared asset row (`assetCompletionRow`, also what
 * `[[` uses), under the Images or PDFs section that comes first in this popup.
 */
export function embedResourceRow(
  suggestion: EmbedResourceSuggestion,
  layout: CompletionListLayout = GROUPED_LAYOUT
): Pick<EmbedCompletion, 'row' | 'section' | 'limitKey'> {
  return applyListLayout(assetCompletionRow(
    {
      assetKind: suggestion.resourceKind,
      title: suggestion.title,
      breadcrumb: suggestion.breadcrumb,
      previewUrl: suggestion.previewUrl,
    },
    { images: COMPLETION_SECTIONS.images, pdfs: COMPLETION_SECTIONS.pdfs }
  ), layout);
}
