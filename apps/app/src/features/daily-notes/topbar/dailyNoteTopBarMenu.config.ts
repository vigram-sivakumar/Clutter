import type {
  TopBarMenuItemConfig,
  TopBarPageState,
} from '@app/layouts/page/topbar/ResourceTopBarActions';

/**
 * Archive/Restore is a status-dependent toggle, not two statically-present
 * items — see noteTopBarMenu.config.ts for the same pattern, including the
 * `'draft'` state's disabled-not-omitted treatment (ADR-017 Decision item 9).
 */
export function buildDailyNoteTopBarMenu(state: TopBarPageState): TopBarMenuItemConfig[] {
  const persisted = state !== 'draft';

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
    state === 'archived'
      ? { id: 'restore', label: 'Restore', icon: 'restore', disabled: !persisted }
      : { id: 'archive', label: 'Archive', icon: 'archive', disabled: !persisted },
    {
      id: 'delete',
      label: 'Delete',
      icon: 'trash',
      disabled: !persisted,
    },
  ];
}
