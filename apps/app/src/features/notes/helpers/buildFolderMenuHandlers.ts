import type { ResourceActionHandlers } from '@core/presentation/resourceActions/resourceActionTypes';
import type { SidebarRowActions } from '../sidebar/FolderTree';

/**
 * The id → operation map for one Folder row's overflow menu (ADR-048), shared by the Notes tree and
 * Favorites — the Folder counterpart of buildPageMenuHandlers. 'move-to' and 'change-icon' are
 * intercepted by the row's own pickers; Sort by rows (`sort:<key>`) are the Notes tree's own
 * per-folder view state, handled where that state lives (FolderTree).
 */
export function buildFolderMenuHandlers(
  rowActions: Pick<
    SidebarRowActions,
    | 'onStartRename'
    | 'onToggleFavoriteFolder'
    | 'onArchiveFolder'
    | 'onRevealFolderInFinder'
    | 'onCopyFolderPath'
  >,
  folderId: string,
  isFavorite: boolean
): ResourceActionHandlers {
  return {
    rename: () => rowActions.onStartRename(folderId),
    'toggle-favorite': () => rowActions.onToggleFavoriteFolder(folderId, isFavorite),
    archive: () => rowActions.onArchiveFolder(folderId),
    'reveal-in-finder': () => rowActions.onRevealFolderInFinder(folderId),
    // No 'copy-path-as-markdown': no folder-linking syntax exists anywhere in the parser/resolver.
    'copy-path-at-vault': () => rowActions.onCopyFolderPath(folderId, 'at-vault'),
    'copy-path-full-path': () => rowActions.onCopyFolderPath(folderId, 'full-path'),
  };
}
