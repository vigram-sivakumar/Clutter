// import { useState } from 'react';
import { View } from './Sidebar.View';
import { Section } from '../Section';
import { Navigation } from '../entry/Entry.Navigation';
import { notesNavigation } from '../mock/mock.note';

export function Notes() {
  // const [isFavoritesExpanded, setFavoritesExpanded] = useState(false);
  // const [isFoldersExpanded, setFoldersExpanded] = useState(false);

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
    ></View>
  );
}
