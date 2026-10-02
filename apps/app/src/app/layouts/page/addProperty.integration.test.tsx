// @vitest-environment jsdom

import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@components/property-list/PropertyList';
import type { CustomPropertyType } from '@core/properties/Property.types';
import {
  addCustomProperty,
  emptyCustomProperty,
  readCustomProperties,
} from '@core/vault/ingest/frontmatter/customFrontmatter';
import { addVisibleProperty } from '@core/vault/ingest/frontmatter/propertyVisibility';
import type { Page } from '@core/vault/models/Page';

import { buildPageProperties } from './buildPageProperties';
import { AddPropertyRow } from './AddPropertyRow';
import { getAddableProperties } from './addableProperties';
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

function pageWith(lines: readonly string[], status: 'active' | 'archived' = 'active'): Page {
  return {
    id: 'p1',
    type: 'note',
    name: 'x',
    path: '/v/x.md',
    parentId: null,
    metadata: { status, tags: [], aliases: [], createdAt: null, updatedAt: null, unownedFrontmatter: lines },
  } as unknown as Page;
}

/**
 * The real menu, draft hook, adapter and PropertyList, wired the way
 * PageHost wires them. `persist` stands in for PageOperations: it applies
 * the same frontmatter write (addCustomProperty) to the page's lines.
 */
function Harness({
  initialLines = ['author: Jane', 'Priority: high', 'properties:', '  visible:', '    - author', '    - Priority'],
  status = 'active',
  persist,
  onLines,
}: {
  initialLines?: readonly string[];
  status?: 'active' | 'archived';
  persist(name: string, type: CustomPropertyType): void;
  onLines(lines: readonly string[]): void;
}) {
  const [lines, setLines] = useState<readonly string[]>(initialLines);
  const drafts = useCustomPropertyDrafts('p1');

  const items = buildPageProperties(pageWith(lines, status), {
    drafts: {
      items: drafts.drafts,
      onName: (id, name) => {
        const draft = drafts.drafts.find((candidate) => candidate.id === id)!;
        persist(name, draft.type);
        // The same composition PageOperations.addCustomProperty writes: the
        // property, and its key in properties.visible.
        const next = addVisibleProperty(addCustomProperty(lines, name, emptyCustomProperty(draft.type)), name);
        setLines(next);
        onLines(next);
        drafts.remove(id);
      },
      onAbandon: drafts.remove,
    },
  });

  const page = pageWith(lines, status);
  const addable = getAddableProperties(page);

  return (
    <PropertyList
      items={items}
      footer={
        status === 'archived' ? undefined : (
          <AddPropertyRow
            systemProperties={addable.systemProperties}
            hiddenProperties={addable.hiddenProperties}
            onShowProperty={vi.fn()}
            onAddCustomProperty={drafts.add}
          />
        )
      }
    />
  );
}

function setup(props: Partial<Parameters<typeof Harness>[0]> = {}) {
  const persist = vi.fn();
  const onLines = vi.fn();
  render(<Harness persist={persist} onLines={onLines} {...props} />);
  return { persist, onLines };
}

// The properties' names — not the "+ Add a property" row's.
const names = () =>
  [...document.querySelectorAll('.property-list__row:not(.property-list__add-row) .property-list__name')].map(
    (name) => name.textContent
  );
const nameField = () => document.querySelector('.property-list__name .editable-text[data-placeholder]') as HTMLDivElement | null;

/** "+ Add a property" → a type, the way a user reaches it. */
function choose(label: string) {
  fireEvent.click(screen.getByText('Add a property'));
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
}

function typeName(text: string) {
  const field = nameField()!;
  field.textContent = text;
  fireEvent.input(field);
  return field;
}

describe('Add properties — the whole flow', () => {
  it.each(['Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select'])(
    'choosing %s adds an unnamed row with its name field focused, writing nothing yet',
    (label) => {
      const { persist, onLines } = setup();
      const before = names().length;

      choose(label);

      expect(names()).toHaveLength(before + 1);
      expect(names().at(-1)).toBe('');
      expect(nameField()).not.toBeNull();
      expect(document.activeElement).toBe(nameField());
      expect(persist).not.toHaveBeenCalled();
      expect(onLines).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['Text', 'text', 'text', ''],
    ['Date', 'date', 'date', null],
    ['URL', 'url', 'url', null],
    ['Number', 'number', 'number', null],
    ['Boolean', 'boolean', 'boolean', false],
    ['Multi-select', 'multi-select', 'list', []],
  ])('naming a %s keeps its type, persists it empty, and it is a normal row after', (label, type, read, value) => {
    const { persist, onLines } = setup();

    choose(label);
    fireEvent.keyDown(typeName('Due date'), { key: 'Enter' });

    expect(persist).toHaveBeenCalledExactlyOnceWith('Due date', type);
    const lines = onLines.mock.calls[0]![0] as string[];
    // Unrelated frontmatter is preserved, the new property is appended.
    expect(lines.slice(0, 2)).toEqual(['author: Jane', 'Priority: high']);
    // ...and the new property is shown: its key joined properties.visible.
    expect(lines).toContain('    - Due date');
    // Re-read: still that type, never text.
    expect(readCustomProperties(lines).at(-1)).toEqual({ key: 'Due date', type: read, value });
    // The draft is gone and the named property is the only such row.
    expect(names().filter((name) => name === 'Due date')).toHaveLength(1);
    expect(nameField()).toBeNull();
  });

  it('a Text property named and persisted shows an editable name', () => {
    setup();

    choose('Text');
    fireEvent.keyDown(typeName('Notes'), { key: 'Enter' });

    expect(names().at(-1)).toBe('Notes');
  });

  it('leaving the name empty and moving focus away removes the new row', () => {
    const { persist } = setup();
    const before = names();

    choose('Text');
    act(() => nameField()!.blur());

    expect(names()).toEqual(before);
    expect(persist).not.toHaveBeenCalled();
  });

  it('Escape removes the unnamed row, even after typing', () => {
    const { persist } = setup();
    const before = names();

    choose('Date');
    fireEvent.keyDown(typeName('half typed'), { key: 'Escape' });

    expect(names()).toEqual(before);
    expect(persist).not.toHaveBeenCalled();
  });

  it.each([
    ['a duplicate', 'Priority'],
    ['a duplicate in lower case', 'priority'],
    ['a duplicate in upper case', 'PRIORITY'],
    ['another custom key, in any case', 'AUTHOR'],
    ['a reserved system name', 'tags'],
    ['a reserved system name in upper case', 'ALIASES'],
    ['a reserved system name, mixed case', 'Created'],
    ['whitespace only', '   '],
  ])('%s is rejected with the shake, stays open, writes nothing, and is removed when focus leaves', (_label, name) => {
    const { persist } = setup();
    const before = names();

    choose('Number');
    const field = typeName(name);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(persist).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
    expect(field.hasAttribute('data-shake')).toBe(true);
    expect(names()).toHaveLength(before.length + 1);

    act(() => field.blur());
    expect(names()).toEqual(before);
    expect(persist).not.toHaveBeenCalled();
  });

  it('a second name that collides with the first (in another case) is rejected too', () => {
    const { persist } = setup();

    choose('Text');
    fireEvent.keyDown(typeName('Due'), { key: 'Enter' });
    choose('Date');
    const field = typeName('DUE');
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(persist).toHaveBeenCalledExactlyOnceWith('Due', 'text');
    expect(document.activeElement).toBe(field);
  });

  it('offers no "+ Add a property" row on an archived page', () => {
    setup({ status: 'archived' });

    expect(screen.queryByText('Add a property')).toBeNull();
  });

});
