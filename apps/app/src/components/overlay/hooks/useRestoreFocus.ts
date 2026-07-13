import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface UseRestoreFocusOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
}

export function useRestoreFocus({ open, anchorRef }: UseRestoreFocusOptions) {
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) {
      anchorRef.current?.focus();
    }

    wasOpen.current = open;
  }, [open, anchorRef]);
}
