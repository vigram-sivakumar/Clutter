import type { NavigationService } from '@core/application/navigation/NavigationService';

import type { NotesShortcutId } from './notesShortcuts.config';

export function buildNotesShortcutHandler(
  navigation: NavigationService
): (id: NotesShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'new-note':
        navigation.createNote();
        break;
      case 'all-notes':
        navigation.openAllNotes();
        break;
      case 'inbox':
        navigation.openInbox();
        break;
      case 'templates':
        navigation.openTemplates();
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown notes shortcut: ${_exhaustive}`);
      }
    }
  };
}
