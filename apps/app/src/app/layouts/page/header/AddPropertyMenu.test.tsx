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

const created = { id: 'created', label: 'Created', icon: 'calendar' } as const;
const lastEdited = { id: 'modified', label: 'Last edited', icon: 'calendar' } as const;
const aliases = { id: 'aliases', label: 'Aliases', icon: 'multiLine' } as const;

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
const customTypeLabels = ['Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select'];

describe('AddPropertyMenu — one picker', () => {
  it('is a menu of every custom type, in the registry order and with the registry labels', () => {
    renderMenu();

    expect(screen.getByRole('menu', { name: 'Add properties' })).toBeInTheDocument();
    expect(itemLabels()).toEqual(customTypeLabels);
    // Derived from the registry, not a second list: same options, same order.
    expect(itemLabels()).toEqual(customPropertyTypeOptions().map((option) => option.label));
  });

  it('never offers the system Tags type as a custom type', () => {
    expect(customPropertyTypeOptions().map((option) => option.type)).not.toContain('tag');
    expect(propertyTypeRegistry.tag.custom).toBe(false);
    renderMenu();
    expect(itemLabels()).not.toContain('Tags');
  });

  it('is one flat list under a single "Type" title: the system properties not listed, then the custom types', () => {
    renderMenu({ systemProperties: [aliases, created, lastEdited] });

    expect(itemLabels()).toEqual(['Aliases', 'Created', 'Last edited', ...customTypeLabels]);
    const menu = screen.getByRole('menu', { name: 'Add properties' });
    expect([...menu.querySelectorAll('.menu__group-title')].map((node) => node.textContent)).toEqual(['Type']);
    // No "Hidden" / "Properties" groups of any kind.
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.queryByText('Properties')).toBeNull();
  });

  it('with no system property left to add, it is just the custom types', () => {
    renderMenu({ systemProperties: [] });

    expect(itemLabels()).toEqual(customTypeLabels);
  });

  it('offers no system properties when it cannot add them', () => {
    renderMenu({ onAddSystemProperty: undefined, systemProperties: [created] });

    expect(itemLabels()).toEqual(customTypeLabels);
  });

  it('choosing a system property reports its canonical key only', () => {
    const { onAddSystemProperty, onAddCustomProperty } = renderMenu({ systemProperties: [created] });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Created' }));

    expect(onAddSystemProperty).toHaveBeenCalledExactlyOnceWith('created');
    expect(onAddCustomProperty).not.toHaveBeenCalled();
  });

  it.each(customPropertyTypeOptions().map((option) => [option.label, option.type] as const))(
    'choosing the type %s reports that type only',
    (label, type) => {
      const { onAddSystemProperty, onAddCustomProperty } = renderMenu({ systemProperties: [created] });

      fireEvent.click(screen.getByRole('menuitem', { name: label }));

      expect(onAddCustomProperty).toHaveBeenCalledExactlyOnceWith(type);
      expect(onAddSystemProperty).not.toHaveBeenCalled();
    }
  );
});

describe('AddPropertyMenu — actions', () => {
  it('without the actions, the menu is only the "Type" title and the list', () => {
    renderMenu();

    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(itemLabels()).not.toContain('Hide Properties');
    expect(itemLabels()).not.toContain('Delete all');
  });

  it('puts the "Type" title and the list first, then a divider, then Hide Properties and Delete all', () => {
    renderMenu({ onHideProperties: vi.fn(), onDeleteAll: vi.fn() });

    expect(itemLabels().slice(-3)).toEqual(['Multi-select', 'Hide Properties', 'Delete all']);
    const menu = screen.getByRole('menu', { name: 'Add properties' });
    const order = [...menu.querySelectorAll('[role=menuitem], [role=separator], .menu__group-title')].map(
      (node) => node.getAttribute('role') ?? node.textContent
    );
    expect(order[0]).toBe('Type');
    expect(order.slice(-3)).toEqual(['separator', 'menuitem', 'menuitem']);
  });

  it('each action reports itself only, and adds nothing', () => {
    const onHideProperties = vi.fn();
    const onDeleteAll = vi.fn();
    const { onAddCustomProperty, onAddSystemProperty } = renderMenu({ onHideProperties, onDeleteAll });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide Properties' }));
    expect(onHideProperties).toHaveBeenCalledOnce();
    expect(onDeleteAll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete all' }));
    expect(onDeleteAll).toHaveBeenCalledOnce();
    expect(onAddCustomProperty).not.toHaveBeenCalled();
    expect(onAddSystemProperty).not.toHaveBeenCalled();
  });
});
