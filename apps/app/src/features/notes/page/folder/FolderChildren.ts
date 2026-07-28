import type { Folder } from '@core/vault/models';
import type { Page } from '@core/vault/models/Page';
import { getPageIcon } from '@core/presentation/getDefaultPageIcon';
import type { FolderChildItem, FolderPageActions } from './FolderPageModel';

function isFolder(entry: Folder | Page): entry is Folder {
  return !('type' in entry);
}

/**
 * Maps a Folder or Page domain object to a FolderChildItem for folder page children listing.
 */
export function toFolderChildItem(
  entry: Folder | Page,
  actions: FolderPageActions
): FolderChildItem {
  return {
    id: entry.id,
    title: entry.name,
    emoji: entry.metadata?.icon ?? null,
    icon: getPageIcon(isFolder(entry) ? 'folder' : entry.type),
    type: isFolder(entry) ? 'folder' : 'note',
    onClick: () => {
      if (isFolder(entry)) {
        actions.onOpenFolder(entry.id);
      } else {
        actions.onOpenNote(entry.id);
      }
    },
  };
}
