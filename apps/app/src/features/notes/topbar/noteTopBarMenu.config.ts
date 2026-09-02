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
 * items: a page is only ever active or archived, never both, so the menu
 * shows exactly one of the two. For a draft (`state === 'draft'`,
 * ADR-017), neither has happened yet — 'archive' is shown `disabled`
 * (ADR-017 Decision item 9), never omitted.
 *
 * Delete is present only when `isDeletable` — the new deletion-UX product
 * decision restricts permanent Delete to a resource that is archived or a
 * descendant of the reserved Archive folder (computed by the caller,
 * buildTopBarActions.tsx, via MembershipSelector.isEffectivelyArchived +
 * the resource's own status, never re-derived here). An ordinary
 * workspace note has no Delete entry point at all — Archive is its
 * removal action instead.
 *
 * 'move-to' (re-added — ADR-013 deferred it pending a destination-picker
 * UI, now built) is `disabled` under the same rule as archive for a
 * draft (nothing on disk yet to move), and additionally for an archived
 * page — Move's approved contract excludes archived pages as a source,
 * enforced again at the Gate (PagePersistenceCoordinator.runMove) so this
 * disabled state is a UX convenience, not the only guard.
 *
 * `isFavorite` (default false, matching a draft's always-false state)
 * picks the `toggle-favorite` item's label/icon — the same id and
 * PageOperations.updateMetadata({ favorite }) call the standalone topbar
 * favorite button and every sidebar row's favorite item dispatch to.
 */
export function buildNoteTopBarMenu(
  state: TopBarPageState,
  isFavorite: boolean = false,
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
      id: 'duplicate',
      label: 'Duplicate',
      icon: 'copy',
    },
    {
      id: 'add-cover-image',
      label: 'Cover image',
      icon: 'image',
    },
    {
      id: 'move-to',
      label: 'Move to…',
      icon: 'arrowDownRight',
      disabled: !persisted || state === 'archived',
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
