import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
  remove,
  rename,
} from '@tauri-apps/plugin-fs';
import type { VaultEntry, VaultFileSystem } from './VaultFileSystem';

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
}
