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

const snapshot = () => document.body.querySelector<HTMLElement>('.drag-snapshot');
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
  // Press at (40, 134); row at (12, 120) → grab offset (28, 14).
  it('on: the snapshot follows the pointer with that grab offset', () => {
    const { getByTestId } = render(<Harness allow />);
    start(getByTestId);
    move(200, 300);
    expect(snapshot()!.style.transform).toBe('translate3d(172px, 286px, 0)');
    expect(snapshot()!.style.width).toBe('236px');
    expect(snapshot()!.style.height).toBe('28px');
  });

  it('on: it keeps the grab offset past the container\'s edges', () => {
    const { getByTestId } = render(<Harness allow />);
    start(getByTestId);
    move(260, 300);
    expect(snapshot()!.style.transform).toBe('translate3d(232px, 286px, 0)');
    move(700, 300);
    expect(snapshot()!.style.transform).toBe('translate3d(672px, 286px, 0)');
    move(-80, 300);
    expect(snapshot()!.style.transform).toBe('translate3d(-108px, 286px, 0)');
  });

  it('on: beyond the container vertically it still follows the pointer', () => {
    const { getByTestId } = render(<Harness allow />);
    start(getByTestId);
    move(200, 900);
    expect(snapshot()!.style.transform).toBe('translate3d(172px, 886px, 0)');
    move(200, -50);
    expect(snapshot()!.style.transform).toBe('translate3d(172px, -64px, 0)');
  });

  it('on: the offset follows where the press landed, not the row centre', () => {
    const { getByTestId } = render(<Harness allow />);
    fireEvent.pointerDown(getByTestId('row'), { button: 0, pointerId: 1, isPrimary: true, clientX: 14, clientY: 122 });
    move(500, 500);
    expect(snapshot()!.style.transform).toBe('translate3d(498px, 498px, 0)'); // 500 − 2, 500 − 2
  });

  it('on: a wide source uses its measured width in the snapshot (compact marker does not shrink it)', () => {
    ROW.width = 1500;
    try {
      const { getByTestId } = render(<Harness allow compact />);
      start(getByTestId);
      move(600, 300);
      expect(snapshot()!.style.width).toBe('1500px');
      expect(snapshot()!.style.transform).toBe('translate3d(572px, 286px, 0)');
    } finally {
      ROW.width = 236;
    }
  });

  it('pinned inside the container (a sidebar row): vertical only while the pointer is over the container, free once it leaves', () => {
    const { getByTestId } = render(<Harness allow pin />);
    start(getByTestId);
    move(200, 300);
    expect(snapshot()!.style.transform).toBe('translate3d(0, 286px, 0)');
    expect(snapshot()!.style.left).toBe('12px');
    move(255, 340);
    expect(snapshot()!.style.transform).toBe('translate3d(0, 326px, 0)');
    move(400, 340);
    expect(snapshot()!.style.left).toBe('0px');
    expect(snapshot()!.style.transform).toBe('translate3d(372px, 326px, 0)');
    move(100, 340);
    expect(snapshot()!.style.left).toBe('12px');
    expect(snapshot()!.style.transform).toBe('translate3d(0, 326px, 0)');
  });

  it('off (the default): the snapshot stays in its column however far the pointer goes', () => {
    const { getByTestId } = render(<Harness />);
    start(getByTestId);
    move(700, 300);
    expect(snapshot()!.style.transform).toBe('translate3d(0, 286px, 0)');
    expect(snapshot()!.style.left).toBe('12px');
    move(-80, 900);
    expect(snapshot()!.style.transform).toBe('translate3d(0, 886px, 0)');
  });

  it('is drawn in document.body, so no ancestor\'s overflow can clip it, and is inert', () => {
    const { getByTestId } = render(<Harness allow />);
    start(getByTestId);
    move(700, 300);
    expect(snapshot()!.closest('.drag-visuals')!.parentElement).toBe(document.body);
    expect(snapshot()).toHaveAttribute('aria-hidden', 'true');
    expect(snapshot()).toHaveAttribute('inert');
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
    expect(snapshot()).toBeNull();
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

    expect(snapshot()).toBeNull();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();
  });
});
