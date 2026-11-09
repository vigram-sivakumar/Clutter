import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';

/** the Archive page's one More-actions item: permanently deletes everything in the Archive. */
export const DELETE_ALL_ARCHIVED_ACTION_ID = 'delete-all';

/** What the Archive's "Empty archive" confirmation says — permanent, and not undoable. */
export const DELETE_ALL_ARCHIVED_CONFIRMATION = {
  title: 'Are you sure you want to permanently delete the items in the archive?',
  message: 'You can’t undo this action',
  confirmLabel: 'Empty archive',
} as const;

/**
 * the Archive page's More-actions menu. Page-level only — archived rows carry no inline
 * Restore/Delete. Disabled (not omitted) when the Archive is already empty, so there is nothing
 * to confirm and nothing to delete.
 */
export function buildArchiveTopBarMenu(isEmpty: boolean): TopBarMenuItemConfig[] {
  return [
    {
      id: DELETE_ALL_ARCHIVED_ACTION_ID,
      label: 'Empty archive',
      icon: 'trash',
      variant: 'danger',
      disabled: isEmpty,
    },
  ];
}
