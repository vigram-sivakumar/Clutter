import { useRef, useState } from 'react';

import { Button } from '@components/button/Button';
import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { Overlay } from '@components/overlay/Overlay';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { AppIcon } from '@shared/icon';
import { buildResourceSidebarMenu } from '@features/notes/sidebar/resourceSidebarMenu.config';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

/**
 * What the menu does for an asset with no vault file (a remote asset, an
 * external URL) — each takes the image's URL. All four are the app's existing
 * behaviors (the editor's image menu already downloads and copies; Save to
 * vault is `Application.importRemoteImage`), supplied by the caller.
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
  resourceMoveDestinations?: FolderPickerItem[];
  onMoveResource?: (
    resourceId: string,
    destinationFolderId: string | null
  ) => void;
  onCreateFolder?: (name: string) => Promise<string>;
  /** See ImageOverlayProps's own matching doc comment. */
  onSetCoverImage?: () => void;
}

/**
 * `ImageOverlay`'s own floating three-dot control — the exact same Resource
 * menu (`buildResourceSidebarMenu()`, minus `rename`, which has no home in
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
}: ImageOverlayMoreActionsProps) {
  // The one asset menu (`buildResourceSidebarMenu`), adapted to the asset's
  // source: a vault file gets the resource menu, a remote image the same menu
  // in the same order with URL counterparts. Rename has no home in this
  // context (a deliberate product decision); Set as cover image is offered when
  // the caller supplies the capability — and, for a remote image, always listed
  // (unavailable for now, since it does nothing yet and a live control must
  // never be a silent no-op).
  const menuItems: OverflowMenuItemConfig[] = buildResourceSidebarMenu(
    'image',
    remote ? 'remote' : 'local',
    {
      rename: false,
      setAsCoverImage: onSetCoverImage ? 'enabled' : remote ? 'disabled' : undefined,
    }
  );
  const [open, setOpen] = useState(false);
  const moveTrigger = useMoveDestinationTrigger(resourceMoveDestinations);
  const suppressReturnFocusRef = useRef(false);

  function handleSelect(id: string) {
    moveTrigger.handleSelect(id, (id) => {
      if (id === 'set-as-cover-image') {
        onSetCoverImage?.();
      } else if (remote) {
        if (id === 'save-to-vault') {
          remote.actions.onSaveToVault(remote.url);
        } else if (id === 'open-in-browser') {
          remote.actions.onOpenInBrowser(remote.url);
        } else if (id === 'copy-link') {
          remote.actions.onCopyLink(remote.url);
        } else if (id === 'download') {
          remote.actions.onDownload(remote.url);
        }
      } else if (resourceId !== undefined) {
        if (id === 'archive') {
          onArchiveResource?.(resourceId);
        } else if (id === 'reveal-in-finder') {
          onRevealResourceInFinder?.(resourceId);
        } else if (id === 'download') {
          onDownloadResource?.(resourceId);
        } else if (id === 'copy-path-at-vault') {
          onCopyResourcePath?.(resourceId, 'at-vault');
        } else if (id === 'copy-path-full-path') {
          onCopyResourcePath?.(resourceId, 'full-path');
        } else if (id === 'copy-path-as-markdown') {
          onCopyResourcePath?.(resourceId, 'as-markdown');
        }
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
