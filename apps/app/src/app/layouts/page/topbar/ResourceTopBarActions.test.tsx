// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { ResourceTopBarActions } from './ResourceTopBarActions';
import type { TopBarMenuItemConfig } from './ResourceTopBarActions';

// Overlay's positioning logic observes anchor/surface size via
// ResizeObserver, which jsdom doesn't implement — stubbed the same way
// Overlay's own test suite already does.
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

afterEach(() => {
  cleanup();
});

const menu: TopBarMenuItemConfig[] = [
  { id: 'archive', label: 'Archive', icon: 'archive' },
  { id: 'add-a-description', label: 'Add a description', icon: 'description' },
];

const menuWithDelete: TopBarMenuItemConfig[] = [
  ...menu,
  { id: 'delete', label: 'Delete', icon: 'trash' },
];

const DELETE_MESSAGE = 'Delete this folder and everything inside it?';
const ARCHIVE_MESSAGE = 'Archive this folder and everything inside it?';

function openMenu() {
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[2]!);
}

function openDeleteConfirmation(onDelete?: () => void) {
  render(
    <ResourceTopBarActions
      menu={menuWithDelete}
      handlers={{ delete: onDelete }}
      deleteConfirmationMessage={DELETE_MESSAGE}
    />
  );
  openMenu();
  fireEvent.click(screen.getByText('Delete'));
}

describe('ResourceTopBarActions', () => {
  it('renders every configured menu item', () => {
    render(<ResourceTopBarActions menu={menu} />);
    openMenu();

    expect(screen.getByText('Archive')).toBeDefined();
    expect(screen.getByText('Add a description')).toBeDefined();
  });

  it('calls the handler matching the clicked item id', () => {
    const onArchive = vi.fn();
    render(<ResourceTopBarActions menu={menu} handlers={{ archive: onArchive }} />);
    openMenu();

    fireEvent.click(screen.getByText('Archive'));

    expect(onArchive).toHaveBeenCalledTimes(1);
  });

  it('does nothing but close the menu for an item with no matching handler', () => {
    const onArchive = vi.fn();
    render(<ResourceTopBarActions menu={menu} handlers={{ archive: onArchive }} />);
    openMenu();

    fireEvent.click(screen.getByText('Add a description'));

    expect(onArchive).not.toHaveBeenCalled();
  });

  it('renders with no handlers at all without throwing', () => {
    render(<ResourceTopBarActions menu={menu} />);
    openMenu();

    expect(() => fireEvent.click(screen.getByText('Archive'))).not.toThrow();
  });

  it('renders a disabled item but never invokes its handler on click', () => {
    const onArchive = vi.fn();
    const disabledMenu: TopBarMenuItemConfig[] = [
      { id: 'archive', label: 'Archive', icon: 'archive', disabled: true },
    ];
    render(<ResourceTopBarActions menu={disabledMenu} handlers={{ archive: onArchive }} />);
    openMenu();

    expect(screen.getByText('Archive')).toBeDefined();
    fireEvent.click(screen.getByText('Archive'));

    expect(onArchive).not.toHaveBeenCalled();
  });

  // ADR-024's resolved product decision #1: Page.delete() is
  // confirmation-free — no deleteConfirmationMessage means 'delete' (and
  // 'archive') fire directly, exactly like every other menu item. This is
  // the note case, and the empty-folder case.
  describe('delete/archive with no confirmation message (notes; an empty folder)', () => {
    it('delete fires directly with no confirmation dialog when deleteConfirmationMessage is absent', () => {
      const onDelete = vi.fn();
      render(<ResourceTopBarActions menu={menuWithDelete} handlers={{ delete: onDelete }} />);
      openMenu();

      fireEvent.click(screen.getByText('Delete'));

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('archive fires directly with no confirmation dialog when archiveConfirmationMessage is absent', () => {
      const onArchive = vi.fn();
      render(<ResourceTopBarActions menu={menu} handlers={{ archive: onArchive }} />);
      openMenu();

      fireEvent.click(screen.getByText('Archive'));

      expect(onArchive).toHaveBeenCalledTimes(1);
    });
  });

  // The non-empty-folder case: both delete and archive are gated behind
  // the same Confirmation/Dialog surface, with the same
  // request→confirm/cancel shape.
  describe('delete with a confirmation message (a non-empty folder)', () => {
    it('selecting Delete closes the menu and opens a confirmation dialog instead of firing immediately', () => {
      const onDelete = vi.fn();
      render(
        <ResourceTopBarActions
          menu={menuWithDelete}
          handlers={{ delete: onDelete }}
          deleteConfirmationMessage={DELETE_MESSAGE}
        />
      );
      openMenu();

      expect(screen.getByText('Delete')).toBeDefined();
      fireEvent.click(screen.getByText('Delete'));

      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.getByText('Delete this folder?')).toBeDefined();
      expect(screen.getByText(DELETE_MESSAGE)).toBeDefined();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('Cancel closes the confirmation dialog without invoking delete', () => {
      const onDelete = vi.fn();
      openDeleteConfirmation(onDelete);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText('Delete this folder?')).toBeNull();
      expect(onDelete).not.toHaveBeenCalled();
    });

    it('Confirm invokes the real delete handler and closes the dialog (fixes the previous stub)', () => {
      const onDelete = vi.fn();
      openDeleteConfirmation(onDelete);

      const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
      fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

      expect(onDelete).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Delete this folder?')).toBeNull();
    });

    it('does not open confirmation for Delete when the item is disabled', () => {
      const disabledDeleteMenu: TopBarMenuItemConfig[] = [
        { id: 'delete', label: 'Delete', icon: 'trash', disabled: true },
      ];
      render(
        <ResourceTopBarActions
          menu={disabledDeleteMenu}
          deleteConfirmationMessage={DELETE_MESSAGE}
        />
      );
      openMenu();

      fireEvent.click(screen.getByText('Delete'));

      expect(screen.queryByText('Delete this folder?')).toBeNull();
    });

    it('focuses Cancel when the confirmation dialog opens', () => {
      openDeleteConfirmation();

      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    });

    it('Escape closes the confirmation dialog', () => {
      openDeleteConfirmation();

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(screen.queryByText('Delete this folder?')).toBeNull();
    });

    it('outside click closes the confirmation dialog', () => {
      openDeleteConfirmation();

      const backdrop = document.querySelector('.overlay__backdrop');
      if (!backdrop) {
        throw new Error('expected a backdrop element for outside-click handling');
      }
      fireEvent.click(backdrop);

      expect(screen.queryByText('Delete this folder?')).toBeNull();
    });
  });

  describe('archive with a confirmation message (a non-empty folder)', () => {
    it('selecting Archive opens a confirmation dialog instead of firing immediately, and Confirm invokes it', () => {
      const onArchive = vi.fn();
      render(
        <ResourceTopBarActions
          menu={menu}
          handlers={{ archive: onArchive }}
          archiveConfirmationMessage={ARCHIVE_MESSAGE}
        />
      );
      openMenu();
      fireEvent.click(screen.getByText('Archive'));

      expect(onArchive).not.toHaveBeenCalled();
      expect(screen.getByText('Archive this folder?')).toBeDefined();
      expect(screen.getByText(ARCHIVE_MESSAGE)).toBeDefined();

      const confirmButtons = screen.getAllByRole('button', { name: 'Archive' });
      fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

      expect(onArchive).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('Archive this folder?')).toBeNull();
    });

    it('Cancel closes the confirmation dialog without invoking archive', () => {
      const onArchive = vi.fn();
      render(
        <ResourceTopBarActions
          menu={menu}
          handlers={{ archive: onArchive }}
          archiveConfirmationMessage={ARCHIVE_MESSAGE}
        />
      );
      openMenu();
      fireEvent.click(screen.getByText('Archive'));

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onArchive).not.toHaveBeenCalled();
      expect(screen.queryByText('Archive this folder?')).toBeNull();
    });
  });

  // Delete and archive each get their own pending confirmation
  // independently — selecting one, cancelling, then selecting the other
  // must show the right copy, not stale state from the first.
  it('switching from a cancelled Delete confirmation to Archive shows the correct copy', () => {
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    render(
      <ResourceTopBarActions
        menu={menuWithDelete}
        handlers={{ archive: onArchive, delete: onDelete }}
        archiveConfirmationMessage={ARCHIVE_MESSAGE}
        deleteConfirmationMessage={DELETE_MESSAGE}
      />
    );
    openMenu();
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    openMenu();
    fireEvent.click(screen.getByText('Archive'));

    expect(screen.getByText('Archive this folder?')).toBeDefined();
    expect(screen.queryByText('Delete this folder?')).toBeNull();
  });

  describe('favorite toggle', () => {
    it('renders "Add to Favorites" and calls onToggleFavorite when isFavorite is false', () => {
      const onToggleFavorite = vi.fn();
      render(
        <ResourceTopBarActions
          menu={menu}
          isFavorite={false}
          onToggleFavorite={onToggleFavorite}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Add to Favorites' }));

      expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    });

    it('renders "Remove from Favorites" and calls onToggleFavorite when isFavorite is true', () => {
      const onToggleFavorite = vi.fn();
      render(
        <ResourceTopBarActions
          menu={menu}
          isFavorite={true}
          onToggleFavorite={onToggleFavorite}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Remove from Favorites' }));

      expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    });

    it('the favorite button is unwired (no crash on click) when onToggleFavorite is absent — same as every other unwired item', () => {
      render(<ResourceTopBarActions menu={menu} />);

      expect(() =>
        fireEvent.click(screen.getByRole('button', { name: 'Add to Favorites' }))
      ).not.toThrow();
    });

    it('selecting the overflow menu\'s toggle-favorite item calls the same onToggleFavorite handler', () => {
      const onToggleFavorite = vi.fn();
      const menuWithFavorite: TopBarMenuItemConfig[] = [
        ...menu,
        { id: 'toggle-favorite', label: 'Add to Favorites', icon: 'favouriteOutline' },
      ];
      render(
        <ResourceTopBarActions
          menu={menuWithFavorite}
          handlers={{ 'toggle-favorite': onToggleFavorite }}
        />
      );
      openMenu();

      fireEvent.click(screen.getByText('Add to Favorites'));

      expect(onToggleFavorite).toHaveBeenCalledTimes(1);
    });
  });

  describe('move-to', () => {
    const menuWithMove: TopBarMenuItemConfig[] = [
      ...menu,
      { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight' },
    ];

    it('selecting Move to… opens the destination picker instead of invoking a handler', () => {
      const onMove = vi.fn();
      render(
        <ResourceTopBarActions
          menu={menuWithMove}
          moveDestinations={[{ id: 'folder-1', title: 'Projects', level: 0, parentId: null }]}
          onMove={onMove}
        />
      );
      openMenu();

      fireEvent.click(screen.getByText('Move to…'));

      expect(screen.queryByRole('menu')).toBeNull();
      expect(screen.getByText('Projects')).toBeDefined();
      expect(onMove).not.toHaveBeenCalled();
    });

    it('selecting a destination folder invokes onMove with its id and closes the picker', () => {
      const onMove = vi.fn();
      render(
        <ResourceTopBarActions
          menu={menuWithMove}
          moveDestinations={[{ id: 'folder-1', title: 'Projects', level: 0, parentId: null }]}
          onMove={onMove}
        />
      );
      openMenu();
      fireEvent.click(screen.getByText('Move to…'));

      fireEvent.click(screen.getByText('Projects'));

      expect(onMove).toHaveBeenCalledWith('folder-1');
      expect(screen.queryByText('Projects')).toBeNull();
    });

    it('renders no root affordance of any kind — only real folders', () => {
      const onMove = vi.fn();
      render(
        <ResourceTopBarActions
          menu={menuWithMove}
          moveDestinations={[{ id: 'folder-1', title: 'Projects', level: 0, parentId: null }]}
          onMove={onMove}
        />
      );
      openMenu();
      fireEvent.click(screen.getByText('Move to…'));

      expect(screen.queryByText('Vault root')).toBeNull();
      expect(screen.queryByText('Move to vault root')).toBeNull();
      expect(screen.queryByText('Root')).toBeNull();
      expect(screen.getByText('Projects')).toBeDefined();
    });

    it('renders no picker at all when moveDestinations is absent — falls through to a plain handler', () => {
      const onMoveHandler = vi.fn();
      render(
        <ResourceTopBarActions menu={menuWithMove} handlers={{ 'move-to': onMoveHandler }} />
      );
      openMenu();

      fireEvent.click(screen.getByText('Move to…'));

      expect(onMoveHandler).toHaveBeenCalledTimes(1);
    });

    it('does not open the picker for a disabled Move to… item', () => {
      const disabledMoveMenu: TopBarMenuItemConfig[] = [
        { id: 'move-to', label: 'Move to…', icon: 'arrowDownRight', disabled: true },
      ];
      render(
        <ResourceTopBarActions
          menu={disabledMoveMenu}
          moveDestinations={[{ id: 'folder-1', title: 'Projects', level: 0, parentId: null }]}
        />
      );
      openMenu();

      fireEvent.click(screen.getByText('Move to…'));

      expect(screen.queryByText('Projects')).toBeNull();
    });
  });
});
