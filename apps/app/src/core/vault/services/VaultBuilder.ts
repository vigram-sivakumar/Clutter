import { Vault } from '../models';
import type { VaultScanResult } from './VaultScanResult';
import { PageBuilder } from './PageBuilder';
import { TagBuilder } from './TagBuilder';
import { TaskBuilder } from './TaskBuilder';
import { LinkBuilder } from './LinkBuilder';
import { EmbedBuilder } from './EmbedBuilder';
import { KnowledgeGraphBuilder } from './KnowledgeGraphBuilder';
import type { Folder } from '../models';

export class VaultBuilder {
  private readonly pageBuilder = new PageBuilder();
  private readonly tagBuilder = new TagBuilder();
  private readonly taskBuilder = new TaskBuilder();
  private readonly linkBuilder = new LinkBuilder();
  private readonly embedBuilder = new EmbedBuilder();
  private readonly knowledgeGraphBuilder = new KnowledgeGraphBuilder();

  private resolveFolderIds(scanResult: VaultScanResult): Map<string, string> {
    const folderIdsByPath = new Map<string, string>();

    for (const directory of scanResult.directories) {
      const id = directory.frontmatter?.id ?? crypto.randomUUID();

      folderIdsByPath.set(directory.path, id);
    }

    return folderIdsByPath;
  }

  build(scanResult: VaultScanResult): Vault {
    const folderIdsByPath = this.resolveFolderIds(scanResult);

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
    // Create the Vault.
    const tags = this.tagBuilder.build(scanResult.pages);
    const tasks = this.taskBuilder.build(scanResult.pages);
    const links = this.linkBuilder.build(scanResult.pages);
    const embeds = this.embedBuilder.build(scanResult.pages);

    const vault = new Vault(
      scanResult.rootPath,
      pages,
      folders,
      tags,
      tasks,
      links,
      embeds
    );

    // TODO(v1): Decide whether the knowledge graph should be owned by the
    // Vault or exposed as a separate derived model.
    const knowledgeGraph = this.knowledgeGraphBuilder.build(vault);

    void knowledgeGraph;

    return vault;
  }
}
