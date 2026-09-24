// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CollectionViewMenu } from './CollectionViewMenu';
import {
  DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  DEFAULT_COLLECTION_SORT,
  type CollectionPropertyVisibility,
  type CollectionSortState,
} from './CollectionBody';

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

afterEach(() => {
  cleanup();
});

function renderMenu(
  overrides: {
    viewMode?: 'list' | 'table';
    properties?: CollectionPropertyVisibility;
    sort?: CollectionSortState;
  } = {}
) {
  const onChange = vi.fn();
  const onPropertiesChange = vi.fn();
  const onSortChange = vi.fn();
  const utils = render(
    <CollectionViewMenu
      viewMode={overrides.viewMode ?? 'list'}
      onChange={onChange}
      properties={overrides.properties ?? DEFAULT_COLLECTION_PROPERTY_VISIBILITY}
      onPropertiesChange={onPropertiesChange}
      sort={overrides.sort ?? DEFAULT_COLLECTION_SORT}
      onSortChange={onSortChange}
    />
  );
  const trigger = utils.container.querySelector('[aria-haspopup="menu"]');
  fireEvent.click(trigger!);
  return { ...utils, onChange, onPropertiesChange, onSortChange };
}

describe('CollectionViewMenu', () => {
  it('shows Layout (List/Table) and Properties (Description/Last opened/Created/Updated) sections', () => {
    const { getByText, getAllByText } = renderMenu();

    expect(getByText('Layout')).toBeInTheDocument();
    expect(getByText('List')).toBeInTheDocument();
    expect(getByText('Table')).toBeInTheDocument();
    expect(getByText('Properties')).toBeInTheDocument();
    expect(getByText('Description')).toBeInTheDocument();
    // "Last opened"/"Created"/"Updated" also appear in Sort by — Properties
    // renders first, so its own occurrence is always index 0.
    expect(getAllByText('Last opened')[0]).toBeInTheDocument();
    expect(getAllByText('Created')[0]).toBeInTheDocument();
    expect(getAllByText('Updated')[0]).toBeInTheDocument();
  });

  it('selecting Table calls onChange and closes the menu', () => {
    const { getByText, onChange, queryByText } = renderMenu();

    fireEvent.click(getByText('Table'));

    expect(onChange).toHaveBeenCalledWith('table');
    expect(queryByText('Layout')).not.toBeInTheDocument();
  });

  it('toggling a property calls onPropertiesChange with only that key flipped, and keeps the menu open', () => {
    const { getByText, onPropertiesChange } = renderMenu();

    fireEvent.click(getByText('Description'));

    expect(onPropertiesChange).toHaveBeenCalledWith({
      ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
      description: false,
    });
    // Still open — Properties is a set of independent toggles, not a
    // single mutually-exclusive choice like Layout.
    expect(getByText('Layout')).toBeInTheDocument();
  });

  it('shows a tick icon for a checked property and an empty, same-sized indicator for an unchecked one', () => {
    const { getByText, getAllByText } = renderMenu({
      properties: { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, lastOpened: false },
    });

    const descriptionRow = getByText('Description').closest('.entry')!;
    // Properties' own "Last opened" is the first occurrence (Sort by's
    // comes later in the DOM).
    const lastOpenedRow = getAllByText('Last opened')[0]!.closest('.entry')!;

    expect(
      descriptionRow.querySelector('.entry__leading svg')
    ).toBeInTheDocument();
    expect(
      lastOpenedRow.querySelector('.entry__leading svg')
    ).not.toBeInTheDocument();
    // Both rows still get the same fixed-width leading wrapper, checked
    // or not — this is what keeps the label from shifting on toggle.
    expect(descriptionRow.querySelector('.entry__leading')).toBeInTheDocument();
    expect(lastOpenedRow.querySelector('.entry__leading')).toBeInTheDocument();
  });

  it('clicking anywhere on a Properties row (not just the indicator) toggles exactly once', () => {
    const { getAllByText, onPropertiesChange } = renderMenu();

    // Properties' own "Created" is the first occurrence in the DOM.
    fireEvent.click(getAllByText('Created')[0]!);

    expect(onPropertiesChange).toHaveBeenCalledTimes(1);
    expect(onPropertiesChange).toHaveBeenCalledWith({
      ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
      created: false,
    });
  });
});

describe('CollectionViewMenu — Sort by', () => {
  it('shows the Sort by section with Name/Last opened/Created/Updated, reusing the Properties labels verbatim', () => {
    const { getByText, getAllByText } = renderMenu();

    expect(getByText('Sort by')).toBeInTheDocument();
    expect(getByText('Name')).toBeInTheDocument();
    expect(getAllByText('Last opened')).toHaveLength(2);
    expect(getAllByText('Created')).toHaveLength(2);
    expect(getAllByText('Updated')).toHaveLength(2);
  });

  it('Name is selected by default, with a down arrow, and no other row shows an arrow', () => {
    const { getByText } = renderMenu();

    const nameRow = getByText('Name').closest('.entry')!;
    expect(nameRow.querySelector('.entry__leading svg')).toBeInTheDocument();
    expect(nameRow.querySelector('.entry__trailing svg')).toBeInTheDocument();

    // Exactly one row in the whole menu has a trailing arrow — Name, the
    // only active Sort-by option (Layout/Properties rows never get one).
    // Overlay portals the menu to document.body, outside RTL's own
    // `container`, so search the document instead.
    expect(document.body.querySelectorAll('.entry__trailing svg')).toHaveLength(1);
  });

  it('selecting a different sort key activates it with the default (down) direction, and does not close the menu', () => {
    const { getByText, getAllByText, onSortChange } = renderMenu();

    // Sort by's own "Updated" is the second (later) occurrence.
    fireEvent.click(getAllByText('Updated')[1]!);

    expect(onSortChange).toHaveBeenCalledWith({ key: 'updated', direction: 'down' });
    expect(getByText('Sort by')).toBeInTheDocument();
  });

  it('clicking the already-active sort option flips its direction: down to up', () => {
    const { getByText, onSortChange } = renderMenu({
      sort: { key: 'created', direction: 'down' },
    });

    // Created is active here and unique enough via its row's tick+arrow,
    // but the label itself is still duplicated with Properties — use the
    // row that actually has a trailing arrow to find the right one.
    const activeCreatedRow = getByText('Sort by')
      .closest('.menu')!
      .querySelectorAll('.entry__trailing svg')[0]!.closest('.entry')!;

    fireEvent.click(activeCreatedRow);

    expect(onSortChange).toHaveBeenCalledWith({ key: 'created', direction: 'up' });
  });

  it('clicking the already-active option a second time flips back: up to down', () => {
    const { onSortChange } = renderMenu({
      sort: { key: 'name', direction: 'up' },
    });

    const nameRow = document.body.querySelector('.entry__trailing svg')!.closest('.entry')!;
    fireEvent.click(nameRow);

    expect(onSortChange).toHaveBeenCalledWith({ key: 'name', direction: 'down' });
  });
});
