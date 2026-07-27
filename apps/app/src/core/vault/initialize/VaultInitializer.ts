import type { VaultFileSystem } from '../providers';
import {
  RESERVED_RESOURCES,
  type ReservedFile,
  type ReservedFolder,
} from './ReservedResources';

/**
 * Reconciles a vault with Clutter's required filesystem structure.
 *
 * Responsibilities:
 * - Ensure reserved folders exist.
 * - Ensure reserved files exist.
 * - Never modify user content.
 * - Never scan or build the vault.
 */
export class VaultInitializer {
  constructor(private readonly fileSystem: VaultFileSystem) {}

  async initialize(rootPath: string): Promise<void> {
    for (const resource of RESERVED_RESOURCES) {
      if (resource.type === 'folder') {
        await this.ensureFolder(rootPath, resource);
      } else {
        await this.ensureFile(rootPath, resource);
      }
    }
  }

  private async ensureFolder(
    rootPath: string,
    folder: ReservedFolder
  ): Promise<void> {
    const path = `${rootPath}/${folder.path}`;

    if (await this.fileSystem.exists(path)) {
      return;
    }

    await this.fileSystem.createDirectory(path);
  }

  private async ensureFile(
    rootPath: string,
    file: ReservedFile
  ): Promise<void> {
    const path = `${rootPath}/${file.path}`;

    if (await this.fileSystem.exists(path)) {
      return;
    }

    await this.fileSystem.writeFile(path, file.contents);
  }
}
