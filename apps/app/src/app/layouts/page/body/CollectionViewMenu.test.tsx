// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PROPERTY_IDS, isSortableProperty, propertyLabel, type PropertyId } from '@core/properties/collectionProperties';
import type { CollectionSort } from '@core/properties/collectionSort';
import type { CollectionLayout, PropertyOverrides } from '@core/properties/collectionViewConfig';
import {
  ALL_COLLECTION_DEFINITIONS,
  ARCHIVE_COLLECTION,
  ASSETS_COLLECTION,
  FOLDER_COLLECTION,
  type CollectionDefinition,
} from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView, type ResolvedCollectionView } from '@core/presentation/collection/resolveCollectionView';

import { CollectionViewMenu } from './CollectionViewMenu';

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
    definition?: CollectionDefinition;
    layout?: CollectionLayout;
    propertyOverrides?: PropertyOverrides;
    sort?: CollectionSort;
    /** A hand-made view, for a shape no definition produces. */
    view?: ResolvedCollectionView;
  } = {}
) {
  const onLayoutChange = vi.fn();
  const onPropertyChange = vi.fn();
  const onSortChange = vi.fn();
  const view =
    overrides.view ??
    resolveCollectionView(overrides.definition ?? FOLDER_COLLECTION, {
      layout: overrides.layout ?? 'list',
      propertyOverrides: overrides.propertyOverrides,
      sort: overrides.sort,
    });
  const utils = render(
    <CollectionViewMenu
      view={view}
      onLayoutChange={onLayoutChange}
      onPropertyChange={onPropertyChange}
      onSortChange={onSortChange}
    />
  );
  const trigger = utils.container.querySelector('[aria-haspopup="menu"]');
  fireEvent.click(trigger!);
  return { ...utils, onLayoutChange, onPropertyChange, onSortChange };
}

/** Navigates from the root view into the Properties submenu. */
function openPropertiesSubmenu(getByText: (text: string) => HTMLElement) {
  fireEvent.click(getByText('Properties'));
}

const menuLabels = () => [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent?.trim());

/** The Sort by options on the root view: every menu item after the Properties row. */
const sortLabels = () => {
  const items = menuLabels();
  return items.slice(items.indexOf('Properties') + 1);
};

describe('CollectionViewMenu — root view', () => {
  it('shows Layout, a Properties trigger row (not its options), and Sort by', () => {
    const { getByText, getAllByText } = renderMenu();

    expect(getByText('Layout')).toBeInTheDocument();
    expect(getByText('List')).toBeInTheDocument();
    expect(getByText('Table')).toBeInTheDocument();
    expect(getByText('Card')).toBeInTheDocument();
    expect(getByText('Properties')).toBeInTheDocument();
    expect(getByText('Sort by')).toBeInTheDocument();
    expect(getByText('Name')).toBeInTheDocument();

    // Properties' toggles are not in the root view: Description appears once, as a Sort by option.
    expect(getAllByText('Description')).toHaveLength(1);
  });

  it('the Properties row has a trailing chevron, matching the fenced-code "Change Language" trigger', () => {
    const { getByText } = renderMenu();

    const propertiesRow = getByText('Properties').closest('.entry')!;
    expect(propertiesRow.querySelector('.entry__trailing svg')).toBeInTheDocument();
  });

  it('shows the Properties row in every layout, Card included', () => {
    for (const layout of ['card', 'list', 'table'] as const) {
      expect(renderMenu({ layout }).getByText('Properties')).toBeInTheDocument();
      cleanup();
    }
  });

  it('lists the layouts the view offers, in menu order, with the current one selected', () => {
    renderMenu({ layout: 'table' });

    expect(menuLabels().slice(0, 3)).toEqual(['List', 'Table', 'Card']);
  });

  it('selecting Card calls onLayoutChange with "card" and closes the whole menu', () => {
    const { getByText, onLayoutChange, queryByText } = renderMenu();

    fireEvent.click(getByText('Card'));

    expect(onLayoutChange).toHaveBeenCalledWith('card');
    expect(queryByText('Layout')).not.toBeInTheDocument();
  });

  it('selecting Table calls onLayoutChange and closes the whole menu', () => {
    const { getByText, onLayoutChange, queryByText } = renderMenu();

    fireEvent.click(getByText('Table'));

    expect(onLayoutChange).toHaveBeenCalledWith('table');
    expect(queryByText('Layout')).not.toBeInTheDocument();
  });

  it('Name is selected by default, with a down arrow, and no other row shows an arrow', () => {
    const { getByText } = renderMenu();

    const nameRow = getByText('Name').closest('.entry')!;
    expect(nameRow.querySelector('.entry__leading svg')).toBeInTheDocument();
    expect(nameRow.querySelector('.entry__trailing svg')).toBeInTheDocument();

    // Only Name's row has a trailing arrow — the Properties trigger row's chevron lives in the same slot but is
    // a distinct, un-conditional affordance, so this counts svgs scoped to Sort by's own rows only.
    const sortByRows = [getByText('Name'), getByText('Created'), getByText('Last edited')];
    const arrows = sortByRows.filter((row) => row.closest('.entry')!.querySelector('.entry__trailing svg'));
    expect(arrows).toHaveLength(1);
  });

  it('selecting a different sort option activates it with the default (down) direction, and does not close the menu', () => {
    const { getByText, onSortChange } = renderMenu();

    fireEvent.click(getByText('Last edited'));

    expect(onSortChange).toHaveBeenCalledWith({ property: 'updated', direction: 'down' });
    expect(getByText('Sort by')).toBeInTheDocument();
  });

  it('clicking the already-active sort option flips its direction: down to up', () => {
    const { getByText, onSortChange } = renderMenu({ sort: { property: 'created', direction: 'down' } });

    fireEvent.click(getByText('Created'));

    expect(onSortChange).toHaveBeenCalledWith({ property: 'created', direction: 'up' });
  });

  it('clicking the already-active option a second time flips back: up to down', () => {
    const { getByText, onSortChange } = renderMenu({ sort: { property: 'name', direction: 'up' } });

    fireEvent.click(getByText('Name'));

    expect(onSortChange).toHaveBeenCalledWith({ property: 'name', direction: 'down' });
  });
});

describe('CollectionViewMenu — Properties submenu', () => {
  it('clicking the Properties row replaces the menu content with its options and a back button', () => {
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
    const { getByText } = renderMenu({ propertyOverrides: { created: false } });
    openPropertiesSubmenu(getByText);

    const descriptionRow = getByText('Description').closest('.entry')!;
    const createdRow = getByText('Created').closest('.entry')!;

    expect(descriptionRow.querySelector('.entry__leading svg')).toBeInTheDocument();
    expect(createdRow.querySelector('.entry__leading svg')).not.toBeInTheDocument();
    // Both rows still get the same fixed-width leading wrapper, checked or not — this is what keeps the label
    // from shifting on toggle.
    expect(descriptionRow.querySelector('.entry__leading')).toBeInTheDocument();
    expect(createdRow.querySelector('.entry__leading')).toBeInTheDocument();
  });

  it('toggling a property reports that one property and the new visibility, and keeps the submenu open', () => {
    const { getByText, onPropertyChange } = renderMenu();
    openPropertiesSubmenu(getByText);

    fireEvent.click(getByText('Description'));

    expect(onPropertyChange).toHaveBeenCalledTimes(1);
    expect(onPropertyChange).toHaveBeenCalledWith('description', false);
    // Still on the submenu — Properties is a set of independent toggles, not a single mutually-exclusive choice.
    expect(getByText('Description')).toBeInTheDocument();
  });

  it('turning a hidden property back on reports `true`', () => {
    const { getByText, onPropertyChange } = renderMenu({ propertyOverrides: { created: false } });
    openPropertiesSubmenu(getByText);

    fireEvent.click(getByText('Created'));

    expect(onPropertyChange).toHaveBeenCalledWith('created', true);
  });

  it('clicking the back button returns to the root view, unchanged', () => {
    const { getByText, getByRole, queryAllByText } = renderMenu();
    openPropertiesSubmenu(getByText);

    fireEvent.click(getByRole('button', { name: 'Back to Configure' }));

    expect(getByText('Layout')).toBeInTheDocument();
    expect(getByText('Sort by')).toBeInTheDocument();
    // Back on the root view the toggles are gone again; Description is only the Sort by option.
    expect(queryAllByText('Description')).toHaveLength(1);
  });

  it('reopening the menu after leaving it on the submenu resets to the root view', () => {
    const { getByText, queryByText, queryAllByText, container } = renderMenu();
    openPropertiesSubmenu(getByText);

    // Close without navigating back, then reopen.
    const trigger = container.querySelector('[aria-haspopup="menu"]')!;
    fireEvent.click(trigger); // closes (root Button toggles `open`)
    fireEvent.click(trigger); // reopens

    expect(getByText('Layout')).toBeInTheDocument();
    expect(queryAllByText('Description')).toHaveLength(1);
    expect(queryByText('Properties')).toBeInTheDocument();
  });
});

describe('CollectionViewMenu — required properties are shown ticked and locked', () => {
  const nameRow = (getByText: (text: string) => HTMLElement) => getByText('Name').closest('[role="menuitem"]')!;

  it('a note collection lists Name first, ticked and disabled, in every layout', () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      const { getByText } = renderMenu({ layout });
      openPropertiesSubmenu(getByText);

      expect(menuLabels()[0], layout).toBe('Name');
      expect(nameRow(getByText).querySelector('.entry__leading svg'), layout).toBeInTheDocument();
      expect(nameRow(getByText), layout).toHaveAttribute('aria-disabled', 'true');
      cleanup();
    }
  });

  it('clicking a locked Name reports nothing — and the other rows stay toggleable', () => {
    const { getByText, onPropertyChange } = renderMenu({ layout: 'table' });
    openPropertiesSubmenu(getByText);

    fireEvent.click(getByText('Name'));
    expect(onPropertyChange).not.toHaveBeenCalled();

    fireEvent.click(getByText('Created'));
    expect(onPropertyChange).toHaveBeenCalledWith('created', false);
    expect(getByText('Created').closest('[role="menuitem"]')).not.toHaveAttribute('aria-disabled');
  });

  it('a persisted `name: false` does not un-tick a required Name', () => {
    const { getByText } = renderMenu({ layout: 'table', propertyOverrides: { name: false } });
    openPropertiesSubmenu(getByText);

    expect(nameRow(getByText).querySelector('.entry__leading svg')).toBeInTheDocument();
  });

  it('the Asset card is the exception: Name is a normal, toggleable row there — and locked in List and Table', () => {
    const card = renderMenu({ definition: ASSETS_COLLECTION, layout: 'card' });
    openPropertiesSubmenu(card.getByText);
    expect(nameRow(card.getByText)).not.toHaveAttribute('aria-disabled');
    fireEvent.click(card.getByText('Name'));
    expect(card.onPropertyChange).toHaveBeenCalledWith('name', false);
    cleanup();

    for (const layout of ['list', 'table'] as const) {
      const other = renderMenu({ definition: ASSETS_COLLECTION, layout });
      openPropertiesSubmenu(other.getByText);
      expect(nameRow(other.getByText), layout).toHaveAttribute('aria-disabled', 'true');
      cleanup();
    }
  });

  it('an asset card whose name is hidden shows Name un-ticked', () => {
    const { getByText } = renderMenu({ definition: ASSETS_COLLECTION, layout: 'card', propertyOverrides: { name: false } });
    openPropertiesSubmenu(getByText);

    expect(nameRow(getByText).querySelector('.entry__leading svg')).not.toBeInTheDocument();
  });
});

describe('CollectionViewMenu — the archive date, labelled "Delete" (Archive collection only)', () => {
  it('offers no Delete property or sort option for an ordinary collection', () => {
    const { getByText, queryByText } = renderMenu();

    expect(queryByText('Delete')).not.toBeInTheDocument();
    openPropertiesSubmenu(getByText);
    expect(queryByText('Delete')).not.toBeInTheDocument();
  });

  it('the Archive offers a Delete sort option', () => {
    const { getByText, onSortChange } = renderMenu({ definition: ARCHIVE_COLLECTION });

    fireEvent.click(getByText('Delete'));

    expect(onSortChange).toHaveBeenCalledWith({ property: 'archived', direction: 'down' });
  });

  it('the Archive offers a Delete property toggle', () => {
    const { getByText, onPropertyChange } = renderMenu({ definition: ARCHIVE_COLLECTION });

    openPropertiesSubmenu(getByText);
    fireEvent.click(getByText('Delete'));

    expect(onPropertyChange).toHaveBeenCalledWith('archived', false);
  });
});

describe('CollectionViewMenu — Cover image property', () => {
  it('is offered by a note collection in every layout (the same list in each — only what is required differs)', () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      const { getByText, queryByText } = renderMenu({ layout });
      openPropertiesSubmenu(getByText);

      expect(getByText('Cover image'), layout).toBeInTheDocument();
      expect(queryByText('Content preview'), layout).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('is not offered by the Archive — its definition does not select it', () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      const archive = renderMenu({ definition: ARCHIVE_COLLECTION, layout });
      openPropertiesSubmenu(archive.getByText);
      expect(archive.queryByText('Cover image'), layout).not.toBeInTheDocument();
      cleanup();
    }
  });

  it('toggling it reports only its own property', () => {
    const { getByText, onPropertyChange } = renderMenu({ layout: 'table' });
    openPropertiesSubmenu(getByText);

    fireEvent.click(getByText('Cover image'));
    expect(onPropertyChange).toHaveBeenLastCalledWith('cover', false);
  });
});

describe('CollectionViewMenu — Properties order is the registry\'s, in every layout', () => {
  it('lists Name, Description, Cover image, Created, Last edited — the same in List, Table and Card', () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      const { getByText } = renderMenu({ layout });
      openPropertiesSubmenu(getByText);

      expect(menuLabels(), layout).toEqual(['Name', 'Description', 'Cover image', 'Created', 'Last edited']);
      cleanup();
    }
  });

  it('follows the registry even when a definition lists its properties in another order', () => {
    const scrambled: CollectionDefinition = {
      ...FOLDER_COLLECTION,
      properties: ['updated', 'cover', 'name', 'created', 'description'],
    };
    const { getByText } = renderMenu({ definition: scrambled });
    openPropertiesSubmenu(getByText);

    expect(menuLabels()).toEqual(['Name', 'Description', 'Cover image', 'Created', 'Last edited']);
  });
});

describe('CollectionViewMenu — Properties and Sort by are ONE list', () => {
  it('Sort by is the sortable subset of the available properties — same labels, same order — for every collection and layout', () => {
    for (const definition of ALL_COLLECTION_DEFINITIONS) {
      for (const layout of ['list', 'table', 'card'] as const) {
        const view = resolveCollectionView(definition, { layout });
        const utils = render(
          <CollectionViewMenu view={view} onLayoutChange={vi.fn()} onPropertyChange={vi.fn()} onSortChange={vi.fn()} />
        );
        fireEvent.click(utils.container.querySelector('[aria-haspopup="menu"]')!);
        const sorts = sortLabels();
        openPropertiesSubmenu(utils.getByText);
        const properties = menuLabels();

        const sortable = view.available.filter((id) => isSortableProperty(id)).map((id) => propertyLabel(id));
        expect(properties, `${definition.kind} ${layout}`).toEqual(view.available.map((id) => propertyLabel(id)));
        expect(sorts, `${definition.kind} ${layout}`).toEqual(sortable);
        // …and so a sorted row is always a property row.
        expect(sorts.every((label) => properties.includes(label))).toBe(true);
        utils.unmount();
      }
    }
  });

  it('every row of both lists is a registered property, labelled by the registry', () => {
    const labels = new Set(PROPERTY_IDS.map((id) => propertyLabel(id)));
    const { getByText } = renderMenu();
    const sorts = sortLabels();
    openPropertiesSubmenu(getByText);

    for (const label of [...sorts, ...menuLabels().filter((l) => l !== 'Properties')]) {
      expect(labels.has(label ?? ''), String(label)).toBe(true);
    }
  });

  it('a property that cannot be sorted is in Properties but not in Sort by', () => {
    const unsortable: ResolvedCollectionView = {
      ...resolveCollectionView(FOLDER_COLLECTION),
      sortable: ['name', 'created'] as PropertyId[],
    };
    const { getByText } = renderMenu({ view: unsortable });

    expect(sortLabels()).toEqual(['Name', 'Created']);
    openPropertiesSubmenu(getByText);
    expect(getByText('Description')).toBeInTheDocument();
  });

  it('a collection with nothing sortable shows no Sort by at all', () => {
    const { queryByText } = renderMenu({ view: { ...resolveCollectionView(ASSETS_COLLECTION), sortable: [] } });

    expect(queryByText('Sort by')).not.toBeInTheDocument();
  });
});

describe('CollectionViewMenu — Sort by follows the collection', () => {
  it('notes: Name, Description, Cover image, Created, Last edited — in every layout', () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      renderMenu({ layout });
      expect(sortLabels(), layout).toEqual(['Name', 'Description', 'Cover image', 'Created', 'Last edited']);
      cleanup();
    }
  });

  it('the Archive: Name, Delete — no Description, Cover image, File size, Created or Last edited', () => {
    renderMenu({ definition: ARCHIVE_COLLECTION, layout: 'table' });

    expect(sortLabels()).toEqual(['Name', 'Delete']);
  });

  it('assets: Name and their file facts — File size, Created, Last edited — with the same active-row direction toggle', () => {
    const { getByText, onSortChange } = renderMenu({ definition: ASSETS_COLLECTION, layout: 'card' });

    expect(sortLabels()).toEqual(['Name', 'File size', 'Created', 'Last edited']);
    // Nothing note-specific is offered.
    for (const absent of ['Description', 'Cover image', 'Archived']) {
      expect(menuLabels()).not.toContain(absent);
    }

    fireEvent.click(getByText('File size'));
    expect(onSortChange).toHaveBeenLastCalledWith({ property: 'size', direction: 'down' });
    cleanup();

    const active = renderMenu({ definition: ASSETS_COLLECTION, layout: 'card', sort: { property: 'size', direction: 'down' } });
    fireEvent.click(active.getByText('File size'));
    expect(active.onSortChange).toHaveBeenLastCalledWith({ property: 'size', direction: 'up' });
  });

  it('a persisted sort the collection cannot offer is replaced by its default, so the active row is always one that exists', () => {
    const { getByText } = renderMenu({ definition: ASSETS_COLLECTION, sort: { property: 'description', direction: 'up' } });

    expect(getByText('Name').closest('.entry')!.querySelector('.entry__trailing svg')).toBeInTheDocument();
  });
});

describe('CollectionViewMenu — assets properties', () => {
  it('Card: Name, File size, Created, Last edited — in that order, and nothing note-specific', () => {
    const { getByText, queryByText } = renderMenu({ definition: ASSETS_COLLECTION, layout: 'card' });

    openPropertiesSubmenu(getByText);
    expect(menuLabels()).toEqual(['Name', 'File size', 'Created', 'Last edited']);
    for (const absent of ['Description', 'Cover image', 'Content preview']) {
      expect(queryByText(absent)).not.toBeInTheDocument();
    }
  });

  it('List and Table: the same four, with Name locked — the card\'s toggles plus the always-there name', () => {
    for (const layout of ['list', 'table'] as const) {
      const { getByText } = renderMenu({ definition: ASSETS_COLLECTION, layout });
      openPropertiesSubmenu(getByText);

      expect(menuLabels(), layout).toEqual(['Name', 'File size', 'Created', 'Last edited']);
      cleanup();
    }
  });

  it('toggling each file fact reports only that property; a first-time view starts with them off', () => {
    for (const [label, id] of [
      ['File size', 'size'],
      ['Created', 'created'],
      ['Last edited', 'updated'],
    ] as const) {
      const { getByText, onPropertyChange } = renderMenu({ definition: ASSETS_COLLECTION, layout: 'card' });
      openPropertiesSubmenu(getByText);
      expect(getByText(label).closest('.entry')!.querySelector('.entry__leading svg')).not.toBeInTheDocument();

      fireEvent.click(getByText(label));
      expect(onPropertyChange).toHaveBeenCalledWith(id, true);
      cleanup();
    }
  });

  it('notes never offer File size', () => {
    const { getByText, queryByText } = renderMenu({ layout: 'card' });
    openPropertiesSubmenu(getByText);

    expect(queryByText('File size')).not.toBeInTheDocument();
    expect(queryByText('Title')).not.toBeInTheDocument();
  });
});

describe('CollectionViewMenu — Last opened is gone', () => {
  it('is offered neither as a property nor as a Sort by option, in any layout', () => {
    for (const layout of ['list', 'table', 'card'] as const) {
      const { getByText, queryByText } = renderMenu({ layout });

      expect(queryByText('Last opened')).not.toBeInTheDocument();
      openPropertiesSubmenu(getByText);
      expect(queryByText('Last opened')).not.toBeInTheDocument();
      cleanup();
    }
  });
});
