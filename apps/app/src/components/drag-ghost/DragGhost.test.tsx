// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePointerDrag } from '@shared/interaction';
import { DragGhost } from './DragGhost';

// A row in a 260px-wide scrolling container (x 0–260, y 100–500): the sidebar's shape.
const CONTAINER = { left: 0, right: 260, top: 100, bottom: 500 };
const ROW = { left: 12, top: 120, width: 236, height: 28 } as { left: number; top: number; width: number; height: number };

const rectOf = (r: { left: number; top: number; right?: number; bottom?: number; width?: number; height?: number }) =>
  ({ left: r.left, top: r.top, right: r.right ?? r.left + (r.width ?? 0), bottom: r.bottom ?? r.top + (r.height ?? 0), width: r.width ?? (r.right ?? 0) - r.left, height: r.height ?? (r.bottom ?? 0) - r.top, x: r.left, y: r.top, toJSON: () => ({}) }) as DOMRect;

function Harness({ allow, compact, pin, onRelease, onCancel }: { allow?: boolean; compact?: boolean; pin?: boolean; onRelease?: () => void; onCancel?: () => void }) {
  const { drag, press } = usePointerDrag<string>({ allowDragOutsideContainer: allow, onRelease, onCancel });
  return (
    <div data-testid="container" style={{ overflowY: 'auto' }}>
      <div data-testid="row" data-drag-ghost-size={compact ? 'compact' : undefined} data-drag-ghost-follow={pin ? 'outside-container' : undefined} onPointerDown={(event) => press(event, 'item')}>
        row
      </div>
      {drag && <DragGhost session={drag.session} />}
    </div>
  );
}

const ghost = () => document.body.querySelector<HTMLElement>('.drag-ghost');
const start = (getByTestId: (id: string) => HTMLElement) =>
  fireEvent.pointerDown(getByTestId('row'), { button: 0, pointerId: 1, isPrimary: true, clientX: 40, clientY: 134 });
const move = (x: number, y: number) => act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y }));

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.testid === 'container') return rectOf(CONTAINER);
    if (this.dataset.testid === 'row') return rectOf(ROW);
    return rectOf({ left: 0, top: 0, width: 0, height: 0 });
  });
});
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  vi.restoreAllMocks();
});

describe('allowDragOutsideContainer', () => {
  // The ghost is the row's own 236×28 (a compact one is 256 wide): its centre is (118, 14).
  it('on: the ghost is centred under the cursor on both axes', () => {
    const { getByTestId } = render(<Harness allow />);
    start(getByTestId);
    move(200, 300);
    expect(ghost()!.style.transform).toBe('translate3d(82px, 286px, 0)'); // 200 − 118, 300 − 14
    expect(ghost()!.style.width).toBe('236px'); // the row's own width
    expect(ghost()!.style.height).toBe('28px'); // the source's height
  });

  it('on: it stays centred past the container\'s right edge — to wherever a target outside it is', () => {
    const { getByTestId } = render(<Harness allow />);
    start(getByTestId);
    move(260, 300); // at the container's edge
    expect(ghost()!.style.transform).toBe('translate3d(142px, 286px, 0)');
    move(700, 300); // far beyond it
    expect(ghost()!.style.transform).toBe('translate3d(582px, 286px, 0)'); // 700 − 118
  });

  it('on: past the container\'s left edge likewise (a drag from the page into the sidebar)', () => {
    const { getByTestId } = render(<Harness allow />);
    start(getByTestId);
    move(-80, 300);
    expect(ghost()!.style.transform).toBe('translate3d(-198px, 286px, 0)');
  });

  it('on: beyond the container vertically it is still centred on the cursor', () => {
    const { getByTestId } = render(<Harness allow />);
    start(getByTestId);
    move(200, 900); // well below the container's bottom (500)
    expect(ghost()!.style.transform).toBe('translate3d(82px, 886px, 0)');
    move(200, -50); // and above its top
    expect(ghost()!.style.transform).toBe('translate3d(82px, -64px, 0)');
  });

  it('on: the offset does not depend on where the source sits or how wide its container is', () => {
    const { getByTestId } = render(<Harness allow />);
    // Pressed at the row's far top-left, rather than its middle.
    fireEvent.pointerDown(getByTestId('row'), { button: 0, pointerId: 1, isPrimary: true, clientX: 14, clientY: 122 });
    move(500, 500);
    expect(ghost()!.style.transform).toBe('translate3d(382px, 486px, 0)'); // 500 − 118, 500 − 14 — not relative to the grab point
  });

  it('on: a very wide source (a full-width table row) marked compact gives the 256px ghost, centred', () => {
    ROW.width = 1500;
    try {
      const { getByTestId } = render(<Harness allow compact />);
      start(getByTestId);
      move(600, 300);
      expect(ghost()!.style.width).toBe('256px');
      expect(ghost()!.style.transform).toBe('translate3d(472px, 286px, 0)'); // 600 − 128
    } finally {
      ROW.width = 236;
    }
  });

  it('pinned inside the container (a sidebar row): vertical only while the pointer is over the container, free once it leaves', () => {
    const { getByTestId } = render(<Harness allow pin />);
    start(getByTestId); // grabbed 14px down the row
    move(200, 300); // inside the container (x 0–260)
    expect(ghost()!.style.transform).toBe('translate3d(0, 286px, 0)'); // 300 − 14, column kept (left: the row's 12)
    expect(ghost()!.style.left).toBe('12px');
    move(255, 340);
    expect(ghost()!.style.transform).toBe('translate3d(0, 326px, 0)');
    move(400, 340); // out over the page: centred on the cursor
    expect(ghost()!.style.left).toBe('0px');
    expect(ghost()!.style.transform).toBe('translate3d(282px, 326px, 0)'); // 400 − 118, 340 − 14
    move(100, 340); // back into the sidebar: pinned again
    expect(ghost()!.style.left).toBe('12px');
    expect(ghost()!.style.transform).toBe('translate3d(0, 326px, 0)');
  });

  it('off (the default): the ghost stays in its column however far the pointer goes', () => {
    const { getByTestId } = render(<Harness />);
    start(getByTestId);
    move(700, 300);
    expect(ghost()!.style.transform).toBe('translate3d(0, 286px, 0)'); // pinned to the source's column, grip kept
    expect(ghost()!.style.left).toBe('12px');
    move(-80, 900); // vertical is free either way
    expect(ghost()!.style.transform).toBe('translate3d(0, 886px, 0)');
  });

  it('is drawn in document.body, so no ancestor\'s overflow can clip it, and is inert', () => {
    const { getByTestId } = render(<Harness allow />);
    start(getByTestId);
    move(700, 300);
    expect(ghost()!.closest('.drag-visuals')!.parentElement).toBe(document.body); // the shared overlay, in the body
    expect(ghost()).toHaveAttribute('aria-hidden', 'true');
    expect(ghost()).toHaveAttribute('inert');
  });

  it('release outside the container still ends the drag once, and the click after it is swallowed', () => {
    const onRelease = vi.fn();
    const onClick = vi.fn();
    const { getByTestId } = render(<Harness allow onRelease={onRelease} />);
    getByTestId('row').addEventListener('click', onClick);
    start(getByTestId);
    move(700, 300);
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 700, clientY: 300 }));
    fireEvent.click(getByTestId('row'));

    expect(onRelease).toHaveBeenCalledExactlyOnceWith('item');
    expect(ghost()).toBeNull();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('Escape outside the container cancels with no release', () => {
    const onRelease = vi.fn();
    const onCancel = vi.fn();
    const { getByTestId } = render(<Harness allow onRelease={onRelease} onCancel={onCancel} />);
    start(getByTestId);
    move(700, 300);
    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
    act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 700, clientY: 300 }));

    expect(ghost()).toBeNull();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();
  });
});
