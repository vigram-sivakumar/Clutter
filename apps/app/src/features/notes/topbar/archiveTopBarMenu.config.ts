import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';

/** the Archive page's one More-actions item: permanently deletes everything in the Archive. */
export const DELETE_ALL_ARCHIVED_ACTION_ID = 'delete-all';

/** What the Archive's "Empty archive" confirmation says: the items move to the macOS Trash (ADR-072), where they can be restored. */
export const DELETE_ALL_ARCHIVED_CONFIRMATION = {
  title:
    'Are you sure you want to permanently delete the items in the archive?',
  message:
    'The items will be moved to the macOS Trash, where you can restore them',
  confirmLabel: 'Empty archive',
} as const;

/**
 * the Archive page's More-actions menu. Page-level only — archived rows carry no inline
 * Restore/Delete. Disabled (not omitted) when the Archive is already empty, so there is nothing
 * to confirm and nothing to delete.
 */
export function buildArchiveTopBarMenu(
  isEmpty: boolean
): TopBarMenuItemConfig[] {
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
