// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { CollectionCard } from '../components/card/CollectionCard';
import { CollectionEntry } from '../components/entry/CollectionEntry';
import type { CollectionItemSelection } from '../components/entry/CollectionSelectionCheckbox';
import { CollectionDataList } from '../components/list/CollectionDataList';
import { CollectionDataTable } from '../components/table/CollectionDataTable';
import { useCollectionSelection } from './useCollectionSelection';
import { useMarqueeSelection } from './useMarqueeSelection';

const IDS = ['a', 'b', 'c', 'd'];
const onOpen = vi.fn();
const COLUMNS = [{ id: 'name', label: 'Name', width: '1fr' }] as never;

type Layout = (props: { selectionFor(id: string, label: string): CollectionItemSelection }) => ReactNode;
const LAYOUTS: Record<string, Layout> = {
  'list rows': ({ selectionFor }) => (
    <CollectionDataList items={IDS.map((id) => ({ id, icon: 'note', title: id, onClick: onOpen, selection: selectionFor(id, id) }))} />
  ),
  'table rows': ({ selectionFor }) => (
    <CollectionDataTable
      columns={COLUMNS}
      rows={IDS.map((id) => ({ id, cells: { name: { variant: 'header', icon: 'note', title: id } }, onClick: onOpen, selection: selectionFor(id, id) }))}
    />
  ),
  'folder cards': ({ selectionFor }) => (
    <>
      {IDS.map((id) => (
        <CollectionEntry key={id} layout="cell" className="collection-entry--folder-card" leading={<span />} title={id} onClick={onOpen} selection={selectionFor(id, id)} />
      ))}
    </>
  ),
  'note and asset cards': ({ selectionFor }) => (
    <>
      {IDS.map((id) => (
        <CollectionCard key={id} header={id} onClick={onOpen} selection={selectionFor(id, id)} />
      ))}
    </>
  ),
};

/**
 * A body the way the real ones are wired — one selection, one marquee on the root, inside a scroll container — with the
 * things around a collection that a click must leave alone: a toolbar, an open menu and an editor, all outside the scroller.
 */
function Body({ layout }: { layout: string }) {
  const selection = useCollectionSelection(IDS);
  const marquee = useMarqueeSelection(selection);
  return (
    <>
      <button data-testid="toolbar">Toolbar</button>
      <div data-testid="menu" role="menu">
        <button role="menuitem">Menu item</button>
      </div>
      <div data-testid="editor" contentEditable suppressContentEditableWarning />
      <div data-testid="scroller" style={{ overflowY: 'auto' }}>
        <div data-testid="root" ref={marquee.ref}>
          {LAYOUTS[layout]!({ selectionFor: selection.selectionFor })}
          <input data-testid="field" />
          <a data-testid="link" href="#x">link</a>
          <div data-testid="handle" data-no-marquee />
          <div data-testid="empty-row" />
        </div>
      </div>
    </>
  );
}

/** Item `i` is 40px tall at y = i * 50 and spans x 100–300 (the content box); the scroller is 0–400 × 0–300, so x < 100 and x > 300 are the gutters. */
function mockGeometry() {
  const scroller = screen.getByTestId('scroller') as HTMLElement & { scrollTop: number };
  Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true, configurable: true });
  Object.defineProperty(scroller, 'scrollLeft', { value: 0, writable: true, configurable: true });
  scroller.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON() {} });
  screen.getByTestId('root').getBoundingClientRect = () => ({ left: 100, top: 0, right: 300, bottom: 250, width: 200, height: 250, x: 100, y: 0, toJSON() {} });
  document.querySelectorAll<HTMLElement>('[data-selection-id]').forEach((element) => {
    const index = IDS.indexOf(element.dataset.selectionId!);
    element.getBoundingClientRect = () => {
      const top = index * 50;
      return { left: 100, top, right: 300, bottom: top + 40, width: 200, height: 40, x: 100, y: top, toJSON() {} };
    };
  });
  return scroller;
}

const press = (el: Element, init: object = {}) =>
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, isPrimary: true, clientX: 200, clientY: 45, ...init });
const move = (x: number, y: number) =>
  act(() => {
    fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y });
  });
const release = () =>
  act(() => {
    fireEvent.pointerUp(document, { pointerId: 1 });
  });
/** A whole click: press, release. */
const click = (el: Element, init: object = {}) => {
  press(el, init);
  release();
};
const checked = () =>
  screen
    .getAllByRole('checkbox', { hidden: true })
    .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
    .map((checkbox) => checkbox.getAttribute('aria-label')!.replace('Select ', ''));
const box = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}`, hidden: true });
/** Every sign of selection and of selection mode a layout draws. */
const markers = (container: HTMLElement) =>
  container.querySelectorAll('[class*="--checked"], [class*="--selected"], [class*="--selecting"], [aria-checked="true"]');
const tick = () => act(() => new Promise<void>((resolve) => void setTimeout(resolve, 0)));
const setPlatform = (platform: string) => Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });

beforeEach(() => onOpen.mockClear());
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  setPlatform('');
  document.body.removeAttribute('style');
});

describe.each(Object.keys(LAYOUTS))('clicking empty space in %s', (layout) => {
  const draw = () => {
    const view = render(<Body layout={layout} />);
    return { ...view, scroller: mockGeometry(), root: screen.getByTestId('root') };
  };

  describe('clears the selection and leaves selection mode', () => {
    it.each([
      ['the right gutter', 'scroller', { clientX: 350, clientY: 20 }],
      ['the left gutter', 'scroller', { clientX: 50, clientY: 20 }],
      ['the space between two items', 'root', { clientX: 200, clientY: 45 }],
      ['the space below the last item', 'root', { clientX: 200, clientY: 230 }],
      ['the empty area of the content beside an item', 'root', { clientX: 290, clientY: 20 }],
      ['an empty element of the body', 'empty-row', { clientX: 200, clientY: 240 }],
    ] as const)('in %s', (_where, targetId, point) => {
      const { container } = draw();
      fireEvent.click(box('b'));
      expect(checked()).toEqual(['b']);
      expect(markers(container).length).toBeGreaterThan(0);

      click(screen.getByTestId(targetId), point);

      expect(checked()).toEqual([]);
      expect(markers(container)).toHaveLength(0);
    });

    it('with several items selected, all at once', () => {
      const { container, root } = draw();
      fireEvent.click(box('a'));
      fireEvent.click(box('c'));
      fireEvent.click(box('d'));
      expect(checked()).toEqual(['a', 'c', 'd']);

      click(root);

      expect(checked()).toEqual([]);
      expect(markers(container)).toHaveLength(0);
    });

    it('for a click that drifts a little (under the drag threshold) too', () => {
      const { root } = draw();
      fireEvent.click(box('a'));

      press(root);
      move(203, 47);
      release();

      expect(checked()).toEqual([]);
    });

    it('and back to the existing behavior: an item opens on a plain click again, checkboxes only on hover', () => {
      const { container, root } = draw();
      fireEvent.click(box('a'));
      click(root);

      fireEvent.click(container.querySelector('[role="button"]')!);

      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(markers(container)).toHaveLength(0);
    });

    it('as often as the mode is entered', () => {
      const { root } = draw();
      for (const name of ['a', 'b', 'c']) {
        fireEvent.click(box(name));
        expect(checked()).toEqual([name]);
        click(root);
        expect(checked()).toEqual([]);
      }
    });
  });

  describe('does exactly what Escape does', () => {
    it('leaves the same state, from one item or from several', () => {
      for (const names of [['b'], ['a', 'b', 'd']]) {
        const clicked = draw();
        names.forEach((name) => fireEvent.click(box(name)));
        click(clicked.root);
        const afterClick = { checked: checked(), markers: markers(clicked.container).length, html: clicked.container.innerHTML };
        cleanup();

        const escaped = draw();
        names.forEach((name) => fireEvent.click(box(name)));
        fireEvent.keyDown(document.body, { key: 'Escape' });

        expect(afterClick.checked).toEqual(checked());
        expect(afterClick.markers).toBe(markers(escaped.container).length);
        expect(afterClick.html).toBe(escaped.container.innerHTML);
        cleanup();
      }
    });
  });

  describe('leaves the selection alone', () => {
    it('for a click on an item: the item toggles, as before, and nothing else changes', () => {
      const { container } = draw();
      fireEvent.click(box('a'));
      const rows = container.querySelectorAll<HTMLElement>('[data-selection-id]');
      const itemC = [...rows].find((row) => row.dataset.selectionId === 'c')!;

      press(itemC, { clientX: 200, clientY: 105 });
      release();
      expect(checked()).toEqual(['a']);
      fireEvent.click(box('c'));

      expect(checked()).toEqual(['a', 'c']);
    });

    it('for a click on a checkbox: it toggles exactly once, and the others stay', () => {
      draw();
      fireEvent.click(box('a'));
      fireEvent.click(box('b'));

      click(box('b'));
      fireEvent.click(box('b'));

      expect(checked()).toEqual(['a']);
    });

    it.each([
      ['a field', 'field'],
      ['a link', 'link'],
      ['a handle', 'handle'],
      ['a control outside the collection (a toolbar)', 'toolbar'],
      ['an open menu', 'menu'],
      ['a menu item', 'menuitem'],
      ['an editor', 'editor'],
    ] as const)('for a click on %s', (_what, id) => {
      draw();
      fireEvent.click(box('a'));
      fireEvent.click(box('b'));
      const target = id === 'menuitem' ? screen.getByRole('menuitem') : screen.getByTestId(id);

      click(target);

      expect(checked()).toEqual(['a', 'b']);
    });

    it('for a press outside the collection’s own extent (the page header above it, the scrollbar beside it)', () => {
      const { scroller } = draw();
      fireEvent.click(box('a'));

      click(scroller, { clientX: 350, clientY: 280 });

      expect(checked()).toEqual(['a']);
    });

    it('for a click with Shift or Alt held', () => {
      const { root } = draw();
      fireEvent.click(box('a'));

      click(root, { shiftKey: true });
      click(root, { altKey: true });

      expect(checked()).toEqual(['a']);
    });

    it('for the additive click (Ctrl on Windows and Linux, Cmd on macOS): it adds nothing and keeps everything', () => {
      setPlatform('Win32');
      const { root } = draw();
      fireEvent.click(box('a'));
      click(root, { ctrlKey: true });
      expect(checked()).toEqual(['a']);
      cleanup();

      setPlatform('MacIntel');
      const mac = draw();
      fireEvent.click(box('a'));
      click(mac.root, { metaKey: true });
      expect(checked()).toEqual(['a']);
    });

    it('for a right-click, or any button but the primary one', () => {
      const { root } = draw();
      fireEvent.click(box('a'));

      click(root, { button: 2 });
      click(root, { button: 1 });
      click(root, { isPrimary: false });

      expect(checked()).toEqual(['a']);
    });

    it('for a press that is cancelled (pointer cancel, window blur) — only a release is a click', () => {
      const { root } = draw();
      fireEvent.click(box('a'));

      press(root);
      act(() => {
        fireEvent.pointerCancel(document, { pointerId: 1 });
      });
      press(root);
      act(() => {
        window.dispatchEvent(new Event('blur'));
      });

      expect(checked()).toEqual(['a']);
    });

    it('for the press itself: nothing changes until the pointer is released', () => {
      const { root } = draw();
      fireEvent.click(box('a'));

      press(root);

      expect(checked()).toEqual(['a']);
      release();
      expect(checked()).toEqual([]);
    });

    it('for the release of another pointer', () => {
      const { root } = draw();
      fireEvent.click(box('a'));

      press(root);
      act(() => {
        fireEvent.pointerUp(document, { pointerId: 2 });
      });
      expect(checked()).toEqual(['a']);
      release();
    });
  });

  describe('with nothing selected', () => {
    it('does nothing at all: no rectangle, nothing selected, nothing changes, and the item opens as ever', () => {
      const { container, root } = draw();
      const before = container.innerHTML;

      click(root);

      expect(container.innerHTML).toBe(before);
      expect(checked()).toEqual([]);
      fireEvent.click(container.querySelector('[role="button"]')!);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });
  });

  describe('a marquee drag from empty space is still a marquee', () => {
    it('selects what the rectangle touches, and its release does not clear it', async () => {
      const { root } = draw();

      press(root, { clientX: 350, clientY: 5 });
      move(100, 60);
      expect(checked()).toEqual(['a', 'b']);
      release();

      expect(checked()).toEqual(['a', 'b']);
      await tick();
    });

    it('replaces an existing selection, and its release does not clear that either', async () => {
      const { root } = draw();
      fireEvent.click(box('d'));

      press(root, { clientX: 350, clientY: 5 });
      move(100, 60);
      release();

      expect(checked()).toEqual(['a', 'b']);
      await tick();
    });

    it('keeps what it selected even when it ends where it started: it began, so it is a marquee, not a click', async () => {
      const { root } = draw();
      fireEvent.click(box('d'));

      press(root, { clientX: 350, clientY: 5 });
      move(100, 60);
      move(350, 5);
      release();

      // The rectangle is back on empty space, so it holds nothing — by the marquee's own rule, not by a click's.
      expect(checked()).toEqual([]);
      await tick();
      // ...and the release did not open or toggle anything.
      expect(onOpen).not.toHaveBeenCalled();
    });

    it('adds to the selection with the additive modifier, and its release keeps all of it', async () => {
      setPlatform('Win32');
      const { root } = draw();
      fireEvent.click(box('d'));

      press(root, { clientX: 350, clientY: 5, ctrlKey: true });
      move(100, 60);
      release();

      expect(checked()).toEqual(['a', 'b', 'd']);
      await tick();
    });

    it('swallows the click its release fires, so nothing opens', async () => {
      const { root } = draw();
      fireEvent.click(box('a'));

      press(root, { clientX: 350, clientY: 5 });
      move(100, 60);
      release();
      fireEvent.click(root);

      expect(onOpen).not.toHaveBeenCalled();
      await tick();
    });

    it('Escape during the drag still restores the selection the press found, and the release then clears nothing', async () => {
      const { root } = draw();
      fireEvent.click(box('d'));

      press(root, { clientX: 350, clientY: 5 });
      move(100, 60);
      expect(checked()).toEqual(['a', 'b']);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(checked()).toEqual(['d']);
      release();

      expect(checked()).toEqual(['d']);
      await tick();
    });
  });
});
