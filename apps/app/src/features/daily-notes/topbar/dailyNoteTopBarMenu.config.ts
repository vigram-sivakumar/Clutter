import type { Page } from '@core/vault/models/Page';
import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';

/**
 * Archive/Restore is a status-dependent toggle, not two statically-present
 * items — see noteTopBarMenu.config.ts for the same pattern.
 */
export function buildDailyNoteTopBarMenu(page: Page): TopBarMenuItemConfig[] {
  return [
    {
      id: 'add-a-description',
      label: 'Add a description',
      icon: 'description',
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
