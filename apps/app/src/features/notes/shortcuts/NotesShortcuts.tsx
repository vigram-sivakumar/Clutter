import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';

import { notesShortcuts, type NotesShortcutId } from './notesShortcuts.config';

interface NotesShortcutsProps {
  onShortcut: (id: NotesShortcutId) => void;
}

export function NotesShortcuts({ onShortcut }: NotesShortcutsProps) {
  return (
    <Section>
      {notesShortcuts.map((shortcut) => (
        <Navigation
          key={shortcut.id}
          title={shortcut.title}
          leading={<AppIcon icon={shortcut.icon} />}
          onClick={() => onShortcut(shortcut.id)}
        />
      ))}
    </Section>
  );
}
