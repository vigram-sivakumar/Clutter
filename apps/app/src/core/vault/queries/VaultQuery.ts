import type { Folder } from '../models/Folder';
import type { Page } from '../models/Page';
import type { Vault } from '../models/Vault';

import { RESERVED_FOLDER_NAMES } from '../initialize/ReservedResources';

export class VaultQuery {
  constructor(private readonly vault: Vault) {}

  public getRootFolders(): Folder[] {
    return Array.from(this.vault.folders()).filter(
      (folder) => folder.parentId === null
    );
  }

  public getChildFolders(parentId: string): Folder[] {
    return Array.from(this.vault.folders()).filter(
      (folder) => folder.parentId === parentId
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
  public getVisibleRootFolders(): Folder[] {
    return this.getRootFolders().filter(
      (folder) => !RESERVED_FOLDER_NAMES.has(folder.name)
    );
  }
}
