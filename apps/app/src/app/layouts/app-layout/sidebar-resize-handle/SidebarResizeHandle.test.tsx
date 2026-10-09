// @vitest-environment jsdom

import { cleanup, render, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

function renderHandle(currentWidth: number, isCollapsed = false) {
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
      isCollapsed={isCollapsed}
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

  describe('collapsed state', () => {
    it('is rendered when expanded', () => {
      const { handle } = renderHandle(300, false);
      expect(handle).not.toBeNull();
      expect(handle.getAttribute('data-collapsed')).toBeNull();
    });

    it('is still rendered (and flagged collapsed) when collapsed', () => {
      const { handle } = renderHandle(300, true);
      expect(handle).not.toBeNull();
      expect(handle.getAttribute('data-collapsed')).toBe('true');
    });

    it('a click while collapsed calls onToggleCollapse (expands)', () => {
      const { handle, onToggleCollapse } = renderHandle(300, true);
      click(handle);
      expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    });

    it('a click while expanded calls onToggleCollapse (collapses)', () => {
      const { handle, onToggleCollapse } = renderHandle(300, false);
      click(handle);
      expect(onToggleCollapse).toHaveBeenCalledTimes(1);
    });

    it('dragging while collapsed never resizes', () => {
      const { handle, onResize, onResizeEnd, onResizingChange } = renderHandle(300, true);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 160, clientY: 100 });
      fireEvent.pointerUp(handle, { clientX: 160, clientY: 100 });
      expect(onResize).not.toHaveBeenCalled();
      expect(onResizeEnd).not.toHaveBeenCalled();
      expect(onResizingChange).not.toHaveBeenCalled();
    });

    it('dragging while expanded still resizes', () => {
      const { handle, onResize, onResizeEnd } = renderHandle(300, false);
      fireEvent.pointerDown(handle, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerMove(handle, { clientX: 140, clientY: 100 });
      fireEvent.pointerUp(handle, { clientX: 140, clientY: 100 });
      expect(onResize).toHaveBeenCalledWith(340);
      expect(onResizeEnd).toHaveBeenCalledWith(340);
    });
  });

  describe('AppLayout.css contract', () => {
    const css = readFileSync(join(__dirname, '..', 'AppLayout.css'), 'utf8');
    const collapsedRule = css.match(
      /\.app-layout\[data-sidebar-collapsed='true'\] \.sidebar-resize-handle\s*\{([^}]*)\}/
    );

    it('keeps the handle displayed while collapsed, docked at the left edge', () => {
      expect(collapsedRule).not.toBeNull();
      expect(collapsedRule![1]).not.toMatch(/display\s*:\s*none/);
      expect(collapsedRule![1]).toMatch(/left\s*:/);
      expect(collapsedRule![1]).toMatch(/cursor\s*:/);
    });

    describe('the handle is hidden for the sidebar\'s slide instead of animating', () => {
      const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '');
      const handleCss = strip(readFileSync(join(__dirname, 'SidebarResizeHandle.css'), 'utf8'));
      const layoutCss = strip(css);

      it('has no transition of its own on left or width', () => {
        expect(handleCss).not.toMatch(/transition\s*:[^;]*(left|width)/);
        expect(handleCss.match(/\.sidebar-resize-handle\s*\{([^}]*)\}/)![1]).not.toMatch(/transition/);
      });

      it('is hidden immediately while the sidebar is transitioning (visibility, so it is also not hoverable or clickable)', () => {
        expect(layoutCss).toMatch(
          /\.app-layout\[data-sidebar-transitioning\] \.sidebar-resize-handle\s*\{\s*visibility:\s*hidden;/
        );
      });

      it('leaves the sidebar slot\'s own animation and the drag rule exactly as they were', () => {
        expect(layoutCss).toMatch(/\.app-layout__sidebar-slot\s*\{[^}]*transition:\s*flex-basis var\(--sidebar-transition-duration\)/);
        expect(layoutCss).toMatch(/\.app-layout\[data-resizing\] \.app-layout__sidebar-slot\s*\{\s*transition:\s*none;/);
      });
    });
  });
});
