// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CollectionViewMenu } from './CollectionViewMenu';
import {
  DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
  type CollectionPropertyVisibility,
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
  overrides: { viewMode?: 'list' | 'table'; properties?: CollectionPropertyVisibility } = {}
) {
  const onChange = vi.fn();
  const onPropertiesChange = vi.fn();
  const utils = render(
    <CollectionViewMenu
      viewMode={overrides.viewMode ?? 'list'}
      onChange={onChange}
      properties={overrides.properties ?? DEFAULT_COLLECTION_PROPERTY_VISIBILITY}
      onPropertiesChange={onPropertiesChange}
    />
  );
  const trigger = utils.container.querySelector('[aria-haspopup="menu"]');
  fireEvent.click(trigger!);
  return { ...utils, onChange, onPropertiesChange };
}

describe('CollectionViewMenu', () => {
  it('shows Layout (List/Table) and Properties (Description/Last opened/Created/Updated) sections', () => {
    const { getByText } = renderMenu();

    expect(getByText('Layout')).toBeInTheDocument();
    expect(getByText('List')).toBeInTheDocument();
    expect(getByText('Table')).toBeInTheDocument();
    expect(getByText('Properties')).toBeInTheDocument();
    expect(getByText('Description')).toBeInTheDocument();
    expect(getByText('Last opened')).toBeInTheDocument();
    expect(getByText('Created')).toBeInTheDocument();
    expect(getByText('Updated')).toBeInTheDocument();
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
    const { getByText } = renderMenu({
      properties: { ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY, lastOpened: false },
    });

    const descriptionRow = getByText('Description').closest('.entry')!;
    const lastOpenedRow = getByText('Last opened').closest('.entry')!;

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

  it('clicking anywhere on the row (not just the indicator) toggles exactly once', () => {
    const { getByText, onPropertiesChange } = renderMenu();

    fireEvent.click(getByText('Created'));

    expect(onPropertiesChange).toHaveBeenCalledTimes(1);
    expect(onPropertiesChange).toHaveBeenCalledWith({
      ...DEFAULT_COLLECTION_PROPERTY_VISIBILITY,
      created: false,
    });
  });
});
