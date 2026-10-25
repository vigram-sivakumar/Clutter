import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { NESTED_INTERACTIVE_SELECTOR } from './buildActivationProps';
import './pointerDrag.css';

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
  /** The option this drag was started with: its ghost may travel past the source's container (see `UsePointerDragOptions`). */
  readonly allowDragOutsideContainer: boolean;
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
  /**
   * A selector for nested controls a press may still START a drag from (a click on them keeps working: only
   * movement past the threshold makes it a drag). For a control that covers a large part of the row — the
   * folder caret, which takes over the folder icon on hover.
   */
  readonly allowFrom?: string;
}

export interface UsePointerDragOptions<T> {
  /**
   * Lets the drag travel beyond the container the source sits in, with its ghost centred under the cursor
   * wherever it goes. Pointer tracking was always document-wide and the ghost is drawn in `document.body`
   * (no ancestor's `overflow` clips it); what held a drag inside its source's column was the ghost's
   * alignment to that column. Off (the default), the ghost keeps that column alignment and the grip the
   * user took on the row; on, it follows the pointer freely on both axes, centred on it.
   */
  allowDragOutsideContainer?: boolean;
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
    (event: ReactPointerEvent<HTMLElement>, payload: T, { disabled = false, allowFrom }: PressOptions = {}) => {
      if (disabled || event.button !== 0 || event.isPrimary === false) {
        return;
      }

      const source = event.currentTarget;
      const nested = (event.target as HTMLElement).closest(NESTED_INTERACTIVE_SELECTOR);
      if (nested && nested !== source && !(allowFrom && nested.matches(allowFrom))) {
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
      // What was selected before this press, so the drag only ever removes a selection the gesture itself made.
      const selectionBeforePress = snapshotSelection();

      const session: PointerDragSession = {
        source,
        snapshot: source.cloneNode(true) as HTMLElement,
        grabOffsetY,
        allowDragOutsideContainer: optionsRef.current.allowDragOutsideContainer === true,
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

      // Native text selection must not start or extend for the drag: not in the pressed row (the press itself
      // would otherwise anchor a selection there) and, once the drag is on, not anywhere it travels.
      const blockSelection = (selectEvent: Event) => {
        if (phase !== 'pending' || source.contains(selectEvent.target as Node)) {
          selectEvent.preventDefault();
        }
      };

      const stopTracking = () => {
        document.removeEventListener('selectstart', blockSelection, true);
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
          // Locks selection for the whole drag, and drops one the press may already have begun so nothing stays
          // highlighted behind the ghost.
          restoreBody = acquireDragSelectionLock(selectionBeforePress);
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

      document.addEventListener('selectstart', blockSelection, true);
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

interface SelectionSnapshot {
  readonly anchorNode: Node | null;
  readonly anchorOffset: number;
  readonly focusNode: Node | null;
  readonly focusOffset: number;
}

/** The current non-collapsed selection, or null when there is none (a bare caret is not a selection to protect). */
function snapshotSelection(): SelectionSnapshot | null {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  return { anchorNode, anchorOffset, focusNode, focusOffset };
}

/**
 * The drag-selection guard. Every `usePointerDrag` session takes one for the length of its drag, so
 * suppression lives here, once, for every drag source and destination. It is reference-counted: the guard
 * is applied by the first live drag and lifted by the last, so one drag ending never re-enables selection
 * under another that is still going.
 *
 * While held it:
 * - sets `user-select: none` on the body (both spellings) and a grabbing cursor;
 * - marks `<html data-pointer-drag>`, whose stylesheet (`pointerDrag.css`) extends the same rule to EVERY
 *   element — an editable field (a contentEditable title, an input, CodeMirror) stays selectable under an
 *   inherited `user-select: none`, so the body style alone cannot keep a drag from selecting the page title;
 * - drops any selection that appears while it is held (`selectionchange`): the browser extends a selection
 *   begun by the press without a new `selectstart`, so vetoing `selectstart` alone is not enough.
 *
 * A selection that already existed before the press is left alone. Returns an idempotent release.
 */
let guardHolders = 0;
let guardBaseline: SelectionSnapshot | null = null;
let undoGuard: (() => void) | null = null;

function dropSelectionMadeByTheDrag(): void {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return;
  }
  const kept = guardBaseline;
  const isPreexisting =
    kept !== null &&
    selection.anchorNode === kept.anchorNode &&
    selection.anchorOffset === kept.anchorOffset &&
    selection.focusNode === kept.focusNode &&
    selection.focusOffset === kept.focusOffset;
  if (!isPreexisting) {
    selection.removeAllRanges();
  }
}

function applyDragSelectionGuard(): () => void {
  const { style } = document.body;
  const root = document.documentElement;
  const previous = {
    userSelect: style.userSelect,
    webkitUserSelect: style.getPropertyValue('-webkit-user-select'),
    cursor: style.cursor,
  };
  style.userSelect = 'none';
  // WebKit (the macOS webview) only honours the prefixed property on older versions.
  style.setProperty('-webkit-user-select', 'none');
  style.cursor = 'grabbing';
  root.setAttribute('data-pointer-drag', '');
  document.addEventListener('selectionchange', dropSelectionMadeByTheDrag);

  return () => {
    document.removeEventListener('selectionchange', dropSelectionMadeByTheDrag);
    root.removeAttribute('data-pointer-drag');
    style.userSelect = previous.userSelect;
    if (previous.webkitUserSelect) {
      style.setProperty('-webkit-user-select', previous.webkitUserSelect);
    } else {
      style.removeProperty('-webkit-user-select');
    }
    style.cursor = previous.cursor;
  };
}

/**
 * The same guard for a gesture that is not an item drag (a marquee selection): takes it for as long as the gesture
 * lasts, leaving a text selection that existed before the press alone, and returns the release.
 */
export function lockDragSelection(): () => void {
  return acquireDragSelectionLock(snapshotSelection());
}

function acquireDragSelectionLock(selectionBeforePress: SelectionSnapshot | null): () => void {
  if (guardHolders === 0) {
    guardBaseline = selectionBeforePress;
    undoGuard = applyDragSelectionGuard();
  }
  guardHolders += 1;
  dropSelectionMadeByTheDrag();

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    guardHolders -= 1;
    if (guardHolders === 0) {
      undoGuard?.();
      undoGuard = null;
      guardBaseline = null;
    }
  };
}

/**
 * The browser fires a `click` right after the release that ended a drag. Swallow that one, in the capture
 * phase before anything reacts to it, and give up on the next tick in case no click comes.
 */
export function swallowNextClick(): void {
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
