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
}

export class LinkResolver {
  resolve(
    links: Iterable<LinkOccurrence>,
    pageIndex: PageIndex
  ): readonly ResolvedLink[] {
    // TODO(v2): Extend resolution to support relative paths, aliases,
    // embeds, and additional Markdown link formats.

    return Array.from(links, (link) => {
      const pageByPath = pageIndex.findByPath(link.target);

      if (pageByPath) {
        return this.resolveResolvedPage(link, pageByPath.id, pageIndex);
      }

      const pagesByFileName = pageIndex.findByFileName(link.target);
      const resolvedPage = pagesByFileName[0];

      if (resolvedPage && pagesByFileName.length === 1) {
        return this.resolveResolvedPage(link, resolvedPage.id, pageIndex);
      }

      if (pagesByFileName.length === 0) {
        return {
          sourcePageId: link.sourcePageId,
          target: link.target,
          heading: link.heading,
          blockReference: link.blockReference,
          alias: link.alias,
          status: 'missing' as const,
        };
      }

      return {
        sourcePageId: link.sourcePageId,
        target: link.target,
        heading: link.heading,
        blockReference: link.blockReference,
        alias: link.alias,
        status: 'ambiguous' as const,
      };
    });
  }

  private resolveResolvedPage(
    link: LinkOccurrence,
    targetPageId: string,
    pageIndex: PageIndex
  ): ResolvedLink {
    if (link.heading && !pageIndex.findHeading(targetPageId, link.heading)) {
      return {
        sourcePageId: link.sourcePageId,
        target: link.target,
        heading: link.heading,
        blockReference: link.blockReference,
        alias: link.alias,
        targetPageId,
        status: 'missing',
      };
    }

    if (
      link.blockReference &&
      !pageIndex.findBlockReference(targetPageId, link.blockReference)
    ) {
      return {
        sourcePageId: link.sourcePageId,
        target: link.target,
        heading: link.heading,
        blockReference: link.blockReference,
        alias: link.alias,
        targetPageId,
        status: 'missing',
      };
    }

    return {
      sourcePageId: link.sourcePageId,
      target: link.target,
      heading: link.heading,
      blockReference: link.blockReference,
      alias: link.alias,
      targetPageId,
      status: 'resolved',
    };
  }
}
