import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import type { NavigationItem } from '@app/layouts/sidebar/navigation/NavigationItem';

import { notesShortcuts, type NotesShortcutId } from './notesShortcuts.config';
import { testIds } from '@shared/testing/selectors';

interface NotesShortcutsProps {
  onShortcut: (id: NotesShortcutId) => void;
}

// Notes' entries don't all declare `disabled` (only Tasks'/Tags' single
// entry does today) — this component renders any NavigationItem shape,
// disabled or not, so it reads the config through that shared shape
// rather than notesShortcuts' own narrower inferred literal type.
const items: readonly NavigationItem<NotesShortcutId>[] = notesShortcuts;

export function NotesShortcuts({ onShortcut }: NotesShortcutsProps) {
  return (
    <Section>
      {items.map((shortcut) => (
        <Navigation
          key={shortcut.id}
          data-testid={
            shortcut.id === 'new-note' ? testIds.sidebar.createNoteButton : undefined
          }
          title={shortcut.title}
          leading={<AppIcon icon={shortcut.icon} />}
          disabled={shortcut.disabled}
          onClick={() => onShortcut(shortcut.id)}
        />
      ))}
    </Section>
  );
}
