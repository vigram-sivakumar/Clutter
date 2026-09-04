import type { MutableRefObject, RefObject } from 'react';
import { useEffect, useRef } from 'react';

import { Overlay } from '@components/overlay/Overlay';
import { OverflowMenuBody } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { buildResourceSidebarMenu } from '@features/notes/sidebar/resourceSidebarMenu.config';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

export interface PdfEmbedMoreActionsAnchor {
  readonly current: HTMLElement;
}

export interface PdfEmbedMoreActionsProps {
  /** Bridges `PdfEmbedWidget.ts`'s raw CM6 DOM trigger button into `Overlay`'s `anchorRef` contract — same shape/reasoning as `ImageOptionsMenu`'s own `anchor` prop. `null` when no PDF embed's More actions is currently open. */
  readonly anchor: PdfEmbedMoreActionsAnchor | null;
  readonly resourceId: string | null;
  readonly onClose: () => void;
  readonly onArchiveResource?: (resourceId: string) => void;
  readonly onRevealResourceInFinder?: (resourceId: string) => void;
  readonly onCopyResourcePath?: (
    resourceId: string,
    format: LocationPathFormat
  ) => void;
  readonly resourceMoveDestinations?: FolderPickerItem[];
  readonly onMoveResource?: (
    resourceId: string,
    destinationFolderId: string | null
  ) => void;
  readonly onCreateFolder?: (name: string) => Promise<string>;
}

/**
 * The inline Markdown PDF embed's own floating "More actions" control — the
 * exact same Resource menu (`buildResourceSidebarMenu()` minus `rename`)
 * `PdfViewerMoreActions`/`ImageOverlayMoreActions`/the Sidebar's own row
 * menu already show, dispatched against this embed's own `resourceId`
 * (`embedPdfResolution.ts`'s `EmbedPdfResolution['pdf'].resourceId` —
 * already resolved, no second lookup here).
 *
 * Built the same way `ImageOptionsMenu.tsx` is, not the way
 * `ImageOverlayMoreActions.tsx` is: this control's own trigger button lives
 * inside `PdfEmbedWidget.ts`'s raw CM6 DOM, not a React tree, so this
 * component owns only the menu body (`Overlay` + `OverflowMenuBody`,
 * `OverflowMenu.tsx`'s own extracted body — reused unmodified, same
 * menu/submenu/keyboard/focus behavior as every other Resource menu in the
 * app), anchored to that externally-owned button via the same
 * `{current: HTMLElement}` bridging `ImageOptionsMenu`'s own `anchor` prop
 * establishes.
 *
 * `useMoveDestinationTrigger`'s own `triggerRef` is normally attached to a
 * React-rendered trigger button via JSX `ref=`; here there is no such
 * button, so the effect below assigns `.current` directly the one time the
 * bridged `anchor` becomes available — a plain mutable-ref-object write,
 * the same technique the bridging above already relies on, not a new
 * mechanism.
 */
export function PdfEmbedMoreActions({
  anchor,
  resourceId,
  onClose,
  onArchiveResource,
  onRevealResourceInFinder,
  onCopyResourcePath,
  resourceMoveDestinations,
  onMoveResource,
  onCreateFolder,
}: PdfEmbedMoreActionsProps) {
  const menuItems: OverflowMenuItemConfig[] = buildResourceSidebarMenu('pdf').filter(
    (item) => item.id !== 'rename'
  );
  const moveTrigger = useMoveDestinationTrigger(resourceMoveDestinations);
  const suppressReturnFocusRef = useRef(false);

  useEffect(() => {
    (moveTrigger.triggerRef as MutableRefObject<HTMLButtonElement | null>).current =
      (anchor?.current as HTMLButtonElement | undefined) ?? null;
  }, [anchor, moveTrigger.triggerRef]);

  function handleSelect(id: string) {
    if (!resourceId) {
      return;
    }
    moveTrigger.handleSelect(id, (id) => {
      if (id === 'archive') {
        onArchiveResource?.(resourceId);
      } else if (id === 'reveal-in-finder') {
        onRevealResourceInFinder?.(resourceId);
      } else if (id === 'copy-path-at-vault') {
        onCopyResourcePath?.(resourceId, 'at-vault');
      } else if (id === 'copy-path-full-path') {
        onCopyResourcePath?.(resourceId, 'full-path');
      } else if (id === 'copy-path-as-markdown') {
        onCopyResourcePath?.(resourceId, 'as-markdown');
      }
    });
  }

  return (
    <>
      <Overlay
        open={anchor !== null}
        onClose={onClose}
        anchorRef={(anchor ?? { current: null }) as RefObject<HTMLElement>}
        side="bottom"
        alignment="end"
      >
        <OverflowMenuBody
          items={menuItems}
          onSelect={handleSelect}
          onOpenChange={(open) => {
            if (!open) {
              onClose();
            }
          }}
          suppressReturnFocusRef={suppressReturnFocusRef as MutableRefObject<boolean>}
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
            if (resourceId) {
              onMoveResource?.(resourceId, destinationFolderId);
            }
          }}
          onCreateFolder={onCreateFolder}
          side="bottom"
          alignment="end"
        />
      )}
    </>
  );
}
