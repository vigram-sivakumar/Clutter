import type { Folder } from '@core/vault/models';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePage, EffectivePageState } from '@core/application/page/EffectivePageState';
import { getPageIcon } from '@core/presentation/getPageIcon';
import { getPageDisplayLabel } from '@core/presentation/getPageDisplayLabel';

import type { CollectionEntryModel } from './CollectionEntryModel';
import type {
  CollectionPageActions,
  CollectionPageModel,
} from './CollectionPageModel';

function isFolder(entry: Folder | EffectivePage): entry is Folder {
  return !('type' in entry);
}

/**
 * Maps a Folder or EffectivePage to a CollectionEntryModel for collection
 * listing. Pages come from EffectivePageState (ARCHITECTURE_RULES.md rule
 * 13) — existence, label, and icon for both durable and draft-only pages,
 * the same read façade FolderTree/DailyNotesList already use. Draft
 * accumulation is prevented at creation time (PageOperations's
 * findReusableDraftId), not by filtering here.
 */
function toCollectionEntry(
  entry: Folder | EffectivePage,
  actions: CollectionPageActions,
  selected: boolean
): CollectionEntryModel {
  const type = isFolder(entry) ? 'folder' : 'note';

  return {
    id: entry.id,
    type,
    // This is a browse surface (Category A) — a page's title must go
    // through the shared display-label rule, the same as the sidebar and
    // breadcrumbs, so an unnamed note doesn't show a raw "Untitled 2"
    // here while looking correct everywhere else. A folder's name is
    // always real and deliberate; no fallback chain applies to it.
    title: isFolder(entry) ? entry.name : getPageDisplayLabel(entry).text,
    emoji: isFolder(entry) ? entry.metadata.icon : entry.icon,
    icon: getPageIcon(isFolder(entry) ? 'folder' : entry.type),
    selected,
    onClick: () => {
      if (isFolder(entry)) {
        actions.onOpenFolder(entry.id);
        return;
      }

      if (entry.isDraft) {
        actions.onOpenDraftNote(entry.id);
        return;
      }

      actions.onOpenNote(entry.id);
    },
  };
}

export function toCollectionPageModel(
  folder: Folder,
  query: VaultQuery,
  effectivePageState: EffectivePageState,
  workspace: Workspace,
  actions: CollectionPageActions
): CollectionPageModel {
  const folders = query
    .getChildFolders(folder.id)
    .map((child) =>
      toCollectionEntry(child, actions, workspace.activeFolderId === child.id)
    );

  const notes = effectivePageState
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
