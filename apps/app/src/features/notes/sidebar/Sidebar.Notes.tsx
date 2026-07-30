import { useState } from 'react';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import { NotesNavigation } from '@features/notes/navigation/NotesNavigation';
import { FolderTree } from './FolderTree';
import { FavoriteList } from './FavoriteList';
// Vault
import type { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import type { Workspace } from '@core/workspace/Workspace';

interface NotesProps {
  vault: Vault;
  workspace: Workspace;
  onOpen(pageId: string): void;
  onOpenFolder(folderId: string): void;
}

export function Notes({ vault, workspace, onOpen, onOpenFolder }: NotesProps) {
  const [isFavoritesExpanded, setFavoritesExpanded] = useState(false);
  const [isFoldersExpanded, setFoldersExpanded] = useState(false);
  const query = new VaultQuery(vault);

  return (
    <View navigation={<NotesNavigation />}>
      <Section
        hasHeader
        title="Favorites"
        isCollapsible
        isExpanded={isFavoritesExpanded}
        onExpandedChange={setFavoritesExpanded}
        onClick={() => {}}
      >
        <FavoriteList
          items={query.getFavorites()}
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
