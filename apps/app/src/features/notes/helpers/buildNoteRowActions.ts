import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { Vault } from '@core/vault/models/Vault';
import type { NoteRowActions } from '../sidebar/FolderTree';
import { buildMoveDestinationItems } from './buildMoveDestinationItems';
import { createLocationActions } from './createLocationActions';

export interface BuildNoteRowActionsDeps {
  readonly vault: Vault;
  readonly pageOperations: PageOperations;
  readonly folderOperations: FolderOperations;
  readonly membershipSelector: MembershipSelector;

  /**
   * Which row's overflow menu/rename session is active — caller-owned
   * state, same as Sidebar.Notes.tsx's own openMenuId/editingId. A second
   * list of Note rows (e.g. Tags' expanded-tag note list) passes its own
   * independent instance of this state, exactly like Sidebar.Notes.tsx's
   * own FavoriteList does via favoriteOpenMenuId/favoriteRowActions — so
   * opening a menu in one list never affects the other, even for the same
   * page id.
   */
  readonly openMenuId: string | null;
  onOpenMenu(id: string): void;
  onCloseMenu(): void;
  readonly editingId: string | null;
  onStartRename(id: string): void;
  onRenameEnd(): void;
}

/**
 * Builds the Note-row action handlers (`NoteRowActions`) every Note row
 * in the sidebar dispatches through — menu/rename wiring plus the actual
 * mutations (archive/duplicate/favorite/icon/move/reveal/copy-path), all
 * going through the same `PageOperations`/`FolderOperations` calls
 * Sidebar.Notes.tsx always has, regardless of which list renders the row.
 * Extracted here (ADR: Tags sidebar expanded note list) so a second
 * caller reuses the exact same handlers instead of a parallel
 * implementation — see `NoteRowActions`'s own doc comment.
 */
export function buildNoteRowActions(deps: BuildNoteRowActionsDeps): NoteRowActions {
  const {
    vault,
    pageOperations,
    folderOperations,
    membershipSelector,
    openMenuId,
    onOpenMenu,
    onCloseMenu,
    editingId,
    onStartRename,
    onRenameEnd,
  } = deps;

  const location = createLocationActions(vault.root);

  return {
    openMenuId,
    onOpenMenu,
    onCloseMenu,

    editingId,
    onStartRename: (id) => {
      onCloseMenu();
      onStartRename(id);
    },
    onRenameEnd,

    onNoteTitleEdit: (pageId, value) => pageOperations.commitTitle(pageId, value),
    onNoteTitleFlush: (pageId) => void pageOperations.requestTitleSave(pageId),
    onNoteTitleCancel: (pageId) => pageOperations.cancelTitleEdit(pageId),
    // A synchronous pre-check only — the continuous channel above
    // (onNoteTitleEdit/onNoteTitleFlush) already persists; this exists so
    // Enter/blur-changed on a colliding title rejects immediately (stay
    // open, shake) instead of waiting on the debounced save to fail.
    onNoteTitleCommit: (pageId, value) =>
      pageOperations.canRename(pageId, value) ? undefined : false,
    onDraftTitleCommit: (pageId, value) => {
      if (!pageOperations.canRename(pageId, value)) {
        return false;
      }

      void pageOperations.updateDraftTitle(pageId, value);
    },
    onArchiveNote: (pageId) => void pageOperations.archive(pageId),
    onDuplicateNote: (pageId) => void pageOperations.duplicate(pageId),
    onToggleFavoriteNote: (pageId, isFavorite) =>
      void pageOperations.updateMetadata(pageId, { favorite: !isFavorite }),
    onChangeNoteIcon: (pageId, emoji) =>
      void pageOperations.updateMetadata(pageId, { icon: emoji }),
    // Same flow as the topbar's Move (PageHost.tsx): same
    // buildMoveDestinationItems helper, same PageOperations.move() call —
    // nothing about Move is reimplemented for a second caller.
    noteMoveDestinations: buildMoveDestinationItems(membershipSelector),
    onMoveNote: (pageId, destinationFolderId) =>
      void pageOperations.move(pageId, destinationFolderId),
    // Same flow as the topbar's Move (PageHost.tsx): root-level creation
    // via the existing FolderOperations.create(), the same operation the
    // Notes sidebar's "+" button already uses.
    onCreateFolder: (name) => folderOperations.create(name, null),

    onRevealPageInFinder: (pageId) => location.reveal(vault.getPage(pageId)?.path),
    onCopyPagePath: (pageId, format) => location.copyPath(vault.getPage(pageId), 'page', format),
  };
}
