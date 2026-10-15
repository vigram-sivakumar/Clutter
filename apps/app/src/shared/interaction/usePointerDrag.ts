import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { NESTED_INTERACTIVE_SELECTOR } from './buildActivationProps';

/** Pointer travel, in CSS pixels, before a press becomes a drag. Matches the table drag (`tableHandleOverlay.ts`). */
export const DRAG_THRESHOLD_PX = 4;

/**
 * The live geometry of one drag, kept OUT of React state: the pointer moves far too often to re-render
 * a recursive tree for. Subscribers (the ghost) read `pointer` and are called on every move.
 */
export interface PointerDragSession {
  /** The element the press started on (e.g. a sidebar row). Stays in place for the whole drag. */
  readonly source: HTMLElement;
  /** A deep clone of `source` taken when the drag starts — before any "being dragged" styling lands on it. */
  readonly snapshot: HTMLElement;
  /** Where inside `source` the press landed, vertically, so the ghost keeps the same grip on the row. */
  readonly grabOffsetY: number;
  /** The pointer's latest viewport position. */
  readonly pointer: { x: number; y: number };
  subscribe(listener: () => void): () => void;
}

export interface ActiveDrag<T> {
  readonly payload: T;
  readonly session: PointerDragSession;
}

export interface PressOptions {
  /** The press is ignored entirely (e.g. the row is being renamed). */
  readonly disabled?: boolean;
}

export interface UsePointerDragOptions<T> {
  /** The drag ended by pointer release. Phase 1 has no drop targets, so this is only an end signal. */
  onRelease?(payload: T): void;
  /** The drag ended without a release: Escape, pointer cancel, window blur or unmount. */
  onCancel?(payload: T): void;
}

/**
 * Drag *presentation* mechanics only: threshold, tracking, cancellation and click suppression. It knows
 * nothing about drop targets or what is being dragged — `payload` is opaque. A future drop-target layer
 * reads `session.pointer`/`subscribe` and hooks `onRelease`; nothing here changes.
 *
 * - A press starts tracking; the drag begins once the pointer travels `DRAG_THRESHOLD_PX`. A plain
 *   click never becomes one.
 * - A press on a nested control (button, input, link…) is that control's, same rule as
 *   `buildActivationProps`.
 * - Tracking uses document-level pointer listeners (the table drag's convention), so it survives the
 *   pointer leaving the row, and is torn down on release, cancel, window blur or unmount.
 * - Escape ends the visible drag immediately; the press itself is finished on release.
 * - After any real drag, the click the browser fires on release is swallowed so the row is not
 *   selected, toggled or navigated.
 */
export function usePointerDrag<T>(options: UsePointerDragOptions<T> = {}) {
  const [drag, setDrag] = useState<ActiveDrag<T> | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Unmounting mid-press or mid-drag must leave no listeners, body styles or ghost behind.
  useEffect(() => () => teardownRef.current?.(), []);

  const press = useCallback(
    (event: ReactPointerEvent<HTMLElement>, payload: T, { disabled = false }: PressOptions = {}) => {
      if (disabled || event.button !== 0 || event.isPrimary === false) {
        return;
      }

      const source = event.currentTarget;
      const nested = (event.target as HTMLElement).closest(NESTED_INTERACTIVE_SELECTOR);
      if (nested && nested !== source) {
        return;
      }

      teardownRef.current?.();

      const pointerId = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const grabOffsetY = startY - source.getBoundingClientRect().top;
      const listeners = new Set<() => void>();
      const pointer = { x: startX, y: startY };

      let phase: 'pending' | 'dragging' | 'cancelled' = 'pending';
      let didDrag = false;
      let restoreBody: (() => void) | null = null;

      const session: PointerDragSession = {
        source,
        snapshot: source.cloneNode(true) as HTMLElement,
        grabOffsetY,
        pointer,
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
      };

      const endVisibleDrag = () => {
        restoreBody?.();
        restoreBody = null;
        setDrag(null);
      };

      const stopTracking = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onPointerCancel);
        document.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('blur', onBlur);
        listeners.clear();
        teardownRef.current = null;
      };

      function onMove(moveEvent: PointerEvent) {
        if (moveEvent.pointerId !== pointerId || phase === 'cancelled') {
          return;
        }
        pointer.x = moveEvent.clientX;
        pointer.y = moveEvent.clientY;

        if (phase === 'pending') {
          if (Math.hypot(pointer.x - startX, pointer.y - startY) < DRAG_THRESHOLD_PX) {
            return;
          }
          phase = 'dragging';
          didDrag = true;
          restoreBody = lockBodyForDrag();
          setDrag({ payload, session });
        }

        listeners.forEach((listener) => listener());
      }

      function onUp(upEvent: PointerEvent) {
        if (upEvent.pointerId !== pointerId) {
          return;
        }
        const wasDragging = phase === 'dragging';
        stopTracking();
        if (wasDragging) {
          endVisibleDrag();
        }
        if (didDrag) {
          swallowNextClick();
        }
        if (wasDragging) {
          optionsRef.current.onRelease?.(payload);
        }
      }

      function onPointerCancel(cancelEvent: PointerEvent) {
        if (cancelEvent.pointerId === pointerId) {
          abort();
        }
      }

      function onKeyDown(keyEvent: KeyboardEvent) {
        if (keyEvent.key !== 'Escape' || phase !== 'dragging') {
          return;
        }
        // Consumed: Escape must cancel the drag, not also close a menu or leave a page.
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        phase = 'cancelled';
        endVisibleDrag();
        optionsRef.current.onCancel?.(payload);
        // Tracking stays until release, so that release's click is swallowed.
      }

      function onBlur() {
        abort();
      }

      function abort() {
        const wasDragging = phase === 'dragging';
        stopTracking();
        if (wasDragging) {
          endVisibleDrag();
          optionsRef.current.onCancel?.(payload);
        }
        if (didDrag) {
          swallowNextClick();
        }
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onPointerCancel);
      document.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('blur', onBlur);

      teardownRef.current = () => {
        const wasDragging = phase === 'dragging';
        stopTracking();
        restoreBody?.();
        restoreBody = null;
        if (wasDragging) {
          optionsRef.current.onCancel?.(payload);
        }
      };
    },
    []
  );

  return { drag, press };
}

/** No text selection and a grabbing cursor for the length of a drag. Returns the undo. */
function lockBodyForDrag(): () => void {
  const { style } = document.body;
  const previous = { userSelect: style.userSelect, cursor: style.cursor };
  style.userSelect = 'none';
  style.cursor = 'grabbing';
  return () => {
    style.userSelect = previous.userSelect;
    style.cursor = previous.cursor;
  };
}

/**
 * The browser fires a `click` right after the release that ended a drag. Swallow that one, in the capture
 * phase before anything reacts to it, and give up on the next tick in case no click comes.
 */
function swallowNextClick(): void {
  const handler = (event: Event) => {
    event.stopPropagation();
    event.preventDefault();
    remove();
  };
  const remove = () => {
    document.removeEventListener('click', handler, true);
    clearTimeout(timer);
  };
  document.addEventListener('click', handler, true);
  const timer = setTimeout(remove, 0);
}
