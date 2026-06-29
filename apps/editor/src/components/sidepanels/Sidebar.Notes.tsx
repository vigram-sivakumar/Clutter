import { useState } from 'react';
import { View } from './Sidebar.View';
import { Section } from '../Section';
import { Navigation } from '../entry/Entry.Navigation';
import { Icons } from '../../design-system/icons';

export function Notes() {
  const [isNavigationExpanded, setNavigationExpanded] = useState(true);
  const [isFavoritesExpanded, setFavoritesExpanded] = useState(false);
  const [isFoldersExpanded, setFoldersExpanded] = useState(false);

  return (
    <View
      navigation={
        <Section
          title="Notes"
          isExpanded={isNavigationExpanded}
          onExpandedChange={setNavigationExpanded}
        >
          <Navigation
            title="New Note"
            leading=<Icons.NotePencil />
            onClick={() => {}}
          />
          <Navigation title="Inbox" leading=<Icons.Tray /> onClick={() => {}} />
          <Navigation
            title="All notes"
            leading=<Icons.Note />
            onClick={() => {}}
          />
          <Navigation
            title="Templates"
            leading=<Icons.Template />
            onClick={() => {}}
          />
        </Section>
      }
    >
      <Section
        title="Favorites"
        isExpanded={isFavoritesExpanded}
        onExpandedChange={setFavoritesExpanded}
        onClick={() => {}}
      ></Section>
      <Section
        title="Folders"
        isExpanded={isFoldersExpanded}
        onExpandedChange={setFoldersExpanded}
        onClick={() => {}}
      ></Section>
    </View>
  );
}
