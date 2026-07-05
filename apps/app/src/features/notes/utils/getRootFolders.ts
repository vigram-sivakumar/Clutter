import { Folder } from '../models/Folder';

export function getRootFolders(folders: Folder[]): Folder[] {
  return folders.filter((folder) => folder.parentId === null);
}
