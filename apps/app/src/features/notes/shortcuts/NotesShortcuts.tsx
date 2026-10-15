import { AppIcon } from '@shared/icon';
import { Section } from '@app/layouts/sidebar/section/Section';
import { Navigation } from '@app/layouts/sidebar/navigation/Navigation';
import type { NavigationItem } from '@app/layouts/sidebar/navigation/NavigationItem';

import { notesShortcuts, type NotesShortcutId } from './notesShortcuts.config';
import { testIds } from '@shared/testing/selectors';

interface NotesShortcutsProps {
  onShortcut: (id: NotesShortcutId) => void;
  /**
   * The reserved folder behind each of these entries, when it exists: the entry is then a drop
   * destination (marked for dropTarget.ts) — Templates takes notes and folders, Inbox notes only,
   * Assets assets only (what each accepts is dropTarget.ts's DROP_ZONE_ACCEPTS).
   */
  dropFolderIds?: Partial<Record<'templates' | 'inbox' | 'assets', string>>;
}

// Notes' entries don't all declare `disabled` (only Tasks'/Tags' single
// entry does today) — this component renders any NavigationItem shape,
// disabled or not, so it reads the config through that shared shape
// rather than notesShortcuts' own narrower inferred literal type.
const items: readonly NavigationItem<NotesShortcutId>[] = notesShortcuts;

function dropFolderFor(id: NotesShortcutId, folders: NotesShortcutsProps['dropFolderIds']): string | undefined {
  return id === 'templates' || id === 'inbox' || id === 'assets' ? folders?.[id] : undefined;
}

export function NotesShortcuts({ onShortcut, dropFolderIds }: NotesShortcutsProps) {
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
          data-drop-folder-id={dropFolderFor(shortcut.id, dropFolderIds)}
          data-drop-zone={dropFolderFor(shortcut.id, dropFolderIds) ? shortcut.id : undefined}
          onClick={() => onShortcut(shortcut.id)}
        />
      ))}
    </Section>
  );
}
