import type { TopBarMenuItemConfig } from '@app/layouts/page/topbar/ResourceTopBarActions';
import type { FolderMetadata } from '@core/vault/models/FolderMetadata';
import {
  ARCHIVE_ACTION_LABEL,
  DELETE_ACTION_LABEL,
  FAVORITE_ACTION_LABEL,
  UNFAVORITE_ACTION_LABEL,
} from '@core/presentation/resourceActionLabels';
import { buildLocationActionMenuItems } from '@core/presentation/getLocationPathRepresentations';

// 'move-to' (re-added — FolderOperations.move() and its Folder Picker UI
// now exist; ADR-013/ADR-024's implementation-sequencing amendment
// deferred this pending exactly that) is disabled while archived — Move's
// approved contract excludes archived folders as a source, enforced again
// at the Gate (PagePersistenceCoordinator.runMoveFolder) so this disabled
// state is a UX convenience, not the only guard. Archive/Restore
// (ADR-026) is a status-dependent toggle, mirroring buildNoteTopBarMenu's
// identical shape one aggregate over: a folder is only ever active or
// archived, never both, so the menu shows exactly one of the two.
// 'delete' is present only when `isDeletable` — the deletion-UX product
// decision restricts permanent Delete to a folder that is itself archived
// or a descendant of the reserved Archive folder (caller-computed in
// buildTopBarActions.tsx, same boolean/reasoning as
// noteTopBarMenu.config.ts's buildNoteTopBarMenu; see its doc comment). An
// ordinary workspace folder has no Delete entry point — Archive is its
// removal action instead. Unlike a page, this menu is only ever built for
// an ordinary folder (topBarRegistry dispatches a reserved folder to its
// own no-op renderer instead — no meaningful actions exist for one yet —
// per MembershipSelector.isSystemFolder), so no reserved-folder guard is
// needed here beyond that.
// Rename isn't a menu item — it reuses the folder title's inline edit
// affordance directly, the same mechanism a page's title already has. No
// 'duplicate' item: folders are never duplicable — Duplicate is a
// Note-only capability.
// Description is deliberately NOT a topbar action (final UX decision) —
// see noteTopBarMenu.config.ts's identical doc comment for the full
// rationale (it lives exclusively in the title-section controls' "More
// actions" menu, alongside Emoji and Cover image).
export function buildFolderTopBarMenu(
  status: FolderMetadata['status'],
  isFavorite: boolean = false,
  isDeletable: boolean = false
): TopBarMenuItemConfig[] {
  const items: TopBarMenuItemConfig[] = [
    {
      id: 'move-to',
      label: 'Move to…',
      icon: 'arrowDownRight',
      disabled: status === 'archived',
    },
    {
      id: 'toggle-favorite',
      label: isFavorite ? UNFAVORITE_ACTION_LABEL : FAVORITE_ACTION_LABEL,
      icon: isFavorite ? 'favouriteFilled' : 'favouriteOutline',
    },
    // No 'as-markdown' leaf — no folder-linking syntax exists anywhere in
    // the parser/resolver (getLocationPathRepresentations.ts). No `draft`
    // concept for a Folder (FolderOperations.create() is eager/
    // immediate-persist), so no `disabled` gate is needed here either.
    ...buildLocationActionMenuItems('folder'),
    status === 'archived'
      ? { id: 'restore', label: 'Restore', icon: 'restore' }
      : { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
  ];

  if (isDeletable) {
    items.push({ id: 'delete', label: DELETE_ACTION_LABEL, icon: 'trash' });
  }

  return items;
}
