import { Folder } from '../models/Folder';
import { Note } from '../models/Note';
import { EntryItem } from '../models/EntryItem';

import { getChildFolders } from './getChildFolders';
import { getChildNotes } from './getChildNotes';

export function getChildEntries(
  folders: Folder[],
  notes: Note[],
  parentId: string | null
): EntryItem[] {
  const childFolders = getChildFolders(folders, parentId);
  const childNotes = getChildNotes(notes, parentId);

  return [...childFolders, ...childNotes];
}
