import type { ResourceActionHandlers } from '@core/presentation/resourceActions/resourceActionTypes';
import type { TagRowActions } from './renderTags';

/**
 * The id → operation map for a Tag row's overflow menu (ADR-048). 'change-icon' is intercepted by
 * the row's own picker before dispatch.
 */
export function buildTagMenuHandlers(
  rowActions: Pick<TagRowActions, 'onStartRename' | 'onTogglePinTag' | 'onDeleteTag'>,
  tagName: string,
  isPinned: boolean
): ResourceActionHandlers {
  return {
    rename: () => rowActions.onStartRename(tagName),
    'toggle-pin': () => rowActions.onTogglePinTag(tagName, !isPinned),
    delete: () => rowActions.onDeleteTag(tagName),
  };
}
