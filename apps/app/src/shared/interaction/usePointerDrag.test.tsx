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

describe('usePointerDrag — text selection', () => {
  /** Dispatches the browser's `selectstart` at `target`; true when something cancelled it. */
  const selectStart = (target: Element | Document) => {
    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };

  function Page(props: UsePointerDragOptions<string>) {
    return (
      <div>
        <Harness {...props} />
        <h1 data-testid="title">Page title</h1>
      </div>
    );
  }

  const selectText = (element: Element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  };

  it('is not touched when no drag is active: selecting text anywhere works', () => {
    const { getByTestId } = render(<Page />);
    expect(selectStart(getByTestId('title'))).toBe(false);
    expect(selectStart(getByTestId('row'))).toBe(false);
    expect(document.body.style.userSelect).toBe('');
  });

  it('while a press is still under the threshold, only selection starting in the pressed row is blocked', () => {
    const { getByTestId } = render(<Page />);
    down(getByTestId('row'));
    move(11, 10); // not yet a drag

    expect(selectStart(getByTestId('label'))).toBe(true); // would anchor a selection in the row
    expect(selectStart(getByTestId('title'))).toBe(false); // elsewhere: still ordinary
  });

  it('once the drag is on, selection is blocked EVERYWHERE the pointer travels — the page title included', () => {
    const { getByTestId } = render(<Page />);
    down(getByTestId('row'));
    move(60, 60);

    expect(selectStart(getByTestId('title'))).toBe(true);
    expect(selectStart(document.body)).toBe(true);
    expect(document.body.style.userSelect).toBe('none');
    expect(document.body.style.getPropertyValue('-webkit-user-select')).toBe('none');
  });

  it('drops a selection the press had already begun (so no title stays highlighted behind the ghost)', () => {
    const { getByTestId } = render(<Page />);
    down(getByTestId('row'));
    selectText(getByTestId('title'));
    expect(document.getSelection()!.rangeCount).toBe(1);

    move(60, 60);
    expect(document.getSelection()!.rangeCount).toBe(0);
  });

  it.each([
    ['a release', () => act(() => void fireEvent.pointerUp(document, { pointerId: 1 }))],
    ['pointer cancel', () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
    ['window blur', () => act(() => void fireEvent.blur(window))],
  ])('is restored after %s: selection works again and the body is as it was', (_name, end) => {
    const { getByTestId } = render(<Page />);
    document.body.style.userSelect = 'text';
    down(getByTestId('row'));
    move(60, 60);
    end();

    expect(selectStart(getByTestId('title'))).toBe(false);
    expect(selectStart(getByTestId('label'))).toBe(false);
    expect(document.body.style.userSelect).toBe('text');
    expect(document.body.style.getPropertyValue('-webkit-user-select')).toBe('');
  });

  it('after Escape the body is restored at once, and the selection block lifts when the button is released', () => {
    const { getByTestId } = render(<Page />);
    down(getByTestId('row'));
    move(60, 60);
    act(() => void fireEvent.keyDown(document, { key: 'Escape' }));
    expect(document.body.style.userSelect).toBe('');
    expect(selectStart(getByTestId('title'))).toBe(true); // the button is still down: still no incidental selection

    up();
    expect(selectStart(getByTestId('title'))).toBe(false);
  });

  it('a press released without ever dragging leaves no block behind', () => {
    const { getByTestId } = render(<Page />);
    down(getByTestId('row'));
    up();
    expect(selectStart(getByTestId('label'))).toBe(false);
    expect(selectStart(getByTestId('title'))).toBe(false);
  });

  it('unmounting mid-drag removes the block and restores the body', () => {
    const { getByTestId, unmount } = render(<Page />);
    const title = getByTestId('title');
    down(getByTestId('row'));
    move(60, 60);
    expect(selectStart(title)).toBe(true);

    unmount();
    expect(selectStart(document.body)).toBe(false);
    expect(document.body.style.userSelect).toBe('');
  });
});

describe('usePointerDrag — the drag-selection guard', () => {
  const root = document.documentElement;
  const locked = () => root.hasAttribute('data-pointer-drag');

  function Two() {
    return (
      <div>
        <Harness />
        <Harness />
        <h1 data-testid="title">Page title</h1>
        <input data-testid="field" defaultValue="typed text" />
        <div data-testid="editable" contentEditable suppressContentEditableWarning>
          editable text
        </div>
      </div>
    );
  }

  const selectStartPrevented = (target: Element) => {
    const event = new Event('selectstart', { bubbles: true, cancelable: true });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };

  const select = (element: Element, start = 0, end?: number) => {
    const range = document.createRange();
    const node = element.firstChild!;
    range.setStart(node, start);
    range.setEnd(node, end ?? node.textContent!.length);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  };

  const allRows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-testid="row"]'));

  it('marks <html> for exactly the length of the drag, on every way a drag can end', () => {
    const exits: Array<[string, () => void]> = [
      ['release', () => up()],
      ['pointer cancel', () => act(() => void fireEvent.pointerCancel(document, { pointerId: 1 }))],
      ['window blur', () => act(() => void fireEvent.blur(window))],
      ['Escape', () => act(() => void fireEvent.keyDown(document, { key: 'Escape' }))],
    ];
    for (const [name, end] of exits) {
      const { getByTestId, unmount } = render(<Harness />);
      expect(locked(), name).toBe(false);
      down(getByTestId('row'));
      expect(locked(), `${name}: a bare press is not a drag`).toBe(false);
      move(60, 60);
      expect(locked(), name).toBe(true);
      end();
      expect(locked(), name).toBe(false);
      up();
      unmount();
      expect(locked(), `${name} (after unmount)`).toBe(false);
    }
  });

  it('is lifted when the component unmounts mid-drag', () => {
    const { getByTestId, unmount } = render(<Harness />);
    down(getByTestId('row'));
    move(60, 60);
    expect(locked()).toBe(true);
    unmount();
    expect(locked()).toBe(false);
    expect(document.body.style.userSelect).toBe('');
  });

  it('removes a selection that appears while dragging — including inside an editable title, an input and contentEditable', () => {
    const { getByTestId } = render(<Two />);
    down(allRows()[0]!);
    move(60, 60);

    for (const id of ['title', 'editable']) {
      select(getByTestId(id));
      expect(document.getSelection()!.rangeCount, id).toBe(0);
    }
  });

  it('keeps extending-selection out for the whole drag, not just once at the threshold', () => {
    const { getByTestId } = render(<Two />);
    down(allRows()[0]!);
    move(60, 60);
    select(getByTestId('title'));
    move(90, 90);
    select(getByTestId('title'), 2, 5);
    expect(document.getSelection()!.rangeCount).toBe(0);
  });

  it('leaves a selection that existed before the press alone', () => {
    const { getByTestId } = render(<Two />);
    select(getByTestId('title'), 1, 4);
    down(allRows()[0]!);
    move(60, 60);
    document.dispatchEvent(new Event('selectionchange'));

    const selection = document.getSelection()!;
    expect(selection.rangeCount).toBe(1);
    expect(selection.toString()).toBe('age');
  });

  it('does nothing outside a drag: selecting in the title, an input or contentEditable works, and a bare press changes nothing', () => {
    const { getByTestId } = render(<Two />);
    select(getByTestId('title'));
    expect(document.getSelection()!.rangeCount).toBe(1);
    select(getByTestId('editable'));
    expect(document.getSelection()!.rangeCount).toBe(1);

    const field = getByTestId('field') as HTMLInputElement;
    field.focus();
    field.setSelectionRange(0, 5);
    down(allRows()[0]!);
    up();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(5);
    expect(locked()).toBe(false);
    expect(selectStartPrevented(field)).toBe(false);
  });

  it('is reference-counted: one drag ending does not lift the guard under another that is still going', () => {
    render(<Two />);
    const [first, second] = allRows();
    // Distinct pointer ids: two sessions that are live at the same time.
    fireEvent.pointerDown(first!, { button: 0, pointerId: 1, isPrimary: true, clientX: 10, clientY: 10 });
    fireEvent.pointerDown(second!, { button: 0, pointerId: 2, isPrimary: true, clientX: 10, clientY: 10 });
    act(() => {
      fireEvent.pointerMove(document, { pointerId: 1, clientX: 60, clientY: 60 });
      fireEvent.pointerMove(document, { pointerId: 2, clientX: 60, clientY: 60 });
    });
    expect(locked()).toBe(true);

    act(() => void fireEvent.pointerUp(document, { pointerId: 1 }));
    expect(locked()).toBe(true);
    expect(document.body.style.userSelect).toBe('none');

    act(() => void fireEvent.pointerUp(document, { pointerId: 2 }));
    expect(locked()).toBe(false);
    expect(document.body.style.userSelect).toBe('');
  });

  it('the stylesheet it sets the mark for reaches every element, editable ones included', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const css = readFileSync(resolve(process.cwd(), 'src/shared/interaction/pointerDrag.css'), 'utf-8');
    expect(css).toMatch(/html\[data-pointer-drag\] \*/);
    expect(css).toMatch(/user-select:\s*none\s*!important/);
    expect(css).toMatch(/-webkit-user-select:\s*none\s*!important/);
    expect(css.match(/\{/g)).toHaveLength(1); // one rule, and it is scoped to the mark: nothing applies outside a drag
  });
});
