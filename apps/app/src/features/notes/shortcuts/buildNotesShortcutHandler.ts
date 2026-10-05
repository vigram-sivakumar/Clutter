import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';
import type { PageOperations } from '@core/application/page/PageOperations';

import type { NotesShortcutId } from './notesShortcuts.config';

export function buildNotesShortcutHandler(
  navigation: NavigationRouter,
  pageOperations: PageOperations
): (id: NotesShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'new-note':
        // ADR-017: opens an unpersisted draft, not an immediate Gate
        // write — openDraft() already opens the session/workspace itself,
        // unlike create(), so no composed .open() call is needed here.
        void pageOperations.openDraft({ folderId: null });
        break;
      case 'inbox':
        navigation.openInbox();
        break;
      case 'templates':
        navigation.openTemplates();
        break;
      case 'assets':
        navigation.openAssets();
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown notes shortcut: ${_exhaustive}`);
      }
    }
  };
}
