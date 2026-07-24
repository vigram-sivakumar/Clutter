import type { Page } from '../models';
import type { VaultFileSystem } from '../providers';
import { DocumentLoader } from './DocumentLoader';
import { PageBuilder } from './PageBuilder';

export class VaultScanner {
  private readonly documentLoader: DocumentLoader;
  private readonly pageBuilder: PageBuilder;

  constructor(private readonly fileSystem: VaultFileSystem) {
    this.documentLoader = new DocumentLoader(fileSystem);
    this.pageBuilder = new PageBuilder();
  }

  async scan(_vaultPath: string): Promise<Page[]> {
    const exists = await this.fileSystem.exists(_vaultPath);

    if (!exists) {
      throw new Error(`Vault does not exist: ${_vaultPath}`);
    }

    const pages: Page[] = [];

    await this.scanDirectory(_vaultPath, pages);

    return pages;
  }

  private async scanDirectory(
    path: string,
    pages: Page[],
    parentId: string | null = null
  ): Promise<void> {
    const entries = await this.fileSystem.readDirectory(path);

    let currentFolderId = parentId;

    for (const entry of entries) {
      // TODO: Remove filename knowledge from VaultScanner. The scanner should react to page types rather than special filenames.
      if (entry.name === '.folder.md') {
        const folder = await this.inspectFile(entry.path, pages, parentId);

        if (folder?.type === 'folder') {
          currentFolderId = folder.id;
        }

        continue;
      }

      if (entry.isDirectory) {
        await this.scanDirectory(entry.path, pages, currentFolderId);
        continue;
      }

      await this.inspectFile(entry.path, pages, currentFolderId);
    }
  }

  private async inspectFile(
    path: string,
    pages: Page[],
    parentId: string | null
  ): Promise<Page | null> {
    const markdown = await this.documentLoader.load(path);

    if (markdown === null) {
      return null;
    }

    const page = this.pageBuilder.build(markdown, path, parentId);

    if (page === null) {
      return null;
    }

    pages.push(page);
    return page;
  }
}
