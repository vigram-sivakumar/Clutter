import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface UseOverlayFocusOptions {
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement>;
}

export function useOverlayFocus({ open, returnFocusRef }: UseOverlayFocusOptions) {
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) {
      returnFocusRef?.current?.focus();
    }

    wasOpen.current = open;
  }, [open, returnFocusRef]);
}
