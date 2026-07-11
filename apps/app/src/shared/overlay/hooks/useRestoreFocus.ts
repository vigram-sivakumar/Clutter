import { RefObject, useEffect, useRef } from 'react';

interface UseRestoreFocusProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
}

export function useRestoreFocus({ open, anchorRef }: UseRestoreFocusProps) {
  const wasOpen = useRef(open);

  useEffect(() => {
    if (wasOpen.current && !open) {
      anchorRef.current?.focus();
    }

    wasOpen.current = open;
  }, [open, anchorRef]);
}
