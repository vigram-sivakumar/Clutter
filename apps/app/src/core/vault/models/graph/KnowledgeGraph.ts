import type { GraphEdge } from './GraphEdge';
// Represents the derived relationship graph of a vault.
//
// Unlike `Vault`, which owns persisted domain objects, the knowledge graph
// contains relationships that are computed from those objects.
// This graph stores derived runtime relationships (graph edges), not resolver DTOs.
export class KnowledgeGraph {
  constructor(readonly edges: readonly GraphEdge[] = []) {}

  // TODO(v1): Add outgoing relationship indexes.
  // TODO(v1): Derive backlinks from outgoing relationships.
  // TODO(v1): Track unresolved links.
  // TODO(v2): Support graph traversal, connected components,
  // page ranking, and unlinked mentions.
}
