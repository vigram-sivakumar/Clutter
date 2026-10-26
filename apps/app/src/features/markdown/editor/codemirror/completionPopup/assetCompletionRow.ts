import type { CompletionSection } from '@codemirror/autocomplete';

import { renderPdfThumbnail } from '@features/pdf/pdfThumbnail';

import { COMPLETION_ICONS } from './completionIcons';
import type { CompletionRowSpec } from './completionRow';

/** The thumbnail is a square this many CSS pixels wide: an asset row's height less its padding. */
const THUMBNAIL_SIZE = 36;

/** What an asset row shows, whichever trigger offers it. */
export interface AssetRowInput {
  readonly assetKind: 'image' | 'pdf';
  /** The file's name (without its extension). */
  readonly title: string;
  /** The file's folder, shown under the name. */
  readonly breadcrumb: string | null;
  /** A loadable URL for the file itself: an image's picture, a PDF's first page. Without it, the row shows its icon. */
  readonly previewUrl?: string;
}

/**
 * The sections a trigger lists assets under. Each trigger passes its own, so the rows are one design and
 * the order of the sections stays that trigger's (`![[` lists media first, `[[` after its notes and folders).
 */
export interface AssetRowSections {
  readonly images: CompletionSection;
  readonly pdfs: CompletionSection;
}

/**
 * How an asset reads in a completion popup — the one asset row, shared by `![[` and `[[`: the file's name
 * over its folder, an image showing its own picture and a PDF its first page (the icon until that is
 * drawn, or when there is no URL to draw from), under the trigger's Images or PDFs section.
 */
export function assetCompletionRow(
  input: AssetRowInput,
  sections: AssetRowSections
): { readonly row: CompletionRowSpec; readonly section: CompletionSection } {
  const { previewUrl } = input;
  const isPdf = input.assetKind === 'pdf';

  return {
    row: {
      iconSvg: isPdf ? COMPLETION_ICONS.pdf : COMPLETION_ICONS.image,
      thumbnail: previewUrl ? (isPdf ? renderPdfThumbnail(previewUrl, THUMBNAIL_SIZE) : previewUrl) : undefined,
      title: input.title,
      path: input.breadcrumb,
    },
    section: isPdf ? sections.pdfs : sections.images,
  };
}
