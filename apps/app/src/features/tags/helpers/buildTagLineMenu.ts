import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceActionHandlers } from '@core/presentation/resourceActions/resourceActionTypes';

/**
 * The right-click menu of a tag's matching line — in the Tags sidebar (`TagContextEntry`) and the Tag
 * collection alike: Show in note, and nothing else (a line is a reference into a note, not a note, so none of
 * the note's own actions apply). `onShowInNote` is the line's existing opener — open the source note and
 * highlight that line — never a second navigation mechanism.
 */
export function buildTagLineMenu(onShowInNote: () => void): {
  menu: OverflowMenuItemConfig[];
  handlers: ResourceActionHandlers;
} {
  return {
    menu: buildResourceActionMenu('tag-line', {}, 'context'),
    handlers: { 'open-in-note': onShowInNote },
  };
}
