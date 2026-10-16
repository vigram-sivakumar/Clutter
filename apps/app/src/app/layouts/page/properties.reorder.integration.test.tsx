// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { readPropertySequence, type PropertyFrontmatter } from '@core/vault/ingest/frontmatter/propertyLines';

import { AppIcon } from '@shared/icon';

import { PropertiesHarness } from './propertiesTestHarness';

/**
 * Reordering the Properties list through the real PropertyList: dragging a row by its label (the existing
 * pointer-drag, ghost and insertion line), and Move up / Move down in the row's menu — both end in the one
 * reorder write. jsdom measures everything as 0, so rows are laid out here: 32px tall with a 6px gap,
 * from y = 100.
 */

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

const ROW_TOP = 100;
const ROW_STEP = 38;
const ROW_HEIGHT = 32;

beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());

beforeEach(() => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const rect = (left: number, top: number, width: number, height: number) =>
      ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top }) as DOMRect;

    if (this.classList.contains('property-list')) {
      return rect(0, ROW_TOP, 600, 400);
    }
    if (this.classList.contains('property-list__row')) {
      const index = [...document.querySelectorAll('.property-list__row')].indexOf(this);
      return rect(0, ROW_TOP + Math.max(0, index) * ROW_STEP, 600, ROW_HEIGHT);
    }
    return rect(0, 0, 0, 0);
  });
});

afterEach(async () => {
  // A release arms a one-shot click swallower that disarms on the next task.
  await new Promise((resolve) => setTimeout(resolve, 0));
  cleanup();
  vi.restoreAllMocks();
  document.body.removeAttribute('style');
});

/** A note read from a file: its preserved lines and the physical order of its entries. */
const parse = (yaml: string): PropertyFrontmatter => {
  const { frontmatter } = new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`);

  return { lines: frontmatter.unownedLines ?? [], order: frontmatter.entryOrder };
};
const order = (state: PropertyFrontmatter) => readPropertySequence(state).map((ref) => ref.key);

function setup(yaml: string, options: { status?: 'active' | 'archived' } = {}) {
  const onState = vi.fn();
  const initial = parse(yaml);
  render(<PropertiesHarness initial={initial.lines} initialOrder={initial.order} onState={onState} {...options} />);
  const latest = () => (onState.mock.calls.at(-1)?.[0] ?? initial) as PropertyFrontmatter;
  return { onLines: onState, latest };
}

// Tags is declared (its entry is first), then three custom properties; the file's entries are in this order.
const START = 'tags:\n  - x\na: 1\nb: 2\nc: 3';
const names = () => [...document.querySelectorAll('.property-list__row')].map((row) => row.querySelector('.property-list__name')?.textContent);
const rowOf = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('.property-list__row')].find((row) => row.querySelector('.property-list__name')?.textContent === name)!;
const labelOf = (name: string) => rowOf(name).querySelector<HTMLElement>('.property-list__name')!;
const handleOf = (name: string) => rowOf(name).querySelector<HTMLElement>('.property-list__drag-handle')!;
const feedback = () => [...document.body.querySelectorAll<HTMLElement>('[data-drop-feedback]')];
const ghost = () => document.body.querySelector('.drag-ghost');

const press = (target: Element, y: number) =>
  fireEvent.pointerDown(target, { button: 0, pointerId: 1, isPrimary: true, clientX: 40, clientY: y });
const move = (y: number) => act(() => void fireEvent.pointerMove(document, { pointerId: 1, clientX: 40, clientY: y }));
const release = (y: number) => act(() => void fireEvent.pointerUp(document, { pointerId: 1, clientX: 40, clientY: y }));

// Rows: Tags 100, a 138, b 176, c 214 — middles 116, 154, 192, 230.
const CENTER = (index: number) => ROW_TOP + index * ROW_STEP + ROW_HEIGHT / 2;

describe('dragging a property by its handle', () => {
  it('drops it after the last row: the insertion line shows below it, and the whole new order is written', () => {
    const { latest, onLines } = setup(START);

    press(handleOf('a'), CENTER(1));
    move(CENTER(3) + 20);

    expect(ghost()).not.toBeNull();
    expect(feedback()).toHaveLength(1);
    expect(feedback()[0]).toHaveAttribute('data-drop-feedback', 'insert');
    expect(feedback()[0]!.style.top).toBe(`${ROW_TOP + 3 * ROW_STEP + ROW_HEIGHT}px`);
    expect(onLines).not.toHaveBeenCalled();

    release(CENTER(3) + 20);

    expect(order(latest())).toEqual(['tags', 'b', 'c', 'a']);
    expect(names()).toEqual(['Tags', 'b', 'c', 'a']);
    expect(feedback()).toHaveLength(0);
    expect(ghost()).toBeNull();
  });

  it('drops it before the first row — system and custom properties are one list', () => {
    const { latest } = setup(START);

    press(handleOf('c'), CENTER(3));
    move(ROW_TOP + 2);

    expect(feedback()[0]!.style.top).toBe(`${ROW_TOP}px`);
    release(ROW_TOP + 2);

    expect(order(latest())).toEqual(['c', 'tags', 'a', 'b']);
  });

  it('between two rows: before the one whose middle is below the pointer', () => {
    const { latest } = setup(START);

    press(handleOf('c'), CENTER(3));
    move(CENTER(1) + 4); // just below a's middle: before b
    expect(feedback()[0]!.style.top).toBe(`${ROW_TOP + 2 * ROW_STEP}px`);
    release(CENTER(1) + 4);

    expect(order(latest())).toEqual(['tags', 'a', 'c', 'b']);
  });

  it('dropping where it already is shows no line and writes nothing', () => {
    const { onLines } = setup(START);

    press(handleOf('a'), CENTER(1));
    move(CENTER(1) + 6); // still within its own slot
    expect(feedback()).toHaveLength(0);
    release(CENTER(1) + 6);

    expect(onLines).not.toHaveBeenCalled();
  });

  it('Escape cancels: the line and ghost go, and nothing is written even when released over a slot', () => {
    const { onLines } = setup(START);

    press(handleOf('a'), CENTER(1));
    move(CENTER(3) + 20);
    expect(feedback()).toHaveLength(1);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(feedback()).toHaveLength(0);
    expect(ghost()).toBeNull();
    release(CENTER(3) + 20);
    expect(onLines).not.toHaveBeenCalled();
    expect(names()).toEqual(['Tags', 'a', 'b', 'c']);
  });

  it('a plain click on the handle is not a drag: no ghost, no write', () => {
    const { onLines } = setup(START);

    press(handleOf('a'), CENTER(1));
    move(CENTER(1) + 1); // inside the drag threshold
    release(CENTER(1) + 1);

    expect(ghost()).toBeNull();
    expect(onLines).not.toHaveBeenCalled();
  });

  it('only the handle drags: pressing and moving on the label, an editable label, a value or the menu button never starts one', () => {
    const { onLines } = setup(START);
    const attempts: Element[] = [
      labelOf('a'),
      labelOf('a').querySelector('[role="textbox"]')!,
      rowOf('a').querySelector('.property-list__value')!,
      screen.getByRole('button', { name: 'a actions' }),
    ];

    for (const target of attempts) {
      press(target, CENTER(1));
      move(CENTER(3) + 20);
      expect(ghost()).toBeNull();
      expect(feedback()).toHaveLength(0);
      release(CENTER(3) + 20);
    }

    expect(onLines).not.toHaveBeenCalled();
    expect(names()).toEqual(['Tags', 'a', 'b', 'c']);
  });

  it('every reorderable row has a handle drawn with the drag-handle icon, outside the accessibility tree; a draft row has none', () => {
    setup('tags:\n  - x\na: 1');
    const expected = render(<AppIcon icon="dragHandle" />).container.querySelector('svg')!.outerHTML;
    cleanup();
    setup('tags:\n  - x\na: 1');

    for (const name of ['Tags', 'a']) {
      const handle = handleOf(name);
      expect(handle).toHaveAttribute('aria-hidden', 'true');
      expect(handle.querySelector('svg')!.outerHTML).toBe(expected);
    }

    fireEvent.click(screen.getByText('Add a property'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text' }));
    const draftRow = [...document.querySelectorAll('.property-list__row')].at(-1)!;
    expect(draftRow.querySelector('.property-list__drag-handle')).toBeNull();
  });

  it('is not offered on an archived note: no handle, no drag', () => {
    const { onLines } = setup(START, { status: 'archived' });

    expect(document.querySelector('.property-list__drag-handle')).toBeNull();
    press(labelOf('a'), CENTER(1));
    move(CENTER(3) + 20);
    expect(ghost()).toBeNull();
    release(CENTER(3) + 20);

    expect(onLines).not.toHaveBeenCalled();
  });

  it('a property being named (a draft) is never moved and stays last', () => {
    setup('a: 1\nproperties:\n  order: [tags, a]');

    fireEvent.click(screen.getByText('Add a property'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text' }));

    const rows = [...document.querySelectorAll('.property-list__row')];
    expect(rows).toHaveLength(3);
    expect(rows[2]!.getAttribute('data-property-orderable')).toBeNull();
    expect(rows[0]!.getAttribute('data-property-orderable')).toBe('true');
  });
});

describe('Move up and Move down in the property menu', () => {
  const openMenu = (name: string) => fireEvent.click(screen.getByRole('button', { name: `${name} actions` }));
  const choose = (label: string) => fireEvent.click(screen.getByRole('menuitem', { name: label }));
  const item = (label: string) => screen.getByRole('menuitem', { name: label });

  it('Move up and Move down swap a property with its neighbour, through the same write', () => {
    const { latest } = setup(START);

    openMenu('b');
    choose('Move up');
    expect(order(latest())).toEqual(['tags', 'b', 'a', 'c']);

    openMenu('Tags');
    choose('Move down');
    expect(order(latest())).toEqual(['b', 'tags', 'a', 'c']);
    expect(names()).toEqual(['b', 'Tags', 'a', 'c']);
  });

  it('the first row cannot move up and the last cannot move down: those items are disabled and write nothing', () => {
    const { onLines } = setup(START);

    openMenu('Tags');
    expect(item('Move up')).toHaveAttribute('aria-disabled', 'true');
    expect(item('Move down')).not.toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item('Move up'));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });

    openMenu('c');
    expect(item('Move down')).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(item('Move down'));

    expect(onLines).not.toHaveBeenCalled();
  });

  it('is not in the menu of an archived note', () => {
    setup(START, { status: 'archived' });

    // An archived note has no actions at all (no menu button on its rows).
    expect(screen.queryByRole('button', { name: 'a actions' })).toBeNull();
  });
});

describe('a reordered list keeps its identity and persists', () => {
  it('a row is the same element after it moves — rows are keyed by the property, not their position', () => {
    setup(START);
    const before = rowOf('b');

    fireEvent.click(screen.getByRole('button', { name: 'b actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));

    expect(rowOf('b')).toBe(before);
    expect(names()).toEqual(['Tags', 'b', 'a', 'c']);
  });

  it('reopening the note with the written lines shows the same order', () => {
    const { latest } = setup(START);

    fireEvent.click(screen.getByRole('button', { name: 'c actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    const written = latest();
    cleanup();

    render(<PropertiesHarness initial={written.lines} initialOrder={written.order} />);

    expect(names()).toEqual(['Tags', 'a', 'c', 'b']);
  });

  it('a reorder moves the entries in the file and writes nothing else', () => {
    const { latest } = setup(START);

    fireEvent.click(screen.getByRole('button', { name: 'c actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));

    expect(latest().order).toEqual(['id', 'tags', 'a', 'c', 'b']);
    expect(latest().lines).toEqual(['a: 1', 'c: 3', 'b: 2']);
    expect(order(latest())).toEqual(['tags', 'a', 'c', 'b']);
  });

});
