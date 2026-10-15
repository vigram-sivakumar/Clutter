import { isTauri } from '@tauri-apps/api/core';
import { readDir, stat } from '@tauri-apps/plugin-fs';

/**
 * Whether `path` is an existing, readable directory the app may open as a Space.
 * Read-only: nothing is created or written (unlike `Application.bootstrap`, which
 * starts an empty vault at a missing root). A path outside the filesystem scope, a
 * missing path, a file, or an unreadable folder all answer `false` — never throw.
 * The web runtime has no real folders (its vault is in-memory), so it answers `true`.
 */
export async function probeSpaceFolder(path: string): Promise<boolean> {
  if (!isTauri()) {
    return true;
  }

  try {
    const info = await stat(path);
    if (!info.isDirectory) {
      return false;
    }
    await readDir(path);
    return true;
  } catch {
    return false;
  }
}
