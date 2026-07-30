import type { NavigationService } from '@core/application/navigation/NavigationService';

import type { TagsShortcutId } from './tagsShortcuts.config';

export function buildTagsShortcutHandler(
  navigation: NavigationService
): (id: TagsShortcutId) => void {
  return (id) => {
    switch (id) {
      case 'create-tag':
        navigation.createTag();
        break;
      case 'all-tag':
        navigation.openAllTags();
        break;
      default: {
        const _exhaustive: never = id;
        throw new Error(`Unknown tags shortcut: ${_exhaustive}`);
      }
    }
  };
}
