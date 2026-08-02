import type { Folder } from '../models/Folder';
import type { Page } from '../models/Page';
import type { Vault } from '../models/Vault';

import { RESERVED_FOLDER_NAMES } from '../initialize/ReservedResources';

// Vault.foldersById (a Map) iterates in insertion order, which reflects
// startup scan order for scanned folders and creation order for anything
// added mid-session (Vault.addFolder always appends) — neither is a
// meaningful display order. This is the one place that order is defined,
// applied uniformly regardless of how or when a folder entered the Vault,
// so a folder created this session sorts identically to how it will after
// the next restart.
function compareFoldersByName(a: Folder, b: Folder): number {
  return a.name.localeCompare(b.name);
}

export class VaultQuery {
  constructor(private readonly vault: Vault) {}

  public getRootFolders(): Folder[] {
    return Array.from(this.vault.folders())
      .filter((folder) => folder.parentId === null)
      .sort(compareFoldersByName);
  }

  public getChildFolders(parentId: string): Folder[] {
    return Array.from(this.vault.folders())
      .filter((folder) => folder.parentId === parentId)
      .sort(compareFoldersByName);
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
  public getVisibleRootFolders(): Folder[] {
    return this.getRootFolders().filter(
      (folder) => !RESERVED_FOLDER_NAMES.has(folder.name)
    );
  }
}
