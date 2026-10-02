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
const rowIcons = () => document.querySelectorAll('.property-list__add-row .property__icon').length;
const menu = () => screen.queryByRole('menu', { name: 'Add properties' });
const start = () => fireEvent.click(screen.getByText('Add a property'));
const rowMarkup = () => document.querySelector('.property-list__add-row')!.outerHTML;

describe('AddPropertyRow — at rest', () => {
  it('is the row "+ Add a property", with a plus icon and no menu or input', () => {
    setup();

    expect(rowText()).toEqual(['Add a property']);
    expect(rowIcons()).toBe(1);
    expect(menu()).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('AddPropertyRow — clicking it', () => {
  it('opens the Add properties menu and leaves the row exactly as it was', () => {
    setup();
    const before = rowMarkup();

    start();

    expect(menu()).toBeInTheDocument();
    // Not replaced, relabelled or re-iconed: the very same row.
    expect(rowText()).toEqual(['Add a property']);
    expect(rowMarkup()).toBe(before);
    expect(rowIcons()).toBe(1);
  });

  it('creates no blank or draft row and no input, and focuses none', () => {
    setup();

    start();

    expect(document.querySelectorAll('.property-list__add-row')).toHaveLength(1);
    expect(screen.queryByText('New property')).toBeNull();
    expect(document.querySelectorAll('.editable-text')).toHaveLength(0);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('opens the existing Add properties menu: system, hidden and new types', () => {
    setup();

    start();

    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
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
  ])('%s shows it by its canonical key and closes the menu', (_label, item, key) => {
    const { onShowProperty, onAddCustomProperty } = setup();
    const before = rowMarkup();

    start();
    fireEvent.click(screen.getByRole('menuitem', { name: item }));

    expect(onShowProperty).toHaveBeenCalledExactlyOnceWith(key);
    expect(onAddCustomProperty).not.toHaveBeenCalled();
    expect(menu()).toBeNull();
    expect(rowMarkup()).toBe(before);
  });

  it.each(['Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select'])(
    'a new %s type starts the draft (the host adds it) and the menu closes',
    (label) => {
      const { onShowProperty, onAddCustomProperty } = setup();
      const before = rowMarkup();

      start();
      fireEvent.click(screen.getByRole('menuitem', { name: label }));

      expect(onAddCustomProperty).toHaveBeenCalledOnce();
      expect(onShowProperty).not.toHaveBeenCalled();
      expect(menu()).toBeNull();
      // The row itself is untouched; it is the host's draft row that appears.
      expect(rowMarkup()).toBe(before);
    }
  );
});

describe('AddPropertyRow — dismissing without a choice', () => {
  it.each([
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['a click outside the menu', () => fireEvent.click(document.querySelector('.overlay__backdrop')!)],
  ])('%s closes the menu and changes nothing', (_label, dismiss) => {
    const { onShowProperty, onAddCustomProperty } = setup();
    const before = rowMarkup();

    start();
    dismiss();

    expect(menu()).toBeNull();
    expect(rowMarkup()).toBe(before);
    expect(onShowProperty).not.toHaveBeenCalled();
    expect(onAddCustomProperty).not.toHaveBeenCalled();
  });

  it('can be opened again afterwards', () => {
    setup();

    start();
    fireEvent.keyDown(document, { key: 'Escape' });
    start();

    expect(menu()).toBeInTheDocument();
    expect(rowText()).toEqual(['Add a property']);
  });
});
