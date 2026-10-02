// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  customPropertyTypeOptions,
  propertyTypeRegistry,
} from '@components/property-list/propertyTypeRegistry';

import { PageHeaderAddPropertyMenu } from './PageHeaderAddPropertyMenu';
import type { PageHeaderAddPropertyMenuProps } from './PageHeaderAddPropertyMenu';

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

function renderMenu(overrides: Partial<PageHeaderAddPropertyMenuProps> = {}) {
  const onAddCustomProperty = vi.fn();
  const onAddSystemProperty = vi.fn();
  const utils = render(
    <PageHeaderAddPropertyMenu
      onAddCustomProperty={onAddCustomProperty}
      onAddSystemProperty={onAddSystemProperty}
      {...overrides}
    />
  );
  return { ...utils, onAddCustomProperty, onAddSystemProperty };
}

const open = () => fireEvent.click(screen.getByRole('button', { name: 'Add properties' }));
const itemLabels = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('PageHeaderAddPropertyMenu', () => {
  it('is a closed + button until opened, then opens a menu', () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'Add properties' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();

    open();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Add properties' })).toBeInTheDocument();
  });

  it('lists every custom type, in the registry order and with the registry labels', () => {
    renderMenu();
    open();

    expect(itemLabels()).toEqual(['Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select']);
    // Derived from the registry, not a second list: same options, same order.
    expect(itemLabels()).toEqual(customPropertyTypeOptions().map((option) => option.label));
  });

  it('never offers the system Tags type as a custom type', () => {
    expect(customPropertyTypeOptions().map((option) => option.type)).not.toContain('tag');
    expect(propertyTypeRegistry.tag.custom).toBe(false);
    renderMenu();
    open();
    expect(itemLabels()).not.toContain('Tags');
  });

  it('has no system section when no system property is available', () => {
    renderMenu({ systemProperties: [] });
    open();

    expect(screen.queryByText('System')).toBeNull();
    expect(screen.queryByText('Custom')).toBeNull();
  });

  it('lists the available system properties first, then the custom types', () => {
    renderMenu({
      systemProperties: [
        { id: 'created', label: 'Created', icon: 'calendar' },
        { id: 'modified', label: 'Last edited', icon: 'calendar' },
      ],
    });
    open();

    expect(itemLabels()).toEqual([
      'Created',
      'Last edited',
      'Text',
      'Date',
      'URL',
      'Number',
      'Boolean',
      'Multi-select',
    ]);
    expect(screen.getByText('System')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('shows only the system properties it is given: one already displayed is simply not passed', () => {
    // The host computes "available" as the system properties minus those
    // the page shows, so a shown Created is never handed to the menu.
    renderMenu({ systemProperties: [{ id: 'modified', label: 'Last edited', icon: 'calendar' }] });
    open();

    expect(itemLabels()).toContain('Last edited');
    expect(itemLabels()).not.toContain('Created');
    expect(itemLabels()).not.toContain('Tags');
  });

  it('choosing a system property reports its key and closes the menu', () => {
    const { onAddSystemProperty, onAddCustomProperty } = renderMenu({
      systemProperties: [{ id: 'created', label: 'Created', icon: 'calendar' }],
    });
    open();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Created' }));

    expect(onAddSystemProperty).toHaveBeenCalledExactlyOnceWith('created');
    expect(onAddCustomProperty).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each([
    ['Text', 'text'],
    ['Date', 'date'],
    ['URL', 'url'],
    ['Number', 'number'],
    ['Boolean', 'boolean'],
    ['Multi-select', 'multi-select'],
  ])('choosing %s adds a custom %s property at once and closes the menu', (label, type) => {
    const { onAddCustomProperty, onAddSystemProperty } = renderMenu();
    open();

    fireEvent.click(screen.getByRole('menuitem', { name: label }));

    expect(onAddCustomProperty).toHaveBeenCalledExactlyOnceWith(type);
    expect(onAddSystemProperty).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
