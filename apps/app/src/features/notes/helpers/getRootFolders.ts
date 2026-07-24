import type { Folder } from '@core/vault/models';

export function getRootFolders(folders: Folder[]): Folder[] {
  return folders.filter((folder) => folder.parentId === null);
}
