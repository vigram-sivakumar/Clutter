import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
import { isNotFoundError } from '../vault/providers/probeSpaceFolder';
import type { RecoveryCatalogEntry, RecoveryStorage } from './RecoveryStorage';

/**
 * Recovery records in the application data directory (`<appData>/recovery/<vaultKey>/<note>.json`), outside every
 * vault: on macOS `~/Library/Application Support/<bundle identifier>/recovery`. Reads go through the fs plugin; every
 * write and removal goes through `recovery_write` / `recovery_remove` (`recovery_store.rs`), which take a vault key and
 * a record name and never a path, so the webview holds no command that can overwrite a file outside this folder.
 *
 * A write goes to `<note>.json.tmp` and is renamed over the real file, so a crash mid-write leaves the previous
 * record intact. (Same-directory rename is atomic and the temporary file is synced first; see ADR-062.)
 */
export class TauriRecoveryStorage implements RecoveryStorage {
  /** Includes orphaned Spaces without registering or modifying them. Bodies are validated by RecoveryJournal. */
  async listAll(): Promise<RecoveryCatalogEntry[]> {
    return invoke<RecoveryCatalogEntry[]>('recovery_list');
  }

  private base: Promise<string> | null = null;

  private root(): Promise<string> {
    this.base ??= appDataDir().then((dir) => `${dir.replace(/\/$/, '')}/recovery`);
    return this.base;
  }

  async list(dir: string): Promise<string[]> {
    try {
      const entries = await readDir(`${await this.root()}/${dir}`);
      return entries.filter((entry) => entry.isFile && (entry.name.endsWith('.json') || entry.name.endsWith('.json.tmp'))).map((entry) => entry.name);
    } catch (error) {
      if (isNotFoundError(error)) return [];
      throw error;
    }
  }

  async read(dir: string, name: string): Promise<string | null> {
    try {
      return await readTextFile(`${await this.root()}/${dir}/${name}`);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async writeAtomic(dir: string, name: string, text: string): Promise<void> {
    await invoke('recovery_write', { key: dir, name, text });
  }

  async remove(dir: string, name: string): Promise<void> {
    await invoke('recovery_remove', { key: dir, name });
  }
}
