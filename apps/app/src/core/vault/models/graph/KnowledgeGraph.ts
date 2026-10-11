import type { GraphEdge } from './GraphEdge';

const NO_EDGES: readonly GraphEdge[] = [];

// Represents the derived relationship graph of a vault.
//
// Unlike `Vault`, which owns persisted domain objects, the knowledge graph
// contains relationships that are computed from those objects.
// This graph stores derived runtime relationships (graph edges), not resolver DTOs.
export class KnowledgeGraph {
  constructor(readonly edges: readonly GraphEdge[] = []) {}

  // Derived from `edges` on first use, once per graph instance: Vault hands out
  // a new graph only after a mutation, so this index never outlives the edges
  // it was built from.
  private incomingByTarget: ReadonlyMap<string, readonly GraphEdge[]> | null = null;

  /**
   * Every edge that resolves to `pageId` — its backlinks, links and embeds
   * alike, in source order within each source page. Empty when nothing
   * references it.
   */
  incomingEdges(pageId: string): readonly GraphEdge[] {
    if (this.incomingByTarget === null) {
      const index = new Map<string, GraphEdge[]>();

      for (const edge of this.edges) {
        const incoming = index.get(edge.targetPageId);

        if (incoming) {
          incoming.push(edge);
        } else {
          index.set(edge.targetPageId, [edge]);
        }
      }

      this.incomingByTarget = index;
    }

    return this.incomingByTarget.get(pageId) ?? NO_EDGES;
  }

  // TODO(v1): Add outgoing relationship indexes.
  // TODO(v1): Track unresolved links.
  // TODO(v2): Support graph traversal, connected components,
  // page ranking, and unlinked mentions.
}
