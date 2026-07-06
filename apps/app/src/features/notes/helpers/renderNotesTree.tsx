// React
import { Fragment } from 'react/jsx-runtime';
// Components
import { Folder } from '../components/Folder';
import { Note } from '../components/Note';
// Models
import type { Folder as FolderModels } from '../models/Folder';
import type { Note as NoteModels } from '../models/Note';
// Helpers
import { getChildFolders } from '../folder/getChildFolders';
import { getChildNotes } from '../folder/getChildNotes';

interface RenderEntryTreeProps {
  folders: FolderModels[];
  notes: NoteModels[];
  // The folder whose children we're currently rendering.
  // null means "start from the root".
  parentId: string | null;
  // Used to indent nested folders.
  level: number;
}

export function renderNotesTree({
  folders,
  notes,
  parentId,
  level,
}: RenderEntryTreeProps) {
  // Get all folders that belong to the current parent.
  const rootFolders = getChildFolders(folders, parentId);

  // Render every child folder.
  return rootFolders.map((folder) => {
    // Get the notes that belong to this folder.
    const childNotes = getChildNotes(notes, folder.id);
    const subFolders = getChildFolders(folders, folder.id);
    // Checks if the folder is empty
    const isEmpty = subFolders.length === 0 && childNotes.length === 0;

    return (
      <Fragment key={folder.id}>
        {/* Render the current folder */}
        <Folder title={folder.title} level={level} isEmpty={isEmpty} />
        {/* Render all notes inside this folder */}
        {childNotes.map((note) => (
          <Note key={note.id} title={note.title} level={level + 1} />
        ))}
        {/* Render this folder's child folders.
            This is the recursive call.
            Every child folder repeats this exact process. */}
        {renderNotesTree({
          folders,
          notes,
          parentId: folder.id,
          level: level + 1,
        })}
      </Fragment>
    );
  });
}
