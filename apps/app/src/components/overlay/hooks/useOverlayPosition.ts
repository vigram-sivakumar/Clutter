import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

import type { OverlayAlignment, OverlaySide } from '../Overlay.types';

export interface OverlayPosition {
  top: number;
  left: number;
  transformOrigin: string;
  side: OverlaySide;
}

interface UseOverlayPositionOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  surfaceRef: RefObject<HTMLDivElement>;
  side: OverlaySide;
  alignment: OverlayAlignment;
  offset: number;
}

type AvailableSpace = Record<OverlaySide, number>;

const INITIAL_POSITION: OverlayPosition = {
  top: 0,
  left: 0,
  transformOrigin: 'top left',
  side: 'bottom',
};

// Keep a small gap between the overlay and the viewport edges.
const COLLISION_PADDING = 8;

const OPPOSITE_SIDE: Record<OverlaySide, OverlaySide> = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Prefer the requested side, then the opposite side, then whichever
// side provides more usable space when neither side fully fits.
function resolveSide(
  side: OverlaySide,
  availableSpace: AvailableSpace,
  overlayRect: DOMRect,
  offset: number
): OverlaySide {
  const oppositeSide = OPPOSITE_SIDE[side];

  const isVerticalSide = side === 'top' || side === 'bottom';

  const overlaySize = isVerticalSide ? overlayRect.height : overlayRect.width;

  const requiredSpace = overlaySize + offset + COLLISION_PADDING;

  const requestedSideSpace = availableSpace[side];
  const oppositeSideSpace = availableSpace[oppositeSide];

  if (requestedSideSpace >= requiredSpace) {
    return side;
  }

  if (oppositeSideSpace >= requiredSpace) {
    return oppositeSide;
  }

  return oppositeSideSpace > requestedSideSpace ? oppositeSide : side;
}

export function useOverlayPosition({
  open,
  anchorRef,
  surfaceRef,
  side,
  alignment,
  offset,
}: UseOverlayPositionOptions): OverlayPosition {
  const [position, setPosition] = useState<OverlayPosition>(() => ({
    ...INITIAL_POSITION,
    side,
  }));

  // Measure both elements and calculate the overlay position.
  const updatePosition = useCallback(() => {
    const anchorElement = anchorRef.current;
    const surfaceElement = surfaceRef.current;

    if (!anchorElement || !surfaceElement) {
      return;
    }

    const anchorRect = anchorElement.getBoundingClientRect();

    const overlayRect = surfaceElement.getBoundingClientRect();

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const availableSpace: AvailableSpace = {
      top: anchorRect.top,
      right: viewportWidth - anchorRect.right,
      bottom: viewportHeight - anchorRect.bottom,
      left: anchorRect.left,
    };

    const resolvedSide = resolveSide(side, availableSpace, overlayRect, offset);

    const isStartAligned = alignment === 'start';

    let top = 0;
    let left = 0;
    let transformOrigin = 'top left';

    switch (resolvedSide) {
      case 'bottom':
        top = anchorRect.bottom + offset;

        left = isStartAligned
          ? anchorRect.left
          : anchorRect.right - overlayRect.width;

        transformOrigin = isStartAligned ? 'top left' : 'top right';
        break;

      case 'top':
        top = anchorRect.top - overlayRect.height - offset;

        left = isStartAligned
          ? anchorRect.left
          : anchorRect.right - overlayRect.width;

        transformOrigin = isStartAligned ? 'bottom left' : 'bottom right';
        break;

      case 'left':
        top = isStartAligned
          ? anchorRect.top
          : anchorRect.bottom - overlayRect.height;

        left = anchorRect.left - overlayRect.width - offset;

        transformOrigin = isStartAligned ? 'right top' : 'right bottom';
        break;

      case 'right':
        top = isStartAligned
          ? anchorRect.top
          : anchorRect.bottom - overlayRect.height;

        left = anchorRect.right + offset;

        transformOrigin = isStartAligned ? 'left top' : 'left bottom';
        break;
    }

    const maxLeft = Math.max(
      COLLISION_PADDING,
      viewportWidth - overlayRect.width - COLLISION_PADDING
    );

    const maxTop = Math.max(
      COLLISION_PADDING,
      viewportHeight - overlayRect.height - COLLISION_PADDING
    );

    const nextPosition: OverlayPosition = {
      top: clamp(top, COLLISION_PADDING, maxTop),
      left: clamp(left, COLLISION_PADDING, maxLeft),
      transformOrigin,
      side: resolvedSide,
    };

    setPosition((currentPosition) => {
      const positionHasChanged =
        currentPosition.top !== nextPosition.top ||
        currentPosition.left !== nextPosition.left ||
        currentPosition.transformOrigin !== nextPosition.transformOrigin ||
        currentPosition.side !== nextPosition.side;

      return positionHasChanged ? nextPosition : currentPosition;
    });
  }, [anchorRef, surfaceRef, side, alignment, offset]);

  // Position the overlay before the browser paints it.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
  }, [open, updatePosition]);

  // Keep the overlay aligned as its elements or surroundings change.
  useEffect(() => {
    if (!open) {
      return;
    }

    const anchorElement = anchorRef.current;
    const surfaceElement = surfaceRef.current;

    const resizeObserver = new ResizeObserver(updatePosition);

    if (anchorElement) {
      resizeObserver.observe(anchorElement);
    }

    if (surfaceElement) {
      resizeObserver.observe(surfaceElement);
    }

    window.addEventListener('resize', updatePosition);

    document.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);

      document.removeEventListener('scroll', updatePosition, true);

      resizeObserver.disconnect();
    };
  }, [open, anchorRef, surfaceRef, updatePosition]);

  return position;
}
