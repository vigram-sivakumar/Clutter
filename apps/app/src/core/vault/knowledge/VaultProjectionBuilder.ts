import type { Page } from '../models/Page';
import type { Tag, TagMetadataEntry } from '../models/Tag';
import type { Embed } from '../models/Embed';
import type { TaskOccurrence } from '../models/occurrences/TaskOccurrence';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { TagBuilder } from './TagBuilder';
import { TaskBuilder } from './TaskBuilder';
import { EmbedBuilder } from './EmbedBuilder';
import { KnowledgeGraphBuilder } from './KnowledgeGraphBuilder';

export interface EagerVaultProjections {
  readonly tags: readonly Tag[];
  readonly tasks: readonly TaskOccurrence[];
}

export interface LazyVaultProjections {
  readonly embeds: readonly Embed[];
  readonly knowledgeGraph: KnowledgeGraph;
}

/**
 * Rebuilds vault-wide derived projections (tags, tasks, embeds, the
 * knowledge graph) from the current set of Pages.
 *
 * Projections are disposable: they hold no state of their own and are
 * always fully reconstructable from Pages, the authoritative source of
 * truth. This builder is the single place that knows how to derive them,
 * so callers (including Vault) never need to know how tags, tasks, embeds,
 * or graph edges are extracted.
 *
 * Split into buildEager/buildLazy rather than one combined build(): tags
 * and tasks have real, already-shipped consumers and must stay correct on
 * every mutation, while embeds and the knowledge graph have none yet and
 * are rebuilt only when Vault.embeds()/.knowledgeGraph() are actually
 * called (see ADR-016). A single combined method would defeat that split
 * by computing all four every time either half was needed.
 */
export class VaultProjectionBuilder {
  private readonly tagBuilder = new TagBuilder();
  private readonly taskBuilder = new TaskBuilder();
  private readonly embedBuilder = new EmbedBuilder();
  private readonly knowledgeGraphBuilder = new KnowledgeGraphBuilder();

  buildEager(
    pages: Iterable<Page>,
    tagMetadata: ReadonlyMap<string, TagMetadataEntry> = new Map()
  ): EagerVaultProjections {
    const pageList = Array.from(pages);

    return {
      tags: this.tagBuilder.build(pageList, tagMetadata),
      tasks: this.taskBuilder.build(pageList),
    };
  }

  buildLazy(pages: Iterable<Page>): LazyVaultProjections {
    const pageList = Array.from(pages);

    return {
      embeds: this.embedBuilder.build(pageList),
      knowledgeGraph: this.knowledgeGraphBuilder.build(
        pageList,
        pageList.flatMap((page) => page.analysis.links)
      ),
    };
  }
}
