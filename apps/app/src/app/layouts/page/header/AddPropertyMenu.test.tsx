// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemPropertyLabel } from '@core/properties/systemProperties';

import {
  customPropertyTypeOptions,
  propertyTypeRegistry,
} from '@components/property-list/propertyTypeRegistry';

import { AddPropertyMenu } from './AddPropertyMenu';
import type { AddPropertyMenuProps } from './AddPropertyMenu';

afterEach(() => cleanup());

function renderMenu(overrides: Partial<AddPropertyMenuProps> = {}) {
  const onAddCustomProperty = vi.fn();
  const onShowProperty = vi.fn();
  render(
    <AddPropertyMenu
      onAddCustomProperty={onAddCustomProperty}
      onShowProperty={onShowProperty}
      {...overrides}
    />
  );
  return { onAddCustomProperty, onShowProperty };
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

    expect(screen.queryByText('Properties')).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.queryByText('Type')).toBeNull();
  });

  it('lists the available system properties first, then the custom types', () => {
    renderMenu({
      systemProperties: [
        { id: 'created', label: systemPropertyLabel('created'), icon: 'calendar' },
        { id: 'modified', label: systemPropertyLabel('modified'), icon: 'calendar' },
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
    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.queryByText('Hidden')).toBeNull();
  });

  it('shows only the system properties it is given: one already displayed is simply not passed', () => {
    // The host computes "available" as the system properties minus those
    // the page shows, so a shown Created is never handed to the menu.
    renderMenu({ systemProperties: [{ id: 'modified', label: systemPropertyLabel('modified'), icon: 'calendar' }] });

    expect(itemLabels()).toContain('Last edited');
    expect(itemLabels()).not.toContain('Created');
    expect(itemLabels()).not.toContain('Tags');
  });

  it('choosing a system property reports its key only', () => {
    const { onShowProperty, onAddCustomProperty } = renderMenu({
      systemProperties: [{ id: 'created', label: systemPropertyLabel('created'), icon: 'calendar' }],
    });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Created' }));

    expect(onShowProperty).toHaveBeenCalledExactlyOnceWith('created');
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
    const { onAddCustomProperty, onShowProperty } = renderMenu();

    fireEvent.click(screen.getByRole('menuitem', { name: label }));

    expect(onAddCustomProperty).toHaveBeenCalledExactlyOnceWith(type);
    expect(onShowProperty).not.toHaveBeenCalled();
  });
});

describe('AddPropertyMenu — hidden custom properties', () => {
  const hidden = [
    { key: 'Due date', type: 'date' as const },
    { key: 'people', type: 'multi-select' as const },
  ];

  it('lists hidden custom properties by their actual key, between the system properties and the new types', () => {
    renderMenu({
      systemProperties: [{ id: 'created', label: systemPropertyLabel('created'), icon: 'calendar' }],
      hiddenProperties: hidden,
    });

    expect(itemLabels()).toEqual([
      'Created',
      'Due date',
      'people',
      'Text',
      'Date',
      'URL',
      'Number',
      'Boolean',
      'Multi-select',
    ]);
    expect(screen.getByText('Properties')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.getByText('Type')).toBeInTheDocument();
  });

  it('shows only the group it has, with the new types still offered', () => {
    renderMenu({ hiddenProperties: hidden });

    // No system group, so no Properties title; Hidden still leads.
    expect(screen.queryByText('Properties')).toBeNull();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(itemLabels().slice(0, 2)).toEqual(['Due date', 'people']);
  });

  it('choosing a hidden property reports its actual key to show it, and adds no new property', () => {
    const { onShowProperty, onAddCustomProperty } = renderMenu({ hiddenProperties: hidden });

    fireEvent.click(screen.getByRole('menuitem', { name: 'Due date' }));

    expect(onShowProperty).toHaveBeenCalledExactlyOnceWith('Due date');
    expect(onAddCustomProperty).not.toHaveBeenCalled();
  });

  it('offers no existing properties at all when it cannot show them', () => {
    renderMenu({
      onShowProperty: undefined,
      systemProperties: [{ id: 'created', label: 'Created', icon: 'calendar' }],
      hiddenProperties: hidden,
    });

    expect(itemLabels()).toEqual(['Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select']);
  });
});
