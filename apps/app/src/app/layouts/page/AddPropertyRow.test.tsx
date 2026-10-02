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
const rowIcons = () => document.querySelectorAll('.property-list__add-row svg').length;
const menu = () => screen.queryByRole('menu', { name: 'Add properties' });
const start = () => fireEvent.click(screen.getByText('Add a property'));
const rowMarkup = () => document.querySelector('.property-list__add-row')!.outerHTML;

describe('AddPropertyRow — at rest', () => {
  it('is the button "+ Add a property", with a plus icon and no menu or input', () => {
    setup();

    expect(rowText()).toEqual(['Add a property']);
    expect(rowIcons()).toBe(1);
    expect(menu()).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('AddPropertyRow — started from the title (autoOpen)', () => {
  it('is an empty property — info icon and "New property", with an empty value field — with the type menu already open', () => {
    render(<AddPropertyRow autoOpen onAddCustomProperty={vi.fn()} />);

    const row = document.querySelector('.property-list__new-row')!;
    expect(row.querySelector('.property-list__name')!.textContent).toBe('New property');
    const value = row.querySelector('.property-list__value input, .property-list__value textarea')!;
    expect(value.hasAttribute('placeholder')).toBe(false);
    expect(document.querySelector('.property-list__add-row')).toBeNull();
    expect(menu()).toBeInTheDocument();
  });

  it('dismissing the menu reports onDismiss and picking a type reports the choice only', () => {
    const onDismiss = vi.fn();
    const onAddCustomProperty = vi.fn();
    render(<AddPropertyRow autoOpen onDismiss={onDismiss} onAddCustomProperty={onAddCustomProperty} />);

    fireEvent.keyDown(menu()!, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});

describe('AddPropertyRow — clicking it', () => {
  it('opens the Add properties menu on an empty property: info icon and "New property", with an empty value field', () => {
    setup();

    start();

    expect(menu()).toBeInTheDocument();
    const row = document.querySelector('.property-list__new-row')!;
    expect(row.querySelector('.property-list__name')!.textContent).toBe('New property');
    const value = row.querySelector('.property-list__value input, .property-list__value textarea')!;
    expect(value.hasAttribute('placeholder')).toBe(false);
    expect(document.querySelector('.property-list__add-row')).toBeNull();
  });

  it('is inert: its name is a label and its value field takes no typing, and nothing is focused', () => {
    setup();

    start();

    const row = document.querySelector('.property-list__new-row')!;
    expect(document.querySelectorAll('.property-list__row')).toHaveLength(1);
    expect(row.querySelector('.property-list__name .editable-text')).toBeNull();
    expect(row.querySelector('.property-list__value input, .property-list__value textarea')!.hasAttribute('readonly')).toBe(true);
    expect(document.activeElement?.closest('.property-list__new-row')).toBeNull();
  });

  it('opens the existing Add properties menu: the hidden (system and custom) properties under "Hidden", then the new types under "Type"', () => {
    setup();

    start();

    expect(screen.queryByText('Properties')).toBeNull();
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
    // The placeholder row is "+ Add a property" again.
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
    expect(document.querySelector('.property-list__new-row')).not.toBeNull();
  });
});

describe('AddPropertyRow — the menu actions', () => {
  it.each([
    ['Hide Properties', 'onHideProperties'],
    ['Delete all', 'onRemoveAll'],
  ] as const)('%s closes the menu and reports it, adding nothing', (label, prop) => {
    const handler = vi.fn();
    const onAddCustomProperty = vi.fn();
    render(<AddPropertyRow onAddCustomProperty={onAddCustomProperty} {...{ [prop]: handler }} />);

    start();
    fireEvent.click(screen.getByRole('menuitem', { name: label }));

    expect(handler).toHaveBeenCalledOnce();
    expect(menu()).toBeNull();
    expect(onAddCustomProperty).not.toHaveBeenCalled();
  });

  it('offers neither action unless the host supplies it', () => {
    setup();

    start();

    expect(screen.queryByRole('menuitem', { name: 'Hide Properties' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Delete all' })).toBeNull();
  });
});
