// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
        <CollectionEntry
          key={id}
          layout="cell"
          className="collection-entry--folder-card"
          leading={<span />}
          title={id}
          onClick={onOpen}
          selection={selectionFor(id, id)}
        />
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

/** A body the way the real ones are wired: one selection, one marquee on the root, inside a scroll container. */
function Body({ layout }: { layout: string }) {
  const selection = useCollectionSelection(IDS);
  const marquee = useMarqueeSelection(selection);
  return (
    <div data-testid="scroller" style={{ overflowY: 'auto' }}>
      <div data-testid="root" ref={marquee.ref}>
        {LAYOUTS[layout]!({ selectionFor: selection.selectionFor })}
        <input data-testid="field" />
        <a data-testid="link" href="#x">
          link
        </a>
      </div>
    </div>
  );
}

/** Item `i` is 40px tall at y = i * 50 − scrollTop and spans x 100–300 (the content box); the scroller is 0–400 × 0–300, so x < 100 and x > 300 are the gutters. */
function mockGeometry() {
  const scroller = screen.getByTestId('scroller') as HTMLElement & { scrollTop: number };
  Object.defineProperty(scroller, 'scrollTop', { value: 0, writable: true, configurable: true });
  Object.defineProperty(scroller, 'scrollLeft', { value: 0, writable: true, configurable: true });
  scroller.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON() {} });
  screen.getByTestId('root').getBoundingClientRect = () => ({ left: 100, top: 0, right: 300, bottom: 250, width: 200, height: 250, x: 100, y: 0, toJSON() {} });
  document.querySelectorAll<HTMLElement>('[data-selection-id]').forEach((element) => {
    const index = IDS.indexOf(element.dataset.selectionId!);
    element.getBoundingClientRect = () => {
      const top = index * 50 - scroller.scrollTop;
      return { left: 100, top, right: 300, bottom: top + 40, width: 200, height: 40, x: 100, y: top, toJSON() {} };
    };
  });
  return scroller;
}

const down = (el: Element, init: object = {}) =>
  fireEvent.pointerDown(el, { button: 0, pointerId: 1, isPrimary: true, clientX: 300, clientY: 5, ...init });
const move = (x: number, y: number) =>
  act(() => {
    fireEvent.pointerMove(document, { pointerId: 1, clientX: x, clientY: y });
  });
const up = () =>
  act(() => {
    fireEvent.pointerUp(document, { pointerId: 1 });
  });
const checked = () =>
  screen
    .getAllByRole('checkbox', { hidden: true })
    .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
    .map((checkbox) => checkbox.getAttribute('aria-label')!.replace('Select ', ''));
const box = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}`, hidden: true });
const marquee = () => document.querySelector<HTMLElement>('.collection-marquee');
/** The click a release fires is swallowed until the next tick; a test that clicks again waits it out, as a person would. */
const tick = () => act(() => new Promise<void>((resolve) => void setTimeout(resolve, 0)));
const setPlatform = (platform: string) => Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });

beforeEach(() => onOpen.mockClear());
afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  setPlatform('');
  document.body.removeAttribute('style');
});

describe.each(Object.keys(LAYOUTS))('marquee selection in %s', (layout) => {
  const draw = () => {
    const view = render(<Body layout={layout} />);
    return { ...view, scroller: mockGeometry(), root: screen.getByTestId('root') };
  };

  it('selects the items the rectangle touches, continuously, and removes the rectangle on release', () => {
    const { root, container } = draw();

    down(root);
    move(100, 60);
    expect(marquee()).not.toBeNull();
    expect(checked()).toEqual(['a', 'b']);

    move(100, 120);
    expect(checked()).toEqual(['a', 'b', 'c']);

    move(100, 60);
    expect(checked()).toEqual(['a', 'b']);

    up();
    expect(marquee()).toBeNull();
    expect(checked()).toEqual(['a', 'b']);
    // Selection mode, as with any selection: every item shows its checkbox.
    expect(container.querySelectorAll('.collection-entry--selecting, .collection-card--selecting').length).toBeGreaterThan(0);
  });

  it('replaces the selection that was there, and keeps it for a press that never becomes a drag', () => {
    const { root } = draw();
    fireEvent.click(box('d'));

    down(root);
    move(302, 7); // under the threshold
    up();
    expect(checked()).toEqual(['d']);

    down(root);
    move(100, 60);
    up();
    expect(checked()).toEqual(['a', 'b']);
  });

  it('adds to the selection with Ctrl on Windows and Linux, and Cmd on macOS', async () => {
    setPlatform('Win32');
    const { root } = draw();
    fireEvent.click(box('d'));

    down(root, { ctrlKey: true });
    move(100, 60);
    up();
    expect(checked()).toEqual(['a', 'b', 'd']);

    await tick();
    cleanup();
    setPlatform('MacIntel');
    render(<Body layout={layout} />);
    mockGeometry();
    fireEvent.click(box('d'));
    down(screen.getByTestId('root'), { metaKey: true });
    move(100, 60);
    up();
    expect(checked()).toEqual(['a', 'b', 'd']);
  });

  it('starts in the left or right gutter, beside the content, and selects what the rectangle reaches', () => {
    const { scroller } = draw();

    down(scroller, { clientX: 20, clientY: 5 });
    move(150, 60);
    expect(marquee()).not.toBeNull();
    expect(checked()).toEqual(['a', 'b']);
    up();
    expect(marquee()).toBeNull();

    down(scroller, { clientX: 380, clientY: 5 });
    move(250, 120);
    expect(checked()).toEqual(['a', 'b', 'c']);
    up();
  });

  it('may also end in a gutter, and start between rows or in the content’s own empty space', () => {
    const { root, scroller } = draw();

    down(root, { clientX: 200, clientY: 5 });
    move(10, 60); // ends in the left gutter
    expect(checked()).toEqual(['a', 'b']);
    up();

    down(root, { clientX: 200, clientY: 45 }); // the gap between two rows
    move(390, 120); // ends in the right gutter
    expect(checked()).toEqual(['b', 'c']);
    up();

    // The rectangle is drawn only over the scrolling area, whatever side it started on.
    down(scroller, { clientX: 5, clientY: 5 });
    move(395, 120);
    const drawn = marquee()!;
    expect(parseFloat(drawn.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(drawn.style.left) + parseFloat(drawn.style.width)).toBeLessThanOrEqual(400);
    up();
  });

  it('does not start from the surface above or below the content, or on the scrollbar', () => {
    const { scroller } = draw();
    Object.defineProperty(scroller, 'clientWidth', { value: 380, configurable: true });
    Object.defineProperty(scroller, 'clientHeight', { value: 300, configurable: true });

    for (const point of [{ clientX: 20, clientY: -20 }, { clientX: 20, clientY: 280 }, { clientX: 395, clientY: 5 }]) {
      down(scroller, point);
      move(150, 120);
      expect(marquee()).toBeNull();
      expect(checked()).toEqual([]);
      up();
    }
  });

  it('does not start on an item, a checkbox, a link or a field', () => {
    const { root } = draw();
    const item = root.querySelector('[data-selection-id]')!;

    for (const target of [item, box('a'), screen.getByTestId('link'), screen.getByTestId('field')]) {
      down(target);
      move(100, 120);
      expect(marquee()).toBeNull();
      expect(checked()).toEqual([]);
      up();
    }
  });

  it('opens nothing: the click that follows a marquee release is swallowed, and a later click toggles the item', async () => {
    const { root } = draw();
    down(root);
    move(100, 60);
    up();
    fireEvent.click(root.querySelector('[role="button"]')!);
    expect(onOpen).not.toHaveBeenCalled();

    // A later click is an ordinary one: in selection mode it toggles the item, and still opens nothing.
    await tick();
    fireEvent.click(root.querySelector('[role="button"]')!);
    expect(onOpen).not.toHaveBeenCalled();
    expect(checked()).toEqual(['b']);
  });

  it('stays compatible with checkbox and modifier-click selection afterwards', async () => {
    setPlatform('Win32');
    const { root } = draw();
    down(root);
    move(100, 60);
    up();
    await tick();

    fireEvent.click(box('a'));
    expect(checked()).toEqual(['b']);
    fireEvent.click(root.querySelectorAll('[role="button"]')[2]!, { ctrlKey: true });
    expect(checked()).toEqual(['b', 'c']);
  });

  it('keeps growing the selection as the area scrolls under a resting pointer', () => {
    const { root, scroller } = draw();
    down(root);
    move(100, 60);
    expect(checked()).toEqual(['a', 'b']);

    scroller.scrollTop = 100;
    act(() => {
      fireEvent.scroll(scroller);
    });
    expect(checked()).toEqual(['a', 'b', 'c', 'd']);
    up();
  });

  it('clips the drawn rectangle to the scrolling area when the pointer leaves it, and releases cleanly outside', () => {
    const { root } = draw();
    down(root);
    move(-500, 900);

    const drawn = marquee()!;
    expect(parseFloat(drawn.style.left)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(drawn.style.left) + parseFloat(drawn.style.width)).toBeLessThanOrEqual(400);
    expect(parseFloat(drawn.style.top) + parseFloat(drawn.style.height)).toBeLessThanOrEqual(300);
    expect(checked()).toEqual(['a', 'b', 'c', 'd']);

    up();
    expect(marquee()).toBeNull();
    // Nothing tracks the pointer any more.
    move(100, 10);
    expect(checked()).toEqual(['a', 'b', 'c', 'd']);
  });

  it('Escape puts back the selection the press found, and unmounting mid-drag leaves nothing behind', () => {
    const { root, unmount } = draw();
    fireEvent.click(box('d'));

    down(root);
    move(100, 60);
    expect(checked()).toEqual(['a', 'b']);
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(marquee()).toBeNull();
    expect(checked()).toEqual(['d']);

    down(root);
    move(100, 60);
    expect(marquee()).not.toBeNull();
    unmount();
    expect(marquee()).toBeNull();
    expect(document.documentElement.hasAttribute('data-pointer-drag')).toBe(false);
  });
});

describe('the marquee rectangle', () => {
  it('is over the content and under menus, never a pointer target (CSS contract)', () => {
    const css = readFileSync(join(__dirname, 'marquee.css'), 'utf8');

    expect(css).toMatch(/z-index: calc\(var\(--z-overlay\) - 1\)/);
    expect(css).toMatch(/pointer-events: none/);
    expect(css).toMatch(/border: 1px solid var\(--border-active\)/);
    expect(css).toMatch(/background: var\(--state-selected-accent\)/);
    expect(css.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/margin/);
  });
});
