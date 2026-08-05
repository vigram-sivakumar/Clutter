import type { Folder } from '../models/Folder';
import type { Page } from '../models/Page';
import type { Vault } from '../models/Vault';

import { RESERVED_FOLDER_NAMES } from '../initialize/ReservedResources';

// Vault.foldersById (a Map) iterates in insertion order, which reflects
// startup scan order for scanned folders and creation order for anything
// added mid-session (Vault.addFolder always appends) — neither is a
// meaningful display order. VaultQuery is the one place order is defined,
// applied uniformly regardless of how or when a folder entered the Vault.
//
// 'title' is today's only mode — the prior alphabetical behavior, now
// named and swappable rather than inlined, so a future mode (e.g. a
// planned "Type: folders first, then notes" mode, driven by a Sort
// control) is an additive entry here plus a new FolderSortMode member,
// not a rewrite of these methods. Which mode is active is caller-owned
// (eventually Workspace, as user-facing view state) — VaultQuery only
// owns how each named mode compares two folders.
export type FolderSortMode = 'title';

const FOLDER_SORT_COMPARATORS: Record<
  FolderSortMode,
  (a: Folder, b: Folder) => number
> = {
  title: (a, b) => a.name.localeCompare(b.name),
};

function sortFolders(folders: Folder[], sortMode: FolderSortMode): Folder[] {
  return folders.sort(FOLDER_SORT_COMPARATORS[sortMode]);
}

export class VaultQuery {
  constructor(private readonly vault: Vault) {}

  public getRootFolders(sortMode: FolderSortMode = 'title'): Folder[] {
    return sortFolders(
      Array.from(this.vault.folders()).filter(
        (folder) => folder.parentId === null
      ),
      sortMode
    );
  }

  public getChildFolders(
    parentId: string,
    sortMode: FolderSortMode = 'title'
  ): Folder[] {
    return sortFolders(
      Array.from(this.vault.folders()).filter(
        (folder) => folder.parentId === parentId
      ),
      sortMode
    );
  }

  public getChildPages(parentId: string): Page[] {
    return Array.from(this.vault.pages()).filter(
      (page) => page.parentId === parentId
    );
  }

  // Deliberately unsorted, mirroring getChildPages exactly — page
  // ordering (root and nested alike) is an unresolved product decision,
  // not something to define one entity-location at a time. See
  // getChildPages' own lack of a sort for the same reasoning. When
  // ordering is defined, it should apply to both together, likely
  // through the same upcoming sort-menu mechanism, not added here first.
  public getRootPages(): Page[] {
    return Array.from(this.vault.pages()).filter(
      (page) => page.parentId === null
    );
  }

  public getFavoriteFolders(): Folder[] {
    return Array.from(this.vault.folders()).filter(
      (folder) => folder.metadata.favorite
    );
  }

  public getFavoritePages(): Page[] {
    return Array.from(this.vault.pages()).filter(
      (page) => page.metadata.favorite && page.metadata.status !== 'archived'
    );
  }

  public getArchivedPages(): Page[] {
    return Array.from(this.vault.pages()).filter(
      (page) => page.metadata.status === 'archived'
    );
  }

  // Exact match against the tag's stored (as-typed) name — a tag
  // collection view is always opened from a known Tag (e.g. a sidebar
  // click), so the caller already has the exact casing tags() preserves.
  public getPagesByTag(name: string): Page[] {
    return Array.from(this.vault.pages()).filter((page) =>
      page.analysis.tags.some((occurrence) => occurrence.name === name)
    );
  }
  public getVisibleRootFolders(sortMode: FolderSortMode = 'title'): Folder[] {
    return this.getRootFolders(sortMode).filter(
      (folder) => !RESERVED_FOLDER_NAMES.has(folder.name)
    );
  }
}
