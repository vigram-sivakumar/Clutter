import { appDataDir } from '@tauri-apps/api/path';
import { exists, mkdir, readDir, readTextFile, remove, rename, writeTextFile } from '@tauri-apps/plugin-fs';
import { isNotFoundError } from '../vault/providers/probeSpaceFolder';
import type { RecoveryStorage } from './RecoveryStorage';

/**
 * Recovery records in the application data directory (`<appData>/recovery/<vaultKey>/<note>.json`), outside every
 * vault: on macOS `~/Library/Application Support/<bundle identifier>/recovery`. Reached through the same fs plugin and
 * scope (`$HOME/**`) the rest of the app already uses; no new native code or capability.
 *
 * A write goes to `<note>.json.tmp` and is renamed over the real file, so a crash mid-write leaves the previous
 * record intact. (Same-directory rename is atomic; this does not claim power-loss durability, see ADR-062.)
 */
export class TauriRecoveryStorage implements RecoveryStorage {
  private base: Promise<string> | null = null;

  private root(): Promise<string> {
    this.base ??= appDataDir().then((dir) => `${dir.replace(/\/$/, '')}/recovery`);
    return this.base;
  }

  async list(dir: string): Promise<string[]> {
    try {
      const entries = await readDir(`${await this.root()}/${dir}`);
      return entries.filter((entry) => entry.isFile && entry.name.endsWith('.json')).map((entry) => entry.name);
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
    const folder = `${await this.root()}/${dir}`;
    const path = `${folder}/${name}`;
    const temp = `${path}.tmp`;

    await mkdir(folder, { recursive: true });
    await writeTextFile(temp, text);
    try {
      await rename(temp, path);
    } catch (error) {
      await remove(temp).catch(() => undefined);
      throw error;
    }
  }

  async remove(dir: string, name: string): Promise<void> {
    const path = `${await this.root()}/${dir}/${name}`;

    if (await exists(path)) {
      await remove(path);
    }
  }
}
