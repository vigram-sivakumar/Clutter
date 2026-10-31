import { useState, type RefObject } from 'react';

import { Confirmation } from '@components/confirmation/Confirmation';
import { useConfirmationSurface } from '@components/confirmation/useConfirmationSurface';
import { ChangeIconPicker } from '@components/change-icon-picker/ChangeIconPicker';
import { Dialog } from '@components/dialog/Dialog';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import type { OverlayAlignment, OverlaySide } from '@components/overlay/Overlay.types';
import {
  FOLDER_ARCHIVE_CONFIRMATION_TITLE,
  FOLDER_ARCHIVE_CONFIRM_LABEL,
} from '@features/notes/helpers/folderActionConfirmation';

import { NewFolderDialog } from '@features/notes/shortcuts/NewFolderDialog';
import { renameLabels } from '@features/notes/shortcuts/NewFolderContent';

import type { ResourceTopBarActionsProps } from './ResourceTopBarActions';

/** The props that decide what selecting a menu item does — everything a resource's menu needs to run. */
export type ResourceMenuDispatchProps = Pick<
  ResourceTopBarActionsProps,
  | 'handlers'
  | 'archiveConfirmationMessage'
  | 'archiveConfirmationTitle'
  | 'deleteConfirmationMessage'
  | 'deleteConfirmationTitle'
  | 'deleteAllConfirmation'
  | 'moveDestinations'
  | 'onMove'
  | 'onCreateFolder'
  | 'rename'
  | 'changeIcon'
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
  archiveConfirmationTitle,
  deleteConfirmationMessage,
  deleteConfirmationTitle,
  deleteAllConfirmation,
  moveDestinations,
  rename,
  changeIcon,
}: ResourceMenuDispatchProps) {
  const confirmation = useConfirmationSurface();
  const moveTrigger = useMoveDestinationTrigger(moveDestinations);
  const [renameOpen, setRenameOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);

  function select(id: string) {
    // Rename and Change icon open the shared name dialog and emoji picker (the same ones the sidebar and the New
    // folder dialog use) — only where the menu supplies what they need; anything else is the handlers' lookup below.
    if (id === 'rename' && rename) {
      setRenameOpen(true);
      return;
    }
    if (id === 'change-icon' && changeIcon) {
      setIconOpen(true);
      return;
    }

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
          title: archiveConfirmationTitle ?? FOLDER_ARCHIVE_CONFIRMATION_TITLE,
          message: archiveConfirmationMessage,
          confirmLabel: FOLDER_ARCHIVE_CONFIRM_LABEL,
          onConfirm: () => handlers?.['archive']?.(),
        });
        return;
      }

      handlers?.[id]?.();
    });
  }

  return {
    select,
    confirmation,
    moveTrigger,
    renameOpen,
    closeRename: () => setRenameOpen(false),
    iconOpen,
    closeIcon: () => setIconOpen(false),
  };
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
  rename,
  changeIcon,
  side,
  alignment,
}: {
  dispatch: ResourceMenuDispatch;
  anchorRef: RefObject<HTMLElement>;
  returnFocusRef?: RefObject<HTMLElement>;
  side: OverlaySide;
  alignment: OverlayAlignment;
} & Pick<ResourceTopBarActionsProps, 'moveDestinations' | 'onMove' | 'onCreateFolder' | 'rename' | 'changeIcon'>) {
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
      {rename && (
        <NewFolderDialog
          open={dispatch.renameOpen}
          onClose={dispatch.closeRename}
          labels={renameLabels(rename.noun)}
          initialName={rename.name}
          initialDescription={rename.description}
          initialIcon={rename.icon}
          withDescription={rename.withDescription}
          withIcon={rename.withIcon}
          withCancel
          canCreate={(name) => rename.canRename?.(name) ?? true}
          onSubmit={rename.onSubmit}
        />
      )}
      {changeIcon && (
        <ChangeIconPicker
          anchorRef={anchorRef}
          open={dispatch.iconOpen}
          onClose={dispatch.closeIcon}
          hasIcon={changeIcon.hasIcon}
          onSelect={(emoji) => {
            dispatch.closeIcon();
            changeIcon.onSelect(emoji);
          }}
          onRemove={() => {
            dispatch.closeIcon();
            changeIcon.onRemove();
          }}
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
