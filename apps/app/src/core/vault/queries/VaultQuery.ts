import type { Folder } from '../models/Folder';
import type { Page } from '../models/Page';
import type { Vault } from '../models/Vault';
import type { FavoriteEntry } from '@features/notes/models/FavoriteEntry';

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
      (page) =>
        page.parentId === parentId && page.metadata.status !== 'archived'
    );
  }

  public getFavorites(): FavoriteEntry[] {
    const favoriteFolders = Array.from(this.vault.folders())
      .filter((folder) => folder.metadata.favorite)
      .map((folder) => ({
        id: folder.id,
        title: folder.name,
        type: 'folder' as const,
      }));

    const favoritePages = Array.from(this.vault.pages())
      .filter(
        (page) => page.metadata.favorite && page.metadata.status !== 'archived'
      )
      .map((page) => ({
        id: page.id,
        title: page.name,
        type: 'note' as const,
      }));

    return [...favoriteFolders, ...favoritePages];
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
