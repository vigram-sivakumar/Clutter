import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

import type { OverlayLayout } from '../Overlay.types';

interface UseOverlayCenteredPositionOptions {
  open: boolean;
  surfaceRef: RefObject<HTMLDivElement>;
}

const COLLISION_PADDING = 8;

const INITIAL_POSITION: OverlayLayout = {
  top: 0,
  left: 0,
  transformOrigin: 'center center',
  placement: 'center',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useOverlayCenteredPosition({
  open,
  surfaceRef,
}: UseOverlayCenteredPositionOptions): OverlayLayout {
  const [position, setPosition] = useState<OverlayLayout>(INITIAL_POSITION);

  const updatePosition = useCallback(() => {
    const surfaceElement = surfaceRef.current;

    if (!surfaceElement) {
      return;
    }

    const overlayRect = surfaceElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const maxLeft = Math.max(
      COLLISION_PADDING,
      viewportWidth - overlayRect.width - COLLISION_PADDING
    );

    const maxTop = Math.max(
      COLLISION_PADDING,
      viewportHeight - overlayRect.height - COLLISION_PADDING
    );

    const nextPosition: OverlayLayout = {
      top: clamp(
        (viewportHeight - overlayRect.height) / 2,
        COLLISION_PADDING,
        maxTop
      ),
      left: clamp(
        (viewportWidth - overlayRect.width) / 2,
        COLLISION_PADDING,
        maxLeft
      ),
      transformOrigin: 'center center',
      placement: 'center',
    };

    setPosition((currentPosition) => {
      const positionHasChanged =
        currentPosition.top !== nextPosition.top ||
        currentPosition.left !== nextPosition.left ||
        currentPosition.transformOrigin !== nextPosition.transformOrigin ||
        currentPosition.placement !== nextPosition.placement;

      return positionHasChanged ? nextPosition : currentPosition;
    });
  }, [surfaceRef]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const surfaceElement = surfaceRef.current;
    const resizeObserver = new ResizeObserver(updatePosition);

    if (surfaceElement) {
      resizeObserver.observe(surfaceElement);
    }

    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      resizeObserver.disconnect();
    };
  }, [open, surfaceRef, updatePosition]);

  return position;
}
