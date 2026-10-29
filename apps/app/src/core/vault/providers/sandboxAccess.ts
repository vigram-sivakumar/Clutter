import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * Access to the user's real folders inside the macOS App Sandbox. Every packaged Clutter is sandboxed (the entitlements
 * are in `tauri.conf.json`), whether built locally or from the Mac App Store, and behaves the same; none of this depends
 * on a distribution flag. The native side (src-tauri/src/space_access.rs) owns the bookmarks, and this is the one place
 * the frontend talks to it. When the process is not sandboxed (a plain `npm run tauri dev`) the calls here are no-ops
 * or report `sandboxed: false`, because the whole home folder is available; `npm run dev:sandbox` runs development
 * sandboxed to exercise the real thing.
 *
 * Inside the sandbox `$HOME` and `Documents` resolve to the app's container, so the *real* Documents folder has to be
 * named by its real path and authorized by the user once; and a folder the user picks is only reachable until the
 * app quits unless access is saved when it is picked and restored at launch.
 */
export interface SandboxInfo {
  readonly sandboxed: boolean;
  /** The account's real home folder (not the container). Only reported inside the sandbox. */
  readonly realHome: string | null;
  /** The folder new Spaces are created in. */
  readonly documents: string;
}

export interface RestoredAccess {
  readonly path: string;
  readonly status: 'restored' | 'refreshed' | 'needsReselect';
}

export type DocumentsAccessResult = 'granted' | 'cancelled' | 'wrongFolder';

/** The native commands report this when the Documents folder has not been authorized yet. */
export const DOCUMENTS_ACCESS_NEEDED = 'documentsAccessNeeded';

let infoPromise: Promise<SandboxInfo | null> | null = null;
let needsReselect: ReadonlySet<string> = new Set();

function withoutTrailingSlashes(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') : path;
}

/** What the native side says about the sandbox, or `null` when it cannot say (the web runtime, a failed call). */
export function sandboxInfo(): Promise<SandboxInfo | null> {
  if (!isTauri()) return Promise.resolve(null);
  infoPromise ??= (async () => {
    try {
      const info = await invoke<SandboxInfo | undefined>('sandbox_info');
      return info && typeof info.documents === 'string' ? info : null;
    } catch (error) {
      console.error('Reading the sandbox state failed:', error);
      return null;
    }
  })();
  return infoPromise;
}

/**
 * Starts access to every folder the user authorized in an earlier run, before any Space is opened. Never throws: a
 * failure leaves each Space to report its own problem. The folders that could not be restored are remembered so the
 * Space is presented as needing its folder selected again, never silently moved.
 */
export async function restoreSpaceAccess(): Promise<readonly RestoredAccess[]> {
  if (!isTauri()) return [];
  try {
    const restored = await invoke<RestoredAccess[] | undefined>('restore_space_access');
    const list = Array.isArray(restored) ? restored : [];
    needsReselect = new Set(
      list.filter((entry) => entry.status === 'needsReselect').map((entry) => withoutTrailingSlashes(entry.path))
    );
    return list;
  } catch (error) {
    console.error('Restoring access to the spaces failed:', error);
    return [];
  }
}

/**
 * Whether this Space's saved access could not be restored, so the user has to select its folder again: its own saved
 * access, or that of a folder it lives in (a Space inside Documents when Documents' access could not be restored).
 */
export function needsFolderReselected(path: string): boolean {
  const candidate = withoutTrailingSlashes(path);
  for (const folder of needsReselect) {
    if (candidate === folder || candidate.startsWith(`${folder}/`)) return true;
  }
  return false;
}

/**
 * Saves access to a folder the user has just picked so it opens again after a restart. Rejects when the folder's
 * access could not be saved (inside the sandbox only): the caller must not accept a Space that would work today and
 * silently fail after the next launch.
 */
export async function rememberSpaceAccess(path: string): Promise<void> {
  if (!isTauri()) return;
  await invoke<boolean>('remember_space_access', { path });
  needsReselect = new Set([...needsReselect].filter((entry) => entry !== withoutTrailingSlashes(path)));
}

/** Asks the user, once, to authorize the real Documents folder. Creates nothing. */
export async function requestDocumentsAccess(): Promise<DocumentsAccessResult> {
  const result = await invoke<DocumentsAccessResult>('request_documents_access');
  return result;
}

/** Test seam: forget what was learned in this run. */
export function resetSandboxAccessForTests(): void {
  infoPromise = null;
  needsReselect = new Set();
}
