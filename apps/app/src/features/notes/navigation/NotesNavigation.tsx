import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';

import { notesNavigation } from './notesNavigation.config';

export function NotesNavigation() {
  return (
    <Section>
      {notesNavigation.map((navigation) => (
        <Navigation
          key={navigation.id}
          title={navigation.title}
          leading={
            <AppIcon icon={navigation.icon} emoji={navigation.emoji} />
          }
          onClick={() => {}}
        />
      ))}
    </Section>
  );
}
