import { isTauri } from '@tauri-apps/api/core';
import { readDir, stat } from '@tauri-apps/plugin-fs';

/**
 * What a Space folder is right now. `missing` is only ever a *confirmed* absence (the OS reported
 * "no such file or directory"); a scope refusal, a permission error, a file where the folder should
 * be, or an unreadable folder are all `unavailable` — a different problem that must not be mistaken
 * for a deleted or moved folder.
 */
export type SpaceFolderStatus = 'available' | 'missing' | 'unavailable';

/** Rust's `std::io::ErrorKind::NotFound`, as the fs plugin serializes it (`ENOENT`, errno 2). */
export function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No such file or directory|\(os error 2\)|os error 3\b/i.test(message);
}

/**
 * Whether `path` is an existing, readable directory the app may open as a Space.
 * Read-only: nothing is created or written (unlike `Application.bootstrap`, which
 * starts an empty vault at a missing root). Never throws.
 * The web runtime has no real folders (its vault is in-memory), so it answers `available`.
 *
 * `stat` is used rather than `exists`: the plugin's `exists` is `Path::exists()`, which is `false`
 * for every error (permission denied included), so it cannot tell a missing folder from a locked one.
 */
export async function probeSpaceFolder(path: string): Promise<SpaceFolderStatus> {
  if (!isTauri()) {
    return 'available';
  }

  try {
    const info = await stat(path);
    if (!info.isDirectory) {
      return 'unavailable';
    }
    await readDir(path);
    return 'available';
  } catch (error) {
    return isNotFoundError(error) ? 'missing' : 'unavailable';
  }
}

/**
 * Whether `path` is *confirmed* gone: a bare `stat` (no directory listing, so cheap enough to run
 * on window focus) whose only "yes" is the OS reporting the path does not exist. A permission or
 * scope failure, or any other I/O error, is `false` — not evidence the folder is missing.
 * The web runtime has no real folders, so it is always `false`.
 */
export async function isFolderConfirmedMissing(path: string): Promise<boolean> {
  if (!isTauri()) {
    return false;
  }

  try {
    await stat(path);
    return false;
  } catch (error) {
    return isNotFoundError(error);
  }
}
