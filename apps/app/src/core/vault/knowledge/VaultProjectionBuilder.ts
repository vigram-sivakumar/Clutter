import type { Page } from '../models/Page';
import type { Tag } from '../models/Tag';
import type { Embed } from '../models/Embed';
import type { TaskOccurrence } from '../models/occurrences/TaskOccurrence';
import { KnowledgeGraph } from '../models/graph/KnowledgeGraph';
import { TagBuilder } from './TagBuilder';
import { TaskBuilder } from './TaskBuilder';
import { EmbedBuilder } from './EmbedBuilder';
import { KnowledgeGraphBuilder } from './KnowledgeGraphBuilder';

export interface VaultProjections {
  readonly tags: readonly Tag[];
  readonly tasks: readonly TaskOccurrence[];
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
 */
export class VaultProjectionBuilder {
  private readonly tagBuilder = new TagBuilder();
  private readonly taskBuilder = new TaskBuilder();
  private readonly embedBuilder = new EmbedBuilder();
  private readonly knowledgeGraphBuilder = new KnowledgeGraphBuilder();

  build(pages: Iterable<Page>): VaultProjections {
    const pageList = Array.from(pages);

    return {
      tags: this.tagBuilder.build(pageList),
      tasks: this.taskBuilder.build(pageList),
      embeds: this.embedBuilder.build(pageList),
      knowledgeGraph: this.knowledgeGraphBuilder.build(
        pageList,
        pageList.flatMap((page) => page.analysis.links)
      ),
    };
  }
}
