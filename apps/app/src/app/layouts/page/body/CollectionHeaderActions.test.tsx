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
      defaultTemplate={props.defaultTemplate}
      addLabel={props.addLabel}
    />
  );
}

describe('CollectionHeaderActions', () => {
  it('renders the Settings / view-mode control, then the Add action, in that order', () => {
    const { container } = renderActions({ onAdd: vi.fn() });

    const [first, second] = [...container.children];
    expect(first).toHaveAttribute('aria-haspopup', 'menu');
    // The Add action is the button group after it: here just the plus.
    expect(second).toHaveClass('collection-header-actions__add-button');
    expect(second!.querySelector('button')).toHaveAttribute('aria-label', 'New');
  });

  it('Add calls onAdd and uses the collection-supplied label', () => {
    const onAdd = vi.fn();
    const { getByLabelText } = renderActions({ onAdd, addLabel: 'Upload' });

    fireEvent.click(getByLabelText('Upload'));

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

  it('the Add menu offers From template — and neither New note nor New folder — when no folder can be created', () => {
    const { getByLabelText } = renderActions({
      onAdd: vi.fn(),
      fromTemplate: { getTemplates: () => [], onCreateTemplate: vi.fn() },
    });

    fireEvent.click(getByLabelText('Add options'));

    const labels = [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent?.trim()).filter((t) => t !== 'List' && t !== 'Table' && t !== 'Card');
    expect(labels).toEqual(expect.arrayContaining(['From template']));
    expect(labels).not.toContain('New note');
    expect(labels).not.toContain('New folder');
    // No New folder entry above it, so no divider leading the menu.
    expect(document.querySelector('.menu [role="separator"]')).toBeNull();
  });

  it('with neither New folder nor From template, Add is a standalone plus: no caret, no divider, no menu', () => {
    const onAdd = vi.fn();
    const { getByLabelText, queryByLabelText, container } = renderActions({ onAdd });

    expect(getByLabelText('New')).not.toHaveAttribute('aria-haspopup');
    expect(queryByLabelText('Add options')).toBeNull();
    expect(container.querySelector('.collection-header-actions__add-button-divider')).toBeNull();
    expect(container.querySelectorAll('.collection-header-actions__add-button button')).toHaveLength(1);

    fireEvent.click(getByLabelText('New'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('with a creation menu, Add is a split button: the plus, a divider, then the caret', () => {
    const { container } = renderActions({ onAdd: vi.fn(), onAddFolder: vi.fn() });

    const group = container.querySelector('.collection-header-actions__add-button')!;
    expect([...group.children].map((el) => el.tagName === 'SPAN' ? 'divider' : el.getAttribute('aria-label'))).toEqual([
      'New',
      'divider',
      'Add options',
    ]);
  });

  it('the plus creates immediately — it never opens the menu — and the caret never triggers it', () => {
    const onAdd = vi.fn();
    const { getByLabelText } = renderActions({ onAdd, onAddFolder: vi.fn() });

    fireEvent.click(getByLabelText('New'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.menu')).toBeNull();
    expect(getByLabelText('Add options')).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(getByLabelText('Add options'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(getByLabelText('Add options')).toHaveAttribute('aria-expanded', 'true');
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
    fireEvent.click(utils.getByLabelText('Add options'));
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

  it('with onAddFolder, the caret opens a menu of New folder only (New note is the plus now) and the action closes it', () => {
    const onAdd = vi.fn();
    const onAddFolder = vi.fn();
    const { getByLabelText } = renderActions({ onAdd, onAddFolder });

    fireEvent.click(getByLabelText('Add options'));
    expect(onAdd).not.toHaveBeenCalled();
    const labels = () => [...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent);
    expect(labels()).toEqual(['New folder']);

    fireEvent.click(document.querySelectorAll('[role="menuitem"]')[0]!);
    expect(onAddFolder).toHaveBeenCalledTimes(1);
    expect(labels()).toEqual([]);

    fireEvent.click(getByLabelText('New'));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('the menu stays light: From template is one item, with no search or list inside the menu', () => {
    openWithTemplates([template('a', 'Meeting')]);

    expect([...document.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toEqual([
      'New folder',
      'From template',
    ]);
    expect(search()).toBeNull();
    expect(rows()).toHaveLength(0);
  });

  it('From template swaps the menu for a searchable list anchored to the same caret: a focused search, "New template" first, then every template', () => {
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

    fireEvent.click(getByLabelText('Add options'));
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

  describe('Default template', () => {
    const open = (
      defaultTemplate?: { currentId: string | null; onChange: (id: string | null) => void; onEdit?: (id: string) => void },
      templates: unknown[] = [template('a', 'Meeting'), template('b', 'Weekly')]
    ) => {
      const utils = renderActions({
        onAdd: vi.fn(),
        onAddFolder: vi.fn(),
        fromTemplate: { getTemplates: () => templates as never[], onCreateTemplate: vi.fn() },
        defaultTemplate: defaultTemplate && { onEdit: vi.fn(), ...defaultTemplate },
      });
      fireEvent.click(utils.getByLabelText('Add options'));
      return utils;
    };
    const setDefaultItem = () =>
      [...document.querySelectorAll('[role="menuitem"]')].find((i) => i.textContent === 'Select template')!;

    it('adds a divider, a non-interactive "Default template" heading and "Select template" after From template — existing items untouched', () => {
      open({ currentId: null, onChange: vi.fn() });

      const menu = document.querySelector('.menu')!;
      expect([...menu.children].map((el) => el.getAttribute('role') ?? el.textContent?.trim())).toEqual([
        'menuitem', // New folder
        'menuitem', // From template — no divider above it
        'separator',
        'Default template', // the heading: not a menuitem
        'menuitem', // Select template
      ]);
      expect([...menu.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent)).toEqual([
        'New folder',
        'From template',
        'Select template',
      ]);
    });

    it('is absent without the prop (note collections, tag and system pages)', () => {
      open(undefined);

      expect(setDefaultItem()).toBeUndefined();
      expect(document.body.textContent).not.toContain('Default template');
    });

    it('opens the same template picker as From template (New template row included); choosing a template reports its id and closes it', () => {
      const onChange = vi.fn();
      open({ currentId: null, onChange });

      fireEvent.click(setDefaultItem());

      expect(document.querySelector('.menu')).toBeNull();
      expect(rowTitles()).toEqual(['New template', 'Meeting', 'Weekly']);

      fireEvent.click(rows()[2]!);

      expect(onChange).toHaveBeenCalledWith('b');
      expect(document.querySelector('.picker-card')).toBeNull();
    });

    const menuRows = () => [...document.querySelectorAll<HTMLElement>('.menu [role="menuitem"]')];
    const menuItem = (text: string) => menuRows().find((row) => row.textContent === text)!;

    it('with a default set, the template (with the Default pill), Edit template and Remove replace Select template', () => {
      open({ currentId: 'a', onChange: vi.fn() });

      expect(setDefaultItem()).toBeUndefined();
      expect(menuRows().map((row) => row.textContent)).toEqual([
        'New folder',
        'From template',
        'MeetingDefault',
        'Edit template',
        'Remove',
      ]);
      expect(menuRows()[2]!.querySelector('.entry__meta .pill.pill--small')?.textContent).toBe('Default');
      // Only the divider ahead of the Default template section.
      expect(document.querySelectorAll('.menu [role="separator"]')).toHaveLength(1);
    });

    it('a default that no longer resolves falls back to Select template', () => {
      open({ currentId: 'gone', onChange: vi.fn() });

      expect(setDefaultItem()).toBeDefined();
      expect(menuItem('Edit template')).toBeUndefined();
    });

    it('clicking the selected template row opens the one template picker (New template first, no clear row) with the default marked by the Default pill; choosing another changes it', () => {
      const onChange = vi.fn();
      open({ currentId: 'a', onChange });
      fireEvent.click(menuRows()[2]!);

      expect(document.querySelector('.menu')).toBeNull();
      expect(rowTitles()).toEqual(['New template', 'MeetingDefault', 'Weekly']);
      expect(rows()[1]!.querySelector('.pill.pill--small')?.textContent).toBe('Default');
      expect(rows()[2]!.querySelector('.pill')).toBeNull();

      fireEvent.click(rows()[2]!);
      expect(onChange).toHaveBeenCalledWith('b');
      // The picker closes on its own and the create menu it replaced is open again.
      expect(document.querySelector('.picker-card')).toBeNull();
      expect(document.querySelector('.menu')).not.toBeNull();
    });

    it('Edit template opens the default template itself — not the picker — and changes nothing', () => {
      const onChange = vi.fn();
      const onEdit = vi.fn();
      open({ currentId: 'a', onChange, onEdit });

      fireEvent.click(menuItem('Edit template'));

      expect(onEdit).toHaveBeenCalledWith('a');
      expect(onChange).not.toHaveBeenCalled();
      expect(document.querySelector('.picker-card')).toBeNull();
      expect(document.querySelector('.menu')).toBeNull();
    });

    it('Edit template and Remove use the muted menu item variant; the template row does not', () => {
      open({ currentId: 'a', onChange: vi.fn() });

      // Each carries its system icon in the leading slot.
      expect(menuItem('Edit template').querySelector('.entry__leading svg')).not.toBeNull();
      expect(menuItem('Remove').querySelector('.entry__leading svg')).not.toBeNull();
      expect(menuItem('Edit template')).toHaveClass('menu__item--muted');
      expect(menuItem('Remove')).toHaveClass('menu__item--muted');
      expect(menuRows()[2]).toHaveClass('menu__item--default');
    });

    it('"New template" in the default picker does what it does in From template: creates a template and sets no default', () => {
      const onChange = vi.fn();
      const onCreateTemplate = vi.fn();
      const utils = renderActions({
        onAdd: vi.fn(),
        onAddFolder: vi.fn(),
        fromTemplate: { getTemplates: () => [template('a', 'Meeting')] as never[], onCreateTemplate },
        defaultTemplate: { currentId: null, onChange, onEdit: vi.fn() },
      });
      fireEvent.click(utils.getByLabelText('Add options'));
      fireEvent.click(setDefaultItem());

      fireEvent.click(rows()[0]!);

      expect(onCreateTemplate).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('From template still creates a note from the chosen template (and marks the default), never changing the default', () => {
      const onChange = vi.fn();
      const use = vi.fn();
      open({ currentId: 'a', onChange }, [template('a', 'Meeting'), template('b', 'Weekly', use)]);
      fireEvent.click(fromTemplateItem());

      expect(rowTitles()).toEqual(['New template', 'MeetingDefault', 'Weekly']);
      fireEvent.click(rows()[2]!);

      expect(use).toHaveBeenCalledTimes(1);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('Remove clears the default and leaves the menu open', () => {
      const onChange = vi.fn();
      open({ currentId: 'a', onChange });

      fireEvent.click(menuItem('Remove'));

      expect(onChange).toHaveBeenCalledWith(null);
      expect(document.querySelector('.menu')).not.toBeNull();
    });
  });
});
