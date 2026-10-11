import type { LinkOccurrence } from '@core/vault/models/occurrences/LinkOccurrence';
import { PageIndex } from './PageIndex';

export type LinkResolutionStatus = 'resolved' | 'missing' | 'ambiguous';

export interface ResolvedLink {
  readonly sourcePageId: string;
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
  readonly targetPageId?: string;
  readonly status: LinkResolutionStatus;
  // The occurrence's range in the source page, carried through unchanged.
  readonly startOffset?: number;
  readonly endOffset?: number;
}

export class LinkResolver {
  resolve(
    links: Iterable<LinkOccurrence>,
    pageIndex: PageIndex
  ): readonly ResolvedLink[] {
    // TODO(v2): Extend resolution to support relative paths and additional
    // Markdown link formats.

    return Array.from(links, (link) => {
      // The link's own provenance, repeated on every outcome below.
      const base = {
        sourcePageId: link.sourcePageId,
        target: link.target,
        heading: link.heading,
        blockReference: link.blockReference,
        alias: link.alias,
        startOffset: link.startOffset,
        endOffset: link.endOffset,
      };

      const pageByPath =
        pageIndex.findByVaultPath(link.target) ?? pageIndex.findByPath(link.target);

      if (pageByPath) {
        return this.resolveResolvedPage(link, base, pageByPath.id, pageIndex);
      }

      const pagesByFileName = pageIndex.findByFileName(link.target);
      const resolvedPage = pagesByFileName[0];

      if (resolvedPage && pagesByFileName.length === 1) {
        return this.resolveResolvedPage(link, base, resolvedPage.id, pageIndex);
      }

      // Frontmatter aliases are the last resort, only when no page is named
      // like the target — the same fallback the editor applies after a
      // literal path match fails.
      const candidates =
        pagesByFileName.length === 0 ? pageIndex.findByAlias(link.target) : pagesByFileName;
      const aliased = candidates[0];

      if (aliased && candidates.length === 1) {
        return this.resolveResolvedPage(link, base, aliased.id, pageIndex);
      }

      return {
        ...base,
        status: candidates.length === 0 ? ('missing' as const) : ('ambiguous' as const),
      };
    });
  }

  private resolveResolvedPage(
    link: LinkOccurrence,
    base: Omit<ResolvedLink, 'status' | 'targetPageId'>,
    targetPageId: string,
    pageIndex: PageIndex
  ): ResolvedLink {
    if (link.heading && !pageIndex.findHeading(targetPageId, link.heading)) {
      return { ...base, targetPageId, status: 'missing' };
    }

    if (
      link.blockReference &&
      !pageIndex.findBlockReference(targetPageId, link.blockReference)
    ) {
      return { ...base, targetPageId, status: 'missing' };
    }

    return { ...base, targetPageId, status: 'resolved' };
  }
}
