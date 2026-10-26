import { LinkResolver } from './LinkResolver';
import type { ResolvedLink } from './LinkResolver';
import { PageIndex } from './PageIndex';
import type { NonPageLinkTargetSource } from './nonPageLinkTarget';
import { KnowledgeGraph } from '../models';
import type { Page } from '../models/';
import type { EmbedOccurrence, LinkOccurrence } from '../models';
import type { GraphEdge } from '../models/';

/**
 * Builds the derived KnowledgeGraph from resolved page relationships.
 *
 * Responsibilities:
 * - Resolve page links and embeds.
 * - Produce graph edges.
 * - Construct the immutable KnowledgeGraph.
 *
 * Does NOT:
 * - Parse markdown.
 * - Modify Pages.
 * - Persist graph data.
 */
export class KnowledgeGraphBuilder {
  private readonly linkResolver = new LinkResolver();
  build(
    pages: Iterable<Page>,
    links: Iterable<LinkOccurrence>,
    embeds: Iterable<EmbedOccurrence> = [],
    // The vault's root path, so a vault-relative target ("Projects/Alpha") resolves to its page.
    root?: string,
    // Where a `[[link]]`'s folder / asset target is looked up (see LinkResolver). Links only: an embed's
    // resolution is unchanged.
    nonPageTargets?: NonPageLinkTargetSource
  ): KnowledgeGraph {
    const pageList = Array.from(pages);
    const pageIndex = new PageIndex(pageList, root);
    // TODO(v1): Build outgoing relationships.
    // TODO(v1): Track unresolved links.
    // TODO(Arc 4): Build unresolved links and additional relationship types
    // from the resolved link set.
    const edges = [
      ...this.buildEdges(this.linkResolver.resolve(links, pageIndex, nonPageTargets), 'link'),
      ...this.buildEdges(this.linkResolver.resolve(embeds, pageIndex), 'embed'),
    ];
    return new KnowledgeGraph(edges);
  }

  private buildEdges(
    resolvedLinks: readonly ResolvedLink[],
    kind: GraphEdge['kind']
  ): readonly GraphEdge[] {
    return resolvedLinks
      .filter(
        (link): link is ResolvedLink & { targetPageId: string } =>
          link.status === 'resolved' && link.targetPageId !== undefined
      )
      .map((link) => ({
        sourcePageId: link.sourcePageId,
        targetPageId: link.targetPageId,
        kind,
        startOffset: link.startOffset,
        endOffset: link.endOffset,
      }));
  }
}
