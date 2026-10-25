import { useCallback, useEffect, useRef } from 'react';

import {
  createDragAutoScroller,
  DRAG_THRESHOLD_PX,
  findScrollContainer,
  isMultiSelectToggleClick,
  lockDragSelection,
  NESTED_INTERACTIVE_SELECTOR,
  swallowNextClick,
} from '@shared/interaction';
import type { CollectionSelection } from './useCollectionSelection';
import './marquee.css';

/** A press on any of these is never the start of a marquee: an item (which has its own click and drag), a control, a field, a handle. */
const NOT_A_MARQUEE_START = `[data-selection-id], [data-no-marquee], [contenteditable]:not([contenteditable="false"]), ${NESTED_INTERACTIVE_SELECTOR}`;

interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const intersects = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * Drag-to-select for a collection body. Press on empty space and drag: a rectangle follows the pointer and the
 * items it touches (by their rendered bounds — every item carries `data-selection-id`) become the selection,
 * continuously, through the body's one selection state (`useCollectionSelection.setSelected`) — so selection
 * mode, checkboxes and styling are exactly what checking them by hand gives. Plain drag replaces the selection;
 * with Cmd (macOS) / Ctrl (elsewhere) held at the press it adds to it.
 *
 * Attach `ref` to the body's root element. The press itself is listened for on the root's SCROLL CONTAINER — the full
 * surface the collection sits on — so the empty gutters to the left and right of the content start a marquee too,
 * not just the content-width box; a press outside the root counts only within the root's own vertical extent (the
 * page header above it, and the scrollbar, never start one). The rectangle is a plain element in `document.body` (below menus and
 * dialogs, `pointer-events: none`), moved directly rather than through React, so dragging never re-renders the body.
 * The rectangle is anchored in the scroll container's CONTENT, so scrolling — by wheel or by the edge auto-scroll
 * while the pointer rests near the edge or beyond it — grows it correctly. Tracking is document-wide, so the
 * pointer may leave the collection and be released anywhere; release, Escape (which restores the selection the
 * press found), pointer cancel, window blur and unmount all end it and remove the rectangle and every listener.
 */
export function useMarqueeSelection(selection: CollectionSelection): {
  ref(element: HTMLElement | null): void;
} {
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const teardownRef = useRef<(() => void) | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const detachRef = useRef<(() => void) | null>(null);

  // Unmounting mid-gesture leaves no listener, rectangle or lock behind.
  useEffect(() => () => teardownRef.current?.(), []);

  const onPointerDown = useCallback((event: PointerEvent) => {
    const root = rootRef.current;
    if (!root || event.button !== 0 || event.isPrimary === false) {
      return;
    }
    const target = event.target as HTMLElement;
    const scroller = findScrollContainer(root);
    const surface = scroller ?? root;

    if (target.closest(NOT_A_MARQUEE_START)) {
      return;
    }
    if (!root.contains(target)) {
      // The gutters: empty surface beside the content, within the content's own vertical extent.
      const bounds = root.getBoundingClientRect();
      if (event.clientY < bounds.top || event.clientY > bounds.bottom) {
        return;
      }
      // A press on the scroll container's own scrollbar scrolls it.
      if (target === surface && surface.clientWidth > 0) {
        const view = surface.getBoundingClientRect();
        if (event.clientX - view.left >= surface.clientWidth || event.clientY - view.top >= surface.clientHeight) {
          return;
        }
      }
    }

    teardownRef.current?.();

    const pointerId = event.pointerId;
    const start = {
      x: event.clientX,
      y: event.clientY,
      scrollTop: scroller?.scrollTop ?? 0,
      scrollLeft: scroller?.scrollLeft ?? 0,
    };
    const pointer = { x: start.x, y: start.y };
    const additive = isMultiSelectToggleClick(event);
    const before = [...selectionRef.current.selectedIds];

    let dragging = false;
    let releaseLock: (() => void) | null = null;
    let marquee: HTMLDivElement | null = null;
    let lastKey = '';

    const update = () => {
      if (!dragging) {
        return;
      }
      // The anchor travels with the content, so scrolling grows the rectangle.
      const anchorX = start.x - ((scroller?.scrollLeft ?? 0) - start.scrollLeft);
      const anchorY = start.y - ((scroller?.scrollTop ?? 0) - start.scrollTop);
      const box: Box = {
        left: Math.min(anchorX, pointer.x),
        top: Math.min(anchorY, pointer.y),
        right: Math.max(anchorX, pointer.x),
        bottom: Math.max(anchorY, pointer.y),
      };

      // Drawn only inside the scrolling area; hit-tested on its full extent.
      const view = scroller?.getBoundingClientRect();
      const drawn: Box = view
        ? {
            left: Math.max(box.left, view.left),
            top: Math.max(box.top, view.top),
            right: Math.min(box.right, view.right),
            bottom: Math.min(box.bottom, view.bottom),
          }
        : box;
      if (marquee) {
        marquee.style.left = `${drawn.left}px`;
        marquee.style.top = `${drawn.top}px`;
        marquee.style.width = `${Math.max(0, drawn.right - drawn.left)}px`;
        marquee.style.height = `${Math.max(0, drawn.bottom - drawn.top)}px`;
      }

      // A table row holds a nested entry with the same id: the first (outermost) element of an id is its bounds.
      const hits: string[] = [];
      const seen = new Set<string>();
      root.querySelectorAll<HTMLElement>('[data-selection-id]').forEach((element) => {
        const id = element.dataset.selectionId!;
        if (seen.has(id)) {
          return;
        }
        seen.add(id);
        if (intersects(box, element.getBoundingClientRect())) {
          hits.push(id);
        }
      });

      const next = additive ? [...new Set([...before, ...hits])] : hits;
      const key = next.join('\n');
      if (key !== lastKey) {
        lastKey = key;
        selectionRef.current.setSelected(next);
      }
    };

    const autoScroller = scroller ? createDragAutoScroller(scroller, () => pointer, update) : null;

    // No text is selected by the gesture, wherever the pointer goes.
    const blockSelection = (selectEvent: Event) => selectEvent.preventDefault();

    const stop = () => {
      document.removeEventListener('selectstart', blockSelection, true);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onCancel);
      scroller?.removeEventListener('scroll', update);
      autoScroller?.stop();
      releaseLock?.();
      releaseLock = null;
      marquee?.remove();
      marquee = null;
      teardownRef.current = null;
    };

    function onMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      pointer.x = moveEvent.clientX;
      pointer.y = moveEvent.clientY;

      if (!dragging) {
        if (Math.hypot(pointer.x - start.x, pointer.y - start.y) < DRAG_THRESHOLD_PX) {
          return;
        }
        dragging = true;
        releaseLock = lockDragSelection();
        marquee = document.createElement('div');
        marquee.className = 'collection-marquee';
        marquee.setAttribute('aria-hidden', 'true');
        document.body.appendChild(marquee);
      }
      update();
      autoScroller?.poke();
    }

    function onUp(upEvent: PointerEvent) {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      const didDrag = dragging;
      stop();
      if (didDrag) {
        // The click the release fires must not open anything.
        swallowNextClick();
      }
    }

    function onCancel() {
      const didDrag = dragging;
      stop();
      if (didDrag) {
        swallowNextClick();
      }
    }

    function onKeyDown(keyEvent: KeyboardEvent) {
      if (keyEvent.key !== 'Escape' || !dragging) {
        return;
      }
      keyEvent.preventDefault();
      keyEvent.stopPropagation();
      selectionRef.current.setSelected(before);
      onCancel();
    }

    document.addEventListener('selectstart', blockSelection, true);
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onCancel);
    scroller?.addEventListener('scroll', update);

    teardownRef.current = stop;
  }, []);

  const ref = useCallback(
    (element: HTMLElement | null) => {
      detachRef.current?.();
      detachRef.current = null;
      rootRef.current = element;
      if (!element) {
        return;
      }
      const surface = findScrollContainer(element) ?? element;
      surface.addEventListener('pointerdown', onPointerDown);
      detachRef.current = () => surface.removeEventListener('pointerdown', onPointerDown);
    },
    [onPointerDown]
  );

  return { ref };
}
