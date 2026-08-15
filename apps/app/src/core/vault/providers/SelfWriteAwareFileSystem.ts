import type { VaultEntry, VaultFileSystem } from './VaultFileSystem';
import type { SelfWriteRegistry } from './SelfWriteRegistry';

/**
 * Decorates a VaultFileSystem so every writeFile() call registers its path
 * with the shared SelfWriteRegistry before the write happens.
 *
 * This is the write half of the internal-write suppression mechanism: it
 * marks a path as "we just wrote this" so the paired SelfWriteAwareWatcher
 * can recognize the filesystem watcher's own echo of that write and drop it
 * instead of re-processing it as an external change. See
 * SelfWriteAwareWatcher for the read half.
 *
 * Registration happens relative to the vault root because that is the path
 * form the filesystem watcher's events use.
 */
export class SelfWriteAwareFileSystem implements VaultFileSystem {
  constructor(
    private readonly inner: VaultFileSystem,
    private readonly registry: SelfWriteRegistry,
    private readonly rootPath: string
  ) {}

  exists(path: string): Promise<boolean> {
    return this.inner.exists(path);
  }

  createDirectory(path: string): Promise<void> {
    return this.inner.createDirectory(path);
  }

  readDirectory(path: string): Promise<VaultEntry[]> {
    return this.inner.readDirectory(path);
  }

  readFile(path: string): Promise<string> {
    return this.inner.readFile(path);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    const relativePath = this.toRelativePath(path);

    this.registry.markPending(relativePath);

    try {
      await this.inner.writeFile(path, contents);
    } catch (error) {
      // The write never reached disk, so there is no echo to suppress.
      this.registry.consumePending(relativePath);
      throw error;
    }
  }

  deleteFile(path: string): Promise<void> {
    return this.inner.deleteFile(path);
  }

  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    const relativeFrom = this.toRelativePath(sourcePath);
    const relativeTo = this.toRelativePath(destinationPath);

    this.registry.markPendingMove(relativeFrom, relativeTo);

    try {
      await this.inner.moveFile(sourcePath, destinationPath);
    } catch (error) {
      this.registry.consumePendingMove(relativeFrom, relativeTo);
      throw error;
    }
  }

  async copyFile(
    sourceAbsolutePath: string,
    destinationAbsolutePath: string
  ): Promise<void> {
    const relativeDest = this.toRelativePath(destinationAbsolutePath);

    this.registry.markPending(relativeDest);

    try {
      await this.inner.copyFile(sourceAbsolutePath, destinationAbsolutePath);
    } catch (error) {
      this.registry.consumePending(relativeDest);
      throw error;
    }
  }

  duplicate?(sourcePath: string, kind: 'file' | 'directory'): Promise<string> {
    return this.inner.duplicate?.(sourcePath, kind) as Promise<string>;
  }

  private toRelativePath(path: string): string {
    const prefix = `${this.rootPath}/`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
  }
}
