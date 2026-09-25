import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import type { RefObject } from 'react';

import type { OverlayAlignment, OverlayLayout, OverlaySide } from '../Overlay.types';

interface UseOverlayPositionOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  surfaceRef: RefObject<HTMLDivElement>;
  side: OverlaySide;
  alignment: OverlayAlignment;
  offset: number;
}

type AvailableSpace = Record<OverlaySide, number>;

const INITIAL_POSITION: OverlayLayout = {
  top: 0,
  left: 0,
  transformOrigin: 'top left',
  placement: 'bottom',
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
}: UseOverlayPositionOptions): OverlayLayout {
  const [position, setPosition] = useState<OverlayLayout>(() => ({
    ...INITIAL_POSITION,
    placement: side,
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

    const nextPosition: OverlayLayout = {
      top: clamp(top, COLLISION_PADDING, maxTop),
      left: clamp(left, COLLISION_PADDING, maxLeft),
      transformOrigin,
      placement: resolvedSide,
    };

    setPosition((currentPosition) => {
      const positionHasChanged =
        currentPosition.top !== nextPosition.top ||
        currentPosition.left !== nextPosition.left ||
        currentPosition.transformOrigin !== nextPosition.transformOrigin ||
        currentPosition.placement !== nextPosition.placement;

      return positionHasChanged ? nextPosition : currentPosition;
    });
  }, [anchorRef, surfaceRef, side, alignment, offset]);

  // Position the overlay before the browser paints it. Deliberately has no
  // dependency array: it must re-run after *every* commit while open, not
  // just when `open`/`updatePosition` identity changes. A caller that swaps
  // an overlay's children in place while it's open (e.g. PageCover's More
  // Actions menu -> ImagePicker swap, both hosted in one Overlay instance)
  // changes the surface's size within the same commit as that state
  // update, with no anchor movement and no `open`/`updatePosition` change
  // to re-trigger a dependency-gated effect. Without this recompute running
  // synchronously here, the new content first paints at the *old* size's
  // position (wrong for `alignment="end"`, whose `left` depends on the
  // surface's own width), then jumps once the async ResizeObserver/rAF
  // correction (below) catches up — a visible shift-then-snap-back. Running
  // on every render fixes this because `updatePosition` only calls
  // `setState` when the computed position actually changed (see its own
  // definition above), so a render where nothing moved costs a cheap pair
  // of `getBoundingClientRect()` calls and no extra re-render.
  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();
  });

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

  // The anchor can also move for reasons none of the mechanisms above
  // ever observe: a layout change elsewhere in the document (e.g. a
  // sibling/ancestor growing or an animated CSS property like flex-basis
  // reflowing the row it sits in) shifts the anchor's on-screen position
  // without changing the anchor's *own* box size — the one thing
  // ResizeObserver reports — and without firing `scroll` or `resize`
  // either. A CSS transition compounds this: the anchor's position keeps
  // changing every frame for the transition's whole duration, not just
  // once at the moment the triggering DOM change lands, so even a
  // MutationObserver (one callback, at mutation time) can't track it
  // smoothly through to the end. Continuously re-measuring on every
  // animation frame while open is the one mechanism that covers all of
  // this uniformly — `updatePosition` only calls `setState` when the
  // computed position actually differs (see its own definition above),
  // so a frame where nothing has moved costs a cheap pair of
  // `getBoundingClientRect()` calls and no re-render.
  useEffect(() => {
    if (!open) {
      return;
    }

    let frameId: number;

    const tick = () => {
      updatePosition();
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameId);
  }, [open, updatePosition]);

  return position;
}
