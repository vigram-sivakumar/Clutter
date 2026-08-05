// React
import { Fragment } from 'react/jsx-runtime';
// Components
import { Folder as FolderEntry } from './Folder';
import { Note as NoteEntry } from './Note';
import { NewFolderRow } from './NewFolderRow';
import { buildNoteSidebarMenu } from './noteSidebarMenu.config';
import { folderSidebarMenu } from './folderSidebarMenu.config';
// Models
import type { Folder } from '@core/vault/models';
// Presentation
import {
  getPageDisplayLabel,
  getPageDisplayLabelStyle,
} from '@core/presentation/getPageDisplayLabel';
// Queries
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePage } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';

export interface PendingNewFolder {
  // The parent under which a not-yet-persisted folder is being named.
  // null means the vault root.
  readonly parentId: string | null;
}

/**
 * Single owner of "which row's overflow menu/rename session is active,"
 * supplied by the caller (Sidebar.Notes.tsx) so it's shared across every
 * row FolderTree recurses through — the mechanism that guarantees only
 * one menu is ever open at a time, and threads every menu action back to
 * PageOperations/FolderOperations, the facades that already own rename/
 * archive/delete (no new write path is introduced by any handler here).
 * Optional so every existing FolderTree caller/test that doesn't wire row
 * actions keeps rendering the plain, unwired overflow button it always
 * has.
 */
export interface SidebarRowActions {
  openMenuId: string | null;
  onOpenMenu(id: string): void;
  onCloseMenu(): void;

  editingId: string | null;
  onStartRename(id: string): void;
  onRenameEnd(): void;

  /** Continuous-commit channel (PageOperations.commitTitle), persisted notes only. */
  onNoteTitleEdit(pageId: string, value: string): void;
  onNoteTitleFlush(pageId: string): void;
  onNoteTitleCancel(pageId: string): void;
  /** Discrete commit (PageOperations.updateDraftTitle), draft notes only. */
  onDraftTitleCommit(pageId: string, value: string): void;
  onArchiveNote(pageId: string): void;
  onDeleteNote(pageId: string): void;

  /** Continuous-commit channel (FolderOperations.commitName), same shape as a persisted note's title. */
  onFolderTitleEdit(folderId: string, value: string): void;
  onFolderTitleFlush(folderId: string): void;
  onFolderTitleCancel(folderId: string): void;
  onDeleteFolder(folderId: string): void;
}

interface FolderTreeProps {
  // Folders only — folders have no draft concept (ADR-017 is scoped to
  // pages), so query remains their sole, correct source for structural
  // reads (a folder's children). Root-level Workspace membership goes
  // through membershipSelector instead — see below.
  query: VaultQuery;
  // ADR-023: the single owner of "is this folder part of Workspace" — used
  // only for the true root's folder list (getWorkspaceFolders()); nested
  // folders keep reading structurally through query.getChildFolders(),
  // which has no membership question to answer (a folder already inside a
  // non-reserved folder is never itself a reserved folder, so nothing to
  // classify one layer down).
  membershipSelector: MembershipSelector;
  workspace: Workspace;
  // The folder whose children we're currently rendering.
  // null means "start from the root".
  parentId: string | null;
  // Used to indent nested folders.
  level: number;
  /**
   * Invoked when a durable page entry is selected.
   */
  onPageClick(pageId: string): void;
  /**
   * Invoked when a draft-only page entry is selected — distinct from
   * onPageClick because reopening a draft is a re-select
   * (Workspace.openPage), not PageOperations.open() (which requires a
   * Vault entry and would throw for a draft).
   */
  onDraftPageClick(pageId: string): void;
  /**
   * Invoked when a folder entry is selected.
   */
  onFolderClick(folder: Folder): void;
  /**
   * Invoked when a folder row's "+" action is clicked — opens a new draft
   * note scoped to that folder (PageOperations.openDraft({ folderId })).
   */
  onCreateNote(folderId: string): void;
  /**
   * At most one folder-creation row is active anywhere in the tree at a
   * time. Every recursive level checks whether it owns this pending
   * folder's parentId, so root-level and nested creation share the exact
   * same mechanism rather than the root being special-cased.
   */
  pendingNewFolder: PendingNewFolder | null;
  onCommitNewFolder(name: string, parentId: string | null): void;
  onCancelNewFolder(): void;
  /** Overflow-menu/rename wiring — see SidebarRowActions. */
  rowActions?: SidebarRowActions;
}

function PageEntry({
  entry,
  level,
  workspace,
  onPageClick,
  onDraftPageClick,
  rowActions,
}: {
  entry: EffectivePage;
  level: number;
  workspace: Workspace;
  onPageClick(pageId: string): void;
  onDraftPageClick(pageId: string): void;
  rowActions?: SidebarRowActions;
}) {
  const label = getPageDisplayLabel(entry);
  const isEditing = rowActions?.editingId === entry.id;

  return (
    <NoteEntry
      title={label.text}
      titleStyle={getPageDisplayLabelStyle(label)}
      emoji={entry.icon}
      level={level}
      selected={workspace.activePageId === entry.id}
      // A row mid-rename must not also navigate on click — EditableText's
      // contenteditable surface isn't one of Entry's recognized
      // interactive-descendant tags, so leaving onClick wired here would
      // fire row selection on every click into the field.
      onClick={
        isEditing
          ? undefined
          : () => (entry.isDraft ? onDraftPageClick(entry.id) : onPageClick(entry.id))
      }
      isEditing={isEditing}
      onTitleEdit={
        !entry.isDraft && rowActions
          ? (value) => rowActions.onNoteTitleEdit(entry.id, value)
          : undefined
      }
      onTitleFlush={
        !entry.isDraft && rowActions ? () => rowActions.onNoteTitleFlush(entry.id) : undefined
      }
      onTitleCancel={
        !entry.isDraft && rowActions ? () => rowActions.onNoteTitleCancel(entry.id) : undefined
      }
      onTitleCommit={
        entry.isDraft && rowActions
          ? (value) => rowActions.onDraftTitleCommit(entry.id, value)
          : undefined
      }
      onTitleEditingEnd={rowActions ? () => rowActions.onRenameEnd() : undefined}
      menuItems={rowActions ? buildNoteSidebarMenu(entry.isDraft) : undefined}
      menuOpen={rowActions?.openMenuId === entry.id}
      onMenuOpenChange={
        rowActions
          ? (open) => (open ? rowActions.onOpenMenu(entry.id) : rowActions.onCloseMenu())
          : undefined
      }
      onMenuSelect={
        rowActions
          ? (id) => {
              if (id === 'rename') {
                rowActions.onStartRename(entry.id);
              } else if (id === 'archive') {
                rowActions.onArchiveNote(entry.id);
              } else if (id === 'delete') {
                rowActions.onDeleteNote(entry.id);
              }
            }
          : undefined
      }
    />
  );
}

export function FolderTree({
  query,
  membershipSelector,
  workspace,
  parentId,
  level,
  onPageClick,
  onDraftPageClick,
  onFolderClick,
  onCreateNote,
  pendingNewFolder,
  onCommitNewFolder,
  onCancelNewFolder,
  rowActions,
}: FolderTreeProps) {
  // Get all folders that belong to the current parent. Root-level: ADR-023's
  // MembershipSelector is the single owner of "is this folder part of
  // Workspace" (formerly query.getVisibleRootFolders() here, and
  // independently query.getRootFolders() unfiltered in
  // toCollectionPageModel's Workspace branch — the two-definition bug
  // ADR-023 exists to close). Nested: query.getChildFolders() remains the
  // correct structural source — no membership question applies one layer
  // below the root.
  const rootFolders =
    parentId === null
      ? membershipSelector.getWorkspaceFolders()
      : query.getChildFolders(parentId);

  // Only meaningful at the true root — a nested folder's own pages are
  // already rendered via getNotesChildPages(folder.id) below, per folder.
  // ADR-020 (M3 amendment): sidebar membership includes draft-only pages
  // alongside durable ones — the sidebar always reflects what's
  // currently being edited. Unbounded draft accumulation is prevented
  // one layer down, at creation time (PageOperations.openDraft/
  // openAtPath's findReusableDraftId) — at most one empty draft of a
  // given type is ever open at once, so there's never more than one
  // "New Note"-placeholder row to show here.
  //
  // ADR-023: narrowed to Notes membership (page.type === 'note'), not just
  // folderId — this is the fix for a Daily Note draft (folderId: null
  // before its month folder exists) rendering here as if it were a Note.
  // Daily Notes membership is a different, identity-driven question
  // DailyNotesList now asks separately, through the same MembershipSelector.
  const rootPages = parentId === null ? membershipSelector.getNotesChildPages(null) : [];

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
        // Every page that should currently be shown as a child of this
        // folder — durable and draft-only alike (ADR-020), narrowed to
        // Notes membership (ADR-023); see the rootPages comment above for
        // both why draft accumulation isn't a concern here and why the
        // narrowing is necessary.
        const childPages = membershipSelector.getNotesChildPages(folder.id);
        const subFolders = query.getChildFolders(folder.id);
        // Checks if the folder is empty
        const isEmpty = subFolders.length === 0 && childPages.length === 0;
        // Empty folders default to collapsed rather than Workspace's normal
        // expanded-by-default state, since there's nothing to reveal.
        const isExpanded = isEmpty ? false : workspace.isFolderExpanded(folder.id);
        const isEditingFolder = rowActions?.editingId === folder.id;

        return (
          <Fragment key={folder.id}>
            {/* Render the current folder */}
            <FolderEntry
              title={folder.name}
              emoji={folder.metadata.icon}
              level={level}
              isEmpty={isEmpty}
              selected={workspace.activeFolderId === folder.id}
              isExpanded={isExpanded}
              onExpandToggle={() => workspace.toggleFolderExpanded(folder.id)}
              // Same rename/navigate conflict guard as PageEntry above.
              onClick={isEditingFolder ? undefined : () => onFolderClick(folder)}
              onAddClick={() => onCreateNote(folder.id)}
              isEditing={isEditingFolder}
              onTitleEdit={
                rowActions ? (value) => rowActions.onFolderTitleEdit(folder.id, value) : undefined
              }
              onTitleFlush={
                rowActions ? () => rowActions.onFolderTitleFlush(folder.id) : undefined
              }
              onTitleCancel={
                rowActions ? () => rowActions.onFolderTitleCancel(folder.id) : undefined
              }
              onTitleEditingEnd={rowActions ? () => rowActions.onRenameEnd() : undefined}
              menuItems={rowActions ? folderSidebarMenu : undefined}
              menuOpen={rowActions?.openMenuId === folder.id}
              onMenuOpenChange={
                rowActions
                  ? (open) => (open ? rowActions.onOpenMenu(folder.id) : rowActions.onCloseMenu())
                  : undefined
              }
              onMenuSelect={
                rowActions
                  ? (id) => {
                      if (id === 'rename') {
                        rowActions.onStartRename(folder.id);
                      } else if (id === 'delete') {
                        rowActions.onDeleteFolder(folder.id);
                      }
                    }
                  : undefined
              }
            />
            {/* Completes the existing Workspace.isFolderExpanded capability
                (ADR-021) — a collapsed folder's pages and subfolders render
                nothing, rather than only rotating the caret. */}
            {isExpanded && (
              <>
                {/* Render all pages inside this folder */}
                {childPages.map((entry) => (
                  <PageEntry
                    key={entry.id}
                    entry={entry}
                    level={level + 1}
                    workspace={workspace}
                    onPageClick={onPageClick}
                    onDraftPageClick={onDraftPageClick}
                    rowActions={rowActions}
                  />
                ))}
                {/* Render this folder's child folders.
                    This is the recursive call.
                    Every child folder repeats this exact process. */}
                <FolderTree
                  query={query}
                  membershipSelector={membershipSelector}
                  workspace={workspace}
                  parentId={folder.id}
                  level={level + 1}
                  onPageClick={onPageClick}
                  onDraftPageClick={onDraftPageClick}
                  onFolderClick={onFolderClick}
                  onCreateNote={onCreateNote}
                  pendingNewFolder={pendingNewFolder}
                  onCommitNewFolder={onCommitNewFolder}
                  onCancelNewFolder={onCancelNewFolder}
                  rowActions={rowActions}
                />
              </>
            )}
          </Fragment>
        );
      })}
      {/* Render root-level pages, at the same indentation as root
          folders — they aren't nested under anything. */}
      {rootPages.map((entry) => (
        <PageEntry
          key={entry.id}
          entry={entry}
          level={level}
          workspace={workspace}
          onPageClick={onPageClick}
          onDraftPageClick={onDraftPageClick}
          rowActions={rowActions}
        />
      ))}
    </>
  );
}
