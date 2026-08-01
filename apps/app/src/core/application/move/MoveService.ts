import type { Page } from '../../vault/models/Page';
import { Vault } from '../../vault/models/Vault';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

export class MoveService {
  constructor(
    private readonly vault: Vault,
    private readonly fileSystem: VaultFileSystem
  ) {}

  /**
   * Computes where an archived copy of `current` should live, based on the
   * vault's reserved Archive folder. Path/parentId only — does not move
   * anything itself (see movePage).
   */
  resolveArchiveDestination(current: Page): {
    path: string;
    parentId: string;
  } {
    const archiveFolderPath = `${this.vault.root}/Archive`;
    const archiveFolder = this.vault.getFolderByPath(archiveFolderPath);

    if (!archiveFolder) {
      throw new Error(`Archive folder not found: ${archiveFolderPath}`);
    }

    const filename = this.getFilename(current.path);

    return {
      path: `${archiveFolderPath}/${filename}`,
      parentId: archiveFolder.id,
    };
  }

  /**
   * Computes where an archived page should return to: its original folder
   * if it still exists, else the vault's Inbox, else the vault root.
   */
  resolveRestoreDestination(current: Page): {
    path: string;
    parentId: string | null;
  } {
    const filename = this.getFilename(current.path);
    const originalParentId = current.metadata.originalParentId;

    if (originalParentId !== null) {
      const originalFolder = this.vault.getFolder(originalParentId);

      if (originalFolder) {
        return {
          path: `${originalFolder.path}/${filename}`,
          parentId: originalFolder.id,
        };
      }
    }

    const inboxFolderPath = `${this.vault.root}/Inbox`;
    const inboxFolder = this.vault.getFolderByPath(inboxFolderPath);

    if (inboxFolder) {
      return {
        path: `${inboxFolderPath}/${filename}`,
        parentId: inboxFolder.id,
      };
    }

    return {
      path: `${this.vault.root}/${filename}`,
      parentId: null,
    };
  }

  private getFilename(path: string): string {
    return path.slice(path.lastIndexOf('/') + 1);
  }

  async movePage(current: Page, updated: Page): Promise<void> {
    const existing = this.vault.getPage(updated.id);

    if (!existing) {
      throw new Error(`Page not found: ${updated.id}`);
    }

    if (
      current.path === updated.path &&
      current.parentId === updated.parentId
    ) {
      return;
    }

    const occupant = this.vault.getPageByPath(updated.path);

    if (occupant && occupant.id !== updated.id) {
      throw new Error(`Path already in use by another page: ${updated.path}`);
    }

    if (current.path !== updated.path) {
      const lastSlashIndex = updated.path.lastIndexOf('/');
      const destinationDirectory = updated.path.slice(0, lastSlashIndex);

      if (
        destinationDirectory &&
        !(await this.fileSystem.exists(destinationDirectory))
      ) {
        await this.fileSystem.createDirectory(destinationDirectory);
      }

      await this.fileSystem.moveFile(current.path, updated.path);
    }

    this.vault.updatePagePath(updated.id, updated.path, updated.parentId);
  }
}
