import { useState } from 'react';
import { AppIcon } from '@shared/icon';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { notesNavigation } from '@features/notes/mock/Navigation';
import { FolderTree } from './FolderTree';
import { FavoriteList } from './FavoriteList';
// Vault
import type { Vault } from '@core/vault/models/Vault';
import { VaultQuery } from '@core/vault/queries/VaultQuery';
import { useVault } from '@app/hooks/useVault';

interface NotesProps {
  vault: Vault;
  onOpen(pageId: string): void;
  onOpenFolder(folderId: string): void;
}

export function Notes({ vault, onOpen, onOpenFolder }: NotesProps) {
  useVault(vault);
  const [isFavoritesExpanded, setFavoritesExpanded] = useState(false);
  const [isFoldersExpanded, setFoldersExpanded] = useState(false);
  const query = new VaultQuery(vault);

  return (
    <View
      navigation={
        <Section>
          {notesNavigation.map((navigation) => {
            return (
              <Navigation
                key={navigation.id}
                title={navigation.title}
                leading={
                  <AppIcon icon={navigation.icon} emoji={navigation.emoji} />
                }
                onClick={() => {}}
              />
            );
          })}
        </Section>
      }
    >
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
