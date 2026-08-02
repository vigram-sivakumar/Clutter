import { Vault } from '../models';
import type { VaultScanResult } from './VaultScanResult';
import { PageBuilder } from './PageBuilder';
import { FolderBuilder } from './FolderBuilder';
import {
  TagBuilder,
  TaskBuilder,
  EmbedBuilder,
  KnowledgeGraphBuilder,
  VaultProjectionBuilder,
} from '../knowledge';
import type { Folder } from '../models';
import { IdentityResolver } from './identity/IdentityResolver';

export class VaultBuilder {
  private readonly pageBuilder = new PageBuilder();
  private readonly folderBuilder = new FolderBuilder();
  private readonly tagBuilder = new TagBuilder();
  private readonly taskBuilder = new TaskBuilder();
  private readonly embedBuilder = new EmbedBuilder();
  private readonly knowledgeGraphBuilder = new KnowledgeGraphBuilder();
  private readonly identityResolver = new IdentityResolver();
  private readonly projectionBuilder = new VaultProjectionBuilder();

  build(scanResult: VaultScanResult): Vault {
    const rootPath = scanResult.rootPath;
    const folderIdsByPath = new Map<string, string>();

    for (const directory of scanResult.directories) {
      const identity = this.identityResolver.resolveFolder(
        directory.frontmatter?.id,
        directory.path
      );

      folderIdsByPath.set(directory.path, identity.id);
    }

    // Entries whose parent is the vault root are top-level: the root itself
    // is not a navigable Folder in the domain model, so its children's
    // parentId is null rather than the root's id.
    const resolveParentId = (parentPath: string | null): string | null => {
      if (parentPath === null || parentPath === rootPath) {
        return null;
      }

      const parentId = folderIdsByPath.get(parentPath);

      if (!parentId) {
        throw new Error(`Missing parent folder "${parentPath}".`);
      }

      return parentId;
    };

    // The vault root itself is scanned as a directory (parentPath === null)
    // so its id can be resolved for its children's parentId, but it is not
    // a navigable Folder in the domain model.
    const folders: Folder[] = scanResult.directories
      .filter((directory) => directory.parentPath !== null)
      .map((directory) =>
        this.folderBuilder.build({
          directory,
          parentId: resolveParentId(directory.parentPath),
        })
      );

    const pages = scanResult.pages.map((page) => {
      return this.pageBuilder.build({
        parentId: resolveParentId(page.directoryPath),
        page,
      });
    });

    // Pass 4:
    // Build vault-wide projections from page analysis.
    const tags = this.tagBuilder.build(pages);
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
    );
  }
}
