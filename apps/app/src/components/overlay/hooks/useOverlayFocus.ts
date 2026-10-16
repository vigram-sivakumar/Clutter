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

type InputModality = 'pointer' | 'keyboard';

/**
 * The most recent kind of user input, tracked once for the whole document (capture phase, so nothing can stop
 * it): a pointer press or right-click, or a key. WebKit draws a `:focus-visible` ring around a control that
 * receives script focus after keyboard use, and — for a right-click — even after pointer use; knowing the real
 * modality is what lets an overlay decide whether handing focus back to its trigger is wanted.
 */
let lastInputModality: InputModality = 'keyboard';
let modalityTracked = false;

function trackInputModality(): void {
  if (modalityTracked || typeof document === 'undefined') {
    return;
  }
  modalityTracked = true;
  const pointer = () => {
    lastInputModality = 'pointer';
  };
  const keyboard = () => {
    lastInputModality = 'keyboard';
  };
  document.addEventListener('pointerdown', pointer, true);
  document.addEventListener('mousedown', pointer, true);
  document.addEventListener('contextmenu', pointer, true);
  document.addEventListener('keydown', keyboard, true);
}

export function useOverlayFocus({
  open,
  returnFocusRef,
  suppressReturnFocusRef,
}: UseOverlayFocusOptions) {
  const wasOpen = useRef(open);
  trackInputModality();
  // How the overlay was OPENED (the input just before it): a menu opened with the mouse hands nothing back to
  // its trigger when it closes, so no keyboard-style focus ring is drawn around a button the user only clicked.
  const openedByRef = useRef<InputModality>('keyboard');
  useEffect(() => {
    if (open) {
      openedByRef.current = lastInputModality;
    }
  }, [open]);

  useEffect(() => {
    if (wasOpen.current && !open) {
      if (suppressReturnFocusRef?.current) {
        suppressReturnFocusRef.current = false;
      } else {
        const target = returnFocusRef?.current;
        // A text field keeps getting focus back (typing carries on); a control only when the overlay was
        // opened AND closed from the keyboard (where the focus indicator is the right feedback).
        const isTextEntry = target?.matches?.('input, textarea, [contenteditable="true"]') ?? false;
        const keyboardInteraction = openedByRef.current === 'keyboard' && lastInputModality === 'keyboard';
        if (target && (keyboardInteraction || isTextEntry)) {
          target.focus();
        }
      }
    }

    wasOpen.current = open;
  }, [open, returnFocusRef, suppressReturnFocusRef]);
}
