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

  async createDirectory(path: string): Promise<void> {
    this.directories.add(path);
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

  async deleteFile(path: string): Promise<void> {
    if (!this.files.has(path)) {
      throw new Error(`InMemoryVaultFileSystem: file not found: ${path}`);
    }

    this.files.delete(path);
  }

  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    const contents = this.files.get(sourcePath);

    if (contents === undefined) {
      throw new Error(`InMemoryVaultFileSystem: file not found: ${sourcePath}`);
    }

    this.files.delete(sourcePath);
    this.files.set(destinationPath, contents);
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
