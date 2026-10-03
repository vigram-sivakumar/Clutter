// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CollectionHeaderActions } from './CollectionHeaderActions';
import {
  ASSET_COLLECTION_VIEW_CAPABILITIES,
  NOTE_COLLECTION_VIEW_CAPABILITIES,
} from './collectionViewCapabilities';
import { DEFAULT_COLLECTION_PROPERTY_VISIBILITY, DEFAULT_COLLECTION_SORT } from './CollectionBody';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

function renderActions(props: Partial<Parameters<typeof CollectionHeaderActions>[0]> = {}) {
  return render(
    <CollectionHeaderActions
      menu={{
        viewMode: 'list',
        onChange: vi.fn(),
        properties: DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
        onPropertiesChange: vi.fn(),
        sort: DEFAULT_COLLECTION_SORT,
        onSortChange: vi.fn(),
        ...props.menu,
      }}
      onAdd={props.onAdd}
      addLabel={props.addLabel}
    />
  );
}

describe('CollectionHeaderActions', () => {
  it('renders the Settings / view-mode control, then the Add action, in that order', () => {
    const { container } = renderActions({ onAdd: vi.fn() });

    const [first, second] = [...container.children];
    expect(first).toHaveAttribute('aria-haspopup', 'menu');
    expect(second).toHaveAttribute('aria-label', 'New');
  });

  it('Add calls onAdd and uses the collection-supplied label', () => {
    const onAdd = vi.fn();
    const { getByLabelText } = renderActions({ onAdd, addLabel: 'Add asset' });

    fireEvent.click(getByLabelText('Add asset'));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders no Add button when the collection has no Add action — Settings stays', () => {
    const { container } = renderActions();

    expect(container.querySelector('button[aria-haspopup="menu"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="New"]')).toBeNull();
  });

  it("passes the collection's capabilities to the menu: Notes offer Properties and Sort, Assets only the layouts", () => {
    const notes = renderActions({ menu: { capabilities: NOTE_COLLECTION_VIEW_CAPABILITIES } as never });
    fireEvent.click(notes.container.querySelector('button[aria-haspopup="menu"]')!);
    const noteLabels = [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent);
    expect(noteLabels).toEqual(expect.arrayContaining(['List', 'Table', 'Card', 'Properties']));
    cleanup();

    const assets = renderActions({ menu: { capabilities: ASSET_COLLECTION_VIEW_CAPABILITIES } as never });
    fireEvent.click(assets.container.querySelector('button[aria-haspopup="menu"]')!);
    const assetLabels = [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent);
    // Same three layouts notes have, no Properties in List (they are Card-only), and Sort by with just Name and Type.
    expect(assetLabels).toEqual(['List', 'Table', 'Card', 'Name', 'Type']);
  });
});
