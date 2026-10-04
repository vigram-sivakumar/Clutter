import { useMemo } from 'react';
import type { RefObject } from 'react';

import { Popover } from '@components/popover/Popover';
import { PickerCard } from '@components/picker-card/PickerCard';
import {
  ROOT_DESTINATION_ID,
  type FolderPickerItem,
} from '@components/folder-picker/FolderPicker.types';
import type {
  OverlayAlignment,
  OverlaySide,
} from '@components/overlay/Overlay.types';

export interface MoveDestinationPickerProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  items: FolderPickerItem[];
  /** `null` when the selected item is the vault root (ROOT_DESTINATION_ID). */
  onSelect: (destinationFolderId: string | null) => void;
  /**
   * Present only when the caller wants FolderPicker's "Create ..." row
   * offered for a non-matching search — orchestration only: this
   * component never creates a folder itself, it calls the existing
   * creation flow the caller supplies (FolderOperations.create(), via
   * PageHost.tsx/Sidebar.Notes.tsx) and then routes the returned id
   * through the exact same `onSelect` a real folder click already uses,
   * so the newly created folder becomes the Move destination and the
   * picker closes exactly the way selecting any other folder already
   * does — nothing here duplicates onSelect's caller-side close logic.
   */
  onCreateFolder?: (name: string) => Promise<string>;
  side?: OverlaySide;
  alignment?: OverlayAlignment;
}

/**
 * The one Move destination-picker surface — Popover + FolderPicker, shared
 * by every Move entry point (Note/Folder, topbar and sidebar) so the flow
 * (what's offered, what's excluded, what gets called) has exactly one
 * implementation. Callers only ever supply a folder list (via
 * buildMoveDestinationItems.ts) and a selection handler.
 *
 * Has no UI of its own for the vault root — no dedicated row, footer
 * action, or divider. When the caller's `items` includes the root sentinel
 * (buildMoveDestinationItems.ts prepends an item titled with the vault's
 * own physical folder name, labeled "Home", with id ROOT_DESTINATION_ID),
 * FolderPicker renders it as an ordinary top-level row; this component is
 * the one place that recognizes that id and translates it back to `null`
 * — the destination `PageOperations.move()`/`FolderOperations.move()`
 * already accept for "move to vault root".
 */
/**
 * The destination list as a flat, searchable list — no tree. The vault root ("Home") stays first;
 * every folder after it is one alphabetical row with its parent path shown under the name (the
 * `ancestors` the builder already attaches). No `section`, so the card draws no section title,
 * divider or Show more.
 */
function flattenDestinations(items: FolderPickerItem[]): FolderPickerItem[] {
  const flat = (item: FolderPickerItem): FolderPickerItem => ({ ...item, level: 0, parentId: null });
  const root = items.filter((item) => item.id === ROOT_DESTINATION_ID).map(flat);
  const folders = items
    .filter((item) => item.id !== ROOT_DESTINATION_ID)
    .map(flat)
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  return [...root, ...folders];
}

export function MoveDestinationPicker({
  anchorRef,
  open,
  onClose,
  items,
  onSelect,
  onCreateFolder,
  side,
  alignment,
}: MoveDestinationPickerProps) {
  const destinations = useMemo(() => flattenDestinations(items), [items]);

  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} side={side} alignment={alignment}>
      <PickerCard
        title="Move to"
        onClose={onClose}
        items={destinations}
        placeholder="Search folders"
        leadingIcon="folder"
        onSelect={(item) =>
          onSelect(item.id === ROOT_DESTINATION_ID ? null : item.id)
        }
        onCreate={
          onCreateFolder
            ? (name) => void onCreateFolder(name).then((id) => onSelect(id))
            : undefined
        }
      />
    </Popover>
  );
}
