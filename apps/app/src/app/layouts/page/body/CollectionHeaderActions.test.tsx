// @vitest-environment jsdom

import { noteEntry } from '@features/collection/testing/collectionEntry';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CollectionHeaderActions } from './CollectionHeaderActions';
import { ASSETS_COLLECTION, FOLDER_COLLECTION } from '@core/presentation/collection/collectionDefinitions';
import { resolveCollectionView } from '@core/presentation/collection/resolveCollectionView';

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
beforeAll(() => vi.stubGlobal('ResizeObserver', ResizeObserverMock));
afterAll(() => vi.unstubAllGlobals());
afterEach(cleanup);

function renderActions(props: Partial<Parameters<typeof CollectionHeaderActions>[0]> = {}) {
  return render(
    <CollectionHeaderActions
      menu={{
        view: resolveCollectionView(FOLDER_COLLECTION, { layout: 'list' }),
        onLayoutChange: vi.fn(),
        onPropertyChange: vi.fn(),
        onSortChange: vi.fn(),
        ...props.menu,
      }}
      onAdd={props.onAdd}
      onAddFolder={props.onAddFolder}
      fromTemplate={props.fromTemplate}
      addLabel={props.addLabel}
    />
  );
}

describe('CollectionHeaderActions', () => {
  it('renders the Settings / view-mode control, then the Add action, in that order', () => {
    const { container } = renderActions({ onAdd: vi.fn() });

    const [first, second] = [...container.children];
    expect(first).toHaveAttribute('aria-haspopup', 'menu');
    expect(second).toHaveAttribute('aria-label', 'New');
  });

  it('Add calls onAdd and uses the collection-supplied label', () => {
    const onAdd = vi.fn();
    const { getByLabelText } = renderActions({ onAdd, addLabel: 'Add asset' });

    fireEvent.click(getByLabelText('Add asset'));

    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('renders no Add button when the collection has no Add action — Settings stays', () => {
    const { container } = renderActions();

    expect(container.querySelector('button[aria-haspopup="menu"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="New"]')).toBeNull();
  });

  it("passes the collection's resolved view to the menu: each collection's own Sort by rows", () => {
    const notes = renderActions({ menu: { view: resolveCollectionView(FOLDER_COLLECTION) } as never });
    fireEvent.click(notes.container.querySelector('button[aria-haspopup="menu"]')!);
    const noteLabels = [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent);
    expect(noteLabels).toEqual(expect.arrayContaining(['List', 'Table', 'Card', 'Properties']));
    cleanup();

    const assets = renderActions({ menu: { view: resolveCollectionView(ASSETS_COLLECTION) } as never });
    fireEvent.click(assets.container.querySelector('button[aria-haspopup="menu"]')!);
    const assetLabels = [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent);
    // Same three layouts notes have, Properties (the file facts, in every layout), and Sort by (Name, then the same file facts).
    expect(assetLabels).toEqual(['List', 'Table', 'Card', 'Properties', 'Name', 'File size', 'Created', 'Last edited']);
  });

  function template(id: string, title: string, onClick = vi.fn()) {
    return noteEntry({ id, title, onClick, markdown: `# ${title}` }) as never;
  }
  function openWithTemplates(templates: unknown[], onCreateTemplate = vi.fn()) {
    const utils = renderActions({
      onAdd: vi.fn(),
      onAddFolder: vi.fn(),
      fromTemplate: { getTemplates: () => templates as never[], onCreateTemplate },
    });
    fireEvent.click(utils.getByLabelText('New'));
    return utils;
  }
  function openPicker(templates: unknown[], onCreateTemplate = vi.fn()) {
    const utils = openWithTemplates(templates, onCreateTemplate);
    fireEvent.click(fromTemplateItem());
    return utils;
  }
  const fromTemplateItem = () =>
    [...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent === 'From template')!;
  const rows = () => [...document.querySelectorAll<HTMLElement>('.picker-card [role="menuitem"]')];
  const rowTitles = () => rows().map((row) => row.textContent);
  const search = () => document.querySelector<HTMLInputElement>('input[type="search"]')!;

  it('with onAddFolder, Plus opens New note / New folder and each action closes the menu', () => {
    const onAdd = vi.fn();
    const onAddFolder = vi.fn();
    const { getByLabelText } = renderActions({ onAdd, onAddFolder });

    fireEvent.click(getByLabelText('New'));
    expect(onAdd).not.toHaveBeenCalled();
    const labels = () => [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent);
    expect(labels()).toEqual(['New note', 'New folder']);

    fireEvent.click(document.querySelectorAll('[role="menuitem"]')[1]!);
    expect(onAddFolder).toHaveBeenCalledTimes(1);
    expect(labels()).toEqual([]);

    fireEvent.click(getByLabelText('New'));
    fireEvent.click(document.querySelectorAll('[role="menuitem"]')[0]!);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('the menu stays light: From template is one item, with no search or list inside the menu', () => {
    openWithTemplates([template('a', 'Meeting')]);

    expect([...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toEqual([
      'New note',
      'New folder',
      'From template',
    ]);
    expect(search()).toBeNull();
    expect(rows()).toHaveLength(0);
  });

  it('From template swaps the menu for a searchable list anchored to the same button: a focused search, "New template" first, then every template', () => {
    openPicker([template('a', 'Meeting'), template('b', 'Weekly')]);

    expect(document.querySelector('.menu')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(search());
    expect(rowTitles()).toEqual(['New template', 'Meeting', 'Weekly']);
  });

  it('choosing a template uses it and closes the list; "New template" creates a template and closes it', () => {
    const use = vi.fn();
    const onCreateTemplate = vi.fn();
    const { getByLabelText } = openPicker([template('a', 'Meeting', use)], onCreateTemplate);

    fireEvent.click(rows()[1]!);
    expect(use).toHaveBeenCalledTimes(1);
    expect(search()).toBeNull();

    fireEvent.click(getByLabelText('New'));
    fireEvent.click(fromTemplateItem());
    fireEvent.click(rows()[0]!);
    expect(onCreateTemplate).toHaveBeenCalledTimes(1);
    expect(use).toHaveBeenCalledTimes(1);
    expect(search()).toBeNull();
  });

  it('the dismiss button goes back to the Add menu', () => {
    openPicker([template('a', 'Meeting')]);

    fireEvent.click(document.querySelector('button[aria-label="Dismiss"]')!);

    expect(search()).toBeNull();
    expect([...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toEqual([
      'New note',
      'New folder',
      'From template',
    ]);
  });

  it('Escape closes the list', () => {
    openPicker([template('a', 'Meeting')]);

    expect(search()).not.toBeNull();
    act(() => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(search()).toBeNull();
  });

  it('the search filters the templates by title', () => {
    openPicker([template('a', 'Meeting'), template('b', 'Weekly')]);

    fireEvent.change(search(), { target: { value: 'week' } });
    expect(rowTitles()).toEqual(['Weekly']);
  });
});
