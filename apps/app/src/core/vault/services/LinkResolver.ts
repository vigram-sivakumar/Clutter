import type { Link } from '@core/vault/models/Link';
import { PageIndex } from '../indexes/PageIndex';

export type LinkResolutionStatus = 'resolved' | 'missing' | 'ambiguous';

export interface ResolvedLink {
  readonly target: string;
  readonly heading?: string;
  readonly blockReference?: string;
  readonly alias?: string;
  readonly pageId?: string;
  readonly status: LinkResolutionStatus;
}

export class LinkResolver {
  resolve(
    links: Iterable<Link>,
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
          target: link.target,
          heading: link.heading,
          blockReference: link.blockReference,
          alias: link.alias,
          status: 'missing' as const,
        };
      }

      return {
        target: link.target,
        heading: link.heading,
        blockReference: link.blockReference,
        alias: link.alias,
        status: 'ambiguous' as const,
      };
    });
  }

  private resolveResolvedPage(
    link: Link,
    pageId: string,
    pageIndex: PageIndex
  ): ResolvedLink {
    if (link.heading && !pageIndex.findHeading(pageId, link.heading)) {
      return {
        target: link.target,
        heading: link.heading,
        blockReference: link.blockReference,
        alias: link.alias,
        pageId,
        status: 'missing',
      };
    }

    if (
      link.blockReference &&
      !pageIndex.findBlockReference(pageId, link.blockReference)
    ) {
      return {
        target: link.target,
        heading: link.heading,
        blockReference: link.blockReference,
        alias: link.alias,
        pageId,
        status: 'missing',
      };
    }

    return {
      target: link.target,
      heading: link.heading,
      blockReference: link.blockReference,
      alias: link.alias,
      pageId,
      status: 'resolved',
    };
  }
}
