import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface UseOverlayFocusOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  overlayRef: RefObject<HTMLDivElement>;
}

export function useOverlayFocus({
  open,
  anchorRef,
  overlayRef,
}: UseOverlayFocusOptions) {
  const wasOpen = useRef(open);

  useEffect(() => {
    // Overlay just opened
    // Overlay content is expected to render a single focusable root element.
    // Focus that root when the overlay opens.
    if (!wasOpen.current && open) {
      const content = overlayRef.current
        ?.firstElementChild as HTMLElement | null;
      const focusTarget = content?.firstElementChild as HTMLElement | null;

      focusTarget?.focus();
    }

    // Overlay just closed
    if (wasOpen.current && !open) {
      anchorRef.current?.focus();
    }

    wasOpen.current = open;
  }, [open, anchorRef, overlayRef]);
}
