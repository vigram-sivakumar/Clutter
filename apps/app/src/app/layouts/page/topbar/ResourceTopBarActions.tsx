import { useState } from 'react';

import { Button } from '@components/button/Button';
import { Confirmation } from '@components/confirmation/Confirmation';
import { useConfirmationSurface } from '@components/confirmation/useConfirmationSurface';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import type {
  OverlayAlignment,
  OverlaySide,
} from '@components/overlay/Overlay.types';
import { Dialog } from '@components/dialog/Dialog';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { AppIcon } from '@shared/icon';
import type { PageStatus } from '@core/vault/models/PageMetadata';

/**
 * A page's top-bar-relevant lifecycle state: its persisted `PageStatus`,
 * or the explicit `'draft'` state for an unpersisted `PageOperations`
 * draft (ADR-017) — a real, named third value, never represented as
 * `undefined`/`null` standing in for "not yet persisted" (a menu builder
 * that forgot to check would otherwise silently treat a draft as active).
 */
export type TopBarPageState = PageStatus | 'draft';

/**
 * Re-exported from OverflowMenu, the generic primitive this menu shape
 * actually belongs to (ADR-017 Decision item 9 / ADR-016 Finding A's
 * "disabled, not silently inert" pattern governs the `disabled` field) —
 * kept under this name so every existing importer (buildTopBarActions.tsx,
 * topBarRegistry.tsx, the per-type menu configs) is unaffected.
 */
export type TopBarMenuItemConfig = OverflowMenuItemConfig;

const OVERFLOW_SIDE: OverlaySide = 'bottom';
const OVERFLOW_ALIGNMENT: OverlayAlignment = 'end';

export interface ResourceTopBarActionsProps {
  menu: readonly TopBarMenuItemConfig[];
  handlers?: Partial<Record<string, () => void>>;
  /**
   * When present, selecting 'archive' shows the shared Confirmation
   * surface (this message) before invoking handlers.archive, instead of
   * firing it immediately. Absent for every resource type/case that
   * doesn't need one (notes — ADR-024's page-delete-no-confirmation
   * decision extends to archive; an empty folder) — 'archive' fires
   * directly via handlers.archive.
   */
  archiveConfirmationMessage?: string;
  /**
   * Same shape as archiveConfirmationMessage, for 'delete'. Absent for
   * notes (ADR-024's resolved product decision #1: "unlike Page.delete()
   * — no confirmation") and an empty folder; present only for a non-empty
   * folder. This replaces the previous unconditional "always confirm
   * delete" behavior, which showed a dialog for every resource type but
   * whose confirm button never invoked the real delete — fixing that stub
   * is this prop's reason for existing, not a decision to require
   * confirmation for notes.
   */
  deleteConfirmationMessage?: string;
  /**
   * The Move destination picker's folder list — present only when the
   * caller's menu includes a `move-to` item (buildMoveDestinationItems.ts
   * is the one place this list is built, from MembershipSelector, which
   * already excludes Archive/Daily Notes/reserved folders and — for a
   * folder being moved — itself and its own descendants). Absent for a
   * resource type that never gets a `move-to` item at all (Daily Note).
   */
  moveDestinations?: FolderPickerItem[];
  /** Invoked with the chosen destination (`null` = vault root) when a Move destination is selected. */
  onMove?: (destinationFolderId: string | null) => void;
  /**
   * Present alongside moveDestinations when the Move picker should offer
   * creating a new folder for a non-matching search — forwarded straight
   * to MoveDestinationPicker, see its own doc comment for the full flow.
   */
  onCreateFolder?: (name: string) => Promise<string>;
}

/**
 * Shared overflow-menu top bar actions for any resource type (note,
 * daily note, folder). Each resource passes its own menu config and a
 * handlers map keyed by menu item id — items with no matching handler
 * still render but only close the menu when clicked, exactly as every
 * currently-unwired item already behaves today.
 *
 * The confirmation surface (useConfirmationSurface) is the same primitive
 * the sidebar's folder row actions use (Sidebar.Notes.tsx) — one
 * mechanism, one component, shared by every entry point, replacing the
 * divergent window.confirm()/broken-stub behavior both surfaces used to
 * have independently. The Move destination picker (useMoveDestinationTrigger
 * + MoveDestinationPicker) is the same shared-primitive shape, reused by
 * the sidebar's own row components (Folder.tsx/Note.tsx) so Move has
 * exactly one flow regardless of entry point.
 */
export function ResourceTopBarActions({
  menu,
  handlers,
  archiveConfirmationMessage,
  deleteConfirmationMessage,
  moveDestinations,
  onMove,
  onCreateFolder,
}: ResourceTopBarActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const confirmation = useConfirmationSurface();
  const moveTrigger = useMoveDestinationTrigger(moveDestinations);

  function handleMenuSelect(id: string) {
    moveTrigger.handleSelect(id, (id) => {
      if (id === 'delete' && deleteConfirmationMessage !== undefined) {
        confirmation.request({
          title: 'Delete this folder?',
          message: deleteConfirmationMessage,
          confirmLabel: 'Delete',
          onConfirm: () => handlers?.['delete']?.(),
        });
        return;
      }

      if (id === 'archive' && archiveConfirmationMessage !== undefined) {
        confirmation.request({
          title: 'Archive this folder?',
          message: archiveConfirmationMessage,
          confirmLabel: 'Archive',
          onConfirm: () => handlers?.['archive']?.(),
        });
        return;
      }

      handlers?.[id]?.();
    });
  }

  return (
    <>
      <Button size="medium" isIconOnly>
        <AppIcon icon={'favouriteOutline'} />
      </Button>
      <Button size="medium" isIconOnly>
        <AppIcon icon={'widthFill'} />
      </Button>
      <OverflowMenu
        items={menu}
        triggerRef={moveTrigger.triggerRef}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSelect={handleMenuSelect}
        side={OVERFLOW_SIDE}
        alignment={OVERFLOW_ALIGNMENT}
        buttonProps={{
          interaction: 'default',
        }}
      />
      {moveDestinations !== undefined && (
        <MoveDestinationPicker
          anchorRef={moveTrigger.triggerRef}
          open={moveTrigger.open}
          onClose={moveTrigger.close}
          items={moveDestinations}
          onSelect={(destinationFolderId) => {
            moveTrigger.close();
            onMove?.(destinationFolderId);
          }}
          onCreateFolder={onCreateFolder}
          side={OVERFLOW_SIDE}
          alignment={OVERFLOW_ALIGNMENT}
        />
      )}
      <Dialog
        open={confirmation.pending !== null}
        onClose={confirmation.cancel}
        returnFocusRef={moveTrigger.triggerRef}
        size="medium"
      >
        {confirmation.pending && (
          <Confirmation
            title={confirmation.pending.title}
            description={confirmation.pending.message}
            confirmLabel={confirmation.pending.confirmLabel}
            onConfirm={confirmation.confirm}
            onCancel={confirmation.cancel}
          />
        )}
      </Dialog>
    </>
  );
}
