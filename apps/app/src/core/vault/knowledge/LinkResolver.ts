import type { LinkOccurrence } from '@core/vault/models/occurrences/LinkOccurrence';
import { PageIndex } from './PageIndex';
import { resolveNonPageLinkTarget, type NonPageLinkTargetSource } from './nonPageLinkTarget';

/**
 * `non-page`: the link names a folder or an asset file, not a note. The editor resolves it, so it is
 * not `missing` — but it has no page to point at, so the graph draws no edge for it.
 */
export type LinkResolutionStatus = 'resolved' | 'missing' | 'ambiguous' | 'non-page';

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
    pageIndex: PageIndex,
    // Where a link's folder / asset target is looked up, once no note matches. Left out, every such
    // link is `missing`, as before — which is what an embed's resolution passes.
    nonPageTargets?: NonPageLinkTargetSource
  ): readonly ResolvedLink[] {
    // TODO(v2): Extend resolution to support relative paths and additional
    // Markdown link formats.
    //
    // Resolution deliberately mirrors the editor's (`createWikiLinkResolver`):
    // vault-relative path, then alias. The graph must not report a relationship the
    // editor shows as an unresolved link.

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

      // Frontmatter aliases are tried only after the path lookup fails — the same order
      // `createWikiLinkResolver` applies when the editor resolves a link, so a link means the
      // same page here as it does on click. A bare file name is not a path: `[[Alpha]]` for a
      // page in a folder is unresolved in the editor, and so it is here.
      const candidates = pageIndex.findByAlias(link.target);
      const aliased = candidates[0];

      // `[[Projects/]]`, `[[Assets/hero.png]]` and a bare `[[Projects]]` that no note or alias claims:
      // a folder or an asset, which the editor resolves — never reported as missing here.
      if (
        candidates.length === 0 &&
        !link.heading &&
        !link.blockReference &&
        nonPageTargets &&
        resolveNonPageLinkTarget(nonPageTargets, link.target)
      ) {
        return { ...base, status: 'non-page' as const };
      }

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
