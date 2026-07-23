import { exists } from '@tauri-apps/api/fs';
import type { VaultEntry, VaultFileSystem } from './VaultFileSystem';

export class LocalVaultProvider implements VaultFileSystem {
  async exists(_path: string): Promise<boolean> {
    return exists(_path);
  }

  async readDirectory(_path: string): Promise<VaultEntry[]> {
    throw new Error('Not implemented');
  }

  async readFile(_path: string): Promise<string> {
    throw new Error('Not implemented');
  }
}
