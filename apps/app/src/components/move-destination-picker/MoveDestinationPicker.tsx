import type { RefObject } from 'react';

import { Popover } from '@components/popover/Popover';
import { FolderPicker } from '@components/folder-picker/FolderPicker';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';
import type {
  OverlayAlignment,
  OverlaySide,
} from '@components/overlay/Overlay.types';

export interface MoveDestinationPickerProps {
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  items: FolderPickerItem[];
  onSelect: (destinationFolderId: string) => void;
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
 * Deliberately has no UI representation for the vault root — no row, no
 * footer action, no divider, nothing. `PageOperations.move()`/
 * `FolderOperations.move()` still accept `null` as a destination
 * (root-as-null remains a fully supported backend contract, unchanged),
 * but exposing it in this picker is a separate, not-yet-decided UX
 * question; this component only ever calls `onSelect` with a real folder
 * id, never invents a synthetic root item to route through the same path.
 */
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
  return (
    <Popover anchorRef={anchorRef} open={open} onClose={onClose} side={side} alignment={alignment}>
      <FolderPicker
        items={items}
        onSelect={(item) => onSelect(item.id)}
        onCreate={
          onCreateFolder
            ? (name) => void onCreateFolder(name).then((id) => onSelect(id))
            : undefined
        }
      />
    </Popover>
  );
}
