import { exists, readDir } from '@tauri-apps/plugin-fs';
import type { VaultEntry, VaultFileSystem } from './VaultFileSystem';

export class LocalVaultProvider implements VaultFileSystem {
  async exists(_path: string): Promise<boolean> {
    return exists(_path);
  }

  async readDirectory(_path: string): Promise<VaultEntry[]> {
    const entries = await readDir(_path);
    return entries.map((entry) => ({
      name: entry.name,
      path: `${_path}/${entry.name}`,
      isDirectory: entry.isDirectory,
    }));
  }

  async readFile(_path: string): Promise<string> {
    throw new Error('Not implemented');
  }
}
