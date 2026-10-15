import type { Application } from '@core/application/Application';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { Asset } from '@core/vault/models/Asset';
import {
  buildImageAssetMenu,
  buildRemoteImageMenuHandlers,
  type RemoteImageActions,
} from '@features/markdown/editor/codemirror/image/ImageOverlayMoreActions';
import { buildAssetMenuHandlers, type AssetMenuActions } from '@features/notes/helpers/buildAssetMenuHandlers';
import { buildMoveDestinationItems } from '@features/notes/helpers/buildMoveDestinationItems';
import { createFolderInZone } from '@features/notes/helpers/createFolderInZone';
import { buildTagLineMenu } from '@features/tags/helpers/buildTagLineMenu';
import { buildResourceContextMenu } from '../topbar/buildTopBarActions';
import { buildResourceMenuOptions, type ResourceMenuOps } from '../topbar/buildResourceMenuOptions';
import type { ResourceTopBarActionsProps } from '../topbar/ResourceTopBarActions';

/**
 * The right-click menu for one Collection View entry: that entry's resource's topbar menu — same
 * definitions, options and handlers (`buildResourceMenuOptions` + `buildResourceContextMenu`) — only
 * anchored at the pointer. The target is resolved from the entry itself (a Tag collection's
 * matching-line entry acts on its source note), looked up live in the vault, so the menu always reflects
 * the item's current state (favorite, archived) and `null` for one that is gone or not yet saved.
 */
export function buildCollectionItemMenu(
  application: Application,
  ops: ResourceMenuOps,
  entry: CollectionEntryModel
): ResourceTopBarActionsProps | null {
  // A tag's matching line is a reference into a note, not the note: its menu is its own (Show in note — the
  // entry's own opener, which opens the note and lands on the line), never the source note's menu.
  if (entry.tagLine !== undefined) {
    const { menu, handlers } = buildTagLineMenu(entry.onClick);
    return { menu, handlers };
  }

  const id = entry.noteId ?? entry.id;
  const resource =
    entry.type === 'folder' ? application.vault.getFolder(id) : application.vault.getPage(id);

  return resource ? buildResourceContextMenu(resource, buildResourceMenuOptions(application, resource, ops)) : null;
}

/**
 * The right-click menu for one asset card, row or table row: the asset's More actions, bound to the same
 * handlers as the asset's viewer. A vault file gets the file menu (`buildAssetMenuHandlers`, the same
 * Assets-rooted Move picker as the sidebar row); a remote image gets exactly the image overlay's remote
 * menu (`buildImageAssetMenu` + `buildRemoteImageMenuHandlers`), acting on that asset's URL — with Set as
 * cover image enabled, as in the overlay opened from this collection. Rename has no home in either, as in
 * the viewers. `null` when there is nothing to run it with (a remote asset without its actions, a remote PDF).
 */
export function buildAssetItemMenu(
  application: Application,
  actions: AssetMenuActions & {
    /** The image overlay's remote-image actions (absent where nothing supplies them). */
    remoteImage?: RemoteImageActions;
    /** Picks a note to set the image as cover of — what opening the remote image's overlay offers. */
    onSetRemoteAsCover?(url: string): void;
  },
  asset: Asset
): ResourceTopBarActionsProps | null {
  if (asset.source === 'remote') {
    const { remoteImage, onSetRemoteAsCover } = actions;
    if (asset.kind !== 'image' || !remoteImage) {
      return null;
    }
    return {
      menu: buildImageAssetMenu({ remote: true, canSetAsCover: Boolean(onSetRemoteAsCover) }),
      handlers: {
        ...buildRemoteImageMenuHandlers({ url: asset.url, actions: remoteImage }),
        'set-as-cover-image': () => onSetRemoteAsCover?.(asset.url),
      },
    };
  }

  const { membershipSelector, folderOperations, resourceOperations } = application;
  const id = asset.resource.id;

  return {
    menu: buildResourceActionMenu(
      'asset',
      { assetKind: asset.kind, status: 'active', isEffectivelyArchived: false, isDeletable: false },
      'overlay'
    ),
    handlers: buildAssetMenuHandlers(actions, id),
    moveDestinations: buildMoveDestinationItems(membershipSelector, undefined, 'assets'),
    onMove: (destinationFolderId) => void resourceOperations.moveResource(id, destinationFolderId),
    onCreateFolder: createFolderInZone(folderOperations, membershipSelector, 'assets'),
  };
}
