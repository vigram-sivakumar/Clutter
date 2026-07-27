import { Vault } from '../models';
import type { VaultScanResult } from '../discover';
import { PageBuilder } from './PageBuilder';
import {
  TagBuilder,
  TaskBuilder,
  EmbedBuilder,
  KnowledgeGraphBuilder,
} from '../knowledge';
import type { Folder } from '../models';
import { IdentityResolver } from './IdentityResolver';

export class VaultBuilder {
  private readonly pageBuilder = new PageBuilder();
  private readonly tagBuilder = new TagBuilder();
  private readonly taskBuilder = new TaskBuilder();
  private readonly embedBuilder = new EmbedBuilder();
  private readonly knowledgeGraphBuilder = new KnowledgeGraphBuilder();
  private readonly identityResolver = new IdentityResolver();

  build(scanResult: VaultScanResult): Vault {
    const folderIdsByPath = new Map<string, string>();

    for (const directory of scanResult.directories) {
      const identity = this.identityResolver.resolveFolder(
        directory.frontmatter?.id,
        directory.path
      );

      folderIdsByPath.set(directory.path, identity.id);
    }

    const folders: Folder[] = scanResult.directories.map((directory) => {
      const id = folderIdsByPath.get(directory.path);

      if (!id) {
        throw new Error(`Missing folder ID for "${directory.path}".`);
      }

      let parentId: string | null = null;

      if (directory.parentPath !== null) {
        parentId = folderIdsByPath.get(directory.parentPath) ?? null;

        if (!parentId) {
          throw new Error(`Missing parent folder "${directory.parentPath}".`);
        }
      }

      return {
        id,
        name: directory.path.split('/').pop() ?? '',
        path: directory.path,
        parentId,
        metadata: {
          icon: directory.frontmatter?.icon ?? null,
          favorite: directory.frontmatter?.favorite ?? false,
        },
      };
    });

    const pages = scanResult.pages.map((page) => {
      const parentId = folderIdsByPath.get(page.directoryPath);

      if (!parentId) {
        throw new Error(`Missing folder ID for "${page.directoryPath}".`);
      }

      return this.pageBuilder.build({
        parentId,
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
    );
  }
}
