import type { VaultEntry, VaultFileSystem } from '../providers/VaultFileSystem';
import { resolveLocalDuplicatePath } from '../providers/localDuplicateNaming';
import { VaultPath } from '../ingest/VaultPath';

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
   *
   * Also mirrors real `mkdir`'s case-insensitive-but-case-preserving
   * behavior on macOS/Windows (empirically confirmed against APFS: `mkdir
   * Test` when `test` already exists returns success and creates nothing
   * new) — an ancestor segment that already exists under a *different*
   * case is left as-is rather than added as a second, distinct tracked
   * directory. Without this, a test creating "test" then "Test" would see
   * two independent directories, which is exactly the divergence this
   * fake filesystem exists to reproduce, not paper over.
   */
  async createDirectory(path: string): Promise<void> {
    const segments = path.split('/');

    for (let i = 1; i <= segments.length; i++) {
      const ancestor = segments.slice(0, i).join('/');

      if (ancestor && !this.findCaseInsensitiveMatch(ancestor, this.directories)) {
        this.directories.add(ancestor);
      }
    }
  }

  /**
   * Same case-collapsing as createDirectory() above, but for individual
   * files — mirrors real `writeFile`'s behavior for a case-variant of an
   * already-existing path: it silently writes into the *existing* file,
   * not a new one (empirically confirmed: writing to "Test/.folder.md"
   * when only "test/.folder.md" exists overwrites the latter). Resolving
   * to the already-tracked key (rather than the caller's casing) is what
   * makes that corruption reproducible in a test — a Gate write meant for
   * a "new" case-variant folder observably clobbers the original's file.
   */
  private findCaseInsensitiveMatch(
    path: string,
    keys: Iterable<string>
  ): string | undefined {
    for (const key of keys) {
      if (VaultPath.equalsCaseInsensitive(key, path)) {
        return key;
      }
    }

    return undefined;
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

  /**
   * Also case-collapsing, for the same empirically-confirmed reason as
   * createDirectory() above: writing "Test/.folder.md" when only
   * "test/.folder.md" is tracked overwrites the existing key rather than
   * creating a second one — this is the exact mechanism by which a Gate
   * create-folder write can silently corrupt a pre-existing case-variant
   * folder's metadata.
   */
  async writeFile(path: string, contents: string): Promise<void> {
    const existingKey = this.findCaseInsensitiveMatch(path, this.files.keys());

    this.files.set(existingKey ?? path, contents);
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

  async copyFile(
    sourceAbsolutePath: string,
    destinationAbsolutePath: string
  ): Promise<void> {
    const contents = this.files.get(sourceAbsolutePath);

    if (contents === undefined) {
      throw new Error(
        `InMemoryVaultFileSystem: source file not found: ${sourceAbsolutePath}`
      );
    }

    this.files.set(destinationAbsolutePath, contents);
  }

  /**
   * Mirrors LocalFileSystem.duplicate() exactly (ADR-029): the same shared
   * fallback naming decision (resolveLocalDuplicatePath), then a plain
   * structural copy — a file's bytes, or an empty directory — at the
   * resolved path.
   */
  async duplicate(sourcePath: string, kind: 'file' | 'directory'): Promise<string> {
    const destinationPath = await resolveLocalDuplicatePath(this, sourcePath, kind);

    if (kind === 'directory') {
      await this.createDirectory(destinationPath);
    } else {
      const contents = await this.readFile(sourcePath);
      await this.writeFile(destinationPath, contents);
    }

    return destinationPath;
  }

  /**
   * Test-only helper to seed or inspect file contents without going through
   * the async VaultFileSystem contract.
   */
  seedFile(path: string, contents: string): void {
    this.files.set(path, contents);
  }

  /**
   * Test-only helper simulating a bulk external deletion: removes a file or
   * an entire directory subtree from the fake filesystem synchronously, in
   * one call, so a test can set up "disk state after everything under this
   * path vanished" before emitting whatever single watcher event shape
   * (an individual `deleted`, or a single directory-level `changed`) is
   * under test — without needing one deleteFile() call per descendant.
   */
  removeRecursively(path: string): void {
    this.files.delete(path);
    this.directories.delete(path);

    const prefix = `${path}/`;

    for (const filePath of [...this.files.keys()]) {
      if (filePath.startsWith(prefix)) {
        this.files.delete(filePath);
      }
    }

    for (const dirPath of [...this.directories]) {
      if (dirPath.startsWith(prefix)) {
        this.directories.delete(dirPath);
      }
    }
  }

  getFileSync(path: string): string | undefined {
    return this.files.get(path);
  }

  hasFileSync(path: string): boolean {
    return this.files.has(path);
  }
}
