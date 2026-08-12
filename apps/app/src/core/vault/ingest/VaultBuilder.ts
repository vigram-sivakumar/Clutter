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
import type { IdGenerator } from '../../shared/identity/IdGenerator';

export interface VaultBuildResult {
  readonly vault: Vault;
  /**
   * Paths whose frontmatter `id` collided with another page's during this
   * scan (a genuine duplicate) and were built with a freshly generated id
   * instead. The caller is responsible for repairing the persisted
   * frontmatter to match — VaultBuilder stays read-only w.r.t. disk, per
   * Ingest's invariant (docs/architecture-specification.md §2).
   */
  readonly reassignedPagePaths: ReadonlySet<string>;
  /** Same as reassignedPagePaths, for folders (their `.folder.md`). */
  readonly reassignedFolderPaths: ReadonlySet<string>;
}

export class VaultBuilder {
  private readonly folderBuilder = new FolderBuilder();
  private readonly tagBuilder = new TagBuilder();
  private readonly taskBuilder = new TaskBuilder();
  private readonly embedBuilder = new EmbedBuilder();
  private readonly knowledgeGraphBuilder = new KnowledgeGraphBuilder();
  private readonly projectionBuilder = new VaultProjectionBuilder();

  constructor(private readonly idGenerator: IdGenerator) {}

  build(
    scanResult: VaultScanResult,
    tagMetadata: ReadonlyMap<string, TagMetadataEntry> = new Map()
  ): VaultBuildResult {
    // The vault root itself is scanned as a directory (parentPath === null)
    // so its id can be resolved for its children's parentId, but it is not
    // a navigable Folder in the domain model — rootIsFolder: false.
    //
    // PageBuilder needs vaultRoot (to classify Daily Note vs. Note by
    // path), only known once scanResult arrives — constructed here rather
    // than as a field for that reason, unlike the other builders above,
    // none of which need vault-root-relative path classification.
    const pageBuilder = new PageBuilder(scanResult.rootPath);
    const { folders, pages, reassignedPagePaths, reassignedFolderPaths } = buildDiscoveredEntities(
      scanResult,
      { rootIsFolder: false, rootParentId: null, idGenerator: this.idGenerator },
      { folderBuilder: this.folderBuilder, pageBuilder }
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
    const vault = new Vault(
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

    return { vault, reassignedPagePaths, reassignedFolderPaths };
  }
}
