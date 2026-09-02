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
import { Popover } from '@components/popover/Popover';
import { ImagePicker } from '@app/layouts/page/cover/image-picker/ImagePicker';
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
   * Same shape as archiveConfirmationMessage, for 'delete'. Unlike
   * archiveConfirmationMessage, this is now always supplied by every
   * caller whenever a 'delete' item is even in `menu` — the deletion-UX
   * product decision (superseding ADR-024's resolved product decision #1)
   * is that Delete is only ever reachable for a resource that is archived
   * or a descendant of the reserved Archive folder, and every such delete
   * requires confirmation regardless of whether a folder being deleted is
   * empty (see getFolderDeleteConfirmation/PAGE_DELETE_CONFIRMATION_MESSAGE
   * in folderActionConfirmation.ts).
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
  /**
   * Current favorite state for the standalone favorite icon button
   * (below) — only meaningful when `onToggleFavorite` is also present.
   */
  isFavorite?: boolean;
  /**
   * Invoked by both the standalone favorite icon button and the overflow
   * menu's `toggle-favorite` item (routed generically through `handlers`
   * below, keyed by that same id) — one PageOperations.updateMetadata /
   * FolderOperations.updateMetadata call (per resource type), two entry
   * points into it, never two implementations. Absent (undefined) omits
   * the standalone button entirely, for any resource type that doesn't
   * support favoriting (a Daily Note, a draft, a reserved folder — the
   * latter never reaches this component at all,
   * ReservedFolderTopBarActions is a separate renderer).
   */
  onToggleFavorite?: () => void;
  /**
   * Present only when the caller's menu includes an `add-cover-image`
   * item — mirrors moveDestinations/onMove's shape exactly (a capability-
   * gating prop, not a plain callback): its presence is what makes
   * `add-cover-image` open the cover popover instead of falling through to
   * `handlers`, the same way `moveDestinations !== undefined` gates
   * `move-to`. Invoked with the submitted URL; the caller is responsible
   * for persisting it (PageOperations.updateMetadata/FolderOperations.
   * updateMetadata, both of which already accept a `cover` patch) — this
   * component never persists anything itself.
   */
  onSetCoverImage?: (url: string) => void;
  /**
   * Present alongside onSetCoverImage when the cover picker supports upload.
   * Invoked with the absolute source path from the native file picker;
   * the caller imports into the vault and persists the vault-relative
   * reference via updateMetadata.
   */
  onSetCoverImageFromUpload?: (sourcePath: string) => void;
  /**
   * Invoked when the cover picker's "none" tab is selected — the caller
   * clears cover via updateMetadata({ cover: null }), same as onSetCoverImage
   * but for removal.
   */
  onRemoveCoverImage?: () => void;
  /**
   * Whether the resource currently has a cover — drives which top-level
   * picker tab is selected on open (image vs hide), without persisting
   * tab choice in localStorage.
   */
  hasCoverImage?: boolean;
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
  isFavorite,
  onToggleFavorite,
  onSetCoverImage,
  onSetCoverImageFromUpload,
  onRemoveCoverImage,
  hasCoverImage = false,
}: ResourceTopBarActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Same "does this row's own trigger button anchor a second popover"
  // shape as moveTrigger below, just a plain boolean instead of a
  // destination-list-driven hook — the cover picker has no list to
  // manage, only an open/closed state. Anchored on the exact same
  // moveTrigger.triggerRef (the overflow button itself), same as
  // MoveDestinationPicker already does, since both popovers open off the
  // one trigger button this menu has.
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const confirmation = useConfirmationSurface();
  const moveTrigger = useMoveDestinationTrigger(moveDestinations);

  function handleMenuSelect(id: string) {
    moveTrigger.handleSelect(id, (id) => {
      if (id === 'add-cover-image' && onSetCoverImage) {
        setCoverPickerOpen(true);
        return;
      }

      if (id === 'delete' && deleteConfirmationMessage !== undefined) {
        // A resource-type-neutral title — unlike 'Archive this folder?'
        // below (archive confirmation stays folder-only), Delete
        // confirmation now applies to every archived/Archive-descendant
        // resource type (note, daily note, folder), not folders alone.
        confirmation.request({
          title: 'Delete permanently?',
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
      {onToggleFavorite && (
        <Button
          size="medium"
          isIconOnly
          onClick={onToggleFavorite}
          aria-label={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
        >
          <AppIcon icon={isFavorite ? 'favouriteFilled' : 'favouriteOutline'} />
        </Button>
      )}
      <Button size="medium" isIconOnly>
        <AppIcon icon={'rightSidebar'} />
      </Button>
      <OverflowMenu
        items={menu}
        triggerRef={moveTrigger.triggerRef}
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSelect={handleMenuSelect}
        side={OVERFLOW_SIDE}
        alignment={OVERFLOW_ALIGNMENT}
        buttonSize="medium"
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
      {onSetCoverImage && (
        <Popover
          anchorRef={moveTrigger.triggerRef}
          open={coverPickerOpen}
          onClose={() => setCoverPickerOpen(false)}
          side={OVERFLOW_SIDE}
          alignment={OVERFLOW_ALIGNMENT}
          size="medium"
        >
          <ImagePicker
            hasCoverImage={hasCoverImage}
            onClose={() => setCoverPickerOpen(false)}
            onRemove={() => {
              onRemoveCoverImage?.();
            }}
            onLinkSubmit={(url) => {
              onSetCoverImage(url);
            }}
            onUploadSubmit={(sourcePath) => {
              setCoverPickerOpen(false);
              onSetCoverImageFromUpload?.(sourcePath);
            }}
          />
        </Popover>
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
