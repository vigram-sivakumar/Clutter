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

export type CreateSpaceFolderResult = { readonly path: string } | { readonly error: string };

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
  return candidate === '/' || candidate === home || VaultPath.isDescendantOf(home, candidate);
}

function describeCreateFailure(error: unknown, parentName: string): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/File exists|already exists|\(os error 17\)/i.test(message)) {
    return 'A folder with that name already exists. Choose another name.';
  }
  if (/forbidden path/i.test(message)) {
    return `Clutter isn't allowed to create folders in ${parentName}.`;
  }
  if (/Permission denied|Operation not permitted|\(os error 13\)|\(os error 1\)/i.test(message)) {
    return `Clutter doesn't have permission to create a folder in ${parentName}. Check System Settings → Privacy & Security → Files and Folders.`;
  }
  if (/No such file or directory|\(os error 2\)/i.test(message)) {
    return `The ${parentName} folder could not be found.`;
  }
  return `Couldn't create the folder: ${message}`;
}

/**
 * Explicitly creates `<Documents>/<name>` for a new Space — the only place a Space folder is
 * created, and only ever from the user's Create action (opening a vault never creates its root).
 *
 * The name is validated and the result must be a direct child of Documents. The folder is made
 * non-recursively, so `mkdir` itself refuses (rather than adopts or overwrites) a name that is
 * already taken, with no check-then-create race; Documents is never created as a side effect.
 */
export async function createSpaceFolder(name: string): Promise<CreateSpaceFolderResult> {
  if (!isValidSpaceFolderName(name)) {
    return { error: 'Enter a name without slashes or colons.' };
  }

  const parent = await resolveSpaceParent();
  const path = `${parent.path}/${name.trim()}`;
  if (VaultPath.parentDirectory(path) !== parent.path) {
    return { error: 'Enter a name without slashes or colons.' };
  }

  try {
    await mkdir(path, { recursive: false });
    return { path };
  } catch (error) {
    console.error('Creating the space folder failed:', error);
    return { error: describeCreateFailure(error, parent.name) };
  }
}
