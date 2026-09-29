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
  const { container } = render(
    <SidebarResizeHandle
      currentWidth={currentWidth}
      minWidth={MIN_WIDTH}
      maxWidth={MAX_WIDTH}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
    />
  );
  const handle = container.querySelector('.sidebar-resize-handle')!;
  return { handle, onResize, onResizeEnd };
}

describe('SidebarResizeHandle', () => {
  it('increases width live while dragging right', () => {
    const { handle, onResize } = renderHandle(300);
    fireEvent.pointerDown(handle, { clientX: 100, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 150 });
    expect(onResize).toHaveBeenCalledWith(350);
  });

  it('decreases width live while dragging left', () => {
    const { handle, onResize } = renderHandle(350);
    fireEvent.pointerDown(handle, { clientX: 200, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 170 });
    expect(onResize).toHaveBeenCalledWith(320);
  });

  it('clamps to maxWidth regardless of where the drag started', () => {
    const { handle, onResize } = renderHandle(400);
    fireEvent.pointerDown(handle, { clientX: 0, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 1000 });
    expect(onResize).toHaveBeenCalledWith(MAX_WIDTH);
  });

  it('clamps to minWidth regardless of where the drag started (fixed global floor, not the drag-start width)', () => {
    const { handle, onResize } = renderHandle(300);
    fireEvent.pointerDown(handle, { clientX: 500, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 0 });
    expect(onResize).toHaveBeenCalledWith(MIN_WIDTH);
  });

  it('calls onResizeEnd once with the final width on pointer up, and stops responding to further moves', () => {
    const { handle, onResize, onResizeEnd } = renderHandle(300);
    fireEvent.pointerDown(handle, { clientX: 100, button: 0 });
    fireEvent.pointerMove(handle, { clientX: 140 });
    fireEvent.pointerUp(handle, { clientX: 140 });
    expect(onResizeEnd).toHaveBeenCalledTimes(1);
    expect(onResizeEnd).toHaveBeenCalledWith(340);

    onResize.mockClear();
    fireEvent.pointerMove(handle, { clientX: 400 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('does not start a drag on a non-primary button', () => {
    const { handle, onResize } = renderHandle(300);
    fireEvent.pointerDown(handle, { clientX: 100, button: 2 });
    fireEvent.pointerMove(handle, { clientX: 150 });
    expect(onResize).not.toHaveBeenCalled();
  });

  it('sets a col-resize cursor and disables text selection during the drag, restoring both on release', () => {
    const { handle } = renderHandle(300);
    fireEvent.pointerDown(handle, { clientX: 100, button: 0 });
    expect(document.body.style.cursor).toBe('col-resize');
    expect(document.body.style.userSelect).toBe('none');

    fireEvent.pointerUp(handle, { clientX: 100 });
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });
});
