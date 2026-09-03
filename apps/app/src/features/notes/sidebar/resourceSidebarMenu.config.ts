import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { ARCHIVE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';
import { buildLocationActionMenuItems } from '@core/presentation/getLocationPathRepresentations';

/**
 * The sidebar row's overflow menu for a VaultResource (image/pdf) —
 * mirrors noteSidebarMenu.config.ts's shape, pruned to exactly the
 * capabilities ResourceOperations backs today (Rename, Move, Archive), plus
 * the shared location-action items (Reveal in Finder / Copy path — see
 * `buildLocationActionMenuItems`, `core/presentation/
 * getLocationPathRepresentations.ts`). No Favorite/Restore/Delete/
 * Duplicate/Change-icon items: none of those have a write path for a
 * resource (Favorites is explicitly out of scope; the others were never
 * part of the approved Resource mutation design).
 *
 * `move-to`'s id/label/icon intentionally match Note/Folder's own
 * (noteSidebarMenu.config.ts/folderSidebarMenu.config.ts) — FolderTree's
 * onMenuSelect dispatch and Resource.tsx's MoveDestinationPicker wiring
 * key off this same 'move-to' id, exactly like Note/Folder's own rows do.
 *
 * Location-action items apply identically to image and pdf resources
 * (`buildLocationActionMenuItems('resource')` doesn't discriminate by
 * `VaultResource.kind` — neither does Reveal in Finder nor any of the three
 * Copy-path representations), and to both the sidebar row and the Assets
 * collection grid (`AssetsCollectionBody.tsx`, which calls this same
 * builder) — unlike the first image-only slice, there is no longer a
 * per-surface/per-kind opt-in, since the global location-actions pipeline
 * makes every VaultResource a first-class participant.
 *
 * `reveal-in-finder`/`copy-path-*` are read-only OS/clipboard actions, not
 * a ResourceOperations capability — they never touch the Gate or `Vault`,
 * so they carry no ownership conflict with Rename/Move/Archive above.
 */
export function buildResourceSidebarMenu(): OverflowMenuItemConfig[] {
  return [
    { id: 'rename', label: 'Rename', icon: 'notePencil', opensInlineEdit: true },
    { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
    ...buildLocationActionMenuItems('resource'),
    // Archive is always last — a destructive-adjacent action grouped apart
    // from the read-only/organizational items above it.
    { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
  ];
}
