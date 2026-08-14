import type {
  TopBarMenuItemConfig,
  TopBarPageState,
} from '@app/layouts/page/topbar/ResourceTopBarActions';
import {
  ARCHIVE_ACTION_LABEL,
  DELETE_ACTION_LABEL,
} from '@core/presentation/resourceActionLabels';

/**
 * Archive/Restore is a status-dependent toggle, not two statically-present
 * items — see noteTopBarMenu.config.ts for the same pattern, including the
 * `'draft'` state's disabled-not-omitted treatment (ADR-017 Decision item 9).
 * No favorite item: Daily Notes deliberately do not support favoriting
 * (unlike Note/Folder) — see noteTopBarMenu.config.ts/folderTopBarMenu.config.ts
 * for that capability.
 */
export function buildDailyNoteTopBarMenu(
  state: TopBarPageState
): TopBarMenuItemConfig[] {
  const persisted = state !== 'draft';

  return [
    {
      id: 'add-a-description',
      label: 'Add a description',
      icon: 'description',
    },
    {
      // Never disabled for state === 'draft' — unlike archive/delete/
      // restore, this item works on an unpersisted Daily Note draft:
      // PageOperations.updateMetadata() promotes it via the same
      // persistDraft() path save()'s body trigger already uses (ADR-017's
      // second amendment, Cover Image milestone). Setting a cover is an
      // explicit, affirmative user action, not incidental interaction with
      // an unopened draft, so it's exactly the kind of "committed,
      // persistent, user-owned change" this ADR's promotion rule already
      // covers for the body.
      id: 'add-cover-image',
      label: 'Cover image',
      icon: 'image',
    },
    {
      id: 'version-history',
      label: 'Version history',
      icon: 'clock',
    },
    state === 'archived'
      ? {
          id: 'restore',
          label: 'Restore',
          icon: 'restore',
          disabled: !persisted,
        }
      : {
          id: 'archive',
          label: ARCHIVE_ACTION_LABEL,
          icon: 'archive',
          disabled: !persisted,
        },
    {
      id: 'delete',
      label: DELETE_ACTION_LABEL,
      icon: 'trash',
      disabled: !persisted,
    },
  ];
}
