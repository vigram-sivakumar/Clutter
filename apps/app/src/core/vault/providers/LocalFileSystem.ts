import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
  remove,
  rename,
  copyFile,
} from '@tauri-apps/plugin-fs';
import type { VaultEntry, VaultFileSystem } from './VaultFileSystem';
import { resolveLocalDuplicatePath } from './localDuplicateNaming';

export class LocalVaultProvider implements VaultFileSystem {
  constructor(private readonly rootPath: string) {}

  private resolvePath(path: string): string {
    return path.startsWith(this.rootPath) ? path : `${this.rootPath}/${path}`;
  }

  async exists(path: string): Promise<boolean> {
    return exists(this.resolvePath(path));
  }

  async createDirectory(path: string): Promise<void> {
    await mkdir(this.resolvePath(path), { recursive: true });
  }

  async readDirectory(_path: string): Promise<VaultEntry[]> {
    const entries = await readDir(_path);
    return entries.map((entry) => ({
      name: entry.name,
      path: `${_path}/${entry.name}`,
      isDirectory: entry.isDirectory,
    }));
  }

  async readFile(path: string): Promise<string> {
    return readTextFile(path);
  }

  async writeFile(path: string, contents: string): Promise<void> {
    await writeTextFile(path, contents);
  }

  async deleteFile(path: string): Promise<void> {
    await remove(this.resolvePath(path));
  }

  async moveFile(sourcePath: string, destinationPath: string): Promise<void> {
    await rename(
      this.resolvePath(sourcePath),
      this.resolvePath(destinationPath)
    );
  }

  /**
   * Local-disk's implementation of the provider-owned duplicate contract
   * (ADR-029). Tauri's fs plugin has no "pick a non-colliding name"
   * primitive (nor does any OS filesystem API), so this falls back to
   * resolveLocalDuplicatePath's "name copy"/"name copy 2" convention —
   * provider-internal policy, never seen by Application.
   */
  async duplicate(sourcePath: string, kind: 'file' | 'directory'): Promise<string> {
    const resolvedSource = this.resolvePath(sourcePath);
    const destinationPath = await resolveLocalDuplicatePath(this, resolvedSource, kind);

    if (kind === 'directory') {
      await mkdir(destinationPath, { recursive: true });
    } else {
      await copyFile(resolvedSource, destinationPath);
    }

    return destinationPath;
  }
}
