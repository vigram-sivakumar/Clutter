import type { RefObject } from 'react';

import { Confirmation } from '@components/confirmation/Confirmation';
import { useConfirmationSurface } from '@components/confirmation/useConfirmationSurface';
import { Dialog } from '@components/dialog/Dialog';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import type { OverlayAlignment, OverlaySide } from '@components/overlay/Overlay.types';
import {
  FOLDER_ARCHIVE_CONFIRMATION_TITLE,
  FOLDER_ARCHIVE_CONFIRM_LABEL,
} from '@features/notes/helpers/folderActionConfirmation';

import type { ResourceTopBarActionsProps } from './ResourceTopBarActions';

/** The props that decide what selecting a menu item does — everything a resource's menu needs to run. */
export type ResourceMenuDispatchProps = Pick<
  ResourceTopBarActionsProps,
  | 'handlers'
  | 'archiveConfirmationMessage'
  | 'deleteConfirmationMessage'
  | 'deleteConfirmationTitle'
  | 'deleteAllConfirmation'
  | 'moveDestinations'
  | 'onMove'
  | 'onCreateFolder'
>;

/**
 * What selecting an item in a resource's More actions menu does: Move opens the destination picker,
 * Delete / Delete all / Archive go through the shared Confirmation surface when the caller supplies
 * its copy, and everything else is one lookup in the id-keyed `handlers` map (ADR-048). Shared by the
 * topbar's menu and the Collection View's right-click menu, so confirmation and Move behave
 * identically from either — the dispatch is written once.
 */
export function useResourceMenuDispatch({
  handlers,
  archiveConfirmationMessage,
  deleteConfirmationMessage,
  deleteConfirmationTitle,
  deleteAllConfirmation,
  moveDestinations,
}: ResourceMenuDispatchProps) {
  const confirmation = useConfirmationSurface();
  const moveTrigger = useMoveDestinationTrigger(moveDestinations);

  function select(id: string) {
    moveTrigger.handleSelect(id, (id) => {
      if (id === 'delete' && deleteConfirmationMessage !== undefined) {
        // A resource-type-neutral title — unlike 'Archive this folder?'
        // below (archive confirmation stays folder-only), Delete
        // confirmation now applies to every archived/Archive-descendant
        // resource type (note, daily note, folder), not folders alone.
        confirmation.request({
          title: deleteConfirmationTitle ?? 'Delete permanently?',
          message: deleteConfirmationMessage,
          confirmLabel: 'Delete',
          onConfirm: () => handlers?.['delete']?.(),
        });
        return;
      }

      if (id === 'delete-all' && deleteAllConfirmation !== undefined) {
        confirmation.request({
          ...deleteAllConfirmation,
          onConfirm: () => handlers?.['delete-all']?.(),
        });
        return;
      }

      if (id === 'archive' && archiveConfirmationMessage !== undefined) {
        confirmation.request({
          title: FOLDER_ARCHIVE_CONFIRMATION_TITLE,
          message: archiveConfirmationMessage,
          confirmLabel: FOLDER_ARCHIVE_CONFIRM_LABEL,
          onConfirm: () => handlers?.['archive']?.(),
        });
        return;
      }

      handlers?.[id]?.();
    });
  }

  return { select, confirmation, moveTrigger };
}

export type ResourceMenuDispatch = ReturnType<typeof useResourceMenuDispatch>;

/**
 * The surfaces a menu selection can open: the Move destination picker and the Confirmation dialog.
 * `anchorRef` is what the picker opens beside (the topbar's trigger button, or the point of a
 * right-click).
 */
export function ResourceMenuDialogs({
  dispatch,
  anchorRef,
  returnFocusRef,
  moveDestinations,
  onMove,
  onCreateFolder,
  side,
  alignment,
}: {
  dispatch: ResourceMenuDispatch;
  anchorRef: RefObject<HTMLElement>;
  returnFocusRef?: RefObject<HTMLElement>;
  side: OverlaySide;
  alignment: OverlayAlignment;
} & Pick<ResourceTopBarActionsProps, 'moveDestinations' | 'onMove' | 'onCreateFolder'>) {
  const { confirmation, moveTrigger } = dispatch;

  return (
    <>
      {moveDestinations !== undefined && (
        <MoveDestinationPicker
          anchorRef={anchorRef}
          open={moveTrigger.open}
          onClose={moveTrigger.close}
          items={moveDestinations}
          onSelect={(destinationFolderId) => {
            moveTrigger.close();
            onMove?.(destinationFolderId);
          }}
          onCreateFolder={onCreateFolder}
          side={side}
          alignment={alignment}
        />
      )}
      <Dialog
        open={confirmation.pending !== null}
        onClose={confirmation.cancel}
        returnFocusRef={returnFocusRef ?? anchorRef}
        size="medium"
      >
        {confirmation.pending && (
          <Confirmation
            title={confirmation.pending.title}
            description={confirmation.pending.message}
            confirmLabel={confirmation.pending.confirmLabel}
            confirmVariant={confirmation.pending.confirmVariant}
            onConfirm={confirmation.confirm}
            onCancel={confirmation.cancel}
          />
        )}
      </Dialog>
    </>
  );
}
