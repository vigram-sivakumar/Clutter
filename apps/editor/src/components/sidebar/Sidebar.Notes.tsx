import { Fragment, useState } from 'react';
import { View } from './Sidebar.View';
import { Section } from '../Section';
import { Navigation } from '../entry/Entry.Navigation';
import { notesNavigation, foldersData } from '../mock/mock.note';
import { Folder } from '../entry/Entry.Folder';

export function getChildren(parentId: string) {
  return foldersData.filter((folder) => folder.parentId === parentId);
}

export function Notes() {
  const [isFavoritesExpanded, setFavoritesExpanded] = useState(false);
  const [isFoldersExpanded, setFoldersExpanded] = useState(true);

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
      {/* Favorites */}
      <Section
        hasHeader
        title="Favorites"
        isCollapsible
        isExpanded={isFavoritesExpanded}
        onExpandedChange={setFavoritesExpanded}
        onClick={() => {}}
      ></Section>
      {/* Folders */}
      <Section
        hasHeader
        title="Folders"
        isCollapsible
        isExpanded={isFoldersExpanded}
        onExpandedChange={setFoldersExpanded}
        onClick={() => {}}
      >
        {foldersData
          .filter((folder) => folder.parentId === null)
          .map((folder) => {
            const isFolderEmpty = getChildren(folder.id).length === 0;
            return (
              <Fragment key={folder.id}>
                <Folder
                  title={folder.title}
                  isEmpty={isFolderEmpty}
                  onClick={() => {}}
                />
                {getChildren(folder.id).map((child) => {
                  const isFolderEmpty = getChildren(child.id).length === 0;
                  return (
                    <Folder
                      key={child.id}
                      title={child.title}
                      isEmpty={isFolderEmpty}
                    />
                  );
                })}
              </Fragment>
            );
          })}
      </Section>
    </View>
  );
}
