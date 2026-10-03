import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { ARCHIVE_ACTION_LABEL } from '@core/presentation/resourceActionLabels';
import { buildLocationActionMenuItems } from '@core/presentation/getLocationPathRepresentations';
import type { VaultResourceKind } from '@core/vault/models/VaultResource';

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
 *
 * `download` is image-only (see `downloadResource.ts`'s own doc comment for
 * why it isn't a ResourceOperations capability either) — grouped with the
 * other read-only OS actions, right after them and still before Archive.
 * PDF gets no Download item yet; that's a deliberate, separate follow-up,
 * not an oversight.
 *
 * One source of truth for every asset menu: the `source` adapts it. A
 * `'remote'` asset (a URL with no vault file) gets the same menu in the same
 * order with each file action replaced by its URL counterpart — see the
 * remote branch below. `options` covers what differs per surface (Rename, and
 * Set as cover image, which only the overlays offer).
 */
export function buildResourceSidebarMenu(
  kind: VaultResourceKind,
  source: AssetSource = 'local',
  options: AssetMenuOptions = {}
): OverflowMenuItemConfig[] {
  const setAsCover = setAsCoverImageItem(options.setAsCoverImage);

  if (source === 'remote') {
    // The same menu, in the same order, for an asset with no vault file — each
    // item the URL's counterpart of the one it stands in for:
    //   Move to…        -> Save to vault   (put it in the vault)
    //   Reveal in Finder -> Open in browser (go to where it lives)
    //   Copy path       -> Copy link
    //   Download        -> Download (saves a copy anywhere)
    // Rename and Archive have nothing to act on (no file), so they are absent.
    return [
      { id: 'save-to-vault', label: 'Save to vault', icon: 'arrowDownRight' },
      { id: 'open-in-browser', label: 'Open in browser', icon: 'arrowUpRight' },
      { id: 'copy-link', label: 'Copy link', icon: 'link' },
      ...(kind === 'image' ? [{ id: 'download', label: 'Download', icon: 'download' } as const] : []),
      ...setAsCover,
    ];
  }

  return [
    ...(options.rename === false
      ? []
      : [{ id: 'rename', label: 'Rename', icon: 'notePencil', opensInlineEdit: true } as const]),
    { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
    ...buildLocationActionMenuItems('resource'),
    ...(kind === 'image'
      ? [{ id: 'download', label: 'Download', icon: 'download' } as const]
      : []),
    // Set as cover image sits just above Archive: organizational actions above,
    // the destructive-adjacent Archive always last.
    ...setAsCover,
    { id: 'archive', label: ARCHIVE_ACTION_LABEL, icon: 'archive' },
  ];
}

/** Where an asset's bytes live — the menu adapts to it (a vault file, or a URL with no file). */
export type AssetSource = 'local' | 'remote';

export interface AssetMenuOptions {
  /** Leave Rename out (a surface with no place to rename in — the overlays). Default: included. */
  readonly rename?: boolean;
  /** `'enabled'` lists Set as cover image; `'disabled'` lists it unavailable; absent omits it. */
  readonly setAsCoverImage?: 'enabled' | 'disabled';
}

function setAsCoverImageItem(mode: AssetMenuOptions['setAsCoverImage']): OverflowMenuItemConfig[] {
  return mode
    ? [{ id: 'set-as-cover-image', label: 'Set as cover image', icon: 'image', disabled: mode === 'disabled' }]
    : [];
}
