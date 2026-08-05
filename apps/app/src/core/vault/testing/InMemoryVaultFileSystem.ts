import type { VaultEntry, VaultFileSystem } from '../providers/VaultFileSystem';

/**
 * In-memory implementation of VaultFileSystem for tests.
 *
 * Backs files and directories with plain Maps/Sets so vault-layer tests can
 * exercise real read/write/move/delete flows without Tauri or a real disk.
 */
export class InMemoryVaultFileSystem implements VaultFileSystem {
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>();

  constructor(initialFiles: Record<string, string> = {}) {
    for (const [path, contents] of Object.entries(initialFiles)) {
      this.files.set(path, contents);
    }
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  /**
   * Mirrors LocalFileSystem's recursive mkdir: creating a nested path also
   * creates every intermediate ancestor, so a scan starting from a shared
   * root can walk down into it via readDirectory the same way it would on
   * a real filesystem.
   */
  async createDirectory(path: string): Promise<void> {
    const segments = path.split('/');

    for (let i = 1; i <= segments.length; i++) {
      const ancestor = segments.slice(0, i).join('/');

      if (ancestor) {
        this.directories.add(ancestor);
      }
    }
  }

  async readDirectory(path: string): Promise<VaultEntry[]> {
    const prefix = path.endsWith('/') ? path : `${path}/`;
    const entries: VaultEntry[] = [];

    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(prefix) && !filePath.slice(prefix.length).includes('/')) {
        entries.push({
          name: filePath.slice(prefix.length),
          path: filePath,
          isDirectory: false,
        });
      }
    }

    for (const dirPath of this.directories) {
      if (dirPath.startsWith(prefix) && !dirPath.slice(prefix.length).includes('/')) {
        entries.push({
          name: dirPath.slice(prefix.length),
          path: dirPath,
          isDirectory: true,
        });
      }
    }

    return entries;
  }

  async readFile(path: string): Promise<string> {
    const contents = this.files.get(path);

    if (contents === undefined) {
      throw new Error(`InMemoryVaultFileSystem: file not found: ${path}`);
    }

    return contents;
  }

  async writeFile(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
  }

  /**
   * Deletes a file or a directory (ADR-024's folder-delete cascade calls
   * this once per descendant path, innermost-first, exactly the way
   * LocalFileSystem's non-recursive remove() requires — mirrored here by
   * accepting either a tracked file or a tracked directory, matching real
   * filesystem rmdir/unlink semantics for an already-empty directory).
   */
  async deleteFile(path: string): Promise<void> {
    if (this.files.has(path)) {
      this.files.delete(path);
      return;
    }

    if (this.directories.has(path)) {
      this.directories.delete(path);
      return;
    }

    throw new Error(`InMemoryVaultFileSystem: path not found: ${path}`);
  }

  /**
   * Moves a file, or a directory and everything nested inside it (ADR-024
   * — mirrors LocalFileSystem.moveFile()'s real behavior: an OS-level
   * rename of a directory implicitly changes every descendant path too,
   * since they're resolved relative to it). Renaming/moving a directory
   * without cascading its contents' tracked paths would leave this double
   * silently out of sync with what Vault.moveFolder() computes for the
   * same operation.
   */
  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    if (this.files.has(sourcePath)) {
      const contents = this.files.get(sourcePath)!;
      this.files.delete(sourcePath);
      this.files.set(destinationPath, contents);
      return;
    }

    if (this.directories.has(sourcePath)) {
      const prefix = `${sourcePath}/`;

      for (const filePath of [...this.files.keys()]) {
        if (filePath.startsWith(prefix)) {
          const contents = this.files.get(filePath)!;
          this.files.delete(filePath);
          this.files.set(destinationPath + filePath.slice(sourcePath.length), contents);
        }
      }

      for (const dirPath of [...this.directories]) {
        if (dirPath === sourcePath || dirPath.startsWith(prefix)) {
          this.directories.delete(dirPath);
          this.directories.add(destinationPath + dirPath.slice(sourcePath.length));
        }
      }

      return;
    }

    throw new Error(`InMemoryVaultFileSystem: path not found: ${sourcePath}`);
  }

  /**
   * Test-only helper to seed or inspect file contents without going through
   * the async VaultFileSystem contract.
   */
  seedFile(path: string, contents: string): void {
    this.files.set(path, contents);
  }

  getFileSync(path: string): string | undefined {
    return this.files.get(path);
  }

  hasFileSync(path: string): boolean {
    return this.files.has(path);
  }
}
