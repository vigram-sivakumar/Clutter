import { Vault } from '../models';
import type { VaultScanResult } from './VaultScanResult';
import { PageBuilder } from './PageBuilder';
import { FolderBuilder } from './FolderBuilder';
import { buildDiscoveredEntities } from './buildDiscoveredEntities';
import {
  TagBuilder,
  TaskBuilder,
  EmbedBuilder,
  KnowledgeGraphBuilder,
  VaultProjectionBuilder,
} from '../knowledge';
import type { TagMetadataEntry } from '../models';

export class VaultBuilder {
  private readonly pageBuilder = new PageBuilder();
  private readonly folderBuilder = new FolderBuilder();
  private readonly tagBuilder = new TagBuilder();
  private readonly taskBuilder = new TaskBuilder();
  private readonly embedBuilder = new EmbedBuilder();
  private readonly knowledgeGraphBuilder = new KnowledgeGraphBuilder();
  private readonly projectionBuilder = new VaultProjectionBuilder();

  build(
    scanResult: VaultScanResult,
    tagMetadata: ReadonlyMap<string, TagMetadataEntry> = new Map()
  ): Vault {
    // The vault root itself is scanned as a directory (parentPath === null)
    // so its id can be resolved for its children's parentId, but it is not
    // a navigable Folder in the domain model — rootIsFolder: false.
    const { folders, pages } = buildDiscoveredEntities(
      scanResult,
      { rootIsFolder: false, rootParentId: null },
      { folderBuilder: this.folderBuilder, pageBuilder: this.pageBuilder }
    );

    // Pass 4:
    // Build vault-wide projections from page analysis.
    const tags = this.tagBuilder.build(pages, tagMetadata);
    const tasks = this.taskBuilder.build(pages);
    const embeds = this.embedBuilder.build(pages);

    const knowledgeGraph = this.knowledgeGraphBuilder.build(
      pages,
      pages.flatMap((page) => page.analysis.links),
    );

    // Construct the immutable in-memory Vault model.
    // Runtime services (Workspace, DocumentRegistry) are owned by the
    // Application and are created separately.
    return new Vault(
      scanResult.rootPath,
      pages,
      folders,
      tags,
      tasks,
      embeds,
      knowledgeGraph,
      this.projectionBuilder,
      tagMetadata,
    );
  }
}
