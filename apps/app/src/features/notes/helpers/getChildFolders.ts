import { Folder } from '../models/Folder';

export function getChildFolders(folders: Folder[], parentId: string | null) {
  return folders.filter((folder) => folder.parentId === parentId);
}
