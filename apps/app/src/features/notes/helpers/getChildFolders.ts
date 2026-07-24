import type { Folder } from '@core/vault/models';

export function getChildFolders(folders: Folder[], parentId: string | null) {
  return folders.filter((folder) => folder.parentId === parentId);
}
