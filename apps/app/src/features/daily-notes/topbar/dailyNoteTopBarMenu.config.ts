import type {
  TopBarMenuItemConfig,
  TopBarPageState,
} from '@app/layouts/page/topbar/ResourceTopBarActions';
import {
  ARCHIVE_ACTION_LABEL,
  DELETE_ACTION_LABEL,
} from '@core/presentation/resourceActionLabels';
import { buildLocationActionMenuItems } from '@core/presentation/getLocationPathRepresentations';

/**
 * Archive/Restore is a status-dependent toggle, not two statically-present
 * items — see noteTopBarMenu.config.ts for the same pattern, including the
 * `'draft'` state's disabled-not-omitted treatment (ADR-017 Decision item 9).
 * No favorite item: Daily Notes deliberately do not support favoriting
 * (unlike Note/Folder) — see noteTopBarMenu.config.ts/folderTopBarMenu.config.ts
 * for that capability.
 *
 * Delete is present only when `isDeletable` — same restriction and same
 * caller-computed boolean as noteTopBarMenu.config.ts's buildNoteTopBarMenu;
 * see its doc comment.
 */
export function buildDailyNoteTopBarMenu(
  state: TopBarPageState,
  isDeletable: boolean = false
): TopBarMenuItemConfig[] {
  const persisted = state !== 'draft';

  const items: TopBarMenuItemConfig[] = [
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
    // 'page' — a Daily Note is a Page, same as an ordinary Note.
    // Reveal in Finder/Copy path have nothing to act on for a draft (no
    // path until first save), so — like archive/restore/delete — they're
    // `disabled`, not omitted, for `state === 'draft'`.
    ...buildLocationActionMenuItems('page', { disabled: !persisted }),
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
  ];

  if (isDeletable) {
    items.push({
      id: 'delete',
      label: DELETE_ACTION_LABEL,
      icon: 'trash',
      disabled: !persisted,
    });
  }

  return items;
}
