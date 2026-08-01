import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';
import type { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';

import { buildNotesShortcutHandler } from '@features/notes/shortcuts/buildNotesShortcutHandler';
import { NotesShortcuts } from '@features/notes/shortcuts/NotesShortcuts';
import { FolderTree } from './FolderTree';
import { FavoriteList } from './FavoriteList';
import { getFavoriteItems } from '../helpers/getFavoriteItems';

interface NotesProps {
  query: VaultQuery;
  workspace: Workspace;
  navigation: NavigationRouter;
  pageOperations: PageOperations;
  onOpen(pageId: string): void;
  onOpenFolder(folderId: string): void;
}

export function Notes({
  query,
  workspace,
  navigation,
  pageOperations,
  onOpen,
  onOpenFolder,
}: NotesProps) {
  const [isFavoritesExpanded, setFavoritesExpanded] = useState(false);
  const [isFoldersExpanded, setFoldersExpanded] = useState(false);
  const onShortcut = buildNotesShortcutHandler(navigation, pageOperations);

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
      >
        <FolderTree
          query={query}
          workspace={workspace}
          parentId={null}
          level={0}
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
