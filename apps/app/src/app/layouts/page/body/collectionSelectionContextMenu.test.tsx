// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceKind } from '@core/presentation/resourceActions/resourceActionTypes';
import { folderEntry, noteEntry } from '@features/collection/testing/collectionEntry';

import { CollectionBody } from './CollectionBody';
import type { CollectionItemMenuResolver } from './useCollectionItemContextMenu';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

function resolverFor(acted: string[], favorites: ReadonlySet<string> = new Set()): CollectionItemMenuResolver {
  return (entry) => {
    const kind: ResourceKind = entry.type === 'folder' ? 'folder' : 'note';
    const isFavorite = favorites.has(entry.id);
    const menu = buildResourceActionMenu(kind, { status: 'active', isFavorite }, 'context');
    return {
      menu,
      handlers: Object.fromEntries(menu.map((item) => [item.id, () => acted.push(`${item.id}:${entry.id}`)])),
      isFavorite,
      moveDestinations: [{ id: 'dest', title: 'Dest', level: 0, parentId: null }],
      onMove: (destination) => acted.push(`move:${entry.id}:${destination}`),
    };
  };
}

const NOTES = [noteEntry({ id: 'a', title: 'Alpha' }), noteEntry({ id: 'b', title: 'Beta' }), noteEntry({ id: 'c', title: 'Gamma' })];
const rowOf = (text: string) => screen.getByText(text).closest('.collection-entry')!;
const box = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}`, hidden: true });
const checkedNames = () =>
  screen
    .getAllByRole('checkbox', { hidden: true })
    .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
    .map((checkbox) => checkbox.getAttribute('aria-label'));
const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

function rightClick(element: Element) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 });
  act(() => {
    element.dispatchEvent(event);
  });
}

const draw = (acted: string[] = [], favorites?: ReadonlySet<string>, viewMode: 'list' | 'table' | 'card' = 'list') =>
  render(<CollectionBody notes={NOTES} folders={[folderEntry({ id: 'f', title: 'Projects' })]} viewMode={viewMode} itemMenu={resolverFor(acted, favorites)} />);

/** Which of the three Select all checkbox drawings the open menu shows. */
function selectAllState(): 'unchecked' | 'indeterminate' | 'checked' {
  const svg = screen.getByText(/^(De)?select all$/i).closest('[role="menuitem"]')!.querySelector('svg')!.innerHTML;
  return svg.includes('M4.5 8H11.5') ? 'indeterminate' : svg.includes('M5 8.42857') ? 'checked' : 'unchecked';
}

describe('the selection’s right-click menu', () => {
  it('keeps the single-item menu when nothing is selected, and leaves the selection alone', () => {
    draw();

    rightClick(rowOf('Alpha'));

    expect(screen.getByText('Duplicate')).toBeInTheDocument();
    expect(screen.queryByText('Select all')).not.toBeInTheDocument();
    expect(checkedNames()).toEqual([]);
  });

  it('opens the selection menu on a selected item, titled with the count, keeping the whole selection', () => {
    draw();
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));

    rightClick(rowOf('Beta'));

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(items()).toEqual(['Select all', 'Add to favorites', 'Move to…', 'Move to trash']);
    expect(checkedNames()).toEqual(['Select Alpha', 'Select Beta']);
  });

  it('makes a right-clicked unselected item the only selection before opening the menu', () => {
    draw();
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));

    rightClick(rowOf('Gamma'));

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(checkedNames()).toEqual(['Select Gamma']);
  });

  it('Select all checks every item shown; unchecking them all leaves selection mode', () => {
    const { container } = draw();
    fireEvent.click(box('Alpha'));

    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Select all'));
    expect(checkedNames()).toHaveLength(4);

    rightClick(rowOf('Alpha'));
    expect(screen.getByText('4 selected')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    for (const name of ['Alpha', 'Beta', 'Gamma', 'Projects']) {
      expect(container.querySelector('.collection-entry--selecting')).not.toBeNull();
      fireEvent.click(box(name));
    }
    expect(checkedNames()).toEqual([]);
    expect(container.querySelector('.collection-entry--selecting')).toBeNull();
  });

  it('runs an action on every selected item — and only those — by each item’s own operation', () => {
    const acted: string[] = [];
    draw(acted);
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Projects'));

    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Move to trash'));

    expect(acted).toEqual(['archive:f', 'archive:a']);
  });

  it('names the favorite action by the whole selection and toggles only what needs it', () => {
    const acted: string[] = [];
    draw(acted, new Set(['a']));
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));

    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Add to favorites'));
    expect(acted).toEqual(['toggle-favorite:b']);

    cleanup();
    const all: string[] = [];
    draw(all, new Set(['a', 'b']));
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));
    rightClick(rowOf('Alpha'));
    expect(screen.getByText('Remove from favorites')).toBeInTheDocument();
  });

  it('moves every selected item to the destination chosen', () => {
    const acted: string[] = [];
    draw(acted);
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));

    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Move to…'));
    fireEvent.click(screen.getByText('Dest'));

    expect(acted).toEqual(['move:a:dest', 'move:b:dest']);
  });

  it('acts on the selection the menu opened with, however the selection changes while it is open', () => {
    const acted: string[] = [];
    draw(acted);
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));
    rightClick(rowOf('Alpha'));

    // The menu is open; the selection is changed behind it.
    fireEvent.click(box('Gamma'));
    fireEvent.click(screen.getByText('Move to trash'));

    expect(acted).toEqual(['archive:a', 'archive:b']);
  });

  it('works in table and card layouts too', () => {
    for (const viewMode of ['table', 'card'] as const) {
      const { container, unmount } = draw([], undefined, viewMode);
      fireEvent.click(box('Alpha'));

      rightClick(container.querySelector(viewMode === 'card' ? '.collection-card' : '.collection-table-row')!);

      expect(screen.getByText('1 selected')).toBeInTheDocument();
      unmount();
    }
  });

  it('shows the Select all checkbox as indeterminate for some items and checked for all, updating as the selection changes', () => {
    draw();
    fireEvent.click(box('Alpha'));

    rightClick(rowOf('Alpha'));
    expect(selectAllState()).toBe('indeterminate');
    fireEvent.keyDown(document, { key: 'Escape' });

    for (const name of ['Beta', 'Gamma', 'Projects']) {
      fireEvent.click(box(name));
    }
    rightClick(rowOf('Alpha'));
    expect(selectAllState()).toBe('checked');
    fireEvent.keyDown(document, { key: 'Escape' });

    fireEvent.click(box('Gamma'));
    rightClick(rowOf('Alpha'));
    expect(selectAllState()).toBe('indeterminate');
  });

  it('Select all from the indeterminate state checks everything', () => {
    draw();
    fireEvent.click(box('Alpha'));
    rightClick(rowOf('Alpha'));
    expect(selectAllState()).toBe('indeterminate');

    fireEvent.click(screen.getByText('Select all'));
    rightClick(rowOf('Alpha'));
    expect(selectAllState()).toBe('checked');
    expect(checkedNames()).toHaveLength(4);
  });

  it('draws the partial and the full Select all checkbox in the checkbox accent, and the empty one in the row color', () => {
    draw();
    fireEvent.click(box('Alpha'));
    rightClick(rowOf('Alpha'));

    // The icon is matched by kind, so the stylesheet decides the color.
    const icon = screen.getByText('Select all').closest('[role="menuitem"]')!.querySelector('svg')!.closest('[data-icon]')!;
    expect(icon.getAttribute('data-icon')).toBe('checkboxIndeterminate');

    const css = readFileSync(join(__dirname, '../../../../components/menu/MenuItem.css'), 'utf8');
    expect(css).toMatch(
      /\.menu__item :is\(\[data-icon='checkboxChecked'\], \[data-icon='checkboxIndeterminate'\]\)\s*\{\s*color: var\(--checkbox-accent\);/
    );
    expect(css).not.toMatch(/data-icon='checkboxUnchecked'/);
  });
});

/** Items in the trash: their own menu offers Delete, with the existing confirmation copy. */
function trashResolver(acted: string[]): CollectionItemMenuResolver {
  return (entry) => {
    const menu = buildResourceActionMenu(entry.type === 'folder' ? 'folder' : 'note', { status: 'archived', isDeletable: true }, 'context');
    return {
      menu,
      handlers: { delete: () => acted.push(`delete:${entry.id}`) },
      deleteConfirmationMessage: 'You can’t undo this action',
    };
  };
}

describe('deleting the selection', () => {
  const drawTrash = (acted: string[], notes = NOTES) =>
    render(<CollectionBody notes={notes} viewMode="list" itemMenu={trashResolver(acted)} />);

  it('asks the existing confirmation for the whole selection and deletes nothing until it is confirmed', () => {
    const acted: string[] = [];
    drawTrash(acted);
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));

    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Delete permanently'));

    expect(screen.getByText('Delete 2 items permanently?')).toBeInTheDocument();
    expect(screen.getByText('You can’t undo this action')).toBeInTheDocument();
    expect(acted).toEqual([]);
  });

  it('cancelling deletes nothing and keeps the selection', () => {
    const acted: string[] = [];
    drawTrash(acted);
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));

    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Delete permanently'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(acted).toEqual([]);
    expect(checkedNames()).toEqual(['Select Alpha', 'Select Beta']);
  });

  it('confirming deletes exactly the selected items; once they are gone the selection is empty and the mode is off', () => {
    const acted: string[] = [];
    const { rerender, container } = drawTrash(acted);
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));

    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Delete permanently'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(acted).toEqual(['delete:a', 'delete:b']);

    // The collection no longer holds them.
    rerender(<CollectionBody notes={[NOTES[2]!]} viewMode="list" itemMenu={trashResolver(acted)} />);
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    expect(checkedNames()).toEqual([]);
    expect(container.querySelector('.collection-entry--selecting')).toBeNull();
  });

  it('does not delete an item that was not selected when the menu opened', () => {
    const acted: string[] = [];
    drawTrash(acted);
    fireEvent.click(box('Alpha'));
    rightClick(rowOf('Alpha'));
    fireEvent.click(box('Gamma')); // the selection moves behind the open menu

    fireEvent.click(screen.getByText('Delete permanently'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(acted).toEqual(['delete:a']);
  });

  it('offers no Delete for an item that is not in the trash, and leaves single-item Delete as it was', () => {
    draw();
    fireEvent.click(box('Alpha'));
    rightClick(rowOf('Alpha'));
    expect(screen.queryByText('Delete permanently')).not.toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    cleanup();

    // Nothing selected: the single-item menu and its own confirmation, unchanged.
    const acted: string[] = [];
    drawTrash(acted);
    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Delete permanently'));
    expect(screen.queryByText(/items permanently/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(acted).toEqual(['delete:a']);
  });
});

describe('the Select all item toggles', () => {
  it('reads Select all for none or some, Deselect all for all, and each click does what it says', () => {
    const { container } = draw();
    fireEvent.click(box('Alpha'));

    rightClick(rowOf('Alpha'));
    expect(screen.getByText('Select all')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Select all'));
    expect(checkedNames()).toHaveLength(4);

    rightClick(rowOf('Alpha'));
    expect(screen.getByText('Deselect all')).toBeInTheDocument();
    expect(screen.queryByText('Select all')).not.toBeInTheDocument();
    expect(selectAllState()).toBe('checked');
    fireEvent.click(screen.getByText('Deselect all'));

    expect(checkedNames()).toEqual([]);
    expect(container.querySelector('.collection-entry--selecting')).toBeNull();
  });
});

describe('Delete / Backspace on the selection', () => {
  const press = (key: string, init: KeyboardEventInit = {}, target: Element | Document = document.body) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  it('asks to move the selection to the trash — naming the count, with no menu — and does nothing until it is confirmed', () => {
    const acted: string[] = [];
    draw(acted);
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));

    const event = press('Delete');

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('Move 2 items to trash?')).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(acted).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
    expect(acted).toEqual(['archive:a', 'archive:b']);
  });

  it('cancelling the confirmation moves nothing and keeps the selection', () => {
    const acted: string[] = [];
    draw(acted);
    fireEvent.click(box('Alpha'));

    press('Delete');
    expect(screen.getByText('Move this item to trash?')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(acted).toEqual([]);
    expect(checkedNames()).toEqual(['Select Alpha']);
  });

  it('moves each item once after one confirmation under React StrictMode', () => {
    const acted: string[] = [];
    render(
      <StrictMode>
        <CollectionBody notes={NOTES} viewMode="list" itemMenu={resolverFor(acted)} />
      </StrictMode>
    );
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Beta'));

    press('Delete');
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    expect(acted).toEqual(['archive:a', 'archive:b']);
  });

  it('does the same on Backspace (the Mac’s Delete key)', () => {
    const acted: string[] = [];
    draw(acted);
    fireEvent.click(box('Gamma'));

    press('Backspace');
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));

    expect(acted).toEqual(['archive:c']);
  });

  it('does nothing without a selection, with a modifier, or while a field, a menu or a dialog has the keys', () => {
    const acted: string[] = [];
    const { container } = draw(acted);

    expect(press('Delete').defaultPrevented).toBe(false);

    fireEvent.click(box('Alpha'));
    press('Delete', { metaKey: true });
    press('Delete', { shiftKey: true });

    const field = document.createElement('input');
    container.appendChild(field);
    press('Delete', {}, field);

    rightClick(rowOf('Alpha'));
    press('Delete');

    expect(acted).toEqual([]);
  });

  it('asks the existing confirmation first when a selected folder has contents, and cancelling changes nothing', () => {
    const acted: string[] = [];
    const resolver: CollectionItemMenuResolver = (entry) => {
      const props = resolverFor(acted)(entry)!;
      return entry.type === 'folder' ? { ...props, archiveConfirmationMessage: 'Has contents' } : props;
    };
    render(<CollectionBody notes={NOTES} folders={[folderEntry({ id: 'f', title: 'Projects' })]} viewMode="list" itemMenu={resolver} />);
    fireEvent.click(box('Alpha'));
    fireEvent.click(box('Projects'));

    press('Delete');
    // A folder with contents already carries its own confirmation, which the key reuses.
    expect(screen.getByText('Move the selected items to trash?')).toBeInTheDocument();
    expect(acted).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(acted).toEqual([]);
    expect(checkedNames()).toEqual(['Select Projects', 'Select Alpha']);

    press('Delete');
    fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
    expect(acted).toEqual(['archive:f', 'archive:a']);
  });

  it('does nothing for a selection that cannot be moved to the trash (items already there)', () => {
    const acted: string[] = [];
    render(<CollectionBody notes={NOTES} viewMode="list" itemMenu={trashResolver(acted)} />);
    fireEvent.click(box('Alpha'));

    expect(press('Delete').defaultPrevented).toBe(false);
    expect(acted).toEqual([]);
  });
});
