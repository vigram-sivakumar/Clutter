import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { Vault } from '@core/vault/models/Vault';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';

import { buildNotesShortcutHandler } from '@features/notes/shortcuts/buildNotesShortcutHandler';
import { NotesShortcuts } from '@features/notes/shortcuts/NotesShortcuts';
import { FolderTree, type PendingNewFolder, type SidebarRowActions } from './FolderTree';
import { FavoriteList } from './FavoriteList';
import { getFavoriteItems } from '../helpers/getFavoriteItems';
import { deleteFolderWithConfirmation } from '../helpers/deleteFolderWithConfirmation';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';

interface NotesProps {
  vault: Vault;
  query: VaultQuery;
  workspace: Workspace;
  navigation: NavigationRouter;
  pageOperations: PageOperations;
  folderOperations: FolderOperations;
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
}

export function Notes({
  vault,
  query,
  workspace,
  navigation,
  pageOperations,
  folderOperations,
  effectivePageState,
  membershipSelector,
  onOpen,
  onOpenFolder,
  onOpenDraft,
}: NotesProps) {
  const [pendingNewFolder, setPendingNewFolder] =
    useState<PendingNewFolder | null>(null);

  // Single owner of "which row's overflow menu/rename session is open" —
  // shared by every row FolderTree recurses through (SidebarRowActions),
  // the mechanism that guarantees only one menu is ever open at a time and
  // that starting a rename elsewhere closes any other in-progress one.
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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

    onNoteTitleEdit: (pageId, value) => pageOperations.commitTitle(pageId, value),
    onNoteTitleFlush: (pageId) => void pageOperations.requestTitleSave(pageId),
    onNoteTitleCancel: (pageId) => pageOperations.cancelTitleEdit(pageId),
    onDraftTitleCommit: (pageId, value) => void pageOperations.updateDraftTitle(pageId, value),
    onArchiveNote: (pageId) => void pageOperations.archive(pageId),
    onDeleteNote: (pageId) => void pageOperations.delete(pageId),

    onFolderTitleEdit: (folderId, value) => folderOperations.commitName(folderId, value),
    onFolderTitleFlush: (folderId) => void folderOperations.requestNameSave(folderId),
    onFolderTitleCancel: (folderId) => folderOperations.cancelNameEdit(folderId),
    onDeleteFolder: (folderId) => {
      void (async () => {
        const deleted = await deleteFolderWithConfirmation(vault, folderOperations, folderId);

        // Mirrors PageHost's onDeleteFolder: the just-deleted folder can no
        // longer be the active target if it was one.
        if (deleted && workspace.activeFolderId === folderId) {
          navigation.openWorkspace();
        }
      })();
    },
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
    pendingNewFolder?.parentId !== null;

  // Only cleared once the Gate call settles (success or failure) — this is
  // what lets the temporary row stay visible until the real Folder is
  // ready to take its place via the Vault's own notification flow, rather
  // than clearing optimistically and leaving a gap.
  async function handleCommitNewFolder(
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
          onOpenPage={(id) => {
            onOpen(id);
          }}
          onOpenFolder={(id) => {
            onOpenFolder(id);
          }}
        />
      </FavoritesSection>
      <Section
        hasHeader
        title={getSystemLocationPresentation('workspace').label}
        isCollapsible
        isEmpty={isFoldersEmpty}
        isExpanded={workspace.isSectionExpanded('folders')}
        onExpandedChange={(expanded) => workspace.setSectionExpanded('folders', expanded)}
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
          onPageClick={onOpen}
          onDraftPageClick={onOpenDraft}
          onFolderClick={(folder) => {
            onOpenFolder(folder.id);
          }}
          onCreateNote={(folderId) => {
            // ADR-017: opens an unpersisted draft scoped to this folder —
            // openDraft() already opens the session/workspace itself, so
            // no composed .open() call is needed here, mirroring the
            // root-level 'new-note' shortcut in buildNotesShortcutHandler.
            void pageOperations.openDraft({ folderId });
          }}
        />
      </Section>
    </View>
  );
}
