import { invoke } from '@tauri-apps/api/core';
import { documentDir, homeDir } from '@tauri-apps/api/path';
import { mkdir } from '@tauri-apps/plugin-fs';

import { VaultPath } from '../ingest/VaultPath';
import { isValidSpaceFolderName } from '../ingest/spaceFolderName';

/** The folder new Spaces are created in, resolved from the current user's real home — never hardcoded. */
export interface SpaceParent {
  readonly path: string;
  /** Display name, e.g. "Documents". */
  readonly name: string;
}

export type CreateSpaceFolderResult =
  { readonly path: string } | { readonly error: string };

function withoutTrailingSlashes(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** `~/Documents` for whoever is running the app. */
export async function resolveSpaceParent(): Promise<SpaceParent> {
  const path = withoutTrailingSlashes(await documentDir());
  return { path, name: VaultPath.filename(path) || path };
}

/**
 * Whether `path` is too broad to be a Space: the disk root, the user's home folder, or a folder that
 * contains the home folder (`/Users`). Opening one would scan, and write `.clutter` into, everything
 * under it — Library, Desktop, other users' data. This is the only location rule: any other folder the
 * user can pick (Documents, a projects folder, an external drive) is allowed.
 */
export async function isTooBroadForSpace(path: string): Promise<boolean> {
  const candidate = withoutTrailingSlashes(path);
  const home = withoutTrailingSlashes(await homeDir());
  return (
    candidate === '/' ||
    candidate === home ||
    VaultPath.isDescendantOf(home, candidate)
  );
}

function describeFolderFailure(
  error: unknown,
  parentName: string,
  action: 'create' | 'rename'
): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/File exists|already exists|\(os error 17\)/i.test(message)) {
    return 'A folder with that name already exists. Choose another name';
  }
  if (/forbidden path/i.test(message)) {
    return action === 'create'
      ? `Clutter isn’t allowed to create folders in ${parentName}`
      : 'Clutter isn’t allowed to rename that folder';
  }
  if (
    /Permission denied|Operation not permitted|\(os error 13\)|\(os error 1\)/i.test(
      message
    )
  ) {
    const what = action === 'create' ? 'create a folder' : 'rename a folder';
    return `Clutter doesn’t have permission to ${what} in ${parentName}. Check System Settings → Privacy & Security → Files and Folders`;
  }
  if (/No such file or directory|\(os error 2\)/i.test(message)) {
    return action === 'create'
      ? `The ${parentName} folder could not be found`
      : 'That folder could not be found';
  }
  return `Couldn’t ${action} the folder: ${message}`;
}

/**
 * Explicitly creates `<Documents>/<name>` for a new Space — the only place a Space folder is
 * created, and only ever from the user's Create action (opening a vault never creates its root).
 *
 * The name is validated and the result must be a direct child of Documents. The folder is made
 * non-recursively, so `mkdir` itself refuses (rather than adopts or overwrites) a name that is
 * already taken, with no check-then-create race; Documents is never created as a side effect.
 */
export async function createSpaceFolder(
  name: string
): Promise<CreateSpaceFolderResult> {
  if (!isValidSpaceFolderName(name)) {
    return { error: 'Enter a name without slashes or colons' };
  }

  const parent = await resolveSpaceParent();
  const path = `${parent.path}/${name.trim()}`;
  if (VaultPath.parentDirectory(path) !== parent.path) {
    return { error: 'Enter a name without slashes or colons' };
  }

  try {
    await mkdir(path, { recursive: false });
    return { path };
  } catch (error) {
    console.error('Creating the space folder failed:', error);
    return { error: describeFolderFailure(error, parent.name, 'create') };
  }
}

/**
 * Renames a Space's folder to `newName`, in place — the only place a Space folder is renamed, and only ever from
 * the user's Create in the settings dialog (ADR-056, "renaming a Space's folder"). Wherever the folder lives:
 * it is the folder's own access that authorizes it (the Rust command checks the fs scope — `$HOME/**` or the
 * picker's grant — and moves that grant to the new path), so there is no location rule. Never overwrites an
 * existing folder, and never moves one: the destination is `<same parent>/<name>`. An operating-system refusal
 * (permission, read-only volume) comes back as its own message and leaves the folder as it was.
 */
export async function renameSpaceFolder(
  path: string,
  newName: string
): Promise<CreateSpaceFolderResult> {
  if (!isValidSpaceFolderName(newName)) {
    return { error: 'Enter a name without slashes or colons' };
  }

  const parentName =
    VaultPath.filename(VaultPath.parentDirectory(path)) || 'its folder';
  try {
    return {
      path: await invoke<string>('rename_space_folder', {
        path,
        newName: newName.trim(),
      }),
    };
  } catch (error) {
    console.error('Renaming the space folder failed:', error);
    return { error: describeFolderFailure(error, parentName, 'rename') };
  }
}
