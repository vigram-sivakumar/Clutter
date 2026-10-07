import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';

/** The Trash page's one More-actions item: permanently deletes everything in the Trash. */
export const DELETE_ALL_ARCHIVED_ACTION_ID = 'delete-all';

/** What the Trash's "Empty trash" confirmation says — permanent, and not undoable. */
export const DELETE_ALL_ARCHIVED_CONFIRMATION = {
  title: 'Are you sure you want to permanently delete the items in the Trash?',
  message: 'You can’t undo this action.',
  confirmLabel: 'Empty trash',
} as const;

/**
 * The Trash page's More-actions menu. Page-level only — archived rows carry no inline
 * Restore/Delete. Disabled (not omitted) when the Trash is already empty, so there is nothing
 * to confirm and nothing to delete.
 */
export function buildArchiveTopBarMenu(isEmpty: boolean): TopBarMenuItemConfig[] {
  return [
    {
      id: DELETE_ALL_ARCHIVED_ACTION_ID,
      label: 'Empty trash',
      icon: 'trash',
      disabled: isEmpty,
    },
  ];
}
