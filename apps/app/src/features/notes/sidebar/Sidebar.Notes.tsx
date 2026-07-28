import { useState } from 'react';
import { AppIcon } from '@shared/icon';
import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { notesNavigation } from '@features/notes/mock/Navigation';
import { renderNotesTree } from '../helpers/renderNotesTree';
import { renderFavorites } from '../helpers/renderFavorites';
// Vault
import type { Vault } from '@core/vault/models/Vault';
import { RESERVED_FOLDER_NAMES } from '@core/vault/initialize/ReservedResources';

interface NotesProps {
  vault: Vault;
  onOpen(pageId: string): void;
  onOpenFolder(folderId: string): void;
}

export function Notes({ vault, onOpen, onOpenFolder }: NotesProps) {
  const [isFavoritesExpanded, setFavoritesExpanded] = useState(false);
  const [isFoldersExpanded, setFoldersExpanded] = useState(false);
  const notes = Array.from(vault.notes());
  const folders = Array.from(vault.folders()).filter(
    (folder) =>
      !(folder.parentId === null && RESERVED_FOLDER_NAMES.has(folder.name))
  );

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
        {renderFavorites(notes, folders)}
      </Section>
      <Section
        hasHeader
        title="Folders"
        isCollapsible
        isExpanded={isFoldersExpanded}
        onExpandedChange={setFoldersExpanded}
        onClick={() => {}}
      >
        {renderNotesTree({
          folders,
          pages: notes,
          parentId: null,
          level: 0,
          onPageClick: (page) => {
            onOpen(page.id);
          },
          onFolderClick: (folder) => {
            onOpenFolder(folder.id);
          },
        })}
      </Section>
    </View>
  );
}
