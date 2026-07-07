import { Fragment } from 'react';

import { Folder as FolderModels } from '@features/notes/models/Folder';
import { Note as NoteModels } from '@features/notes/models/Note';

import { Folder } from '../components/Folder';
import { Note } from '../components/Note';

import { getChildFolders } from './getChildFolders';
import { getChildNotes } from './getChildNotes';
import { isExpanded } from './isExpanded';
import { toggleExpanded } from './toggleExpanded';

interface RenderEntryTreeProps {
  folders: FolderModels[];
  notes: NoteModels[];
  parentId: string | null;
  level: number;
  expandedFolderIds: string[];
  setExpandedFolderIds: React.Dispatch<React.SetStateAction<string[]>>;

  selectedEntryIds: string[];
  setSelectedEntryIds: React.Dispatch<React.SetStateAction<string[]>>;
}

export function renderEntryTree({
  folders,
  notes,
  parentId,
  level,
  expandedFolderIds,
  setExpandedFolderIds,
  selectedEntryIds,
  setSelectedEntryIds,
}: RenderEntryTreeProps) {
  return getChildFolders(folders, parentId).map((folder) => {
    const childFolders = getChildFolders(folders, folder.id);
    const childNotes = getChildNotes(notes, folder.id);

    const isEmpty = childFolders.length === 0 && childNotes.length === 0;

    const expanded = isExpanded(expandedFolderIds, folder.id);

    return (
      <Fragment key={folder.id}>
        <Folder
          level={level}
          title={folder.title}
          isExpanded={expanded}
          isEmpty={isEmpty}
          selected={selectedEntryIds.includes(folder.id)}
          onClick={() => {
            setSelectedEntryIds([folder.id]);
          }}
          onExpandToggle={() =>
            setExpandedFolderIds((previous) =>
              toggleExpanded(previous, folder.id)
            )
          }
        />

        {expanded && (
          <>
            {renderEntryTree({
              folders,
              notes,
              parentId: folder.id,
              level: level + 1,
              expandedFolderIds,
              setExpandedFolderIds,
              selectedEntryIds,
              setSelectedEntryIds,
            })}

            {childNotes.map((note) => (
              <Note
                key={note.id}
                level={level + 1}
                title={note.title}
                selected={selectedEntryIds.includes(note.id)}
                onClick={() => {
                  setSelectedEntryIds([note.id]);
                }}
              />
            ))}
          </>
        )}
      </Fragment>
    );
  });
}
