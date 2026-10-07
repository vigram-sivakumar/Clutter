import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';

import type { TagsShortcutId } from './tagsShortcuts.config';

export function buildTagsShortcutHandler(
  navigation: NavigationRouter
): (id: TagsShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'create-tag':
        // Unreachable: TagsShortcuts opens the New tag dialog itself and never
        // forwards this click. Kept so the switch stays exhaustive.
        navigation.createTag();
        break;
      case 'tidy-up':
        // Unreachable: TagsShortcuts opens the Tidy up menu itself.
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown tags shortcut: ${_exhaustive}`);
      }
    }
  };
}
