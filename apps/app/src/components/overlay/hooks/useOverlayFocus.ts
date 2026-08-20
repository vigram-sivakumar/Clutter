import { useEffect, useRef } from 'react';
import type { MutableRefObject, RefObject } from 'react';

interface UseOverlayFocusOptions {
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement>;
  /**
   * Set `.current = true` right before the state change that closes the
   * overlay, to skip *this one* restoration — the escape hatch for a menu
   * action that intentionally hands focus somewhere else (e.g. a "Rename"
   * item mounting an inline `EditableText`) rather than wanting it back on
   * the trigger. Consumed (reset to `false`) the moment this effect
   * observes it, so it can never suppress a later, unrelated close —
   * every other close (Escape, outside click, an ordinary menu item)
   * keeps restoring focus exactly as before. `MutableRefObject`, not
   * `RefObject`, since this hook writes back to it (the "consume" half of
   * consume-and-reset) — the caller's `useRef(false)` already gives it a
   * mutable ref for free.
   */
  suppressReturnFocusRef?: MutableRefObject<boolean>;
}

export function useOverlayFocus({
  open,
  returnFocusRef,
  suppressReturnFocusRef,
}: UseOverlayFocusOptions) {
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) {
      if (suppressReturnFocusRef?.current) {
        suppressReturnFocusRef.current = false;
      } else {
        returnFocusRef?.current?.focus();
      }
    }

    wasOpen.current = open;
  }, [open, returnFocusRef, suppressReturnFocusRef]);
}
