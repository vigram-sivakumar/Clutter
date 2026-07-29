// React
import { Fragment } from 'react/jsx-runtime';
// Components
import { Folder as FolderEntry } from './Folder';
import { Note as NoteEntry } from './Note';
// Models
import type { Folder, Page } from '@core/vault/models';
// Queries
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';

interface FolderTreeProps {
  query: VaultQuery;
  workspace: Workspace;
  // The folder whose children we're currently rendering.
  // null means "start from the root".
  parentId: string | null;
  // Used to indent nested folders.
  level: number;
  /**
   * Invoked when a page entry is selected.
   */
  onPageClick(page: Page): void;
  /**
   * Invoked when a folder entry is selected.
   */
  onFolderClick(folder: Folder): void;
}

export function FolderTree({
  query,
  workspace,
  parentId,
  level,
  onPageClick,
  onFolderClick,
}: FolderTreeProps) {
  // Get all folders that belong to the current parent.
  const rootFolders =
    parentId === null
      ? query.getVisibleRootFolders()
      : query.getChildFolders(parentId);

  // Render every child folder.
  return rootFolders.map((folder) => {
    // Get the pages that belong to this folder.
    const childPages = query.getChildPages(folder.id);
    const subFolders = query.getChildFolders(folder.id);
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
          selected={workspace.activeFolderId === folder.id}
          isExpanded={workspace.isFolderExpanded(folder.id)}
          onExpandToggle={() => workspace.toggleFolderExpanded(folder.id)}
          onClick={() => onFolderClick(folder)}
        />
        {/* Render all pages inside this folder */}
        {childPages.map((note) => (
          <NoteEntry
            key={note.id}
            title={note.name}
            emoji={note.metadata.icon}
            level={level + 1}
            selected={workspace.activePageId === note.id}
            onClick={() => onPageClick(note)}
          />
        ))}
        {/* Render this folder's child folders.
            This is the recursive call.
            Every child folder repeats this exact process. */}
        <FolderTree
          query={query}
          workspace={workspace}
          parentId={folder.id}
          level={level + 1}
          onPageClick={onPageClick}
          onFolderClick={onFolderClick}
        />
      </Fragment>
    );
  });
}
