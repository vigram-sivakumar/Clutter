// React
import { Fragment } from 'react/jsx-runtime';
// Components
import { Folder as FolderEntry } from './Folder';
import { Note as NoteEntry } from './Note';
import { NewFolderRow } from './NewFolderRow';
// Models
import type { Folder, Page } from '@core/vault/models';
// Presentation
import { getPageDisplayLabel } from '@core/presentation/getPageDisplayLabel';
// Queries
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';

export interface PendingNewFolder {
  // The parent under which a not-yet-persisted folder is being named.
  // null means the vault root.
  readonly parentId: string | null;
}

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
  /**
   * At most one folder-creation row is active anywhere in the tree at a
   * time. Every recursive level checks whether it owns this pending
   * folder's parentId, so root-level and nested creation share the exact
   * same mechanism rather than the root being special-cased.
   */
  pendingNewFolder: PendingNewFolder | null;
  onCommitNewFolder(name: string, parentId: string | null): void;
  onCancelNewFolder(): void;
}

export function FolderTree({
  query,
  workspace,
  parentId,
  level,
  onPageClick,
  onFolderClick,
  pendingNewFolder,
  onCommitNewFolder,
  onCancelNewFolder,
}: FolderTreeProps) {
  // Get all folders that belong to the current parent.
  const rootFolders =
    parentId === null
      ? query.getVisibleRootFolders()
      : query.getChildFolders(parentId);

  const isCreatingHere =
    pendingNewFolder !== null && pendingNewFolder.parentId === parentId;

  return (
    <>
      {isCreatingHere && (
        <NewFolderRow
          level={level}
          onCommit={(name) => onCommitNewFolder(name, parentId)}
          onCancel={onCancelNewFolder}
        />
      )}
      {/* Render every child folder. */}
      {rootFolders.map((folder) => {
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
            {childPages.map((note) => {
              const label = getPageDisplayLabel(note);

              return (
                <NoteEntry
                  key={note.id}
                  title={label.text}
                  titleStyle={label.source === 'placeholder' ? 'placeholder' : 'default'}
                  emoji={note.metadata.icon}
                  level={level + 1}
                  selected={workspace.activePageId === note.id}
                  onClick={() => onPageClick(note)}
                />
              );
            })}
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
              pendingNewFolder={pendingNewFolder}
              onCommitNewFolder={onCommitNewFolder}
              onCancelNewFolder={onCancelNewFolder}
            />
          </Fragment>
        );
      })}
    </>
  );
}
