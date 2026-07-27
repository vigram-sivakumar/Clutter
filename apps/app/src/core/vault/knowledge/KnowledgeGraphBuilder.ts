import { LinkResolver } from './LinkResolver';
import type { ResolvedLink } from './LinkResolver';
import { PageIndex } from './PageIndex';
import { KnowledgeGraph } from '../models';
import type { Page } from '../models/';
import type { LinkOccurrence } from '../models';
import type { GraphEdge } from '../models/';

/**
 * Builds the derived KnowledgeGraph from resolved page relationships.
 *
 * Responsibilities:
 * - Resolve page links.
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
    links: Iterable<LinkOccurrence>
  ): KnowledgeGraph {
    const pageList = Array.from(pages);
    const pageIndex = new PageIndex(pageList);
    const resolvedLinks = this.linkResolver.resolve(links, pageIndex);
    // TODO(v1): Build outgoing relationships.
    // TODO(v1): Derive backlinks from outgoing relationships.
    // TODO(v1): Track unresolved links.
    // TODO(Arc 4): Build backlinks, unresolved links and additional
    // relationship types from the resolved link set.
    const edges = this.buildEdges(resolvedLinks);
    return new KnowledgeGraph(edges);
  }

  private buildEdges(
    resolvedLinks: readonly ResolvedLink[]
  ): readonly GraphEdge[] {
    return resolvedLinks
      .filter(
        (link): link is ResolvedLink & { targetPageId: string } =>
          link.status === 'resolved' && link.targetPageId !== undefined
      )
      .map((link) => ({
        sourcePageId: link.sourcePageId,
        targetPageId: link.targetPageId,
        kind: 'link',
      }));
  }
}
