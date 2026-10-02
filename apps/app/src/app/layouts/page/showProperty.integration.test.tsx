// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@components/property-list/PropertyList';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import {
  readCustomProperties,
} from '@core/vault/ingest/frontmatter/customFrontmatter';
import {
  addVisibleProperty,
  readVisibleProperties,
} from '@core/vault/ingest/frontmatter/propertyVisibility';
import type { Page } from '@core/vault/models/Page';

import { getAddableProperties } from './addableProperties';
import { buildPageProperties } from './buildPageProperties';
import { AddPropertyRow } from './AddPropertyRow';
import { useCustomPropertyDrafts } from './useCustomPropertyDrafts';

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

function pageWith(lines: readonly string[]): Page {
  return {
    id: 'p1',
    type: 'note',
    name: 'x',
    path: '/v/x.md',
    parentId: null,
    metadata: {
      status: 'active',
      tags: ['work'],
      aliases: ['Alt'],
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z',
      unownedFrontmatter: lines,
    },
  } as unknown as Page;
}

/**
 * The real menu, adapter, addable-properties helper and PropertyList,
 * wired the way PageHost wires them. `show` stands in for
 * PageOperations.showProperty: it applies the same write (addVisibleProperty).
 */
function Harness({
  initial,
  onLines,
}: {
  initial: readonly string[];
  onLines(lines: readonly string[]): void;
}) {
  const [lines, setLines] = useState<readonly string[]>(initial);
  const drafts = useCustomPropertyDrafts('p1');
  const page = pageWith(lines);
  const addable = getAddableProperties(page);

  return (
    <PropertyList
      items={buildPageProperties(page)}
      footer={
        <AddPropertyRow
          systemProperties={addable.systemProperties}
          hiddenProperties={addable.hiddenProperties}
          onShowProperty={(key) => {
            const next = addVisibleProperty(lines, key);
            setLines(next);
            onLines(next);
          }}
          onAddCustomProperty={drafts.add}
        />
      }
    />
  );
}

// The properties' names — not the "+ Add a property" row's.
const names = () =>
  [...document.querySelectorAll('.property-list__row:not(.property-list__add-row) .property-list__name')].map(
    (name) => name.textContent
  );
const menuItems = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

function openAddProperties() {
  fireEvent.click(screen.getByText('Add a property'));
}

const YAML = 'Due date: 2026-10-01\npeople:\n  - Ana\n  - Bo\npriority: high';
const lines = () => new FrontmatterParser().parse(`---\nid: a\n${YAML}\n---\nbody`).frontmatter.unownedLines ?? [];

describe('Add properties — showing existing properties', () => {
  it('a note starts with nothing shown, and Add properties lists everything that exists but is hidden', () => {
    render(<Harness initial={lines()} onLines={vi.fn()} />);

    expect(names()).toEqual([]);

    openAddProperties();

    expect(menuItems()).toEqual([
      // System properties not shown, by their definitions' labels.
      'Tags',
      'Aliases',
      'Created',
      'Last edited',
      // Custom properties that exist but are hidden, by their actual keys.
      'Due date',
      'people',
      'priority',
      // New custom types.
      'Text',
      'Date',
      'URL',
      'Number',
      'Boolean',
      'Multi-select',
    ]);
  });

  it('`properties` itself is never offered', () => {
    render(<Harness initial={[...lines(), 'properties:', '  visible:', '    - tags']} onLines={vi.fn()} />);

    openAddProperties();

    expect(menuItems()).not.toContain('properties');
  });

  it.each([
    ['Tags', 'tags'],
    ['Aliases', 'aliases'],
    ['Created', 'created'],
    ['Last edited', 'modified'],
  ])('choosing the system property %s shows it and adds its canonical key (%s) to properties.visible', (label, key) => {
    const onLines = vi.fn();
    render(<Harness initial={lines()} onLines={onLines} />);

    openAddProperties();
    fireEvent.click(screen.getByRole('menuitem', { name: label }));

    expect(names()).toEqual([label]);
    const written = onLines.mock.calls[0]![0] as string[];
    expect(readVisibleProperties(written)).toEqual([key]);
  });

  it('choosing a hidden custom property shows it, its value untouched', () => {
    const onLines = vi.fn();
    render(<Harness initial={lines()} onLines={onLines} />);

    openAddProperties();
    fireEvent.click(screen.getByRole('menuitem', { name: 'people' }));

    expect(names()).toEqual(['people']);
    // Shown, with its value: the pills it already had.
    expect([...document.querySelectorAll('.pill')].map((pill) => pill.textContent)).toEqual(['Ana', 'Bo']);
    const written = onLines.mock.calls[0]![0] as string[];
    expect(readVisibleProperties(written)).toEqual(['people']);
    // Every original line is still there, byte-identical and in order.
    expect(written.slice(0, lines().length)).toEqual(lines());
    expect(readCustomProperties(written).map((property) => property.key)).toEqual(['Due date', 'people', 'priority']);
  });

  it('a shown property is no longer offered, and rows appear in the order they were added', () => {
    const onLines = vi.fn();
    render(<Harness initial={lines()} onLines={onLines} />);

    openAddProperties();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Last edited' }));
    openAddProperties();
    expect(menuItems()).not.toContain('Last edited');
    fireEvent.click(screen.getByRole('menuitem', { name: 'priority' }));
    openAddProperties();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tags' }));

    expect(names()).toEqual(['Last edited', 'priority', 'Tags']);
    expect(readVisibleProperties(onLines.mock.calls.at(-1)![0])).toEqual(['modified', 'priority', 'tags']);
  });

  it('once everything is shown, only the new custom types remain', () => {
    render(<Harness initial={['priority: high']} onLines={vi.fn()} />);

    for (const label of ['Tags', 'Aliases', 'Created', 'Last edited', 'priority']) {
      openAddProperties();
      fireEvent.click(screen.getByRole('menuitem', { name: label }));
    }

    openAddProperties();
    expect(menuItems()).toEqual(['Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select']);
    // (The open menu's own row is the empty placeholder.)
    expect(names()).toEqual(['Tags', 'Aliases', 'Created', 'Last edited', 'priority', 'New property']);
  });
});
