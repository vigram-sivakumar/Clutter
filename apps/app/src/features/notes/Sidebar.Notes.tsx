import { useState } from 'react';

import { View } from '@components/sidebar/View/Sidebar.View';
import { Section } from '@components/sidebar/section/Sidebar.Section';
import { Navigation } from '@components/sidebar/navigation/Navigation';
import { notesNavigation } from '@features/notes/mock/Mock.Navigation';
import { folders as foldersData } from '@features/notes/mock/Mock.Folder';
import { notes as notesData } from '@features/notes/mock/Mock.Note';
import { renderEntryTree } from '@features/notes/folder/renderEnterTree';

export function Notes() {
  const [isFavoritesExpanded, setFavoritesExpanded] = useState(false);
  const [isFoldersExpanded, setFoldersExpanded] = useState(true);
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  console.log('Selected:', selectedEntryIds);

  return (
    <View
      navigation={
        <Section>
          {notesNavigation.map((navigation) => {
            const Icon = navigation.icon;

            return (
              <Navigation
                key={navigation.id}
                title={navigation.title}
                leading={<Icon />}
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
      />

      <Section
        hasHeader
        title="Folders"
        isCollapsible
        isExpanded={isFoldersExpanded}
        onExpandedChange={setFoldersExpanded}
        onClick={() => {}}
      >
        {renderEntryTree({
          folders: foldersData,
          notes: notesData,
          parentId: null,
          level: 0,
          expandedFolderIds,
          setExpandedFolderIds,
          selectedEntryIds,

          setSelectedEntryIds,
        })}
      </Section>
    </View>
  );
}
