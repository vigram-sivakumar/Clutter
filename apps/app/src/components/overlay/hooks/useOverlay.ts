import { useCallback, useRef, useState } from 'react';

export function useOverlay<T extends HTMLElement = HTMLElement>() {
  const anchorRef = useRef<T>(null);

  const [open, setOpen] = useState(false);

  const show = useCallback(() => {
    setOpen(true);
  }, []);

  const hide = useCallback(() => {
    setOpen(false);
  }, []);

  const toggle = useCallback(() => {
    setOpen((open) => !open);
  }, []);

  return {
    anchorRef,
    open,

    show,
    hide,
    toggle,
  };
}
