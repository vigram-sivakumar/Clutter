import type { FolderFrontmatter } from '../models';
import type { VaultScanResult } from './VaultScanResult';
import type { VaultFileSystem } from '../providers';
import { DocumentLoader } from './DocumentLoader';

export class VaultScanner {
  private readonly documentLoader: DocumentLoader;

  constructor(private readonly fileSystem: VaultFileSystem) {
    this.documentLoader = new DocumentLoader(fileSystem);
  }

  async scan(vaultPath: string): Promise<VaultScanResult> {
    const exists = await this.fileSystem.exists(vaultPath);

    if (!exists) {
      throw new Error(`Vault does not exist: ${vaultPath}`);
    }

    const result: VaultScanResult = {
      rootPath: vaultPath,
      directories: [],
      pages: [],
    };

    await this.scanDirectory(vaultPath, null, result);

    return result;
  }

  private async scanDirectory(
    path: string,
    parentPath: string | null,
    result: VaultScanResult
  ): Promise<void> {
    const entries = await this.fileSystem.readDirectory(path);

    const folderMetadataFile = entries.find(
      (entry) => !entry.isDirectory && entry.name === '.folder.md'
    );

    const pageFiles = entries.filter(
      (entry) =>
        !entry.isDirectory &&
        entry.name.endsWith('.md') &&
        entry.name !== '.folder.md'
    );

    const childDirectories = entries.filter((entry) => entry.isDirectory);

    let frontmatter: FolderFrontmatter | null = null;

    if (folderMetadataFile) {
      const markdown = await this.documentLoader.load(folderMetadataFile.path);

      if (markdown) {
        frontmatter = markdown.frontmatter;
      }
    }

    result.directories.push({
      path,
      parentPath,
      frontmatter,
    });

    for (const file of pageFiles) {
      await this.inspectFile(file.path, path, result);
    }
    for (const directory of childDirectories) {
      await this.scanDirectory(directory.path, path, result);
    }
  }

  private async inspectFile(
    path: string,
    directoryPath: string,
    result: VaultScanResult
  ): Promise<void> {
    const markdown = await this.documentLoader.load(path);

    if (markdown === null) {
      return;
    }

    result.pages.push({
      path,
      directoryPath,
      frontmatter: markdown.frontmatter,
      content: markdown.body,
    });
  }
}
