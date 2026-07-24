// React
import { Fragment } from 'react/jsx-runtime';
// Components
import { Folder as FolderEntry } from '../sidebar/Folder';
import { Note as NoteEntry } from '../sidebar/Note';
// Models
import type { Folder, Page } from '@core/vault/models';
// Helpers
import { getChildFolders } from './getChildFolders';
import { getChildPages } from './getChildNotes';

interface RenderEntryTreeProps {
  folders: Folder[];
  pages: Page[];
  // The folder whose children we're currently rendering.
  // null means "start from the root".
  parentId: string | null;
  // Used to indent nested folders.
  level: number;
}

export function renderNotesTree({
  folders,
  pages,
  parentId,
  level,
}: RenderEntryTreeProps) {
  // Get all folders that belong to the current parent.
  const rootFolders = getChildFolders(folders, parentId);

  // Render every child folder.
  return rootFolders.map((folder) => {
    // Get the pages that belong to this folder.
    const childPages = getChildPages(pages, folder.id);
    const subFolders = getChildFolders(folders, folder.id);
    // Checks if the folder is empty
    const isEmpty = subFolders.length === 0 && childPages.length === 0;

    return (
      <Fragment key={folder.id}>
        {/* Render the current folder */}
        <FolderEntry
          title={folder.name}
          emoji={folder.metadata.icon}
          level={level}
          isEmpty={isEmpty}
          onClick={() => {}}
        />
        {/* Render all pages inside this folder */}
        {childPages.map((note) => (
          <NoteEntry
            key={note.id}
            title={note.name}
            emoji={note.metadata.icon}
            level={level + 1}
            onClick={() => {}}
          />
        ))}
        {/* Render this folder's child folders.
            This is the recursive call.
            Every child folder repeats this exact process. */}
        {renderNotesTree({
          folders,
          pages,
          parentId: folder.id,
          level: level + 1,
        })}
      </Fragment>
    );
  });
}
