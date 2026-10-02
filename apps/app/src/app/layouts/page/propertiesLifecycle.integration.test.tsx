// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@components/property-list/PropertyList';
import {
  addCustomProperty,
  emptyCustomProperty,
  readCustomProperties,
} from '@core/vault/ingest/frontmatter/customFrontmatter';
import { FrontmatterParser } from '@core/vault/ingest/FrontmatterParser';
import {
  addVisibleProperty,
  readPropertiesSectionVisibility,
  readVisibleProperties,
  setPropertiesSectionVisibility,
} from '@core/vault/ingest/frontmatter/propertyVisibility';
import type { Page } from '@core/vault/models/Page';

import { AddPropertyRow } from './AddPropertyRow';
import { getAddableProperties } from './addableProperties';
import { buildPageProperties } from './buildPageProperties';
import { PageHeaderMoreActionsMenu } from './header/PageHeaderMoreActionsMenu';
import type { PropertiesControl } from './header/propertiesControl';
import { derivePropertiesSectionState } from './propertiesSectionState';
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

const parse = (yaml: string) => new FrontmatterParser().parse(`---\nid: a\n${yaml}\n---\nbody`).frontmatter.unownedLines ?? [];

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
      aliases: [],
      createdAt: '2026-01-02T03:04:05.000Z',
      updatedAt: '2026-02-03T04:05:06.000Z',
      unownedFrontmatter: lines,
    },
  } as unknown as Page;
}

/**
 * The real title menu, section and "+ Add a property" row, wired the way
 * PageHost wires them; each write applies the same pure frontmatter change
 * the PageOperations method makes (showProperty and addCustomProperty also
 * show the section; the toggle changes only `properties.show`).
 */
function Harness({ initial, onLines }: { initial: readonly string[]; onLines(lines: readonly string[]): void }) {
  const [lines, setLinesState] = useState<readonly string[]>(initial);
  const drafts = useCustomPropertyDrafts('p1');
  const setLines = (next: readonly string[]) => {
    setLinesState(next);
    onLines(next);
  };
  const page = pageWith(lines);
  const addable = getAddableProperties(page);
  const section = derivePropertiesSectionState({ lines, isArchived: false, hasDraft: drafts.drafts.length > 0 });
  const showProperty = (key: string) => setLines(setPropertiesSectionVisibility(addVisibleProperty(lines, key), true));
  const items = buildPageProperties(page, {
    drafts: {
      items: drafts.drafts,
      onName: (id, name) => {
        const draft = drafts.drafts.find((candidate) => candidate.id === id)!;
        setLines(
          setPropertiesSectionVisibility(
            addVisibleProperty(addCustomProperty(lines, name, emptyCustomProperty(draft.type)), name),
            true
          )
        );
        drafts.remove(id);
      },
      onAbandon: drafts.remove,
    },
  });
  const menu = {
    systemProperties: addable.systemProperties,
    hiddenProperties: addable.hiddenProperties,
    onShowProperty: showProperty,
    onAddCustomProperty: drafts.add,
  };
  const control: PropertiesControl | undefined =
    section.control === 'add'
      ? { mode: 'add', menu }
      : section.control === 'hide'
        ? {
            mode: 'toggle',
            shown: true,
            onToggle: () => {
              drafts.clear();
              setLines(setPropertiesSectionVisibility(lines, false));
            },
          }
        : section.control === 'show'
          ? { mode: 'toggle', shown: false, onToggle: () => setLines(setPropertiesSectionVisibility(lines, true)) }
          : undefined;

  return (
    <>
      <span data-testid="mode">{section.control}</span>
      <PageHeaderMoreActionsMenu hasCoverImage={false} propertiesControl={control} />
      {section.isDisplayed && (
        <PropertyList
          items={items}
          footer={section.showsAddRow ? <AddPropertyRow {...menu} /> : undefined}
        />
      )}
    </>
  );
}

const rows = () =>
  [...document.querySelectorAll('.property-list__row')].map(
    (row) => row.querySelector('.property-list__name')?.textContent || '(draft)'
  );
const nameField = () => document.querySelector('.property-list__name .editable-text[data-placeholder]') as HTMLDivElement | null;

/** Opens the More actions menu and returns its Properties item's label. */
function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
  return screen.getAllByRole('menuitem').map((item) => item.textContent);
}
/** The title control's mode, read without opening the menu (which would move focus out of an open draft, abandoning it). */
const mode = () => screen.getByTestId('mode').textContent;
const closeMenu = () => fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
const titleControl = () => {
  const items = openMenu().filter((label) => /propert/i.test(label ?? ''));
  closeMenu();
  return items;
};
const clickTitle = (label: string) => {
  openMenu();
  fireEvent.click(screen.getByRole('menuitem', { name: label }));
};

describe('the Properties lifecycle, through the title control and the section', () => {
  it('State 1 → 2 → 3 → 2, with `show` and `visible` independent', () => {
    const onLines = vi.fn();
    render(<Harness initial={parse('priority: high')} onLines={onLines} />);

    // ---- State 1: nothing added.
    expect(titleControl()).toEqual(['Add a property']);
    expect(rows()).toEqual([]);

    // Choosing a property from the title's menu adds it, shows it, and shows the section.
    clickTitle('Add a property');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tags' }));

    // ---- State 2: the property, then "+ Add a property"; the title is the toggle.
    expect(rows()).toEqual(['Tags', 'Add a property']);
    expect(titleControl()).toEqual(['Hide properties']);
    let current = onLines.mock.calls.at(-1)![0] as string[];
    expect(readVisibleProperties(current)).toEqual(['tags']);
    expect(readPropertiesSectionVisibility(current)).toBe(true);

    // The row inside the section adds another property.
    fireEvent.click(screen.getByText('Add a property'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Created' }));
    expect(rows()).toEqual(['Tags', 'Created', 'Add a property']);
    current = onLines.mock.calls.at(-1)![0] as string[];
    expect(readVisibleProperties(current)).toEqual(['tags', 'created']);

    // ---- State 3: hide — only `show` changes; nothing leaves `visible`.
    clickTitle('Hide properties');
    expect(rows()).toEqual([]);
    expect(titleControl()).toEqual(['Show properties']);
    current = onLines.mock.calls.at(-1)![0] as string[];
    expect(readPropertiesSectionVisibility(current)).toBe(false);
    expect(readVisibleProperties(current)).toEqual(['tags', 'created']);

    // Show: the same properties come back, in order, with the row below them.
    clickTitle('Show properties');
    expect(rows()).toEqual(['Tags', 'Created', 'Add a property']);
    expect(titleControl()).toEqual(['Hide properties']);
    current = onLines.mock.calls.at(-1)![0] as string[];
    expect(readPropertiesSectionVisibility(current)).toBe(true);
    expect(readVisibleProperties(current)).toEqual(['tags', 'created']);
  });

  it('State 1 with a new type: the draft shows in the section, without a "+" row, and the title is "Hide properties"', () => {
    const onLines = vi.fn();
    render(<Harness initial={parse('priority: high')} onLines={onLines} />);

    clickTitle('Add a property');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Date' }));

    expect(rows()).toEqual(['(draft)']);
    expect(document.querySelector('.property-list__add-row')).toBeNull();
    expect(document.activeElement).toBe(nameField());
    // The title is already the toggle — "Hide properties".
    expect(mode()).toBe('hide');
    // Nothing has been written yet.
    expect(onLines).not.toHaveBeenCalled();

    // Naming it adds it, shows the section, and arrives at State 2.
    const field = nameField()!;
    field.textContent = 'Deadline';
    fireEvent.input(field);
    fireEvent.keyDown(field, { key: 'Enter' });

    expect(rows()).toEqual(['Deadline', 'Add a property']);
    const written = onLines.mock.calls.at(-1)![0] as string[];
    expect(readVisibleProperties(written)).toEqual(['Deadline']);
    expect(readPropertiesSectionVisibility(written)).toBe(true);
    expect(readCustomProperties(written).at(-1)).toEqual({ key: 'Deadline', type: 'date', value: null });
  });

  it('State 1 draft abandoned: back to "Add a property", with nothing written', () => {
    const onLines = vi.fn();
    render(<Harness initial={parse('priority: high')} onLines={onLines} />);

    clickTitle('Add a property');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Text' }));
    fireEvent.keyDown(nameField()!, { key: 'Escape' });

    expect(rows()).toEqual([]);
    expect(titleControl()).toEqual(['Add a property']);
    expect(onLines).not.toHaveBeenCalled();
  });

  it('hiding the section while a draft waits drops the draft, so showing again does not bring it back', () => {
    const onLines = vi.fn();
    render(<Harness initial={parse('properties:\n  show: true\n  visible:\n    - tags')} onLines={onLines} />);

    fireEvent.click(screen.getByText('Add a property'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Number' }));
    expect(rows()).toEqual(['Tags', '(draft)', 'Add a property']);

    // (Opening the menu moves focus out of the unnamed draft's name field,
    // which abandons it, exactly as in the app.)
    clickTitle('Hide properties');
    expect(rows()).toEqual([]);

    clickTitle('Show properties');
    expect(rows()).toEqual(['Tags', 'Add a property']);
  });

  it('dismissing the title\'s Add a property menu changes nothing', () => {
    const onLines = vi.fn();
    render(<Harness initial={parse('priority: high')} onLines={onLines} />);

    clickTitle('Add a property');
    closeMenu();

    expect(rows()).toEqual([]);
    expect(titleControl()).toEqual(['Add a property']);
    expect(onLines).not.toHaveBeenCalled();
  });

  it('once a property is listed, the title is never "Add a property" again — whether the section is shown or hidden', () => {
    render(<Harness initial={parse('properties:\n  visible:\n    - tags')} onLines={vi.fn()} />);

    expect(titleControl()).toEqual(['Show properties']);
    clickTitle('Show properties');
    expect(titleControl()).toEqual(['Hide properties']);
    clickTitle('Hide properties');
    expect(titleControl()).toEqual(['Show properties']);
  });
});
