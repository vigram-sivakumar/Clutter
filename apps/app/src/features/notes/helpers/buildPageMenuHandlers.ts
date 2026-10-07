import type { ResourceActionHandlers } from '@core/presentation/resourceActions/resourceActionTypes';
import type { NoteRowActions } from '../sidebar/FolderTree';

/**
 * The id → operation map for one Page row's overflow menu (ADR-048), shared by every sidebar list
 * that renders a Page: the Notes tree, Favorites, the Tags sidebar's expanded notes and the Daily
 * Notes list. It replaces each list's own `if (id === …)` ladder; every entry is the existing
 * `NoteRowActions` call, so there is still exactly one implementation per capability. Ids a
 * surface's menu never emits are simply never looked up (a Daily Note has no 'duplicate').
 *
 * 'move-to' and 'change-icon' are not here: the row's own picker triggers intercept them before
 * dispatch (Note.tsx), opening the shared Move / Change icon pickers.
 */
export function buildPageMenuHandlers(
  rowActions: Pick<
    NoteRowActions,
    | 'onStartRename'
    | 'onDuplicateNote'
    | 'onToggleFavoriteNote'
    | 'onArchiveNote'
    | 'onRevealPageInFinder'
    | 'onCopyPagePath'
  >,
  pageId: string,
  isFavorite: boolean
): ResourceActionHandlers {
  return {
    rename: () => rowActions.onStartRename(pageId),
    duplicate: () => rowActions.onDuplicateNote(pageId),
    'toggle-favorite': () => rowActions.onToggleFavoriteNote(pageId, isFavorite),
    archive: () => rowActions.onArchiveNote(pageId),
    'reveal-in-finder': () => rowActions.onRevealPageInFinder(pageId),
    'copy-path-at-vault': () => rowActions.onCopyPagePath(pageId, 'at-vault'),
    'copy-path-full-path': () => rowActions.onCopyPagePath(pageId, 'full-path'),
    'copy-path-as-markdown': () => rowActions.onCopyPagePath(pageId, 'as-markdown'),
  };
}
