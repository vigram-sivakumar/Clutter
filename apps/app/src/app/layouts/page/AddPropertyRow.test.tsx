// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { systemPropertyLabel } from '@core/properties/systemProperties';

import { AddPropertyRow } from './AddPropertyRow';
import type { AddableSystemProperty, HiddenPropertyOption } from './header/AddPropertyMenu';

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

const system: AddableSystemProperty[] = [{ id: 'created', label: systemPropertyLabel('created'), icon: 'calendar' }];
const hidden: HiddenPropertyOption[] = [{ key: 'Due date', type: 'date' }];

function setup() {
  const onShowProperty = vi.fn();
  const onAddCustomProperty = vi.fn();
  render(
    <AddPropertyRow
      systemProperties={system}
      hiddenProperties={hidden}
      onShowProperty={onShowProperty}
      onAddCustomProperty={onAddCustomProperty}
    />
  );
  return { onShowProperty, onAddCustomProperty };
}

const rowText = () => [...document.querySelectorAll('.property-list__add-row')].map((row) => row.textContent);
// Icons that are actually shown: the blank row keeps an invisible one to reserve the slot.
const rowIcons = () =>
  document.querySelectorAll('.property-list__add-row .property__icon:not(.property__icon--reserved)').length;
const reservedSlots = () => document.querySelectorAll('.property-list__add-row .property__icon--reserved').length;
const menu = () => screen.queryByRole('menu', { name: 'Add properties' });
const start = () => fireEvent.click(screen.getByText('Add properties'));

describe('AddPropertyRow — at rest', () => {
  it('is the row "+ Add properties", with a plus icon and no menu or input', () => {
    setup();

    expect(rowText()).toEqual(['Add properties']);
    expect(rowIcons()).toBe(1);
    expect(menu()).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('AddPropertyRow — clicking it', () => {
  it('swaps the row for a blank "New property" row with no icon, and opens the Add properties menu at once', () => {
    setup();

    start();

    expect(rowText()).toEqual(['New property']);
    // No icon shown on the blank row — but its slot is kept, so the text
    // starts where it did at rest — and no "+ Add properties" row any more.
    expect(rowIcons()).toBe(0);
    expect(reservedSlots()).toBe(1);
    expect(screen.queryByText('Add properties')).toBeNull();
    expect(menu()).toBeInTheDocument();
  });

  it('does not focus a name input: there is none, and nothing in the row holds focus', () => {
    setup();

    start();

    expect(document.querySelectorAll('.property-list__add-row .editable-text')).toHaveLength(0);
    expect(document.querySelector('.property-list__add-row')!.contains(document.activeElement)).toBe(false);
    expect(screen.queryByRole('textbox', { name: /name/i })).toBeNull();
  });

  it('opens the existing Add properties menu: system, hidden and new types', () => {
    setup();

    start();

    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.getByText('New properties')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Created',
      'Due date',
      'Text',
      'Date',
      'URL',
      'Number',
      'Boolean',
      'Multi-select',
    ]);
  });
});

describe('AddPropertyRow — choosing', () => {
  it.each([
    ['a system property', 'Created', 'created'],
    ['a hidden custom property', 'Due date', 'Due date'],
  ])('%s shows it by its canonical key, closes the menu and restores the row', (_label, item, key) => {
    const { onShowProperty, onAddCustomProperty } = setup();

    start();
    fireEvent.click(screen.getByRole('menuitem', { name: item }));

    expect(onShowProperty).toHaveBeenCalledExactlyOnceWith(key);
    expect(onAddCustomProperty).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
    expect(rowText()).toEqual(['Add properties']);
  });

  it.each(['Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select'])(
    'a new %s type hands over to the draft row (the host adds it) and the menu closes',
    (label) => {
      const { onShowProperty, onAddCustomProperty } = setup();

      start();
      fireEvent.click(screen.getByRole('menuitem', { name: label }));

      expect(onAddCustomProperty).toHaveBeenCalledOnce();
      expect(onShowProperty).not.toHaveBeenCalled();
      expect(menu()).toBeNull();
      // The blank row is gone: the draft row (host-rendered) replaces it.
      expect(screen.queryByText('New property')).toBeNull();
    }
  );
});

describe('AddPropertyRow — dismissing without a choice', () => {
  it('Escape removes the blank row and restores "+ Add properties", persisting nothing', () => {
    const { onShowProperty, onAddCustomProperty } = setup();

    start();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(menu()).toBeNull();
    expect(rowText()).toEqual(['Add properties']);
    expect(rowIcons()).toBe(1);
    expect(reservedSlots()).toBe(0);
    expect(onShowProperty).not.toHaveBeenCalled();
    expect(onAddCustomProperty).not.toHaveBeenCalled();
  });

  it('a click outside the menu does the same', () => {
    const { onShowProperty, onAddCustomProperty } = setup();

    start();
    fireEvent.click(document.querySelector('.overlay__backdrop')!);

    expect(menu()).toBeNull();
    expect(rowText()).toEqual(['Add properties']);
    expect(onShowProperty).not.toHaveBeenCalled();
    expect(onAddCustomProperty).not.toHaveBeenCalled();
  });

  it('leaves no name input and nothing focused in the row, and can be started again', () => {
    setup();

    start();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.querySelectorAll('.editable-text')).toHaveLength(0);
    expect(document.activeElement?.closest('.property-list__add-row')).toBeNull();

    start();
    expect(menu()).toBeInTheDocument();
    expect(rowText()).toEqual(['New property']);
  });
});
