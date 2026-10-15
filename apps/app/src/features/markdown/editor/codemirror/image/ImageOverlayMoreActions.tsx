import { useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { Overlay } from '@components/overlay/Overlay';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import type { PickerListItem } from '@components/picker-list/PickerList.types';
import { AppIcon } from '@shared/icon';
import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import { buildAssetMenuHandlers } from '@features/notes/helpers/buildAssetMenuHandlers';
import type { ResourceActionHandlers } from '@core/presentation/resourceActions/resourceActionTypes';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

/**
 * What the menu does for an asset with no vault file (a remote asset, an
 * external URL) — each takes the image's URL. All four are the app's existing
 * behaviors (the editor's image menu already downloads and copies; Save to
 * vault is `Application.saveRemoteImageToVault`), supplied by the caller.
 */
export interface RemoteImageActions {
  onSaveToVault: (url: string) => void;
  onOpenInBrowser: (url: string) => void;
  onCopyLink: (url: string) => void;
  onDownload: (url: string) => void;
}

export interface ImageOverlayMoreActionsProps {
  /** A vault file's id — the resource menu. Exactly one of `resourceId` and `remote` is given. */
  resourceId?: string;
  /** A remote image — the same menu, adapted to a URL with no file behind it. */
  remote?: { readonly url: string; readonly actions: RemoteImageActions };
  onArchiveResource?: (resourceId: string) => void;
  onRevealResourceInFinder?: (resourceId: string) => void;
  onCopyResourcePath?: (resourceId: string, format: LocationPathFormat) => void;
  onDownloadResource?: (resourceId: string) => void;
  resourceMoveDestinations?: PickerListItem[];
  onMoveResource?: (
    resourceId: string,
    destinationFolderId: string | null
  ) => void;
  onCreateFolder?: (name: string) => Promise<string>;
  /** See ImageOverlayProps's own matching doc comment. */
  onSetCoverImage?: () => void;
  /**
   * The file is archived (opened from the Archive): its menu is the archived one — Download, Restore and
   * Delete — by the canonical asset actions' own rule, with `onRestoreResource`/`onDeleteResource` behind
   * the last two.
   */
  archived?: boolean;
  onRestoreResource?: (resourceId: string) => void;
  onDeleteResource?: (resourceId: string) => void;
}

/**
 * The one image-asset menu (the canonical asset actions on the overlay surface), adapted to the asset's
 * source: a vault file gets the resource menu, a remote image the same menu in the same order with URL
 * counterparts. Rename has no home in this context (a deliberate product decision); Set as cover image is
 * offered when the caller supplies the capability — and, for a remote image, always listed (unavailable
 * when there is none, since it would do nothing and a live control must never be a silent no-op). Shared
 * with the Assets collection's right-click menu, so an image shows the same menu from either place.
 */
export function buildImageAssetMenu({
  remote,
  archived = false,
  canRestore = false,
  canSetAsCover,
}: {
  remote: boolean;
  archived?: boolean;
  /** Restore is offered only where a restore handler is (a file archived by itself); one that is
   *  archived because its folder is — no record of its own — can only be deleted. */
  canRestore?: boolean;
  canSetAsCover: boolean;
}): OverflowMenuItemConfig[] {
  return buildResourceActionMenu(
    'asset',
    {
      assetKind: 'image',
      isRemote: remote,
      status: archived && canRestore ? 'archived' : 'active',
      isEffectivelyArchived: archived,
      isDeletable: archived,
      setAsCoverImage: canSetAsCover ? 'enabled' : remote ? 'disabled' : undefined,
    },
    'overlay'
  );
}

/** The id → operation map for a remote image's menu: each action runs on the image's own URL. */
export function buildRemoteImageMenuHandlers(remote: {
  readonly url: string;
  readonly actions: RemoteImageActions;
}): ResourceActionHandlers {
  return {
    'save-to-vault': () => remote.actions.onSaveToVault(remote.url),
    'open-in-browser': () => remote.actions.onOpenInBrowser(remote.url),
    'copy-link': () => remote.actions.onCopyLink(remote.url),
    download: () => remote.actions.onDownload(remote.url),
  };
}

/**
 * `ImageOverlay`'s own floating three-dot control — the exact same Resource
 * menu (the canonical asset actions on the overlay surface, which omit `rename` — no home in
 * this context yet — a deliberate product decision, not an oversight; see
 * this file's own PR description) the Sidebar's own resource row menu
 * shows, dispatched against `resourceId` instead of whichever row happened
 * to render it.
 *
 * Built directly on `Overlay` + `OverflowMenuBody` (the piece `OverflowMenu`
 * itself extracts its own menu/submenu/keyboard behavior into) rather than
 * `OverflowMenu` as a whole, so this component owns its own trigger element
 * instead of `OverflowMenu`'s built-in one — but that trigger is now the
 * project's own generic `Button` (`size="small" variant="ghost"
 * interaction="subtle" isIconOnly`), the *exact* props `OverflowMenu.tsx`'s
 * own "⋯" trigger already renders with. This control is a top-right-of-
 * screen overlay affordance, not an inline Markdown-image control
 * (`.cm-media-control`, CM6's raw-DOM widget) — the two now render with
 * completely independent CSS on purpose: an earlier version of this file
 * reused that class (then still named `.cm-image-control`) here for
 * pixel-parity with the inline control, but that's no longer this
 * control's job (`.image-overlay__control`
 * below owns only this control's own positioning; every visual property —
 * color, hover, active, icon sizing — comes from `Button`/`Button.css`
 * unmodified, the same design-system chrome every other icon-only trigger
 * in the app already uses). `OverflowMenuBody` keeps every bit of the
 * menu/submenu/keyboard/focus behavior identical to `OverflowMenu`'s own —
 * nothing about Copy path's submenu, arrow-key ownership, or Escape
 * scoping is reimplemented here.
 *
 * Move-to is handled exactly the way `Resource.tsx`/`ResourceTopBarActions.tsx`
 * already handle it for every other Move entry point:
 * `useMoveDestinationTrigger` intercepts the `move-to` selection before it
 * ever reaches this component's own dispatch, opening the shared
 * `MoveDestinationPicker` anchored on this same trigger button.
 */
export function ImageOverlayMoreActions({
  resourceId,
  remote,
  onArchiveResource,
  onRevealResourceInFinder,
  onCopyResourcePath,
  onDownloadResource,
  resourceMoveDestinations,
  onMoveResource,
  onCreateFolder,
  onSetCoverImage,
  archived = false,
  onRestoreResource,
  onDeleteResource,
}: ImageOverlayMoreActionsProps) {
  const menuItems: OverflowMenuItemConfig[] = buildImageAssetMenu({
    remote: Boolean(remote),
    archived,
    canRestore: Boolean(onRestoreResource),
    canSetAsCover: Boolean(onSetCoverImage),
  });
  const [open, setOpen] = useState(false);
  const moveTrigger = useMoveDestinationTrigger(resourceMoveDestinations);
  const suppressReturnFocusRef = useRef(false);

  function handleSelect(id: string) {
    moveTrigger.handleSelect(id, (id) => {
      if (id === 'set-as-cover-image') {
        onSetCoverImage?.();
      } else if (remote) {
        buildRemoteImageMenuHandlers(remote)[id]?.();
      } else if (resourceId !== undefined) {
        buildAssetMenuHandlers(
          { onArchiveResource, onRevealResourceInFinder, onCopyResourcePath, onDownloadResource, onRestoreResource, onDeleteResource },
          resourceId
        )[id]?.();
      }
    });
  }

  return (
    <div className="image-overlay__control">
      <Button
        className="image-overlay__control-button"
        ref={moveTrigger.triggerRef}
        size="small"
        variant="ghost"
        interaction="subtle"
        isIconOnly
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <AppIcon icon="moreHorizontal" />
      </Button>
      <Overlay
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={moveTrigger.triggerRef}
        side="bottom"
        alignment="end"
      >
        <OverflowMenuBody
          items={menuItems}
          onSelect={handleSelect}
          onOpenChange={setOpen}
          suppressReturnFocusRef={suppressReturnFocusRef}
        />
      </Overlay>
      {resourceId !== undefined && resourceMoveDestinations !== undefined && (
        <MoveDestinationPicker
          anchorRef={moveTrigger.triggerRef}
          open={moveTrigger.open}
          onClose={moveTrigger.close}
          items={resourceMoveDestinations}
          onSelect={(destinationFolderId) => {
            moveTrigger.close();
            onMoveResource?.(resourceId, destinationFolderId);
          }}
          onCreateFolder={onCreateFolder}
          side="bottom"
          alignment="end"
        />
      )}
    </div>
  );
}
