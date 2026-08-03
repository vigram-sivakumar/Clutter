// React
import { Fragment } from 'react/jsx-runtime';
// Components
import { Folder as FolderEntry } from './Folder';
import { Note as NoteEntry } from './Note';
import { NewFolderRow } from './NewFolderRow';
// Models
import type { Folder, Page } from '@core/vault/models';
// Presentation
import {
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
} from '@core/presentation/getPageDisplayLabel';
import { getPageTitlePlaceholder } from '@core/presentation/PageDisplayPlaceholders';
// Queries
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';

export interface PendingNewFolder {
  // The parent under which a not-yet-persisted folder is being named.
  // null means the vault root.
  readonly parentId: string | null;
}

interface FolderTreeProps {
  query: VaultQuery;
  workspace: Workspace;
  // ADR-020, M3: existence/list-membership only — draft-only pages (no
  // Vault entry yet) that `query` alone can never see. Durable page
  // rendering below is unchanged; this is consulted only for the
  // not-yet-persisted overlay.
  effectivePageState: EffectivePageState;
  // The folder whose children we're currently rendering.
  // null means "start from the root".
  parentId: string | null;
  // Used to indent nested folders.
  level: number;
  /**
   * Invoked when a durable page entry is selected.
   */
  onPageClick(page: Page): void;
  /**
   * Invoked when a draft-only page entry is selected — distinct from
   * onPageClick because a draft has no Vault Page to pass, and reopening
   * it is a re-select (Workspace.openPage), not PageOperations.open()
   * (which requires a Vault entry and would throw for a draft).
   */
  onDraftPageClick(pageId: string): void;
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

// ADR-020, M3: draft-only children of a folder — entries EffectivePageState
// reconciles that have no Vault entry yet. Never includes an id query's
// durable rendering already covers (EffectivePageState's own resolve()
// flips isDraft to false the instant a Vault entry exists), so this and
// the existing query-driven rendering below can never double-render the
// same id, including mid-promotion.
function draftOnlyChildren(effectivePageState: EffectivePageState, folderId: string | null) {
  return effectivePageState.getChildPages(folderId).filter((entry) => entry.isDraft);
}

export function FolderTree({
  query,
  workspace,
  effectivePageState,
  parentId,
  level,
  onPageClick,
  onDraftPageClick,
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

  // Only meaningful at the true root — a nested folder's own pages are
  // already rendered via getChildPages(folder.id) below, per folder.
  const rootPages = parentId === null ? query.getRootPages() : [];
  const draftRootPages = parentId === null ? draftOnlyChildren(effectivePageState, null) : [];

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
        const draftChildPages = draftOnlyChildren(effectivePageState, folder.id);
        const subFolders = query.getChildFolders(folder.id);
        // Checks if the folder is empty
        const isEmpty =
          subFolders.length === 0 &&
          childPages.length === 0 &&
          draftChildPages.length === 0;

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
                  titleStyle={getPageDisplayLabelStyle(label)}
                  emoji={note.metadata.icon}
                  level={level + 1}
                  selected={workspace.activePageId === note.id}
                  onClick={() => onPageClick(note)}
                />
              );
            })}
            {/* Draft-only pages targeting this folder — not yet in Vault,
                so query never sees them (ADR-020, M3). No title/body
                live-updates yet (M4); an untitled draft shows the same
                shared placeholder copy the rest of the app already uses. */}
            {draftChildPages.map((entry) => (
              <NoteEntry
                key={entry.id}
                title={entry.name || getPageTitlePlaceholder(entry.type)}
                titleStyle={entry.name ? 'default' : 'placeholder'}
                level={level + 1}
                selected={workspace.activePageId === entry.id}
                onClick={() => onDraftPageClick(entry.id)}
              />
            ))}
            {/* Render this folder's child folders.
                This is the recursive call.
                Every child folder repeats this exact process. */}
            <FolderTree
              query={query}
              workspace={workspace}
              effectivePageState={effectivePageState}
              parentId={folder.id}
              level={level + 1}
              onPageClick={onPageClick}
              onDraftPageClick={onDraftPageClick}
              onFolderClick={onFolderClick}
              pendingNewFolder={pendingNewFolder}
              onCommitNewFolder={onCommitNewFolder}
              onCancelNewFolder={onCancelNewFolder}
            />
          </Fragment>
        );
      })}
      {/* Render root-level pages, at the same indentation as root
          folders — they aren't nested under anything. */}
      {rootPages.map((note) => {
        const label = getPageDisplayLabel(note);

        return (
          <NoteEntry
            key={note.id}
            title={label.text}
            titleStyle={getPageDisplayLabelStyle(label)}
            emoji={note.metadata.icon}
            level={level}
            selected={workspace.activePageId === note.id}
            onClick={() => onPageClick(note)}
          />
        );
      })}
      {/* Draft-only root pages — same reasoning as the per-folder block
          above. */}
      {draftRootPages.map((entry) => (
        <NoteEntry
          key={entry.id}
          title={entry.name || getPageTitlePlaceholder(entry.type)}
          titleStyle={entry.name ? 'default' : 'placeholder'}
          level={level}
          selected={workspace.activePageId === entry.id}
          onClick={() => onDraftPageClick(entry.id)}
        />
      ))}
    </>
  );
}
