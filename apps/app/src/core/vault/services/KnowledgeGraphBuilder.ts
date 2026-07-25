import { LinkResolver } from '@core/vault/services/LinkResolver';
import { PageIndex } from '@core/vault/indexes/PageIndex';
import { KnowledgeGraph } from '@core/vault/models/KnowledgeGraph';
import { Vault } from '@core/vault/models/Vault';

// Builds the derived relationship graph for a vault.
//
// The graph is computed from the vault's domain objects and should not
// mutate or own them.
export class KnowledgeGraphBuilder {
  private readonly linkResolver = new LinkResolver();
  build(vault: Vault): KnowledgeGraph {
    const pageIndex = new PageIndex(vault.pages());

    const resolvedLinks = this.linkResolver.resolve(vault.links(), pageIndex);

    // TODO(v1): Build outgoing relationships.
    // TODO(v1): Derive backlinks from outgoing relationships.
    // TODO(v1): Track unresolved links.

    return new KnowledgeGraph(resolvedLinks);
  }
}
