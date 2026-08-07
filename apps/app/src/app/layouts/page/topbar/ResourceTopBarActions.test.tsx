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

function openMenu() {
  const buttons = screen.getAllByRole('button');
  fireEvent.click(buttons[2]!);
}

function openDeleteConfirmation() {
  render(<ResourceTopBarActions menu={menuWithDelete} />);
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

  it('selecting Delete closes the menu and opens a confirmation popover', () => {
    render(<ResourceTopBarActions menu={menuWithDelete} />);
    openMenu();

    expect(screen.getByText('Delete')).toBeDefined();
    fireEvent.click(screen.getByText('Delete'));

    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByText('Delete this item?')).toBeDefined();
  });

  it('Cancel closes the confirmation popover', () => {
    render(<ResourceTopBarActions menu={menuWithDelete} />);
    openMenu();
    fireEvent.click(screen.getByText('Delete'));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByText('Delete this item?')).toBeNull();
  });

  it('Confirm logs and closes the confirmation popover', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    render(<ResourceTopBarActions menu={menuWithDelete} />);
    openMenu();
    fireEvent.click(screen.getByText('Delete'));

    const confirmButtons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    expect(logSpy).toHaveBeenCalledWith('Delete confirmed');
    expect(screen.queryByText('Delete this item?')).toBeNull();
    logSpy.mockRestore();
  });

  it('does not open confirmation for Delete when the item is disabled', () => {
    const disabledDeleteMenu: TopBarMenuItemConfig[] = [
      { id: 'delete', label: 'Delete', icon: 'trash', disabled: true },
    ];
    render(<ResourceTopBarActions menu={disabledDeleteMenu} />);
    openMenu();

    fireEvent.click(screen.getByText('Delete'));

    expect(screen.queryByText('Delete this item?')).toBeNull();
  });

  it('focuses Cancel when the confirmation popover opens', () => {
    openDeleteConfirmation();

    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Cancel' })
    );
  });

  it('Escape closes the confirmation popover', () => {
    openDeleteConfirmation();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('Delete this item?')).toBeNull();
  });

  it('outside click closes the confirmation popover', () => {
    openDeleteConfirmation();

    const backdrop = document.querySelector('.overlay__backdrop');
    if (!backdrop) {
      throw new Error('expected a backdrop element for outside-click handling');
    }
    fireEvent.click(backdrop);

    expect(screen.queryByText('Delete this item?')).toBeNull();
  });
});
