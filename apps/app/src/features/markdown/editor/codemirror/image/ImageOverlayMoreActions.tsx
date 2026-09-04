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

export interface ImageOverlayMoreActionsProps {
  resourceId: string;
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
 * (`.cm-image-control`, CM6's raw-DOM widget) — the two now render with
 * completely independent CSS on purpose: an earlier version of this file
 * reused `.cm-image-control` here for pixel-parity with the inline
 * control, but that's no longer this control's job (`.image-overlay__control`
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
  onArchiveResource,
  onRevealResourceInFinder,
  onCopyResourcePath,
  onDownloadResource,
  resourceMoveDestinations,
  onMoveResource,
  onCreateFolder,
  onSetCoverImage,
}: ImageOverlayMoreActionsProps) {
  // buildResourceSidebarMenu('image') minus rename (no home in this context
  // yet — a deliberate product decision, not an oversight; see this file's
  // own PR description), plus 'set-as-cover-image' spliced in right before
  // Archive — same "organizational actions above, destructive-adjacent
  // Archive last" ordering resourceSidebarMenu.config.ts's own doc comment
  // already establishes for Archive, extended by one item — only when the
  // caller actually supplies the capability (mirrors the inline
  // ImageOptionsMenu's own onSetCoverImage?-gated item, never an
  // always-present one).
  const menuItems: OverflowMenuItemConfig[] = [];
  for (const item of buildResourceSidebarMenu('image')) {
    if (item.id === 'rename') {
      continue;
    }
    if (item.id === 'archive' && onSetCoverImage) {
      menuItems.push({
        id: 'set-as-cover-image',
        label: 'Set as cover image',
        icon: 'image',
      });
    }
    menuItems.push(item);
  }
  const [open, setOpen] = useState(false);
  const moveTrigger = useMoveDestinationTrigger(resourceMoveDestinations);
  const suppressReturnFocusRef = useRef(false);

  function handleSelect(id: string) {
    moveTrigger.handleSelect(id, (id) => {
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
      } else if (id === 'set-as-cover-image') {
        onSetCoverImage?.();
      }
    });
  }

  return (
    <div className="image-overlay__control">
      <Button
        className="image-overlay__control-button"
        ref={moveTrigger.triggerRef}
        size="medium"
        variant="ghost"
        isIconOnly
        isActive={open}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(!open);
        }}
      >
        <AppIcon icon="moreVertical" />
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
      {resourceMoveDestinations !== undefined && (
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
