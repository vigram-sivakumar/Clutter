import type { CompactMarkdownResolvers } from '@features/markdown/render/renderCompactMarkdown';

/**
 * The injected resolution a note preview needs — the existing page resolvers
 * (WikiLink/Tag/page-embed/embed-image/image-src, built in PageHost from the
 * same factories the editor uses) plus `resolveCoverImage`,
 * `Application.resolveCoverImageForDisplay`'s shape (a persisted cover
 * reference -> a loadable URL, `null` when none).
 */
export interface NotePreviewResolvers extends CompactMarkdownResolvers {
  readonly resolveCoverImage?: (cover: string) => string | null;
}

/**
 * A note's cover as a loadable URL, or null when it has none to show: no
 * cover, a hidden one, or one the resolver can't turn into a URL.
 */
export function resolveNoteCoverUrl(
  cover: string | undefined,
  coverHidden: boolean | undefined,
  resolvers: NotePreviewResolvers | undefined
): string | null {
  return cover && !coverHidden ? (resolvers?.resolveCoverImage?.(cover) ?? null) : null;
}
