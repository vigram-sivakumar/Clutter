// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CollectionCard } from '../components/card/CollectionCard';
import { CollectionEntry } from '../components/entry/CollectionEntry';
import type { CollectionItemSelection } from '../components/entry/CollectionSelectionCheckbox';
import { CollectionDataList } from '../components/list/CollectionDataList';
import { CollectionDataTable } from '../components/table/CollectionDataTable';
import { useCollectionSelection } from './useCollectionSelection';

afterEach(cleanup);

const COMPONENTS = join(__dirname, '..', 'components');
const css = (path: string) => readFileSync(join(COMPONENTS, path), 'utf8');

const IDS = ['a', 'b'];
const COLUMNS = [{ id: 'name', label: 'Name', width: '1fr' }] as never;
const onOpen = vi.fn();

/** Each layout, driven by the real selection hook the collection bodies use. */
function List({ ids = IDS }: { ids?: string[] }) {
  const { selectionFor } = useCollectionSelection(ids);
  return (
    <CollectionDataList
      items={ids.map((id) => ({ id, icon: 'note', title: `Note ${id}`, onClick: onOpen, selection: selectionFor(id, `Note ${id}`) }))}
    />
  );
}
function Table() {
  const { selectionFor } = useCollectionSelection(IDS);
  return (
    <CollectionDataTable
      columns={COLUMNS}
      rows={IDS.map((id) => ({
        id,
        cells: { name: { variant: 'header', icon: 'note', title: `Note ${id}` } },
        onClick: onOpen,
        selection: selectionFor(id, `Note ${id}`),
      }))}
    />
  );
}
function Folders() {
  const { selectionFor } = useCollectionSelection(IDS);
  return (
    <>
      {IDS.map((id) => (
        <CollectionEntry
          key={id}
          layout="cell"
          className="collection-entry--folder-card"
          leading={<span>icon</span>}
          title={`Folder ${id}`}
          onClick={onOpen}
          selection={selectionFor(id, `Folder ${id}`)}
        />
      ))}
    </>
  );
}
function Cards() {
  const { selectionFor } = useCollectionSelection(IDS);
  return (
    <>
      {IDS.map((id) => (
        <CollectionCard key={id} header={`Card ${id}`} onClick={onOpen} selection={selectionFor(id, `Card ${id}`)} />
      ))}
    </>
  );
}

const boxes = () => screen.getAllByRole('checkbox', { hidden: true });

describe.each([
  ['list rows', List, '.collection-entry'],
  ['table rows', Table, '.collection-entry'],
  ['folder cards', Folders, '.collection-entry'],
  ['note and asset cards', Cards, '.collection-card'],
] as const)('selecting %s', (_name, Layout, itemSelector) => {
  it('checks and unchecks one item, leaving the others as they are, without opening it', () => {
    onOpen.mockClear();
    const { container } = render(<Layout />);
    const [first, second] = boxes();

    expect(first).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(first!);
    expect(first).toHaveAttribute('aria-checked', 'true');
    expect(second).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(second!);
    expect(boxes().map((box) => box.getAttribute('aria-checked'))).toEqual(['true', 'true']);

    fireEvent.click(first!);
    expect(boxes().map((box) => box.getAttribute('aria-checked'))).toEqual(['false', 'true']);

    expect(onOpen).not.toHaveBeenCalled();
    expect(container.querySelectorAll(`${itemSelector}--checked`)).toHaveLength(1);
  });

  it('names each checkbox after its item', () => {
    render(<Layout />);

    expect(boxes().map((box) => box.getAttribute('aria-label'))).toEqual([expect.stringMatching(/^Select .+ a$/), expect.stringMatching(/^Select .+ b$/)]);
  });

  it('still opens the item when anything but the checkbox is clicked', () => {
    onOpen.mockClear();
    const { container } = render(<Layout />);

    fireEvent.click(container.querySelector(itemSelector.startsWith('.collection-card') ? '.collection-card' : '[role="button"]')!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
}
const itemsOf = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>('[role="button"]')];
const states = () => boxes().map((box) => box.getAttribute('aria-checked'));

describe.each([
  ['list rows', List, '.collection-entry'],
  ['table rows', Table, '.collection-entry'],
  ['folder cards', Folders, '.collection-entry'],
  ['note and asset cards', Cards, '.collection-card'],
] as const)('clicking an item in selection mode, in %s', (_name, Layout, itemSelector) => {
  afterEach(() => setPlatform(''));

  it('toggles the clicked item with a plain click — leaving the others, never opening it — and leaves the mode with the last', () => {
    onOpen.mockClear();
    const { container } = render(<Layout />);
    const [first, second] = itemsOf(container);
    fireEvent.click(boxes()[0]!);

    fireEvent.click(second!);
    expect(states()).toEqual(['true', 'true']);

    fireEvent.click(first!);
    expect(states()).toEqual(['false', 'true']);

    fireEvent.click(second!);
    expect(states()).toEqual(['false', 'false']);
    expect(container.querySelectorAll(`${itemSelector}--selecting`)).toHaveLength(0);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('toggles once — not twice — for a Cmd or Ctrl click, on either platform', () => {
    for (const [platform, modifier] of [['MacIntel', { metaKey: true }], ['Win32', { ctrlKey: true }]] as const) {
      setPlatform(platform);
      onOpen.mockClear();
      const { container, unmount } = render(<Layout />);
      const [, second] = itemsOf(container);
      fireEvent.click(boxes()[0]!);

      fireEvent.click(second!, modifier);
      expect(states()).toEqual(['true', 'true']);
      expect(onOpen).not.toHaveBeenCalled();
      unmount();
    }
  });

  it('opens the item on every click when nothing is selected, modifier or not, and again once the selection is emptied', () => {
    setPlatform('Win32');
    onOpen.mockClear();
    const { container } = render(<Layout />);
    const [first, second] = itemsOf(container);

    fireEvent.click(first!);
    fireEvent.click(second!, { ctrlKey: true });
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(states()).toEqual(['false', 'false']);

    fireEvent.click(boxes()[0]!);
    fireEvent.click(first!); // unchecks the last one
    onOpen.mockClear();
    fireEvent.click(second!);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

const onControl = vi.fn();
const Control = () => <button data-testid="control" onClick={onControl}>control</button>;

/** Each layout with a control inside every item (a cover thumbnail, a link-like button). */
const WITH_CONTROL = {
  'list rows': (selectionFor: (id: string, label: string) => CollectionItemSelection) => (
    <CollectionDataList items={IDS.map((id) => ({ id, icon: 'note' as const, title: id, onClick: onOpen, trailing: <Control />, selection: selectionFor(id, id) }))} />
  ),
  'table rows': (selectionFor: (id: string, label: string) => CollectionItemSelection) => (
    <CollectionDataTable
      columns={[...(COLUMNS as never[]), { id: 'extra', label: 'Extra', width: '1fr' } as never]}
      rows={IDS.map((id) => ({
        id,
        cells: { name: { variant: 'header' as const, icon: 'note' as const, title: id }, extra: { variant: 'custom' as const, children: <Control /> } },
        onClick: onOpen,
        selection: selectionFor(id, id),
      }))}
    />
  ),
  'folder cards': (selectionFor: (id: string, label: string) => CollectionItemSelection) => (
    <>
      {IDS.map((id) => (
        <CollectionEntry key={id} layout="cell" className="collection-entry--folder-card" leading={<span />} title={id} description={<Control />} onClick={onOpen} selection={selectionFor(id, id)} />
      ))}
    </>
  ),
  'note and asset cards': (selectionFor: (id: string, label: string) => CollectionItemSelection) => (
    <>
      {IDS.map((id) => (
        <CollectionCard key={id} header={<Control />} onClick={onOpen} selection={selectionFor(id, id)} />
      ))}
    </>
  ),
};

describe.each(Object.keys(WITH_CONTROL))('a control inside an item, in %s', (name) => {
  function Body() {
    const { selectionFor } = useCollectionSelection(IDS);
    return <>{WITH_CONTROL[name as keyof typeof WITH_CONTROL](selectionFor)}</>;
  }

  it('keeps its own action when nothing is selected — and opens nothing', () => {
    onControl.mockClear();
    onOpen.mockClear();
    render(<Body />);

    fireEvent.click(screen.getAllByTestId('control')[0]!);

    expect(onControl).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
    expect(states()).toEqual(['false', 'false']);
  });

  it('in selection mode a click on it selects the item instead — the control does nothing, and nothing opens', () => {
    onControl.mockClear();
    onOpen.mockClear();
    render(<Body />);
    fireEvent.click(boxes()[0]!);

    fireEvent.click(screen.getAllByTestId('control')[1]!);
    expect(states()).toEqual(['true', 'true']);
    fireEvent.click(screen.getAllByTestId('control')[1]!);
    expect(states()).toEqual(['true', 'false']);

    expect(onControl).not.toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('leaves the item’s own checkbox to toggle exactly once', () => {
    render(<Body />);
    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[1]!);
    expect(states()).toEqual(['true', 'true']);
    fireEvent.click(boxes()[1]!);
    expect(states()).toEqual(['true', 'false']);
  });
});

describe('a table row in selection mode', () => {
  it('is marked `--selecting` (what hides its empty cover) only while some item is checked', () => {
    const { container } = render(<Table />);
    expect(container.querySelectorAll('.collection-table-row--selecting')).toHaveLength(0);

    fireEvent.click(boxes()[0]!);
    expect(container.querySelectorAll('.collection-table-row--selecting')).toHaveLength(2);

    fireEvent.click(boxes()[0]!);
    expect(container.querySelectorAll('.collection-table-row--selecting')).toHaveLength(0);
  });
});

describe('selected styling', () => {
  it('gives a checked list row the selection background, hover included (CSS contract)', () => {
    const rules = css('entry/CollectionEntry.css');

    expect(rules).toMatch(
      /\.collection-entry--layout-list\.collection-entry--checked,\s*\.collection-entry--layout-list\.collection-entry--checked:is\(:hover, \[data-context-menu-open='true'\]\)\s*\{\s*background: var\(--surface-selected\);/
    );
    // The same token a checked table row uses.
    expect(css('table/CollectionTableRow.css')).toMatch(/collection-table-row--selected[^{]*\{\s*background: var\(--surface-selected\);/);
  });

  it('highlights a checked list or table row whole, with the existing selected row background', () => {
    const { container, unmount } = render(<Table />);
    fireEvent.click(boxes()[0]!);
    expect(container.querySelectorAll('.collection-table-row--selected')).toHaveLength(1);
    unmount();

    const list = render(<List />);
    fireEvent.click(boxes()[0]!);
    expect(list.container.querySelectorAll('.collection-entry--selected')).toHaveLength(1);
  });

  it('swaps the icon for the checkbox on hover or focus, and keeps the checkbox while checked (CSS contract)', () => {
    const rules = css('entry/CollectionEntry.css');

    expect(rules).toMatch(/\.collection-entry--layout-list:is\(:hover, :focus-within\) \.collection-entry__leading-hover[^{]*\{\s*visibility: visible;/);
    expect(rules).toMatch(/:is\(:hover, :focus-within\) > \.collection-entry--layout-cell \.collection-entry__leading-hover[^{]*\{\s*visibility: visible;/);
    expect(rules).toMatch(/\.collection-entry--checked \.collection-entry__leading-rest[^{]*\{\s*visibility: hidden;/);
    expect(rules).toMatch(/\.collection-entry--checked \.collection-entry__leading-hover[^{]*\{\s*visibility: visible;/);
  });

  it('fills the unchecked checkbox circle itself, with no box around it (CSS contract)', () => {
    const rules = css('entry/CollectionEntry.css');

    expect(rules).toMatch(/\.collection-entry__selection-checkbox \[aria-checked='false'\] circle\s*\{\s*fill: var\(--surface-primary\);/);
    expect(rules.match(/\.collection-entry__selection-checkbox\s*\{[^}]*\}/)![0]).not.toMatch(/background|border|box-shadow|filter/);
  });

  it('marks a checked folder card and a checked card with the selection border, without changing their size (CSS contract)', () => {
    const entry = css('entry/CollectionEntry.css');
    const card = css('card/CollectionCard.css');

    expect(entry).toMatch(/\.collection-entry--folder-card\.collection-entry--checked\s*\{\s*box-shadow: inset 0 0 0 2px var\(--border-active\);/);
    expect(card).toMatch(/\.collection-card--checked,[^{]*\{[^}]*outline: 2px solid var\(--border-active\);\s*outline-offset: -2px;/);
  });

  it('draws the card checkbox out of flow in the top-right, on hover or focus, and while checked (CSS contract)', () => {
    const rules = css('card/CollectionCard.css');

    expect(rules).toMatch(/\.collection-card__selection\s*\{[^}]*position: absolute;[^}]*top: var\(--space-8\);[^}]*right: var\(--space-8\);[^}]*display: none;/);
    expect(rules).toMatch(/:is\(:hover, :focus-within[^)]*\) > \.collection-card__selection,\s*\.collection-card--checked > \.collection-card__selection,\s*\.collection-card--selecting > \.collection-card__selection\s*\{\s*display: flex;/);
    expect(rules.match(/\.collection-card__selection\s*\{[^}]*\}/)![0]).not.toMatch(/background|border|box-shadow|filter/);
  });
});

describe.each([
  ['list rows', List, '.collection-entry'],
  ['table rows', Table, '.collection-entry'],
  ['folder cards', Folders, '.collection-entry'],
  ['note and asset cards', Cards, '.collection-card'],
] as const)('selection mode in %s', (_name, Layout, itemSelector) => {
  const mode = (container: HTMLElement) => container.querySelectorAll(`${itemSelector}--selecting`).length;

  it('is off until an item is checked, on for every item while any is checked, and off again after the last is unchecked', () => {
    const { container } = render(<Layout />);
    const [first, second] = boxes();

    expect(mode(container)).toBe(0);

    fireEvent.click(first!);
    expect(mode(container)).toBe(2);
    expect(container.querySelectorAll(`${itemSelector}--checked`)).toHaveLength(1);
    // The other item is in the mode, but unchecked and unstyled as selected.
    expect(second).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(second!);
    fireEvent.click(first!);
    expect(mode(container)).toBe(2);

    fireEvent.click(second!);
    expect(mode(container)).toBe(0);
    expect(container.querySelectorAll(`${itemSelector}--checked`)).toHaveLength(0);
  });

  it('gives only checked items the selected styling', () => {
    const { container } = render(<Layout />);
    fireEvent.click(boxes()[0]!);

    const selectedRows = container.querySelectorAll('.collection-table-row--selected, .collection-entry--selected');
    expect(selectedRows.length).toBeLessThanOrEqual(1);
    expect(container.querySelectorAll(`${itemSelector}--checked`)).toHaveLength(1);
  });
});

describe('selection mode styling (CSS contract)', () => {
  it('shows every entry and card checkbox in selection mode, without moving anything', () => {
    const entry = css('entry/CollectionEntry.css');
    const card = css('card/CollectionCard.css');

    expect(entry).toMatch(/\.collection-entry--selecting \.collection-entry__leading-rest[^{]*\{\s*visibility: hidden;/);
    expect(entry).toMatch(/\.collection-entry--selecting \.collection-entry__leading-hover[^{]*\{\s*visibility: visible;/);
    expect(card).toMatch(/\.collection-card--selecting > \.collection-card__selection\s*\{\s*display: flex;/);
    // The mode only shows checkboxes: it adds no fill, border or outline of its own.
    expect(entry + card).not.toMatch(/--selecting[^{]*\{[^}]*(background|border|outline|box-shadow)/);
  });
});

describe('items without a selection', () => {
  it('draw no checkbox', () => {
    render(<CollectionDataList items={[{ id: 'a', icon: 'note', title: 'Plan' }]} />);
    render(<CollectionCard header="Card" />);

    expect(screen.queryAllByRole('checkbox', { hidden: true })).toHaveLength(0);
  });

  it('swap with a custom leading too (an asset’s thumbnail), stacked in the same box so nothing shifts', () => {
    const selection = { id: 'a', checked: false, active: false, onToggle: vi.fn(), label: 'Select Photo' };
    const { container } = render(
      <>
        <CollectionDataList items={[{ id: 'a', leading: <img alt="" data-testid="thumb" />, title: 'Photo', selection }]} />
        <CollectionDataTable
          columns={COLUMNS}
          rows={[{ id: 'a', cells: { name: { variant: 'header', leading: <img alt="" data-testid="thumb-row" />, title: 'Photo' } }, selection }]}
        />
      </>
    );

    expect(screen.queryAllByRole('checkbox', { hidden: true })).toHaveLength(2);
    for (const leading of container.querySelectorAll('.collection-entry__leading')) {
      expect(leading).toHaveClass('collection-entry__leading--swap');
      expect(leading.querySelector('.collection-entry__leading-rest img')).not.toBeNull();
      expect(leading.querySelector('.collection-entry__leading-hover .checkbox')).not.toBeNull();
    }
    // One grid cell for both, hidden by visibility (never display), so the box keeps the thumbnail's size.
    const css = readFileSync(join(COMPONENTS, 'entry/CollectionEntry.css'), 'utf8');
    expect(css).toMatch(/\.collection-entry__leading-rest,\s*\.collection-entry__leading-hover\s*\{\s*grid-area: 1 \/ 1;/);
    expect(css).toMatch(/\.collection-entry__leading--swap\s*\{\s*display: grid;/);
    expect(css).toMatch(/\.collection-entry__leading-hover\s*\{\s*visibility: hidden;/);
  });
});

describe('useCollectionSelection', () => {
  it('drops a checked id once the body no longer shows it', () => {
    const { rerender } = render(<List ids={['a', 'b']} />);
    fireEvent.click(boxes()[0]!);

    rerender(<List ids={['b']} />);
    rerender(<List ids={['a', 'b']} />);

    expect(boxes().map((box) => box.getAttribute('aria-checked'))).toEqual(['false', 'false']);
  });
});
