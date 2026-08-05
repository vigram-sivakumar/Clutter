import type { Folder } from '@core/vault/models';
import type { Vault } from '@core/vault/models/Vault';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { FilteredView, Workspace } from '@core/workspace/Workspace';
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

/**
 * What toCollectionPageModel builds a page from: either a real Folder's
 * children, or a filtered view (ADR-022) — Workspace-root, Favorites, or a
 * tag — none of which is one folder's children. Discriminated by `view`
 * rather than `type`, since neither Folder nor EffectivePage has a `view`
 * field, mirroring isFolder()'s own Folder/EffectivePage discrimination.
 */
export type CollectionPageSource = Folder | { readonly view: FilteredView };

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

function isFolderSource(source: CollectionPageSource): source is Folder {
  return !('view' in source);
}

/**
 * A Workspace-root, Favorites, or single-tag collection page (ADR-022).
 * Membership comes from exactly the same VaultQuery/EffectivePageState
 * calls the sidebar's own list components make — getRootFolders() +
 * getChildPages(null) for 'workspace', getFavoriteFolders() +
 * getFavoritePages() for 'favorites', getPagesByTag() for 'tag' — so the
 * page can never drift from what the sidebar shows for the same view.
 *
 * The tag branch returns early: a tag has no folders (folders: [] always)
 * and its title/icon come from the Tag entity itself (vault.getTagByName),
 * never from the system-location presentation table below, which has no
 * per-tag entries and structurally can't (it's a closed, fixed-key
 * lookup — see the investigation this followed).
 */
function toFilteredCollectionPageModel(
  view: FilteredView,
  vault: Vault,
  query: VaultQuery,
  effectivePageState: EffectivePageState,
  workspace: Workspace,
  actions: CollectionPageActions
): CollectionPageModel {
  if (view.kind === 'tag') {
    const tag = vault.getTagByName(view.tagName);
    const notes = effectivePageState
      .getPagesByTag(view.tagName)
      .map((child) => toCollectionEntry(child, actions, workspace.activePageId === child.id));

    return {
      title: tag?.name ?? view.tagName,
      description: '',
      coverImage: null,
      folders: [],
      notes,
    };
  }

  const rawFolders =
    view.kind === 'workspace' ? query.getRootFolders() : query.getFavoriteFolders();
  const rawNotes =
    view.kind === 'workspace'
      ? effectivePageState.getChildPages(null)
      : effectivePageState.getFavoritePages();

  return {
    title: getSystemLocationPresentation(view.kind).label,
    description: '',
    coverImage: null,
    folders: rawFolders.map((child) =>
      toCollectionEntry(child, actions, workspace.activeFolderId === child.id)
    ),
    notes: rawNotes.map((child) =>
      toCollectionEntry(child, actions, workspace.activePageId === child.id)
    ),
  };
}

function toFolderCollectionPageModel(
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

export function toCollectionPageModel(
  source: CollectionPageSource,
  vault: Vault,
  query: VaultQuery,
  effectivePageState: EffectivePageState,
  workspace: Workspace,
  actions: CollectionPageActions
): CollectionPageModel {
  if (isFolderSource(source)) {
    return toFolderCollectionPageModel(source, vault, query, effectivePageState, workspace, actions);
  }

  return toFilteredCollectionPageModel(
    source.view,
    vault,
    query,
    effectivePageState,
    workspace,
    actions
  );
}
