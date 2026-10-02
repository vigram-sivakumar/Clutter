// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  customPropertyTypeOptions,
  propertyTypeRegistry,
} from '@components/property-list/propertyTypeRegistry';

import { AddPropertyMenu } from './AddPropertyMenu';
import type { AddPropertyMenuProps } from './AddPropertyMenu';

afterEach(() => cleanup());

function renderMenu(overrides: Partial<AddPropertyMenuProps> = {}) {
  const onAddCustomProperty = vi.fn();
  const onAddSystemProperty = vi.fn();
  render(
    <AddPropertyMenu
      onAddCustomProperty={onAddCustomProperty}
      onAddSystemProperty={onAddSystemProperty}
      {...overrides}
    />
  );
  return { onAddCustomProperty, onAddSystemProperty };
}

const itemLabels = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

describe('AddPropertyMenu', () => {
  it('is a menu of every custom type, in the registry order and with the registry labels', () => {
    renderMenu();

    expect(screen.getByRole('menu', { name: 'Add properties' })).toBeInTheDocument();
    expect(itemLabels()).toEqual(['Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select']);
    // Derived from the registry, not a second list: same options, same order.
    expect(itemLabels()).toEqual(customPropertyTypeOptions().map((option) => option.label));
  });

  it('never offers the system Tags type as a custom type', () => {
    expect(customPropertyTypeOptions().map((option) => option.type)).not.toContain('tag');
    expect(propertyTypeRegistry.tag.custom).toBe(false);
    renderMenu();
    expect(itemLabels()).not.toContain('Tags');
  });

  it('has no system section when no system property is available', () => {
    renderMenu({ systemProperties: [] });

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

    expect(itemLabels()).toContain('Last edited');
    expect(itemLabels()).not.toContain('Created');
    expect(itemLabels()).not.toContain('Tags');
  });

  it('choosing a system property reports its key only', () => {
    const { onAddSystemProperty, onAddCustomProperty } = renderMenu({
      systemProperties: [{ id: 'created', label: 'Created', icon: 'calendar' }],
    });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Created' }));

    expect(onAddSystemProperty).toHaveBeenCalledExactlyOnceWith('created');
    expect(onAddCustomProperty).not.toHaveBeenCalled();
  });

  it.each([
    ['Text', 'text'],
    ['Date', 'date'],
    ['URL', 'url'],
    ['Number', 'number'],
    ['Boolean', 'boolean'],
    ['Multi-select', 'multi-select'],
  ])('choosing %s reports the %s type only', (label, type) => {
    const { onAddCustomProperty, onAddSystemProperty } = renderMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: label }));

    expect(onAddCustomProperty).toHaveBeenCalledExactlyOnceWith(type);
    expect(onAddSystemProperty).not.toHaveBeenCalled();
  });
});
