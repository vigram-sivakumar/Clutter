import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import { FavoritesSection } from '@app/layouts/sidebar/section/FavoritesSection';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';
import type { EffectivePageState } from '@core/application/page/EffectivePageState';
import type { MembershipSelector } from '@core/application/membership/MembershipSelector';

import { buildNotesShortcutHandler } from '@features/notes/shortcuts/buildNotesShortcutHandler';
import { NotesShortcuts } from '@features/notes/shortcuts/NotesShortcuts';
import { FolderTree, type PendingNewFolder } from './FolderTree';
import { FavoriteList } from './FavoriteList';
import { getFavoriteItems } from '../helpers/getFavoriteItems';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';
import { getSystemLocationPresentation } from '@core/presentation/systemPresentation';

interface NotesProps {
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
        onExpandedChange={() => workspace.toggleSectionExpanded('folders')}
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
          onPageClick={onOpen}
          onDraftPageClick={onOpenDraft}
          onFolderClick={(folder) => {
            onOpenFolder(folder.id);
          }}
        />
      </Section>
    </View>
  );
}
