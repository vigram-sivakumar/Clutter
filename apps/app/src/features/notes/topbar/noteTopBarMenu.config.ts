import type {
  TopBarMenuItemConfig,
  TopBarPageState,
} from '@app/layouts/page/topbar/ResourceTopBarActions';

/**
 * Archive/Restore is a status-dependent toggle, not two statically-present
 * items: a page is only ever active or archived, never both, so the menu
 * shows exactly one of the two. Delete is always present regardless of
 * status. For a draft (`state === 'draft'`, ADR-017), neither has
 * happened yet — 'archive' is shown, alongside 'delete', but both
 * `disabled` (ADR-017 Decision item 9), never omitted.
 */
export function buildNoteTopBarMenu(state: TopBarPageState): TopBarMenuItemConfig[] {
  const persisted = state !== 'draft';

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
