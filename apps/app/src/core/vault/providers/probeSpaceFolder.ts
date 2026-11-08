import { isTauri } from '@tauri-apps/api/core';
import { readDir, stat } from '@tauri-apps/plugin-fs';

import { needsFolderReselected } from './sandboxAccess';
import { isOutsideApprovedScope } from './spaceFolders';

/**
 * What a Space folder is right now. `missing` is a *confirmed* absence (the OS reported
 * "no such file or directory"), or a folder that exists but whose access the user has to give again: the App Sandbox
 * could not restore its saved access, or the native runtime filesystem scope holds no grant for it and none can be
 * restored (see `isOutsideApprovedScope`). Both are presented as a Space whose folder has to be selected again, and
 * `Application.bootstrap` tells them apart from a deleted folder. A scope refusal from the fs plugin, a permission
 * error, a file where the folder should be, or an unreadable folder are all `unavailable` — a different problem that must not be mistaken
 * for a deleted or moved folder.
 */
export type SpaceFolderStatus = 'available' | 'missing' | 'unavailable';

/** Rust's `std::io::ErrorKind::NotFound`, as the fs plugin serializes it (`ENOENT`, errno 2). */
export function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No such file or directory|\(os error 2\)|os error 3\b/i.test(message);
}

/** Rust's `std::io::ErrorKind::AlreadyExists`, as the fs plugin serializes it (`EEXIST`, errno 17). */
export function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /File exists|already exists|\(os error 17\)|EEXIST/i.test(message);
}

export interface ProbeOptions {
  /**
   * Whether the folder must also be one the app can open (default). `false` asks only whether a readable directory
   * exists there, for a caller that is checking a *name* and will never open the folder (a rename's destination).
   */
  readonly requireAccess?: boolean;
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
export async function probeSpaceFolder(
  path: string,
  options: ProbeOptions = {}
): Promise<SpaceFolderStatus> {
  if (!isTauri()) {
    return 'available';
  }
  const requireAccess = options.requireAccess ?? true;

  // App Sandbox only: the folder exists but the access the user gave for it could not be restored. It is presented
  // as the Space whose folder has to be selected again, never opened from a different place.
  if (requireAccess && needsFolderReselected(path)) {
    return 'missing';
  }

  try {
    const info = await stat(path);
    if (!info.isDirectory) {
      return 'unavailable';
    }
    await readDir(path);
  } catch (error) {
    return isNotFoundError(error) ? 'missing' : 'unavailable';
  }

  // The plugin's `stat` and `readDir` above also pass through the static `$HOME/**` capability, which the native
  // commands never consult: they answer only for folders in the runtime scope the user's own choices built. A folder
  // the probe calls available must be one the open will accept, so the same grant (and the same recovery) is asked
  // for here. Authorization is not inferred from the folder being inside `$HOME`.
  if (requireAccess && (await isOutsideApprovedScope(path))) {
    return 'missing';
  }
  return 'available';
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
