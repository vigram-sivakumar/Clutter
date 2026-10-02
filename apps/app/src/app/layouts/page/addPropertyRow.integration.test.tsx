// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@components/property-list/PropertyList';
import {
  addCustomProperty,
  emptyCustomProperty,
  readCustomProperties,
} from '@core/vault/ingest/frontmatter/customFrontmatter';
import { addVisibleProperty, readVisibleProperties } from '@core/vault/ingest/frontmatter/propertyVisibility';
import type { Page } from '@core/vault/models/Page';
import { AppIcon } from '@shared/icon';

import { AddPropertyRow } from './AddPropertyRow';
import { getAddableProperties } from './addableProperties';
import { buildPageProperties } from './buildPageProperties';
import { useCustomPropertyDrafts } from './useCustomPropertyDrafts';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

afterEach(() => cleanup());

function pageWith(lines: readonly string[]): Page {
  return {
    id: 'p1',
    type: 'note',
    name: 'x',
    path: '/v/x.md',
    parentId: null,
    metadata: {
      status: 'active',
      tags: [],
      aliases: [],
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z',
      unownedFrontmatter: lines,
    },
  } as unknown as Page;
}

/**
 * The real list, "+ Add properties" row, draft hook and adapter, wired the
 * way PageHost wires them; the writes apply the same pure frontmatter
 * changes PageOperations makes.
 */
function Harness({
  initial = ['Due date: 2026-10-01', 'priority: high'],
  onLines,
}: {
  initial?: readonly string[];
  onLines(lines: readonly string[]): void;
}) {
  const [lines, setLines] = useState<readonly string[]>(initial);
  const drafts = useCustomPropertyDrafts('p1');
  const page = pageWith(lines);
  const addable = getAddableProperties(page);
  const items = buildPageProperties(page, {
    drafts: {
      items: drafts.drafts,
      onName: (id, name) => {
        const draft = drafts.drafts.find((candidate) => candidate.id === id)!;
        const next = addVisibleProperty(addCustomProperty(lines, name, emptyCustomProperty(draft.type)), name);
        setLines(next);
        onLines(next);
        drafts.remove(id);
      },
      onAbandon: drafts.remove,
    },
  });
  const addRow = drafts.drafts.some((draft) => draft.name === undefined) ? undefined : (
    <AddPropertyRow
      systemProperties={addable.systemProperties}
      hiddenProperties={addable.hiddenProperties}
      onShowProperty={(key) => {
        const next = addVisibleProperty(lines, key);
        setLines(next);
        onLines(next);
      }}
      onAddCustomProperty={drafts.add}
    />
  );

  return <PropertyList items={items} footer={addRow} />;
}

const rows = () =>
  [...document.querySelectorAll('.property-list__row')].map((row) => row.querySelector('.property-list__name')?.textContent);
const nameField = () =>
  document.querySelector('.property-list__name .editable-text[data-placeholder]') as HTMLDivElement | null;
const svgOf = (element: Element | null) => element?.querySelector('svg')?.outerHTML;
const iconMarkup = (icon: 'calendar' | 'plus') => render(<AppIcon icon={icon} />).container.querySelector('svg')!.outerHTML;

const start = () => fireEvent.click(screen.getByText('Add properties'));

describe('the "+ Add properties" row — the whole interaction', () => {
  it('starts as the row "+ Add properties", even when nothing is shown yet', () => {
    render(<Harness onLines={vi.fn()} />);

    expect(rows()).toEqual(['Add properties']);
  });

  it('click → a blank "New property" row with no icon, the menu open, and nothing focused', () => {
    render(<Harness onLines={vi.fn()} />);

    start();

    expect(rows()).toEqual(['New property']);
    const blank = document.querySelector('.property-list__add-row')!;
    // No icon shown — but the slot is reserved, so the name doesn't shift.
    expect(blank.querySelector('.property__icon:not(.property__icon--reserved)')).toBeNull();
    expect(blank.querySelectorAll('.entry__leading .property__icon--reserved')).toHaveLength(1);
    expect(screen.getByRole('menu', { name: 'Add properties' })).toBeInTheDocument();
    expect(nameField()).toBeNull();
    expect(blank.contains(document.activeElement)).toBe(false);
  });

  it('selecting a new type → a draft row with that type’s icon and a focused "Property name" field', () => {
    const onLines = vi.fn();
    render(<Harness onLines={onLines} />);

    start();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Date' }));

    // The blank row and the + row are gone; the draft row stands in their place.
    expect(rows()).toEqual(['']);
    const field = nameField()!;
    expect(field.getAttribute('data-placeholder')).toBe('Property name');
    expect(document.activeElement).toBe(field);
    // The type's icon, not the plus: this is the Date type's (calendar) icon.
    const draftRow = field.closest('.property-list__row')!;
    expect(svgOf(draftRow.querySelector('.property__icon--type'))).toBe(iconMarkup('calendar'));
    // The caret is at the start of the (empty) name, and nothing is written yet.
    const selection = window.getSelection()!;
    expect(selection.isCollapsed).toBe(true);
    expect(selection.anchorOffset).toBe(0);
    expect(onLines).not.toHaveBeenCalled();
  });

  it('the user can type the name straight away; a valid name persists it as a normal row and restores the + row', () => {
    const onLines = vi.fn();
    render(<Harness onLines={onLines} />);

    start();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Date' }));
    const field = nameField()!;
    field.textContent = 'Deadline';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    const lines = onLines.mock.calls[0]![0] as string[];
    expect(lines).toContain('Deadline: # date');
    expect(readVisibleProperties(lines)).toEqual(['Deadline']);
    expect(readCustomProperties(lines).at(-1)).toEqual({ key: 'Deadline', type: 'date', value: null });
    expect(rows()).toEqual(['Deadline', 'Add properties']);
    expect(nameField()).toBeNull();
  });

  it('Escape in the draft row abandons it and restores the + row, writing nothing', () => {
    const onLines = vi.fn();
    render(<Harness onLines={onLines} />);

    start();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text' }));
    fireEvent.keyDown(nameField()!, { key: 'Escape' });

    expect(rows()).toEqual(['Add properties']);
    expect(onLines).not.toHaveBeenCalled();
    expect(document.activeElement?.classList.contains('editable-text')).toBe(false);
  });

  it('selecting an existing property shows it (no name to type) and restores the + row', () => {
    const onLines = vi.fn();
    render(<Harness onLines={onLines} />);

    start();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Due date' }));

    expect(rows()).toEqual(['Due date', 'Add properties']);
    expect(nameField()).toBeNull();
    expect(readVisibleProperties(onLines.mock.calls[0]![0])).toEqual(['Due date']);
    // Shown, not duplicated or rewritten: the original lines are intact.
    expect((onLines.mock.calls[0]![0] as string[]).slice(0, 2)).toEqual(['Due date: 2026-10-01', 'priority: high']);
  });

  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['a click outside', () => fireEvent.click(document.querySelector('.overlay__backdrop')!)],
  ])('dismissing the menu with %s restores the + row and persists nothing', (_label, dismiss) => {
    const onLines = vi.fn();
    render(<Harness onLines={onLines} />);

    start();
    act(() => dismiss());

    expect(rows()).toEqual(['Add properties']);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(nameField()).toBeNull();
    expect(onLines).not.toHaveBeenCalled();
    // The + row shows its plus icon again.
    expect(svgOf(document.querySelector('.property-list__add-row .property__icon'))).toBe(iconMarkup('plus'));
    expect(document.querySelector('.property__icon--reserved')).toBeNull();
  });

  it('the + row follows the shown properties, and a shown property is no longer offered', () => {
    render(<Harness onLines={vi.fn()} />);

    start();
    fireEvent.click(screen.getByRole('menuitem', { name: 'priority' }));
    start();

    expect(rows()).toEqual(['priority', 'New property']);
    expect(screen.queryByRole('menuitem', { name: 'priority' })).toBeNull();
    expect(screen.getByRole('menuitem', { name: 'Due date' })).toBeInTheDocument();
  });
});

describe('PropertyList footer', () => {
  it('renders the footer after the properties, and keeps the list on screen with none', () => {
    const { container, rerender } = render(<PropertyList items={[]} footer={<div className="x">footer</div>} />);
    expect(container.querySelector('.property-list .x')).not.toBeNull();

    rerender(<PropertyList items={[]} />);
    expect(container.querySelector('.property-list')).toBeNull();

    rerender(
      <PropertyList
        items={[{ name: 'Created', type: 'date', value: null, editable: false }]}
        footer={<div className="x">footer</div>}
      />
    );
    const children = [...container.querySelector('.property-list')!.children];
    expect(children.at(-1)?.className).toBe('x');
    expect(children).toHaveLength(2);
  });
});
