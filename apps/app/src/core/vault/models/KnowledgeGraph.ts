import type { ResolvedLink } from '@core/vault/services/LinkResolver';
// Represents the derived relationship graph of a vault.
//
// Unlike `Vault`, which owns persisted domain objects, the knowledge graph
// contains relationships that are computed from those objects.
export class KnowledgeGraph {
  constructor(readonly resolvedLinks: readonly ResolvedLink[] = []) {}

  // TODO(v1): Add outgoing relationship indexes.
  // TODO(v1): Derive backlinks from outgoing relationships.
  // TODO(v1): Track unresolved links.
  // TODO(v2): Support graph traversal, connected components,
  // page ranking, and unlinked mentions.
}
