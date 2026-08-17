import { useRef, useState } from 'react';

export interface ChangeIconTrigger {
  /** Pass to the same button that already anchors the row's overflow menu. */
  triggerRef: React.RefObject<HTMLButtonElement>;
  open: boolean;
  close: () => void;
  /**
   * A menu-selection interceptor: opens the Change icon picker for
   * `'change-icon'` when `enabled`, otherwise forwards `id` to `fallback`
   * unchanged — the one place every Change icon entry point special-cases
   * this item id, mirroring useMoveDestinationTrigger's `'move-to'` branch.
   */
  handleSelect: (id: string, fallback: (id: string) => void) => void;
}

export function useChangeIconTrigger(enabled: boolean): ChangeIconTrigger {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  function handleSelect(id: string, fallback: (id: string) => void) {
    if (id === 'change-icon' && enabled) {
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
