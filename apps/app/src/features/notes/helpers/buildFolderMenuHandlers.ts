import type { ResourceActionHandlers } from '@core/presentation/resourceActions/resourceActionTypes';
import { SORT_MENU_ID_PREFIX } from '@core/presentation/resourceActions/folderSortAction';
import { DEFAULT_SIDEBAR_SORT, isSidebarSortKey, type SidebarSort } from '@core/properties/sidebarSort';
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

/**
 * A Sort by row (`sort:<key>`) picked from a folder row's menu — the same rule the collection views'
 * Configure menu uses: re-picking the active key flips its direction; another key starts at its own
 * default ('down'). Shared by the Notes tree and Favorites, so a favorited folder sorts exactly like
 * its tree row. Returns whether `id` was a sort row (so the caller knows not to dispatch it again).
 */
export function applyFolderSortSelection(
  id: string,
  folderId: string,
  current: SidebarSort | undefined,
  onChange: ((folderId: string, sort: SidebarSort) => void) | undefined
): boolean {
  if (!id.startsWith(SORT_MENU_ID_PREFIX)) {
    return false;
  }

  const key = id.slice(SORT_MENU_ID_PREFIX.length);

  if (isSidebarSortKey(key)) {
    const active = current ?? DEFAULT_SIDEBAR_SORT;
    onChange?.(
      folderId,
      active.key === key
        ? { key, direction: active.direction === 'down' ? 'up' : 'down' }
        : { key, direction: 'down' }
    );
  }

  return true;
}
