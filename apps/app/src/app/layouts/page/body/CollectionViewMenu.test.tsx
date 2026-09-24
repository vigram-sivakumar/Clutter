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

/** Navigates from the root view into the Properties submenu. */
function openPropertiesSubmenu(getByText: (text: string) => HTMLElement) {
  fireEvent.click(getByText('Properties'));
}

describe('CollectionViewMenu — root view', () => {
  it('shows Layout, a Properties trigger row (not its options), and Sort by', () => {
    const { getByText, queryByText } = renderMenu();

    expect(getByText('Layout')).toBeInTheDocument();
    expect(getByText('List')).toBeInTheDocument();
    expect(getByText('Table')).toBeInTheDocument();
    expect(getByText('Properties')).toBeInTheDocument();
    expect(getByText('Sort by')).toBeInTheDocument();
    expect(getByText('Name')).toBeInTheDocument();

    // Properties' own four options are not in the root view at all.
    expect(queryByText('Description')).not.toBeInTheDocument();
  });

  it('the Properties row has a trailing chevron, matching the fenced-code "Change Language" trigger', () => {
    const { getByText } = renderMenu();

    const propertiesRow = getByText('Properties').closest('.entry')!;
    expect(propertiesRow.querySelector('.entry__trailing svg')).toBeInTheDocument();
  });

  it('selecting Table calls onChange and closes the whole menu', () => {
    const { getByText, onChange, queryByText } = renderMenu();

    fireEvent.click(getByText('Table'));

    expect(onChange).toHaveBeenCalledWith('table');
    expect(queryByText('Layout')).not.toBeInTheDocument();
  });

  it('Name is selected by default, with a down arrow, and no other row shows an arrow', () => {
    const { getByText } = renderMenu();

    const nameRow = getByText('Name').closest('.entry')!;
    expect(nameRow.querySelector('.entry__leading svg')).toBeInTheDocument();
    expect(nameRow.querySelector('.entry__trailing svg')).toBeInTheDocument();

    // Only Name's row has a trailing arrow — the Properties trigger row's
    // chevron lives in the same slot but is a distinct, un-conditional
    // affordance, so this counts svgs scoped to Sort by's own rows only.
    const sortByRows = [getByText('Name'), getByText('Last opened'), getByText('Created'), getByText('Updated')];
    const arrows = sortByRows.filter((row) => row.closest('.entry')!.querySelector('.entry__trailing svg'));
    expect(arrows).toHaveLength(1);
  });

  it('selecting a different sort key activates it with the default (down) direction, and does not close the menu', () => {
    const { getByText, onSortChange } = renderMenu();

    fireEvent.click(getByText('Updated'));

    expect(onSortChange).toHaveBeenCalledWith({ key: 'updated', direction: 'down' });
    expect(getByText('Sort by')).toBeInTheDocument();
  });

  it('clicking the already-active sort option flips its direction: down to up', () => {
    const { getByText, onSortChange } = renderMenu({
      sort: { key: 'created', direction: 'down' },
    });

    fireEvent.click(getByText('Created'));

    expect(onSortChange).toHaveBeenCalledWith({ key: 'created', direction: 'up' });
  });

  it('clicking the already-active option a second time flips back: up to down', () => {
    const { getByText, onSortChange } = renderMenu({
      sort: { key: 'name', direction: 'up' },
    });

    fireEvent.click(getByText('Name'));

    expect(onSortChange).toHaveBeenCalledWith({ key: 'name', direction: 'down' });
  });
});

describe('CollectionViewMenu — Properties submenu', () => {
  it('clicking the Properties row replaces the menu content with its four options and a back button', () => {
    const { getByText, queryByText } = renderMenu();

    openPropertiesSubmenu(getByText);

    // The submenu replaces the root content — Layout/Sort by are gone.
    expect(queryByText('Layout')).not.toBeInTheDocument();
    expect(queryByText('Sort by')).not.toBeInTheDocument();

    expect(getByText('Description')).toBeInTheDocument();
    expect(getByText('Last opened')).toBeInTheDocument();
    expect(getByText('Created')).toBeInTheDocument();
    expect(getByText('Updated')).toBeInTheDocument();
    expect(getByText('Properties')).toBeInTheDocument(); // the submenu's own title
  });

  it('shows a tick icon for a checked property and an empty, same-sized indicator for an unchecked one', () => {
    const { getByText } = renderMenu({
      properties: { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, lastOpened: false },
    });
    openPropertiesSubmenu(getByText);

    const descriptionRow = getByText('Description').closest('.entry')!;
    const lastOpenedRow = getByText('Last opened').closest('.entry')!;

    expect(descriptionRow.querySelector('.entry__leading svg')).toBeInTheDocument();
    expect(lastOpenedRow.querySelector('.entry__leading svg')).not.toBeInTheDocument();
    // Both rows still get the same fixed-width leading wrapper, checked
    // or not — this is what keeps the label from shifting on toggle.
    expect(descriptionRow.querySelector('.entry__leading')).toBeInTheDocument();
    expect(lastOpenedRow.querySelector('.entry__leading')).toBeInTheDocument();
  });

  it('toggling a property calls onPropertiesChange with only that key flipped, and keeps the submenu open', () => {
    const { getByText, onPropertiesChange } = renderMenu();
    openPropertiesSubmenu(getByText);

    fireEvent.click(getByText('Description'));

    expect(onPropertiesChange).toHaveBeenCalledTimes(1);
    expect(onPropertiesChange).toHaveBeenCalledWith({
      ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
      description: false,
    });
    // Still on the submenu — Properties is a set of independent toggles,
    // not a single mutually-exclusive choice that closes the menu.
    expect(getByText('Description')).toBeInTheDocument();
  });

  it('clicking the back button returns to the root view, unchanged', () => {
    const { getByText, getByRole, queryByText } = renderMenu();
    openPropertiesSubmenu(getByText);

    fireEvent.click(getByRole('button', { name: 'Back to Configure' }));

    expect(getByText('Layout')).toBeInTheDocument();
    expect(getByText('Sort by')).toBeInTheDocument();
    expect(queryByText('Description')).not.toBeInTheDocument();
  });

  it('reopening the menu after leaving it on the submenu resets to the root view', () => {
    const { getByText, queryByText, container } = renderMenu();
    openPropertiesSubmenu(getByText);

    // Close without navigating back, then reopen.
    const trigger = container.querySelector('[aria-haspopup="menu"]')!;
    fireEvent.click(trigger); // closes (root Button toggles `open`)
    fireEvent.click(trigger); // reopens

    expect(getByText('Layout')).toBeInTheDocument();
    expect(queryByText('Description')).not.toBeInTheDocument();
  });
});
