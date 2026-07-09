import { useState } from 'react';

import { AppIcon } from '@shared/icon';

import { View } from '@app/layouts/sidebar/View/Sidebar.View';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import { notesNavigation } from '@features/notes/mock/Navigation';
import { folders as foldersData } from '@features/notes/mock/Folder';
import { notes as notesData } from '@features/notes/mock/Note';
import { renderNotesTree } from '../helpers/renderNotesTree';
import { renderFavorites } from '../helpers/renderFavorites';

export function Notes() {
  const [isFavoritesExpanded, setFavoritesExpanded] = useState(false);
  const [isFoldersExpanded, setFoldersExpanded] = useState(false);
  // const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  // const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);

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
        {renderFavorites(notesData, foldersData)}
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
          folders: foldersData,
          notes: notesData,
          parentId: null,
          level: 0,
        })}
      </Section>
    </View>
  );
}
