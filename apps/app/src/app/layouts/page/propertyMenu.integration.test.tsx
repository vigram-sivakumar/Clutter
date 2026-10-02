// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@components/property-list/PropertyList';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import {
  readCustomProperties,
  removeCustomProperty,
  setCustomListValue,
  setCustomScalarValue,
} from '@core/vault/ingest/frontmatter/customFrontmatter';
import { readVisibleProperties, removeVisibleProperty } from '@core/vault/ingest/frontmatter/propertyVisibility';
import type { Page } from '@core/vault/models/Page';

import { getAddableProperties } from './addableProperties';
import { buildPageProperties } from './buildPageProperties';
import { AddPropertyRow } from './AddPropertyRow';

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

const YAML = [
  'Due date: 2026-10-01',
  'people:',
  '  - Ana',
  '  - Bo',
  'priority: high',
  'properties:',
  '  visible:',
  '    - tags',
  '    - created',
  '    - Due date',
  '    - people',
  '    - priority',
].join('\n');

const parse = (yaml: string) => new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];

/**
 * The real adapter, PropertyList and Add properties menu, wired like
 * PageHost; each write applies the same pure frontmatter change
 * PageOperations makes for it.
 */
function Harness({ onLines }: { onLines(lines: readonly string[]): void }) {
  const [lines, setLinesState] = useState<readonly string[]>(parse(YAML));
  const [tags, setTags] = useState<string[]>(['work', 'home']);
  const setLines = (next: readonly string[]) => {
    setLinesState(next);
    onLines(next);
  };
  const page = {
    id: 'p1',
    type: 'note',
    metadata: {
      status: 'active',
      tags,
      aliases: [],
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z',
      unownedFrontmatter: lines,
    },
  } as unknown as Page;
  const addable = getAddableProperties(page);

  return (
    <PropertyList
      items={buildPageProperties(page, {
        onCommitTags: setTags,
        onSetScalarValue: (key, type, value) => setLines(setCustomScalarValue(lines, key, type, value)),
        onCommitListValue: (key, value) => setLines(setCustomListValue(lines, key, value)),
        onDeleteProperty: (key) => setLines(removeVisibleProperty(removeCustomProperty(lines, key), key)),
        onRemoveSystemProperty: (key) => {
          if (key === 'tags') setTags([]);
          setLines(removeVisibleProperty(lines, key));
        },
      })}
      footer={
        <AddPropertyRow
          systemProperties={addable.systemProperties}
          hiddenProperties={addable.hiddenProperties}
          onShowProperty={vi.fn()}
          onAddCustomProperty={vi.fn()}
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
// Value pills only: the Tags property's own pills start with `#`.
const pills = () =>
  [...document.querySelectorAll('.pill')].map((pill) => pill.textContent).filter((text) => !text?.startsWith('#'));

function choose(property: string, action: string) {
  fireEvent.click(screen.getByRole('button', { name: `${property} actions` }));
  fireEvent.click(screen.getByRole('menuitem', { name: action }));
}

describe("a property's menu — Hide, Clear, Delete", () => {
  it('lists every shown property, each with its own menu', () => {
    render(<Harness onLines={vi.fn()} />);

    expect(names()).toEqual(['Tags', 'Created', 'Due date', 'people', 'priority']);
    // One menu button per property row.
    expect(screen.getAllByRole('button', { name: /actions$/ })).toHaveLength(5);
  });

  it('Remove on Created only unlists it: the row goes, nothing else changes, and it can be added again', () => {
    const onLines = vi.fn();
    render(<Harness onLines={onLines} />);

    choose('Created', 'Remove');

    expect(names()).toEqual(['Tags', 'Due date', 'people', 'priority']);
    const lines = onLines.mock.calls[0]![0] as string[];
    expect(readVisibleProperties(lines)).toEqual(['tags', 'Due date', 'people', 'priority']);
    expect(lines).toContain('priority: high');
    fireEvent.click(screen.getByText('Add a property'));
    expect(screen.getByRole('menuitem', { name: 'Created' })).toBeInTheDocument();
  });

  it('Clear on a list empties it and keeps the property', () => {
    const onLines = vi.fn();
    render(<Harness onLines={onLines} />);
    expect(pills()).toEqual(['Ana', 'Bo']);

    choose('people', 'Clear');

    expect(names()).toContain('people');
    expect(pills()).toEqual([]);
    const lines = onLines.mock.calls[0]![0] as string[];
    expect(readCustomProperties(lines).find((property) => property.key === 'people')).toEqual({
      key: 'people',
      type: 'list',
      value: [],
    });
  });

  it('Clear on a typed scalar empties it without losing its type', () => {
    const onLines = vi.fn();
    render(<Harness onLines={onLines} />);

    choose('Due date', 'Clear');

    expect(names()).toContain('Due date');
    const lines = onLines.mock.calls[0]![0] as string[];
    expect(lines).toContain('Due date: # date');
    expect(readCustomProperties(lines).find((property) => property.key === 'Due date')).toEqual({
      key: 'Due date',
      type: 'date',
      value: null,
    });
  });

  it('Clear on Tags empties the note’s tags; Created offers no Clear, only Remove', () => {
    render(<Harness onLines={vi.fn()} />);
    expect([...document.querySelectorAll('.pill')].map((pill) => pill.textContent)).toContain('#work');

    choose('Tags', 'Clear');
    expect([...document.querySelectorAll('.pill')].filter((pill) => pill.textContent?.startsWith('#'))).toEqual([]);

    // Created can't be cleared: its menu is only Remove.
    fireEvent.click(screen.getByRole('button', { name: 'Created actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Remove']);
  });

  it('Delete removes the property from the frontmatter and from properties.visible, and keeps everything else', () => {
    const onLines = vi.fn();
    render(<Harness onLines={onLines} />);

    choose('people', 'Delete');

    expect(names()).toEqual(['Tags', 'Created', 'Due date', 'priority']);
    const lines = onLines.mock.calls[0]![0] as string[];
    expect(lines).not.toContain('people:');
    expect(lines).not.toContain('  - Ana');
    expect(readVisibleProperties(lines)).toEqual(['tags', 'created', 'Due date', 'priority']);
    expect(lines).toContain('priority: high');
    expect(lines).toContain('Due date: 2026-10-01');
    // Gone altogether: Add properties doesn't offer it as hidden either.
    fireEvent.click(screen.getByText('Add a property'));
    expect(screen.queryByRole('menuitem', { name: 'people' })).toBeNull();
  });

  it('a system property has no Delete, and a custom one has Clear and Delete, Delete after a divider', () => {
    render(<Harness onLines={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tags actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Clear', 'Remove']);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    cleanup();

    render(<Harness onLines={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'priority actions' }));
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Clear', 'Delete']);
    expect(document.querySelectorAll('.menu [role="separator"]')).toHaveLength(1);
  });
});
