import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { ResourceOperations } from '@core/application/resource/ResourceOperations';
import type { Vault } from '@core/vault/models/Vault';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';
import type { VaultResource } from '@core/vault/models/VaultResource';

import { buildNotesShortcutHandler } from '@features/notes/shortcuts/buildNotesShortcutHandler';
import { NotesShortcuts } from '@features/notes/shortcuts/NotesShortcuts';
import { createTagResolver } from '@app/layouts/page/resolveTag';
import { createWikiLinkResolver } from '@app/layouts/page/resolveWikiLink';
import {
  FolderTree,
  type PendingNewFolder,
  type SidebarRowActions,
} from './FolderTree';
import { FavoriteList } from './FavoriteList';
import { getFavoriteItems } from '../helpers/getFavoriteItems';
import {
  buildMoveDestinationItems,
  buildResourceMoveDestinationItems,
} from '../helpers/buildMoveDestinationItems';
import { getFolderArchiveConfirmation } from '../helpers/folderActionConfirmation';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';
import { Dialog } from '@components/dialog/Dialog';
import { Confirmation } from '@components/confirmation/Confirmation';
import { useConfirmationSurface } from '@components/confirmation/useConfirmationSurface';
import { revealInFinder } from '@shared/helpers/revealInFinder';
import { copyTextToClipboard } from '@shared/helpers/copyTextToClipboard';
import {
  getLocationPathRepresentations,
  pickLocationPathRepresentation,
} from '@core/presentation/getLocationPathRepresentations';
import type {
  LocationEntityKind,
  LocationPathFormat,
} from '@core/presentation/getLocationPathRepresentations';

interface NotesProps {
  vault: Vault;
  query: VaultQuery;
  workspace: Workspace;
  navigation: NavigationRouter;
  pageOperations: PageOperations;
  folderOperations: FolderOperations;
  resourceOperations: ResourceOperations;
  effectivePageState: EffectivePageState;
  membershipSelector: MembershipSelector;
  onOpen(pageId: string): void;
  onOpenFolder(folderId: string): void;
  /**
   * A draft has no Vault entry yet, so onOpen()/pageOperations.open()
   * (which requires one) would throw for it — it's already open via
   * openDraft()/openAtPath(), so clicking it again is a re-select, not a
   * fresh open (ADR-020, M3).
   */
  onOpenDraft(pageId: string): void;
  /**
   * Invoked when an image resource row is clicked — currently the only
   * resource click behavior (a pdf row has none; see Resource.tsx). Absent
   * in a caller that doesn't want the affordance, the same optionality
   * FolderTree's own onResourceClick already has.
   */
  onOpenResourceImage?(resource: VaultResource): void;
}

export function Notes({
  vault,
  query,
  workspace,
  navigation,
  pageOperations,
  folderOperations,
  resourceOperations,
  effectivePageState,
  membershipSelector,
  onOpen,
  onOpenFolder,
  onOpenDraft,
  onOpenResourceImage,
}: NotesProps) {
  const [pendingNewFolder, setPendingNewFolder] =
    useState<PendingNewFolder | null>(null);

  // Same composition PageHost.tsx uses to inject the page editor's own
  // WikiLink/Tag resolution — cheap, stateless glue, not worth memoizing
  // (resolveTag.ts/resolveWikiLink.ts). Reused here so a row's compact
  // Markdown rendering resolves WikiLinks/Tags identically to the open
  // page, not via a second resolution implementation.
  const resolveWikiLink = createWikiLinkResolver(vault, pageOperations, folderOperations);
  const resolveTag = createTagResolver(navigation, vault);

  // Single owner of "which row's overflow menu/rename session is open" —
  // shared by every row FolderTree recurses through (SidebarRowActions),
  // the mechanism that guarantees only one menu is ever open at a time and
  // that starting a rename elsewhere closes any other in-progress one.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  // FavoriteList renders its own Entry instances for the same page/folder
  // IDs FolderTree renders under Workspace — a favorited page's Favorites
  // row and its Workspace row are two separate rendered rows that happen
  // to share a page ID, not one row. Menu-open state must therefore be
  // scoped per rendered list, not shared: reusing `openMenuId` above (keyed
  // only by id) would open both rows' menus together whenever the shared
  // id matched. This state, and the favoriteRowActions override below, are
  // FavoriteList's own independent instance of "which row's menu is open."
  const [favoriteOpenMenuId, setFavoriteOpenMenuId] = useState<string | null>(
    null
  );
  // The sidebar's confirmation surface — same shared primitive
  // (useConfirmationSurface) and same Confirmation/Dialog components the
  // topbar's ResourceTopBarActions uses, so folder archive/delete show
  // identically regardless of entry point. Replaces the previous
  // window.confirm()-based helpers, which did not reliably render in the
  // Tauri desktop shell.
  const confirmation = useConfirmationSurface();

  // Location-actions pipeline glue, shared by every onReveal*InFinder/
  // onCopy*Path pair below — the one place "look up the entity's absolute
  // path, then reveal/pick-and-copy" is implemented, rather than each of
  // Note/Folder/Resource repeating the same two lines. Closes over `vault`
  // for `vault.root` (the "At Vault"/Markdown representations both need).
  function revealLocationInFinder(entityPath: string | undefined): void {
    if (entityPath) {
      void revealInFinder(entityPath);
    }
  }

  function copyLocationPath(
    entity: { path: string } | undefined,
    kind: LocationEntityKind,
    format: LocationPathFormat
  ): void {
    if (!entity) {
      return;
    }

    const representations = getLocationPathRepresentations(entity, kind, vault.root);
    const value = pickLocationPathRepresentation(representations, format);

    if (value !== null) {
      void copyTextToClipboard(value);
    }
  }

  const rowActions: SidebarRowActions = {
    openMenuId,
    onOpenMenu: (id) => setOpenMenuId(id),
    onCloseMenu: () => setOpenMenuId(null),

    editingId,
    onStartRename: (id) => {
      setOpenMenuId(null);
      setEditingId(id);
    },
    onRenameEnd: () => setEditingId(null),

    onNoteTitleEdit: (pageId, value) =>
      pageOperations.commitTitle(pageId, value),
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
    // nothing about Move is reimplemented for the sidebar.
    noteMoveDestinations: buildMoveDestinationItems(membershipSelector),
    onMoveNote: (pageId, destinationFolderId) =>
      void pageOperations.move(pageId, destinationFolderId),
    // Same flow as the topbar's Move (PageHost.tsx): root-level creation
    // via the existing FolderOperations.create(), the same operation the
    // "+" button (handleCommitNewFolder above) already uses.
    onCreateFolder: (name) => folderOperations.create(name, null),

    // Same synchronous pre-check role as onNoteTitleCommit above.
    onFolderTitleCommit: (folderId, value) =>
      folderOperations.canRename(folderId, value) ? undefined : false,
    onFolderTitleEdit: (folderId, value) =>
      folderOperations.commitName(folderId, value),
    onFolderTitleFlush: (folderId) =>
      void folderOperations.requestNameSave(folderId),
    onFolderTitleCancel: (folderId) =>
      folderOperations.cancelNameEdit(folderId),
    // Same predicate, same message, same Confirmation/Dialog surface the
    // topbar uses (buildTopBarActions.tsx's identical getFolderArchiveConfirmation
    // call) — an empty folder archives directly; a non-empty one is gated
    // behind confirmation first. FolderOperations.archive() itself owns
    // post-archive navigation (ADR-025's fallback-page pattern) — nothing
    // here decides what happens to the active view.
    onToggleFavoriteFolder: (folderId, isFavorite) =>
      void folderOperations.updateMetadata(folderId, { favorite: !isFavorite }),
    onChangeFolderIcon: (folderId, emoji) =>
      void folderOperations.updateMetadata(folderId, { icon: emoji }),
    onArchiveFolder: (folderId) => {
      const { hasDescendants, message } = getFolderArchiveConfirmation(
        vault,
        folderId
      );

      if (hasDescendants) {
        confirmation.request({
          title: 'Archive this folder?',
          message,
          confirmLabel: 'Archive',
          onConfirm: () => void folderOperations.archive(folderId),
        });
        return;
      }

      void folderOperations.archive(folderId);
    },
    // Same flow as the topbar's Move (PageHost.tsx): same
    // buildMoveDestinationItems helper (excludeFolderId keeps a folder out
    // of its own destination list), same FolderOperations.move() call.
    getFolderMoveDestinations: (folderId) =>
      buildMoveDestinationItems(membershipSelector, folderId),
    onMoveFolder: (folderId, destinationFolderId) =>
      void folderOperations.move(folderId, destinationFolderId),

    // Discrete-commit only, never rejects — see SidebarRowActions'
    // onResourceTitleCommit doc comment for why a resource rename has no
    // synchronous collision pre-check the way onNoteTitleCommit/
    // onFolderTitleCommit do.
    onResourceTitleCommit: (resourceId, value) => {
      void resourceOperations.renameResource(resourceId, value);
    },
    // Same no-confirmation shape as onArchiveNote above — a resource, like
    // a page, is always a single leaf with nothing nested inside it.
    onArchiveResource: (resourceId) =>
      void resourceOperations.archiveResource(resourceId),
    // Same flow as Note/Folder's own Move (buildMoveDestinationItems +
    // *Operations.move), plus the Assets/ folder appended as a selectable
    // destination — see buildResourceMoveDestinationItems' own doc comment
    // for why that's specific to Resource Move.
    resourceMoveDestinations: buildResourceMoveDestinationItems(membershipSelector, query),
    onMoveResource: (resourceId, destinationFolderId) =>
      void resourceOperations.moveResource(resourceId, destinationFolderId),

    // Location-actions pipeline — read-only OS/clipboard actions, so they
    // read straight from `vault` (getPage/getFolder/getResource + the
    // already-public `vault.root`) rather than going through
    // PageOperations/FolderOperations/ResourceOperations/the Gate, which
    // own writes, not this. revealLocationInFinder/copyLocationPath (below)
    // are the one shared implementation for all three entity kinds.
    onRevealPageInFinder: (pageId) => revealLocationInFinder(vault.getPage(pageId)?.path),
    onCopyPagePath: (pageId, format) =>
      copyLocationPath(vault.getPage(pageId), 'page', format),
    onRevealFolderInFinder: (folderId) =>
      revealLocationInFinder(vault.getFolder(folderId)?.path),
    onCopyFolderPath: (folderId, format) =>
      copyLocationPath(vault.getFolder(folderId), 'folder', format),
    onRevealResourceInFinder: (resourceId) =>
      revealLocationInFinder(vault.getResource(resourceId)?.path),
    onCopyResourcePath: (resourceId, format) =>
      copyLocationPath(vault.getResource(resourceId), 'resource', format),
  };
  // Everything but "which row's menu is open" is still the shared
  // rowActions object above — archive/delete/duplicate/move/toggle-favorite
  // all dispatch through the same PageOperations/FolderOperations calls
  // regardless of which list triggered them. Only openMenuId/onOpenMenu/
  // onCloseMenu are overridden, to this list's own state, so a Favorites
  // row's menu opening never toggles open the Workspace row for the same
  // page ID (see favoriteOpenMenuId above).
  const favoriteRowActions: SidebarRowActions = {
    ...rowActions,
    openMenuId: favoriteOpenMenuId,
    onOpenMenu: (id) => setFavoriteOpenMenuId(id),
    onCloseMenu: () => setFavoriteOpenMenuId(null),
  };
  const onShortcut = buildNotesShortcutHandler(navigation, pageOperations);
  const favoriteItems = getFavoriteItems(query, effectivePageState);
  // A pending (not-yet-persisted) root-level folder counts as non-empty too
  // — otherwise clicking "+" on an empty section would force it open via
  // the actions button below, only for the empty-guard here to immediately
  // hide the very NewFolderRow that click was meant to reveal.
  const isFoldersEmpty =
    membershipSelector.getWorkspaceFolders().length === 0 &&
    membershipSelector.getNotesChildPages(null).length === 0 &&
    membershipSelector.getRootResources().length === 0 &&
    pendingNewFolder?.parentId !== null;

  // A synchronous pre-check only (FolderOperations.canCreate()) — mirrors
  // onNoteTitleCommit/onFolderTitleCommit above: returning `false` lets
  // NewFolderRow's own EditableText reject the commit (stay open, shake,
  // caret at end, typed value preserved) for a duplicate sibling name,
  // instead of auto-suffixing the way FolderPathResolver.createFolderPath()
  // does for every other create() caller (unchanged — see canCreate()'s own
  // doc comment). Only once a unique name passes does the actual create()
  // call happen, fired-and-forgotten below.
  function handleCommitNewFolder(
    name: string,
    parentId: string | null
  ): void | boolean {
    if (!folderOperations.canCreate(name, parentId)) {
      return false;
    }

    void createNewFolder(name, parentId);
  }

  // Only cleared once the Gate call settles (success or failure) — this is
  // what lets the temporary row stay visible until the real Folder is
  // ready to take its place via the Vault's own notification flow, rather
  // than clearing optimistically and leaving a gap.
  async function createNewFolder(
    name: string,
    parentId: string | null
  ): Promise<void> {
    try {
      await folderOperations.create(name, parentId);
    } finally {
      setPendingNewFolder(null);
    }
  }

  return (
    <View navigation={<NotesShortcuts onShortcut={onShortcut} />}>
      <FavoritesSection
        isEmpty={favoriteItems.length === 0}
        title={getSystemLocationPresentation('favorites').label}
        isCollapsible
        isExpanded={workspace.isSectionExpanded('favorites')}
        onExpandedChange={() => workspace.toggleSectionExpanded('favorites')}
        onClick={() => navigation.openFavorites()}
      >
        <FavoriteList
          items={favoriteItems}
          workspace={workspace}
          resolveWikiLink={resolveWikiLink}
          resolveTag={resolveTag}
          onOpenPage={(id) => {
            onOpen(id);
          }}
          onOpenFolder={(id) => {
            onOpenFolder(id);
          }}
          rowActions={favoriteRowActions}
        />
      </FavoritesSection>
      <Section
        hasHeader
        title={getSystemLocationPresentation('workspace').label}
        isCollapsible
        // isTitleToggle
        isEmpty={isFoldersEmpty}
        isExpanded={workspace.isSectionExpanded('folders')}
        onExpandedChange={(expanded) =>
          workspace.setSectionExpanded('folders', expanded)
        }
        onClick={() => navigation.openWorkspace()}
        actions={
          <Button
            size="small"
            variant="ghost"
            interaction="subtle"
            isIconOnly
            onClick={() => {
              if (!workspace.isSectionExpanded('folders')) {
                workspace.toggleSectionExpanded('folders');
              }
              setPendingNewFolder({ parentId: null });
            }}
          >
            <AppIcon icon="plus" />
          </Button>
        }
      >
        <FolderTree
          query={query}
          membershipSelector={membershipSelector}
          workspace={workspace}
          parentId={null}
          level={0}
          pendingNewFolder={pendingNewFolder}
          onCommitNewFolder={handleCommitNewFolder}
          onCancelNewFolder={() => setPendingNewFolder(null)}
          rowActions={rowActions}
          resolveWikiLink={resolveWikiLink}
          resolveTag={resolveTag}
          onPageClick={onOpen}
          onDraftPageClick={onOpenDraft}
          onFolderClick={(folder) => {
            onOpenFolder(folder.id);
          }}
          onResourceClick={onOpenResourceImage}
          onCreateNote={(folderId) => {
            // ADR-017: opens an unpersisted draft scoped to this folder —
            // openDraft() already opens the session/workspace itself, so
            // no composed .open() call is needed here, mirroring the
            // root-level 'new-note' shortcut in buildNotesShortcutHandler.
            void pageOperations.openDraft({ folderId });
          }}
        />
      </Section>
      <Dialog
        open={confirmation.pending !== null}
        onClose={confirmation.cancel}
        size="medium"
      >
        {confirmation.pending && (
          <Confirmation
            title={confirmation.pending.title}
            description={confirmation.pending.message}
            confirmLabel={confirmation.pending.confirmLabel}
            onConfirm={confirmation.confirm}
            onCancel={confirmation.cancel}
          />
        )}
      </Dialog>
    </View>
  );
}
