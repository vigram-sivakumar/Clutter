import { renderPdfThumbnail } from '@features/pdf/pdfThumbnail';

import { COMPLETION_ICONS } from '../completionPopup/completionIcons';
import type { RowCompletion } from '../completionPopup/completionRow';
import { COMPLETION_SECTIONS } from '../completionPopup/completionSections';
import { wikiLinkRow } from '../wikilink/wikiLinkCompletionRow';
import type {
  EmbedHeadingSuggestion,
  EmbedPageSuggestion,
  EmbedResourceSuggestion,
  EmbedSuggestion,
} from './embedSuggestion';

/** The one property `embedCompletionSource.ts` adds on top of the shared `RowCompletion`. */
export interface EmbedCompletion extends RowCompletion {
  readonly suggestion: EmbedSuggestion;
}

/** The thumbnail is a square this many CSS pixels wide: an asset row's height less its padding. */
const THUMBNAIL_SIZE = 36;

/**
 * A note or Daily Note reads exactly as it does after `[[` — `wikiLinkRow`, the note picker's own
 * rules — under Notes or Daily notes, so the popup tells a note from an asset by section.
 */
export function embedPageRow(suggestion: EmbedPageSuggestion): Pick<EmbedCompletion, 'row' | 'section'> {
  return wikiLinkRow(suggestion);
}

/**
 * How a resource suggestion reads in the popup — an asset row, as in the note picker: the file's
 * name over its folder, an image showing its own picture and a PDF its first page (the icon until
 * that is drawn, or when there is no URL to draw from), under an Images or PDFs section.
 */
export function embedResourceRow(suggestion: EmbedResourceSuggestion): Pick<EmbedCompletion, 'row' | 'section'> {
  const { previewUrl } = suggestion;
  const isPdf = suggestion.resourceKind === 'pdf';
  return {
    row: {
      iconSvg: isPdf ? COMPLETION_ICONS.pdf : COMPLETION_ICONS.image,
      thumbnail: previewUrl ? (isPdf ? renderPdfThumbnail(previewUrl, THUMBNAIL_SIZE) : previewUrl) : undefined,
      title: suggestion.title,
      path: suggestion.breadcrumb,
    },
    section: isPdf ? COMPLETION_SECTIONS.pdfs : COMPLETION_SECTIONS.images,
  };
}

/** A heading suggestion (`![[Page#`): the heading's text, its level (`H2`) on the right. */
export function embedHeadingRow(suggestion: EmbedHeadingSuggestion): Pick<EmbedCompletion, 'row'> {
  return { row: { iconSvg: COMPLETION_ICONS.hash, title: suggestion.heading, trailing: `H${suggestion.level}` } };
}
