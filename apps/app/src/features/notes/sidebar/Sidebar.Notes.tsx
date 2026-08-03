import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { FolderOperations } from '@core/application/folder/FolderOperations';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';

import { buildNotesShortcutHandler } from '@features/notes/shortcuts/buildNotesShortcutHandler';
import { NotesShortcuts } from '@features/notes/shortcuts/NotesShortcuts';
import { FolderTree, type PendingNewFolder } from './FolderTree';
import { FavoriteList } from './FavoriteList';
import { getFavoriteItems } from '../helpers/getFavoriteItems';
import { Button } from '@components/button/Button';
import { AppIcon } from '@shared/icon';

interface NotesProps {
  query: VaultQuery;
  workspace: Workspace;
  navigation: NavigationRouter;
  pageOperations: PageOperations;
  folderOperations: FolderOperations;
  onOpen(pageId: string): void;
  onOpenFolder(folderId: string): void;
}

export function Notes({
  query,
  workspace,
  navigation,
  pageOperations,
  folderOperations,
  onOpen,
  onOpenFolder,
}: NotesProps) {
  const [isFavoritesExpanded, setFavoritesExpanded] = useState(true);
  const [isFoldersExpanded, setFoldersExpanded] = useState(true);
  const [pendingNewFolder, setPendingNewFolder] = useState<PendingNewFolder | null>(
    null
  );
  const onShortcut = buildNotesShortcutHandler(navigation, pageOperations);

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
      <Section
        hasHeader
        title="Favorites"
        isCollapsible
        isExpanded={isFavoritesExpanded}
        onExpandedChange={setFavoritesExpanded}
        onClick={() => {}}
      >
        <FavoriteList
          items={getFavoriteItems(query)}
          workspace={workspace}
          onOpenPage={(id) => {
            onOpen(id);
          }}
          onOpenFolder={(id) => {
            onOpenFolder(id);
          }}
        />
      </Section>
      <Section
        hasHeader
        title="Folders"
        isCollapsible
        isExpanded={isFoldersExpanded}
        onExpandedChange={setFoldersExpanded}
        onClick={() => {}}
        actions={
          <Button
            size="small"
            variant="ghost"
            interaction="subtle"
            isIconOnly
            onClick={() => {
              setFoldersExpanded(true);
              setPendingNewFolder({ parentId: null });
            }}
          >
            <AppIcon icon="plus" />
          </Button>
        }
      >
        <FolderTree
          query={query}
          workspace={workspace}
          parentId={null}
          level={0}
          pendingNewFolder={pendingNewFolder}
          onCommitNewFolder={handleCommitNewFolder}
          onCancelNewFolder={() => setPendingNewFolder(null)}
          onPageClick={(page) => {
            onOpen(page.id);
          }}
          onFolderClick={(folder) => {
            onOpenFolder(folder.id);
          }}
        />
      </Section>
    </View>
  );
}
