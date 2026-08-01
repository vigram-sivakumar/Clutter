import type { Page } from '@core/vault/models/Page';
import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';

/**
 * Archive/Restore is a status-dependent toggle, not two statically-present
 * items: a page is only ever active or archived, never both, so the menu
 * shows exactly one of the two. Delete is always present regardless of
 * status.
 */
export function buildNoteTopBarMenu(page: Page): TopBarMenuItemConfig[] {
  return [
    {
      id: 'add-a-description',
      label: 'Add a description',
      icon: 'description',
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      icon: 'copy',
    },
    {
      id: 'add-to-favorite',
      label: 'Add to favorite',
      icon: 'favouriteOutline',
    },
    {
      id: 'version-history',
      label: 'Version history',
      icon: 'clock',
    },
    page.metadata.status === 'archived'
      ? { id: 'restore', label: 'Restore', icon: 'archive' }
      : { id: 'archive', label: 'Archive', icon: 'archive' },
    {
      id: 'delete',
      label: 'Delete',
      icon: 'trash',
    },
  ];
}
