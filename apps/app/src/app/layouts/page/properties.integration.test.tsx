// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import { readCustomProperties } from '@core/vault/ingest/frontmatter/customFrontmatter';
import {
  isPropertiesSectionHidden,
  readListedSystemProperties,
} from '@core/vault/ingest/frontmatter/propertyVisibility';

import { PropertiesHarness } from './propertiesTestHarness';

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

const parse = (yaml: string) => new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];

/** Renders the harness for `yaml`, returning the latest written lines. */
function setup(
  yaml = '',
  options: { tags?: string[]; aliases?: string[]; status?: 'active' | 'archived'; initialOrder?: readonly string[] } = {}
) {
  const onLines = vi.fn();
  const onState = vi.fn();
  render(<PropertiesHarness initial={parse(yaml)} onLines={onLines} onState={onState} {...options} />);
  const latest = () => (onLines.mock.calls.at(-1)?.[0] ?? parse(yaml)) as string[];
  /** The latest written frontmatter state: the preserved lines and the file's entry order. */
  const state = () => onState.mock.calls.at(-1)?.[0] as { lines: string[]; order?: string[] };
  return { onLines, latest, state };
}

// ---- What is on screen ------------------------------------------------
const rows = () =>
  [...document.querySelectorAll('.property-list__row, .property-list__add-row')].map((row) =>
    row.classList.contains('property-list__add-row')
      ? row.textContent
      : row.querySelector('.property-list__name')?.textContent || '(draft)'
  );
const propertyNames = () => rows().filter((name) => name !== 'Add a property');
const hasSection = () => document.querySelector('.property-list') !== null;
const hasAddRow = () => document.querySelector('.property-list__add-row') !== null;
const nameField = () => document.querySelector('.property-list__name .editable-text[data-placeholder]') as HTMLDivElement | null;
const pills = () =>
  [...document.querySelectorAll('.pill')].map((pill) => pill.textContent).filter((text) => !text?.startsWith('#'));
const tagPills = () =>
  [...document.querySelectorAll('.pill')].map((pill) => pill.textContent).filter((text) => text?.startsWith('#'));

// ---- What the user does ----------------------------------------------
/** The title's More actions menu items (it is closed again afterwards); none when it has no menu. */
function titleItems() {
  // With nothing to offer, the title has no More actions button at all.
  if (!screen.queryByRole('button', { name: 'More actions' })) return [];
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  const items = screen.queryAllByRole('menuitem').map((item) => item.textContent);
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  return items.filter((label) => /propert/i.test(label ?? ''));
}
function clickTitle(label: string) {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
}
/** An item in the picker the section's "+ Add a property" button opens. */
function pick(label: string) {
  fireEvent.click(screen.getByText('Add a property'));
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
}
const menuItems = () => screen.getAllByRole('menuitem').map((item) => item.textContent);
function openRowMenu(property: string) {
  fireEvent.click(screen.getByRole('button', { name: `${property} actions` }));
}
function rowAction(property: string, action: string) {
  openRowMenu(property);
  fireEvent.click(screen.getByRole('menuitem', { name: action }));
}
function typeName(text: string) {
  const field = nameField()!;
  field.textContent = text;
  fireEvent.input(field);
  return field;
}

describe('Properties — the zero-property default', () => {
  it('renders no section and no "+ Add a property"; the title offers Properties (Add a property) only', () => {
    setup('description: hi');

    expect(hasSection()).toBe(false);
    expect(hasAddRow()).toBe(false);
    expect(titleItems()).toEqual(['Properties']);
  });

  it('`showProperties: true` with nothing declared still renders nothing', () => {
    setup('showProperties: true');

    expect(hasSection()).toBe(false);
    expect(titleItems()).toEqual(['Properties']);
  });

  it('the title starts the first property: an empty row with the picker open, nothing written; dismissing leaves nothing behind', () => {
    const { onLines } = setup();

    clickTitle('Properties');

    expect(rows()).toEqual(['New property']);
    // The picker offers every system property (none listed yet) and the six types.
    expect(menuItems()).toEqual(['Tags', 'Aliases', 'Created', 'Last edited', 'Text', 'Date', 'URL', 'Number', 'Boolean', 'Multi-select']);
    // A fresh section has nothing to hide or delete yet.
    expect(screen.queryByRole('menuitem', { name: 'Hide properties' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Delete all' })).toBeNull();

    fireEvent.keyDown(screen.getByRole('menu', { name: 'Add properties' }), { key: 'Escape' });

    expect(hasSection()).toBe(false);
    expect(titleItems()).toEqual(['Properties']);
    expect(onLines).not.toHaveBeenCalled();
  });
});

describe('Properties — system properties', () => {
  it('adding one declares its key — and only that: the section appears, the title offers nothing, no configuration is written', () => {
    const { latest, state } = setup();

    clickTitle('Properties');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tags' }));

    expect(rows()).toEqual(['Tags', 'Add a property']);
    expect(titleItems()).toEqual([]);
    // Nothing is written to the preserved lines: the property is its key in the entry order.
    expect(latest()).toEqual([]);
    expect(state().order).toEqual(['tags']);
  });

  it('system properties are listed in the order their keys were added to the file', () => {
    setup();

    clickTitle('Properties');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Last edited' }));
    pick('Created');
    pick('Tags');
    pick('Aliases');

    expect(propertyNames()).toEqual(['Last edited', 'Created', 'Tags', 'Aliases']);
  });

  it('a listed system property is not offered again; a removed one is', () => {
    setup('', { initialOrder: ['id', 'tags', 'created'] });

    fireEvent.click(screen.getByText('Add a property'));
    expect(menuItems().slice(0, 2)).toEqual(['Aliases', 'Last edited']);
    expect(menuItems()).not.toContain('Tags');
    fireEvent.keyDown(screen.getByRole('menu', { name: 'Add properties' }), { key: 'Escape' });

    rowAction('Created', 'Remove');
    fireEvent.click(screen.getByText('Add a property'));
    expect(menuItems().slice(0, 3)).toEqual(['Aliases', 'Created', 'Last edited']);
  });

  it('Remove takes the property out of the list and out of the file’s entries; adding it again declares it afresh', () => {
    const { state } = setup('', { initialOrder: ['id', 'tags', 'aliases'], tags: ['work', 'home'], aliases: ['Alt'] });
    expect(tagPills()).toEqual(['#work', '#home']);

    rowAction('Tags', 'Remove');

    expect(propertyNames()).toEqual(['Aliases']);
    expect(state().order).toEqual(['id', 'aliases']);

    pick('Tags');

    expect(propertyNames()).toEqual(['Aliases', 'Tags']);
    expect(state().order).toEqual(['id', 'aliases', 'tags']);
  });

  it('Remove on Aliases leaves the other properties listed', () => {
    setup('', { initialOrder: ['id', 'aliases', 'created'], aliases: ['Alt', 'Other'] });
    expect(pills()).toContain('Alt');

    rowAction('Aliases', 'Remove');
    expect(propertyNames()).toEqual(['Created']);
  });

  it('removing the last property returns to the exact zero-property state: no section, no add row, title is Add a property, no properties block', () => {
    const { latest } = setup('', { initialOrder: ['id', 'created'] });

    rowAction('Created', 'Remove');

    expect(hasSection()).toBe(false);
    expect(hasAddRow()).toBe(false);
    expect(titleItems()).toEqual(['Properties']);
    expect(latest()).toEqual([]);
  });

  it('Created and Last edited offer Move up/down and Remove; Tags and Aliases also Clear; none can be deleted', () => {
    setup('', { initialOrder: ['id', 'tags', 'aliases', 'created', 'modified'] });

    for (const [name, expected] of [
      ['Tags', ['Move up', 'Move down', 'Clear', 'Remove']],
      ['Aliases', ['Move up', 'Move down', 'Clear', 'Remove']],
      ['Created', ['Move up', 'Move down', 'Remove']],
      ['Last edited', ['Move up', 'Move down', 'Remove']],
    ] as const) {
      openRowMenu(name);
      expect(menuItems()).toEqual(expected);
      fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    }
  });

  it('Clear on Tags empties the tags but keeps the row (unlike Remove)', () => {
    setup('', { initialOrder: ['id', 'tags'] });

    rowAction('Tags', 'Clear');

    expect(propertyNames()).toEqual(['Tags']);
    expect(tagPills()).toEqual([]);
  });
});

describe('Properties — custom properties', () => {
  it('appear automatically when their key is in the frontmatter, in frontmatter order, with no listing', () => {
    const { onLines } = setup('Due date: 2026-10-01\npeople:\n  - Ana\n  - Bo\npriority: high');

    expect(propertyNames()).toEqual(['Due date', 'people', 'priority']);
    expect(hasAddRow()).toBe(true);
    expect(titleItems()).toEqual([]);
    expect(onLines).not.toHaveBeenCalled();
  });

  it('system and custom rows are one list, in the order of the file’s entries', () => {
    setup('zeta: 1\nalpha: 2', { initialOrder: ['id', 'modified', 'zeta', 'tags', 'alpha'] });

    expect(propertyNames()).toEqual(['Last edited', 'zeta', 'Tags', 'alpha']);
  });

  it.each([
    ['Text', 'text', ''],
    ['Date', 'date', null],
    ['URL', 'url', null],
    ['Number', 'number', null],
    ['Boolean', 'boolean', false],
    ['Multi-select', 'list', []],
  ])('adding a %s: a focused draft, then — once named — a property that keeps its type and is displayed because it exists', (label, type, value) => {
    const { onLines, latest } = setup('author: Jane');

    pick(label);
    expect(propertyNames().at(-1)).toBe('(draft)');
    expect(document.activeElement).toBe(nameField());
    expect(onLines).not.toHaveBeenCalled();

    fireEvent.keyDown(typeName('Due date'), { key: 'Enter' });

    expect(propertyNames()).toEqual(['author', 'Due date']);
    expect(readCustomProperties(latest()).at(-1)).toEqual({ key: 'Due date', type, value });
    // Nothing is listed for a custom property.
    expect(latest().join('\n')).not.toContain('properties');
  });

  it('the first custom property on a note with nothing shows the section, with no `properties:` block written', () => {
    const { latest } = setup();

    clickTitle('Properties');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text' }));
    expect(rows()).toEqual(['(draft)']);
    expect(hasAddRow()).toBe(false);

    fireEvent.keyDown(typeName('Notes'), { key: 'Enter' });

    expect(rows()).toEqual(['Notes', 'Add a property']);
    expect(latest()).toEqual(['Notes:']);
  });

  it('Escape or leaving the name empty abandons the draft, writing nothing', () => {
    const { onLines } = setup('author: Jane');

    pick('Date');
    fireEvent.keyDown(typeName('half typed'), { key: 'Escape' });
    expect(propertyNames()).toEqual(['author']);

    pick('Text');
    act(() => nameField()!.blur());
    expect(propertyNames()).toEqual(['author']);
    expect(onLines).not.toHaveBeenCalled();
  });

  it.each([
    ['a duplicate in another case', 'AUTHOR'],
    ['a reserved system name', 'tags'],
    ['a reserved system name in upper case', 'ALIASES'],
    ['a reserved system name, mixed case', 'Created'],
    ['whitespace only', '   '],
  ])('%s is rejected with the shake, writes nothing, and the draft goes when focus leaves', (_label, name) => {
    const { onLines } = setup('author: Jane');

    pick('Number');
    const field = typeName(name);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(onLines).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(field);
    expect(field.hasAttribute('data-shake')).toBe(true);

    act(() => field.blur());
    expect(propertyNames()).toEqual(['author']);
  });

  it('Clear on a list empties it, and on a typed scalar keeps its type — never falling back to text', () => {
    const { latest } = setup('Due date: 2026-10-01\npeople:\n  - Ana\n  - Bo');
    expect(pills()).toEqual(['Ana', 'Bo']);

    rowAction('people', 'Clear');
    expect(pills()).toEqual([]);
    expect(readCustomProperties(latest()).find((p) => p.key === 'people')).toEqual({ key: 'people', type: 'list', value: [] });

    rowAction('Due date', 'Clear');
    expect(latest()).toContain('Due date: # date');
    expect(readCustomProperties(latest()).find((p) => p.key === 'Due date')).toEqual({ key: 'Due date', type: 'date', value: null });
    expect(propertyNames()).toEqual(['Due date', 'people']);
  });

  it('Delete removes the actual frontmatter key and value; everything else stays', () => {
    const { latest } = setup('Due date: 2026-10-01\npeople:\n  - Ana\npriority: high', {
      initialOrder: ['id', 'tags', 'Due date', 'people', 'priority'],
    });

    rowAction('people', 'Delete');

    expect(propertyNames()).toEqual(['Tags', 'Due date', 'priority']);
    expect(latest()).toEqual(['Due date: 2026-10-01', 'priority: high']);
  });

  it('custom properties offer Move up/down, Clear and Delete, and no Remove or Hide', () => {
    setup('priority: high');

    openRowMenu('priority');

    expect(menuItems()).toEqual(['Move up', 'Move down', 'Clear', 'Delete']);
    expect(document.querySelectorAll('.menu [role="separator"]')).toHaveLength(2);
  });

  it('deleting the last property returns to the zero-property state with no properties block', () => {
    const { latest } = setup('priority: high');

    rowAction('priority', 'Delete');

    expect(hasSection()).toBe(false);
    expect(titleItems()).toEqual(['Properties']);
    expect(latest()).toEqual([]);
  });

  it('renaming a custom property keeps its value and its place', () => {
    const { latest } = setup('priority: high\nowner: Jane');
    const name = [...document.querySelectorAll('.property-list__name .editable-text')].find(
      (node) => node.textContent === 'priority'
    ) as HTMLDivElement;

    act(() => name.focus());
    name.textContent = 'importance';
    fireEvent.input(name);
    fireEvent.keyDown(name, { key: 'Enter' });

    expect(latest()).toEqual(['importance: high', 'owner: Jane']);
  });
});

describe('Properties — hiding and showing the section', () => {
  const ORDER = ['id', 'tags', 'created', 'priority'];

  it('a visible section has no Hide or Show in the title; Hide properties is in the section’s own menu', () => {
    setup('', { initialOrder: ['id', 'tags'] });

    expect(titleItems()).toEqual([]);
    fireEvent.click(screen.getByText('Add a property'));
    expect(menuItems()).toContain('Hide properties');
    expect(menuItems()).toContain('Delete all');
  });

  it('Hide properties writes only `showProperties: false`, keeps every property and value, and the title then offers Show properties', () => {
    const { latest, state } = setup('priority: high', { initialOrder: ORDER });

    fireEvent.click(screen.getByText('Add a property'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide properties' }));

    expect(hasSection()).toBe(false);
    expect(hasAddRow()).toBe(false);
    expect(titleItems()).toEqual(['Show properties']);
    expect(latest()).toEqual(['priority: high', 'showProperties: false']);
    expect(isPropertiesSectionHidden(latest())).toBe(true);
    // Every declared property is still declared.
    expect(readListedSystemProperties(state().order)).toEqual(['tags', 'created']);
    expect(state().order).toEqual([...ORDER, 'showProperties']);
  });

  it('Show properties removes the `showProperties` entry: the properties come back and the title offers nothing again', () => {
    const { latest } = setup('priority: high\nshowProperties: false', {
      initialOrder: ['id', 'tags', 'priority', 'showProperties'],
    });
    expect(hasSection()).toBe(false);

    clickTitle('Show properties');

    expect(propertyNames()).toEqual(['Tags', 'priority']);
    expect(titleItems()).toEqual([]);
    expect(latest()).toEqual(['priority: high']);
  });

  it('hide then show returns the frontmatter to exactly what it was', () => {
    const { latest, state } = setup('priority: high', { initialOrder: ORDER });

    fireEvent.click(screen.getByText('Add a property'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide properties' }));
    clickTitle('Show properties');

    expect(latest()).toEqual(parse('priority: high'));
    expect(state().order).toEqual(ORDER);
  });

  it('`showProperties` is never a row, and `showProperties: true` shows the section', () => {
    setup('priority: high\nshowProperties: true', { initialOrder: ['id', 'priority', 'showProperties'] });

    expect(propertyNames()).toEqual(['priority']);
  });

  it('a draft waiting when the section is hidden is dropped, so showing again does not bring it back', () => {
    setup('', { initialOrder: ['id', 'tags'] });

    pick('Number');
    expect(rows()).toEqual(['Tags', '(draft)', 'Add a property']);
    // (Opening a menu moves focus out of the unnamed draft, which abandons it, as in the app.)
    fireEvent.click(screen.getByText('Add a property'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hide properties' }));
    clickTitle('Show properties');

    expect(rows()).toEqual(['Tags', 'Add a property']);
  });
});

describe('Properties — Delete all', () => {
  it('deletes every custom property and removes the system properties and configuration too: no section, no add row, and the title is Add a property', () => {
    const { latest, state } = setup('priority: high\nnotes: x\nshowProperties: false', {
      initialOrder: ['id', 'tags', 'created', 'priority', 'notes', 'showProperties'],
      tags: ['work'],
    });
    // (the section is hidden here; show it to reach its menu)
    clickTitle('Show properties');

    fireEvent.click(screen.getByText('Add a property'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete all' }));

    expect(hasSection()).toBe(false);
    expect(hasAddRow()).toBe(false);
    expect(titleItems()).toEqual(['Properties']);
    expect(latest()).toEqual([]);
    expect(state().order).toEqual(['id']);
  });
});
