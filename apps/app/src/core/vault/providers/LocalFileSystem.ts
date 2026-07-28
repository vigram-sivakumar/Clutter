import {
  exists,
  mkdir,
  readDir,
  readTextFile,
  writeTextFile,
  remove,
} from '@tauri-apps/plugin-fs';
import type { VaultEntry, VaultFileSystem } from './VaultFileSystem';

export class LocalVaultProvider implements VaultFileSystem {
  async exists(_path: string): Promise<boolean> {
    return exists(_path);
  }

  async createDirectory(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
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
    await remove(path);
  }
}
