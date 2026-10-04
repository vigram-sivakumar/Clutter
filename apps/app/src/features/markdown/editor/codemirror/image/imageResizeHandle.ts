import type { EditorView } from '@codemirror/view';

import { computeImagePresentationUpdate, getImagePresentation } from '../mediaPresentation/mediaPresentationUpdate';
import {
  cancelPendingDimensionTransitions,
  clampMediaWidth,
  measureBox,
} from '../mediaPresentation/mediaLayoutStyle';
import { presentationOnlyEdit } from './imageUiState';

/**
 * Custom pointer-driven resize, replacing the browser's native CSS
 * `resize: both`/`resize: horizontal` (previously on `.cm-image-container
 * --fill`/`--fit`, MarkdownEditor.css) — the native mechanism exposes no
 * "resize finished" event, only continuous `ResizeObserver` firings
 * during the drag, which is why an earlier interactive-resize
 * implementation (removed, see `4711c187`) fought `ResizeObserver`,
 * flickered, and produced overlapping resize sessions. This
 * implementation deliberately never uses `ResizeObserver`,
 * `requestAnimationFrame`, timers, or CSS transitions to drive the drag —
 * `pointermove` mutates the container's own inline `width`/`height`
 * directly (a plain, synchronous DOM write, no CM6 involvement at all),
 * and exactly one CM6 transaction commits the result on `pointerup`,
 * reusing the existing presentation-write path
 * (`mediaPresentationUpdate.ts`'s `computeImagePresentationUpdate`) — the
 * same one `MarkdownEditor.tsx`'s `handleSelectImageDisplayMode` already
 * uses for a Fill/Fit mode change.
 *
 * **Both bottom corners exist in both modes, with the same corner-shaped
 * cursor in both (2026-09 UX correction)** — `ImageWidget.ts` always
 * attaches one handle per `ImageResizeSide` ('left'/'right'), for both
 * Fill and Fit alike, and the cursor is always `nwse-resize`/
 * `nesw-resize` by corner — **never `ew-resize`**, even under Fit, where
 * the drag only ever changes width: the handle is visually a corner in
 * both modes, so its cursor stays a corner cursor regardless of which
 * fields the drag actually persists. What a drag actually *changes*
 * (width-only vs. width+height) is decided here, live, at `pointerdown`
 * time — by reading the container's own current `--fill`/`--fit` class,
 * the same authoritative signal
 * `ImageWidget.ts`'s `updateDOM` already keeps in sync — rather than a
 * fixed value baked in when the handle was attached.
 *
 * **No `setImageUiState` effect is dispatched here, unlike
 * `handleSelectImageDisplayMode`.** That call site also *changes* a
 * `ui.displayMode` field, which requires writing a new `imageUiState`
 * RangeSet entry with correctly-remapped post-change coordinates (its own
 * doc comment covers a real crash that shape of bug once caused). A
 * resize changes no `ui` field at all — `imageUiStateField.update`
 * already remaps every existing entry's `[from, to)` span across any
 * transaction's `changes` via `RangeSet.map` (an edit strictly inside an
 * entry's tracked span grows/shrinks it automatically, same file's own
 * doc comment) — so an ordinary `changes`-only transaction already keeps
 * an existing entry (if any) correctly positioned with no explicit effect
 * needed.
 *
 * `to` is read fresh (`getTo()`) at drag-start and again at commit time
 * rather than captured once — the node's own `to` can have shifted since
 * this handle was attached (an alignment/mode change via the options
 * menu, an unrelated edit above it) exactly the same reason
 * `ImageWidget.ts`'s own `makeEditButton`/size button read a live
 * `container.dataset.nodeTo` instead of a stale closed-over field.
 */
export type ImageResizeSide = 'left' | 'right';

const MIN_HEIGHT_PX = 40;

/**
 * Wires one bottom-corner resize handle element to drag-resize
 * `container`. `side` only affects the pointer math (dragging the left
 * corner further left grows the width, mirroring the right corner's
 * further-right convention — see the class doc comment above for why
 * this is deliberately just a delta-sign flip, not anchor-preserving
 * repositioning) — the current Fill/Fit mode (read live, not passed in)
 * decides whether height participates at all: Fit never writes `height`,
 * leaving whatever the Markdown already has there (dormant, per
 * `mediaPresentationModel.ts`'s own `ImagePresentation.height` doc
 * comment) completely untouched.
 */
export function attachImageResizeHandle(
  handle: HTMLElement,
  container: HTMLElement,
  side: ImageResizeSide,
  view: EditorView,
  getTo: () => number
): void {
  handle.contentEditable = 'false';

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    // The drag now owns this container's size: disarm any mode-switch animation cleanup that is
    // still waiting for an event that may never come, or it would fire at the end of this drag and
    // strip the height just set.
    cancelPendingDimensionTransitions(container);

    const resizesHeight = container.classList.contains('cm-image-container--fill');
    // Always a corner-direction cursor, in both Fill and Fit — never
    // `ew-resize`/`cm-image-resizing-ew`, even though Fit only ever
    // changes width. The handle is visually a corner in both modes
    // (MarkdownEditor.css), so its cursor stays a corner cursor
    // regardless of which fields the drag actually persists.
    const cursorClass = side === 'right' ? 'cm-image-resizing-nwse' : 'cm-image-resizing-nesw';

    const startBox = container.getBoundingClientRect();
    const startWidth = startBox.width;
    const startHeight = startBox.height;
    const startX = event.clientX;
    const startY = event.clientY;

    // Optional chaining, not a bare call: pointer capture is standard in
    // every real target browser, but isn't implemented in jsdom (this
    // project's own test environment), and this drag still works
    // perfectly correctly without it — `pointermove`/`pointerup`
    // listeners are on `handle` itself, which is fine for this handle's
    // own small hit area; capture only additionally protects against the
    // pointer briefly leaving that hit area mid-drag.
    handle.setPointerCapture?.(event.pointerId);
    document.body.classList.add(cursorClass);

    const onMove = (moveEvent: PointerEvent) => {
      const rawDeltaX = moveEvent.clientX - startX;
      // Left corner: dragging further left (negative delta) grows the
      // width, mirroring the right corner's further-right convention —
      // the "different pointer math," never a different visual handle.
      const deltaX = side === 'left' ? -rawDeltaX : rawDeltaX;
      const width = clampMediaWidth(view, startWidth + deltaX);
      container.style.width = `${width}px`;

      if (resizesHeight) {
        const height = Math.max(MIN_HEIGHT_PX, startHeight + (moveEvent.clientY - startY));
        container.style.height = `${height}px`;
      }
    };

    const onUp = (upEvent: PointerEvent) => {
      handle.releasePointerCapture?.(upEvent.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.classList.remove('cm-image-resizing-nwse', 'cm-image-resizing-nesw');

      const finalBox = measureBox(container);
      const finalWidth = Math.max(1, Math.round(finalBox.width));
      const finalHeight = Math.max(1, Math.round(finalBox.height));

      const to = getTo();
      const current = getImagePresentation(view.state, to);
      const next = resizesHeight
        ? { ...current, width: finalWidth, height: finalHeight }
        : { ...current, width: finalWidth };

      const changes = computeImagePresentationUpdate(view.state, to, next);
      if (changes.from === changes.to && changes.insert === '') {
        // The Image/Embed node this handle was attached to no longer
        // resolves at `to` (e.g. deleted mid-drag) — nothing to persist.
        return;
      }

      view.dispatch({
        effects: [presentationOnlyEdit.of(null)],
        changes,
      });
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  });
}
