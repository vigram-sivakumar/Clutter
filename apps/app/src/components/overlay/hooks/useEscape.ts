import { useEffect, useRef } from 'react';

interface UseEscapeOptions {
  open: boolean;
  onClose: () => void;
}

/**
 * Every open overlay registers itself here for as long as it's open — most
 * recently opened last. A nested overlay (e.g. an OverflowMenu submenu,
 * opened from inside its already-open parent menu) ends up last in this
 * list, so Escape closes only it first; the parent only sees Escape once
 * the submenu has closed and been removed. Without this, two independently
 * `document`-level Escape listeners (parent's and submenu's) would both
 * fire off a single keypress and close both overlays at once.
 */
const openOverlayIds: symbol[] = [];

/**
 * Whether any overlay (dialog, popover, menu) is open right now — that is, whether the next Escape belongs to one of them.
 * Meant for something else that also answers Escape and must stand aside for an open overlay: read it when the key goes
 * DOWN (a capture-phase listener, before any overlay handles it), because the overlay that closes on this very key leaves
 * the list as soon as it has, and a listener that looks afterwards would find it already gone.
 */
export function hasOpenOverlay(): boolean {
  return openOverlayIds.length > 0;
}

export function useEscape({ open, onClose }: UseEscapeOptions) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const idRef = useRef<symbol>(undefined);
  if (!idRef.current) {
    idRef.current = Symbol('overlay');
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const id = idRef.current!;
    openOverlayIds.push(id);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }
      if (openOverlayIds[openOverlayIds.length - 1] !== id) {
        return;
      }
      onCloseRef.current();
    }

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const index = openOverlayIds.indexOf(id);
      if (index !== -1) {
        openOverlayIds.splice(index, 1);
      }
    };
  }, [open]);
}
