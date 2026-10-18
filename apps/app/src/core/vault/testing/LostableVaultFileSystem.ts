import { VaultRootMissingError } from '../providers/VaultRootMissingError';
import { InMemoryVaultFileSystem } from './InMemoryVaultFileSystem';

/**
 * An in-memory filesystem that can lose its vault the way `LocalVaultProvider` does: after `lose()`, every
 * mutation (and any directory creation) is refused with `VaultRootMissingError` — the sealed or
 * root-missing outcome — while reads and existence checks keep answering. Counts what was actually
 * mutated, so a test can show that nothing landed after the loss. For tests only.
 */
export class LostableVaultFileSystem extends InMemoryVaultFileSystem {
  private lost = false;
  /** Mutations that went through (not refused), by kind. */
  readonly landed = { writeFile: 0, createDirectory: 0, deleteFile: 0, moveFile: 0 };

  constructor(
    private readonly rootPath: string,
    initialFiles: Record<string, string> = {}
  ) {
    super(initialFiles);
  }

  lose(): void {
    this.lost = true;
  }

  private assertVaultPresent(): void {
    if (this.lost) {
      throw new VaultRootMissingError(this.rootPath);
    }
  }

  override async createDirectory(path: string): Promise<void> {
    this.assertVaultPresent();
    await super.createDirectory(path);
    this.landed.createDirectory++;
  }

  override async writeFile(path: string, contents: string): Promise<void> {
    this.assertVaultPresent();
    await super.writeFile(path, contents);
    this.landed.writeFile++;
  }

  override async deleteFile(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.assertVaultPresent();
    await super.deleteFile(path, options);
    this.landed.deleteFile++;
  }

  override async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    this.assertVaultPresent();
    await super.moveFile(sourcePath, destinationPath);
    this.landed.moveFile++;
  }
}
