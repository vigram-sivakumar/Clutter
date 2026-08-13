import type {
  TopBarMenuItemConfig,
  TopBarPageState,
} from '@app/layouts/page/topbar/ResourceTopBarActions';
import {
  ARCHIVE_ACTION_LABEL,
  DELETE_ACTION_LABEL,
  FAVORITE_ACTION_LABEL,
  UNFAVORITE_ACTION_LABEL,
} from '@core/presentation/resourceActionLabels';

/**
 * Archive/Restore is a status-dependent toggle, not two statically-present
 * items — see noteTopBarMenu.config.ts for the same pattern, including the
 * `'draft'` state's disabled-not-omitted treatment (ADR-017 Decision item 9)
 * and the `toggle-favorite` item's shared id/PageOperations.updateMetadata
 * call.
 */
export function buildDailyNoteTopBarMenu(
  state: TopBarPageState,
  isFavorite: boolean = false
): TopBarMenuItemConfig[] {
  const persisted = state !== 'draft';

  return [
    {
      id: 'add-a-description',
      label: 'Add a description',
      icon: 'description',
    },
    {
      id: 'toggle-favorite',
      label: isFavorite ? UNFAVORITE_ACTION_LABEL : FAVORITE_ACTION_LABEL,
      icon: isFavorite ? 'favouriteFilled' : 'favouriteOutline',
    },
    {
      id: 'version-history',
      label: 'Version history',
      icon: 'clock',
    },
    state === 'archived'
      ? { id: 'restore', label: 'Restore', icon: 'restore', disabled: !persisted }
      : { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive', disabled: !persisted },
    {
      id: 'delete',
      label: DELETE_ACTION_LABEL,
      icon: 'trash',
      disabled: !persisted,
    },
  ];
}
