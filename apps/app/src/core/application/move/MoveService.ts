import type { Page } from '../../vault/models/Page';
import { Vault } from '../../vault/models/Vault';
import type { VaultFileSystem } from '../../vault/providers/VaultFileSystem';

export class MoveService {
  constructor(
    private readonly vault: Vault,
    private readonly fileSystem: VaultFileSystem
  ) {}

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
