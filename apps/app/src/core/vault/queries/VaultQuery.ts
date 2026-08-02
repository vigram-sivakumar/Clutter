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
  public getVisibleRootFolders(sortMode: FolderSortMode = 'title'): Folder[] {
    return this.getRootFolders(sortMode).filter(
      (folder) => !RESERVED_FOLDER_NAMES.has(folder.name)
    );
  }
}
