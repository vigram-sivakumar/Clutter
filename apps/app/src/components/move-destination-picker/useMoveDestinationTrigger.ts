import { useRef, useState } from 'react';
import type { FolderPickerItem } from '@components/folder-picker/FolderPicker.types';

export interface MoveDestinationTrigger {
  /** Pass to the same button that already anchors the row/topbar's overflow menu. */
  triggerRef: React.RefObject<HTMLButtonElement>;
  open: boolean;
  close: () => void;
  /**
   * A menu-selection interceptor: opens the Move picker for `'move-to'`
   * when `moveDestinations` is defined, otherwise forwards `id` to
   * `fallback` unchanged — the one place every Move entry point (topbar,
   * sidebar note row, sidebar folder row) special-cases this one item id,
   * so none of them re-derive the same branch independently.
   */
  handleSelect: (id: string, fallback: (id: string) => void) => void;
}

/**
 * The one piece of "wire a Move destination picker to this row/menu's own
 * trigger button" logic, shared by every Move entry point so only the
 * unavoidable per-surface plumbing (which trigger button, which handler)
 * is repeated — the actual flow (MoveDestinationPicker, the destination
 * list, the backend call) is never duplicated. Mirrors the shape
 * ResourceTopBarActions already used inline for its own Move popover
 * before this was extracted for the sidebar to reuse too.
 */
export function useMoveDestinationTrigger(
  moveDestinations: FolderPickerItem[] | undefined
): MoveDestinationTrigger {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  function handleSelect(id: string, fallback: (id: string) => void) {
    if (id === 'move-to' && moveDestinations !== undefined) {
      setOpen(true);
      return;
    }

    fallback(id);
  }

  return {
    triggerRef,
    open,
    close: () => setOpen(false),
    handleSelect,
  };
}
