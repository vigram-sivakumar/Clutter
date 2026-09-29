// @vitest-environment jsdom

import { cleanup, render, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarResizeHandle } from './SidebarResizeHandle';

const MIN_WIDTH = 280;
const MAX_WIDTH = 420;

// jsdom doesn't implement Pointer Capture; the component calls these
// defensively (see the "pointer capture doesn't affect cursor" comment in
// SidebarResizeHandle.tsx), so stub them as no-ops for the drag to run.
beforeEach(() => {
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
});

afterEach(() => {
  cleanup();
});

function renderHandle(currentWidth: number) {
  const onResize = vi.fn();
  const onResizeEnd = vi.fn();
  const onResizingChange = vi.fn();
  const onToggleCollapse = vi.fn();
  const { container } = render(
    <SidebarResizeHandle
      currentWidth={currentWidth}
      minWidth={MIN_WIDTH}
      maxWidth={MAX_WIDTH}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
      onResizingChange={onResizingChange}
      onToggleCollapse={onToggleCollapse}
    />
  );
  const handle = container.querySelector('.sidebar-resize-handle')!;
  return { handle, onResize, onResizeEnd, onResizingChange, onToggleCollapse };
}

/** A plain click: pointerdown + pointerup at the same spot, no movement. */
function click(handle: Element, x = 100, y = 100) {
  fireEvent.pointerDown(handle, { clientX: x, clientY: y, button: 0 });
  fireEvent.pointerUp(handle, { clientX: x, clientY: y });
}

describe('SidebarResizeHandle', () => {
  describe('resize drag', () => {
    it('increases width live while dragging right', () => {
      const { handle, onResize } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 150, clientY: 100 });
      expect(onResize).toHaveBeenCalledWith(350);
    });

    it('decreases width live while dragging left', () => {
      const { handle, onResize } = renderHandle(350);
      fireEvent.pointerDown(handle, { clientX: 200, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 170, clientY: 100 });
      expect(onResize).toHaveBeenCalledWith(320);
    });

    it('clamps to maxWidth regardless of where the drag started', () => {
      const { handle, onResize } = renderHandle(400);
      fireEvent.pointerDown(handle, { clientX: 0, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 1000, clientY: 100 });
      expect(onResize).toHaveBeenCalledWith(MAX_WIDTH);
    });

    it('clamps to minWidth regardless of where the drag started (fixed global floor, not the drag-start width)', () => {
      const { handle, onResize } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 500, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 0, clientY: 100 });
      expect(onResize).toHaveBeenCalledWith(MIN_WIDTH);
    });

    it('calls onResizeEnd once with the final width on pointer up, and stops responding to further moves', () => {
      const { handle, onResize, onResizeEnd } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 140, clientY: 100 });
      fireEvent.pointerUp(handle, { clientX: 140, clientY: 100 });
      expect(onResizeEnd).toHaveBeenCalledTimes(1);
      expect(onResizeEnd).toHaveBeenCalledWith(340);

      onResize.mockClear();
      fireEvent.pointerMove(handle, { clientX: 400, clientY: 100 });
      expect(onResize).not.toHaveBeenCalled();
    });

    it('does not start a drag on a non-primary button', () => {
      const { handle, onResize } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 2 });
      fireEvent.pointerMove(handle, { clientX: 150, clientY: 100 });
      expect(onResize).not.toHaveBeenCalled();
    });

    it('sets a col-resize cursor and disables text selection once movement starts, restoring both on release', () => {
      const { handle } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      expect(document.body.style.cursor).toBe('');

      fireEvent.pointerMove(handle, { clientX: 140, clientY: 100 });
      expect(document.body.style.cursor).toBe('col-resize');
      expect(document.body.style.userSelect).toBe('none');

      fireEvent.pointerUp(handle, { clientX: 140, clientY: 100 });
      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
    });

    it('reports isResizing true only once movement exceeds the click threshold, false again on release', () => {
      const { handle, onResizingChange } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      expect(onResizingChange).not.toHaveBeenCalled();

      fireEvent.pointerMove(handle, { clientX: 140, clientY: 100 });
      expect(onResizingChange).toHaveBeenLastCalledWith(true);
      expect(onResizingChange).toHaveBeenCalledTimes(1);

      fireEvent.pointerUp(handle, { clientX: 140, clientY: 100 });
      expect(onResizingChange).toHaveBeenLastCalledWith(false);
      expect(onResizingChange).toHaveBeenCalledTimes(2);
    });

    it('reports isResizing false on pointercancel too, once a drag was underway', () => {
      const { handle, onResizingChange, onResizeEnd } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 140, clientY: 100 });
      fireEvent.pointerCancel(handle, { clientX: 140, clientY: 100 });
      expect(onResizingChange).toHaveBeenLastCalledWith(false);
      expect(onResizeEnd).toHaveBeenCalledWith(340);
    });

    it('does not treat small sub-threshold movement as a drag (no onResize, no onResizingChange)', () => {
      const { handle, onResize, onResizingChange } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 101, clientY: 100 }); // 1px, below threshold
      expect(onResize).not.toHaveBeenCalled();
      expect(onResizingChange).not.toHaveBeenCalled();
    });

    it('a genuine drag never triggers onToggleCollapse on release', () => {
      const { handle, onToggleCollapse } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 140, clientY: 100 });
      fireEvent.pointerUp(handle, { clientX: 140, clientY: 100 });
      expect(onToggleCollapse).not.toHaveBeenCalled();
    });
  });

  describe('click (no drag): toggles collapse/expand immediately', () => {
    it('calls onToggleCollapse immediately on a plain click, with no delay', () => {
      const { handle, onToggleCollapse } = renderHandle(300);
      click(handle);
      expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    });

    it('does not call onResize/onResizeEnd for a plain click', () => {
      const { handle, onResize, onResizeEnd } = renderHandle(300);
      click(handle);
      expect(onResize).not.toHaveBeenCalled();
      expect(onResizeEnd).not.toHaveBeenCalled();
    });

    it('toggles collapse again on a second, independent click', () => {
      const { handle, onToggleCollapse } = renderHandle(300);
      click(handle);
      click(handle);
      expect(onToggleCollapse).toHaveBeenCalledTimes(2);
    });

    it('a cancelled (not completed) interaction never triggers onToggleCollapse', () => {
      const { handle, onToggleCollapse } = renderHandle(300);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerCancel(handle, { clientX: 100, clientY: 100 });
      expect(onToggleCollapse).not.toHaveBeenCalled();
    });
  });
});
