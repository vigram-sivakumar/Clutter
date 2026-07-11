import {
  RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { OverlayPlacement } from '../types';

const VIEWPORT_PADDING = 8;

interface UsePositionProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement>;
  surfaceRef: RefObject<HTMLDivElement>;
  placement: OverlayPlacement;
  offset: number;
}

function resolvePlacement(
  placement: OverlayPlacement,
  availableSpace: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  },
  surfaceRect: DOMRect,
  offset: number
): OverlayPlacement {
  let resolvedPlacement = placement;

  if (
    resolvedPlacement === 'bottom-start' &&
    availableSpace.bottom < surfaceRect.height + offset + VIEWPORT_PADDING
  ) {
    resolvedPlacement = 'top-start';
  }

  if (
    resolvedPlacement === 'bottom-end' &&
    availableSpace.bottom < surfaceRect.height + offset + VIEWPORT_PADDING
  ) {
    resolvedPlacement = 'top-end';
  }

  if (
    resolvedPlacement === 'top-start' &&
    availableSpace.top < surfaceRect.height + offset + VIEWPORT_PADDING
  ) {
    resolvedPlacement = 'bottom-start';
  }

  if (
    resolvedPlacement === 'top-end' &&
    availableSpace.top < surfaceRect.height + offset + VIEWPORT_PADDING
  ) {
    resolvedPlacement = 'bottom-end';
  }

  if (
    resolvedPlacement === 'left-start' &&
    availableSpace.left < surfaceRect.width + offset + VIEWPORT_PADDING
  ) {
    resolvedPlacement = 'right-start';
  }

  if (
    resolvedPlacement === 'left-end' &&
    availableSpace.left < surfaceRect.width + offset + VIEWPORT_PADDING
  ) {
    resolvedPlacement = 'right-end';
  }

  if (
    resolvedPlacement === 'right-start' &&
    availableSpace.right < surfaceRect.width + offset + VIEWPORT_PADDING
  ) {
    resolvedPlacement = 'left-start';
  }

  if (
    resolvedPlacement === 'right-end' &&
    availableSpace.right < surfaceRect.width + offset + VIEWPORT_PADDING
  ) {
    resolvedPlacement = 'left-end';
  }

  return resolvedPlacement;
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
    transformOrigin: 'top left',
    side: 'bottom',
  });

  const updatePosition = useCallback(() => {
    if (!anchorRef.current || !surfaceRef.current) {
      return;
    }

    const anchorRect = anchorRef.current.getBoundingClientRect();
    const surfaceRect = surfaceRef.current.getBoundingClientRect();
    const availableSpace = {
      top: anchorRect.top,
      right: window.innerWidth - anchorRect.right,
      bottom: window.innerHeight - anchorRect.bottom,
      left: anchorRect.left,
    };
    const resolvedPlacement = resolvePlacement(
      placement,
      availableSpace,
      surfaceRect,
      offset
    );
    let top = 0;
    let left = 0;
    let transformOrigin = 'top left';
    let side: 'top' | 'bottom' | 'left' | 'right' = 'bottom';

    switch (resolvedPlacement) {
      case 'bottom-start':
        top = anchorRect.bottom + offset;
        left = anchorRect.left;
        transformOrigin = 'top left';
        side = 'bottom';
        break;

      case 'bottom-end':
        top = anchorRect.bottom + offset;
        left = anchorRect.right - surfaceRect.width;
        transformOrigin = 'top right';
        side = 'bottom';
        break;

      case 'top-start':
        top = anchorRect.top - surfaceRect.height - offset;
        left = anchorRect.left;
        transformOrigin = 'bottom left';
        side = 'top';
        break;

      case 'top-end':
        top = anchorRect.top - surfaceRect.height - offset;
        left = anchorRect.right - surfaceRect.width;
        transformOrigin = 'bottom right';
        side = 'top';
        break;

      case 'left-start':
        top = anchorRect.top;
        left = anchorRect.left - surfaceRect.width - offset;
        transformOrigin = 'right top';
        side = 'left';
        break;

      case 'left-end':
        top = anchorRect.bottom - surfaceRect.height;
        left = anchorRect.left - surfaceRect.width - offset;
        transformOrigin = 'right bottom';
        side = 'left';
        break;

      case 'right-start':
        top = anchorRect.top;
        left = anchorRect.right + offset;
        transformOrigin = 'left top';
        side = 'right';
        break;

      case 'right-end':
        top = anchorRect.bottom - surfaceRect.height;
        left = anchorRect.right + offset;
        transformOrigin = 'left bottom';
        side = 'right';
        break;

      default:
        top = anchorRect.bottom + offset;
        left = anchorRect.left;
        transformOrigin = 'top left';
        side = 'bottom';
    }

    left = Math.max(VIEWPORT_PADDING, left);
    left = Math.min(
      left,
      window.innerWidth - surfaceRect.width - VIEWPORT_PADDING
    );

    top = Math.max(VIEWPORT_PADDING, top);
    top = Math.min(
      top,
      window.innerHeight - surfaceRect.height - VIEWPORT_PADDING
    );

    setPosition({
      top,
      left,
      transformOrigin,
      side,
    });
  }, [placement, offset]);

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

    window.addEventListener('resize', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, [open, updatePosition]);

  return position;
}
