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
 *
 * Read-only: nothing here creates, opens or changes anything.
 */
export type NonPageLinkTarget =
  | { readonly kind: 'folder'; readonly folder: Folder }
  | { readonly kind: 'asset'; readonly resource: VaultResource };

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

  return folder ? { kind: 'folder', folder } : undefined;
}
