// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildResourceActionMenu } from '@core/presentation/resourceActions/buildResourceActionMenu';
import type { ResourceActionContext, ResourceKind } from '@core/presentation/resourceActions/resourceActionTypes';
import { folderEntry, noteEntry } from '@features/collection/testing/collectionEntry';
import type { CollectionEntryModel } from '@features/collection/page/CollectionEntryModel';

import { buildResourceContextMenu } from '../topbar/buildTopBarActions';
import type { ResourceTopBarActionsProps } from '../topbar/ResourceTopBarActions';
import { CollectionBody } from './CollectionBody';
import type { CollectionItemMenuResolver } from './useCollectionItemContextMenu';

beforeAll(() => {
  // jsdom has no ResizeObserver; the shared Overlay's positioning observes with one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  cleanup();
});

/** A resolver over the shared definitions: the context surface's menu, handlers recording who was acted on. */
function resolverFor(acted: string[], overrides: Partial<ResourceTopBarActionsProps> = {}): CollectionItemMenuResolver {
  return (entry) => {
    const kind: ResourceKind = entry.type === 'folder' ? 'folder' : 'note';
    const context: ResourceActionContext = { status: 'active' };
    const menu = buildResourceActionMenu(kind, context, 'context');
    return {
      menu,
      handlers: Object.fromEntries(menu.map((item) => [item.id, () => acted.push(`${item.id}:${entry.id}`)])),
      ...overrides,
    };
  };
}

const rowOf = (text: string) => screen.getByText(text).closest('.collection-entry')!;

function rightClick(element: Element, init: MouseEventInit = { clientX: 40, clientY: 50 }) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...init });
  act(() => {
    element.dispatchEvent(event);
  });
  return event;
}

describe('Collection View right-click menu', () => {
  it('opens the note menu at the click, and suppresses the native menu', () => {
    render(<CollectionBody notes={[noteEntry({ id: 'n1', title: 'Alpha' })]} viewMode="list" itemMenu={resolverFor([])} />);

    const event = rightClick(rowOf('Alpha'));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Duplicate')).toBeInTheDocument();
  });

  it('a folder gets folder actions (no Duplicate) and still suppresses the native menu', () => {
    render(<CollectionBody folders={[folderEntry({ id: 'f1', title: 'Projects' })]} viewMode="list" itemMenu={resolverFor([])} />);

    const event = rightClick(screen.getByText('Projects').closest('.collection-entry--folder-card')!);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByText('Duplicate')).not.toBeInTheDocument();
  });

  it('suppresses the native menu even when the item has no menu, and opens nothing', () => {
    render(<CollectionBody notes={[noteEntry({ title: 'Alpha' })]} viewMode="list" itemMenu={() => null} />);

    const event = rightClick(rowOf('Alpha'));

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('runs the action on the right-clicked item, not on the open or selected one', () => {
    const acted: string[] = [];
    render(
      <CollectionBody
        notes={[noteEntry({ id: 'open', title: 'Open one', selected: true }), noteEntry({ id: 'other', title: 'Other' })]}
        viewMode="list"
        itemMenu={resolverFor(acted)}
      />
    );

    rightClick(rowOf('Other'));
    fireEvent.click(screen.getByText('Duplicate'));

    expect(acted).toEqual(['duplicate:other']);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('dismisses on Escape and on an outside click', () => {
    render(<CollectionBody notes={[noteEntry({ title: 'Alpha' })]} viewMode="list" itemMenu={resolverFor([])} />);

    rightClick(rowOf('Alpha'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    rightClick(rowOf('Alpha'));
    fireEvent.click(document.querySelector('.overlay__backdrop')!);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('a delete asks for confirmation before running, through the shared confirmation', () => {
    const acted: string[] = [];
    const resolve: CollectionItemMenuResolver = (entry) => {
      const menu = buildResourceActionMenu('note', { status: 'archived', isDeletable: true }, 'context');
      return {
        menu,
        handlers: { delete: () => acted.push(`delete:${entry.id}`) },
        deleteConfirmationMessage: 'Gone for good.',
      };
    };
    render(<CollectionBody notes={[noteEntry({ id: 'n1', title: 'Alpha' })]} viewMode="list" itemMenu={resolve} />);

    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Delete permanently'));
    expect(acted).toEqual([]);
    expect(screen.getByText('Gone for good.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(acted).toEqual(['delete:n1']);
  });

  it('opens the menu on a Card-mode note and a Table-mode row too', () => {
    const { unmount } = render(
      <CollectionBody notes={[noteEntry({ id: 'n1', title: 'Alpha' })]} viewMode="card" itemMenu={resolverFor([])} />
    );
    rightClick(document.querySelector('.collection-card')!);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    unmount();
    cleanup();

    render(<CollectionBody notes={[noteEntry({ id: 'n1', title: 'Alpha' })]} viewMode="table" itemMenu={resolverFor([])} />);
    rightClick(document.querySelector('.collection-table-row')!);
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('offers no menu (and leaves the native one alone) when the collection passes no itemMenu', () => {
    render(<CollectionBody notes={[noteEntry({ title: 'Alpha' })]} viewMode="list" />);

    const event = rightClick(rowOf('Alpha'));

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Collection View right-click menu — the target keeps its hover appearance', () => {
  const marked = () => Array.from(document.querySelectorAll("[data-context-menu-open='true']"));

  it('marks only the right-clicked item while the menu is open, without touching selection', () => {
    render(
      <CollectionBody
        notes={[noteEntry({ id: 'a', title: 'Alpha', selected: true }), noteEntry({ id: 'b', title: 'Beta' })]}
        viewMode="list"
        itemMenu={resolverFor([])}
      />
    );

    rightClick(rowOf('Beta'));

    expect(marked()).toEqual([rowOf('Beta')]);
    expect(rowOf('Beta')).not.toHaveClass('collection-entry--selected');
  });

  it('keeps the mark while the pointer is over the menu', () => {
    render(<CollectionBody notes={[noteEntry({ title: 'Alpha' })]} viewMode="list" itemMenu={resolverFor([])} />);
    rightClick(rowOf('Alpha'));

    fireEvent.mouseLeave(rowOf('Alpha'));
    fireEvent.mouseEnter(screen.getByRole('menu'));
    fireEvent.mouseMove(screen.getByText('Duplicate'));

    expect(marked()).toEqual([rowOf('Alpha')]);
  });

  it('clears the mark on Escape, an outside click, and after an action', () => {
    render(<CollectionBody notes={[noteEntry({ title: 'Alpha' })]} viewMode="list" itemMenu={resolverFor([])} />);

    rightClick(rowOf('Alpha'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(marked()).toEqual([]);

    rightClick(rowOf('Alpha'));
    fireEvent.click(document.querySelector('.overlay__backdrop')!);
    expect(marked()).toEqual([]);

    rightClick(rowOf('Alpha'));
    fireEvent.click(screen.getByText('Duplicate'));
    expect(marked()).toEqual([]);
  });

  it('transfers the mark when another item is right-clicked while the menu is open', () => {
    const acted: string[] = [];
    render(
      <CollectionBody
        notes={[noteEntry({ id: 'a', title: 'Alpha' }), noteEntry({ id: 'b', title: 'Beta' })]}
        viewMode="list"
        itemMenu={resolverFor(acted)}
      />
    );
    rightClick(rowOf('Alpha'));

    // The backdrop covers the page, so the second right-click lands on it; the entry beneath is found by point.
    const beta = rowOf('Beta');
    document.elementsFromPoint = () => [document.querySelector('.overlay__backdrop')!, beta];
    rightClick(document.querySelector('.overlay__backdrop')!, { clientX: 10, clientY: 10 });

    expect(marked()).toEqual([beta]);
    fireEvent.click(screen.getByText('Duplicate'));
    expect(acted).toEqual(['duplicate:b']);
  });

  it('a right-click on empty space under the backdrop just closes the menu', () => {
    render(<CollectionBody notes={[noteEntry({ title: 'Alpha' })]} viewMode="list" itemMenu={resolverFor([])} />);
    rightClick(rowOf('Alpha'));

    document.elementsFromPoint = () => [document.querySelector('.overlay__backdrop')!];
    const event = rightClick(document.querySelector('.overlay__backdrop')!);

    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(marked()).toEqual([]);
  });
});

describe('the hover appearance is the item\'s own :hover rule, not a second one', () => {
  it.each([
    ['features/collection/components/card/CollectionCard.css', '.collection-card'],
    ['features/collection/components/table/CollectionTableRow.css', '.collection-table-row'],
    ['features/collection/components/entry/CollectionEntry.css', '.collection-entry--layout-list'],
  ])('%s shares :hover with the menu-open marker', async (file, selector) => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(__dirname, '..', '..', '..', '..', file), 'utf8');
    expect(css).toContain(`${selector}:is(:hover, [data-context-menu-open='true'])`);
  });
});

describe('the context menu is the topbar menu for the same resource', () => {
  const fakeSelector = {
    isSystemFolder: () => false,
    isEntityEffectivelyArchived: () => false,
    isRestorable: () => false,
    isInTemplatesFolder: () => false,
  };
  const options = (kind: 'note' | 'folder') => ({
    membershipSelector: fakeSelector as never,
    vaultRoot: '/vault',
    onArchive: vi.fn(),
    onToggleFavorite: vi.fn(),
    onDuplicate: kind === 'note' ? vi.fn() : undefined,
    moveDestinations: [],
    onMove: vi.fn(),
  });
  const note = { id: 'n', type: 'note', path: 'a.md', parentId: null, metadata: { favorite: false } } as never;
  const folder = { id: 'f', path: 'f', parentId: null, metadata: { favorite: true } } as never;

  const asSummary = (menu: readonly { id: string; label: string; icon?: string; separatorBefore?: boolean }[]) =>
    menu.map(({ id, label, icon, separatorBefore }) => ({ id, label, icon, separatorBefore }));

  it.each([
    ['note', note, { status: 'active' as const, isFavorite: false }],
    ['folder', folder, { status: 'active' as const, isFavorite: true }],
  ] as const)('%s: same labels, icons, order and dividers as the topbar surface (less its page-only items)', (kind, resource, context) => {
    const contextMenu = buildResourceContextMenu(resource, options(kind))!;
    const topbar = buildResourceActionMenu(kind, context, 'topbar').filter((item) => item.id !== 'toggle-references');

    expect(asSummary(contextMenu.menu)).toEqual(asSummary(topbar));
  });

  it('binds the same handlers the topbar does, and drops only Hide/Show references', () => {
    const opts = options('note');
    const menu = buildResourceContextMenu(note, opts)!;

    menu.handlers!['archive']!();
    expect(opts.onArchive).toHaveBeenCalledOnce();
    expect(menu.menu.map((item) => item.id)).not.toContain('toggle-references');
    expect(buildResourceActionMenu('note', { status: 'active' }, 'topbar').map((i) => i.id)).toContain('toggle-references');
  });

  it('a reserved folder has no menu', () => {
    const reserved = buildResourceContextMenu(folder, {
      ...options('folder'),
      membershipSelector: { ...fakeSelector, isSystemFolder: () => true } as never,
    });
    expect(reserved).toBeNull();
  });

  it('an archived item keeps the archived-state restrictions (no Move / Favorite, Delete available)', () => {
    const archivedSelector = { ...fakeSelector, isEntityEffectivelyArchived: () => true, isRestorable: () => true };
    const menu = buildResourceContextMenu(note, { ...options('note'), membershipSelector: archivedSelector as never })!;
    const ids = menu.menu.map((item) => item.id);

    expect(ids).toEqual(expect.arrayContaining(['restore', 'delete']));
    expect(ids).not.toContain('move-to');
    expect(ids).not.toContain('toggle-favorite');
  });
});

describe('positioning near the window edge', () => {
  it('opens the menu inside the viewport when the click is at the bottom-right corner', () => {
    render(<CollectionBody notes={[noteEntry({ title: 'Alpha' })]} viewMode="list" itemMenu={resolverFor([])} />);
    const rect = (r: Partial<DOMRect>) => ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {}, ...r }) as DOMRect;
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('overlay__surface')
          ? rect({ width: 200, height: 300, right: 200, bottom: 300 })
          : rect({ left: window.innerWidth - 2, top: window.innerHeight - 2, right: window.innerWidth - 2, bottom: window.innerHeight - 2 });
      });

    rightClick(rowOf('Alpha'), { clientX: window.innerWidth - 2, clientY: window.innerHeight - 2 });

    const surface = document.querySelector<HTMLElement>('.overlay__surface')!;
    expect(parseFloat(surface.style.left) + 200).toBeLessThanOrEqual(window.innerWidth);
    expect(parseFloat(surface.style.top) + 300).toBeLessThanOrEqual(window.innerHeight);
    spy.mockRestore();
  });
});

export type { CollectionEntryModel };
