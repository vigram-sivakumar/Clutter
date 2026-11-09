import type { Folder } from '@core/vault/models/Folder';
import type { VaultResource } from '@core/vault/models/VaultResource';

/**
 * What a `[[wiki link]]` can name besides a note: a folder or an asset file. The one definition of how
 * such a target is read, shared by the editor's resolver and the link resolver behind the graph, so a
 * link means the same thing in both. Notes are tried first by both callers; this only runs when no note
 * (by path or alias) matches.
 *
 * - `[[Projects/]]` — a trailing slash names a folder, explicitly (and only a folder).
 * - `[[Assets/hero.png]]` — an asset is its vault-relative path with its real extension, the same
 *   spelling a `![[…]]` embed uses; no alias or filename search.
 * - `[[Projects]]` — a bare name falls back to the folder at that path, after notes and aliases.
 * - `[[Inbox/]]`, `[[Templates/]]`, `[[Archive/]]`, `[[Assets/]]` — resolve even with no directory (see
 *   `LINKABLE_SYSTEM_FOLDERS`), after an existing folder.
 *
 * Read-only: nothing here creates, opens or changes anything.
 */
export type NonPageLinkTarget =
  | { readonly kind: 'folder'; readonly folder: Folder }
  | { readonly kind: 'asset'; readonly resource: VaultResource }
  | { readonly kind: 'system-folder'; readonly id: LinkableSystemFolderId; readonly name: string };

/**
 * The four top-level system locations a link or suggestion can always name, whether or not their directory exists
 * yet (Inbox, Templates and Archive are created lazily, and Assets is the Assets collection). An explicit allowlist,
 * deliberately not derived from `RESERVED_FOLDER_IDS`: Daily Notes and `.clutter` must stay out of it even if that
 * table changes. A test pins each name to the definition it stands for.
 */
export const LINKABLE_SYSTEM_FOLDERS = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'templates', name: 'Templates' },
  { id: 'archive', name: 'Archive' },
  { id: 'assets', name: 'Assets' },
] as const;

export type LinkableSystemFolderId = (typeof LINKABLE_SYSTEM_FOLDERS)[number]['id'];

/** The system location a top-level path names exactly (`Inbox`), if it is one of the four. */
export function linkableSystemFolderForPath(path: string): (typeof LINKABLE_SYSTEM_FOLDERS)[number] | undefined {
  return LINKABLE_SYSTEM_FOLDERS.find((entry) => entry.name === path);
}

/** The part of the Vault a target is looked up in — `Vault` itself satisfies it. */
export interface NonPageLinkTargetSource {
  readonly root: string;
  getFolderByPath(path: string): Folder | undefined;
  getResourceByPath(path: string): VaultResource | undefined;
}

/** Whether `target` is written as a folder link (`Projects/`). */
export function isFolderLinkSyntax(target: string): boolean {
  return target.trim().endsWith('/');
}

/** A folder link's vault-relative path without its trailing slash(es): `Projects/` → `Projects`. */
export function folderLinkPath(target: string): string {
  return target.trim().replace(/\/+$/, '');
}

export function resolveNonPageLinkTarget(
  source: NonPageLinkTargetSource,
  target: string
): NonPageLinkTarget | undefined {
  const explicitFolder = isFolderLinkSyntax(target);
  const path = explicitFolder ? folderLinkPath(target) : target.trim();

  if (path === '') {
    return undefined;
  }

  const absolute = `${source.root}/${path}`;

  if (!explicitFolder) {
    const resource = source.getResourceByPath(absolute);

    if (resource) {
      return { kind: 'asset', resource };
    }
  }

  const folder = source.getFolderByPath(absolute);

  if (folder) {
    return { kind: 'folder', folder };
  }

  // Last: a system location whose directory does not exist (yet). Read-only; nothing is created by resolving it.
  const system = linkableSystemFolderForPath(path);

  return system ? { kind: 'system-folder', id: system.id, name: system.name } : undefined;
}
