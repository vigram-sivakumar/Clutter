import { useState } from 'react';

import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { buildResourceSidebarMenu } from '@features/notes/sidebar/resourceSidebarMenu.config';
import type { LocationPathFormat } from '@core/presentation/getLocationPathRepresentations';

export interface PdfViewerMoreActionsProps {
  readonly resourceId: string;
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
 * `PdfViewer`'s toolbar "More actions" control — the same Resource menu
 * (`buildResourceSidebarMenu()` minus `rename`, no home in this context
 * yet — the exact reasoning `ImageOverlayMoreActions`'s own doc comment
 * already gives) dispatched against this open PDF's `resourceId`.
 *
 * Unlike `ImageOverlayMoreActions`, this sits as an ordinary docked
 * toolbar button — `PdfViewer` already has a real, always-visible toolbar
 * to put it in, so none of `ImageOverlayMoreActions`'s viewport-fixed
 * portal/positioning machinery (built specifically for floating over a
 * shrink-to-fit image with no toolbar of its own) applies or is reused
 * here. `OverflowMenu` is the closer-fitting existing abstraction for a
 * normal-flow trigger + anchored dropdown — the same one `Resource.tsx`'s
 * own row menu already uses — composed with `MoveDestinationPicker` +
 * `useMoveDestinationTrigger` the identical way `Resource.tsx` does.
 */
export function PdfViewerMoreActions({
  resourceId,
  onArchiveResource,
  onRevealResourceInFinder,
  onCopyResourcePath,
  resourceMoveDestinations,
  onMoveResource,
  onCreateFolder,
}: PdfViewerMoreActionsProps) {
  const menuItems: OverflowMenuItemConfig[] = buildResourceSidebarMenu('pdf').filter(
    (item) => item.id !== 'rename'
  );
  const [open, setOpen] = useState(false);
  const moveTrigger = useMoveDestinationTrigger(resourceMoveDestinations);

  function handleSelect(id: string) {
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
      <OverflowMenu
        items={menuItems}
        triggerRef={moveTrigger.triggerRef}
        open={open}
        onOpenChange={setOpen}
        onSelect={handleSelect}
        buttonSize="small"
        side="bottom"
        alignment="end"
        // Same accessible name ImageOverlayMoreActions' equivalent trigger
        // already has — OverflowMenu's own default trigger has no
        // aria-label of its own.
        buttonProps={{ 'aria-label': 'More actions' }}
      />
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
    </>
  );
}
