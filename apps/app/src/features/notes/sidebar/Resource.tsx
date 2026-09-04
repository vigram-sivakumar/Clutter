import { Entry, type EntryProps } from '@components/entry/Entry';
import { EditableText } from '@components/editable-text/EditableText';
import { OverflowMenu } from '@components/menu/OverflowMenu';
import type { OverflowMenuItemConfig } from '@components/menu/OverflowMenu';
import { MoveDestinationPicker } from '@components/move-destination-picker/MoveDestinationPicker';
import { useMoveDestinationTrigger } from '@components/move-destination-picker/useMoveDestinationTrigger';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import { AppIcon } from '@shared/icon';
import { getResourceIcon } from '@core/presentation/getResourceIcon';
import { getResourceDisplayName } from '@core/presentation/getResourceDisplayName';
import type { VaultResource } from '@core/vault/models/VaultResource';

import './Resource.css';

export interface ResourceProps
  extends Omit<EntryProps, 'children' | 'onClick' | 'resource'> {
  resource: VaultResource;
  /**
   * Invoked on click for both supported resource kinds (image, pdf) — the
   * caller decides which overlay to open (ImageOverlay/PdfOverlay) based
   * on `resource.kind` (see Sidebar.tsx/PageHost.tsx's own
   * `ResourceOverlayState` routing). Every resource kind is clickable;
   * there is currently no kind with no click behavior.
   */
  onClick?(resource: VaultResource): void;

  /** Renders the title as an EditableText field instead of static text — same shape as Note's isEditing. */
  isEditing?: boolean;
  /**
   * Discrete commit only (no continuous channel, unlike a persisted Note's
   * onTitleEdit/onTitleFlush) — ResourceOperations.renameResource() is a
   * single one-shot Gate call, not a debounced autosave channel, so there
   * is nothing to continuously commit to. Always accepts (never returns
   * `false`): unlike Note/Folder rename, a resource rename never rejects
   * an exact collision — MoveService.resolveResourceRenameDestination's
   * existing auto-suffix behavior is what the approved design keeps, not
   * a new reject-on-collision rule. The value passed here is the
   * extension-free stem the user typed/edited (see the EditableText
   * `value` below) — never the full filename with extension.
   */
  onTitleCommit?(value: string): void;
  /** Fired when the rename session ends (committed or not) — the row's own signal to leave edit mode. Same as Note's onTitleEditingEnd. */
  onTitleEditingEnd?(): void;

  /** Overflow menu items — omitted renders no menu at all (unchanged default). */
  menuItems?: readonly OverflowMenuItemConfig[];
  menuOpen?: boolean;
  onMenuOpenChange?(open: boolean): void;
  onMenuSelect?(id: string): void;

  /**
   * Present only when `menuItems` includes a `move-to` item — the same
   * Move destination picker (MoveDestinationPicker + useMoveDestinationTrigger)
   * Note.tsx/Folder.tsx use, so a resource's Move flow looks identical to
   * every other row's. Selecting 'move-to' from this row's own overflow
   * menu opens the picker anchored on this row's own trigger button,
   * instead of forwarding to onMenuSelect.
   */
  moveDestinations?: FolderPickerItem[];
  /** Invoked with the chosen destination (`null` = vault root). */
  onMove?(destinationFolderId: string | null): void;
  /** Present alongside moveDestinations — see MoveDestinationPicker's matching prop. */
  onCreateFolder?(name: string): Promise<string>;

  /**
   * Hover-only actions for an archived resource (Restore/Delete icon
   * buttons) — reuses Entry's existing `actions` slot (already hover-gated
   * by Entry.css's `.entry__actions` rules; the same slot Folder.tsx's own
   * "+" button already shares with its overflow menu), not a new hover
   * mechanism. Takes priority over menuItems when present: an archived
   * resource never shows the normal three-dot menu (no Rename for an
   * archived resource, per the approved Archive UX), so the two are
   * mutually exclusive, never combined.
   */
  archiveActions?: React.ReactNode;
}

/**
 * One row component for every supported non-Markdown resource kind
 * (image, pdf) — not a separate Image/Pdf component pair, since both are
 * the same shape (icon + name, no draft/session concept) and differ only
 * in which icon renders and which overlay a click opens. Mirrors
 * Note.tsx's use of Entry/EditableText/OverflowMenu, pruned to exactly the
 * subset a resource needs: no title-Markdown rendering (a resource name is
 * a plain filename, never Markdown), no continuous rename channel, no
 * Duplicate/Favorite/Change-icon wiring — none of those exist for a
 * VaultResource.
 */
export function Resource({
  resource,
  onClick,
  isEditing = false,
  onTitleCommit,
  onTitleEditingEnd,
  menuItems,
  menuOpen = false,
  onMenuOpenChange,
  onMenuSelect,
  moveDestinations,
  onMove,
  onCreateFolder,
  archiveActions,
  // Pulled out (not left in ...entryProps) so it can be combined with this
  // row's own hover-forcing reason (an open menu) below — same fix as
  // Note.tsx/Folder.tsx's identical shape.
  forceHover: externalForceHover = false,
  ...entryProps
}: ResourceProps) {
  const isClickable = onClick !== undefined && !isEditing;
  // The user should never need to type (or see) the resource's extension —
  // ResourceOperations.renameResource()/the Gate's resolveResourceRenameDestination
  // always preserve the resource's own real extension, never the caller's.
  const editingStem = getResourceDisplayName(resource);
  const moveTrigger = useMoveDestinationTrigger(moveDestinations);

  return (
    <>
      <Entry
        {...entryProps}
        forceHover={externalForceHover || menuOpen || moveTrigger.open}
        leading={
          <AppIcon
            className="resource__icon"
            icon={getResourceIcon(resource.kind)}
          />
        }
        actions={
          archiveActions ??
          (menuItems ? (
            <OverflowMenu
              items={menuItems}
              triggerRef={moveTrigger.triggerRef}
              open={menuOpen}
              onOpenChange={onMenuOpenChange ?? (() => {})}
              onSelect={(id) => moveTrigger.handleSelect(id, onMenuSelect ?? (() => {}))}
              side="bottom"
              alignment="start"
            />
          ) : undefined)
        }
        onClick={isClickable ? () => onClick(resource) : undefined}
      >
        {isEditing ? (
          <EditableText
            value={editingStem}
            autoFocus
            onCommit={onTitleCommit ?? (() => {})}
            onEditingEnd={onTitleEditingEnd}
          />
        ) : (
          <span className="resource__title">{editingStem}</span>
        )}
      </Entry>
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
          side="bottom"
          alignment="start"
        />
      )}
    </>
  );
}
