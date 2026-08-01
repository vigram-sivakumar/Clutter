import type { Folder } from '@core/vault/models';
import type { Page } from '@core/vault/models/Page';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import { getPageIcon } from '@core/presentation/getDefaultPageIcon';

import type { CollectionEntryModel } from './CollectionEntryModel';
import type {
  CollectionPageActions,
  CollectionPageModel,
} from './CollectionPageModel';

function isFolder(entry: Folder | Page): entry is Folder {
  return !('type' in entry);
}

/**
 * Maps a Folder or Page domain object to a CollectionEntryModel for collection listing.
 */
function toCollectionEntry(
  entry: Folder | Page,
  actions: CollectionPageActions,
  selected: boolean
): CollectionEntryModel {
  const type = isFolder(entry) ? 'folder' : 'note';

  return {
    id: entry.id,
    type,
    title: entry.name,
    emoji: entry.metadata?.icon ?? null,
    icon: getPageIcon(isFolder(entry) ? 'folder' : entry.type),
    selected,
    onClick: () => {
      if (isFolder(entry)) {
        actions.onOpenFolder(entry.id);
      } else {
        actions.onOpenNote(entry.id);
      }
    },
  };
}

export function toCollectionPageModel(
  folder: Folder,
  query: VaultQuery,
  workspace: Workspace,
  actions: CollectionPageActions
): CollectionPageModel {
  const folders = query
    .getChildFolders(folder.id)
    .map((child) =>
      toCollectionEntry(child, actions, workspace.activeFolderId === child.id)
    );

  const notes = query
    .getChildPages(folder.id)
    .map((child) =>
      toCollectionEntry(child, actions, workspace.activePageId === child.id)
    );

  return {
    title: folder.name,
    description: folder.metadata.description,
    coverImage: folder.metadata.cover,
    folders,
    notes,
  };
}
