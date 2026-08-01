import type { NavigationRouter } from '@core/application/navigation/NavigationRouter';

import type { TagsShortcutId } from './tagsShortcuts.config';

export function buildTagsShortcutHandler(
  navigation: NavigationRouter
): (id: TagsShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'create-tag':
        navigation.createTag();
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown tags shortcut: ${_exhaustive}`);
      }
    }
  };
}
