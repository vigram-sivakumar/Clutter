import { RefObject, useLayoutEffect, useState } from 'react';
import { OverlayPlacement } from '../types';

interface UsePositionProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  surfaceRef: RefObject<HTMLDivElement>;
  placement: OverlayPlacement;
  offset: number;
}

export function usePosition({
  open,
  anchorRef,
  surfaceRef,
  placement,
  offset,
}: UsePositionProps) {
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
  });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !surfaceRef.current) {
      return;
    }

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const surfaceRect = surfaceRef.current.getBoundingClientRect();
    // const VIEWPORT_PADDING = 8;

    switch (placement) {
      case 'bottom-start':
        setPosition({
          top: anchorRect.bottom + offset,
          left: anchorRect.left,
        });
        break;

      case 'bottom-end':
        setPosition({
          top: anchorRect.bottom + offset,
          left: anchorRect.right - surfaceRect.width,
        });
        break;

      case 'top-start':
        setPosition({
          top: anchorRect.top - surfaceRect.height - offset,
          left: anchorRect.left,
        });
        break;

      case 'top-end':
        setPosition({
          top: anchorRect.top - surfaceRect.height - offset,
          left: anchorRect.right - surfaceRect.width,
        });
        break;

      default:
        setPosition({
          top: anchorRect.bottom + offset,
          left: anchorRect.left,
        });
    }
  }, [open, anchorRef, surfaceRef, placement, offset]);

  return position;
}
