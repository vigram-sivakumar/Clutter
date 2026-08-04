import type { Folder } from '@core/vault/models';
import type { Vault } from '@core/vault/models/Vault';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePage, EffectivePageState } from '@core/application/page/EffectivePageState';
import { buildEntryPresentation } from '@core/presentation/buildEntryPresentation';
import {
  getSystemLocationForFolder,
  getSystemLocationPresentation,
} from '@core/presentation/systemPresentation';

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
  const { title, icon, emoji } = buildEntryPresentation(entry);

  return {
    id: entry.id,
    type,
    title,
    icon,
    emoji,
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
  vault: Vault,
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

  // A reserved folder (Archive, Inbox, Templates, Daily Notes) viewed
  // directly gets its canonical system-location label instead of the raw
  // Vault folder name — same helper buildBreadcrumbs' ancestor handling
  // uses, so the two surfaces can't drift.
  const systemLocation = getSystemLocationForFolder(folder, vault);
  const title = systemLocation
    ? getSystemLocationPresentation(systemLocation).label
    : folder.name;

  return {
    title,
    description: folder.metadata.description,
    coverImage: folder.metadata.cover,
    folders,
    notes,
  };
}
