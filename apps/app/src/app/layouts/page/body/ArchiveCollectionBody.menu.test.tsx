// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Application } from '@core/application/Application';
import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { VaultResource } from '@core/vault/models/VaultResource';
import { folderEntry, noteEntry } from '@features/collection/testing/collectionEntry';

import { ArchiveCollectionBody } from './ArchiveCollectionBody';
import { buildArchivedResourceItemMenu } from './buildCollectionItemMenu';
import type { CollectionItemMenuResolver } from './useCollectionItemContextMenu';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterEach(cleanup);

const ROOT = '/vault';
const resource = (id: string, name: string, parentId = 'folder-archive'): VaultResource => ({
  id,
  kind: 'image',
  name,
  path: `${ROOT}/Archive/${name}`,
  parentId,
});

const FOLDERS = [folderEntry({ id: 'f1', title: 'Old Project' })];
const NOTES = [noteEntry({ id: 'n1', title: 'Old Note' }), noteEntry({ id: 'n2', title: 'Other Note' })];
const FILES = [resource('r1', 'hero.png')];

/** What the app builds for an archived note or folder: the context menu of an archived item, handlers recording who was acted on. */
function itemMenuFor(acted: string[]): CollectionItemMenuResolver {
  return (entry) => {
    const menu = buildResourceActionMenu(entry.type === 'folder' ? 'folder' : 'note', { status: 'archived', isDeletable: true }, 'context');
    return {
      menu,
      handlers: { restore: () => acted.push(`restore:${entry.id}`), delete: () => acted.push(`delete:${entry.id}`) },
      deleteConfirmationMessage: 'You can’t undo this action',
      resourceId: entry.id,
      isArchived: () => true,
    };
  };
}

/** The real archived-file menu, over a vault stand-in that has the Archive folder and the file. */
function resourceMenuFor(acted: string[], files: VaultResource[] = FILES): CollectionItemMenuResolver<VaultResource> {
  const application = {
    vault: {
      getReservedFolder: () => ({ id: 'folder-archive' }),
      getResource: (id: string) => files.find((file) => file.id === id),
      isResourceEffectivelyArchived: () => true,
    },
  } as unknown as Application;

  return (file) =>
    buildArchivedResourceItemMenu(
      application,
      { onRestoreResource: (id) => acted.push(`restore:${id}`), onDeleteResource: (id) => acted.push(`delete:${id}`) },
      file
    );
}

const draw = (acted: string[] = [], viewMode: 'list' | 'table' = 'list') =>
  render(
    <ArchiveCollectionBody
      folders={FOLDERS}
      notes={NOTES}
      resources={FILES}
      viewMode={viewMode}
      itemMenu={itemMenuFor(acted)}
      resourceMenu={resourceMenuFor(acted)}
    />
  );

const rowOf = (text: string) => screen.getByText(text).closest('.collection-entry, .collection-table-row')!;
const box = (name: string) => screen.getByRole('checkbox', { name: `Select ${name}`, hidden: true });
const checkedNames = () =>
  screen
    .getAllByRole('checkbox', { hidden: true })
    .filter((checkbox) => checkbox.getAttribute('aria-checked') === 'true')
    .map((checkbox) => checkbox.getAttribute('aria-label')!.replace('Select ', ''));
const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent);

function rightClick(element: Element) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50 });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

const NOT_FOR_TRASH = ['Move to…', 'Add to favorites', 'Remove from favorites', 'Move to trash', 'Duplicate', 'Rename'];

describe('the Trash’s menu for one item', () => {
  it('offers Restore and Delete permanently for a note, a folder and a file — and nothing that is for live items', () => {
    draw();

    for (const title of ['Old Note', 'Old Project', 'hero']) {
      const event = rightClick(rowOf(title));

      expect(event.defaultPrevented).toBe(true);
      expect(items()).toEqual(['Restore', 'Delete permanently']);
      for (const label of NOT_FOR_TRASH) {
        expect(screen.queryByText(label)).not.toBeInTheDocument();
      }
      fireEvent.keyDown(document, { key: 'Escape' });
    }
  });

  it('puts the destructive action in its own group, with the divider the global groups give', () => {
    draw();
    rightClick(rowOf('Old Note'));

    const [restore, del] = screen.getAllByRole('menuitem');
    expect(restore).toHaveTextContent('Restore');
    expect(del).toHaveTextContent('Delete permanently');
    expect(del!.previousElementSibling?.className).toMatch(/divider/);
  });

  it('runs Restore on exactly the item that was right-clicked', () => {
    const acted: string[] = [];
    draw(acted);

    rightClick(rowOf('Other Note'));
    fireEvent.click(screen.getByText('Restore'));

    expect(acted).toEqual(['restore:n2']);
  });

  it('asks the shared confirmation before Delete permanently, and deletes only on confirm', () => {
    const acted: string[] = [];
    draw(acted);

    rightClick(rowOf('hero'));
    fireEvent.click(screen.getByText('Delete permanently'));
    expect(screen.getByText('Delete permanently?')).toBeInTheDocument();
    expect(acted).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(acted).toEqual([]);

    rightClick(rowOf('hero'));
    fireEvent.click(screen.getByText('Delete permanently'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(acted).toEqual(['delete:r1']);
  });

  it('works in the table too, and always suppresses the native menu', () => {
    draw([], 'table');

    const event = rightClick(rowOf('Old Note'));

    expect(event.defaultPrevented).toBe(true);
    expect(items()).toEqual(['Restore', 'Delete permanently']);
  });

  it('a file that is inside an archived folder (no recorded place to go back to) can only be deleted', () => {
    const nested = resource('r9', 'deep.png', 'folder-somewhere');
    render(<ArchiveCollectionBody folders={[]} notes={[]} resources={[nested]} resourceMenu={resourceMenuFor([], [nested])} />);

    rightClick(rowOf('deep'));

    expect(items()).toEqual(['Delete permanently']);
  });

  it('draws no menu, and still suppresses the native one, when the page supplies none', () => {
    render(<ArchiveCollectionBody folders={FOLDERS} notes={NOTES} resources={FILES} viewMode="list" />);

    rightClick(rowOf('Old Note'));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('the Trash’s menu for a selection', () => {
  it('opens on a selected item with the count as its title, keeping the selection — only Select all, Restore and Delete', () => {
    draw();
    fireEvent.click(box('Old Note'));
    fireEvent.click(box('hero'));

    rightClick(rowOf('hero'));

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(items()).toEqual(['Select all', 'Restore', 'Delete permanently']);
    for (const label of NOT_FOR_TRASH) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    expect(checkedNames().sort()).toEqual(['Old Note', 'hero']);
  });

  it('makes a right-clicked unselected item the only selection first', () => {
    draw();
    fireEvent.click(box('Old Note'));
    fireEvent.click(box('hero'));

    rightClick(rowOf('Other Note'));

    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(checkedNames()).toEqual(['Other Note']);
  });

  it('restores every selected item — only those — each by its own operation', () => {
    const acted: string[] = [];
    draw(acted);
    fireEvent.click(box('Old Note'));
    fireEvent.click(box('hero'));

    rightClick(rowOf('Old Note'));
    fireEvent.click(screen.getByText('Restore'));

    expect(acted.sort()).toEqual(['restore:n1', 'restore:r1']);
  });

  it('asks the confirmation naming the count before deleting the selection, and cancel leaves everything', () => {
    const acted: string[] = [];
    draw(acted);
    for (const name of ['Old Note', 'Other Note', 'hero']) {
      fireEvent.click(box(name));
    }

    rightClick(rowOf('hero'));
    fireEvent.click(screen.getByText('Delete permanently'));
    expect(screen.getByText('Delete 3 items permanently?')).toBeInTheDocument();
    expect(acted).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(acted).toEqual([]);
    expect(checkedNames()).toHaveLength(3);

    rightClick(rowOf('hero'));
    fireEvent.click(screen.getByText('Delete permanently'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(acted.sort()).toEqual(['delete:n1', 'delete:n2', 'delete:r1']);
  });

  it('drops deleted items from the selection once the Trash no longer holds them, leaving selection mode after the last', () => {
    const acted: string[] = [];
    const { rerender, container } = draw(acted);
    fireEvent.click(box('Old Note'));
    fireEvent.click(box('Other Note'));

    rerender(
      <ArchiveCollectionBody folders={FOLDERS} notes={[]} resources={FILES} viewMode="list" itemMenu={itemMenuFor(acted)} resourceMenu={resourceMenuFor(acted)} />
    );

    expect(checkedNames()).toEqual([]);
    expect(container.querySelector('.collection-entry--selecting')).toBeNull();
  });

  it('Select all reads Select all until everything is selected, then Deselect all, and each does what it says', () => {
    const { container } = draw();
    fireEvent.click(box('Old Note'));

    rightClick(rowOf('Old Note'));
    expect(screen.getByText('Select all')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Select all'));
    expect(checkedNames()).toHaveLength(4);

    rightClick(rowOf('Old Note'));
    expect(screen.getByText('4 selected')).toBeInTheDocument();
    expect(screen.getByText('Deselect all')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Deselect all'));

    expect(checkedNames()).toEqual([]);
    expect(container.querySelector('.collection-entry--selecting')).toBeNull();
  });

  it('draws Select all as indeterminate for some, checked for all', () => {
    draw();
    const drawing = () => {
      const svg = screen.getByText(/^(De)?select all$/i).closest('[role="menuitem"]')!.querySelector('svg')!.innerHTML;
      return svg.includes('M4.5 8H11.5') ? 'indeterminate' : svg.includes('M5 8.42857') ? 'checked' : 'unchecked';
    };

    fireEvent.click(box('Old Note'));
    rightClick(rowOf('Old Note'));
    expect(drawing()).toBe('indeterminate');
    fireEvent.keyDown(document, { key: 'Escape' });

    for (const name of ['Other Note', 'Old Project', 'hero']) {
      fireEvent.click(box(name));
    }
    rightClick(rowOf('Old Note'));
    expect(drawing()).toBe('checked');
  });

  it('keeps clicking an item in selection mode a toggle, and never opens it', () => {
    const opened: string[] = [];
    render(
      <ArchiveCollectionBody
        folders={[]}
        notes={[{ ...NOTES[0]!, onClick: () => opened.push('n1') }]}
        resources={[]}
        viewMode="list"
        itemMenu={itemMenuFor([])}
      />
    );
    fireEvent.click(box('Old Note'));

    fireEvent.click(rowOf('Old Note'));

    expect(checkedNames()).toEqual([]);
    expect(opened).toEqual([]);
  });
});

describe('the other collection menus stay as they were', () => {
  it('an archived note’s menu comes from the same shared definitions every other surface uses', () => {
    expect(buildResourceActionMenu('note', { status: 'archived', isDeletable: true }, 'context').map((item) => item.id)).toEqual([
      'restore',
      'delete',
    ]);
    expect(buildResourceActionMenu('note', { status: 'active' }, 'context').map((item) => item.id)).toContain('move-to');
  });
});
