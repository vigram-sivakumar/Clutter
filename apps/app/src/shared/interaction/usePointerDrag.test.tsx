// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRAG_THRESHOLD_PX, usePointerDrag, type UsePointerDragOptions } from './usePointerDrag';

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  document.body.removeAttribute('style');
});

function Harness(props: UsePointerDragOptions<string> & { onClick?: () => void }) {
  const { drag, press } = usePointerDrag<string>(props);
  return (
    <div data-testid="row" data-dragging={drag ? drag.payload : ''} onPointerDown={(e) => press(e, 'item')} onClick={props.onClick}>
      <button data-testid="inner">inner</button>
      <span data-testid="label">label</span>
    </div>
  );
}

const down = (el: Element, init = {}) =>
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, isPrimary: true, clientX: 10, clientY: 10, ...init });
const move = (x: number, y: number) =>
  act(() => {
    fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y });
  });
const up = () =>
  act(() => {
    fireEvent.pointerUp(document, { pointerId: 1 });
  });

describe('usePointerDrag', () => {
  it('begins at the threshold, not before', () => {
    const { getByTestId } = render(<Harness />);
    down(getByTestId('row'));

    move(10 + DRAG_THRESHOLD_PX - 1, 10);
    expect(getByTestId('row').dataset.dragging).toBe('');

    move(10 + DRAG_THRESHOLD_PX, 10);
    expect(getByTestId('row').dataset.dragging).toBe('item');
  });

  it('counts diagonal travel, not just one axis', () => {
    const { getByTestId } = render(<Harness />);
    down(getByTestId('row'));
    move(13, 13); // ~4.24px
    expect(getByTestId('row').dataset.dragging).toBe('item');
  });

  it('ignores presses on nested controls but not on plain children of the row', () => {
    const { getByTestId } = render(<Harness />);
    down(getByTestId('inner'));
    move(50, 50);
    expect(getByTestId('row').dataset.dragging).toBe('');
    up();

    down(getByTestId('label'));
    move(50, 50);
    expect(getByTestId('row').dataset.dragging).toBe('item');
  });

  it('reports release and cancel exactly once each, with the payload', () => {
    const onRelease = vi.fn();
    const onCancel = vi.fn();
    const { getByTestId } = render(<Harness onRelease={onRelease} onCancel={onCancel} />);

    down(getByTestId('row'));
    move(50, 50);
    up();
    expect(onRelease).toHaveBeenCalledExactlyOnceWith('item');
    expect(onCancel).not.toHaveBeenCalled();

    down(getByTestId('row'));
    move(50, 50);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(onCancel).toHaveBeenCalledExactlyOnceWith('item');
    up();
    expect(onRelease).toHaveBeenCalledTimes(1);
  });

  it('a press that never became a drag reports neither and swallows nothing', () => {
    const onClick = vi.fn();
    const onRelease = vi.fn();
    const onCancel = vi.fn();
    const { getByTestId } = render(<Harness onClick={onClick} onRelease={onRelease} onCancel={onCancel} />);
    down(getByTestId('row'));
    up();
    fireEvent.click(getByTestId('row'));

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onRelease).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('ignores another pointer’s events', () => {
    const { getByTestId } = render(<Harness />);
    down(getByTestId('row'));
    act(() => {
      fireEvent.pointerMove(document, { pointerId: 2, clientX: 99, clientY: 99 });
    });
    expect(getByTestId('row').dataset.dragging).toBe('');
  });

  it('Escape outside a drag is left alone', () => {
    const { getByTestId } = render(<Harness />);
    down(getByTestId('row'));
    const notCancelled = fireEvent.keyDown(document, { key: 'Escape' });
    expect(notCancelled).toBe(true);
  });

  it('Escape during a drag is consumed', () => {
    const { getByTestId } = render(<Harness />);
    down(getByTestId('row'));
    move(50, 50);
    expect(fireEvent.keyDown(document, { key: 'Escape' })).toBe(false);
  });
});
