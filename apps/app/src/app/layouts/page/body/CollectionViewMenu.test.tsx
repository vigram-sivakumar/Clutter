// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CollectionViewMenu } from './CollectionViewMenu';
import { ASSET_COLLECTION_VIEW_CAPABILITIES } from './collectionViewCapabilities';
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
    viewMode?: 'list' | 'table' | 'card';
    properties?: CollectionPropertyVisibility;
    sort?: CollectionSortState;
    showArchived?: boolean;
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
      showArchived={overrides.showArchived}
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
    expect(getByText('Card')).toBeInTheDocument();
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

  it('shows the Properties row in every layout, Card included', () => {
    expect(renderMenu({ viewMode: 'card' }).getByText('Properties')).toBeInTheDocument();
    cleanup();
    expect(renderMenu({ viewMode: 'list' }).getByText('Properties')).toBeInTheDocument();
    cleanup();
    expect(renderMenu({ viewMode: 'table' }).getByText('Properties')).toBeInTheDocument();
  });

  it('selecting Card calls onChange with "card" and closes the whole menu', () => {
    const { getByText, onChange, queryByText } = renderMenu();

    fireEvent.click(getByText('Card'));

    expect(onChange).toHaveBeenCalledWith('card');
    expect(queryByText('Layout')).not.toBeInTheDocument();
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
    const sortByRows = [getByText('Name'), getByText('Created'), getByText('Last edited')];
    const arrows = sortByRows.filter((row) => row.closest('.entry')!.querySelector('.entry__trailing svg'));
    expect(arrows).toHaveLength(1);
  });

  it('selecting a different sort key activates it with the default (down) direction, and does not close the menu', () => {
    const { getByText, onSortChange } = renderMenu();

    fireEvent.click(getByText('Last edited'));

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
    expect(getByText('Created')).toBeInTheDocument();
    expect(getByText('Last edited')).toBeInTheDocument();
    expect(getByText('Properties')).toBeInTheDocument(); // the submenu's own title
  });

  it('shows a tick icon for a checked property and an empty, same-sized indicator for an unchecked one', () => {
    const { getByText } = renderMenu({
      properties: { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, created: false },
    });
    openPropertiesSubmenu(getByText);

    const descriptionRow = getByText('Description').closest('.entry')!;
    const createdRow = getByText('Created').closest('.entry')!;

    expect(descriptionRow.querySelector('.entry__leading svg')).toBeInTheDocument();
    expect(createdRow.querySelector('.entry__leading svg')).not.toBeInTheDocument();
    // Both rows still get the same fixed-width leading wrapper, checked
    // or not — this is what keeps the label from shifting on toggle.
    expect(descriptionRow.querySelector('.entry__leading')).toBeInTheDocument();
    expect(createdRow.querySelector('.entry__leading')).toBeInTheDocument();
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

describe('CollectionViewMenu — Archived (Archive collection only)', () => {
  it('offers no Archived property or sort option by default', () => {
    const { getByText, queryByText } = renderMenu();

    expect(queryByText('Archived')).not.toBeInTheDocument();
    openPropertiesSubmenu(getByText);
    expect(queryByText('Archived')).not.toBeInTheDocument();
  });

  it('offers an Archived sort option when showArchived', () => {
    const { getByText, onSortChange } = renderMenu({ showArchived: true });

    fireEvent.click(getByText('Archived'));

    expect(onSortChange).toHaveBeenCalledWith({ key: 'archived', direction: 'down' });
  });

  it('offers an Archived property toggle when showArchived', () => {
    const { getByText, onPropertiesChange } = renderMenu({ showArchived: true });

    openPropertiesSubmenu(getByText);
    fireEvent.click(getByText('Archived'));

    expect(onPropertiesChange).toHaveBeenCalledWith({
      ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
      archived: false,
      cover: true,
      preview: true,
    });
  });
});

describe('CollectionViewMenu — Cover image property', () => {
  it('offers Cover image in List and Table only; a Card always shows its cover, and Content preview is gone', () => {
    const card = renderMenu({ viewMode: 'card' });
    openPropertiesSubmenu(card.getByText);
    expect(card.queryByText('Cover image')).not.toBeInTheDocument();
    expect(card.queryByText('Content preview')).not.toBeInTheDocument();
    cleanup();

    for (const viewMode of ['table', 'list'] as const) {
      const other = renderMenu({ viewMode });
      openPropertiesSubmenu(other.getByText);
      expect(other.getByText('Cover image')).toBeInTheDocument();
      expect(other.queryByText('Content preview')).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('does not offer Cover image in the Archive (List or Table) — it has no cover thumbnail', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const archive = renderMenu({ viewMode, showArchived: true });
      openPropertiesSubmenu(archive.getByText);
      expect(archive.queryByText('Cover image')).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('toggling it updates only its own key', () => {
    const { getByText, onPropertiesChange } = renderMenu({ viewMode: 'table' });
    openPropertiesSubmenu(getByText);

    fireEvent.click(getByText('Cover image'));
    expect(onPropertiesChange).toHaveBeenLastCalledWith({ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, cover: false });
  });
});

describe('CollectionViewMenu — Card mode property list', () => {
  it('omits Created in Card mode (a card shows only the edited date), keeping them in List and Table', () => {
    const card = renderMenu({ viewMode: 'card' });
    openPropertiesSubmenu(card.getByText);
    expect(card.queryByText('Created')).not.toBeInTheDocument();
    expect(card.getByText('Last edited')).toBeInTheDocument();
    expect(card.getByText('Description')).toBeInTheDocument();
    cleanup();

    for (const viewMode of ['list', 'table'] as const) {
      const other = renderMenu({ viewMode });
      openPropertiesSubmenu(other.getByText);
      expect(other.getByText('Created')).toBeInTheDocument();
      cleanup();
    }
  });
});

describe('CollectionViewMenu — Properties order', () => {
  const propertyLabels = () =>
    [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim());

  it('puts the date properties at the bottom of the list in List and Table, after Cover image', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { getByText } = renderMenu({ viewMode });
      openPropertiesSubmenu(getByText);

      expect(propertyLabels()).toEqual(['Description', 'Cover image', 'Created', 'Last edited']);
      cleanup();
    }
  });

  it('lists just Description and the edited date in Card mode', () => {
    const { getByText } = renderMenu({ viewMode: 'card' });
    openPropertiesSubmenu(getByText);

    expect(propertyLabels()).toEqual(['Description', 'Last edited']);
  });
});

describe('CollectionViewMenu — Sort by follows the collection', () => {
  const labels = () => [...document.querySelectorAll('[role="menu"] [role="menuitem"], [role="menu"] *')]
    .filter((el) => el.children.length === 0)
    .map((el) => el.textContent?.trim());

  it('notes keep their Sort by options: Name, Created, Last edited — and no Type', () => {
    const { getByText, queryByText } = renderMenu({ viewMode: 'table' });

    for (const label of ['Name', 'Created', 'Last edited']) {
      expect(getByText(label)).toBeInTheDocument();
    }
    expect(queryByText('Type')).not.toBeInTheDocument();
  });

  it('assets get Sort by with Name and Type only (no date sorts), and the same active-row direction toggle', () => {
    const onSortChange = vi.fn();
    const utils = render(
      <CollectionViewMenu
        viewMode="list"
        onChange={vi.fn()}
        properties={DEFAULT_COLLECTION_PROPERTY_VISIBILITY}
        onPropertiesChange={vi.fn()}
        sort={DEFAULT_COLLECTION_SORT}
        onSortChange={onSortChange}
        capabilities={ASSET_COLLECTION_VIEW_CAPABILITIES}
      />
    );
    fireEvent.click(utils.container.querySelector('[aria-haspopup="menu"]')!);

    expect(utils.getByText('Sort by')).toBeInTheDocument();
    expect(utils.getByText('Name')).toBeInTheDocument();
    expect(utils.getByText('Type')).toBeInTheDocument();
    for (const absent of ['Created', 'Last edited']) {
      expect(utils.queryByText(absent)).not.toBeInTheDocument();
    }

    // Re-clicking the active key (Name, down) flips it; picking Type activates it at 'down'.
    fireEvent.click(utils.getByText('Name'));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'name', direction: 'up' });
    fireEvent.click(utils.getByText('Type'));
    expect(onSortChange).toHaveBeenLastCalledWith({ key: 'type', direction: 'down' });
    void labels;
  });

  it('a collection that offers no sort keys shows no Sort by at all', () => {
    const utils = render(
      <CollectionViewMenu
        viewMode="list"
        onChange={vi.fn()}
        properties={DEFAULT_COLLECTION_PROPERTY_VISIBILITY}
        onPropertiesChange={vi.fn()}
        sort={DEFAULT_COLLECTION_SORT}
        onSortChange={vi.fn()}
        capabilities={{ ...ASSET_COLLECTION_VIEW_CAPABILITIES, sortKeys: [] }}
      />
    );
    fireEvent.click(utils.container.querySelector('[aria-haspopup="menu"]')!);

    expect(utils.queryByText('Sort by')).not.toBeInTheDocument();
  });
});

describe('CollectionViewMenu — assets properties (every layout)', () => {
  const renderAssetMenu = (viewMode: 'list' | 'table' | 'card', properties = DEFAULT_COLLECTION_PROPERTY_VISIBILITY) => {
    const onPropertiesChange = vi.fn();
    const utils = render(
      <CollectionViewMenu
        viewMode={viewMode}
        onChange={vi.fn()}
        properties={properties}
        onPropertiesChange={onPropertiesChange}
        sort={DEFAULT_COLLECTION_SORT}
        onSortChange={vi.fn()}
        capabilities={ASSET_COLLECTION_VIEW_CAPABILITIES}
      />
    );
    fireEvent.click(utils.container.querySelector('[aria-haspopup="menu"]')!);
    return { ...utils, onPropertiesChange };
  };

  it('Card offers Title, File size, Created and Last edited — in that order, and nothing note-specific', () => {
    const { getByText, queryByText } = renderAssetMenu('card');

    openPropertiesSubmenu(getByText);
    const labels = [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
    expect(labels).toEqual(['Title', 'File size', 'Created', 'Last edited']);
    for (const absent of ['Description', 'Cover image', 'Content preview']) {
      expect(queryByText(absent)).not.toBeInTheDocument();
    }
  });

  it('toggling each one flips only its own property', () => {
    for (const [label, key] of [
      ['Title', 'title'],
      ['File size', 'size'],
      ['Created', 'created'],
      ['Last edited', 'updated'],
    ] as const) {
      const { getByText, onPropertiesChange, unmount } = renderAssetMenu('card');

      openPropertiesSubmenu(getByText);
      fireEvent.click(getByText(label));

      expect(onPropertiesChange).toHaveBeenCalledWith({ ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, [key]: false });
      unmount();
    }
  });

  it('List and Table offer File size, Created and Last edited — the same toggles as the card, without Title (the name is always there)', () => {
    for (const viewMode of ['list', 'table'] as const) {
      const { getByText, queryByText, unmount } = renderAssetMenu(viewMode);

      openPropertiesSubmenu(getByText);
      const labels = [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
      expect(labels).toEqual(['File size', 'Created', 'Last edited']);
      for (const absent of ['Title', 'Description', 'Cover image']) {
        expect(queryByText(absent)).not.toBeInTheDocument();
      }
      unmount();
    }
  });

  it('notes never offer Title or File size', () => {
    const { getByText, queryByText } = renderMenu({ viewMode: 'card' });

    openPropertiesSubmenu(getByText);
    expect(queryByText('Title')).not.toBeInTheDocument();
    expect(queryByText('File size')).not.toBeInTheDocument();
  });
});

describe('CollectionViewMenu — Last opened is gone', () => {
  it('is offered neither as a property nor as a Sort by option, in any layout', () => {
    for (const viewMode of ['list', 'table', 'card'] as const) {
      const { getByText, queryByText } = renderMenu({ viewMode });
      expect(queryByText('Last opened')).not.toBeInTheDocument();
      openPropertiesSubmenu(getByText);
      expect(queryByText('Last opened')).not.toBeInTheDocument();
      cleanup();
    }
  });
});
