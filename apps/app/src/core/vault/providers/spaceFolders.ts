import { invoke } from '@tauri-apps/api/core';
import { documentDir, homeDir } from '@tauri-apps/api/path';

import { VaultPath } from '../ingest/VaultPath';
import { DOCUMENTS_ACCESS_NEEDED, requestDocumentsAccess, sandboxInfo } from './sandboxAccess';
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
  // Inside the App Sandbox the platform's Documents is the app's container; the user's is named by its real path.
  const info = await sandboxInfo();
  const path = withoutTrailingSlashes(info?.sandboxed ? info.documents : await documentDir());
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
  // Inside the App Sandbox `homeDir()` is the container: the home to protect is the user's real one.
  const info = await sandboxInfo();
  const home = withoutTrailingSlashes(info?.sandboxed && info.realHome ? info.realHome : await homeDir());
  return (
    candidate === '/' ||
    candidate === home ||
    VaultPath.isDescendantOf(home, candidate)
  );
}

/** What a taken folder name is reported as: SpaceDetails shows it with the name field, not with the other failures. */
export const FOLDER_EXISTS_MESSAGE = 'Folder already exists';

/** What a rename macOS refuses for permission is reported as: SpaceDetails shows it with the name field, like a taken name. */
export const RENAME_REFUSED_MESSAGE = 'Unable to rename. Rename it in Finder instead';

/**
 * What a create macOS refuses for permission is reported as: SpaceDetails shows it with the Location card (the folder
 * is where the Space would go). Sandboxed, pressing Create again asks for Documents access again; unsandboxed, macOS
 * asks only once, so the user has to allow it in System Settings.
 */
export const CREATE_REFUSED_SANDBOXED_MESSAGE = 'Unable to create folder. Try again';
export const CREATE_REFUSED_MESSAGE =
  'Unable to create folder. Allow access in Settings → Privacy & Security → Files and Folders and try again';

function describeFolderFailure(
  error: unknown,
  parentName: string,
  action: 'create' | 'rename',
  sandboxed = false
): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/File exists|already exists|\(os error 17\)/i.test(message)) {
    return FOLDER_EXISTS_MESSAGE;
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
    // macOS withholds the right to rename a picked folder outside Documents from a sandboxed app, and no Settings
    // switch grants it, so a rename refusal points at Finder rather than at Privacy & Security.
    if (action === 'rename') return RENAME_REFUSED_MESSAGE;
    return sandboxed ? CREATE_REFUSED_SANDBOXED_MESSAGE : CREATE_REFUSED_MESSAGE;
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
 * The backend does it: it validates the name again, makes the folder non-recursively (so a name that
 * is already taken is refused rather than adopted or overwritten, with no check-then-create race;
 * Documents is never created as a side effect) and grants exactly that folder to the filesystem scope
 * the native commands check, the same grant the folder picker makes, which the persisted-scope plugin
 * restores after a restart. Creating and granting are one operation, so a Space is never left created
 * but unusable (a created folder with no grant could not be renamed, moved into, or written by the
 * native commands).
 */
export async function createSpaceFolder(
  name: string
): Promise<CreateSpaceFolderResult> {
  if (!isValidSpaceFolderName(name)) {
    return { error: 'Enter a name without slashes or colons' };
  }

  const parent = await resolveSpaceParent();

  const create = () => invoke<string>('create_space_folder', { name: name.trim() });
  try {
    try {
      return { path: await create() };
    } catch (error) {
      if (!isDocumentsAccessNeeded(error)) throw error;
      // Inside the App Sandbox the user authorizes Documents once, here, at the first Create. Nothing has been
      // created yet; cancelling leaves it that way (not even a folder in the app's own container).
      const granted = await requestDocumentsAccess();
      if (granted !== 'granted') return { error: DOCUMENTS_ACCESS_REQUIRED_MESSAGE };
      return { path: await create() };
    }
  } catch (error) {
    console.error('Creating the space folder failed:', error);
    const sandboxed = (await sandboxInfo())?.sandboxed ?? false;
    return { error: describeFolderFailure(error, parent.name, 'create', sandboxed) };
  }
}

/**
 * What cancelling the Documents panel, or choosing another folder in it, is reported as (one message for both: either
 * way Documents is still not authorized). SpaceDetails shows it with the Location card; Create asks again.
 */
export const DOCUMENTS_ACCESS_REQUIRED_MESSAGE = 'Clutter needs access to Documents to create this Space';

function isDocumentsAccessNeeded(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes(DOCUMENTS_ACCESS_NEEDED);
}

/**
 * Whether `path` is reached through a symbolic link (its real path differs from it). A Space like that is refused when
 * it is added: the filesystem watcher reports resolved paths, so such a Space would silently never see a change made
 * outside the app. Anything that cannot be resolved is not refused here (opening reports its own problem).
 */
export async function isReachedThroughLink(path: string): Promise<boolean> {
  try {
    const resolved = await invoke<string>('canonical_space_path', { path });
    if (typeof resolved !== 'string') return false;
    const normalize = (value: string) => withoutTrailingSlashes(value).normalize('NFC').toLowerCase();

    return normalize(resolved) !== normalize(path);
  } catch {
    return false;
  }
}

/**
 * Whether Clutter can save safely to the volume a folder is on. Atomic saves are supported on APFS only
 * (ADR-063), and the native writer refuses every other volume at the first save; this asks the same question, with
 * the same list, before the folder becomes a Space, so the user is told when choosing, not when the first edit is
 * refused.
 *
 * - `supported`: APFS.
 * - `unsupported`: any other volume. `filesystem` is the system's name for it (`exfat`, `msdos`, `hfs`, `smbfs`…).
 * - `unknown`: the check itself failed (an unreadable folder, a build without the native writer, an answer that is
 *   not one of the two above). A folder that cannot be judged is never treated as supported.
 */
export type SpaceFilesystemSupport =
  | { readonly status: 'supported'; readonly filesystem: string }
  | { readonly status: 'unsupported'; readonly filesystem: string }
  | { readonly status: 'unknown' };

/** Classifies the volume of `path` through the native writer's own volume check. Never throws. */
export async function checkSpaceFilesystem(path: string): Promise<SpaceFilesystemSupport> {
  try {
    const answer = await invoke<unknown>('check_space_filesystem', { path });
    if (typeof answer === 'object' && answer !== null) {
      const { status, filesystem } = answer as { status?: unknown; filesystem?: unknown };
      if ((status === 'supported' || status === 'unsupported') && typeof filesystem === 'string') {
        return { status, filesystem };
      }
    }
  } catch (error) {
    console.error('Checking the space folder’s volume failed:', error);
  }

  return { status: 'unknown' };
}

/**
 * An existing Space was refused when it was opened, because Clutter cannot show that its folder can be saved to
 * safely: the volume is not APFS (`unsupported`), or the volume could not be classified at all (`unchecked`).
 * The Space is not opened in any reduced mode: nothing in Clutter reliably disables every mutation path, so a
 * "read-only" Space would be a claim the code cannot back. The Space stays registered and untouched.
 */
export class SpaceFilesystemRefusedError extends Error {
  readonly name = 'SpaceFilesystemRefusedError';

  constructor(
    readonly kind: 'unsupported' | 'unchecked',
    message: string
  ) {
    super(message);
  }
}

/** The message for an already-registered Space whose folder is on a volume Clutter cannot save to safely. */
export function unsupportedOpenedSpaceMessage(filesystem: string): string {
  return `This space’s folder is on ${describeFilesystem(filesystem)}, and Clutter can only save safely to APFS drives, so it wasn’t opened. Move the folder to your Mac’s own drive or an APFS drive, then choose it again`;
}

/** The message for an already-registered Space whose folder's volume could not be classified. */
export const UNCHECKED_OPENED_SPACE_MESSAGE =
  'Clutter couldn’t check whether it can save safely to this space’s folder, so it wasn’t opened. Make sure its drive is connected, or choose the folder again';

/**
 * Classifies the volume of a Space that is being opened or restored (not only when it is first chosen: the drive
 * behind a saved path can be swapped, reformatted or remounted since). Resolves only for APFS; otherwise throws a
 * `SpaceFilesystemRefusedError`. A classification that fails is a refusal, never a pass.
 *
 * The caller decides what a *confirmed missing* folder means (it has its own recovery flow) and must not call this
 * for one: a missing folder cannot be classified and would be misreported here as unchecked.
 */
export async function assertSpaceFilesystemSupported(path: string): Promise<void> {
  const support = await checkSpaceFilesystem(path);
  if (support.status === 'supported') return;
  if (support.status === 'unsupported') {
    throw new SpaceFilesystemRefusedError('unsupported', unsupportedOpenedSpaceMessage(support.filesystem));
  }
  throw new SpaceFilesystemRefusedError('unchecked', UNCHECKED_OPENED_SPACE_MESSAGE);
}

/** What the user knows a volume type as, as a phrase that follows "on": the system's own name when there is no better one. */
export function describeFilesystem(filesystem: string): string {
  switch (filesystem) {
    case 'exfat':
      return 'an exFAT drive';
    case 'msdos':
      return 'a FAT drive';
    case 'hfs':
      return 'a Mac OS Extended (HFS+) drive';
    case 'ntfs':
      return 'an NTFS drive';
    case 'smbfs':
      return 'a network share (SMB)';
    case 'nfs':
      return 'a network share (NFS)';
    case 'afpfs':
      return 'a network share (AFP)';
    case 'webdav':
      return 'a network share (WebDAV)';
    case '':
      return 'a drive in an unrecognized format';
    default:
      return `a drive formatted as ${filesystem}`;
  }
}

/**
 * Gives a Space that was created before `create_space_folder` existed its runtime filesystem grant, when it is
 * opened. Those Spaces were made with a plain `mkdir`, so only the fs plugin's static scope reached them. The
 * backend grants nothing but a marked direct child of Documents (a Space picked in the folder dialog already has its
 * grant, restored at launch), and never throws here: a Space that cannot be granted opens exactly as it did.
 */
export async function ensureSpaceAccess(path: string): Promise<void> {
  try {
    await invoke<boolean>('ensure_space_access', { path });
  } catch (error) {
    console.error('Restoring access to the space folder failed:', error);
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
